(function (global) {
  var STORAGE_KEY = "medalCasino.balance";
  var HISTORY_KEY = "medalCasino.history";
  var TOTAL_EARNED_KEY = "medalCasino.totalEarned";
  var DEFAULT_BALANCE = 100;
  var AUTO_REFILL_AMOUNT = 30;
  var MAX_HISTORY = 40;
  var REFILL_DELAY_MS = 500;

  var listeners = new Set();
  var refillPending = false;

  function readRaw() {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      localStorage.setItem(STORAGE_KEY, String(DEFAULT_BALANCE));
      return DEFAULT_BALANCE;
    }
    var n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : DEFAULT_BALANCE;
  }

  function getBalance() {
    return readRaw();
  }

  function setBalance(n) {
    var clamped = Math.max(0, Math.floor(n));
    localStorage.setItem(STORAGE_KEY, String(clamped));
    notify(clamped);
    return clamped;
  }

  function logHistory(delta, reason) {
    try {
      var raw = localStorage.getItem(HISTORY_KEY);
      var list = raw ? JSON.parse(raw) : [];
      list.unshift({ delta: delta, reason: reason || "", time: Date.now() });
      while (list.length > MAX_HISTORY) list.pop();
      localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
    } catch (e) {
      /* ignore storage errors */
    }
  }

  function getHistory() {
    try {
      var raw = localStorage.getItem(HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function getTotalEarned() {
    var n = parseInt(localStorage.getItem(TOTAL_EARNED_KEY), 10);
    return Number.isFinite(n) ? n : 0;
  }

  function add(amount, reason) {
    if (amount === 0) return getBalance();
    var bal = setBalance(getBalance() + amount);
    logHistory(amount, reason);
    // Lifetime "獲得数" counter for the online ranking - only ever grows, even
    // though balance itself can go back down as it's spent.
    if (amount > 0) {
      localStorage.setItem(TOTAL_EARNED_KEY, String(getTotalEarned() + amount));
    }
    return bal;
  }

  function spend(amount, reason) {
    if (amount <= 0) return true;
    var bal = getBalance();
    if (bal < amount) {
      maybeScheduleRefill();
      return false;
    }
    var newBal = setBalance(bal - amount);
    logHistory(-amount, reason);
    if (newBal <= 0) maybeScheduleRefill();
    return true;
  }

  function resetBalance() {
    localStorage.removeItem(HISTORY_KEY);
    return setBalance(DEFAULT_BALANCE);
  }

  function maybeScheduleRefill() {
    if (refillPending) return;
    if (getBalance() > 0) return;
    refillPending = true;
    global.setTimeout(function () {
      refillPending = false;
      if (getBalance() > 0) return;
      add(AUTO_REFILL_AMOUNT, "残高補充");
      global.dispatchEvent(
        new CustomEvent("medalbank:refill", { detail: { amount: AUTO_REFILL_AMOUNT } })
      );
    }, REFILL_DELAY_MS);
  }

  function subscribe(fn) {
    listeners.add(fn);
    fn(getBalance());
    return function () {
      listeners.delete(fn);
    };
  }

  function notify(bal) {
    listeners.forEach(function (fn) {
      try {
        fn(bal);
      } catch (e) {
        /* listener error should not break the bank */
      }
    });
  }

  global.addEventListener("storage", function (e) {
    if (e.key === STORAGE_KEY) notify(getBalance());
  });

  global.MedalBank = {
    getBalance: getBalance,
    add: add,
    spend: spend,
    resetBalance: resetBalance,
    subscribe: subscribe,
    getHistory: getHistory,
    getTotalEarned: getTotalEarned,
    DEFAULT_BALANCE: DEFAULT_BALANCE,
    AUTO_REFILL_AMOUNT: AUTO_REFILL_AMOUNT,
  };
})(window);
