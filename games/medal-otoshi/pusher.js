(function () {
  renderHeader({ homeHref: "../../index.html" });

  var canvas = document.getElementById("field");
  var ctx = canvas.getContext("2d");
  var W = canvas.width;
  var H = canvas.height;

  var WALL_X = 24;
  var BACK_Y = 40;
  var BACK_FLOOR_Y = 170;
  var EDGE_Y = 560;
  var SIDE_OPEN_Y = 260; // beyond this depth the side walls open up: drift too far sideways and the medal spills off (lost)
  var MEDAL_R = 15;
  var PUSHER_THICKNESS = 26;
  var PUSHER_MIN_Y = 90;
  var PUSHER_STROKE = 160;
  var PUSHER_PERIOD = 2200;
  var FIELD_CAP = 90;
  var FALL_SPEED = 520;
  var COLLISION_ITERATIONS = 8;
  var FALL_ANIM_SEC = 0.3;
  var MEDAL_RESTITUTION = 0.15;
  var BONUS_PAYOUT = 100;
  var BONUS_INTERVAL_MS = 22000;
  var SIDE_EXIT_SPEED = 300;

  var medals = [];
  var nextId = 1;
  var sessionWon = 0;
  var lastFrontY = null;

  var fieldCountEl = document.getElementById("field-count");
  var sessionWonEl = document.getElementById("session-won");
  var noteEl = document.getElementById("field-note");
  var drop1Btn = document.getElementById("drop1-btn");
  var drop5Btn = document.getElementById("drop5-btn");

  function updateControls() {
    var balance = MedalBank.getBalance();
    var full = medals.length >= FIELD_CAP;
    var disabled = balance <= 0 || full;
    drop1Btn.disabled = disabled;
    drop5Btn.disabled = disabled;
  }

  function pusherBackY(t) {
    return PUSHER_MIN_Y + (PUSHER_STROKE / 2) * (1 - Math.cos((2 * Math.PI * t) / PUSHER_PERIOD));
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
    };
  }

  function randomX() {
    return WALL_X + MEDAL_R + Math.random() * (W - 2 * (WALL_X + MEDAL_R));
  }

  function spawnMedal(x) {
    if (medals.length >= FIELD_CAP) {
      noteEl.textContent = "場がいっぱいです。落ちるまで少し待ってから投入してください。";
      return false;
    }
    if (!MedalBank.spend(1, "メダル落とし:投入")) {
      noteEl.textContent = "メダルが足りません。";
      return false;
    }
    noteEl.textContent = "";
    var r = MEDAL_R;
    if (typeof x !== "number") {
      x = randomX();
    } else {
      x = Math.max(WALL_X + r, Math.min(W - WALL_X - r, x));
    }
    var y = BACK_Y + r + Math.random() * 6;
    medals.push(makeMedal(x, y, { settled: false }));
    return true;
  }

  // The table is never empty when a player first arrives: a real coin pusher
  // always has a pile already sitting on it. Seed some medals up front,
  // including a few already close to the win line, so the first visit shows
  // action immediately instead of a long, unrewarding wait.
  function seedField() {
    var i;
    for (i = 0; i < 26; i++) {
      var y = BACK_FLOOR_Y + Math.random() * (SIDE_OPEN_Y - BACK_FLOOR_Y - 20);
      medals.push(makeMedal(randomX(), y, { settled: true }));
    }
    for (i = 0; i < 3; i++) {
      var x2 = W / 2 + (Math.random() - 0.5) * 160;
      var y2 = EDGE_Y - 50 - Math.random() * 80;
      medals.push(makeMedal(x2, y2, { settled: true }));
    }
    var bx = randomX();
    var by = BACK_FLOOR_Y + Math.random() * 30;
    medals.push(makeMedal(bx, by, { settled: true, bonus: true }));
  }

  // A free bonus coin drifts onto the table on its own from time to time.
  // It costs the player nothing to appear, but pays out big if it is pushed
  // off the win line.
  function spawnFreeBonus() {
    if (medals.length < FIELD_CAP) {
      medals.push(makeMedal(randomX(), BACK_Y + MEDAL_R + Math.random() * 6, { settled: false, bonus: true }));
    }
    setTimeout(spawnFreeBonus, BONUS_INTERVAL_MS);
  }

  drop1Btn.addEventListener("click", function () {
    spawnMedal();
  });

  drop5Btn.addEventListener("click", function () {
    for (var i = 0; i < 5; i++) {
      if (!spawnMedal()) break;
    }
  });

  canvas.addEventListener("pointerdown", function (e) {
    e.preventDefault();
    var rect = canvas.getBoundingClientRect();
    var x = ((e.clientX - rect.left) / rect.width) * W;
    spawnMedal(x);
  });

  MedalBank.subscribe(function () {
    updateControls();
  });

  seedField();
  updateControls();
  setTimeout(spawnFreeBonus, 9000);

  function update(dt, t) {
    var backY = pusherBackY(t);
    var frontY = backY + PUSHER_THICKNESS;
    var pushDelta = lastFrontY === null ? 0 : frontY - lastFrontY;
    lastFrontY = frontY;

    medals.forEach(function (m) {
      if (m.fallingOff) {
        m.fallT += dt / FALL_ANIM_SEC;
        if (m.exitSide) m.x += m.exitSide * SIDE_EXIT_SPEED * dt;
        return;
      }
      if (!m.settled) {
        m.y += FALL_SPEED * dt;
        if (m.y >= BACK_FLOOR_Y) {
          m.y = BACK_FLOOR_Y;
          m.settled = true;
        }
      }
      // Carry any medal touching the pusher face forward by the same amount the
      // plate advances, instead of snapping it to a fixed line. This preserves
      // the depth separation collision resolution builds up, so a packed stack
      // keeps getting shoved (domino-style) past the plate's own reach.
      if (pushDelta > 0 && m.y > backY - m.r && m.y < frontY + m.r) {
        m.y += pushDelta;
      }
    });

    for (var iter = 0; iter < COLLISION_ITERATIONS; iter++) {
      for (var i = 0; i < medals.length; i++) {
        var a = medals[i];
        if (a.fallingOff) continue;
        for (var j = i + 1; j < medals.length; j++) {
          var b = medals[j];
          if (b.fallingOff) continue;
          var dx = b.x - a.x;
          var dy = b.y - a.y;
          var dist = Math.sqrt(dx * dx + dy * dy);
          var minDist = a.r + b.r;
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

    medals.forEach(function (m) {
      if (m.fallingOff) return;
      var minY = BACK_Y + m.r;
      if (m.y < minY) m.y = minY;

      if (m.y < SIDE_OPEN_Y) {
        // Walled corridor around the pusher: medals just get nudged back in.
        var minX = WALL_X + m.r;
        var maxX = W - WALL_X - m.r;
        if (m.x < minX) m.x = minX;
        if (m.x > maxX) m.x = maxX;
      } else if (m.x < m.r || m.x > W - m.r) {
        // Open table: no more side walls. Drift too far out here and the
        // medal spills off the edge and is lost instead of winning.
        m.fallingOff = true;
        m.lost = true;
        m.exitSide = m.x < m.r ? -1 : 1;
        return;
      }

      if (m.y - m.r > EDGE_Y) {
        m.fallingOff = true;
      }
    });

    var remaining = [];
    medals.forEach(function (m) {
      if (m.fallingOff && m.fallT >= 1) {
        if (!m.lost) {
          sessionWon += 1;
          if (m.bonus) {
            MedalBank.add(BONUS_PAYOUT, "メダル落とし:ボーナス獲得");
            JPTickets.add(1);
            noteEl.textContent = "🌟 ボーナスコイン獲得！ " + BONUS_PAYOUT + " 枚！ 🎫JP券+1";
          } else {
            MedalBank.add(1, "メダル落とし:獲得");
          }
        }
      } else {
        remaining.push(m);
      }
    });
    medals = remaining;

    fieldCountEl.textContent = medals.length;
    sessionWonEl.textContent = sessionWon;
    updateControls();
  }

  function render(t) {
    ctx.clearRect(0, 0, W, H);

    var bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, "#12335c");
    bgGrad.addColorStop(1, "#0a1830");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Soft spotlight glow toward the front of the table to sell the 3D tilt.
    var spot = ctx.createRadialGradient(W / 2, EDGE_Y - 60, 30, W / 2, EDGE_Y - 60, 440);
    spot.addColorStop(0, "rgba(255,232,180,0.18)");
    spot.addColorStop(1, "rgba(255,232,180,0)");
    ctx.fillStyle = spot;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, EDGE_Y, W, H - EDGE_Y);

    ctx.strokeStyle = "#ffcf4d";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, EDGE_Y);
    ctx.lineTo(W, EDGE_Y);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,207,77,0.75)";
    ctx.font = "12px sans-serif";
    ctx.fillText("WIN LINE", 8, EDGE_Y + 16);

    ctx.fillStyle = "#0a1020";
    ctx.fillRect(0, 0, W, BACK_Y);
    ctx.fillRect(0, 0, WALL_X, SIDE_OPEN_Y);
    ctx.fillRect(W - WALL_X, 0, WALL_X, SIDE_OPEN_Y);

    // Hazard tint marking the open stretch where the side walls have ended.
    var hazard = ctx.createLinearGradient(0, SIDE_OPEN_Y, 0, EDGE_Y);
    hazard.addColorStop(0, "rgba(255,90,90,0.32)");
    hazard.addColorStop(1, "rgba(255,90,90,0.04)");
    ctx.fillStyle = hazard;
    ctx.fillRect(0, SIDE_OPEN_Y, 9, EDGE_Y - SIDE_OPEN_Y);
    ctx.fillRect(W - 9, SIDE_OPEN_Y, 9, EDGE_Y - SIDE_OPEN_Y);

    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(WALL_X, SIDE_OPEN_Y);
    ctx.lineTo(W - WALL_X, SIDE_OPEN_Y);
    ctx.stroke();
    ctx.setLineDash([]);

    var backY = pusherBackY(t);
    var frontY = backY + PUSHER_THICKNESS;
    var pg = ctx.createLinearGradient(0, backY, 0, frontY);
    pg.addColorStop(0, "#e8edff");
    pg.addColorStop(1, "#8f9bcf");
    ctx.fillStyle = pg;
    ctx.fillRect(WALL_X, backY, W - 2 * WALL_X, PUSHER_THICKNESS);

    medals.forEach(function (m) {
      var k = m.fallingOff ? Math.max(0, 1 - m.fallT) : 1;
      if (k <= 0) return;
      ctx.save();
      ctx.globalAlpha = k;
      ctx.translate(m.x, m.y);
      ctx.scale(k, k);
      var mg = ctx.createRadialGradient(-m.r * 0.3, -m.r * 0.3, 1, 0, 0, m.r);
      if (m.bonus) {
        mg.addColorStop(0, "#fff0f6");
        mg.addColorStop(0.5, "#ff6fae");
        mg.addColorStop(1, "#b3195f");
      } else {
        mg.addColorStop(0, "#fff3c4");
        mg.addColorStop(0.5, "#ffcf4d");
        mg.addColorStop(1, "#c98f16");
      }
      ctx.beginPath();
      ctx.arc(0, 0, m.r, 0, Math.PI * 2);
      ctx.fillStyle = mg;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = m.bonus ? "#7a0f3d" : "#8a5f0f";
      ctx.stroke();
      if (m.bonus) {
        ctx.fillStyle = "#fff";
        ctx.font = "bold " + Math.round(m.r * 1.15) + "px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("★", 0, 1);
      }
      ctx.restore();
    });
  }

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
