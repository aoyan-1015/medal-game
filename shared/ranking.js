(function (global) {
  // Online, real-time "medal獲得数" (lifetime earned) leaderboard, backed by
  // Supabase (Postgres + Realtime + Anonymous Auth). Degrades to a silent
  // no-op when shared/supabase-config.js still has its placeholder values,
  // so the rest of the site works before Supabase is set up.
  //
  // Public API (kept stable across backend swaps - shared/header.js only
  // talks to this surface): getNickname, setNickname, getMyUid, getStatus,
  // subscribeTop.
  var PLACEHOLDER_URL = "PASTE_YOUR_SUPABASE_URL_HERE";
  var NICK_KEY = "medalCasino.nickname";
  var SYNC_INTERVAL_MS = 2500;
  var TOP_LIMIT = 20;

  var status = "disabled"; // "disabled" | "connecting" | "ready"
  var client = null;
  var currentUserId = null;
  var topListeners = new Set();
  var latestRows = [];

  var inFlight = false;
  var lastSyncedEarned = -1;
  var lastSyncedName = null;
  var nicknameDirty = false;

  function getNickname() {
    var n = localStorage.getItem(NICK_KEY);
    if (!n) {
      n = "ゲスト" + String(1000 + Math.floor(Math.random() * 9000));
      localStorage.setItem(NICK_KEY, n);
    }
    return n;
  }

  function setNickname(name) {
    name = String(name || "").trim().slice(0, 20);
    if (!name) return getNickname();
    localStorage.setItem(NICK_KEY, name);
    nicknameDirty = true;
    return name;
  }

  function getMyUid() {
    return currentUserId;
  }

  function getStatus() {
    return status;
  }

  function notifyTop() {
    topListeners.forEach(function (fn) {
      try {
        fn(latestRows.slice());
      } catch (e) {
        /* listener error should not break other listeners */
      }
    });
  }

  function subscribeTop(fn) {
    topListeners.add(fn);
    fn(latestRows.slice());
    return function () {
      topListeners.delete(fn);
    };
  }

  // Supabase Realtime just tells us "something in `rankings` changed" - it
  // doesn't hand back a live-sorted top-N the way Firestore's orderBy/limit
  // listener would, so every change event just re-fetches the top 20. Cheap
  // for a leaderboard this size and far simpler than client-side merging.
  function refreshTop() {
    client
      .from("rankings")
      .select("id,name,total_earned")
      .order("total_earned", { ascending: false })
      .limit(TOP_LIMIT)
      .then(function (res) {
        if (res.error) {
          console.warn("Ranking: leaderboard fetch failed", res.error);
          return;
        }
        latestRows = (res.data || []).map(function (row) {
          return { uid: row.id, name: row.name, totalEarned: row.total_earned };
        });
        notifyTop();
      });
  }

  function trySync() {
    if (status !== "ready" || inFlight || !currentUserId) return;
    var earned = global.MedalBank ? global.MedalBank.getTotalEarned() : 0;
    var name = getNickname();
    if (!nicknameDirty && earned === lastSyncedEarned && name === lastSyncedName) return;
    inFlight = true;
    client
      .from("rankings")
      .upsert({ id: currentUserId, name: name, total_earned: earned }, { onConflict: "id" })
      .then(function (res) {
        if (res.error) {
          console.warn("Ranking: sync failed", res.error);
          return;
        }
        lastSyncedEarned = earned;
        lastSyncedName = name;
        nicknameDirty = false;
      })
      .finally(function () {
        inFlight = false;
      });
  }

  function init() {
    var config = global.SUPABASE_CONFIG;
    if (!config || config.url === PLACEHOLDER_URL) {
      console.warn("Ranking: shared/supabase-config.js is not set up yet - online ranking disabled.");
      return;
    }
    if (!global.supabase) {
      console.warn("Ranking: Supabase SDK script did not load - online ranking disabled.");
      return;
    }

    try {
      status = "connecting";
      client = global.supabase.createClient(config.url, config.anonKey);

      client.auth.onAuthStateChange(function (_event, session) {
        if (session && session.user) {
          currentUserId = session.user.id;
          status = "ready";
          trySync();
        }
      });
      client.auth.getSession().then(function (res) {
        if (!res.data.session) {
          client.auth.signInAnonymously().catch(function (e) {
            console.warn("Ranking: anonymous sign-in failed", e);
          });
        }
      });

      refreshTop();
      client
        .channel("rankings-changes")
        .on("postgres_changes", { event: "*", schema: "public", table: "rankings" }, refreshTop)
        .subscribe();

      global.setInterval(trySync, SYNC_INTERVAL_MS);
      global.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "hidden") trySync();
      });
      global.addEventListener("pagehide", trySync);
    } catch (e) {
      console.warn("Ranking: failed to initialize Supabase", e);
      status = "disabled";
    }
  }

  init();

  global.Ranking = {
    getNickname: getNickname,
    setNickname: setNickname,
    getMyUid: getMyUid,
    getStatus: getStatus,
    subscribeTop: subscribeTop,
  };
})(window);
