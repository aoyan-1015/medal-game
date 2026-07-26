(function () {
  renderHeader({ homeHref: "../../index.html" });

  var canvas = document.getElementById("field");
  var ctx = canvas.getContext("2d");
  var W = canvas.width;
  var H = canvas.height;

  var ENTRY_COST = 20;
  var BIN_COUNT = 15;
  var CARD_SIZE = 9;
  var MAX_DRAWS = 10;
  var FIELD_LEFT = 24;
  var FIELD_RIGHT = W - 24;
  var FIELD_WIDTH = FIELD_RIGHT - FIELD_LEFT;
  var BIN_WIDTH = FIELD_WIDTH / BIN_COUNT;
  var PEG_ROWS = 9;
  var PEG_TOP_Y = 90;
  var PEG_ROW_GAP = 32;
  var PEG_R = 4;
  var BALL_R = 7; // must stay well under half a bin's width so the ball can always slip between two same-row pegs
  var BIN_TOP_Y = PEG_TOP_Y + (PEG_ROWS - 1) * PEG_ROW_GAP + 34;
  var BIN_LABEL_Y = H - 18;
  var LAND_Y = H - 42;
  var GRAVITY = 1150;
  var BALL_INTERVAL_MS = 350;

  var LINES = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];

  var PAYOUT_BY_DRAWS = { 3: 40, 4: 25, 5: 15, 6: 10, 7: 6, 8: 4, 9: 2.5, 10: 1.5 };

  var startBtn = document.getElementById("start-btn");
  var hintEl = document.getElementById("game-hint");
  var cardEl = document.getElementById("bingo-card");
  var drawCountEl = document.getElementById("draw-count");
  var lastNumberEl = document.getElementById("last-number");
  var resultEl = document.getElementById("result-message");
  var reachBannerEl = document.getElementById("reach-banner");
  var releaseBtn = document.getElementById("release-btn");
  var autoBtn = document.getElementById("auto-release-btn");

  var autoOn = false;
  var autoTimer = null;

  var pegs = [];
  for (var r = 0; r < PEG_ROWS; r++) {
    var y = PEG_TOP_Y + r * PEG_ROW_GAP;
    if (r % 2 === 0) {
      for (var i = 0; i <= BIN_COUNT; i++) pegs.push({ x: FIELD_LEFT + i * BIN_WIDTH, y: y });
    } else {
      for (var j = 0; j < BIN_COUNT; j++) pegs.push({ x: FIELD_LEFT + (j + 0.5) * BIN_WIDTH, y: y });
    }
  }

  var binNumbers = []; // bin index -> number, reshuffled each round
  var cardNumbers = []; // 9 numbers on the card, index-aligned with cardEl cells
  var markedCells = [];
  var ball = null; // active physics ball, or null
  var playing = false;
  var drawsUsed = 0;
  var linesDoneCells = {}; // cell indices that are part of a completed line, for highlight

  function shuffle(arr) {
    for (var idx = arr.length - 1; idx > 0; idx--) {
      var j2 = Math.floor(Math.random() * (idx + 1));
      var tmp = arr[idx];
      arr[idx] = arr[j2];
      arr[j2] = tmp;
    }
    return arr;
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  // "リーチ": a line with 2 of its 3 cells already marked - one more matching
  // draw completes it. Purely derived from markedCells so it never needs its
  // own persisted state.
  function computeReachInfo() {
    var cells = {};
    var any = false;
    LINES.forEach(function (line) {
      var markedCount = line.filter(function (idx) { return markedCells[idx]; }).length;
      if (markedCount === 2) {
        any = true;
        line.forEach(function (idx) { cells[idx] = true; });
      }
    });
    return { cells: cells, any: any };
  }

  function renderCard() {
    var reach = computeReachInfo();
    cardEl.innerHTML = "";
    cardNumbers.forEach(function (n, idx) {
      var cell = document.createElement("div");
      var cls = "bingo-cell";
      if (markedCells[idx]) cls += " marked";
      if (linesDoneCells[idx]) cls += " in-line";
      else if (reach.cells[idx]) cls += " reach";
      cell.className = cls;
      cell.textContent = n;
      cardEl.appendChild(cell);
    });
    reachBannerEl.textContent = reach.any ? "🔥 リーチ！ あと1つで達成！" : "";
    reachBannerEl.classList.toggle("show", reach.any);
  }

  function setupRound() {
    var pool = [];
    for (var n = 1; n <= BIN_COUNT; n++) pool.push(n);
    binNumbers = shuffle(pool.slice());
    cardNumbers = shuffle(pool.slice()).slice(0, CARD_SIZE);
    markedCells = new Array(CARD_SIZE).fill(false);
    linesDoneCells = {};
    drawsUsed = 0;
    renderCard();
    drawCountEl.textContent = drawsUsed + " / " + MAX_DRAWS;
    lastNumberEl.textContent = "-";
    resultEl.textContent = "";
    resultEl.className = "result-message";
  }

  function checkLines() {
    var found = [];
    LINES.forEach(function (line) {
      if (line.every(function (idx) { return markedCells[idx]; })) {
        found.push(line);
      }
    });
    return found;
  }

  function spawnBall() {
    ball = {
      x: W / 2 + (Math.random() - 0.5) * 16,
      y: 36,
      vx: (Math.random() - 0.5) * 40,
      vy: 0,
      landedBin: -1,
      settled: false,
      fadeT: 0,
      stallT: 0,
      lastProgressY: 36,
    };
  }

  function settleBall() {
    var binIdx = clamp(Math.floor((ball.x - FIELD_LEFT) / BIN_WIDTH), 0, BIN_COUNT - 1);
    ball.landedBin = binIdx;
    ball.settled = true;
    onBallLanded(binNumbers[binIdx]);
  }

  function onBallLanded(number) {
    drawsUsed += 1;
    drawCountEl.textContent = drawsUsed + " / " + MAX_DRAWS;
    lastNumberEl.textContent = number;

    var cellIdx = cardNumbers.indexOf(number);
    if (cellIdx !== -1 && !markedCells[cellIdx]) {
      markedCells[cellIdx] = true;
    }
    renderCard();

    var completedLines = checkLines();
    if (completedLines.length > 0) {
      completedLines.forEach(function (line) {
        line.forEach(function (idx) {
          linesDoneCells[idx] = true;
        });
      });
      renderCard();
      finishRound(true, completedLines.length);
      return;
    }

    if (drawsUsed >= MAX_DRAWS) {
      finishRound(false, 0);
      return;
    }

    updateReleaseControls();
    if (autoOn) scheduleAutoBall();
    else hintEl.textContent = "「タップ」を押して次の球を落とそう！";
  }

  function scheduleAutoBall() {
    if (autoTimer) return;
    autoTimer = setTimeout(function () {
      autoTimer = null;
      if (autoOn && playing && !ball && drawsUsed < MAX_DRAWS) spawnBall();
    }, BALL_INTERVAL_MS);
  }

  function updateReleaseControls() {
    var canRelease = playing && !ball && drawsUsed < MAX_DRAWS && !autoOn;
    releaseBtn.disabled = !canRelease;
  }

  releaseBtn.addEventListener("click", function () {
    if (!playing || ball || autoOn || drawsUsed >= MAX_DRAWS) return;
    spawnBall();
    updateReleaseControls();
  });

  autoBtn.addEventListener("click", function () {
    autoOn = !autoOn;
    autoBtn.textContent = autoOn ? "⏸ オート: ON" : "🔁 オート: OFF";
    autoBtn.classList.toggle("active", autoOn);
    updateReleaseControls();
    if (autoOn) {
      if (autoTimer) {
        clearTimeout(autoTimer);
        autoTimer = null;
      }
      if (playing && !ball && drawsUsed < MAX_DRAWS) spawnBall();
    } else if (autoTimer) {
      clearTimeout(autoTimer);
      autoTimer = null;
    }
  });

  function finishRound(won, lineCount) {
    playing = false;
    if (autoTimer) {
      clearTimeout(autoTimer);
      autoTimer = null;
    }
    if (won) {
      var mult = PAYOUT_BY_DRAWS[drawsUsed] || 1;
      mult *= 1 + 0.5 * (lineCount - 1);
      var payout = Math.round(ENTRY_COST * mult);
      MedalBank.add(payout, "ビンゴボール:配当");
      if (drawsUsed <= 5) JPTickets.add(1);
      resultEl.textContent =
        "🎉 BINGO！ " + drawsUsed + "球目で" + lineCount + "ライン達成！ " + payout.toLocaleString() + " 枚獲得！" +
        (drawsUsed <= 5 ? " 🎫JP券+1" : "");
      resultEl.className = "result-message win";
    } else {
      resultEl.textContent = "残念、" + MAX_DRAWS + "球以内にビンゴなりませんでした…";
      resultEl.className = "result-message lose";
    }
    hintEl.textContent = "「スタート」でもう一度挑戦できます。";
    updateStartButton();
    updateReleaseControls();
  }

  function updateStartButton() {
    var bal = MedalBank.getBalance();
    startBtn.disabled = playing || bal < ENTRY_COST;
  }

  startBtn.addEventListener("click", function () {
    if (playing) return;
    if (!MedalBank.spend(ENTRY_COST, "ビンゴボール:参加")) {
      updateStartButton();
      return;
    }
    playing = true;
    setupRound();
    updateStartButton();
    updateReleaseControls();
    if (autoOn) {
      hintEl.textContent = "オートで球が落ちていきます…番号を狙え！";
      spawnBall();
    } else {
      hintEl.textContent = "「タップ」を押して球を落とそう！";
    }
  });

  MedalBank.subscribe(function () {
    updateStartButton();
  });

  function update(dt) {
    if (!ball || ball.settled) {
      if (ball && ball.settled) {
        ball.fadeT += dt / 0.3;
        if (ball.fadeT >= 1) {
          ball = null;
          updateReleaseControls();
        }
      }
      return;
    }

    ball.vy += GRAVITY * dt;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    if (ball.x < FIELD_LEFT + BALL_R) {
      ball.x = FIELD_LEFT + BALL_R;
      ball.vx = Math.abs(ball.vx) * 0.6;
    }
    if (ball.x > FIELD_RIGHT - BALL_R) {
      ball.x = FIELD_RIGHT - BALL_R;
      ball.vx = -Math.abs(ball.vx) * 0.6;
    }

    if (ball.y < BIN_TOP_Y) {
      for (var p = 0; p < pegs.length; p++) {
        var peg = pegs[p];
        if (Math.abs(peg.y - ball.y) > PEG_R + BALL_R) continue;
        var dx = ball.x - peg.x;
        var dy = ball.y - peg.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var minDist = BALL_R + PEG_R;
        if (dist < minDist && dist > 0.0001) {
          var nx = dx / dist;
          var ny = dy / dist;
          var overlap = minDist - dist;
          ball.x += nx * overlap;
          ball.y += ny * overlap;
          var dot = ball.vx * nx + ball.vy * ny;
          ball.vx -= 1.6 * dot * nx;
          ball.vy -= 1.6 * dot * ny;
          ball.vx *= 0.55;
          ball.vy *= 0.55;
          ball.vx += (Math.random() - 0.5) * 90;
        }
      }

      // Repeated per-frame collision damping can leave the ball resting in a
      // stable spot on/between pegs almost indefinitely, and nudging its
      // velocity alone doesn't help - the very next collision just damps it
      // right back down. Every fixed window, check how far it actually got
      // (not per-frame, which a single forward jitter could reset) and
      // teleport it forward if the net progress was too small.
      ball.stallT += dt;
      if (ball.stallT >= 0.3) {
        if (ball.y - ball.lastProgressY < 8) {
          ball.y += 26;
          ball.x = clamp(ball.x + (Math.random() - 0.5) * 30, FIELD_LEFT + BALL_R, FIELD_RIGHT - BALL_R);
          ball.vy = 220;
          ball.vx = (Math.random() - 0.5) * 70;
        }
        ball.lastProgressY = ball.y;
        ball.stallT = 0;
      }
    } else {
      var binIdx = clamp(Math.floor((ball.x - FIELD_LEFT) / BIN_WIDTH), 0, BIN_COUNT - 1);
      var targetX = FIELD_LEFT + (binIdx + 0.5) * BIN_WIDTH;
      ball.x += (targetX - ball.x) * Math.min(1, dt * 6);
      ball.vx *= 0.9;
    }

    if (ball.y >= LAND_Y) {
      ball.y = LAND_Y;
      settleBall();
    }
  }

  function render() {
    ctx.clearRect(0, 0, W, H);

    var bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, "#12335c");
    bgGrad.addColorStop(1, "#0a1830");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "rgba(255,255,255,0.55)";
    pegs.forEach(function (p) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, PEG_R, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(FIELD_LEFT, BIN_TOP_Y);
    ctx.lineTo(FIELD_RIGHT, BIN_TOP_Y);
    ctx.stroke();
    ctx.setLineDash([]);

    for (var b = 0; b <= BIN_COUNT; b++) {
      var x = FIELD_LEFT + b * BIN_WIDTH;
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, BIN_TOP_Y);
      ctx.lineTo(x, H - 10);
      ctx.stroke();
    }

    ctx.fillStyle = "#ffcf4d";
    ctx.font = "bold 15px sans-serif";
    ctx.textAlign = "center";
    for (var n = 0; n < BIN_COUNT; n++) {
      var cx = FIELD_LEFT + (n + 0.5) * BIN_WIDTH;
      var num = binNumbers.length ? binNumbers[n] : n + 1;
      var onCard = cardNumbers.indexOf(num) !== -1;
      ctx.fillStyle = onCard ? "#ffcf4d" : "rgba(255,255,255,0.45)";
      ctx.fillText(String(num), cx, BIN_LABEL_Y);
    }
    ctx.textAlign = "left";

    if (ball) {
      var k = ball.settled ? Math.max(0, 1 - ball.fadeT) : 1;
      ctx.save();
      ctx.globalAlpha = k;
      ctx.translate(ball.x, ball.y);
      var grad = ctx.createRadialGradient(-BALL_R * 0.3, -BALL_R * 0.3, 1, 0, 0, BALL_R);
      grad.addColorStop(0, "#fff3c4");
      grad.addColorStop(0.5, "#ffcf4d");
      grad.addColorStop(1, "#c98f16");
      ctx.beginPath();
      ctx.arc(0, 0, BALL_R, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "#8a5f0f";
      ctx.stroke();
      ctx.restore();
    }
  }

  var lastTs = null;
  function frame(ts) {
    if (lastTs === null) lastTs = ts;
    var dt = Math.min((ts - lastTs) / 1000, 0.033);
    lastTs = ts;

    update(dt);
    render();

    requestAnimationFrame(frame);
  }

  binNumbers = shuffle((function () {
    var pool = [];
    for (var n = 1; n <= BIN_COUNT; n++) pool.push(n);
    return pool;
  })());
  cardNumbers = shuffle(binNumbers.slice()).slice(0, CARD_SIZE);
  renderCard();
  updateStartButton();
  updateReleaseControls();
  requestAnimationFrame(frame);
})();
