(function () {
  renderHeader({ homeHref: "../../index.html" });

  var COLLECTION_KEY = "medalCasino.fishCollection";
  var CAST_COST = 5;
  var TICK_MS = 120;

  var FISH_TYPES = [
    { key: "zako", name: "ザコフィッシュ", icon: "🐟", weight: 38, reward: 8, difficulty: 3.5, rarity: "コモン" },
    { key: "aji", name: "アジ", icon: "🐠", weight: 26, reward: 15, difficulty: 4.5, rarity: "コモン" },
    { key: "tako", name: "タコ", icon: "🐙", weight: 15, reward: 30, difficulty: 6.5, rarity: "レア" },
    { key: "fugu", name: "フグ", icon: "🐡", weight: 10, reward: 55, difficulty: 8, rarity: "レア" },
    { key: "same", name: "サメ", icon: "🦈", weight: 6, reward: 160, difficulty: 11, rarity: "スーパーレア" },
    { key: "kujira", name: "クジラ", icon: "🐋", weight: 2.5, reward: 420, difficulty: 14, rarity: "エピック" },
    { key: "legend", name: "伝説の金魚", icon: "🐡", weight: 0.5, reward: 2200, difficulty: 17, rarity: "レジェンド" },
  ];

  var pondEl = document.getElementById("pond");
  var fishIconEl = document.getElementById("fish-icon");
  var statusEl = document.getElementById("pond-status");
  var castBtn = document.getElementById("cast-btn");
  var reelWrapEl = document.getElementById("reel-wrap");
  var reelBarEl = document.getElementById("reel-bar");
  var reelBtn = document.getElementById("reel-btn");
  var collectionEl = document.getElementById("fish-collection");

  var state = "idle"; // idle | waiting | reeling
  var currentFish = null;
  var progress = 0;
  var reelTimer = null;

  function loadCollection() {
    try {
      var raw = localStorage.getItem(COLLECTION_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveCollection(data) {
    try {
      localStorage.setItem(COLLECTION_KEY, JSON.stringify(data));
    } catch (e) {
      /* ignore storage errors */
    }
  }

  function renderCollection() {
    var data = loadCollection();
    collectionEl.innerHTML = "";
    FISH_TYPES.forEach(function (f) {
      var count = data[f.key] || 0;
      var entry = document.createElement("div");
      entry.className = "fish-entry" + (count > 0 ? " caught" : "");
      entry.innerHTML =
        '<span class="icon">' + (count > 0 ? f.icon : "❔") + "</span>" +
        '<span class="info"><span class="name">' + (count > 0 ? f.name : "？？？") +
        '</span><br><span class="rarity">' + f.rarity + " ・ " + f.reward.toLocaleString() + "枚</span></span>" +
        '<span class="count">×' + count + "</span>";
      collectionEl.appendChild(entry);
    });
  }

  function pickFish() {
    var total = FISH_TYPES.reduce(function (a, f) {
      return a + f.weight;
    }, 0);
    var r = Math.random() * total;
    for (var i = 0; i < FISH_TYPES.length; i++) {
      r -= FISH_TYPES[i].weight;
      if (r <= 0) return FISH_TYPES[i];
    }
    return FISH_TYPES[0];
  }

  function updateCastButton() {
    var bal = MedalBank.getBalance();
    castBtn.disabled = state !== "idle" || bal < CAST_COST;
  }

  castBtn.addEventListener("click", function () {
    if (state !== "idle") return;
    if (!MedalBank.spend(CAST_COST, "釣り:仕掛け")) {
      updateCastButton();
      return;
    }
    state = "waiting";
    updateCastButton();
    statusEl.textContent = "仕掛けを投げた…魚を待とう…";
    fishIconEl.className = "fish-icon";
    fishIconEl.textContent = "🎣";

    var waitMs = 900 + Math.random() * 1800;
    setTimeout(function () {
      if (state !== "waiting") return;
      startReel();
    }, waitMs);
  });

  function startReel() {
    currentFish = pickFish();
    progress = 35;
    state = "reeling";
    statusEl.textContent = "ヒット！ 何かが掛かった！";
    fishIconEl.textContent = currentFish.icon;
    fishIconEl.className = "fish-icon show struggle";
    reelWrapEl.classList.remove("hidden");
    reelBarEl.style.width = progress + "%";

    reelTimer = setInterval(function () {
      progress -= currentFish.difficulty * (TICK_MS / 100);
      if (progress <= 0) {
        progress = 0;
        reelBarEl.style.width = "0%";
        escapeFish();
        return;
      }
      reelBarEl.style.width = progress + "%";
    }, TICK_MS);
  }

  reelBtn.addEventListener("click", function () {
    if (state !== "reeling") return;
    progress = Math.min(100, progress + 9 + Math.random() * 5);
    reelBarEl.style.width = progress + "%";
    if (progress >= 100) {
      catchFish();
    }
  });

  function stopReelTimer() {
    if (reelTimer) {
      clearInterval(reelTimer);
      reelTimer = null;
    }
  }

  function escapeFish() {
    stopReelTimer();
    statusEl.textContent = "…逃げられた！ また挑戦しよう。";
    fishIconEl.classList.remove("struggle");
    fishIconEl.classList.remove("show");
    reelWrapEl.classList.add("hidden");
    state = "idle";
    currentFish = null;
    updateCastButton();
  }

  function catchFish() {
    stopReelTimer();
    var f = currentFish;
    MedalBank.add(f.reward, "釣り:獲得(" + f.name + ")");
    if (f.rarity === "スーパーレア" || f.rarity === "エピック" || f.rarity === "レジェンド") {
      JPTickets.add(1);
    }
    var data = loadCollection();
    data[f.key] = (data[f.key] || 0) + 1;
    saveCollection(data);
    renderCollection();

    statusEl.textContent =
      "🎉 " + f.name + "（" + f.rarity + "）を釣った！ " + f.reward.toLocaleString() + " 枚獲得！" +
      (f.rarity === "スーパーレア" || f.rarity === "エピック" || f.rarity === "レジェンド" ? " 🎫JP券+1" : "");
    fishIconEl.classList.remove("struggle");
    reelWrapEl.classList.add("hidden");
    state = "idle";
    currentFish = null;
    updateCastButton();
  }

  MedalBank.subscribe(function () {
    updateCastButton();
  });

  renderCollection();
  updateCastButton();
})();
