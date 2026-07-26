(function (global) {
  var STORAGE_KEY = "medalCasino.jpTickets";
  var listeners = new Set();

  function getCount() {
    var raw = localStorage.getItem(STORAGE_KEY);
    var n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : 0;
  }

  function setCount(n) {
    var clamped = Math.max(0, Math.floor(n));
    localStorage.setItem(STORAGE_KEY, String(clamped));
    notify(clamped);
    return clamped;
  }

  function add(amount) {
    if (!amount || amount <= 0) return getCount();
    return setCount(getCount() + amount);
  }

  function spend(amount) {
    amount = amount || 1;
    var c = getCount();
    if (c < amount) return false;
    setCount(c - amount);
    return true;
  }

  function subscribe(fn) {
    listeners.add(fn);
    fn(getCount());
    return function () {
      listeners.delete(fn);
    };
  }

  function notify(c) {
    listeners.forEach(function (fn) {
      try {
        fn(c);
      } catch (e) {
        /* listener error should not break other listeners */
      }
    });
  }

  global.addEventListener("storage", function (e) {
    if (e.key === STORAGE_KEY) notify(getCount());
  });

  global.JPTickets = {
    getCount: getCount,
    add: add,
    spend: spend,
    subscribe: subscribe,
  };
})(window);
