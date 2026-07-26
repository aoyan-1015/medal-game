(function () {
  renderHeader({ homeHref: "../../index.html" });

  var SYMBOLS = [
    { key: "cherry", icon: "🍒", weight: 4, mult: 3 },
    { key: "lemon", icon: "🍋", weight: 3, mult: 5 },
    { key: "bell", icon: "🔔", weight: 2, mult: 8 },
    { key: "star", icon: "⭐", weight: 2, mult: 15 },
    { key: "diamond", icon: "💎", weight: 1, mult: 30 },
    { key: "seven", icon: "7️⃣", weight: 1, mult: 100 },
  ];

  var CHANCE_SPINS = 50; // length of the GOGO window
  var CHANCE_TRIGGER_CHANCE = 0.05; // odds a normal spin opens the GOGO window
  var GLITCH_TRIGGER_CHANCE = 0.15; // the "プチ違和感" tell bumps this spin's odds to ~15%
  var BONUS_SPINS = 30; // guaranteed-win spins once 777 lands inside the GOGO window
  var PULL_IN_FRAMES = 4; // how many strip steps the GOGO assist can pull 777 into reach
  var STRIP_MULT = 3; // copies of each symbol per reel strip
  var TICK_MS = 110; // strip advance speed while spinning

  // Spin-start "予告演出" tiers. Weights sum to 100 and are read as percent.
  // Every tier is cosmetic flavor with no bearing on the outcome, except
  // "glitch" which quietly raises this spin's GOGO-trigger odds (see
  // GLITCH_TRIGGER_CHANCE above) to match its stated ~15% expectation.
  var TELL_TIERS = [
    { key: "normal", weight: 70 },
    { key: "lamp", weight: 12 },
    { key: "character", weight: 8 },
    { key: "navi", weight: 5 },
    { key: "mini", weight: 3 },
    { key: "glitch", weight: 1.5 },
    { key: "rare", weight: 0.5 },
  ];

  function buildStrip() {
    var strip = [];
    SYMBOLS.forEach(function (s) {
      for (var i = 0; i < s.weight * STRIP_MULT; i++) strip.push(s);
    });
    for (var i = strip.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = strip[i];
      strip[i] = strip[j];
      strip[j] = tmp;
    }
    return strip;
  }

  var betChipsEl = document.getElementById("bet-chips");
  var spinBtn = document.getElementById("spin-btn");
  var hintEl = document.getElementById("spin-hint");
  var betLockNoteEl = document.getElementById("bet-lock-note");
  var winMessageEl = document.getElementById("win-message");
  var paytableBody = document.getElementById("paytable-body");
  var paylineMarkerEl = document.querySelector(".payline-marker");
  var gogoLampEl = document.getElementById("gogo-lamp");
  var stopRowEl = document.getElementById("stop-row");
  var tellLayerEl = document.getElementById("tell-layer");
  var tellStageEl = document.getElementById("tell-stage");
  var soundToggleBtn = document.getElementById("sound-toggle");

  // ---------------------------------------------------------------------
  // Sound - synthesized with the Web Audio API. This project ships no audio
  // files, so every effect below (including the ambient loop) is generated
  // at runtime instead of played from a file.
  // ---------------------------------------------------------------------
  var soundOn = true;
  var audioCtx = null;
  var masterGain = null;
  var bgmGain = null;
  var BGM_VOLUME = 0.05;

  function ensureAudio() {
    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audioCtx = new AC();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 1;
      masterGain.connect(audioCtx.destination);
      startBgm();
    }
    // Some browsers still hand back a "suspended" context even when created
    // inside a user gesture - a fresh context needs this resume() call just
    // as much as one that was suspended later, so always check.
    if (audioCtx.state === "suspended") audioCtx.resume();
  }

  function playTone(freq, dur, type, vol, delay, slideTo) {
    if (!audioCtx || !soundOn) return;
    var t0 = audioCtx.currentTime + (delay || 0);
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(vol == null ? 0.2 : vol, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function playChord(freqs, dur, type, vol, delay) {
    freqs.forEach(function (f, i) {
      playTone(f, dur, type, vol, (delay || 0) + i * 0.04);
    });
  }

  // A soft, slowly-shifting ambient pad - the "BGMのみ" backdrop for quiet,
  // no-tell spins. Three detuned sine voices, each with its own slow LFO so
  // the chord breathes instead of sitting static.
  function startBgm() {
    if (bgmGain) return;
    bgmGain = audioCtx.createGain();
    bgmGain.gain.value = soundOn ? BGM_VOLUME : 0;
    bgmGain.connect(masterGain);
    [110, 164.81, 220].forEach(function (freq, i) {
      var osc = audioCtx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      var voiceGain = audioCtx.createGain();
      voiceGain.gain.value = 0.6;
      var lfo = audioCtx.createOscillator();
      var lfoGain = audioCtx.createGain();
      lfo.frequency.value = 0.07 + i * 0.02;
      lfoGain.gain.value = 0.35;
      lfo.connect(lfoGain);
      lfoGain.connect(voiceGain.gain);
      osc.connect(voiceGain);
      voiceGain.connect(bgmGain);
      osc.start();
      lfo.start();
    });
  }

  function setBgmVolume(target, rampSec) {
    if (!bgmGain) return;
    var t0 = audioCtx.currentTime;
    bgmGain.gain.cancelScheduledValues(t0);
    bgmGain.gain.setValueAtTime(bgmGain.gain.value, t0);
    bgmGain.gain.linearRampToValueAtTime(target, t0 + (rampSec || 0.2));
  }

  // The "プチ違和感" BGM-skip variant: the pad ducks out for a beat and
  // comes back, like a single dropped frame in the loop.
  function duckBgmBeat() {
    if (!bgmGain) return;
    var t0 = audioCtx.currentTime;
    bgmGain.gain.cancelScheduledValues(t0);
    bgmGain.gain.setValueAtTime(bgmGain.gain.value, t0);
    bgmGain.gain.linearRampToValueAtTime(0, t0 + 0.05);
    bgmGain.gain.linearRampToValueAtTime(soundOn ? BGM_VOLUME : 0, t0 + 0.45);
  }

  soundToggleBtn.addEventListener("click", function () {
    soundOn = !soundOn;
    soundToggleBtn.textContent = soundOn ? "🔊" : "🔇";
    soundToggleBtn.setAttribute("aria-pressed", soundOn ? "false" : "true");
    if (soundOn) {
      ensureAudio();
      setBgmVolume(BGM_VOLUME, 0.3);
    } else if (bgmGain) {
      setBgmVolume(0, 0.15);
    }
  });

  // altered=true is the "glitch" tier's "リール始動音が少し違う" variant: a
  // slightly different waveform and pitch, subtle enough to only register on
  // a careful listen.
  function sfxReelStart(altered) {
    if (altered) {
      playTone(230, 0.16, "triangle", 0.16, 0, 460);
    } else {
      playTone(220, 0.13, "sine", 0.16, 0, 520);
    }
  }

  function sfxReelStop() {
    playTone(140, 0.07, "square", 0.14);
  }

  function sfxSmallWin() {
    playChord([659.25, 783.99], 0.25, "triangle", 0.14);
  }

  function sfxWin() {
    playChord([523.25, 659.25, 783.99], 0.35, "triangle", 0.18);
  }

  function sfxJackpot() {
    playChord([392, 523.25, 659.25, 783.99, 1046.5], 0.6, "triangle", 0.22);
    playTone(98, 0.5, "sine", 0.25, 0);
  }

  function sfxRare() {
    playTone(300, 0.5, "sine", 0.14, 0, 1200);
    playChord([659.25, 987.77, 1318.5], 0.4, "sine", 0.12, 0.15);
  }

  function sfxLampBlip() {
    playTone(880, 0.08, "sine", 0.08);
  }

  var betAmount = 10;
  var currentBet = 0;
  var spinning = false; // a round is in progress (from spin press until all reels stop)
  var bonusTarget = null; // symbol key every reel must match once bonus mode is guaranteeing a win

  // mode: "normal" | "chance" (GOGO, easier to land 777 by hand) | "bonus" (guaranteed win)
  var mode = "normal";
  var modeSpinsLeft = 0;

  SYMBOLS.slice()
    .sort(function (a, b) {
      return a.mult - b.mult;
    })
    .forEach(function (s) {
      var tr = document.createElement("tr");
      var jackpot = s.key === "seven" ? " 🎉ジャックポット" : "";
      tr.innerHTML = "<td>" + s.icon + s.icon + s.icon + "</td><td>x" + s.mult + jackpot + "</td>";
      paytableBody.appendChild(tr);
    });

  var reelObjs = [];
  document.querySelectorAll(".reel").forEach(function (reelEl, i) {
    var strip = reelEl.querySelector(".strip");
    var cells = [0, 1, 2].map(function () {
      var c = document.createElement("div");
      c.className = "cell";
      strip.appendChild(c);
      return c;
    });
    var initialTape = buildStrip();
    reelObjs.push({
      stripEl: strip,
      cellEls: cells,
      stopBtn: stopRowEl.querySelector('[data-reel="' + i + '"]'),
      tape: initialTape,
      pos: 0,
      spinning: false,
      tickId: null,
    });
  });

  function updateReelDisplay(r) {
    var len = r.tape.length;
    var top = r.tape[(r.pos - 1 + len) % len];
    var mid = r.tape[r.pos];
    var bottom = r.tape[(r.pos + 1) % len];
    r.cellEls[0].textContent = top.icon;
    r.cellEls[1].textContent = mid.icon;
    r.cellEls[2].textContent = bottom.icon;
  }

  reelObjs.forEach(updateReelDisplay);

  betChipsEl.addEventListener("click", function (e) {
    var btn = e.target.closest(".chip");
    if (!btn || spinning || mode !== "normal") return;
    Array.from(betChipsEl.children).forEach(function (c) {
      c.classList.remove("active");
    });
    btn.classList.add("active");
    betAmount = parseInt(btn.dataset.amount, 10);
    updateSpinButtonState();
  });

  function updateBetLockState() {
    var locked = mode !== "normal";
    betChipsEl.classList.toggle("locked", locked);
    betLockNoteEl.textContent = locked ? "🔒 GOGO/ボーナス中はベット額を変更できません" : "";
  }

  function updateSpinButtonState() {
    if (spinning) return;
    var bal = MedalBank.getBalance();
    if (bal < betAmount) {
      spinBtn.disabled = true;
      hintEl.textContent = "メダルが足りません（所持: " + bal.toLocaleString() + " 枚）";
    } else {
      spinBtn.disabled = false;
      hintEl.textContent = "";
    }
  }

  function renderLampState() {
    if (mode === "chance") {
      gogoLampEl.textContent = "GOGO!! あと" + modeSpinsLeft + "回転";
      gogoLampEl.className = "gogo-lamp active chance";
    } else if (mode === "bonus") {
      gogoLampEl.textContent = "BONUS確定!! あと" + modeSpinsLeft + "回転";
      gogoLampEl.className = "gogo-lamp active bonus";
    } else {
      gogoLampEl.className = "gogo-lamp";
    }
    updateBetLockState();
  }

  function clearHighlights() {
    reelObjs.forEach(function (obj) {
      obj.cellEls[1].classList.remove("cell-hit");
    });
    paylineMarkerEl.classList.remove("hit");
  }

  function highlightMidCells(indices) {
    indices.forEach(function (i) {
      reelObjs[i].cellEls[1].classList.add("cell-hit");
    });
    paylineMarkerEl.classList.add("hit");
  }

  function evaluate(midSymbols, bet) {
    var keys = midSymbols.map(function (s) {
      return s.key;
    });

    if (keys[0] === keys[1] && keys[1] === keys[2]) {
      var sym = midSymbols[0];
      var payout = bet * sym.mult;
      MedalBank.add(payout, "スロット:配当");
      highlightMidCells([0, 1, 2]);
      if (sym.key === "seven") {
        JPTickets.add(1);
        winMessageEl.textContent =
          "🎉🎉 JACKPOT！777揃い！ " + payout.toLocaleString() + " 枚獲得！！ 🎫JP券+1";
        winMessageEl.className = "win-message jackpot";
        sfxJackpot();
      } else {
        winMessageEl.textContent =
          "🎊 " + sym.icon + sym.icon + sym.icon + " 揃い！ " + payout.toLocaleString() + " 枚獲得！";
        winMessageEl.className = "win-message win";
        sfxWin();
      }
      return;
    }

    var cherryIndices = [];
    keys.forEach(function (k, i) {
      if (k === "cherry") cherryIndices.push(i);
    });

    if (cherryIndices.length === 2) {
      MedalBank.add(bet, "スロット:配当");
      highlightMidCells(cherryIndices);
      winMessageEl.textContent = "🍒 チェリー2つ！ベット額 " + bet.toLocaleString() + " 枚が戻ってきました";
      winMessageEl.className = "win-message win";
      sfxSmallWin();
    } else {
      winMessageEl.textContent = "残念、はずれ…";
      winMessageEl.className = "win-message lose";
    }
  }

  function findWithinRange(tape, startPos, key, range) {
    var len = tape.length;
    for (var d = 0; d <= range; d++) {
      var idx = (startPos + d) % len;
      if (tape[idx].key === key) return idx;
    }
    return -1;
  }

  function findAnywhere(tape, startPos, key) {
    var len = tape.length;
    for (var d = 0; d < len; d++) {
      var idx = (startPos + d) % len;
      if (tape[idx].key === key) return idx;
    }
    return startPos;
  }

  function startReel(r) {
    r.tape = buildStrip();
    r.pos = Math.floor(Math.random() * r.tape.length);
    r.spinning = true;
    updateReelDisplay(r);
    r.stripEl.classList.add("spinning");
    r.stopBtn.disabled = false;
    r.tickId = setInterval(function () {
      r.pos = (r.pos + 1) % r.tape.length;
      updateReelDisplay(r);
    }, TICK_MS);
  }

  function stopReel(index) {
    var r = reelObjs[index];
    if (!r.spinning) return;
    clearInterval(r.tickId);
    r.spinning = false;
    r.stopBtn.disabled = true;
    r.stripEl.classList.remove("spinning");
    sfxReelStop();

    // The stop lands wherever the player pressed. Assist logic (if any) only
    // nudges the strip forward a few frames, like a real machine's pull-in.
    if (mode === "bonus") {
      if (bonusTarget === null) {
        bonusTarget = r.tape[r.pos].key; // first reel decides what everyone else must match
      } else {
        r.pos = findAnywhere(r.tape, r.pos, bonusTarget);
      }
    } else if (mode === "chance") {
      var assisted = findWithinRange(r.tape, r.pos, "seven", PULL_IN_FRAMES);
      if (assisted !== -1) r.pos = assisted;
    }

    updateReelDisplay(r);
    r.cellEls.forEach(function (c) {
      c.classList.remove("settle");
      void c.offsetWidth;
      c.classList.add("settle");
    });

    if (reelObjs.every(function (o) { return !o.spinning; })) {
      finishRound();
    }
  }

  function finishRound() {
    var midSymbols = reelObjs.map(function (r) {
      return r.tape[r.pos];
    });
    evaluate(midSymbols, currentBet);

    var isJackpot =
      midSymbols[0].key === midSymbols[1].key && midSymbols[1].key === midSymbols[2].key && midSymbols[0].key === "seven";

    if (mode === "chance" && isJackpot) {
      mode = "bonus";
      modeSpinsLeft = BONUS_SPINS;
    } else if (mode === "bonus" && isJackpot) {
      // 777 landing again mid-bonus restarts the guaranteed-win streak.
      modeSpinsLeft = BONUS_SPINS;
    } else if (mode === "chance" || mode === "bonus") {
      modeSpinsLeft -= 1;
      if (modeSpinsLeft <= 0) {
        mode = "normal";
        modeSpinsLeft = 0;
      }
    }
    renderLampState();

    spinning = false;
    updateSpinButtonState();
  }

  function pickTell() {
    var total = TELL_TIERS.reduce(function (sum, t) {
      return sum + t.weight;
    }, 0);
    var r = Math.random() * total;
    for (var i = 0; i < TELL_TIERS.length; i++) {
      r -= TELL_TIERS[i].weight;
      if (r <= 0) return TELL_TIERS[i].key;
    }
    return "normal";
  }

  function spawnTellEl(className, innerHTML, duration) {
    var el = document.createElement("div");
    el.className = className;
    el.innerHTML = innerHTML;
    tellLayerEl.appendChild(el);
    setTimeout(function () {
      el.remove();
    }, duration);
    return el;
  }

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // Returns the glitch sub-variant when key is "glitch" (so the caller can
  // react with matching audio), otherwise undefined.
  function playTell(key) {
    tellLayerEl.innerHTML = "";
    tellStageEl.classList.remove("tell-flicker");

    if (key === "lamp") {
      var lampColor = Math.random() < 0.5 ? "blue" : "white";
      spawnTellEl("tell-lamp tell-lamp-" + lampColor, "💡", 700);
      sfxLampBlip();
    } else if (key === "character") {
      if (Math.random() < 0.75) {
        spawnTellEl(
          "tell-mascot tell-mascot-walk",
          '<span class="tell-mascot-face">😊</span><span class="tell-mascot-bubble">…</span>',
          1700
        );
      } else {
        spawnTellEl("tell-mascot tell-mascot-look", '<span class="tell-mascot-face">👀</span>', 900);
      }
    } else if (key === "navi") {
      var icon = pick(["🍒", "🔔"]);
      var side = Math.random() < 0.5 ? "left" : "right";
      spawnTellEl("tell-navi tell-navi-" + side, icon, 550);
      sfxLampBlip();
    } else if (key === "mini") {
      var mini = pick(["bird", "leaf", "star"]);
      var miniIcon = mini === "bird" ? "🐦" : mini === "leaf" ? "🍃" : "🌠";
      var miniDuration = mini === "star" ? 900 : 1800;
      spawnTellEl("tell-mini tell-" + mini, miniIcon, miniDuration);
    } else if (key === "glitch") {
      // "プチ違和感": deliberately subtle, no toast - only an attentive player
      // should notice anything happened at all.
      var glitch = pick(["redlamp", "glance", "sound", "bgmskip"]);
      if (glitch === "redlamp") {
        spawnTellEl("tell-lamp tell-lamp-red", "💡", 500);
      } else if (glitch === "glance") {
        spawnTellEl("tell-mascot tell-mascot-glance", '<span class="tell-mascot-face">👀</span>', 600);
      } else if (glitch === "bgmskip") {
        tellStageEl.classList.add("tell-flicker");
        setTimeout(function () {
          tellStageEl.classList.remove("tell-flicker");
        }, 220);
        duckBgmBeat();
      }
      // "sound" has no visual at all - the altered reel-start tone (played by
      // the caller) is the only cue.
      return glitch;
    } else if (key === "rare") {
      spawnTellEl("tell-rainbow", "", 450);
      showToast("✨ 今の何！？");
      sfxRare();
    }
  }

  spinBtn.addEventListener("click", function () {
    if (spinning) return;
    ensureAudio(); // must happen synchronously inside the user gesture
    var bet = betAmount;
    if (!MedalBank.spend(bet, "スロット:ベット")) {
      updateSpinButtonState();
      return;
    }
    currentBet = bet;
    bonusTarget = null;

    var tell = pickTell();
    var triggerChance = tell === "glitch" ? GLITCH_TRIGGER_CHANCE : CHANCE_TRIGGER_CHANCE;

    // A normal spin can crack open the GOGO window before this spin runs, so
    // the very spin that triggers it already benefits from the assist.
    if (mode === "normal" && Math.random() < triggerChance) {
      mode = "chance";
      modeSpinsLeft = CHANCE_SPINS;
    }
    renderLampState();

    spinning = true;
    spinBtn.disabled = true;
    hintEl.textContent = "";
    clearHighlights();
    winMessageEl.textContent = "";
    winMessageEl.className = "win-message";

    var glitchVariant = playTell(tell);
    sfxReelStart(glitchVariant === "sound");
    reelObjs.forEach(startReel);
  });

  stopRowEl.addEventListener("click", function (e) {
    var btn = e.target.closest(".stop-btn");
    if (!btn || btn.disabled) return;
    stopReel(parseInt(btn.dataset.reel, 10));
  });

  MedalBank.subscribe(function () {
    updateSpinButtonState();
  });

  updateSpinButtonState();
  renderLampState();
})();
