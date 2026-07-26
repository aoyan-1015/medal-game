(function () {
  renderHeader({ homeHref: "../../index.html" });

  var SYMBOLS = [
    { key: "cherry", icon: "🍒", mult: 1 },
    { key: "lemon", icon: "🍋", mult: 1.5 },
    { key: "bell", icon: "🔔", mult: 2.2 },
    { key: "star", icon: "⭐", mult: 3.5 },
    { key: "seven", icon: "7️⃣", mult: 8 },
  ];
  var BOSS_NAMES = ["スライムキング", "ゴブリンロード", "アイアンナイト", "デーモンロード", "カオスドラゴン"];
  var BASE_DAMAGE_MIN = 4;
  var BASE_DAMAGE_MAX = 9;
  var ATTACK_COST = 1;

  var stageNameEl = document.getElementById("boss-stage");
  var bossNameEl = document.getElementById("boss-name");
  var bossSpriteEl = document.getElementById("boss-sprite");
  var damagePopEl = document.getElementById("damage-pop");
  var hpBarEl = document.getElementById("hp-bar");
  var hpTextEl = document.getElementById("hp-text");
  var reelsEl = document.getElementById("attack-reels");
  var reelCells = reelsEl.querySelectorAll(".reel-cell");
  var attackBtn = document.getElementById("attack-btn");
  var attack5Btn = document.getElementById("attack5-btn");
  var hintEl = document.getElementById("battle-hint");
  var logEl = document.getElementById("battle-log");
  var rewardPreviewEl = document.getElementById("reward-preview");

  var stage = 1;
  var boss = null;
  var busy = false; // true while a multi-attack sequence or defeat animation is playing

  function makeBoss(stageNum) {
    var nameBase = BOSS_NAMES[Math.min(stageNum - 1, BOSS_NAMES.length - 1)];
    var name = stageNum > BOSS_NAMES.length ? nameBase + " Lv." + stageNum : nameBase;
    var hp = Math.round(150 * Math.pow(1.35, stageNum - 1));
    return { name: name, hp: hp, maxHp: hp };
  }

  function randSymbol() {
    return SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
  }

  function renderBoss() {
    stageNameEl.textContent = "ステージ " + stage;
    bossNameEl.textContent = boss.name;
    bossSpriteEl.classList.remove("defeated", "hit");
    bossSpriteEl.style.opacity = "";
    bossSpriteEl.style.transform = "";
    updateHpBar();
    rewardPreviewEl.textContent = Math.round(boss.maxHp * 1.2).toLocaleString();
  }

  function updateHpBar() {
    var pct = Math.max(0, (boss.hp / boss.maxHp) * 100);
    hpBarEl.style.width = pct + "%";
    hpTextEl.textContent = Math.max(0, Math.round(boss.hp)) + " / " + boss.maxHp;
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

  function updateButtons() {
    var bal = MedalBank.getBalance();
    attackBtn.disabled = busy || bal < ATTACK_COST;
    attack5Btn.disabled = busy || bal < ATTACK_COST * 5;
  }

  function attackOnce() {
    if (boss.hp <= 0) return false;
    if (!MedalBank.spend(ATTACK_COST, "ボスバトル:こうげき")) return false;

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
    dmg = Math.max(1, Math.round(dmg));
    boss.hp = Math.max(0, boss.hp - dmg);
    showDamage(dmg, special);
    updateHpBar();
    log(special ? "🔥 必殺技炸裂！ " + dmg + " ダメージ！" : isTriple ? "✨ " + picks[0].icon + "揃い！ " + dmg + " ダメージ" : dmg + " ダメージ");

    if (boss.hp <= 0) {
      defeatBoss();
    }
    return true;
  }

  function defeatBoss() {
    busy = true;
    updateButtons();
    var reward = Math.round(boss.maxHp * 1.2);
    MedalBank.add(reward, "ボスバトル:撃破報酬");
    JPTickets.add(1);
    log("🎉 " + boss.name + " を倒した！ " + reward.toLocaleString() + " 枚獲得！ 🎫JP券+1");
    bossSpriteEl.classList.add("defeated");
    setTimeout(function () {
      stage += 1;
      boss = makeBoss(stage);
      renderBoss();
      busy = false;
      updateButtons();
      hintEl.textContent = "新たな敵が現れた！";
    }, 1400);
  }

  attackBtn.addEventListener("click", function () {
    if (busy) return;
    hintEl.textContent = "";
    attackOnce();
    updateButtons();
  });

  attack5Btn.addEventListener("click", function () {
    if (busy) return;
    hintEl.textContent = "";
    busy = true;
    updateButtons();
    var count = 0;
    function next() {
      if (count >= 5 || boss.hp <= 0) {
        busy = boss.hp <= 0 ? busy : false;
        if (boss.hp > 0) updateButtons();
        return;
      }
      var ok = attackOnce();
      count += 1;
      updateButtons();
      if (!ok) {
        busy = false;
        updateButtons();
        return;
      }
      if (boss.hp > 0) setTimeout(next, 260);
    }
    next();
  });

  MedalBank.subscribe(function () {
    updateButtons();
  });

  boss = makeBoss(stage);
  renderBoss();
  updateButtons();
})();
