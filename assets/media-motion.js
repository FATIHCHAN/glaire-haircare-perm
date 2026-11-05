/* GLAIRE: плавные фото, осторожный автопоказ и точная прокрутка лент.
   Исходные файлы и карта не меняются. Ручные команды всегда имеют приоритет.
   Автопоказ работает только в видимой галерее и учитывает уменьшение движения. */
(() => {
  "use strict";
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const photoStates = new WeakMap();
  const railStates = new WeakMap();
  const players = new Set();
  const blocked = () => document.hidden || Boolean(
    document.querySelector("dialog[open], [data-glaire-booking-modal]"),
  );

  // Старый кадр остаётся поверх нового до загрузки и декодирования.
  // Быстрые нажатия отменяют устаревший переход, а не теряются в блокировке.
  function photo(image, sources, load, onReady, onEmpty) {
    let state = photoStates.get(image);
    if (!state) {
      state = { generation: 0, initialized: false };
      photoStates.set(image, state);
    }
    const generation = ++state.generation;
    // Новый запрос не возвращает уже показанную фотографию к старому слою.
    state.animation?.cancel();
    state.animation = null;
    if (state.previous && image.dataset.mediaPending !== "1") {
      state.previous.remove();
      state.previous = null;
    }
    if (state.initialized && !state.previous && image.complete && image.naturalWidth) {
      const previous = image.cloneNode(false);
      previous.removeAttribute("id");
      previous.removeAttribute("srcset");
      previous.removeAttribute("sizes");
      previous.removeAttribute("title");
      previous.src = image.currentSrc || image.src;
      previous.alt = "";
      previous.classList.add("media-previous-frame");
      previous.setAttribute("aria-hidden", "true");
      previous.loading = "eager";
      previous.fetchPriority = "low";
      const style = getComputedStyle(image);
      previous.style.objectFit = style.objectFit;
      previous.style.objectPosition = style.objectPosition;
      state.previous = previous;
      image.before(previous);
    }
    state.initialized = true;
    image.dataset.mediaPending = "1";
    image.parentElement.setAttribute("aria-busy", "true");
    const finish = async () => {
      try { await image.decode?.(); } catch { /* Загруженный кадр всё равно доступен. */ }
      if (state.generation !== generation) return;
      delete image.dataset.mediaPending;
      image.parentElement.removeAttribute("aria-busy");
      onReady?.();
      const previous = state.previous;
      if (!previous) return;
      const remove = () => {
        if (state.generation !== generation) return;
        previous.remove();
        state.previous = null;
        state.animation = null;
      };
      if (reducedMotion.matches || typeof previous.animate !== "function") {
        remove();
        return;
      }
      state.animation = previous.animate(
        [{ opacity: 1 }, { opacity: 0 }],
        { duration: 280, easing: "cubic-bezier(.22,.61,.36,1)", fill: "forwards" },
      );
      state.animation.finished.then(remove, () => {});
    };
    load(image, sources, finish, () => {
      if (state.generation !== generation) return;
      delete image.dataset.mediaPending;
      image.parentElement.removeAttribute("aria-busy");
      // При сетевой ошибке сохраняем последний настоящий кадр вместо пустоты.
      if (state.previous) {
        image.removeAttribute("srcset");
        image.removeAttribute("sizes");
        image.src = state.previous.src;
        delete image.dataset.imageCandidate;
        state.previous.remove();
        state.previous = null;
      } else onEmpty?.();
    });
  }

  // Мастер и работы: текущий img не меняет источник во время загрузки.
  // Готовый кадр проявляется отдельным слоем; затем источник переносится
  // под полностью непрозрачный слой. Так нет скачка кропа или декодирования.
  const stablePhotoStates = new WeakMap();
  function stablePhoto(image, sources, load, onReady, onEmpty, options = {}) {
    let state = stablePhotoStates.get(image);
    if (!state) {
      state = { generation: 0, layer: null, animation: null, queued: null };
      stablePhotoStates.set(image, state);
    }
    // Быстрые команды учитываются сразу контроллером, но не обрывают
    // уже начатое проявление. После него показывается последняя цель.
    if (state.animation) {
      state.queued = { sources, load, onReady, onEmpty, options };
      return;
    }
    const generation = ++state.generation;
    if (state.layer) {
      state.layer.onload = state.layer.onerror = null;
      state.layer.remove();
    }
    const layer = image.cloneNode(false);
    ["id", "title", "src", "srcset", "sizes"].forEach((name) => layer.removeAttribute(name));
    delete layer.dataset.imageCandidate;
    layer.alt = "";
    layer.setAttribute("aria-hidden", "true");
    layer.classList.add("media-incoming-frame");
    layer.loading = "eager";
    layer.decoding = "async";
    const style = getComputedStyle(image);
    layer.style.objectFit = style.objectFit;
    layer.style.objectPosition = options.position || style.objectPosition;
    layer.style.opacity = "0";
    image.after(layer);
    state.layer = layer;
    image.dataset.mediaPending = "1";
    image.parentElement.setAttribute("aria-busy", "true");
    const current = () => generation === state.generation && state.layer === layer;
    const clean = () => {
      layer.remove();
      state.layer = state.animation = null;
      delete image.dataset.mediaPending;
      image.parentElement.removeAttribute("aria-busy");
      const queued = state.queued;
      state.queued = null;
      if (queued) stablePhoto(image, queued.sources, queued.load, queued.onReady, queued.onEmpty, queued.options);
    };
    const commit = async () => {
      if (!current()) return;
      // Слой остаётся непрозрачным до декодирования основного img.
      layer.style.opacity = "1";
      image.onload = image.onerror = null;
      image.style.objectPosition = layer.style.objectPosition;
      for (const name of ["width", "height", "sizes", "srcset", "src"]) {
        const value = layer.getAttribute(name);
        if (value === null) image.removeAttribute(name);
        else image.setAttribute(name, value);
      }
      image.dataset.imageCandidate = layer.dataset.imageCandidate || "";
      if (layer.dataset.localImage) image.dataset.localImage = layer.dataset.localImage;
      else delete image.dataset.localImage;
      try { await image.decode?.(); } catch { /* Новый кадр уже виден в слое. */ }
      if (!current()) return;
      onReady?.();
      clean();
    };
    load(layer, sources, async () => {
      try { await layer.decode?.(); } catch { /* Fallback уже проверил загрузку. */ }
      if (!current()) return;
      if (reducedMotion.matches || !image.complete || !image.naturalWidth || typeof layer.animate !== "function") {
        await commit();
        return;
      }
      state.animation = layer.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 320, easing: "cubic-bezier(.22,.61,.36,1)", fill: "forwards",
      });
      state.animation.finished.then(commit, () => {});
    }, () => {
      if (!current()) return;
      const empty = !image.complete || !image.naturalWidth;
      clean();
      if (empty) onEmpty?.();
    });
  }

  // Одна отменяемая анимация на ленту. Повторные стрелки суммируют шаги
  // относительно выбранной цели, а не промежуточного положения скролла.
  function scrollRail(track, direction, step, wrap = false) {
    let state = railStates.get(track);
    const max = Math.max(0, track.scrollWidth - track.clientWidth);
    if (!max || !step) return;
    if (!state) {
      state = { target: track.scrollLeft, frame: 0, generation: 0 };
      railStates.set(track, state);
    }
    const base = state.frame ? state.target : track.scrollLeft;
    let target = base + direction * step;
    if (wrap && direction > 0 && base >= max - 4) target = 0;
    if (wrap && direction < 0 && base <= 4) target = max;
    state.target = Math.min(max, Math.max(0, target));
    cancelAnimationFrame(state.frame);
    const generation = ++state.generation;
    state.originalBehavior ??= track.style.scrollBehavior;
    state.originalSnap ??= track.style.scrollSnapType;
    track.style.scrollBehavior = "auto";
    track.style.scrollSnapType = "none";
    const start = track.scrollLeft;
    const distance = state.target - start;
    const duration = reducedMotion.matches ? 0 : 520;
    let began;
    const tick = (time) => {
      if (generation !== state.generation) return;
      began ??= time;
      const progress = duration ? Math.min(1, (time - began) / duration) : 1;
      const eased = progress < .5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
      track.scrollLeft = start + distance * eased;
      if (progress < 1) state.frame = requestAnimationFrame(tick);
      else {
        state.frame = 0;
        track.style.scrollBehavior = state.originalBehavior;
        track.style.scrollSnapType = state.originalSnap;
        railStates.delete(track);
        track.dispatchEvent(new Event("glaire:rail-settled"));
      }
    };
    state.frame = requestAnimationFrame(tick);
  }
  function cancelRail(track) {
    const state = railStates.get(track);
    if (!state) return;
    cancelAnimationFrame(state.frame);
    ++state.generation;
    track.style.scrollBehavior = state.originalBehavior;
    track.style.scrollSnapType = state.originalSnap;
    railStates.delete(track);
  }

  // Свайп не захватывает стрелки, ссылки и штатные controls видео.
  // Захват указателя включается только после уверенного горизонтального жеста.
  function swipe(surface, move, onInteraction = () => {}) {
    if (!surface) return;
    let start = null;
    let suppressClick = false;
    surface.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.isPrimary === false ||
          event.target.closest("button, a, input, summary, [role=button]")) return;
      const video = event.target.closest("video[controls]");
      // Нижнюю полосу штатных видеокнопок оставляем самому браузеру.
      if (video && event.clientY > video.getBoundingClientRect().bottom - 56) return;
      onInteraction();
      cancelRail(surface);
      start = { id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, horizontal: false };
    });
    surface.addEventListener("pointermove", (event) => {
      if (!start || start.id !== event.pointerId) return;
      start.dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (!start.horizontal && Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(start.dx)) {
        start = null;
        return;
      }
      if (!start.horizontal && Math.abs(start.dx) > 12 && Math.abs(start.dx) > Math.abs(dy) * 1.2) {
        start.horizontal = true;
        surface.setPointerCapture?.(event.pointerId);
      }
    });
    const finish = (event, cancelled = false) => {
      if (!start || start.id !== event.pointerId) return;
      const state = start;
      start = null;
      if (surface.hasPointerCapture?.(event.pointerId)) surface.releasePointerCapture(event.pointerId);
      if (!cancelled && state.horizontal && Math.abs(state.dx) > 44) {
        suppressClick = true;
        move(state.dx > 0 ? -1 : 1);
        setTimeout(() => { suppressClick = false; }, 0);
      }
    };
    surface.addEventListener("pointerup", (event) => finish(event));
    surface.addEventListener("pointercancel", (event) => finish(event, true));
    surface.addEventListener("lostpointercapture", () => { start = null; });
    surface.addEventListener("dragstart", (event) => event.preventDefault());
    surface.addEventListener("click", (event) => {
      if (!suppressClick) return;
      event.preventDefault();
      event.stopPropagation();
    }, true);
  }

  function autoplay(root, { interval = 6000, advance, prepare = () => {}, busy = () => false }) {
    if (!root) return null;
    let visible = false, timer = 0;
    const host = root.querySelector(".hero-slider__viewport, .master-slider__viewport, .works-slider__viewport") || root;
    const keyboardFocus = () => root.contains(document.activeElement) && document.activeElement.matches(":focus-visible");
    const stop = () => { clearTimeout(timer); timer = 0; };
    const schedule = (delay = interval) => {
      stop();
      if (!visible || blocked() || keyboardFocus() || reducedMotion.matches) return;
      timer = setTimeout(() => {
        timer = 0;
        if (!visible || blocked() || keyboardFocus() || reducedMotion.matches) return;
        if (!busy()) advance();
        schedule();
      }, delay);
    };
    const interaction = () => schedule(Math.max(interval, 8000));
    root.addEventListener("pointerdown", () => { cancelRail(root); interaction(); }, { passive: true });
    root.addEventListener("wheel", () => { cancelRail(root); interaction(); }, { passive: true });
    root.addEventListener("keydown", interaction);
    root.addEventListener("focusin", () => { if (keyboardFocus()) stop(); });
    root.addEventListener("focusout", () => queueMicrotask(() => schedule()));
    root.addEventListener("glaire:manual-slide", interaction);
    const player = { schedule, stop, interaction };
    players.add(player);
    const observer = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= .3);
      if (visible) prepare();
      schedule();
    }, { threshold: [0, .3] });
    observer.observe(host);
    return player;
  }
  document.addEventListener("visibilitychange", () => players.forEach((p) => p.schedule()));
  document.addEventListener("glaire:modal-state", () => players.forEach((p) => p.schedule()));
  reducedMotion.addEventListener("change", () => players.forEach((p) => p.schedule()));
  window.addEventListener("pagehide", () => players.forEach((p) => p.stop()));
  window.addEventListener("pageshow", () => players.forEach((p) => p.schedule()));
  window.GlaireMediaMotion = { photo, stablePhoto, scrollRail, cancelRail, swipe, autoplay };
})();
