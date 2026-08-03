(function () {
  renderHeader({ homeHref: "../../index.html" });

  // ---------------------------------------------------------------------
  // Shared field constants
  // ---------------------------------------------------------------------
  var W = 480;
  var MEDAL_R = 24; // the jams were actually the upper pusher's unreachable rest position and the
  // uncapped upper->lower cascade (both fixed below), not coin size - so it's safe to size back up
  var PUSHER_PERIOD = 2200;
  var FALL_SPEED = 520;
  var COLLISION_ITERATIONS = 8;
  var FALL_ANIM_SEC = 0.3;
  var MEDAL_RESTITUTION = 0.15;
  // Real pusher-machine coins pile up overlapping each other rather than
  // sitting edge-to-edge like solid circles. Collision resolution only kicks
  // in once coins overlap past this fraction of their combined radius, so a
  // dense pile visually stacks instead of spreading out flat.
  var MEDAL_OVERLAP = 0.62;
  var SIDE_EXIT_SPEED = 300;

  // Upper tier: where every player-paid coin drop lands first. No side hazard here -
  // it only exists to make the player's coin pile visibly build up before cascading
  // down, like the top shelf of a real two-tier pusher machine.
  var upperCfg = {
    wallX: 70,
    topY: 26,
    floorY: 78,
    edgeY: 235,
    pusherMinY: 46,
    pusherStroke: 64,
    pusherThickness: 11,
    hasSideHazard: false,
    cap: Infinity,
    lastFrontY: null,
  };

  // Lower tier: the actual win line. Walled all the way down now - coins
  // never spill off the sides, only score by reaching edgeY.
  var lowerCfg = {
    wallX: 24,
    topY: 275,
    floorY: 405,
    edgeY: 795,
    sideOpenY: 495,
    pusherMinY: 325,
    pusherStroke: 160,
    pusherThickness: 26,
    hasSideHazard: false,
    cap: Infinity,
    lastFrontY: null,
    // Only the bottom board piles coins up overlapping each other; the
    // upper tier keeps solid, non-overlapping circles.
    medalOverlap: MEDAL_OVERLAP,
  };

  var H = 875;

  var BONUS_PAYOUT = 6;
  var BONUS_BALL_COUNT = 3;
  var GOLD_CHANCE = 0.06;
  var RED_CHANCE = 0.4;
  var SKULL_CHANCE = 0.1;
  var SKULL_ALLY_DAMAGE = 30;
  var BALL_MULT = { pink: 1, gold: 5 };
  var RED_CHARGE_TARGET = 3; // drop this many red balls to trigger the power roulette

  // Power roulette segments for the red-ball charge payoff: a flat attack
  // power dealt straight to the boss's HP, not a percentage.
  var POWER_SEGMENTS = [
    { label: "ハズレ", power: 0, weight: 18, color: "#2c3a63" },
    { label: "10", power: 10, weight: 18, color: "#6ea8ff" },
    { label: "20", power: 20, weight: 16, color: "#57e389" },
    { label: "ハズレ", power: 0, weight: 14, color: "#2c3a63" },
    { label: "35", power: 35, weight: 12, color: "#c17dff" },
    { label: "20", power: 20, weight: 14, color: "#57e389" },
    { label: "60", power: 60, weight: 7, color: "#ffcf4d" },
    { label: "75", power: 75, weight: 4, color: "#ff5d6c" },
    { label: "10", power: 10, weight: 12, color: "#6ea8ff" },
    { label: "会心100", power: 100, weight: 1, color: "#d99b1f", crit: true },
  ];

  var canvas = document.getElementById("field");
  var ctx = canvas.getContext("2d");

  var upperMedals = [];
  var medals = []; // lower tier
  var nextId = 1;
  var sessionWon = 0;
  var aimX = W / 2; // where the drop buttons (and the aim marker) target

  var fieldCountEl = document.getElementById("field-count");
  var sessionWonEl = document.getElementById("session-won");
  var noteEl = document.getElementById("field-note");
  var drop1Btn = document.getElementById("drop1-btn");
  var drop5Btn = document.getElementById("drop5-btn");
  var autoDropBtn = document.getElementById("auto-drop-btn");
  var chargeDots = document.querySelectorAll("#charge-dots .charge-dot");
  var goldCountEl = document.getElementById("gold-count");
  var powerWheelWrapEl = document.getElementById("power-wheel-wrap");
  var powerWheelEl = document.getElementById("power-wheel");
  var powerWheelResultEl = document.getElementById("power-wheel-result");
  var powerOddsEl = document.getElementById("power-odds");

  var redCharge = 0;
  var goldBallCount = 0;

  function updateChargeUI() {
    chargeDots.forEach(function (dot, i) {
      dot.classList.toggle("filled", i < redCharge);
    });
  }

  function addRedCharge() {
    redCharge += 1;
    if (redCharge >= RED_CHARGE_TARGET) {
      redCharge = 0;
      updateChargeUI();
      enqueueRoulette();
    } else {
      updateChargeUI();
    }
  }

  function addGoldCount() {
    goldBallCount += 1;
    goldCountEl.textContent = goldBallCount + "回";
  }

  function updateFieldControls() {
    var balance = MedalBank.getBalance();
    var full = upperMedals.length >= upperCfg.cap;
    var disabled = balance <= 0 || full;
    drop1Btn.disabled = disabled;
    drop5Btn.disabled = disabled;
    if (balance <= 0 && autoDropOn) stopAutoDrop();
  }

  function pusherBackY(cfg, t) {
    return cfg.pusherMinY + (cfg.pusherStroke / 2) * (1 - Math.cos((2 * Math.PI * t) / PUSHER_PERIOD));
  }

  function makeMedal(x, y, opts) {
    opts = opts || {};
    return {
      id: nextId++,
      x: x,
      y: y,
      r: MEDAL_R,
      settled: !!opts.settled,
      fallingOff: false,
      fallT: 0,
      lost: false,
      exitSide: 0,
      bonus: !!opts.bonus,
      color: opts.color || null,
    };
  }

  function randomXFor(cfg) {
    return cfg.wallX + MEDAL_R + Math.random() * (W - 2 * (cfg.wallX + MEDAL_R));
  }

  function pickBallColor() {
    var r = Math.random();
    if (r < GOLD_CHANCE) return "gold";
    if (r < GOLD_CHANCE + RED_CHANCE) return "red";
    if (r < GOLD_CHANCE + RED_CHANCE + SKULL_CHANCE) return "skull";
    return "pink";
  }

  function countActiveBonusBalls() {
    var n = 0;
    for (var i = 0; i < medals.length; i++) {
      if (medals[i].bonus && !medals[i].fallingOff) n++;
    }
    return n;
  }

  // The lower tier always has exactly BONUS_BALL_COUNT bonus balls in play.
  // Whenever one drops off (scored or lost) it is immediately replenished.
  function maintainBonusBalls() {
    while (countActiveBonusBalls() < BONUS_BALL_COUNT && medals.length < lowerCfg.cap) {
      var bx = randomXFor(lowerCfg);
      medals.push(
        makeMedal(bx, lowerCfg.topY + MEDAL_R + Math.random() * 6, {
          settled: false,
          bonus: true,
          color: pickBallColor(),
        })
      );
    }
  }

  function spawnMedal(x) {
    if (upperMedals.length >= upperCfg.cap) {
      noteEl.textContent = "場がいっぱいです。落ちるまで少し待ってから投入してください。";
      return false;
    }
    if (!MedalBank.spend(1, "メダル落としバトル:投入")) {
      noteEl.textContent = "メダルが足りません。";
      return false;
    }
    noteEl.textContent = "";
    var r = MEDAL_R;
    if (typeof x !== "number") {
      x = randomXFor(upperCfg);
    } else {
      x = Math.max(upperCfg.wallX + r, Math.min(W - upperCfg.wallX - r, x));
    }
    var y = upperCfg.topY + r + Math.random() * 6;
    upperMedals.push(makeMedal(x, y, { settled: false }));
    return true;
  }

  var SEED_COUNT_PER_TIER = 20;
  // The lower board now allows coins to overlap (see MEDAL_OVERLAP), so it can
  // start with a much denser pile without looking sparse or unrealistic.
  var SEED_COUNT_LOWER = 50;

  // The table is never empty when a player first arrives: seed both tiers with a
  // pile already sitting on them so the first visit shows action immediately.
  function seedField() {
    var i;
    for (i = 0; i < SEED_COUNT_PER_TIER; i++) {
      var uy = upperCfg.floorY + Math.random() * (upperCfg.edgeY - upperCfg.floorY - 20);
      upperMedals.push(makeMedal(randomXFor(upperCfg), uy, { settled: true }));
    }
    for (i = 0; i < SEED_COUNT_LOWER; i++) {
      var y = lowerCfg.floorY + Math.random() * (lowerCfg.edgeY - 60 - lowerCfg.floorY);
      medals.push(makeMedal(randomXFor(lowerCfg), y, { settled: true }));
    }
    for (i = 0; i < BONUS_BALL_COUNT; i++) {
      var bx = randomXFor(lowerCfg);
      var by = lowerCfg.floorY + Math.random() * 30;
      medals.push(makeMedal(bx, by, { settled: true, bonus: true, color: pickBallColor() }));
    }
  }

  drop1Btn.addEventListener("click", function () {
    spawnMedal(aimX);
  });

  drop5Btn.addEventListener("click", function () {
    for (var i = 0; i < 5; i++) {
      // Small spread around the aim point so all 5 don't stack in an
      // identical column, while still landing where the player chose.
      if (!spawnMedal(aimX + (Math.random() - 0.5) * 24)) break;
    }
  });

  var AUTO_DROP_INTERVAL_MS = 350;
  var autoDropOn = false;
  var autoDropTimer = null;

  function startAutoDrop() {
    if (autoDropTimer) return;
    autoDropTimer = setInterval(function () {
      if (MedalBank.getBalance() <= 0) {
        stopAutoDrop();
        return;
      }
      spawnMedal(aimX + (Math.random() - 0.5) * 24);
    }, AUTO_DROP_INTERVAL_MS);
  }

  function stopAutoDrop() {
    if (autoDropTimer) {
      clearInterval(autoDropTimer);
      autoDropTimer = null;
    }
    autoDropOn = false;
    autoDropBtn.textContent = "🔁 オート投入: OFF";
    autoDropBtn.classList.remove("active");
  }

  autoDropBtn.addEventListener("click", function () {
    autoDropOn = !autoDropOn;
    if (autoDropOn) {
      autoDropBtn.textContent = "⏸ オート投入: ON";
      autoDropBtn.classList.add("active");
      startAutoDrop();
    } else {
      stopAutoDrop();
    }
  });

  function canvasXFromEvent(e) {
    var rect = canvas.getBoundingClientRect();
    return ((e.clientX - rect.left) / rect.width) * W;
  }

  canvas.addEventListener("pointerdown", function (e) {
    e.preventDefault();
    aimX = canvasXFromEvent(e);
    spawnMedal(aimX);
  });

  // Hover (mouse) lets the player preview the drop point before committing.
  canvas.addEventListener("pointermove", function (e) {
    if (e.pointerType === "mouse" && e.buttons === 0) {
      aimX = canvasXFromEvent(e);
    }
  });

  MedalBank.subscribe(function () {
    updateFieldControls();
  });

  seedField();
  updateFieldControls();

  // ---------------------------------------------------------------------
  // Physics
  // ---------------------------------------------------------------------
  function resolveCollisions(list, overlap) {
    var overlapFactor = overlap == null ? 1 : overlap;
    for (var iter = 0; iter < COLLISION_ITERATIONS; iter++) {
      for (var i = 0; i < list.length; i++) {
        var a = list[i];
        if (a.fallingOff) continue;
        for (var j = i + 1; j < list.length; j++) {
          var b = list[j];
          if (b.fallingOff) continue;
          var dx = b.x - a.x;
          var dy = b.y - a.y;
          var dist = Math.sqrt(dx * dx + dy * dy);
          var minDist = (a.r + b.r) * overlapFactor;
          if (dist < minDist) {
            if (dist < 0.0001) {
              dx = Math.random() - 0.5;
              dy = Math.random() - 0.5;
              dist = 0.01;
            }
            var overlap = ((minDist - dist) / 2) * (1 + MEDAL_RESTITUTION);
            var nx = dx / dist;
            var ny = dy / dist;
            a.x -= nx * overlap;
            a.y -= ny * overlap;
            b.x += nx * overlap;
            b.y += ny * overlap;
          }
        }
      }
    }
  }

  function stepTier(cfg, list, dt, t) {
    var backY = pusherBackY(cfg, t);
    var frontY = backY + cfg.pusherThickness;
    var pushDelta = cfg.lastFrontY === null ? 0 : frontY - cfg.lastFrontY;
    cfg.lastFrontY = frontY;

    list.forEach(function (m) {
      if (m.fallingOff) {
        m.fallT += dt / FALL_ANIM_SEC;
        if (m.exitSide) m.x += m.exitSide * SIDE_EXIT_SPEED * dt;
        return;
      }
      if (!m.settled) {
        m.y += FALL_SPEED * dt;
        if (m.y >= cfg.floorY) {
          m.y = cfg.floorY;
          m.settled = true;
        }
      }
      if (pushDelta > 0 && m.y > backY - m.r && m.y < frontY + m.r) {
        m.y += pushDelta;
      }
    });

    resolveCollisions(list, cfg.medalOverlap);

    list.forEach(function (m) {
      if (m.fallingOff) return;
      var minY = cfg.topY + m.r;
      if (m.y < minY) m.y = minY;

      if (cfg.hasSideHazard) {
        if (m.y < cfg.sideOpenY) {
          var minX = cfg.wallX + m.r;
          var maxX = W - cfg.wallX - m.r;
          if (m.x < minX) m.x = minX;
          if (m.x > maxX) m.x = maxX;
        } else if (m.x < m.r || m.x > W - m.r) {
          m.fallingOff = true;
          m.lost = true;
          m.exitSide = m.x < m.r ? -1 : 1;
          return;
        }
      } else {
        var minX2 = cfg.wallX + m.r;
        var maxX2 = W - cfg.wallX - m.r;
        if (m.x < minX2) m.x = minX2;
        if (m.x > maxX2) m.x = maxX2;
      }

      if (m.y - m.r > cfg.edgeY) {
        m.fallingOff = true;
      }
    });
  }

  function update(dt, t) {
    stepTier(upperCfg, upperMedals, dt, t);
    stepTier(lowerCfg, medals, dt, t);

    // Upper tier coins that reach the front edge cascade down onto the lower
    // tier at the equivalent horizontal position, instead of scoring directly.
    // If the lower tier has no room, hold the coin right at the edge instead of
    // dumping it in anyway - otherwise the lower tier's cap is meaningless and
    // it can grow without bound, jamming the whole table.
    var upperRemain = [];
    upperMedals.forEach(function (m) {
      if (m.fallingOff && m.fallT >= 1) {
        if (medals.length >= lowerCfg.cap) {
          m.fallingOff = false;
          m.fallT = 0;
          m.y = upperCfg.edgeY - m.r;
          upperRemain.push(m);
          return;
        }
        var rel = (m.x - upperCfg.wallX) / (W - 2 * upperCfg.wallX);
        var newX = lowerCfg.wallX + rel * (W - 2 * lowerCfg.wallX);
        medals.push(makeMedal(newX, lowerCfg.topY + MEDAL_R + Math.random() * 6, { settled: false }));
      } else {
        upperRemain.push(m);
      }
    });
    upperMedals = upperRemain;

    var remaining = [];
    medals.forEach(function (m) {
      if (m.fallingOff && m.fallT >= 1) {
        if (!m.lost) {
          sessionWon += 1;
          if (m.bonus) {
            MedalBank.add(BONUS_PAYOUT, "メダル落としバトル:ボーナス球獲得");
            // Bonus balls are always kept in play (BONUS_BALL_COUNT) and fall
            // constantly, so only the rare gold color earns a ticket - giving
            // one for every color made tickets essentially free.
            if (m.color === "red") {
              noteEl.textContent =
                "⚡ 赤いボール獲得！ " + BONUS_PAYOUT + " 枚！ チャージ " + Math.min(redCharge + 1, RED_CHARGE_TARGET) + "/" + RED_CHARGE_TARGET;
              addRedCharge();
            } else if (m.color === "skull") {
              noteEl.textContent = "💀 どくろ玉！ " + BONUS_PAYOUT + " 枚獲得…だが相棒に" + SKULL_ALLY_DAMAGE + "ダメージ！";
              applyAllySkullDamage();
            } else if (m.color === "gold") {
              JPTickets.add(1);
              noteEl.textContent = "👑 金のボーナス球獲得！ " + BONUS_PAYOUT + " 枚！ 威力ルーレット開始！ 🎫JP券+1";
              addGoldCount();
              enqueueRoulette();
            } else {
              noteEl.textContent = "🌸 ボーナス球獲得！ " + BONUS_PAYOUT + " 枚！";
              enqueueBonusAttack(m.color);
            }
          } else {
            MedalBank.add(1, "メダル落としバトル:獲得");
            applyCoinChipDamage();
          }
        }
      } else {
        remaining.push(m);
      }
    });
    medals = remaining;

    maintainBonusBalls();

    fieldCountEl.textContent = upperMedals.length + medals.length;
    sessionWonEl.textContent = sessionWon;
    updateFieldControls();
  }

  // ---------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------
  function drawCoin(ctx, m, k) {
    ctx.save();
    ctx.globalAlpha = k;
    ctx.translate(m.x, m.y);
    ctx.scale(k, k);

    ctx.beginPath();
    ctx.ellipse(1.5, 2.5, m.r * 0.92, m.r * 0.78, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fill();

    var rim = ctx.createRadialGradient(-m.r * 0.3, -m.r * 0.3, m.r * 0.2, 0, 0, m.r);
    rim.addColorStop(0, "#fff6d8");
    rim.addColorStop(0.55, "#f0c352");
    rim.addColorStop(0.8, "#c8922a");
    rim.addColorStop(1, "#8a5f13");
    ctx.beginPath();
    ctx.arc(0, 0, m.r, 0, Math.PI * 2);
    ctx.fillStyle = rim;
    ctx.fill();

    // Milled edge ticks around the rim.
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, m.r, 0, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = "rgba(120,80,10,0.5)";
    ctx.lineWidth = m.r * 0.09;
    var ticks = 18;
    for (var i = 0; i < ticks; i++) {
      var ang = (i / ticks) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(ang) * m.r, Math.sin(ang) * m.r);
      ctx.lineTo(Math.cos(ang) * m.r * 0.86, Math.sin(ang) * m.r * 0.86);
      ctx.stroke();
    }
    ctx.restore();

    var face = ctx.createRadialGradient(-m.r * 0.25, -m.r * 0.25, 1, 0, 0, m.r * 0.82);
    face.addColorStop(0, "#fff3c4");
    face.addColorStop(0.55, "#ffcf4d");
    face.addColorStop(1, "#c98f16");
    ctx.beginPath();
    ctx.arc(0, 0, m.r * 0.8, 0, Math.PI * 2);
    ctx.fillStyle = face;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(138,95,15,0.6)";
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, m.r * 0.55, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(138,95,15,0.45)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(-m.r * 0.32, -m.r * 0.38, m.r * 0.28, m.r * 0.16, -0.5, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fill();

    ctx.restore();
  }

  function drawBonusBall(ctx, m, k) {
    ctx.save();
    ctx.globalAlpha = k;
    ctx.translate(m.x, m.y);
    ctx.scale(k, k);

    ctx.beginPath();
    ctx.ellipse(2, 3, m.r * 0.95, m.r * 0.8, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fill();

    var g = ctx.createRadialGradient(-m.r * 0.35, -m.r * 0.4, 1, 0, 0, m.r);
    if (m.color === "gold") {
      g.addColorStop(0, "#fffbe0");
      g.addColorStop(0.35, "#ffe27a");
      g.addColorStop(0.7, "#e8a827");
      g.addColorStop(1, "#8a5f0f");
    } else if (m.color === "red") {
      g.addColorStop(0, "#fff0ee");
      g.addColorStop(0.35, "#ff8a70");
      g.addColorStop(0.7, "#e8341f");
      g.addColorStop(1, "#6b0f08");
    } else if (m.color === "skull") {
      g.addColorStop(0, "#e8e6f0");
      g.addColorStop(0.35, "#8f88a8");
      g.addColorStop(0.7, "#3f3752");
      g.addColorStop(1, "#171225");
    } else {
      g.addColorStop(0, "#fff0f6");
      g.addColorStop(0.35, "#ff9ecb");
      g.addColorStop(0.7, "#ff5f9e");
      g.addColorStop(1, "#8f1450");
    }
    ctx.beginPath();
    ctx.arc(0, 0, m.r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle =
      m.color === "gold" ? "#6b4708" : m.color === "red" ? "#5c0a04" : m.color === "skull" ? "#0d0a16" : "#6b0f39";
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(-m.r * 0.3, -m.r * 0.35, m.r * 0.32, m.r * 0.18, -0.6, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fill();

    ctx.fillStyle = m.color === "gold" ? "#5c3d05" : "#fff";
    ctx.font = "bold " + Math.round(m.r * 1.05) + "px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    var icon = m.color === "gold" ? "👑" : m.color === "red" ? "⚡" : m.color === "skull" ? "💀" : "★";
    ctx.fillText(icon, 0, 1);

    ctx.restore();
  }

  function renderTierBackdrop(cfg, isUpper) {
    ctx.fillStyle = "#0a1020";
    ctx.fillRect(0, cfg.topY - 40, W, 40);
    ctx.fillRect(0, cfg.topY - 40, cfg.wallX, (cfg.hasSideHazard ? cfg.sideOpenY : cfg.edgeY) - (cfg.topY - 40));
    ctx.fillRect(
      W - cfg.wallX,
      cfg.topY - 40,
      cfg.wallX,
      (cfg.hasSideHazard ? cfg.sideOpenY : cfg.edgeY) - (cfg.topY - 40)
    );

    if (cfg.hasSideHazard) {
      var hazard = ctx.createLinearGradient(0, cfg.sideOpenY, 0, cfg.edgeY);
      hazard.addColorStop(0, "rgba(255,90,90,0.32)");
      hazard.addColorStop(1, "rgba(255,90,90,0.04)");
      ctx.fillStyle = hazard;
      ctx.fillRect(0, cfg.sideOpenY, 9, cfg.edgeY - cfg.sideOpenY);
      ctx.fillRect(W - 9, cfg.sideOpenY, 9, cfg.edgeY - cfg.sideOpenY);

      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(cfg.wallX, cfg.sideOpenY);
      ctx.lineTo(W - cfg.wallX, cfg.sideOpenY);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function renderPusher(cfg, t) {
    var backY = pusherBackY(cfg, t);
    var frontY = backY + cfg.pusherThickness;
    var pg = ctx.createLinearGradient(0, backY, 0, frontY);
    pg.addColorStop(0, "#e8edff");
    pg.addColorStop(1, "#8f9bcf");
    ctx.fillStyle = pg;
    ctx.fillRect(cfg.wallX, backY, W - 2 * cfg.wallX, cfg.pusherThickness);
  }

  function renderMedals(list) {
    // Draw back-to-front by Y so overlapping coins stack with the nearer
    // (lower) one visibly on top, instead of insertion order cutting through
    // the pile at random.
    var sorted = list.slice().sort(function (a, b) {
      return a.y - b.y;
    });
    sorted.forEach(function (m) {
      var k = m.fallingOff ? Math.max(0, 1 - m.fallT) : 1;
      if (k <= 0) return;
      if (m.bonus) {
        drawBonusBall(ctx, m, k);
      } else {
        drawCoin(ctx, m, k);
      }
    });
  }

  function render(t) {
    ctx.clearRect(0, 0, W, H);

    var bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, "#12335c");
    bgGrad.addColorStop(1, "#0a1830");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    var spot = ctx.createRadialGradient(W / 2, lowerCfg.edgeY - 60, 30, W / 2, lowerCfg.edgeY - 60, 440);
    spot.addColorStop(0, "rgba(255,232,180,0.18)");
    spot.addColorStop(1, "rgba(255,232,180,0)");
    ctx.fillStyle = spot;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, lowerCfg.edgeY, W, H - lowerCfg.edgeY);

    ctx.strokeStyle = "#ffcf4d";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, lowerCfg.edgeY);
    ctx.lineTo(W, lowerCfg.edgeY);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,207,77,0.75)";
    ctx.font = "12px sans-serif";
    ctx.fillText("WIN LINE", 8, lowerCfg.edgeY + 16);

    renderTierBackdrop(upperCfg, true);
    renderTierBackdrop(lowerCfg, false);

    // Divider gap between tiers, marking where coins spill from upper to lower.
    ctx.fillStyle = "rgba(255,207,77,0.12)";
    ctx.fillRect(0, upperCfg.edgeY, W, lowerCfg.topY - upperCfg.edgeY);
    ctx.fillStyle = "rgba(255,207,77,0.55)";
    ctx.font = "11px sans-serif";
    ctx.fillText("↓ 下段へ", 8, (upperCfg.edgeY + lowerCfg.topY) / 2 + 4);

    renderPusher(upperCfg, t);
    renderPusher(lowerCfg, t);

    renderMedals(upperMedals);
    renderMedals(medals);

    renderAimMarker();
  }

  // Shows the player exactly where the next coin (from a tap or either
  // drop button) will land, so they can aim deliberately instead of
  // dropping blind.
  function renderAimMarker() {
    var x = Math.max(upperCfg.wallX + MEDAL_R, Math.min(W - upperCfg.wallX - MEDAL_R, aimX));
    var tipY = upperCfg.topY - 4;

    ctx.save();
    ctx.strokeStyle = "rgba(255,207,77,0.45)";
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, tipY + 10);
    ctx.lineTo(x, upperCfg.floorY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#ffcf4d";
    ctx.beginPath();
    ctx.moveTo(x - 7, tipY - 12);
    ctx.lineTo(x + 7, tipY - 12);
    ctx.lineTo(x, tipY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ---------------------------------------------------------------------
  // Boss battle
  // ---------------------------------------------------------------------
  var SYMBOLS = [
    { key: "cherry", icon: "🍒", mult: 1 },
    { key: "lemon", icon: "🍋", mult: 1.5 },
    { key: "bell", icon: "🔔", mult: 2.2 },
    { key: "star", icon: "⭐", mult: 3.5 },
    { key: "seven", icon: "7️⃣", mult: 8 },
  ];
  var BASE_DAMAGE_MIN = 4;
  var BASE_DAMAGE_MAX = 9;

  // ---------------------------------------------------------------------
  // Boss roster - 110 UMA (cryptid) species across 5 star ranks, built from
  // a base pool of 30 creatures crossed with per-star flavor modifiers so
  // weaker tiers read "small/young" and stronger tiers read "ancient/golden"
  // without hand-authoring every single entry.
  // ---------------------------------------------------------------------
  var UMA_BASE = [
    { key: "nessie", name: "ネッシー", icon: "🐉" },
    { key: "bigfoot", name: "ビッグフット", icon: "🦍" },
    { key: "yeti", name: "イエティ", icon: "⛄" },
    { key: "mothman", name: "モスマン", icon: "🦋" },
    { key: "chupacabra", name: "チュパカブラ", icon: "🐐" },
    { key: "jackalope", name: "ジャッカロープ", icon: "🐇" },
    { key: "kraken", name: "クラーケン", icon: "🐙" },
    { key: "thunderbird", name: "サンダーバード", icon: "🦅" },
    { key: "mokele", name: "モケーレムベンベ", icon: "🦕" },
    { key: "orangpendek", name: "オランペンデック", icon: "🦧" },
    { key: "wendigo", name: "ウェンディゴ", icon: "🦌" },
    { key: "skunkape", name: "スカンクエイプ", icon: "🐒" },
    { key: "flatwoods", name: "フラットウッズ星人", icon: "🛸" },
    { key: "tsuchinoko", name: "つちのこ", icon: "🐛" },
    { key: "kappa", name: "かっぱ", icon: "🐸" },
    { key: "amabie", name: "アマビエ", icon: "🧜" },
    { key: "nurikabe", name: "ぬりかべ", icon: "🧱" },
    { key: "zashiki", name: "ざしきわらし", icon: "🧒" },
    { key: "yukionna", name: "ゆきおんな", icon: "❄️" },
    { key: "tengu", name: "てんぐ", icon: "👺" },
    { key: "kitsunebi", name: "きつね火", icon: "🦊" },
    { key: "rokurokubi", name: "ろくろ首", icon: "💫" },
    { key: "hitotsume", name: "ひとつめこぞう", icon: "👁️" },
    { key: "uminohebi", name: "うみへび", icon: "🐍" },
    { key: "giantsquid", name: "ジャイアントスクイッド", icon: "🦑" },
    { key: "bunyip", name: "バニップ", icon: "🦫" },
    { key: "deathworm", name: "モンゴリアンデスワーム", icon: "🪱" },
    { key: "doverdemon", name: "ドーバーデーモン", icon: "👽" },
    { key: "featherserpent", name: "フェザーサーペント", icon: "🐲" },
    { key: "kesaran", name: "けさらんぱさらん", icon: "☁️" },
  ];

  var STAR_MODIFIERS = {
    1: ["ちび", "ミニ", "プチ", "こども", ""],
    2: ["わかき", "はぐれ", "野生の", "ふつうの", ""],
    3: ["謎の", "変異", "夜行性の", "深淵の", ""],
    4: ["伝説の", "巨大", "凶暴な", "漆黒の", ""],
    5: ["神話の", "古代の", "黄金の", "真祖", "究極の"],
  };

  var STAR_SPECIES_COUNT = { 1: 40, 2: 30, 3: 15, 4: 10, 5: 5 };

  function buildBossSpecies() {
    var roster = { 1: [], 2: [], 3: [], 4: [], 5: [] };
    [1, 2, 3, 4, 5].forEach(function (star) {
      var need = STAR_SPECIES_COUNT[star];
      var mods = STAR_MODIFIERS[star];
      var usedNames = {};
      var i = 0;
      var m = 0;
      var guard = 0;
      while (roster[star].length < need && guard < 5000) {
        guard++;
        var base = UMA_BASE[i % UMA_BASE.length];
        var mod = mods[m % mods.length];
        var name = mod ? mod + base.name : base.name;
        if (!usedNames[name]) {
          usedNames[name] = true;
          roster[star].push({ id: "s" + star + "-" + base.key + "-" + m, name: name, icon: base.icon });
        }
        i++;
        if (i % UMA_BASE.length === 0) m++;
      }
    });
    return roster;
  }

  var BOSS_SPECIES = buildBossSpecies();

  // A single secret star-6 UMA, unlocked only once every other species has
  // been caught. From then on it has a 10% chance of replacing the normal
  // draw entirely.
  BOSS_SPECIES[6] = [{ id: "s6-akashic", name: "深淵王リヴァイアサン", icon: "🐋" }];
  var SECRET_STAR = 6;
  var SECRET_CHANCE = 0.1;

  var STAR_WEIGHTS = [
    { star: 5, weight: 1 },
    { star: 4, weight: 4 },
    { star: 3, weight: 10 },
    { star: 2, weight: 35 },
    { star: 1, weight: 50 },
  ];
  var STAR_BASE_HP = { 1: 80, 2: 160, 3: 300, 4: 550, 5: 1000, 6: 3000 };
  // Manual "bring the dex to the boss" capture attempt - stronger stars are
  // harder to hold onto.
  var STAR_CAPTURE_CHANCE = { 1: 0.9, 2: 0.7, 3: 0.6, 4: 0.4, 5: 0.3 };
  var STARTER_ID = BOSS_SPECIES[1][0].id;
  var DEX_KEY = "medalCasino.creatureDex";
  var ALLY_KEY = "medalCasino.activeAlly";

  var stageNameEl = document.getElementById("boss-stage");
  var bossStarsEl = document.getElementById("boss-stars");
  var bossNameEl = document.getElementById("boss-name");
  var bossSpriteEl = document.getElementById("boss-sprite");
  var damagePopEl = document.getElementById("damage-pop");
  var hpBarEl = document.getElementById("hp-bar");
  var hpTextEl = document.getElementById("hp-text");
  var reelsEl = document.getElementById("attack-reels");
  var reelCells = reelsEl.querySelectorAll(".reel-cell");
  var hintEl = document.getElementById("battle-hint");
  var logEl = document.getElementById("battle-log");
  var rewardPreviewEl = document.getElementById("reward-preview");
  var allyRowEl = document.getElementById("ally-row");
  var allyEmptyEl = document.getElementById("ally-empty");
  var allyWarningEl = document.getElementById("ally-warning");
  var allyIconEl = document.getElementById("ally-icon");
  var allyNameEl = document.getElementById("ally-name");
  var allyStarEl = document.getElementById("ally-star");
  var allyHpBarEl = document.getElementById("ally-hp-bar");
  var allyHpTextEl = document.getElementById("ally-hp-text");
  var dexOpenBtn = document.getElementById("dex-open");
  var dexOpenEmptyBtn = document.getElementById("dex-open-empty");
  var dexCloseBtn = document.getElementById("dex-close");
  var dexOverlayEl = document.getElementById("dex-overlay");
  var dexGridEl = document.getElementById("dex-grid");
  var captureOverlayEl = document.getElementById("capture-overlay");
  var captureBoxEl = document.getElementById("capture-box");
  var captureSparkleLayerEl = document.getElementById("capture-sparkle-layer");
  var captureSpriteEl = document.getElementById("capture-sprite");
  var captureNameEl = document.getElementById("capture-name");
  var captureStarsEl = document.getElementById("capture-stars");
  var captureBtn = document.getElementById("capture-btn");
  var captureSkipBtn = document.getElementById("capture-skip-btn");
  var captureNextBtn = document.getElementById("capture-next-btn");
  var captureResultEl = document.getElementById("capture-result");

  var menuOpenBtn = document.getElementById("menu-open-btn");
  var menuOverlayEl = document.getElementById("menu-overlay");
  var menuCloseBtn = document.getElementById("menu-close");
  var menuViewMainEl = document.getElementById("menu-view-main");
  var menuViewItemsEl = document.getElementById("menu-view-items");
  var menuViewHealEl = document.getElementById("menu-view-heal");
  var menuItemsBtn = document.getElementById("menu-items-btn");
  var menuCoinBtn = document.getElementById("menu-coin-btn");
  var itemsBackBtn = document.getElementById("items-back-btn");
  var healBackBtn = document.getElementById("heal-back-btn");
  var potionCountEl = document.getElementById("potion-count");
  var potionUseBtn = document.getElementById("potion-use-btn");
  var healTargetGridEl = document.getElementById("heal-target-grid");
  var menuViewCoinEl = document.getElementById("menu-view-coin");
  var coinBackBtn = document.getElementById("coin-back-btn");
  var coinAdScreenEl = document.getElementById("coin-ad-screen");
  var coinAdStatusEl = document.getElementById("coin-ad-status");
  var coinAdProgressWrapEl = document.getElementById("coin-ad-progress-wrap");
  var coinAdProgressEl = document.getElementById("coin-ad-progress");
  var coinAdWatchBtn = document.getElementById("coin-ad-watch-btn");

  var stage = 1;
  var boss = null;
  var busy = false;
  var bonusQueue = [];

  function loadDex() {
    var arr = [];
    try {
      var raw = localStorage.getItem(DEX_KEY);
      arr = raw ? JSON.parse(raw) : [];
    } catch (e) {
      arr = [];
    }
    // Drop ids from a previous roster generation that no longer exist (the
    // species list is rebuilt from scratch on load) so the dex never shows
    // permanently-broken ghost entries.
    arr = arr.filter(function (id) {
      return !!findSpeciesById(id);
    });
    if (arr.indexOf(STARTER_ID) === -1) arr.push(STARTER_ID);
    return arr;
  }

  var ownedIds = loadDex();
  localStorage.setItem(DEX_KEY, JSON.stringify(ownedIds));

  function isOwned(id) {
    return ownedIds.indexOf(id) !== -1;
  }

  function findSpeciesById(id) {
    for (var star = 1; star <= 6; star++) {
      var pool = BOSS_SPECIES[star];
      if (!pool) continue;
      for (var i = 0; i < pool.length; i++) {
        if (pool[i].id === id) return { species: pool[i], star: star };
      }
    }
    return null;
  }

  function speciesMaxHp(id) {
    var found = findSpeciesById(id);
    return found ? STAR_BASE_HP[found.star] || 80 : 80;
  }

  // Each caught creature keeps its own HP across ally switches, persisted so
  // a fainted one is still fainted next time you open the page - only a
  // potion (or a fresh capture) restores it.
  var CREATURE_HP_KEY = "medalCasino.creatureHp";

  function loadCreatureHpMap() {
    try {
      var raw = localStorage.getItem(CREATURE_HP_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  var creatureHpMap = loadCreatureHpMap();

  function saveCreatureHpMap() {
    localStorage.setItem(CREATURE_HP_KEY, JSON.stringify(creatureHpMap));
  }

  function ensureCreatureHp(id) {
    if (creatureHpMap[id] == null) {
      creatureHpMap[id] = speciesMaxHp(id);
      saveCreatureHpMap();
    }
    return creatureHpMap[id];
  }

  function healCreature(id) {
    creatureHpMap[id] = speciesMaxHp(id);
    saveCreatureHpMap();
  }

  // ---------------------------------------------------------------------
  // Items: 回復薬 (recovery potion), a 50% boss-defeat drop that fully heals
  // one owned creature - the only way to bring a fainted ally back.
  // ---------------------------------------------------------------------
  var POTION_KEY = "medalCasino.potionCount";
  var POTION_DROP_CHANCE = 0.5;
  var STARTER_POTIONS = 2;

  function loadPotionCount() {
    var n = parseInt(localStorage.getItem(POTION_KEY), 10);
    return Number.isFinite(n) ? n : STARTER_POTIONS;
  }

  var potionCount = loadPotionCount();

  function savePotionCount() {
    localStorage.setItem(POTION_KEY, String(potionCount));
  }

  function addPotion(n) {
    potionCount += n;
    savePotionCount();
  }

  function showMenuView(view) {
    menuViewMainEl.style.display = view === "main" ? "" : "none";
    menuViewItemsEl.style.display = view === "items" ? "" : "none";
    menuViewHealEl.style.display = view === "heal" ? "" : "none";
    menuViewCoinEl.style.display = view === "coin" ? "" : "none";
  }

  // ---------------------------------------------------------------------
  // "コイン" menu tab: watch a (simulated) 30-second video for 30 medals.
  // The timer keeps running via setInterval even if the menu is closed
  // mid-watch, so switching tabs doesn't lose progress.
  // ---------------------------------------------------------------------
  var COIN_AD_SECONDS = 30;
  var COIN_AD_REWARD = 30;
  var coinAdRunning = false;
  var coinAdTimer = null;
  var coinAdRemaining = 0;

  function resetCoinAdView() {
    coinAdWatchBtn.style.display = "";
    coinAdWatchBtn.disabled = false;
    coinAdWatchBtn.textContent = "▶ 動画を見る";
    coinAdProgressWrapEl.classList.remove("show");
    coinAdProgressEl.style.width = "0%";
    coinAdStatusEl.textContent = "動画を見て" + COIN_AD_REWARD + "枚のメダルを獲得しよう。";
    coinAdScreenEl.classList.remove("playing");
  }

  function updateCoinAdStatus() {
    coinAdStatusEl.textContent = "再生中… 残り" + coinAdRemaining + "秒";
    var pct = ((COIN_AD_SECONDS - coinAdRemaining) / COIN_AD_SECONDS) * 100;
    coinAdProgressEl.style.width = pct + "%";
  }

  function startCoinAd() {
    if (coinAdRunning) return;
    coinAdRunning = true;
    coinAdRemaining = COIN_AD_SECONDS;
    coinAdWatchBtn.style.display = "none";
    coinAdProgressWrapEl.classList.add("show");
    coinAdScreenEl.classList.add("playing");
    updateCoinAdStatus();

    coinAdTimer = setInterval(function () {
      coinAdRemaining -= 1;
      if (coinAdRemaining <= 0) {
        clearInterval(coinAdTimer);
        coinAdTimer = null;
        coinAdRunning = false;
        coinAdScreenEl.classList.remove("playing");
        coinAdProgressWrapEl.classList.remove("show");
        MedalBank.add(COIN_AD_REWARD, "メダル落としバトル:動画リワード");
        coinAdStatusEl.textContent = "🎉 " + COIN_AD_REWARD + "枚獲得！";
        coinAdWatchBtn.style.display = "";
        coinAdWatchBtn.textContent = "▶ もう一度見る";
      } else {
        updateCoinAdStatus();
      }
    }, 1000);
  }

  coinAdWatchBtn.addEventListener("click", startCoinAd);
  coinBackBtn.addEventListener("click", function () {
    showMenuView("main");
  });

  function renderPotionCount() {
    potionCountEl.textContent = potionCount + "個";
    potionUseBtn.disabled = potionCount <= 0;
  }

  function renderHealTargets() {
    healTargetGridEl.innerHTML = "";
    ownedIds.forEach(function (id) {
      var found = findSpeciesById(id);
      if (!found) return;
      var hp = ensureCreatureHp(id);
      var max = speciesMaxHp(id);
      var full = hp >= max;
      var cell = document.createElement("button");
      cell.type = "button";
      cell.className = "heal-target-cell" + (full ? " full" : "");
      cell.innerHTML =
        '<span class="dex-icon">' +
        found.species.icon +
        '</span><span class="dex-name">' +
        found.species.name +
        '</span><span class="heal-target-hp">' +
        Math.round(hp) +
        " / " +
        max +
        "</span>";
      if (!full) {
        cell.addEventListener("click", function () {
          usePotionOn(id);
        });
      } else {
        cell.disabled = true;
      }
      healTargetGridEl.appendChild(cell);
    });
  }

  function usePotionOn(id) {
    if (potionCount <= 0) return;
    healCreature(id);
    potionCount -= 1;
    savePotionCount();
    var found = findSpeciesById(id);
    showToast("💊 " + (found ? found.species.name : "仲間") + " が全回復した！");
    renderAlly();
    renderDex();
    menuOverlayEl.classList.remove("active");
  }

  menuOpenBtn.addEventListener("click", function () {
    showMenuView("main");
    menuOverlayEl.classList.add("active");
  });
  menuCloseBtn.addEventListener("click", function () {
    menuOverlayEl.classList.remove("active");
  });
  menuItemsBtn.addEventListener("click", function () {
    renderPotionCount();
    showMenuView("items");
  });
  menuCoinBtn.addEventListener("click", function () {
    if (!coinAdRunning) resetCoinAdView();
    showMenuView("coin");
  });
  itemsBackBtn.addEventListener("click", function () {
    showMenuView("main");
  });
  healBackBtn.addEventListener("click", function () {
    showMenuView("items");
  });
  potionUseBtn.addEventListener("click", function () {
    if (potionCount <= 0) return;
    renderHealTargets();
    showMenuView("heal");
  });

  function addToDex(id) {
    if (isOwned(id)) return false;
    ownedIds.push(id);
    localStorage.setItem(DEX_KEY, JSON.stringify(ownedIds));
    ensureCreatureHp(id); // a freshly caught creature starts at full health
    renderDex();
    return true;
  }

  function loadAlly() {
    var id = localStorage.getItem(ALLY_KEY);
    if (id && isOwned(id) && findSpeciesById(id)) return id;
    return STARTER_ID;
  }

  var activeAllyId = loadAlly();
  ownedIds.forEach(ensureCreatureHp);

  function getAllyHp() {
    return creatureHpMap[activeAllyId] != null ? creatureHpMap[activeAllyId] : 0;
  }

  function getAllyMaxHp() {
    return speciesMaxHp(activeAllyId);
  }

  // No ally on the field means nobody to actually land the hit - every
  // damage source (reel attacks, the roulette, even the passive coin chip)
  // is gated behind this.
  function hasAlly() {
    return getAllyHp() > 0;
  }

  // While the ally is down, roulette bias falls back to the same baseline as
  // a star-1 ally (no bonus, but no penalty either).
  function getAllyStar() {
    if (getAllyHp() <= 0) return 0;
    var found = findSpeciesById(activeAllyId);
    return found ? found.star : 0;
  }

  // A fainted creature can't be re-equipped until healed with a potion - no
  // more free full-heal just by picking it again from the dex.
  function setActiveAlly(id) {
    if (!isOwned(id)) return;
    if (ensureCreatureHp(id) <= 0) return;
    activeAllyId = id;
    localStorage.setItem(ALLY_KEY, id);
    renderAlly();
    renderDex();
    renderPowerOdds();
  }

  function updateAllyHpBar() {
    var hp = getAllyHp();
    var max = getAllyMaxHp();
    var pct = max > 0 ? Math.max(0, (hp / max) * 100) : 0;
    allyHpBarEl.style.width = pct + "%";
    allyHpTextEl.textContent = Math.max(0, Math.round(hp)) + " / " + max;
  }

  function renderAlly() {
    var found = findSpeciesById(activeAllyId);
    if (!found || getAllyHp() <= 0) {
      allyRowEl.style.display = "none";
      allyEmptyEl.classList.add("show");
      allyWarningEl.classList.add("show");
      return;
    }
    allyRowEl.style.display = "";
    allyEmptyEl.classList.remove("show");
    allyWarningEl.classList.remove("show");
    allyIconEl.textContent = found.species.icon;
    allyNameEl.textContent = found.species.name;
    allyStarEl.textContent = "★".repeat(found.star);
    updateAllyHpBar();
  }

  allyWarningEl.addEventListener("click", function () {
    dexOverlayEl.classList.add("active");
  });

  // どくろ玉 landing on the win line: a trap that hurts the ally instead of
  // the boss. If it brings the ally down, the ally slot goes empty until the
  // player heals it (via a potion) or switches to a healthy one.
  function applyAllySkullDamage() {
    var hp = getAllyHp();
    if (hp <= 0) return;
    creatureHpMap[activeAllyId] = Math.max(0, hp - SKULL_ALLY_DAMAGE);
    saveCreatureHpMap();
    renderAlly();
  }

  function renderDex() {
    dexGridEl.innerHTML = "";
    var starList = isDexComplete() ? [6, 5, 4, 3, 2, 1] : [5, 4, 3, 2, 1];
    starList.forEach(function (star) {
      BOSS_SPECIES[star].forEach(function (sp) {
        var owned = isOwned(sp.id);
        var fainted = owned && ensureCreatureHp(sp.id) <= 0;
        var cell = document.createElement("button");
        cell.type = "button";
        cell.className =
          "dex-cell" + (owned ? " owned" : "") + (fainted ? " fainted" : "") + (sp.id === activeAllyId ? " active" : "");
        cell.innerHTML =
          '<span class="dex-icon">' +
          (owned ? sp.icon : "❓") +
          '</span><span class="dex-name">' +
          (owned ? sp.name : "？？？") +
          '</span><span class="dex-star">' +
          "★".repeat(star) +
          "</span>" +
          (fainted ? '<span class="dex-fainted-label">気絶中</span>' : "");
        if (owned && !fainted) {
          cell.addEventListener("click", function () {
            setActiveAlly(sp.id);
          });
        } else {
          cell.disabled = true;
        }
        dexGridEl.appendChild(cell);
      });
    });
  }

  dexOpenBtn.addEventListener("click", function () {
    dexOverlayEl.classList.add("active");
  });
  dexOpenEmptyBtn.addEventListener("click", function () {
    dexOverlayEl.classList.add("active");
  });
  dexCloseBtn.addEventListener("click", function () {
    dexOverlayEl.classList.remove("active");
  });


  function pickStar() {
    var total = STAR_WEIGHTS.reduce(function (sum, w) {
      return sum + w.weight;
    }, 0);
    var r = Math.random() * total;
    for (var i = 0; i < STAR_WEIGHTS.length; i++) {
      r -= STAR_WEIGHTS[i].weight;
      if (r <= 0) return STAR_WEIGHTS[i].star;
    }
    return 1;
  }

  // True once every star1-5 species (not the secret star6) has been caught.
  function isDexComplete() {
    var total = 0;
    for (var star = 1; star <= 5; star++) total += BOSS_SPECIES[star].length;
    var caught = ownedIds.filter(function (id) {
      var found = findSpeciesById(id);
      return found && found.star <= 5;
    }).length;
    return caught >= total;
  }

  function pickBoss() {
    if (isDexComplete() && Math.random() < SECRET_CHANCE) {
      var secret = BOSS_SPECIES[SECRET_STAR][0];
      var secretHp = Math.round(STAR_BASE_HP[SECRET_STAR] * (0.9 + Math.random() * 0.2));
      return { id: secret.id, name: secret.name, icon: secret.icon, star: SECRET_STAR, hp: secretHp, maxHp: secretHp };
    }
    var star = pickStar();
    var pool = BOSS_SPECIES[star];
    var species = pool[Math.floor(Math.random() * pool.length)];
    var hp = Math.round(STAR_BASE_HP[star] * (0.9 + Math.random() * 0.2));
    return { id: species.id, name: species.name, icon: species.icon, star: star, hp: hp, maxHp: hp };
  }

  // Capturing is a manual step: after a defeat, the player brings the dex to
  // the fallen ghost and chooses whether to try (flat 40%), rather than it
  // happening automatically.
  function spawnCaptureSparkles(kind) {
    captureSparkleLayerEl.innerHTML = "";
    var icons = kind === "fail" ? ["💨", "💨", "💨", "💭"] : ["✨", "⭐", "✨", "💫", "✨", "⭐"];
    icons.forEach(function (icon, i) {
      var el = document.createElement("span");
      el.className = "capture-sparkle";
      el.textContent = icon;
      var angle = (360 / icons.length) * i + (Math.random() - 0.5) * 20;
      var dist = 46 + Math.random() * 26;
      el.style.setProperty("--sx", (Math.cos((angle * Math.PI) / 180) * dist).toFixed(1) + "px");
      el.style.setProperty("--sy", (Math.sin((angle * Math.PI) / 180) * dist).toFixed(1) + "px");
      el.style.animationDelay = (i * 0.03).toFixed(2) + "s";
      captureSparkleLayerEl.appendChild(el);
    });
    setTimeout(function () {
      captureSparkleLayerEl.innerHTML = "";
    }, 900);
  }

  function openCaptureOverlay() {
    captureSpriteEl.textContent = boss.icon;
    captureNameEl.textContent = boss.name;
    captureStarsEl.textContent = "★".repeat(boss.star) + "☆".repeat(Math.max(0, 5 - boss.star));
    captureResultEl.textContent = "";
    captureResultEl.className = "capture-result";
    captureBoxEl.classList.remove("capture-success", "capture-fail");
    captureSpriteEl.classList.remove("capture-pop", "capture-flee");
    captureSparkleLayerEl.innerHTML = "";
    captureBtn.textContent = "📖 捕まえる（" + Math.round((STAR_CAPTURE_CHANCE[boss.star] || 0.4) * 100) + "%）";
    captureBtn.style.display = "";
    captureBtn.disabled = false;
    captureSkipBtn.style.display = "";
    captureNextBtn.style.display = "none";
    captureOverlayEl.classList.add("active");
  }

  function closeCaptureOverlay() {
    captureOverlayEl.classList.remove("active");
    stage += 1;
    boss = pickBoss();
    renderBoss();
    busy = false;
    hintEl.textContent = "新たな敵が現れた！";
  }

  captureBtn.addEventListener("click", function () {
    captureBtn.disabled = true;
    var caught = Math.random() < (STAR_CAPTURE_CHANCE[boss.star] || 0.4);
    if (caught) {
      var wasNew = addToDex(boss.id);
      captureResultEl.textContent = wasNew ? "🎉 " + boss.name + " を仲間にした！" : "🎉 " + boss.name + " と再会した（図鑑登録済み）";
      captureResultEl.className = "capture-result win";
      captureBoxEl.classList.add("capture-success");
      captureSpriteEl.classList.add("capture-pop");
      spawnCaptureSparkles("success");
    } else {
      captureResultEl.textContent = "😢 " + boss.name + " に逃げられた…";
      captureResultEl.className = "capture-result lose";
      captureBoxEl.classList.add("capture-fail");
      captureSpriteEl.classList.add("capture-flee");
      spawnCaptureSparkles("fail");
    }
    captureBtn.style.display = "none";
    captureSkipBtn.style.display = "none";
    captureNextBtn.style.display = "";
  });

  captureSkipBtn.addEventListener("click", closeCaptureOverlay);
  captureNextBtn.addEventListener("click", closeCaptureOverlay);

  function randSymbol() {
    return SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
  }

  function renderBoss() {
    stageNameEl.textContent = "ステージ " + stage;
    bossStarsEl.textContent = "★".repeat(boss.star) + "☆".repeat(Math.max(0, 5 - boss.star));
    bossNameEl.textContent = boss.name;
    bossSpriteEl.textContent = boss.icon;
    bossSpriteEl.classList.remove("defeated", "hit");
    bossSpriteEl.style.opacity = "";
    bossSpriteEl.style.transform = "";
    updateHpBar();
    rewardPreviewEl.textContent = Math.round(boss.maxHp * 0.7).toLocaleString();
  }

  function updateHpBar() {
    var pct = Math.max(0, (boss.hp / boss.maxHp) * 100);
    hpBarEl.style.width = pct + "%";
    hpTextEl.textContent = Math.max(0, Math.round(boss.hp)) + " / " + boss.maxHp;
  }

  var COIN_CHIP_DAMAGE = 0.1;

  // Every plain coin that scores chips a sliver of HP off the boss - silent
  // (no log spam, no damage-pop) since a busy table can land several coins a
  // second.
  function applyCoinChipDamage() {
    if (!boss || boss.hp <= 0 || !hasAlly()) return;
    boss.hp = Math.max(0, boss.hp - COIN_CHIP_DAMAGE);
    updateHpBar();
    if (boss.hp <= 0) {
      defeatBoss();
    }
  }

  function renderReels(picks) {
    picks.forEach(function (s, i) {
      reelCells[i].textContent = s.icon;
    });
  }

  function showDamage(dmg, special) {
    damagePopEl.textContent = "-" + dmg;
    damagePopEl.className = "damage-pop show" + (special ? " special" : "");
    void damagePopEl.offsetWidth;
    damagePopEl.classList.add("show");
    bossSpriteEl.classList.remove("hit");
    void bossSpriteEl.offsetWidth;
    bossSpriteEl.classList.add("hit");
  }

  function log(msg) {
    logEl.textContent = msg;
  }

  function performAttack(multiplier, sourceLabel) {
    if (!boss || boss.hp <= 0 || !hasAlly()) return false;

    var picks = [randSymbol(), randSymbol(), randSymbol()];
    renderReels(picks);

    var dmg = BASE_DAMAGE_MIN + Math.random() * (BASE_DAMAGE_MAX - BASE_DAMAGE_MIN);
    var isTriple = picks[0].key === picks[1].key && picks[1].key === picks[2].key;
    var special = false;
    if (isTriple) {
      if (picks[0].key === "seven") {
        special = true;
        dmg = boss.maxHp * (0.3 + Math.random() * 0.15);
      } else {
        dmg *= picks[0].mult;
      }
    }
    dmg *= multiplier;
    dmg = Math.max(1, Math.round(dmg));
    boss.hp = Math.max(0, boss.hp - dmg);
    showDamage(dmg, special || multiplier > 1);
    updateHpBar();

    var prefix = sourceLabel ? sourceLabel + " " : "";
    var body = special
      ? "🔥 必殺技炸裂！ " + dmg + " ダメージ！"
      : isTriple
      ? "✨ " + picks[0].icon + "揃い！ " + dmg + " ダメージ"
      : dmg + " ダメージ";
    log(prefix + body);

    if (boss.hp <= 0) {
      defeatBoss();
    }
    return true;
  }

  function defeatBoss() {
    busy = true;
    var reward = Math.round(boss.maxHp * 0.7);
    MedalBank.add(reward, "メダル落としバトル:撃破報酬");
    JPTickets.add(1);
    var gotPotion = Math.random() < POTION_DROP_CHANCE;
    if (gotPotion) addPotion(1);
    log(
      "🎉 " +
        boss.name +
        " を倒した！ " +
        reward.toLocaleString() +
        " 枚獲得！ 🎫JP券+1" +
        (gotPotion ? " 💊回復薬入手！" : "")
    );
    bossSpriteEl.classList.add("defeated");
    setTimeout(openCaptureOverlay, 1400);
  }

  var powerWheelRotation = 0;

  // A stronger active ally skews the wheel toward its bigger-payout segments,
  // and specifically toward the 会心 (crit) slot - the "ハズレ" slots are
  // untouched, so a low-star ally never gets safer, just less likely to roll
  // big or critical.
  function computePowerWeights() {
    var allyStar = Math.max(1, getAllyStar()); // no ally = same baseline as a star-1 ally
    var bias = (allyStar - 1) * 0.35;
    var critBonus = 1 + (allyStar - 1) * 1.5; // star1: x1 ... star5: x7 ... star6: x8.5
    var total = 0;
    var weights = POWER_SEGMENTS.map(function (s) {
      var w = s.weight;
      // The crit slot only scales via its own dedicated critBonus - it used
      // to also pick up the generic power-based bias on top, which made it
      // balloon far too fast for high-star allies.
      if (s.crit) {
        w = w * critBonus;
      } else if (s.power > 0) {
        w = w * (1 + bias * (s.power / 100));
      }
      total += w;
      return w;
    });
    return { weights: weights, total: total };
  }

  function pickPowerSegment() {
    var computed = computePowerWeights();
    var r = Math.random() * computed.total;
    for (var i = 0; i < computed.weights.length; i++) {
      r -= computed.weights[i];
      if (r <= 0) return i;
    }
    return POWER_SEGMENTS.length - 1;
  }

  // Aggregates the wheel's 10 slices by label (several share a label/power)
  // into a readable odds list, recomputed live against the active ally's
  // bias so the player can see exactly what their partner is buying them.
  function renderPowerOdds() {
    var computed = computePowerWeights();
    var byLabel = {};
    var order = [];
    POWER_SEGMENTS.forEach(function (s, i) {
      var pct = (computed.weights[i] / computed.total) * 100;
      if (!byLabel[s.label]) {
        byLabel[s.label] = { label: s.label, color: s.color, pct: 0 };
        order.push(s.label);
      }
      byLabel[s.label].pct += pct;
    });
    powerOddsEl.innerHTML = order
      .map(function (label) {
        var s = byLabel[label];
        return (
          '<li><span class="odds-swatch" style="background:' +
          s.color +
          '"></span><span class="odds-label">' +
          s.label +
          '</span><span class="odds-pct">' +
          s.pct.toFixed(1) +
          "%</span></li>"
        );
      })
      .join("");
  }

  function buildPowerWheel() {
    var n = POWER_SEGMENTS.length;
    var segAngle = 360 / n;
    var gradientParts = POWER_SEGMENTS.map(function (s, i) {
      var from = (i * segAngle).toFixed(2);
      var to = ((i + 1) * segAngle).toFixed(2);
      return s.color + " " + from + "deg " + to + "deg";
    });
    powerWheelEl.style.background = "conic-gradient(" + gradientParts.join(", ") + ")";
    POWER_SEGMENTS.forEach(function (s, i) {
      var label = document.createElement("div");
      label.className = "wheel-label";
      var mid = segAngle * i + segAngle / 2;
      label.style.transform = "rotate(" + mid + "deg)";
      label.textContent = s.label;
      powerWheelEl.appendChild(label);
    });
  }

  // Both a single gold ball and a full red-ball charge want to spin the
  // wheel. Queue them instead of calling triggerPowerRoulette() directly so
  // a burst landing while busy (mid-spin, mid-defeat, ...) doesn't stack
  // overlapping animations.
  var rouletteQueueCount = 0;

  function enqueueRoulette() {
    rouletteQueueCount += 1;
    drainRouletteQueue();
  }

  function drainRouletteQueue() {
    if (busy || rouletteQueueCount <= 0) return;
    rouletteQueueCount -= 1;
    triggerPowerRoulette();
  }
  setInterval(drainRouletteQueue, 400);

  // A dedicated wheel spin (distinct from the attack reels) that lands on a
  // flat attack power dealt straight to the boss's HP.
  function triggerPowerRoulette() {
    if (!hasAlly()) return;
    busy = true;
    powerWheelResultEl.textContent = "";
    powerWheelResultEl.className = "power-wheel-result";
    powerWheelWrapEl.classList.add("spinning");

    var n = POWER_SEGMENTS.length;
    var segAngle = 360 / n;
    var targetIndex = pickPowerSegment();
    var targetMid = segAngle * targetIndex + segAngle / 2;
    var fullSpins = 5 + Math.floor(Math.random() * 3);
    var delta = (360 - (targetMid % 360)) % 360;
    var base = powerWheelRotation - (powerWheelRotation % 360);
    var newRotation = base + fullSpins * 360 + delta;
    while (newRotation <= powerWheelRotation) newRotation += 360;
    powerWheelRotation = newRotation;

    powerWheelEl.style.transition = "transform 3.6s cubic-bezier(0.12, 0.65, 0.15, 1)";
    powerWheelEl.style.transform = "rotate(" + powerWheelRotation + "deg)";

    setTimeout(function () {
      var seg = POWER_SEGMENTS[targetIndex];
      var dmg = seg.power;

      if (dmg > 0) {
        boss.hp = Math.max(0, boss.hp - dmg);
        updateHpBar();
        showDamage(dmg, true);
        powerWheelResultEl.textContent = "💥 " + seg.label + "！ " + dmg.toLocaleString() + " ダメージ！";
        powerWheelResultEl.className = "power-wheel-result win";
        log("⚡ 威力ルーレット " + seg.label + "！ " + dmg.toLocaleString() + " ダメージ！");
      } else {
        powerWheelResultEl.textContent = "残念、ハズレ…";
        powerWheelResultEl.className = "power-wheel-result lose";
        log("⚡ 威力ルーレット……ハズレ");
      }

      var bossDown = boss.hp <= 0;
      if (bossDown) defeatBoss();

      powerWheelWrapEl.classList.remove("spinning");
      if (!bossDown) busy = false;
    }, 3800);
  }

  // Bonus balls are the only way to attack: dropping one queues a free attack
  // scaled by its color. Queued so that a burst of bonus balls landing close
  // together doesn't overlap reel animations or fire mid-defeat-animation.
  function enqueueBonusAttack(color) {
    bonusQueue.push(color);
    drainBonusQueue();
  }

  function drainBonusQueue() {
    if (busy || bonusQueue.length === 0) return;
    var color = bonusQueue.shift();
    var mult = BALL_MULT[color] || 1;
    var label = color === "gold" ? "👑 金のボーナス球の一撃！" : "🌸 ボーナス球の一撃！";
    hintEl.textContent = "";
    performAttack(mult, label);
    setTimeout(drainBonusQueue, 320);
  }
  setInterval(drainBonusQueue, 400);

  boss = pickBoss();
  renderBoss();
  buildPowerWheel();
  updateChargeUI();
  renderAlly();
  renderDex();
  renderPowerOdds();

  // ---------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------
  var lastTs = null;
  function frame(ts) {
    if (lastTs === null) lastTs = ts;
    var dt = Math.min((ts - lastTs) / 1000, 0.033);
    lastTs = ts;

    update(dt, ts);
    render(ts);

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();
