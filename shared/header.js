(function (global) {
  // "コイン" ad menu: watch a (simulated) 30-second video for medals. This is
  // the same reward loop medal-boss-battle's own メニュー has, minus the
  // 道具 (items) tab, exposed globally so every game gets it via the shared
  // header instead of each game re-implementing it.
  var COIN_AD_SECONDS = 30;
  var COIN_AD_REWARD = 30;

  function renderHeader(opts) {
    opts = opts || {};
    var container = document.getElementById("app-header");
    if (!container) return;
    var home = opts.homeHref || "/index.html";

    container.innerHTML =
      '<header class="app-header">' +
      '<a class="brand" href="' + home + '">🎰 メダルカジノ</a>' +
      '<div class="header-actions">' +
      '<button class="btn btn-primary gcoin-open-btn" id="gcoin-open-btn" type="button">🎬 コインGET</button>' +
      '<button class="btn grank-open-btn" id="grank-open-btn" type="button">🏆 ランキング</button>' +
      '<div class="balance-pill"><span>🪙</span><span id="balance-value">--</span><span class="unit">枚</span></div>' +
      "</div>" +
      "</header>" +
      '<div class="toast-stack" id="toast-stack"></div>' +
      '<div class="gcoin-overlay" id="gcoin-overlay">' +
      '<div class="gcoin-box">' +
      '<div class="gcoin-header">' +
      '<p class="gcoin-title">🪙 コインを増やす</p>' +
      '<button class="gcoin-close" id="gcoin-close-btn" type="button">✕</button>' +
      "</div>" +
      '<div class="gcoin-ad-box">' +
      '<p class="gcoin-ad-title">📺 30秒の動画を見てコインゲット！</p>' +
      '<div class="gcoin-ad-screen" id="gcoin-ad-screen"><span class="gcoin-ad-icon">🎬</span></div>' +
      '<p class="gcoin-ad-status" id="gcoin-ad-status">動画を見て' +
      COIN_AD_REWARD +
      "枚のメダルを獲得しよう。</p>" +
      '<div class="gcoin-ad-progress-wrap" id="gcoin-ad-progress-wrap"><div class="gcoin-ad-progress" id="gcoin-ad-progress"></div></div>' +
      '<button class="btn btn-primary" id="gcoin-ad-watch-btn" type="button">▶ 動画を見る</button>' +
      "</div>" +
      "</div>" +
      "</div>" +
      '<div class="grank-overlay" id="grank-overlay">' +
      '<div class="grank-box">' +
      '<div class="grank-header">' +
      '<p class="grank-title">🏆 メダル獲得数ランキング</p>' +
      '<button class="grank-close" id="grank-close-btn" type="button">✕</button>' +
      "</div>" +
      '<div class="grank-nick-row">' +
      '<input class="grank-nick-input" id="grank-nick-input" type="text" maxlength="20" placeholder="ニックネーム" />' +
      '<button class="btn btn-primary" id="grank-nick-save-btn" type="button">保存</button>' +
      "</div>" +
      '<p class="grank-disabled-note" id="grank-disabled-note">ランキング機能は準備中です。</p>' +
      '<ol class="grank-list" id="grank-list"></ol>' +
      "</div>" +
      "</div>";

    var pill = container.querySelector(".balance-pill");
    var valueEl = document.getElementById("balance-value");
    var prevBal = null;

    MedalBank.subscribe(function (bal) {
      valueEl.textContent = bal.toLocaleString();
      if (prevBal !== null && bal !== prevBal) {
        pill.classList.remove("bump");
        void pill.offsetWidth;
        pill.classList.add("bump");
      }
      prevBal = bal;
    });

    global.addEventListener("medalbank:refill", function (e) {
      showToast("🪙 メダルが尽きたので " + e.detail.amount + " 枚補充しました");
    });

    setupCoinMenu();
    setupRankingMenu();
  }

  function setupCoinMenu() {
    var openBtn = document.getElementById("gcoin-open-btn");
    var overlay = document.getElementById("gcoin-overlay");
    var closeBtn = document.getElementById("gcoin-close-btn");
    var screenEl = document.getElementById("gcoin-ad-screen");
    var statusEl = document.getElementById("gcoin-ad-status");
    var progressWrapEl = document.getElementById("gcoin-ad-progress-wrap");
    var progressEl = document.getElementById("gcoin-ad-progress");
    var watchBtn = document.getElementById("gcoin-ad-watch-btn");

    var running = false;
    var timer = null;
    var remaining = 0;

    function resetView() {
      watchBtn.style.display = "";
      watchBtn.disabled = false;
      watchBtn.textContent = "▶ 動画を見る";
      progressWrapEl.classList.remove("show");
      progressEl.style.width = "0%";
      statusEl.textContent = "動画を見て" + COIN_AD_REWARD + "枚のメダルを獲得しよう。";
      screenEl.classList.remove("playing");
    }

    function updateStatus() {
      statusEl.textContent = "再生中… 残り" + remaining + "秒";
      var pct = ((COIN_AD_SECONDS - remaining) / COIN_AD_SECONDS) * 100;
      progressEl.style.width = pct + "%";
    }

    function startAd() {
      if (running) return;
      running = true;
      remaining = COIN_AD_SECONDS;
      watchBtn.style.display = "none";
      progressWrapEl.classList.add("show");
      screenEl.classList.add("playing");
      updateStatus();

      timer = global.setInterval(function () {
        remaining -= 1;
        if (remaining <= 0) {
          global.clearInterval(timer);
          timer = null;
          running = false;
          screenEl.classList.remove("playing");
          progressWrapEl.classList.remove("show");
          MedalBank.add(COIN_AD_REWARD, "コインGET:動画リワード");
          statusEl.textContent = "🎉 " + COIN_AD_REWARD + "枚獲得！";
          watchBtn.style.display = "";
          watchBtn.textContent = "▶ もう一度見る";
        } else {
          updateStatus();
        }
      }, 1000);
    }

    openBtn.addEventListener("click", function () {
      if (!running) resetView();
      overlay.classList.add("active");
    });
    closeBtn.addEventListener("click", function () {
      overlay.classList.remove("active");
    });
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) overlay.classList.remove("active");
    });
    watchBtn.addEventListener("click", startAd);
  }

  function setupRankingMenu() {
    var openBtn = document.getElementById("grank-open-btn");
    var overlay = document.getElementById("grank-overlay");
    var closeBtn = document.getElementById("grank-close-btn");
    var nickInput = document.getElementById("grank-nick-input");
    var nickSaveBtn = document.getElementById("grank-nick-save-btn");
    var disabledNote = document.getElementById("grank-disabled-note");
    var listEl = document.getElementById("grank-list");

    function refreshDisabledState() {
      var disabled = Ranking.getStatus() === "disabled";
      disabledNote.classList.toggle("show", disabled);
      listEl.style.display = disabled ? "none" : "";
    }

    // Row content comes from other players' Firestore docs, so it's built
    // with textContent (never innerHTML) to avoid a nickname smuggling markup
    // into the page.
    function renderList(rows) {
      listEl.innerHTML = "";
      var myUid = Ranking.getMyUid();
      rows.forEach(function (row, idx) {
        var li = document.createElement("li");
        li.className = "grank-row" + (row.uid === myUid ? " me" : "");

        var rankSpan = document.createElement("span");
        rankSpan.className = "grank-rank";
        rankSpan.textContent = String(idx + 1);

        var nameSpan = document.createElement("span");
        nameSpan.className = "grank-name";
        nameSpan.textContent = row.name;

        var scoreSpan = document.createElement("span");
        scoreSpan.className = "grank-score";
        scoreSpan.textContent = row.totalEarned.toLocaleString();

        li.appendChild(rankSpan);
        li.appendChild(nameSpan);
        li.appendChild(scoreSpan);
        listEl.appendChild(li);
      });
    }

    Ranking.subscribeTop(renderList);

    openBtn.addEventListener("click", function () {
      nickInput.value = Ranking.getNickname();
      refreshDisabledState();
      overlay.classList.add("active");
    });
    closeBtn.addEventListener("click", function () {
      overlay.classList.remove("active");
    });
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) overlay.classList.remove("active");
    });
    nickSaveBtn.addEventListener("click", function () {
      var saved = Ranking.setNickname(nickInput.value);
      nickInput.value = saved;
      showToast("✅ ニックネームを保存しました: " + saved);
    });
    nickInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") nickSaveBtn.click();
    });
  }

  function showToast(message) {
    var stack = document.getElementById("toast-stack");
    if (!stack) return;
    var el = document.createElement("div");
    el.className = "toast";
    el.textContent = message;
    stack.appendChild(el);
    global.setTimeout(function () {
      el.remove();
    }, 3100);
  }

  global.renderHeader = renderHeader;
  global.showToast = showToast;
})(window);
