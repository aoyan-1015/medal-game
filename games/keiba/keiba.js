(function () {
  renderHeader({ homeHref: "../../index.html" });

  var HORSE_DEFS = [
    { name: "クリムゾンブレイズ", color: "#ff5d6c" },
    { name: "ゴールドラッシュ", color: "#ffcf4d" },
    { name: "アズールソニック", color: "#6ea8ff" },
    { name: "エメラルドダッシュ", color: "#57e389" },
    { name: "バイオレットストーム", color: "#c17dff" },
    { name: "シルバーブレット", color: "#c9d3ee" },
  ];

  var BASE_SPEED = 9; // percent per second, average (slower = longer races, more room for commentary)

  var COURSE_DEFS = [
    { name: "スプリント", distance: 1200, speedWeight: 0.8, staminaWeight: 0.2, speedMult: 1.12 },
    { name: "マイル", distance: 1600, speedWeight: 0.55, staminaWeight: 0.45, speedMult: 1.0 },
    { name: "中距離", distance: 2000, speedWeight: 0.4, staminaWeight: 0.6, speedMult: 0.92 },
    { name: "長距離", distance: 2400, speedWeight: 0.22, staminaWeight: 0.78, speedMult: 0.85 },
  ];
  var UPSET_CHANCE = 0.12;
  var UPSET_BOOST = 1.9;

  var SURFACE_DEFS = [
    { key: "turf", name: "芝", icon: "🌱" },
    { key: "dirt", name: "ダート", icon: "🟤" },
  ];
  var WEATHER_DEFS = [
    { key: "sunny", name: "晴れ", icon: "☀️" },
    { key: "cloudy", name: "曇り", icon: "☁️" },
    { key: "rain", name: "雨", icon: "☔" },
  ];
  var TRACK_CONDITIONS = {
    good: { key: "good", name: "良", speedMult: 1.0 },
    yielding: { key: "yielding", name: "稍重", speedMult: 0.97 },
    soft: { key: "soft", name: "重", speedMult: 0.93 },
    heavy: { key: "heavy", name: "不良", speedMult: 0.88 },
  };

  var surface = SURFACE_DEFS[0];
  var weather = WEATHER_DEFS[0];
  var trackCondition = TRACK_CONDITIONS.good;

  function rollWeatherAndCondition() {
    weather = WEATHER_DEFS[Math.floor(Math.random() * WEATHER_DEFS.length)];
    var r = Math.random();
    if (weather.key === "rain") {
      trackCondition = r < 0.35 ? TRACK_CONDITIONS.yielding : r < 0.75 ? TRACK_CONDITIONS.soft : TRACK_CONDITIONS.heavy;
    } else if (weather.key === "cloudy") {
      trackCondition = r < 0.8 ? TRACK_CONDITIONS.good : TRACK_CONDITIONS.yielding;
    } else {
      trackCondition = r < 0.92 ? TRACK_CONDITIONS.good : TRACK_CONDITIONS.yielding;
    }
  }

  var BET_TYPES = {
    tan: {
      label: "単勝",
      pickCount: 1,
      ordered: false,
      edge: 0.82,
      oddsMin: 1.2,
      oddsMax: 20,
      hint: "1頭選んでください（1着を的中）",
    },
    fuku: {
      label: "複勝",
      pickCount: 1,
      ordered: false,
      edge: 0.85,
      oddsMin: 1.1,
      oddsMax: 6,
      hint: "1頭選んでください（2着以内で的中）",
    },
    umafuku: {
      label: "馬複",
      pickCount: 2,
      ordered: false,
      edge: 0.78,
      oddsMin: 1.3,
      oddsMax: 40,
      hint: "2頭選んでください（順不同・2頭とも3着以内で的中）",
    },
    umaren: {
      label: "馬連",
      pickCount: 2,
      ordered: false,
      edge: 0.75,
      oddsMin: 1.5,
      oddsMax: 70,
      hint: "2頭選んでください（順不同・2頭で1～2着を独占すると的中）",
    },
    sanrenpuku: {
      label: "3連複",
      pickCount: 3,
      ordered: false,
      edge: 0.72,
      oddsMin: 2,
      oddsMax: 200,
      hint: "3頭選んでください（順不同・3頭で1～3着を独占すると的中）",
    },
    sanrentan: {
      label: "3連単",
      pickCount: 3,
      ordered: true,
      edge: 0.65,
      oddsMin: 3,
      oddsMax: 500,
      hint: "3頭を着順の予想順にクリックしてください（1着→2着→3着で的中）",
    },
  };

  var course = COURSE_DEFS[0];
  var upsetId = -1;
  var oddsSim = null;
  var betType = "tan";
  var lockedOdds = 0;
  var courseInfoEl = document.getElementById("course-info");
  var trackMetaEl = document.getElementById("track-meta");
  var commentaryBoxEl = document.getElementById("commentary-box");
  var commentaryMuteBtn = document.getElementById("commentary-mute-btn");
  var horseListEl = document.getElementById("horse-list");
  var betTypeRowEl = document.getElementById("bet-type-row");
  var betTypeHintEl = document.getElementById("bet-type-hint");
  var betChipsEl = document.getElementById("bet-chips");
  var summaryEl = document.getElementById("selection-summary");
  var startBtn = document.getElementById("start-btn");
  var statusEl = document.getElementById("race-status");
  var resultPanel = document.getElementById("result-panel");
  var resultList = document.getElementById("result-list");
  var payoutMessage = document.getElementById("payout-message");
  var againBtn = document.getElementById("again-btn");

  var horses = [];
  var selectedIds = [];
  var betAmount = 0;
  var racing = false;
  var rafId = null;
  var lastTs = null;
  var rankCounter = 0;

  var race3d = createRace3D(document.getElementById("track3d"), HORSE_DEFS);

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function randomStat() {
    return 0.6 + Math.random() * 0.4;
  }

  function markFor(value) {
    if (value >= 0.9) return { symbol: "◎", cls: "mark-double" };
    if (value >= 0.78) return { symbol: "○", cls: "mark-circle" };
    if (value >= 0.66) return { symbol: "△", cls: "mark-triangle" };
    return { symbol: "－", cls: "mark-blank" };
  }

  function makeHorses() {
    var raw = HORSE_DEFS.map(function () {
      var speedStat = randomStat();
      var staminaStat = randomStat();
      var conditionStat = randomStat();
      var turfStat = randomStat();
      var dirtStat = randomStat();
      var surfaceStat = surface.key === "turf" ? turfStat : dirtStat;
      var courseFit = speedStat * course.speedWeight + staminaStat * course.staminaWeight;
      return {
        speedStat: speedStat,
        staminaStat: staminaStat,
        conditionStat: conditionStat,
        surfaceStat: surfaceStat,
        strength: courseFit * conditionStat * surfaceStat,
      };
    });
    var totalStrength = raw.reduce(function (a, b) {
      return a + b.strength;
    }, 0);

    horses = HORSE_DEFS.map(function (def, i) {
      var r = raw[i];
      var prob = r.strength / totalStrength;
      var odds = clamp(Math.round((1 / prob) * 0.82 * 10) / 10, 1.2, 20);
      return {
        id: i,
        name: def.name,
        color: def.color,
        strength: r.strength,
        jitterHalf: 0.65 - 0.35 * r.staminaStat,
        speedMark: markFor(r.speedStat),
        staminaMark: markFor(r.staminaStat),
        conditionMark: markFor(r.conditionStat),
        surfaceMark: markFor(r.surfaceStat),
        odds: odds,
        pos: 0,
        finished: false,
        rank: null,
      };
    });
  }

  // Runs many quick mock races (strength + a single per-race jitter roll) to
  // estimate how often each horse/combination finishes in the money. This
  // powers the odds for every bet type without needing a closed-form formula
  // for exacta/trifecta-style probabilities.
  function runOddsSimulation(horsesList, iterations) {
    iterations = iterations || 4000;
    var n = horsesList.length;
    var winCount = new Array(n).fill(0);
    var top2Count = new Array(n).fill(0);
    var top3Count = new Array(n).fill(0);
    var umarenCount = {};
    var wideCount = {};
    var trioCount = {};
    var trifectaCount = {};
    var strengths = horsesList.map(function (h) {
      return h.strength;
    });

    function pairKey(a, b) {
      return a < b ? a + "-" + b : b + "-" + a;
    }
    function trioKeyOf(arr) {
      return arr.slice().sort(function (a, b) {
        return a - b;
      }).join("-");
    }

    for (var it = 0; it < iterations; it++) {
      var scored = [];
      for (var i = 0; i < n; i++) {
        scored.push({ id: i, score: strengths[i] * (0.5 + Math.random() * 1.0) });
      }
      scored.sort(function (a, b) {
        return b.score - a.score;
      });
      var order = scored.map(function (s) {
        return s.id;
      });

      winCount[order[0]]++;
      top2Count[order[0]]++;
      top2Count[order[1]]++;
      top3Count[order[0]]++;
      top3Count[order[1]]++;
      top3Count[order[2]]++;

      var uk = pairKey(order[0], order[1]);
      umarenCount[uk] = (umarenCount[uk] || 0) + 1;

      var top3 = [order[0], order[1], order[2]];
      for (var p = 0; p < 3; p++) {
        for (var q = p + 1; q < 3; q++) {
          var wk = pairKey(top3[p], top3[q]);
          wideCount[wk] = (wideCount[wk] || 0) + 1;
        }
      }
      var tk = trioKeyOf(top3);
      trioCount[tk] = (trioCount[tk] || 0) + 1;

      var fk = order[0] + "-" + order[1] + "-" + order[2];
      trifectaCount[fk] = (trifectaCount[fk] || 0) + 1;
    }

    return {
      iterations: iterations,
      winProb: winCount.map(function (c) {
        return c / iterations;
      }),
      top2Prob: top2Count.map(function (c) {
        return c / iterations;
      }),
      wideProb: function (a, b) {
        return (wideCount[pairKey(a, b)] || 0) / iterations;
      },
      umarenProb: function (a, b) {
        return (umarenCount[pairKey(a, b)] || 0) / iterations;
      },
      trioProb: function (a, b, c) {
        return (trioCount[trioKeyOf([a, b, c])] || 0) / iterations;
      },
      trifectaProb: function (a, b, c) {
        return (trifectaCount[a + "-" + b + "-" + c] || 0) / iterations;
      },
    };
  }

  function comboOdds(type, ids) {
    var def = BET_TYPES[type];
    var prob;
    if (type === "tan") prob = oddsSim.winProb[ids[0]];
    else if (type === "fuku") prob = oddsSim.top2Prob[ids[0]];
    else if (type === "umafuku") prob = oddsSim.wideProb(ids[0], ids[1]);
    else if (type === "umaren") prob = oddsSim.umarenProb(ids[0], ids[1]);
    else if (type === "sanrenpuku") prob = oddsSim.trioProb(ids[0], ids[1], ids[2]);
    else if (type === "sanrentan") prob = oddsSim.trifectaProb(ids[0], ids[1], ids[2]);
    if (!prob || prob <= 0) prob = 1 / oddsSim.iterations;
    return clamp(Math.round((1 / prob) * def.edge * 10) / 10, def.oddsMin, def.oddsMax);
  }

  function checkWin(type, ids) {
    if (type === "tan") return horses[ids[0]].rank === 1;
    if (type === "fuku") return horses[ids[0]].rank <= 2;
    if (type === "umafuku" || type === "sanrenpuku") {
      return ids.every(function (id) {
        return horses[id].rank <= 3;
      });
    }
    if (type === "umaren") {
      return ids.every(function (id) {
        return horses[id].rank <= 2;
      });
    }
    if (type === "sanrentan") {
      return horses[ids[0]].rank === 1 && horses[ids[1]].rank === 2 && horses[ids[2]].rank === 3;
    }
    return false;
  }

  function renderMark(label, mark) {
    return (
      '<span class="mark ' + mark.cls + '"><span class="mark-label">' + label + "</span>" + mark.symbol + "</span>"
    );
  }

  function renderHorseList() {
    horseListEl.innerHTML = "";
    var def = BET_TYPES[betType];
    horses.forEach(function (h) {
      var pickIdx = selectedIds.indexOf(h.id);
      var card = document.createElement("div");
      card.className = "horse-card" + (pickIdx !== -1 ? " selected" : "");
      var badge = pickIdx !== -1 && def.pickCount > 1 ? '<span class="pick-badge">' + (pickIdx + 1) + "</span>" : "";
      card.innerHTML =
        badge +
        '<span class="dot" style="background:' + h.color + '"></span>' +
        '<span class="name">' + h.name + "</span>" +
        '<span class="ratings">' +
        renderMark("速", h.speedMark) +
        renderMark("ス", h.staminaMark) +
        renderMark("調", h.conditionMark) +
        renderMark(surface.key === "turf" ? "芝" : "土", h.surfaceMark) +
        "</span>" +
        '<span class="odds">' + h.odds.toFixed(1) + "倍</span>";
      card.addEventListener("click", function () {
        selectHorse(h);
      });
      horseListEl.appendChild(card);
    });
  }

  function selectHorse(h) {
    if (racing) return;
    var def = BET_TYPES[betType];
    var idx = selectedIds.indexOf(h.id);
    if (idx !== -1) {
      selectedIds.splice(idx, 1);
    } else if (selectedIds.length >= def.pickCount) {
      if (def.pickCount === 1) {
        selectedIds = [h.id];
      } else {
        return;
      }
    } else {
      selectedIds.push(h.id);
    }
    renderHorseList();
    updateSummary();
  }

  function updateSummary() {
    var bal = MedalBank.getBalance();
    var def = BET_TYPES[betType];
    if (selectedIds.length < def.pickCount || betAmount <= 0) {
      var remain = def.pickCount - selectedIds.length;
      summaryEl.textContent =
        remain > 0
          ? "あと" + remain + "頭選んでください（所持: " + bal.toLocaleString() + " 枚）"
          : "ベット額を選んでください（所持: " + bal.toLocaleString() + " 枚）";
      startBtn.disabled = true;
      return;
    }
    var odds = comboOdds(betType, selectedIds);
    var payout = Math.round(betAmount * odds);
    var namesText = selectedIds
      .map(function (id) {
        return horses[id].name;
      })
      .join(def.ordered ? "→" : "・");
    summaryEl.textContent =
      namesText +
      "（" + def.label + "）に " +
      betAmount.toLocaleString() +
      " 枚 → 的中で " +
      payout.toLocaleString() +
      " 枚獲得（予想" + odds.toFixed(1) + "倍）";
    startBtn.disabled = betAmount > bal || racing;
  }

  betTypeRowEl.addEventListener("click", function (e) {
    var btn = e.target.closest(".bet-type-chip");
    if (!btn || racing) return;
    betType = btn.dataset.type;
    Array.from(betTypeRowEl.children).forEach(function (c) {
      c.classList.remove("active");
    });
    btn.classList.add("active");
    selectedIds = [];
    betTypeHintEl.textContent = BET_TYPES[betType].hint;
    renderHorseList();
    updateSummary();
  });

  betChipsEl.addEventListener("click", function (e) {
    var btn = e.target.closest(".chip");
    if (!btn || racing) return;
    Array.from(betChipsEl.children).forEach(function (c) {
      c.classList.remove("active");
    });
    btn.classList.add("active");
    var amount = btn.dataset.amount;
    betAmount = amount === "max" ? MedalBank.getBalance() : parseInt(amount, 10);
    updateSummary();
  });

  startBtn.addEventListener("click", function () {
    var def = BET_TYPES[betType];
    if (selectedIds.length < def.pickCount || betAmount <= 0 || racing) return;
    if (!MedalBank.spend(betAmount, "競馬:賭け")) {
      updateSummary();
      return;
    }
    ensureCrowdAudio();
    lockedOdds = comboOdds(betType, selectedIds);
    runRace();
  });

  againBtn.addEventListener("click", function () {
    resultPanel.classList.add("hidden");
    selectedIds = [];
    betAmount = 0;
    Array.from(betChipsEl.children).forEach(function (c) {
      c.classList.remove("active");
    });
    newRace();
  });

  function rollUpset() {
    if (Math.random() >= UPSET_CHANCE) return -1;
    // Weight the pick toward the weaker horses so the upset feels like a
    // genuine underdog surprise rather than a coin flip among all runners.
    var weights = horses.map(function (h) {
      return 1 / (h.strength + 0.05);
    });
    var total = weights.reduce(function (a, b) {
      return a + b;
    }, 0);
    var r = Math.random() * total;
    for (var i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) return horses[i].id;
    }
    return horses[horses.length - 1].id;
  }

  // ---------------------------------------------------------------------
  // Voice + text commentary (実況). Uses the browser's built-in Web Speech
  // API for narration instead of audio files, and a text caption box so the
  // call-outs are readable even with sound off.
  // ---------------------------------------------------------------------
  var COMMENTARY_MUTE_KEY = "medalCasino.keibaCommentaryMuted";
  var commentaryMuted = localStorage.getItem(COMMENTARY_MUTE_KEY) === "1";
  var commentaryStages = [];
  var commentaryFired = {};

  function updateCommentaryMuteBtn() {
    if (!commentaryMuteBtn) return;
    commentaryMuteBtn.textContent = commentaryMuted ? "🔇" : "🔊";
  }
  updateCommentaryMuteBtn();

  if (commentaryMuteBtn) {
    commentaryMuteBtn.addEventListener("click", function () {
      commentaryMuted = !commentaryMuted;
      localStorage.setItem(COMMENTARY_MUTE_KEY, commentaryMuted ? "1" : "0");
      updateCommentaryMuteBtn();
      if (commentaryMuted) {
        if (window.speechSynthesis) speechSynthesis.cancel();
        stopAmbientCrowd();
      } else if (racing) {
        ensureCrowdAudio();
        startAmbientCrowd();
      }
    });
  }

  // Pick the most natural-sounding installed Japanese voice we can find.
  // Plain offline TTS voices default to a flat, robotic cadence; "Natural"/
  // "Neural"/"Online" voices (Edge/Windows, or Google's network voices) sound
  // far closer to a real announcer, so prefer those when present.
  var preferredVoice = null;
  function pickJaVoice() {
    if (!window.speechSynthesis) return null;
    var voices = speechSynthesis.getVoices() || [];
    var ja = voices.filter(function (v) {
      return v.lang && v.lang.toLowerCase().indexOf("ja") === 0;
    });
    if (!ja.length) return null;
    var natural = ja.find(function (v) {
      return /natural|neural|enhanced/i.test(v.name);
    });
    if (natural) return natural;
    var online = ja.find(function (v) {
      return v.localService === false;
    });
    if (online) return online;
    return ja[0];
  }
  // A second, distinct voice for crowd shouts so they sound like a
  // different person than the announcer rather than the same voice talking
  // to itself.
  var crowdVoice = null;
  function pickCrowdVoice() {
    if (!window.speechSynthesis) return null;
    var voices = speechSynthesis.getVoices() || [];
    var ja = voices.filter(function (v) {
      return v.lang && v.lang.toLowerCase().indexOf("ja") === 0;
    });
    if (!ja.length) return null;
    var male = ja.find(function (v) {
      return /ichiro|male|男/i.test(v.name) && (!preferredVoice || v.name !== preferredVoice.name);
    });
    if (male) return male;
    var different = ja.find(function (v) {
      return !preferredVoice || v.name !== preferredVoice.name;
    });
    return different || ja[0];
  }
  if (window.speechSynthesis) {
    preferredVoice = pickJaVoice();
    crowdVoice = pickCrowdVoice();
    speechSynthesis.onvoiceschanged = function () {
      preferredVoice = pickJaVoice();
      crowdVoice = pickCrowdVoice();
    };
  }

  var CROWD_SHOUTS_LOW = ["わー！", "おー！"];
  var CROWD_SHOUTS_MID = ["いけー！", "がんばれー！", "そのままー！"];
  var CROWD_SHOUTS_HIGH = ["いけーっ！", "うおおー！", "きたー！"];

  // Deliberately does NOT cancel the current speech queue: this is scheduled
  // to queue in just after the announcer's own line (see the 30ms delay vs.
  // say()'s 15ms), so the crowd reacts right after the commentary instead of
  // talking over it or replacing it.
  function shoutCrowd(excitement) {
    if (commentaryMuted || !window.speechSynthesis) return;
    try {
      var pool = excitement >= 0.85 ? CROWD_SHOUTS_HIGH : excitement >= 0.55 ? CROWD_SHOUTS_MID : CROWD_SHOUTS_LOW;
      var text = pool[Math.floor(Math.random() * pool.length)];
      setTimeout(function () {
        var u = new SpeechSynthesisUtterance(text);
        u.lang = "ja-JP";
        if (crowdVoice) u.voice = crowdVoice;
        u.rate = 1.15 + excitement * 0.3 + (Math.random() - 0.5) * 0.1;
        u.pitch = 1.1 + excitement * 0.25 + (Math.random() - 0.5) * 0.1;
        u.volume = 0.85;
        speechSynthesis.speak(u);
      }, 30);
    } catch (e) {}
  }

  // excitement (0-1) drives rate/pitch so the delivery rises toward the
  // finish like a real announcer instead of reading every line in the same
  // flat monotone. A small random jitter is layered on top of that so back
  // to back lines never sound identically robotic either.
  function say(text, excitement) {
    if (excitement === undefined) excitement = 0.5;
    if (commentaryBoxEl) commentaryBoxEl.textContent = text;
    if (commentaryMuted || !window.speechSynthesis) return;
    try {
      // Interrupt whatever's still playing instead of queuing after it, so
      // the commentary always tracks the current moment on screen rather
      // than falling further and further behind as a race goes on.
      speechSynthesis.cancel();
      setTimeout(function () {
        var u = new SpeechSynthesisUtterance(text);
        u.lang = "ja-JP";
        if (preferredVoice) u.voice = preferredVoice;
        var jitter = (Math.random() - 0.5) * 0.07;
        u.rate = 0.96 + excitement * 0.22 + jitter;
        u.pitch = 0.94 + excitement * 0.18 + jitter;
        speechSynthesis.speak(u);
      }, 15);
    } catch (e) {}
  }

  // ---------------------------------------------------------------------
  // Crowd cheering (声援). Synthesized from filtered noise bursts via Web
  // Audio (no audio files in this project), layered under the voice
  // commentary: a quiet ambient murmur while the race runs, plus swelling
  // cheers timed to the same excitement level as each commentary line.
  // ---------------------------------------------------------------------
  var audioCtx = null;
  var crowdMasterGain = null;
  var crowdNoiseBuffer = null;
  var ambientCrowdSource = null;
  var ambientCrowdGain = null;

  function makeNoiseBuffer(seconds) {
    var length = Math.floor(audioCtx.sampleRate * seconds);
    var buffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function ensureCrowdAudio() {
    if (audioCtx) {
      if (audioCtx.state === "suspended") audioCtx.resume();
      return;
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      audioCtx = new AC();
      if (audioCtx.state === "suspended") audioCtx.resume();
      crowdMasterGain = audioCtx.createGain();
      crowdMasterGain.gain.value = 1;
      crowdMasterGain.connect(audioCtx.destination);
      crowdNoiseBuffer = makeNoiseBuffer(2);
    } catch (e) {
      audioCtx = null;
    }
  }

  function startAmbientCrowd() {
    if (!audioCtx || commentaryMuted) return;
    stopAmbientCrowd();
    try {
      var src = audioCtx.createBufferSource();
      src.buffer = crowdNoiseBuffer;
      src.loop = true;
      var filter = audioCtx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 450;
      filter.Q.value = 0.6;
      var gain = audioCtx.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(crowdMasterGain);
      src.start();
      gain.gain.linearRampToValueAtTime(0.1, audioCtx.currentTime + 1.5);
      ambientCrowdSource = src;
      ambientCrowdGain = gain;
    } catch (e) {}
  }

  function stopAmbientCrowd() {
    if (!ambientCrowdSource) return;
    try {
      var t = audioCtx.currentTime;
      ambientCrowdGain.gain.cancelScheduledValues(t);
      ambientCrowdGain.gain.setValueAtTime(ambientCrowdGain.gain.value, t);
      ambientCrowdGain.gain.linearRampToValueAtTime(0, t + 0.4);
      var src = ambientCrowdSource;
      setTimeout(function () {
        try {
          src.stop();
        } catch (e) {}
      }, 500);
    } catch (e) {}
    ambientCrowdSource = null;
    ambientCrowdGain = null;
  }

  // intensity (0-1) shapes both loudness and how "bright"/excited the noise
  // band sounds, so quiet polite applause and a full roar use the same code
  // path with different parameters.
  function playCheer(intensity, duration) {
    if (!audioCtx || commentaryMuted || !crowdNoiseBuffer) return;
    try {
      var src = audioCtx.createBufferSource();
      src.buffer = crowdNoiseBuffer;
      var filter = audioCtx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 800 + intensity * 900 + Math.random() * 200;
      filter.Q.value = 0.5 + Math.random() * 0.3;
      var gain = audioCtx.createGain();
      var t0 = audioCtx.currentTime;
      var peak = 0.28 * intensity + 0.08;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(peak, t0 + duration * 0.2);
      gain.gain.linearRampToValueAtTime(peak * 0.55, t0 + duration * 0.6);
      gain.gain.linearRampToValueAtTime(0, t0 + duration);
      src.connect(filter).connect(gain).connect(crowdMasterGain);
      src.start(t0);
      src.stop(t0 + duration + 0.05);
    } catch (e) {}
  }

  function renderTrackMeta() {
    if (!trackMetaEl) return;
    trackMetaEl.innerHTML =
      '<span class="meta-badge surface-' + surface.key + '">' + surface.icon + " " + surface.name + "</span>" +
      '<span class="meta-badge weather-' + weather.key + '">' + weather.icon + " " + weather.name + "</span>" +
      '<span class="meta-badge condition-' + trackCondition.key + '">馬場：' + trackCondition.name + "</span>";
  }

  function newRace() {
    course = COURSE_DEFS[Math.floor(Math.random() * COURSE_DEFS.length)];
    courseInfoEl.textContent = "🏟️ 今回のコース：" + course.name + "（" + course.distance + "m）";
    surface = SURFACE_DEFS[Math.floor(Math.random() * SURFACE_DEFS.length)];
    rollWeatherAndCondition();
    renderTrackMeta();
    race3d.setSurface(surface.key);
    race3d.setWeather(weather.key);
    makeHorses();
    upsetId = rollUpset();
    oddsSim = runOddsSimulation(horses);
    betTypeHintEl.textContent = BET_TYPES[betType].hint;
    renderHorseList();
    race3d.resetPositions();
    updateSummary();
    statusEl.textContent = "";
    if (commentaryBoxEl) commentaryBoxEl.textContent = "🎙️ 出走準備中…";
  }

  function runRace() {
    racing = true;
    rankCounter = 0;
    lastTs = null;
    statusEl.textContent = "🏁 レース中...";
    startBtn.disabled = true;
    document.querySelectorAll(".horse-card").forEach(function (c) {
      c.style.pointerEvents = "none";
    });
    race3d.setRacing(true);

    if (window.speechSynthesis) speechSynthesis.cancel();
    commentaryStages = [
      { pct: 0, msg: "🚩 さあ、" + course.name + "、" + surface.name + "、馬場状態は" + trackCondition.name + "。ゲートが開きました！" },
      { pct: 35, msg: null },
      { pct: 65, msg: null },
      { pct: 88, msg: null },
    ];
    commentaryFired = {};
    say(commentaryStages[0].msg, 0.4);
    commentaryFired[0] = true;
    startAmbientCrowd();
    playCheer(0.35, 1.4);
    shoutCrowd(0.35);

    rafId = requestAnimationFrame(step);
  }

  function step(ts) {
    if (lastTs === null) lastTs = ts;
    var dt = ts - lastTs;
    lastTs = ts;
    var allDone = true;

    horses.forEach(function (h) {
      if (h.finished) return;
      allDone = false;
      var jitter = 0.5 + Math.random() * 1.0;
      var boost = h.id === upsetId ? UPSET_BOOST : 1;
      h.pos += BASE_SPEED * course.speedMult * trackCondition.speedMult * h.strength * jitter * boost * (dt / 1000);
      if (h.pos >= 100) {
        h.pos = 100;
        h.finished = true;
        rankCounter += 1;
        h.rank = rankCounter;
      }
    });
    race3d.setPositions(horses);

    var maxPos = 0;
    var leader = horses[0];
    horses.forEach(function (h) {
      if (h.pos > maxPos) {
        maxPos = h.pos;
        leader = h;
      }
    });
    var midMsgs = [
      null,
      { text: "動き出しました、先頭は" + leader.name + "！", excitement: 0.5 },
      { text: "中盤に差し掛かりました、先頭は" + leader.name + "！", excitement: 0.62 },
      { text: "おっと、最後の直線です！先頭は" + leader.name + "！", excitement: 0.82 },
    ];
    commentaryStages.forEach(function (stage, si) {
      if (si === 0 || commentaryFired[si]) return;
      if (maxPos >= stage.pct) {
        commentaryFired[si] = true;
        say(midMsgs[si].text, midMsgs[si].excitement);
        playCheer(midMsgs[si].excitement, 1.2 + midMsgs[si].excitement);
        shoutCrowd(midMsgs[si].excitement);
      }
    });

    if (!allDone) {
      rafId = requestAnimationFrame(step);
    } else {
      finishRace();
    }
  }

  function finishRace() {
    racing = false;
    statusEl.textContent = "";
    race3d.setRacing(false);
    document.querySelectorAll(".horse-card").forEach(function (c) {
      c.style.pointerEvents = "";
    });

    var ranked = horses.slice().sort(function (a, b) {
      return a.rank - b.rank;
    });

    if (window.speechSynthesis) speechSynthesis.cancel();
    stopAmbientCrowd();
    var winner = ranked[0];
    var winUpsetTag = winner.id === upsetId ? " 大波乱です！" : "";
    var finishExcitement = winner.id === upsetId ? 1.0 : 0.92;
    say("🏆 決まった！ゴール！1着は" + winner.name + "！" + winUpsetTag, finishExcitement);
    playCheer(finishExcitement, 2.6);
    shoutCrowd(finishExcitement);

    resultList.innerHTML = "";
    ranked.forEach(function (h) {
      var li = document.createElement("li");
      var upsetTag = h.id === upsetId && h.rank === 1 ? " 🔥下剋上の大金星！" : "";
      li.textContent = h.name + "（" + h.odds.toFixed(1) + "倍）" + upsetTag;
      resultList.appendChild(li);
    });

    var def = BET_TYPES[betType];
    var pickedNames = selectedIds
      .map(function (id) {
        return horses[id].name;
      })
      .join(def.ordered ? "→" : "・");

    if (checkWin(betType, selectedIds)) {
      var payout = Math.round(betAmount * lockedOdds);
      MedalBank.add(payout, "競馬:払い戻し");
      var jpNote = "";
      if (betType === "sanrentan") {
        JPTickets.add(1);
        jpNote = " 🎫JP券+1";
      }
      payoutMessage.textContent =
        "🎉 " + pickedNames + "（" + def.label + "）的中！ " + payout.toLocaleString() + " 枚獲得！" + jpNote;
      payoutMessage.className = "payout-message win";
    } else {
      payoutMessage.textContent = "残念…" + pickedNames + "（" + def.label + "）は的中しませんでした。";
      payoutMessage.className = "payout-message lose";
    }

    resultPanel.classList.remove("hidden");
    // The result panel (and its "次のレースへ" button) sits below the 3D
    // track, easy to miss after a race — bring it into view automatically
    // instead of making the player go hunting/scrolling for it.
    resultPanel.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  MedalBank.subscribe(function () {
    if (!racing) updateSummary();
  });

  window.addEventListener("resize", function () {
    race3d.handleResize();
  });

  newRace();

  // ---------------------------------------------------------------------
  // 3D race visualization (Three.js). Pure presentation layer: it only
  // reads horse.pos (0-100) and draws accordingly. All race odds/physics
  // above are untouched.
  // ---------------------------------------------------------------------
  function createRace3D(container, defs) {
    var TRACK_LENGTH = 100;
    var LANE_WIDTH = 3.2;
    var laneCount = defs.length;
    var trackWidth = laneCount * LANE_WIDTH;

    var scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xcfe6ef, 60, 155);

    var camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);
    var camLookAt = new THREE.Vector3(0, 1.6, 20);
    var desiredCamZ = -14;
    var desiredTargetZ = 20;
    camera.position.set(0, 9, -14);
    camera.lookAt(camLookAt);

    var renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // Gradient sky dome instead of a flat color backdrop. Tone is swapped by
    // setWeather() below to match the day's weather.
    var sky = new THREE.Mesh(
      new THREE.SphereGeometry(220, 24, 16),
      new THREE.MeshBasicMaterial({ map: makeSkyTexture("sunny"), side: THREE.BackSide, fog: false })
    );
    scene.add(sky);

    var cloudTex = makeCloudTexture();
    for (var ci = 0; ci < 6; ci++) {
      var cloudMat = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.85, fog: false });
      var cloud = new THREE.Sprite(cloudMat);
      var cSize = 14 + Math.random() * 10;
      cloud.scale.set(cSize, cSize * 0.5, 1);
      cloud.position.set((Math.random() - 0.5) * 150, 36 + Math.random() * 16, Math.random() * 150 - 20);
      scene.add(cloud);
    }

    var ambient = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambient);
    var sun = new THREE.DirectionalLight(0xfff3d6, 1.05);
    sun.position.set(30, 50, -12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -trackWidth / 2 - 20;
    sun.shadow.camera.right = trackWidth / 2 + 20;
    sun.shadow.camera.top = 60;
    sun.shadow.camera.bottom = -20;
    sun.shadow.camera.far = 160;
    scene.add(sun);

    var grassTex = makeGrassTexture();
    grassTex.repeat.set((trackWidth + 30) / 6, (TRACK_LENGTH + 60) / 6);
    var ground = new THREE.Mesh(
      new THREE.PlaneGeometry(trackWidth + 30, TRACK_LENGTH + 60),
      new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, TRACK_LENGTH / 2 - 10);
    ground.receiveShadow = true;
    scene.add(ground);

    // Track running surface: swappable between turf and dirt via setSurface().
    var turfTrackTex = makeTurfTrackTexture();
    var dirtTex = makeDirtTexture();
    [turfTrackTex, dirtTex].forEach(function (tex) {
      tex.repeat.set(trackWidth / 4, (TRACK_LENGTH + 24) / 8);
    });
    var trackMat = new THREE.MeshStandardMaterial({ map: dirtTex, roughness: 1 });
    var trackMesh = new THREE.Mesh(new THREE.PlaneGeometry(trackWidth, TRACK_LENGTH + 24), trackMat);
    trackMesh.rotation.x = -Math.PI / 2;
    trackMesh.position.set(0, 0.01, TRACK_LENGTH / 2 - 6);
    trackMesh.receiveShadow = true;
    scene.add(trackMesh);

    // Falling-rain particles, toggled visible by setWeather() when it rains.
    var RAIN_COUNT = 260;
    var rainSpan = 24;
    var rainSeeds = new Float32Array(RAIN_COUNT);
    var rainX = new Float32Array(RAIN_COUNT);
    var rainZ = new Float32Array(RAIN_COUNT);
    var rainGeo = new THREE.BufferGeometry();
    var rainPos = new Float32Array(RAIN_COUNT * 3);
    for (var ri = 0; ri < RAIN_COUNT; ri++) {
      rainX[ri] = (Math.random() - 0.5) * (trackWidth + 30);
      rainZ[ri] = Math.random() * (TRACK_LENGTH + 40) - 20;
      rainSeeds[ri] = Math.random() * rainSpan;
      rainPos[ri * 3] = rainX[ri];
      rainPos[ri * 3 + 1] = rainSeeds[ri];
      rainPos[ri * 3 + 2] = rainZ[ri];
    }
    rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
    var rainMat = new THREE.PointsMaterial({ color: 0xcfe3f5, size: 0.16, transparent: true, opacity: 0.65 });
    var rain = new THREE.Points(rainGeo, rainMat);
    rain.visible = false;
    scene.add(rain);

    for (var li = 1; li < laneCount; li++) {
      var lineMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.08, TRACK_LENGTH + 24),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.32 })
      );
      lineMesh.rotation.x = -Math.PI / 2;
      lineMesh.position.set(-trackWidth / 2 + li * LANE_WIDTH, 0.02, TRACK_LENGTH / 2 - 6);
      scene.add(lineMesh);
    }

    var finishMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(trackWidth, 2.2),
      new THREE.MeshBasicMaterial({ map: makeCheckerTexture(laneCount) })
    );
    finishMesh.rotation.x = -Math.PI / 2;
    finishMesh.position.set(0, 0.03, TRACK_LENGTH);
    scene.add(finishMesh);

    for (var gi = 0; gi < laneCount + 1; gi++) {
      var postX = -trackWidth / 2 + gi * LANE_WIDTH;
      var post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 1.6, 8),
        new THREE.MeshStandardMaterial({ color: 0xffffff })
      );
      post.position.set(postX, 0.8, -1.5);
      scene.add(post);
    }

    // White rail fencing along both edges of the track.
    function buildRail(xPos) {
      var group = new THREE.Group();
      var postMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e8 });
      var railMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
      var postCount = Math.ceil((TRACK_LENGTH + 24) / 4);
      for (var pi = 0; pi <= postCount; pi++) {
        var post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 6), postMat);
        post.position.set(xPos, 0.55, pi * 4 - 12);
        post.castShadow = true;
        group.add(post);
      }
      [0.55, 0.92].forEach(function (ry) {
        var rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, TRACK_LENGTH + 28), railMat);
        rail.position.set(xPos, ry, TRACK_LENGTH / 2 - 6);
        group.add(rail);
      });
      return group;
    }
    scene.add(buildRail(-trackWidth / 2 - 0.5));
    scene.add(buildRail(trackWidth / 2 + 0.5));

    // Distance marker poles down the backstretch.
    [20, 40, 60, 80].forEach(function (d) {
      var poleGroup = new THREE.Group();
      var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6), new THREE.MeshStandardMaterial({ color: 0xffffff }));
      pole.position.y = 1.1;
      poleGroup.add(pole);
      var sign = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.38, 0.05), new THREE.MeshStandardMaterial({ color: 0x1c2333 }));
      sign.position.set(0, 2.05, 0);
      poleGroup.add(sign);
      poleGroup.position.set(-trackWidth / 2 - 1.3, 0, d);
      scene.add(poleGroup);
    });

    // Grandstand full of spectators along one side, and trees along the other.
    var grandstand = buildGrandstand(TRACK_LENGTH * 0.7);
    grandstand.rotation.y = Math.PI / 2;
    grandstand.position.set(trackWidth / 2 + 9, 0, TRACK_LENGTH * 0.5);
    scene.add(grandstand);

    for (var ti = 0; ti < 8; ti++) {
      var tree = buildTree();
      var tz = -8 + ti * ((TRACK_LENGTH + 20) / 7);
      tree.position.set(-trackWidth / 2 - 6 - Math.random() * 5, 0, tz);
      tree.scale.setScalar(0.8 + Math.random() * 0.6);
      scene.add(tree);
    }

    var horseGroups = defs.map(function (def, i) {
      var g = buildHorseMesh(def.color);
      var laneX = -trackWidth / 2 + LANE_WIDTH * (i + 0.5);
      g.position.set(laneX, 0, 0);
      var label = buildLabelSprite(def.name);
      label.position.set(0, 2.9, 0);
      g.add(label);
      scene.add(g);
      return g;
    });

    function makeCoatTexture(color) {
      var size = 128;
      var canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      var ctx = canvas.getContext("2d");
      var base = new THREE.Color(color);
      ctx.fillStyle = "#" + base.getHexString();
      ctx.fillRect(0, 0, size, size);
      for (var i = 0; i < 500; i++) {
        var amt = (Math.random() - 0.5) * 0.14;
        ctx.fillStyle = "#" + shade(color, amt).getHexString();
        ctx.globalAlpha = 0.35;
        var x = Math.random() * size;
        var y = Math.random() * size;
        var r = 1.5 + Math.random() * 3.5;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      var tex = new THREE.CanvasTexture(canvas);
      return tex;
    }

    function buildHorseMesh(color) {
      var group = new THREE.Group();
      var coatTex = makeCoatTexture(color);
      var mat = new THREE.MeshStandardMaterial({ map: coatTex, roughness: 0.8 });
      var darkMat = new THREE.MeshStandardMaterial({ color: shade(color, -0.38), roughness: 0.8 });
      var maneMat = new THREE.MeshStandardMaterial({ color: shade(color, -0.55), roughness: 0.9 });
      var hoofMat = new THREE.MeshStandardMaterial({ color: 0x241b14, roughness: 0.5 });
      var sockMat = new THREE.MeshStandardMaterial({ color: 0xf5f2ea, roughness: 0.7 });
      var eyeMat = new THREE.MeshStandardMaterial({ color: 0x140f0a, roughness: 0.4 });

      // Torso: a tapered capsule barrel plus a chest bulge and haunch bulges,
      // so the silhouette reads as a deep chest / narrower rear rather than a
      // uniform tube.
      var body = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1.05, 6, 10), mat);
      body.rotation.x = Math.PI / 2;
      body.position.set(0, 1.32, -0.05);
      body.castShadow = true;
      body.receiveShadow = true;
      group.add(body);

      var chest = new THREE.Mesh(new THREE.SphereGeometry(0.38, 10, 8), mat);
      chest.scale.set(0.95, 1.05, 0.9);
      chest.position.set(0, 1.28, 0.6);
      chest.castShadow = true;
      group.add(chest);

      [-0.18, 0.18].forEach(function (hx) {
        var haunch = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), mat);
        haunch.scale.set(0.85, 1, 1.1);
        haunch.position.set(hx, 1.28, -0.68);
        haunch.castShadow = true;
        group.add(haunch);
      });

      // Neck: two capsule segments angled to approximate a natural arch/crest
      // instead of one straight strut.
      var neckLower = new THREE.Mesh(new THREE.CapsuleGeometry(0.27, 0.5, 4, 8), mat);
      neckLower.position.set(0, 1.66, 0.78);
      neckLower.rotation.x = -1.05;
      neckLower.castShadow = true;
      group.add(neckLower);

      var neckUpper = new THREE.Mesh(new THREE.CapsuleGeometry(0.21, 0.42, 4, 8), mat);
      neckUpper.position.set(0, 2.05, 1.22);
      neckUpper.rotation.x = -1.3;
      neckUpper.castShadow = true;
      group.add(neckUpper);

      // Head: skull capsule + a narrower, longer muzzle tube for a proper
      // equine profile, with nostril and eye detail.
      var skull = new THREE.Mesh(new THREE.CapsuleGeometry(0.155, 0.2, 4, 8), darkMat);
      skull.position.set(0, 2.34, 1.5);
      skull.rotation.x = -1.35;
      skull.castShadow = true;
      group.add(skull);

      var muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 0.42, 8), darkMat);
      muzzle.position.set(0, 2.18, 1.84);
      muzzle.rotation.x = 1.42;
      muzzle.castShadow = true;
      group.add(muzzle);

      var noseMat = new THREE.MeshStandardMaterial({ color: 0x1c1410, roughness: 0.5 });
      [-0.045, 0.045].forEach(function (nx) {
        var nostril = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), noseMat);
        nostril.position.set(nx, 2.12, 2.03);
        group.add(nostril);
      });

      [-0.1, 0.1].forEach(function (ex) {
        var eye = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 6), eyeMat);
        eye.position.set(ex, 2.4, 1.66);
        group.add(eye);
        var ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 6), darkMat);
        ear.position.set(ex * 1.05, 2.62, 1.36);
        ear.rotation.x = -0.3;
        ear.castShadow = true;
        group.add(ear);
      });

      // Mane: a row of small tapering fins running from the poll down the
      // crest of the neck.
      var manePts = [
        [2.55, 1.32], [2.42, 1.14], [2.28, 0.98], [2.14, 0.85], [1.98, 0.76], [1.82, 0.72],
      ];
      manePts.forEach(function (p, mi) {
        var mt = mi / (manePts.length - 1);
        var fin = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.24 - mt * 0.1, 0.16), maneMat);
        fin.position.set(0, p[0], p[1]);
        fin.rotation.x = -0.75 - mt * 0.3;
        group.add(fin);
      });
      var forelock = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 6), maneMat);
      forelock.position.set(0, 2.5, 1.58);
      forelock.rotation.x = 1.6;
      group.add(forelock);

      // Tail: a dock (base) plus three tapered, slightly curved cone segments.
      var tailGroup = new THREE.Group();
      tailGroup.position.set(0, 1.58, -1.02);
      var dock = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.16, 4, 6), mat);
      dock.rotation.x = Math.PI / 2.4;
      dock.position.set(0, -0.05, -0.05);
      tailGroup.add(dock);
      [0, 1, 2].forEach(function (ti) {
        var seg = new THREE.Mesh(new THREE.ConeGeometry(0.15 - ti * 0.04, 0.5, 6), maneMat);
        seg.position.set(0, -0.18 - ti * 0.4, -ti * 0.1);
        seg.rotation.x = Math.PI / 2.15 + ti * 0.1;
        tailGroup.add(seg);
      });
      group.add(tailGroup);

      // Legs: two segments (upper thigh/forearm + lower slender cannon) each
      // pivoted at their own joint, for a far more natural gallop silhouette
      // than a single rigid strut.
      var upperLegGeo = new THREE.CapsuleGeometry(0.115, 0.32, 4, 6);
      upperLegGeo.translate(0, -0.16, 0);
      var lowerLegGeo = new THREE.CapsuleGeometry(0.075, 0.4, 4, 6);
      lowerLegGeo.translate(0, -0.2, 0);
      var legPositions = [
        [-0.28, 0.6],
        [0.28, 0.6],
        [-0.26, -0.66],
        [0.26, -0.66],
      ];
      var legs = [];
      var knees = [];
      legPositions.forEach(function (p) {
        var hip = new THREE.Group();
        hip.position.set(p[0], 1.36, p[1]);
        var upperLeg = new THREE.Mesh(upperLegGeo, mat);
        upperLeg.castShadow = true;
        hip.add(upperLeg);

        var knee = new THREE.Group();
        knee.position.set(0, -0.32, 0);
        hip.add(knee);
        var lowerLeg = new THREE.Mesh(lowerLegGeo, sockMat);
        lowerLeg.castShadow = true;
        knee.add(lowerLeg);
        var hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.13, 6), hoofMat);
        hoof.position.set(0, -0.42, 0);
        knee.add(hoof);

        group.add(hip);
        legs.push(hip);
        knees.push(knee);
      });

      // Saddle + jockey silhouette.
      var saddle = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.14, 0.5),
        new THREE.MeshStandardMaterial({ color: 0x3b2415 })
      );
      saddle.position.set(0, 1.72, 0.1);
      group.add(saddle);

      var jockeyMat = new THREE.MeshStandardMaterial({ color: shade(color, 0.25) });
      var jockeyGroup = new THREE.Group();
      jockeyGroup.position.set(0, 1.82, 0);
      var torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.36, 4, 6), jockeyMat);
      torso.position.set(0, 0.34, 0);
      torso.rotation.x = -0.35;
      jockeyGroup.add(torso);
      var jHead = new THREE.Mesh(new THREE.SphereGeometry(0.135, 10, 8), new THREE.MeshStandardMaterial({ color: 0xe6b58c }));
      jHead.position.set(0, 0.66, -0.18);
      jockeyGroup.add(jHead);
      var cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.145, 10, 8, 0, Math.PI * 2, 0, Math.PI / 1.7),
        jockeyMat
      );
      cap.position.set(0, 0.7, -0.18);
      jockeyGroup.add(cap);
      group.add(jockeyGroup);

      group.userData.legs = legs;
      group.userData.knees = knees;
      group.userData.tail = tailGroup;
      group.userData.jockey = jockeyGroup;
      return group;
    }

    function shade(hexColor, amt) {
      var c = new THREE.Color(hexColor);
      var hsl = { h: 0, s: 0, l: 0 };
      c.getHSL(hsl);
      hsl.l = Math.max(0, Math.min(1, hsl.l + amt));
      c.setHSL(hsl.h, hsl.s, hsl.l);
      return c;
    }

    function roundRect(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    function buildLabelSprite(text) {
      var canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 64;
      var ctx = canvas.getContext("2d");
      ctx.fillStyle = "rgba(10,14,26,0.68)";
      roundRect(ctx, 4, 4, 248, 56, 14);
      ctx.fill();
      ctx.font = "bold 30px sans-serif";
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, 128, 33);
      var tex = new THREE.CanvasTexture(canvas);
      var mat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
      var sprite = new THREE.Sprite(mat);
      sprite.scale.set(2.6, 0.65, 1);
      return sprite;
    }

    function makeSkyTexture(tone) {
      var canvas = document.createElement("canvas");
      canvas.width = 32;
      canvas.height = 256;
      var ctx = canvas.getContext("2d");
      var grad = ctx.createLinearGradient(0, 0, 0, 256);
      if (tone === "rain") {
        grad.addColorStop(0, "#4b5568");
        grad.addColorStop(0.5, "#7c8896");
        grad.addColorStop(1, "#a7aeb2");
      } else if (tone === "cloudy") {
        grad.addColorStop(0, "#6d89ab");
        grad.addColorStop(0.5, "#a7bacb");
        grad.addColorStop(1, "#d7e0e3");
      } else {
        grad.addColorStop(0, "#3f7fd6");
        grad.addColorStop(0.45, "#8fc3ec");
        grad.addColorStop(0.75, "#d9ecf4");
        grad.addColorStop(1, "#eef7ea");
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 32, 256);
      var tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace || tex.colorSpace;
      return tex;
    }

    function makeCloudTexture() {
      var canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 64;
      var ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, 128, 64);
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      var blobs = [
        [40, 38, 22], [64, 30, 26], [88, 38, 20], [56, 44, 24], [78, 46, 18],
      ];
      blobs.forEach(function (b) {
        ctx.beginPath();
        ctx.arc(b[0], b[1], b[2], 0, Math.PI * 2);
        ctx.fill();
      });
      var tex = new THREE.CanvasTexture(canvas);
      return tex;
    }

    function makeGrassTexture() {
      var size = 128;
      var canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      var ctx = canvas.getContext("2d");
      ctx.fillStyle = "#5fa851";
      ctx.fillRect(0, 0, size, size);
      for (var i = 0; i < 900; i++) {
        var shade = 30 + Math.floor(Math.random() * 40);
        ctx.fillStyle = "rgba(" + (60 + shade * 0.3) + "," + (120 + shade) + "," + (55 + shade * 0.4) + ",0.5)";
        var x = Math.random() * size;
        var y = Math.random() * size;
        ctx.fillRect(x, y, 1.6, 1.6);
      }
      var tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      return tex;
    }

    function makeTurfTrackTexture() {
      var size = 128;
      var canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      var ctx = canvas.getContext("2d");
      for (var y = 0; y < size; y += 16) {
        ctx.fillStyle = (y / 16) % 2 === 0 ? "#4f9c47" : "#59ab50";
        ctx.fillRect(0, y, size, 16);
      }
      for (var i = 0; i < 500; i++) {
        var shade = 20 + Math.floor(Math.random() * 35);
        ctx.fillStyle = "rgba(" + (55 + shade * 0.3) + "," + (125 + shade) + "," + (55 + shade * 0.3) + ",0.4)";
        ctx.fillRect(Math.random() * size, Math.random() * size, 1.4, 1.4);
      }
      var tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      return tex;
    }

    function makeDirtTexture() {
      var size = 128;
      var canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      var ctx = canvas.getContext("2d");
      ctx.fillStyle = "#c8935f";
      ctx.fillRect(0, 0, size, size);
      for (var i = 0; i < 700; i++) {
        var v = Math.random();
        ctx.fillStyle = v < 0.5 ? "rgba(150,102,58,0.35)" : "rgba(224,178,132,0.35)";
        var x = Math.random() * size;
        var y = Math.random() * size;
        var r = 1 + Math.random() * 2;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      var tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      return tex;
    }

    function makeCrowdTexture() {
      // Higher-res canvas with actual head+shoulders figures (not just
      // colored dots) so spectators read as people up close, plus
      // occasional raised cheering arms for a livelier stand.
      var w = 512;
      var h = 128;
      var canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      var ctx = canvas.getContext("2d");
      ctx.fillStyle = "#333c4d";
      ctx.fillRect(0, 0, w, h);

      var shirtColors = ["#e07a5f", "#f2cc8f", "#81b29a", "#3d5a80", "#ee6c4d", "#e8e8e8", "#9d8189", "#f4a259", "#5c8ba8"];
      var skinColors = ["#e8b894", "#c98b60", "#8d5a3c", "#f0c9a0", "#a9714f"];
      var cols = 46;
      var rows = 5;
      var cw = w / cols;
      var rh = h / rows;
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          var cx = c * cw + cw / 2 + (Math.random() - 0.5) * cw * 0.5;
          var cy = r * rh + rh * 0.62 + (Math.random() - 0.5) * rh * 0.3;
          var scale = 0.75 + Math.random() * 0.5;
          var shirt = shirtColors[Math.floor(Math.random() * shirtColors.length)];
          var skin = skinColors[Math.floor(Math.random() * skinColors.length)];

          var raised = Math.random() < 0.35;
          if (raised) {
            ctx.strokeStyle = skin;
            ctx.lineWidth = 1.8 * scale;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(cx - 4.5 * scale, cy - 1 * scale);
            ctx.lineTo(cx - 7.5 * scale, cy - 11 * scale);
            ctx.moveTo(cx + 4.5 * scale, cy - 1 * scale);
            ctx.lineTo(cx + 7.5 * scale, cy - 11 * scale);
            ctx.stroke();
          }

          // Shoulders/torso.
          ctx.fillStyle = shirt;
          ctx.beginPath();
          ctx.ellipse(cx, cy, 5.2 * scale, 6 * scale, 0, 0, Math.PI * 2);
          ctx.fill();

          // Head.
          ctx.fillStyle = skin;
          ctx.beginPath();
          ctx.arc(cx, cy - 7.5 * scale, 3.4 * scale, 0, Math.PI * 2);
          ctx.fill();

          // A little hair so the head reads as a head, not a ball.
          ctx.fillStyle = "rgba(30,22,18,0.75)";
          ctx.beginPath();
          ctx.arc(cx, cy - 9 * scale, 3.4 * scale, Math.PI, Math.PI * 2);
          ctx.fill();
        }
      }
      var tex = new THREE.CanvasTexture(canvas);
      return tex;
    }

    function buildGrandstand(spanLength) {
      var group = new THREE.Group();
      var frameMat = new THREE.MeshStandardMaterial({ color: 0x8891a3 });
      var roofMat = new THREE.MeshStandardMaterial({ color: 0x2c3446 });
      var tierCount = 4;
      var depth = 6;
      var height = 5.5;
      for (var t = 0; t < tierCount; t++) {
        var tierDepth = depth - t * 1.1;
        var tierY = 0.6 + t * 1.3;
        var seat = new THREE.Mesh(new THREE.BoxGeometry(spanLength, 0.35, tierDepth), frameMat);
        seat.position.set(0, tierY, tierDepth / 2);
        seat.receiveShadow = true;
        seat.castShadow = true;
        group.add(seat);

        // Sit right at the field-facing edge (z=0) rather than partway
        // inside the seat box, and use DoubleSide so the crowd reads
        // regardless of which way the plane's default normal points once
        // this whole group gets rotated into place.
        var crowdMat = new THREE.MeshBasicMaterial({
          map: makeCrowdTexture(),
          transparent: true,
          side: THREE.DoubleSide,
        });
        var crowd = new THREE.Mesh(new THREE.PlaneGeometry(spanLength * 0.96, 1.15), crowdMat);
        crowd.position.set(0, tierY + 0.62, -0.05);
        group.add(crowd);
      }

      var roof = new THREE.Mesh(new THREE.BoxGeometry(spanLength + 1, 0.3, depth + 1.4), roofMat);
      roof.position.set(0, height, 0.3);
      roof.castShadow = true;
      group.add(roof);

      var postGeo = new THREE.CylinderGeometry(0.15, 0.15, height, 8);
      var postXs = [-spanLength / 2 + 0.6, 0, spanLength / 2 - 0.6];
      postXs.forEach(function (px) {
        var post = new THREE.Mesh(postGeo, frameMat);
        post.position.set(px, height / 2, depth / 2 + 0.6);
        group.add(post);
      });

      return group;
    }

    function buildTree() {
      var group = new THREE.Group();
      var trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a30 });
      var leafMat = new THREE.MeshStandardMaterial({ color: 0x3f8a4c });
      var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 2.2, 7), trunkMat);
      trunk.position.y = 1.1;
      trunk.castShadow = true;
      group.add(trunk);

      var blobs = [
        [0, 2.9, 0, 1.15],
        [0.55, 2.6, 0.2, 0.85],
        [-0.5, 2.5, -0.25, 0.85],
        [0, 3.5, 0.1, 0.8],
      ];
      blobs.forEach(function (b) {
        var leaf = new THREE.Mesh(new THREE.SphereGeometry(b[3], 8, 7), leafMat);
        leaf.position.set(b[0], b[1], b[2]);
        leaf.castShadow = true;
        group.add(leaf);
      });

      return group;
    }

    function makeCheckerTexture(repeatCount) {
      var size = 64;
      var canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      var ctx = canvas.getContext("2d");
      var cell = size / 8;
      for (var y = 0; y < 8; y++) {
        for (var x = 0; x < 8; x++) {
          ctx.fillStyle = (x + y) % 2 === 0 ? "#ffffff" : "#181c22";
          ctx.fillRect(x * cell, y * cell, cell, cell);
        }
      }
      var tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(repeatCount, 1);
      return tex;
    }

    var isRacing = false;

    function setRacing(flag) {
      isRacing = flag;
    }

    function resetPositions() {
      horseGroups.forEach(function (g) {
        g.position.z = 0;
      });
      desiredCamZ = -14;
      desiredTargetZ = 20;
      // Snap instantly between races instead of gliding in from wherever the
      // previous race's camera ended up.
      camera.position.set(0, 9, -14);
      camLookAt.set(0, 1.6, 20);
      camera.lookAt(camLookAt);
    }

    function setPositions(horseData) {
      var maxZ = 0;
      horseData.forEach(function (h) {
        var z = (h.pos / 100) * TRACK_LENGTH;
        horseGroups[h.id].position.z = z;
        if (z > maxZ) maxZ = z;
      });
      desiredCamZ = maxZ - 13;
      desiredTargetZ = maxZ + 16;
    }

    var clock = new THREE.Clock();

    function animate() {
      requestAnimationFrame(animate);
      var t = clock.getElapsedTime();

      if (rain.visible) {
        var posAttr = rainGeo.attributes.position;
        for (var ri2 = 0; ri2 < RAIN_COUNT; ri2++) {
          var y = rainSpan - ((t * 14 + rainSeeds[ri2]) % rainSpan);
          posAttr.array[ri2 * 3 + 1] = y;
        }
        posAttr.needsUpdate = true;
      }

      horseGroups.forEach(function (g, i) {
        if (isRacing) {
          var phase = t * 11 + i * 1.7;
          g.position.y = Math.max(0, Math.sin(phase)) * 0.12;
          g.userData.legs.forEach(function (pivot, li) {
            var sign = li === 0 || li === 3 ? 1 : -1;
            var swing = phase * sign;
            pivot.rotation.x = Math.sin(swing) * 0.6;
            // Knee tucks up while the leg is swinging forward (off the
            // ground) and straightens as it plants, like a real gallop.
            g.userData.knees[li].rotation.x = -Math.max(0, Math.sin(swing - 1.1)) * 1.1;
          });
          g.userData.tail.rotation.z = Math.sin(t * 8 + i) * 0.15;
        } else {
          g.position.y = 0;
          g.userData.legs.forEach(function (pivot, li) {
            pivot.rotation.x = 0;
            g.userData.knees[li].rotation.x = 0;
          });
        }
      });

      // Eased every render frame (not just when the race logic ticks), so the
      // camera keeps gliding into place even after the race has finished.
      camera.position.z += (desiredCamZ - camera.position.z) * 0.06;
      camLookAt.z += (desiredTargetZ - camLookAt.z) * 0.06;
      camera.lookAt(camLookAt);
      renderer.render(scene, camera);
    }

    function handleResize() {
      var w = container.clientWidth || 640;
      var h = container.clientHeight || 400;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }

    function setSurface(key) {
      trackMat.map = key === "turf" ? turfTrackTex : dirtTex;
      trackMat.needsUpdate = true;
    }

    function setWeather(key) {
      sky.material.map = makeSkyTexture(key);
      sky.material.needsUpdate = true;
      rain.visible = key === "rain";
      if (key === "rain") {
        sun.intensity = 0.55;
        ambient.intensity = 0.42;
        scene.fog.color.set(0x7c8896);
        scene.fog.near = 35;
        scene.fog.far = 100;
      } else if (key === "cloudy") {
        sun.intensity = 0.78;
        ambient.intensity = 0.5;
        scene.fog.color.set(0xaebccb);
        scene.fog.near = 50;
        scene.fog.far = 130;
      } else {
        sun.intensity = 1.05;
        ambient.intensity = 0.55;
        scene.fog.color.set(0xcfe6ef);
        scene.fog.near = 60;
        scene.fog.far = 155;
      }
    }

    handleResize();
    requestAnimationFrame(animate);

    return {
      resetPositions: resetPositions,
      setPositions: setPositions,
      setRacing: setRacing,
      handleResize: handleResize,
      setSurface: setSurface,
      setWeather: setWeather,
    };
  }
})();
