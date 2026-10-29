/* Optional Halloween ambience. Audio starts quietly; a real gesture unlocks it
   when the browser blocks autoplay. The visitor's mute choice is remembered. */
(() => {
  "use strict";
  if (!window.GlaireSeason) return;
  const root = document.documentElement;
  const source = new URL("halloween-atmosphere-v1.m4a", document.currentScript.src).href;
  const effectSource = new URL("bat-flight-v1.m4a", document.currentScript.src).href;
  const effectTimes = [8.1, 28.6, 47.2, 69.3];
  const effectLevel = .65;
  const prefix = "glaire:halloween:audio:";
  const read = key => { try { return localStorage.getItem(prefix + key); } catch { return null; } };
  const save = (key, value) => { try { localStorage.setItem(prefix + key, String(value)); } catch {} };
  const savedVolume = read("volume");
  let volume = savedVolume === null ? .2 : Math.max(0, Math.min(100, Number(savedVolume) || 0)) / 100;
  let enabled = read("muted") !== "true";
  let starting = false, failed = false, attempt = 0, pauseTimer = 0, fadeFrame = 0;
  let context = null, gain = null, mediaSource = null;
  let effectAudio = null, effectLoad = null, nextEffect = 0, lastEffectTime = 0, effectEpoch = 0, effectsPlayed = 0;
  const activeEffects = new Set();

  const dock = document.createElement("div");
  dock.className = "halloween-sound";
  dock.setAttribute("role", "group");
  dock.setAttribute("aria-label", "Звуки Хэллоуина");
  const opener = document.createElement("button");
  opener.type = "button";
  opener.className = "halloween-sound__badge";
  opener.setAttribute("aria-controls", "halloweenSoundPanel");
  opener.setAttribute("aria-expanded", "false");
  opener.innerHTML = '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 5 5.5 9H2v6h3.5l4.5 4V5Z"/><g class="halloween-sound__waves"><path d="M14 8a5 5 0 0 1 0 8M17 5a9 9 0 0 1 0 14"/></g><path class="halloween-sound__slash" d="m15 9 6 6m0-6-6 6"/></svg>';
  const panel = document.createElement("div");
  panel.id = "halloweenSoundPanel";
  panel.className = "halloween-sound__panel";
  panel.hidden = true;
  panel.setAttribute("role", "group");
  panel.setAttribute("aria-label", "Настройки звука Хэллоуина");
  const heading = document.createElement("div");
  heading.className = "halloween-sound__heading";
  const headingText = document.createElement("span");
  headingText.textContent = "Звуки Хэллоуина";
  const closePanel = document.createElement("button");
  closePanel.type = "button";
  closePanel.className = "halloween-sound__close";
  closePanel.textContent = "×";
  closePanel.setAttribute("aria-label", "Закрыть настройки звука");
  heading.append(headingText, closePanel);
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "halloween-sound__toggle";
  const volumeLabel = document.createElement("label");
  volumeLabel.className = "halloween-sound__volume";
  const volumeName = document.createElement("span");
  volumeName.className = "halloween-sound__volume-label";
  volumeName.textContent = "Громкость";
  const volumeValue = document.createElement("output");
  volumeValue.className = "halloween-sound__value";
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0"; slider.max = "100"; slider.step = "1";
  slider.value = String(Math.round(volume * 100));
  slider.setAttribute("aria-label", "Громкость фонового звука");
  volumeLabel.append(volumeName, volumeValue, slider);
  const status = document.createElement("span");
  status.className = "halloween-sound__sr";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  panel.append(heading, toggle, volumeLabel);
  dock.append(opener, panel, status);
  document.body.append(dock);

  const audio = document.createElement("audio");
  audio.id = "halloweenAmbience";
  audio.loop = true;
  audio.preload = "none";
  audio.hidden = true;
  audio.volume = 0;
  document.body.append(audio);

  // A visitor can also stop music while the native wheel dialog is open.
  const dialogMute = document.createElement("button");
  dialogMute.type = "button";
  dialogMute.className = "fortune-copy halloween-sound__dialog-mute";
  dialogMute.textContent = "Выключить фоновый звук";
  dialogMute.hidden = true;
  document.querySelector(".fortune-dialog__actions")?.append(dialogMute);

  const seasonal = () => root.dataset.event === "halloween";
  const audibleVideo = () => [...document.querySelectorAll("video")].some(video => !video.paused && !video.ended && !video.muted && video.volume > 0);
  const playing = () => enabled && !audio.paused && !document.hidden && (!context || context.state === "running");
  const targetGain = () => enabled && seasonal() && !document.hidden ? volume * (audibleVideo() ? .12 : 1) : 0;

  function setPanel(open, restoreFocus = false) {
    panel.hidden = !open;
    opener.setAttribute("aria-expanded", String(open));
    if (open) toggle.focus({preventScroll:true});
    else if (restoreFocus) opener.focus({preventScroll:true});
  }

  function updateUI() {
    const on = playing();
    dock.dataset.state = on ? "playing" : !enabled ? "off" : failed ? "error" : starting ? "loading" : "waiting";
    dock.dataset.ducked = String(on && audibleVideo());
    toggle.setAttribute("aria-pressed", String(on));
    toggle.setAttribute("aria-busy", String(starting));
    const label = on ? "Выключить звуки Хэллоуина" : starting ? "Отменить запуск звука" : "Включить звуки Хэллоуина";
    toggle.setAttribute("aria-label", label);
    toggle.title = label;
    toggle.textContent = on ? "Выключить звук" : starting ? "Отменить запуск" : "Включить звук";
    opener.setAttribute("aria-label", `${on ? "Звук включён" : "Звук выключен"}. Открыть настройки звука`);
    opener.title = `${on ? "Звук включён" : "Звук выключен"} · настройки`;
    volumeValue.value = `${Math.round(volume * 100)}%`;
    slider.setAttribute("aria-valuetext", `${Math.round(volume * 100)} процентов`);
    dialogMute.hidden = !on;
  }

  function adjustGain(immediate = false) {
    const target = targetGain();
    cancelAnimationFrame(fadeFrame);
    if (gain && context.state !== "closed") {
      const time = context.currentTime;
      gain.gain.cancelScheduledValues(time);
      gain.gain.setValueAtTime(gain.gain.value, time);
      if (immediate) gain.gain.setValueAtTime(target, time);
      else gain.gain.setTargetAtTime(target, time, .16);
    } else if (immediate || document.hidden) {
      audio.volume = target;
      if (effectAudio) effectAudio.volume = target * effectLevel;
    } else {
      const from = audio.volume, start = performance.now();
      const fade = now => {
        const progress = Math.min(1, (now - start) / 450);
        audio.volume = Math.max(0, Math.min(1, from + (target - from) * progress));
        if (effectAudio) effectAudio.volume = audio.volume * effectLevel;
        if (progress < 1) fadeFrame = requestAnimationFrame(fade);
      };
      fadeFrame = requestAnimationFrame(fade);
    }
    updateUI();
  }

  function stopEffects() {
    ++effectEpoch;
    activeEffects.forEach(node => { try { node.stop(); } catch {} });
    activeEffects.clear();
    effectAudio?.pause();
  }

  async function playEffect(cue) {
    if (!playing()) return;
    const epoch = effectEpoch;
    if (context && gain) {
      if (!effectLoad) {
        effectLoad = fetch(effectSource)
          .then(response => { if (!response.ok) throw new Error("Sound unavailable"); return response.arrayBuffer(); })
          .then(data => context.decodeAudioData(data))
          .catch(() => { effectLoad = null; return null; });
      }
      const buffer = await effectLoad;
      if (!buffer || epoch !== effectEpoch || !playing() || Math.abs(audio.currentTime - cue) > 1.5) return;
      const node = context.createBufferSource();
      const trim = context.createGain();
      trim.gain.value = effectLevel;
      node.buffer = buffer;
      node.connect(trim); trim.connect(gain);
      activeEffects.add(node);
      node.onended = () => { activeEffects.delete(node); node.disconnect(); trim.disconnect(); };
      node.start(); ++effectsPlayed;
    } else {
      if (!effectAudio) {
        effectAudio = document.createElement("audio");
        effectAudio.id = "halloweenBatFlight";
        effectAudio.hidden = true;
        effectAudio.preload = "none";
        effectAudio.src = effectSource;
        document.body.append(effectAudio);
      }
      effectAudio.volume = audio.volume * effectLevel;
      effectAudio.currentTime = 0;
      try { await effectAudio.play(); ++effectsPlayed; } catch {}
    }
  }

  audio.addEventListener("timeupdate", () => {
    const time = audio.currentTime;
    if (time < lastEffectTime - .5) nextEffect = 0;
    lastEffectTime = time;
    if (!playing() || audio.seeking) return;
    while (nextEffect < effectTimes.length && effectTimes[nextEffect] <= time) {
      const cue = effectTimes[nextEffect++];
      if (time - cue < .6) playEffect(cue);
    }
  });
  audio.addEventListener("seeking", () => {
    stopEffects();
    const time = audio.currentTime;
    nextEffect = effectTimes.findIndex(cue => cue >= time - .4);
    if (nextEffect < 0) nextEffect = effectTimes.length;
    lastEffectTime = time;
  });
  audio.addEventListener("pause", stopEffects);

  function prepare() {
    if (!audio.getAttribute("src")) audio.src = source;
    if (audio.error) audio.load();
    const Context = window.AudioContext || window.webkitAudioContext;
    // File previews use native playback; on HTTP(S), GainNode also controls iOS.
    if (!context && Context && location.protocol !== "file:") {
      try {
        context = new Context();
        gain = context.createGain();
        gain.gain.value = 0;
        mediaSource = context.createMediaElementSource(audio);
        mediaSource.connect(gain);
        gain.connect(context.destination);
        audio.volume = 1;
        context.addEventListener("statechange", updateUI);
      } catch {
        context?.close().catch(() => {});
        context = null; gain = null; mediaSource = null;
      }
    }
    context?.resume().catch(() => {});
    adjustGain();
  }

  async function start(fromGesture = false) {
    if (!enabled || !seasonal() || document.hidden || playing()) return;
    // A pending autoplay request must not swallow a later real gesture.
    // Resume Web Audio and call play() together, before leaving that event.
    if (starting && !fromGesture) return;
    clearTimeout(pauseTimer);
    const token = ++attempt;
    starting = true; failed = false;
    prepare();
    updateUI();
    try {
      await audio.play();
      if (token !== attempt) return;
      if (!enabled || !seasonal() || document.hidden) {
        audio.pause();
        return;
      }
      status.textContent = "Звуки Хэллоуина включены";
      adjustGain();
    } catch (error) {
      if (token !== attempt) return;
      failed = error.name !== "NotAllowedError" && error.name !== "AbortError";
      status.textContent = failed ? "Не удалось загрузить звук. Нажмите, чтобы попробовать ещё раз." : "Звук включится после первого нажатия на странице.";
    } finally {
      if (token === attempt) { starting = false; updateUI(); }
    }
  }

  function stop(remember = true, immediate = false) {
    enabled = false; starting = false; ++attempt;
    if (remember) save("muted", true);
    clearTimeout(pauseTimer);
    adjustGain(immediate);
    const pause = () => { audio.pause(); context?.suspend().catch(() => {}); };
    if (immediate) pause();
    else pauseTimer = setTimeout(pause, 500);
    status.textContent = "Звуки Хэллоуина выключены";
    updateUI();
  }

  toggle.addEventListener("click", () => {
    if (enabled && (playing() || starting)) stop();
    else { enabled = true; failed = false; save("muted", false); start(true); }
  });
  opener.addEventListener("click", () => {
    const opening = panel.hidden;
    setPanel(opening);
    if (opening && enabled && !playing()) start(true);
  });
  closePanel.addEventListener("click", () => setPanel(false, true));
  document.addEventListener("pointerdown", event => {
    if (!dock.contains(event.target)) setPanel(false);
  }, {passive:true,capture:true});
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !panel.hidden) {
      event.preventDefault(); event.stopPropagation();
      setPanel(false, true);
    }
  });
  document.addEventListener("focusin", event => {
    if (!panel.hidden && !dock.contains(event.target)) setPanel(false);
  });
  const wheelDialog = document.querySelector(".fortune-dialog");
  if (wheelDialog) new MutationObserver(() => {
    if (wheelDialog.open) setPanel(false);
  }).observe(wheelDialog, {attributes:true,attributeFilter:["open"]});
  dialogMute.addEventListener("click", () => stop());
  slider.addEventListener("input", () => {
    volume = Number(slider.value) / 100;
    save("volume", slider.value);
    adjustGain();
    if (enabled && !playing()) start(true);
  });

  // This is a genuine visitor gesture, never a simulated click or policy bypass.
  const unlock = event => {
    if (!event.isTrusted) return;
    if (dock.contains(event.target) || dialogMute.contains(event.target)) return;
    if (event.type === "keydown" && (event.key === "Escape" || event.ctrlKey || event.metaKey || event.altKey || ["Shift", "Control", "Alt", "Meta", "CapsLock", "NumLock", "ScrollLock"].includes(event.key))) return;
    if (enabled && !playing()) start(true);
  };
  // Touch/pen activation may arrive at pointerup; some browsers require click.
  // Capture also covers gallery arrows and controls that stop event bubbling.
  ["pointerdown", "pointerup", "click", "touchend", "keydown"].forEach(name => {
    document.addEventListener(name, unlock, {passive:true,capture:true});
  });
  if (!window.PointerEvent) document.addEventListener("mousedown", unlock, {passive:true,capture:true});

  ["play", "pause", "ended", "volumechange"].forEach(name => document.addEventListener(name, event => {
    if (event.target instanceof HTMLVideoElement) adjustGain();
  }, true));
  ["playing", "pause", "waiting", "ended"].forEach(name => audio.addEventListener(name, updateUI));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      ++attempt; starting = false;
      adjustGain(true); audio.pause(); context?.suspend().catch(() => {});
      updateUI();
    } else if (enabled) start();
  });
  window.addEventListener("pagehide", () => { audio.pause(); context?.suspend().catch(() => {}); });
  window.addEventListener("pageshow", () => { if (enabled) start(); });
  new MutationObserver(() => {
    if (!seasonal()) { setPanel(false); stop(false, true); }
  }).observe(root, {attributes:true,attributeFilter:["data-event"]});

  window.GlaireSeason.sound = {
    get enabled() { return enabled; },
    get playing() { return playing(); },
    get volume() { return volume; },
    get gain() { return gain ? gain.gain.value : audio.volume; },
    get ducked() { return audibleVideo(); },
    get effectsPlayed() { return effectsPlayed; },
    stop: () => stop(),
  };
  updateUI();
  if (enabled && seasonal()) start();
})();
