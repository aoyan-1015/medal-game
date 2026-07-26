(function () {
  renderHeader({ homeHref: "../../index.html" });

  var SEGMENTS = [
    { label: "50枚", amount: 50, weight: 16, color: "#6ea8ff" },
    { label: "ハズレ", amount: 0, weight: 18, color: "#2c3a63" },
    { label: "100枚", amount: 100, weight: 14, color: "#57e389" },
    { label: "30枚", amount: 30, weight: 16, color: "#c17dff" },
    { label: "200枚", amount: 200, weight: 10, color: "#ffcf4d" },
    { label: "ハズレ", amount: 0, weight: 18, color: "#2c3a63" },
    { label: "50枚", amount: 50, weight: 16, color: "#6ea8ff" },
    { label: "500枚", amount: 500, weight: 5, color: "#ff5d6c" },
    { label: "ハズレ", amount: 0, weight: 18, color: "#2c3a63" },
    { label: "JACKPOT", amount: 2000, weight: 2, color: "#d99b1f" },
  ];

  var n = SEGMENTS.length;
  var segAngle = 360 / n;

  var wheelEl = document.getElementById("wheel");
  var resultEl = document.getElementById("wheel-result");
  var spinBtn = document.getElementById("spin-btn");
  var hintEl = document.getElementById("spin-hint");
  var ticketCountEl = document.getElementById("ticket-count");
  var prizeListEl = document.getElementById("prize-list");

  var currentRotation = 0;
  var spinning = false;

  var gradientParts = SEGMENTS.map(function (s, i) {
    var from = (i * segAngle).toFixed(2);
    var to = ((i + 1) * segAngle).toFixed(2);
    return s.color + " " + from + "deg " + to + "deg";
  });
  wheelEl.style.background = "conic-gradient(" + gradientParts.join(", ") + ")";

  SEGMENTS.forEach(function (s, i) {
    var label = document.createElement("div");
    label.className = "wheel-label";
    var mid = segAngle * i + segAngle / 2;
    label.style.transform = "rotate(" + mid + "deg)";
    label.textContent = s.label;
    wheelEl.appendChild(label);
  });

  var seenPrizes = {};
  var prizeItems = [];
  SEGMENTS.forEach(function (s) {
    var key = s.label + ":" + s.amount;
    if (seenPrizes[key]) return;
    seenPrizes[key] = true;
    prizeItems.push("<li>" + s.label + (s.amount > 0 ? "（" + s.amount.toLocaleString() + "枚）" : "") + "</li>");
  });
  prizeListEl.innerHTML = prizeItems.join("");

  function pickSegment() {
    var total = SEGMENTS.reduce(function (a, s) {
      return a + s.weight;
    }, 0);
    var r = Math.random() * total;
    for (var i = 0; i < SEGMENTS.length; i++) {
      r -= SEGMENTS[i].weight;
      if (r <= 0) return i;
    }
    return SEGMENTS.length - 1;
  }

  function updateUI() {
    var tickets = JPTickets.getCount();
    ticketCountEl.textContent = tickets;
    if (spinning) return;
    spinBtn.disabled = tickets < 1;
    hintEl.textContent =
      tickets < 1 ? "JP券がありません。スロットのジャックポットやメダル落としのボーナスコインを当てて貯めよう。" : "";
  }

  spinBtn.addEventListener("click", function () {
    if (spinning) return;
    if (!JPTickets.spend(1)) {
      updateUI();
      return;
    }
    spinning = true;
    spinBtn.disabled = true;
    resultEl.textContent = "";
    resultEl.className = "wheel-result";

    var targetIndex = pickSegment();
    var targetMid = segAngle * targetIndex + segAngle / 2;
    var fullSpins = 5 + Math.floor(Math.random() * 3);
    // The pointer is fixed at the top (0deg). Rotating the wheel by R degrees
    // moves the segment whose center started at targetMid to (targetMid + R).
    // Solve for R so that lands under the pointer, then add full spins for flourish.
    var delta = (360 - (targetMid % 360)) % 360;
    var base = currentRotation - (currentRotation % 360);
    var newRotation = base + fullSpins * 360 + delta;
    while (newRotation <= currentRotation) newRotation += 360;
    currentRotation = newRotation;

    wheelEl.style.transition = "transform 4s cubic-bezier(0.12, 0.65, 0.15, 1)";
    wheelEl.style.transform = "rotate(" + currentRotation + "deg)";

    setTimeout(function () {
      var seg = SEGMENTS[targetIndex];
      spinning = false;
      if (seg.amount > 0) {
        MedalBank.add(seg.amount, "JPルーレット:配当");
        var isJackpot = seg.label === "JACKPOT";
        resultEl.textContent = (isJackpot ? "🎉🎉 JACKPOT！！ " : "🎊 ") + seg.amount.toLocaleString() + " 枚獲得！";
        resultEl.className = "wheel-result win" + (isJackpot ? " jackpot" : "");
      } else {
        resultEl.textContent = "残念、ハズレ…";
        resultEl.className = "wheel-result lose";
      }
      updateUI();
    }, 4200);
  });

  JPTickets.subscribe(function () {
    updateUI();
  });

  updateUI();
})();
