/* Собрано scripts/build-site.py из media-motion.js и site.js. */

/* Источник: assets/media-motion.js */
/* GLAIRE: плавные фото, осторожный автопоказ и точная прокрутка лент.
   Исходные файлы и карта не меняются. Ручные команды всегда имеют приоритет.
   Автопоказ работает только в видимой галерее; его можно остановить кнопкой. */
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
    state.animation?.cancel();
    state.animation = null;
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
        { duration: 620, easing: "cubic-bezier(.22,.61,.36,1)", fill: "forwards" },
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

  function autoplay(root, { interval = 9000, advance, prepare = () => {}, busy = () => false, label = "Фотографии", controlHost = null }) {
    if (!root) return null;
    let visible = false, paused = false, hovered = false, timer = 0;
    const host = root.querySelector(".hero-slider__viewport, .master-slider__viewport, .works-slider__viewport") || root;
    const control = document.createElement("button");
    control.type = "button";
    control.className = "media-autoplay-toggle";
    control.setAttribute("aria-pressed", "false");
    const update = () => {
      control.textContent = paused ? "▷" : "Ⅱ";
      control.setAttribute("aria-label", `${paused ? "Включить" : "Остановить"} автолистание — ${label}`);
      control.title = control.getAttribute("aria-label");
      control.setAttribute("aria-pressed", String(paused));
    };
    const keyboardFocus = () => root.contains(document.activeElement) && document.activeElement.matches(":focus-visible");
    const stop = () => { clearTimeout(timer); timer = 0; };
    const schedule = (delay = interval) => {
      stop();
      if (!visible || paused || hovered || blocked() || keyboardFocus() || reducedMotion.matches) return;
      timer = setTimeout(() => {
        timer = 0;
        if (!visible || paused || hovered || blocked() || keyboardFocus() || reducedMotion.matches) return;
        if (!busy()) advance();
        schedule();
      }, delay);
    };
    const interaction = () => schedule(Math.max(interval, 12000));
    control.addEventListener("click", () => { paused = !paused; update(); schedule(); });
    root.addEventListener("pointerdown", () => { cancelRail(root); interaction(); }, { passive: true });
    root.addEventListener("wheel", () => { cancelRail(root); interaction(); }, { passive: true });
    root.addEventListener("keydown", interaction);
    root.addEventListener("focusin", () => { if (keyboardFocus()) stop(); });
    root.addEventListener("focusout", () => queueMicrotask(() => schedule()));
    root.addEventListener("pointerenter", (event) => { if (event.pointerType === "mouse") { hovered = true; stop(); } });
    root.addEventListener("pointerleave", () => { hovered = false; schedule(); });
    root.addEventListener("glaire:manual-slide", interaction);
    const buttonHost = controlHost || host;
    buttonHost.classList.add("media-autoplay-host");
    buttonHost.append(control);
    update();
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
  window.GlaireMediaMotion = { photo, scrollRail, cancelRail, swipe, autoplay };
})();

;

/* Источник: assets/site.js */
/* GLAIRE — общий сценарий главной и пяти направлений.
   Порядок разделов: контент и медиа → настройки → изображения → карта →
   галереи/видео → локальная админка → навигация.
   Общие тексты: CONFIG_DEFAULT; тексты направлений: content/services.json.
   Этот файл выполняется в конце body перед общим праздничным сценарием:
   так ссылки DIKIDI готовы к созданию колеса. Порядок script сохраняется при сборке. */

/*
      ======================================================================
      JavaScript страницы
      ----------------------------------------------------------------------
      Что делает код ниже:
      1. Читает значения из CONFIG_DEFAULT и localStorage
      2. Подставляет тексты, ссылки, изображения, QR и видео
      3. Управляет картой, бонусом, слайдерами и локальной админкой
      Если хочется менять контент вручную, чаще всего достаточно блока
      CONFIG_DEFAULT чуть ниже.
      ======================================================================
    */

/*
        Дефолтные значения сайта.
        Если в localStorage ничего нет, страница берёт данные отсюда.
        Важно для SEO:
        - единый адрес: г. Пермь, ул. Пионерская, 15
        - основные услуги: парикмахер, колорист, окрашивание, стрижки,
          уход, реконструкции, модификации и консультация перед записью
        - верхние meta и Schema.org в <head> должны совпадать с этими
          формулировками, чтобы поисковики не видели разные версии.
      */
// Порядок фотографий соответствует спискам, переданным Валерием.
// Cloudinary преобразует HEIC в совместимый формат без кадрирования.
const STUDIO_PHOTOS = [
  "https://res.cloudinary.com/dhb13tygy/image/upload/v1793126750/IMG_3907_h6ghr5.heic",
  "https://res.cloudinary.com/dhb13tygy/image/upload/v1793126773/IMG_3901_odph7p.heic",
  "https://res.cloudinary.com/dhb13tygy/image/upload/v1793126768/IMG_3866_ibtcbl.heic",
  "https://res.cloudinary.com/dhb13tygy/image/upload/v1793126785/IMG_3912_qyhcwi.heic",
  "https://res.cloudinary.com/dhb13tygy/image/upload/v1793126876/IMG_3911_fjmsnd.heic",
  "https://res.cloudinary.com/dhb13tygy/image/upload/v1793126751/IMG_3898_ffpt2z.heic",
  "https://res.cloudinary.com/dhb13tygy/image/upload/v1793126754/IMG_8681_tk6vh1.heic",
  "https://res.cloudinary.com/dhb13tygy/image/upload/v1793126753/IMG_3876_j72chp.heic",
  "https://res.cloudinary.com/dhb13tygy/image/upload/v1793126751/IMG_3908_bw4va2.heic",
  "https://res.cloudinary.com/dhb13tygy/image/upload/v1793126752/IMG_3885_rdlvhk.heic",
  "https://res.cloudinary.com/dhb13tygy/image/upload/v1793126768/IMG_3862_qh1avn.heic",
  "https://res.cloudinary.com/dhb13tygy/image/upload/v1793126775/IMG_3896_lwohfs.heic",
];
const MASTER_PHOTOS = [
  "https://res.cloudinary.com/dhb13tygy/image/upload/v1793128864/IMG_3814_gzes63.jpg",
  "https://res.cloudinary.com/dhb13tygy/image/upload/v1793128859/IMG_2737_hjlmbx.jpg",
  "https://res.cloudinary.com/dhb13tygy/image/upload/v1793128855/2026-04-29_11-21-38_ffodjc.jpg",
  "https://res.cloudinary.com/dhb13tygy/image/upload/v1793128857/2026-04-21_17-27-30_rie6h8.jpg",
  "https://res.cloudinary.com/dhb13tygy/image/upload/v1793128853/c5cd10d5466937056ee7392c56e2baea_ujv7v5.jpg",
  "https://res.cloudinary.com/dhb13tygy/image/upload/v1793128852/IMG_1285_xozjzc.jpg",
  "https://res.cloudinary.com/dhb13tygy/image/upload/v1793128859/IMG_2715_xxkvmj.jpg",
  "https://res.cloudinary.com/dhb13tygy/image/upload/v1793128856/2026-02-20_14-52-05_lykvs5.jpg",
  "https://res.cloudinary.com/dhb13tygy/image/upload/v1793128856/2026-05-22_15-16-56_hbe5ix.jpg",
  "https://res.cloudinary.com/dhb13tygy/image/upload/v1793128854/IMG_2739_hvgg5b.jpg",
  "https://res.cloudinary.com/dhb13tygy/image/upload/v1793128852/IMG_1279_mmamop.jpg",
  "https://res.cloudinary.com/dhb13tygy/image/upload/v1793128862/2026-02-20_14-52-13_vqlojd.jpg",
  "https://res.cloudinary.com/dhb13tygy/image/upload/v1793128858/IMG_3799_scxqwf.jpg",
  "https://res.cloudinary.com/dhb13tygy/image/upload/v1793128854/2026-04-29_11-24-21_aezhib.jpg",
];
const GALLERY_REVISION = "2026-10-28-ordered-galleries";
const WORKS_REVISION = "2026-10-28-four-client-works";
const NEW_WORKS = [
  {
    title: "Глубокий красный и уход",
    note: "Окрашивание в глубокий красный с естественными переливами. Уход дополняет цвет и подчёркивает блеск длины.",
    tags: "Окрашивание\nУход",
    photos: [
      "https://res.cloudinary.com/dhb13tygy/image/upload/v1793129155/IMG_3207_dxl5mt.jpg",
      "https://res.cloudinary.com/dhb13tygy/image/upload/v1793129153/IMG_3198_ubfbfn.jpg",
    ],
  },
  {
    title: "Ботокс для волос",
    note: "Ботокс для волос: ровное полотно, аккуратный блеск и более собранный вид длины.",
    tags: "Ботокс для волос",
    photos: [
      "https://res.cloudinary.com/dhb13tygy/image/upload/v1793129156/IMG_1782_nawhqt.jpg",
      "https://res.cloudinary.com/dhb13tygy/image/upload/v1793129152/IMG_1785_y7lkpg.jpg",
    ],
  },
  {
    title: "Системное восстановление",
    note: "Системное восстановление с акцентом на состояние длины. На фото — ровное полотно и мягкий естественный блеск.",
    tags: "Восстановление\nУход",
    photos: [
      "https://res.cloudinary.com/dhb13tygy/image/upload/v1793129151/IMG_1718_e6exa6.jpg",
      "https://res.cloudinary.com/dhb13tygy/image/upload/v1793129151/IMG_1719_vw9r6o.jpg",
    ],
  },
  {
    title: "Кератиновое выпрямление",
    note: "Кератиновое выпрямление для гладкой длины. Ровное полотно, аккуратные кончики и естественный блеск.",
    tags: "Кератиновое выпрямление",
    photos: [
      "https://res.cloudinary.com/dhb13tygy/image/upload/v1793129152/IMG_1758_qhpqbe.jpg",
      "https://res.cloudinary.com/dhb13tygy/image/upload/v1793129155/IMG_1757_eil4m3.jpg",
    ],
  },
];
const CONFIG_DEFAULT = {
  /* Основные ссылки, логотип и общие изображения */
  infoUrl: "https://t.me/glaire_haircare_perm",
  bookUrl: "https://dikidi.net/#widget=221806",
  mapEmbedUrl:
    "https://yandex.com/map-widget/v1/?ll=56.248626%2C57.996496&mode=search&oid=208558029908&ol=biz&z=18",
  brandImage:
    "https://res.cloudinary.com/dhb13tygy/image/upload/v1775644952/Group_17_gwygic.png",
  brandSub: "студия GLAIRE | Пермь",
  ...Object.fromEntries(
    STUDIO_PHOTOS.map((url, index) => [`heroSlide${index + 1}`, url]),
  ),
  ...Object.fromEntries(
    MASTER_PHOTOS.map((url, index) => [
      index ? `masterPhoto${index + 1}` : "masterPhoto",
      url,
    ]),
  ),
  ...Object.fromEntries(
    NEW_WORKS.flatMap((work, index) => [
      [`newWork${index + 1}Title`, work.title],
      [`newWork${index + 1}Note`, work.note],
      [`newWork${index + 1}Photo1`, work.photos[0]],
      [`newWork${index + 1}Photo2`, work.photos[1]],
    ]),
  ),
  galleryRevision: GALLERY_REVISION,
  worksRevision: WORKS_REVISION,
  consultQr:
    "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1775644812/qr_%D0%BA%D0%BE%D0%BD%D1%81%D1%83%D0%BB%D1%8C%D1%82%D0%B0%D1%86%D0%B8%D1%8F_%D1%87%D0%B0%D1%82_xbo5br.png",
  telegramQr:
    "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1775644812/telegram_qr_kczbjt.png",
  vkQr: "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1775644812/vk_qr_lv3vds.png",
  consultQrLink: "https://t.me/glaire_haircare_perm_admin",
  telegramQrLink: "https://t.me/glaire_haircare_perm",
  vkQrLink: "https://vk.com/glaire_haircare_perm",
  mobileMenuPhone: "+7 (992) 213-82-59",
  mobileMenuHours: "Ежедневно с 9:00 до 21:00",
  navInfoLabel: "Консультация",
  navBookLabel: "Записаться",

  /* Первый экран: заголовок, кнопки и карточки преимуществ */
  heroEyebrow: "Парикмахер и колорист в Перми",
  heroTitle: "GLAIRE — Пространство красоты в Перми",
  heroText:
    "Работаем по состоянию волос и задаче, с которой вы приходите. Подбираем формат: стрижка, окрашивание, уход, реконструкция, модификация или комплекс — чтобы результат выглядел аккуратно и удобно носился каждый день.",
  heroBookLabel: "Записаться в DIKIDI",
  heroInfoLabel: "Задать вопрос перед визитом",
  heroSliderCaption: "Пространство студии",
  heroMetaTitle1: "Уход и состояние",
  heroMetaText1:
    "Каждая процедура подбирается по состоянию длины, кожи головы и вашему реальному запросу.",
  heroMetaTitle2: "Окрашивание и образ",
  heroMetaText2:
    "Цвет, форма и уход собираются как единая система, чтобы результат выглядел цельно и носился красиво.",
  heroMetaTitle3: "Понятный путь до записи",
  heroMetaText3:
    "Можно спокойно посмотреть подход студии, задать вопрос и перейти к записи тогда, когда это удобно.",

  /* Правая колонка первого экрана: контакты, карта и QR-коды */
  contactText:
    "Всё, что нужно перед визитом, собрано в одном месте: где находится студия, как связаться и куда перейти для записи.",
  locationTitle: "адрес студии в Перми",
  addressText: "г. Пермь, ул. Пионерская, 15",
  telegramQrTitle: "Telegram",
  telegramQrText:
    "Быстрый способ написать, отправить фото волос и уточнить детали перед визитом.",
  vkQrTitle: "VK",
  vkQrText:
    "Удобно, если хочется посмотреть контент студии и перейти к общению в привычном формате.",

  /* Блок бонуса со стиранием верхнего слоя */
  bonusEyebrow: "Бонус перед записью",
  bonusTitle: "Откройте персональный бонус",
  bonusText:
    "Это не шумная акция, а мягкая привилегия от студии. Механика помогает начать знакомство спокойно: сначала интерес, затем запись на удобное время.",
  scratchLabel: "Ваш бонус GLAIRE",
  scratchSwipeHint: "Ведите влево и вправо",
  scratchHint: "Сохраните бонус скриншотом и покажите его при записи.",
  scratchResetLabel: "Открыть ещё раз",
  bonusSideTitle1: "Как это работает ?",
  bonusSideText1:
    "Это не случайная акция, а дополнительный этап работы с клиентом.\nМожно заранее получить небольшой бонус к визиту, протестировать формат работы или упростить выбор услуги перед записью.",
  bonusSideTitle2: "Что можно открыть ?",
  bonusSideList:
    "Комплимент к визиту\nДополнительный этап ухода\nЗащиту цвета в подарок\nПриоритет по свободным датам\nСекретный бонус от GLAIRE",
  bonusSideTitle3: "Как использовать бонус ?",
  bonusSideText3:
    "После открытия бонуса можно сразу перейти к записи или написать перед визитом. Лучше сохранить результат скриншотом и показать его при записи, чтобы бонус было удобно активировать.",
  scratchPrize1Title: "Комплимент к визиту",
  scratchPrize1Text:
    "Небольшая привилегия от студии, которую можно активировать на ближайшем визите.",
  scratchPrize2Title: "Уход в подарок",
  scratchPrize2Text:
    "Дополнительный этап ухода внутри ближайшей записи без доплаты.",
  scratchPrize3Title: "Защита цвета",
  scratchPrize3Text:
    "Бонус для окрашивания: поддержка чистоты и стойкости оттенка.",
  scratchPrize4Title: "Приоритет по окнам",
  scratchPrize4Text:
    "Если появится удобное место раньше, у вас будет приоритет на перенос.",
  scratchPrize5Title: "Секретный бонус GLAIRE",
  scratchPrize5Text:
    "Персональная привилегия, которую можно обсудить при записи или консультации.",
  scratchPrize6Title: "Мини-ритуал блеска",
  scratchPrize6Text:
    "Лёгкий завершающий этап, который делает волосы визуально более гладкими и собранными.",
  scratchPrize7Title: "Бонус к домашнему уходу",
  scratchPrize7Text:
    "Подсказка по домашнему уходу и продукту, который лучше подойдёт именно под текущее состояние длины.",
  scratchPrize8Title: "Тёплый welcome-комплимент",
  scratchPrize8Text:
    "Небольшой знак внимания от студии, который приятно активировать на ближайшем визите.",
  scratchPrize9Title: "Приоритет на консультацию",
  scratchPrize9Text:
    "Если хочется сначала всё уточнить, у вас будет более быстрый вход в диалог перед записью.",
  scratchPrize10Title: "Сюрприз в день визита",
  scratchPrize10Text:
    "Небольшой скрытый бонус, который раскрывается уже ближе к самой записи.",

  /* Блок о мастере */
  masterSectionEyebrow: "О мастере",
  masterTitle: "Понятно, к кому вы записываетесь и какой подход вас ждёт",
  masterText: "",
  masterEyebrow: "Основной мастер студии",
  masterName: "Домнин Валерий",
  masterRole:
    "Парикмахер, колорист, стрижки, уход, модификации, окрашивания и сопровождение по домашнему уходу",
  masterDescription:
    "Работа строится вокруг состояния волос, мягкого сервиса и результата, который красиво носится после визита. В фокусе парикмахерские услуги, колористика, стрижки, уход, реконструкции и модификации волос в Перми.",
  masterPointTitle1: "Сначала разбираем задачу",
  masterPointText1:
    "Учитываются история волос, желаемый результат, домашний уход и то, как вы хотите чувствовать себя после визита.",
  masterPointTitle2: "Результат должен носиться",
  masterPointText2:
    "Важен не только эффект в кресле, но и то, как волосы выглядят через неделю, месяц и между визитами.",
  masterPointTitle3: "Коммуникация без давления",
  masterPointText3:
    "Можно спокойно задать вопрос, уточнить детали и выбрать формат, который действительно подходит именно вам.",

  /* Соцсети мастера и их ссылки */
  socialsTitle: "Соц.сети мастера",
  socialsText: "",
  socialsEmptyText:
    "Актуальные каналы связи мастера появятся здесь, если один из основных переходов временно недоступен.",
  socialTelegramUrl: "https://t.me/glaire_haircare_perm",
  socialVkUrl: "https://vk.com/glaire_haircare_perm",
  socialInstagramUrl:
    "https://www.instagram.com/glaire_haircare_perm?igsh=enpodXFjNXo1a2Zr&utm_source=qr",
  socialTiktokUrl: "https://www.tiktok.com/@glaire.haircare.perm",
  masterSocialTelegramUrl: "https://t.me/glaire_haircare_perm_admin",
  masterSocialVkUrl: "https://vk.com/valeradomnin2019",
  masterSocialInstagramUrl: "https://www.instagram.com/reald1v3rse/",

  /* Блок с вертикальными видео */
  contentEyebrow: "Контент студии",
  contentTitle: "Почувствуйте студию через видео контент",
  contentLead:
    "Атмосфера студии, советы по уходу, результаты и любимые продукты, которые помогают мягко понять подход GLAIRE ещё до записи.",
  contentNote: "",
  contentBadge1: "Восстановление волос",
  contentTitle1: "Обзор системы Digital color",
  contentText1:
    "    Обзор профессиональной системы восстановления Digital Color с акцентом на технологию, последовательность работы и состояние волос.",
  contentVideo1:
    "https://res.cloudinary.com/dhb13tygy/video/upload/v1782890784/2026-05-06_13-54-16_1_vxoupp.mp4",
  contentBadge2: "Обзор работ",
  contentTitle2: "А вы уже готовы к отпуску ?",
  contentText2:
    "    Показали, как готовим волосы к отпуску: обновляем цвет, освежаем форму, подбираем уход и работаем с восстановлением по состоянию волос.",
  contentVideo2:
    "https://res.cloudinary.com/dhb13tygy/video/upload/v1782889924/copy_A4298B4C-7C00-4C3C-8170-0E1E07CF58D0_sdxl6f.mp4",
  contentBadge3: "Эстетический уход",
  contentTitle3: "Пилинг и уход за кожей головы",
  contentText3:
    "О пилинге FOLLIMED и косметическом уходе за кожей головы. Обсуждаем очищение и домашний уход в рамках эстетического направления GLAIRE.",
  contentVideo3:
    "https://res.cloudinary.com/dhb13tygy/video/upload/v1782890335/%D0%B3%D0%BE%D1%82%D0%BE%D0%B2%D0%BE_%D0%BF%D0%B8%D0%BB%D0%BB%D0%B8%D0%BD%D0%B3_%D0%BE%D0%B1%D0%B7%D0%BE%D1%80_1_fceguy.mp4",
  contentBadge4: "Техника окрашивания",
  contentTitle4: "AirTouch и мягкие переходы",
  contentText4:
    "Исправили сложную переосветлённую базу, выровняли качество волос и выполнили AirTouch с более чистым и естественным переходом цвета. Выполнили укладку на локоны.",
  contentVideo4:
    "https://res.cloudinary.com/dhb13tygy/video/upload/v1782889333/copy_8D46F568-389C-4BC5-B529-30D308B88D09_hclr1o.mov",
  contentBadge5: "Подробный обзор",
  contentTitle5: "Система восстановления Digital color - от а до я ",
  contentText5:
    "Подробный обзор системы восстановления Digital Color: каждый этап, технология работы и всё, что важно знать о процедуре до записи.",
  contentVideo5:
    "https://res.cloudinary.com/dhb13tygy/video/upload/v1782890527/2026-05-14_12-33-16_dontoy.mp4",
  contentBadge6: "Знакомство",
  contentTitle6: "Давайте познакомимся",
  contentText6:
    "Короткий формат, который помогает почувствовать пространство, темп и настроение визита ещё до записи.",
  contentVideo6:
    "https://res.cloudinary.com/dhb13tygy/video/upload/q_auto/f_auto/v1775594089/IMG_3854.MOV--online-audio-convert.com.mp4_sswt4d.mp4",
  contentBadge7: "Познавательно",
  contentTitle7: "Интересные факты",
  contentText7:
    "Формат для простых советов: как поддерживать результат, что важно после окрашивания и на что смотреть дома.",
  contentVideo7:
    "https://res.cloudinary.com/dhb13tygy/video/upload/q_auto/f_auto/v1775594091/1511384747569664428.MP4--online-audio-convert.com.mp4_cbfxos.mp4",
  contentBadge8: "Окошки",
  contentTitle8: "Открыта запись",
  contentText8:
    "Актуальные даты и время для записи, чтобы заранее выбрать удобный слот и спокойно спланировать визит.",
  contentVideo8:
    "https://res.cloudinary.com/dhb13tygy/video/upload/q_auto/f_auto/v1775762946/copy_A9C1019D-0792-4E3A-81E7-8960C959AA7C.MOV--online-audio-convert.com_vxza3t.mp4",
  contentBadge9: "Купоны",
  contentTitle9: "Закулисье GLAIRE",
  contentText9:
    "Сделали для вас сертификаты со скрытым номиналом. Каждый с секретным сюрпризом и бонусом.",
  contentVideo9:
    "https://res.cloudinary.com/dhb13tygy/video/upload/q_auto/f_auto/v1775762975/-2890979638812717924_w6spqm.mp4",

  /* Блок работ: фото моделей, теги и карточки с описанием */
  worksEyebrow: "Направления работы",
  worksTitle: "То, за чем чаще всего приходят в GLAIRE",
  worksNote: "",
  worksTags: "Окрашивание\nВыход из блонда\nУход\nСтрижка\nУкладка",
  worksInfoEyebrow: "Что получает клиент",
  worksInfoLead:
    "Работа строится не только на визуальном результате в день визита, но и на том, как волосы ведут себя дальше.",
  worksItemTitle3: "Чистое окрашивание",
  worksItemText3:
    "Работа с оттенком строится так, чтобы цвет смотрелся красиво, подходил вам и не спорил с качеством длины. Учитываем базу, прошлые процедуры и состояние волос перед началом работы.",
  worksItemTitle2: "Уход и восстановление",
  worksItemText2:
    "Если волосам нужен более спокойный, собранный вид, подбирается формат ухода без лишних обещаний и перегрузки. Смотрим на текущее состояние длины и подбираем решение под конкретную задачу.  ",
  worksItemTitle5: "Поддержка результата",
  worksItemText5:
    "Важно не только сделать, но и сохранить. Объясняем, как поддерживать результат между визитами без сложных схем. Даём ориентиры по уходу и корректировке состояния волос со временем.",
  worksItemTitle4: "Понятный домашний уход",
  worksItemText4:
    "После визита остаётся не список продуктов, а понятная система: что делать с волосами в повседневной жизни. Объясняем, как поддерживать результат без сложных схем и перегрузки. Уход подбирается так, чтобы он реально работал и был удобен в использовании.",
  worksItemTitle1: "Сопровождение до и после визита",
  worksItemText1:
    "Консультация перед визитом. Если появляются вопросы по уходу, оттенку или поддержанию результата, остаётся понятная точка контакта. Можно заранее обсудить задачу, отправить фото и получить ориентир по работе.  ",

  /* Блок актуального: акции, новости и другие поводы написать */
  newsEyebrow: "Сейчас в студии",
  newsTitle: "Актуальные акции GLAIRE",
  newsLead:
    "Здесь собраны актуальные предложения GLAIRE: комплексы, специальные условия и форматы, с которых удобно начать или обновить результат.",
  newsHint: "Нажмите на карточку, чтобы воспользоваться акцией.",
  newsBadge1: "Модификация",
  newsTitle1: "WINTER RESET",
  newsText1: "Реконструкция длины с оценкой состояния волос и кожи головы.",
  newsImage1:
    "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1776415989/%D0%90%D0%9A%D0%A6%D0%98%D0%AF_1_pbznet.png",
  newsBadge2: "Уход",
  newsTitle2: "SIGNATURE LOOK",
  newsText2: "Окрашивание, форма и уход собираются в единый результат.",
  newsImage2:
    "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1775671465/%D0%90%D0%9A%D0%A6%D0%98%D0%AF_2_sfqwvh.png",
  newsBadge3: "Окрашивание",
  newsTitle3: "COLOR ARCHITECT",
  newsText3:
    "При окрашивании добавляем уход и этап стабилизации цвета в подарок.",
  newsImage3:
    "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1775671458/%D0%90%D0%9A%D0%A6%D0%98%D0%AF_3_kxybn7.png",
  newsBadge4: "Уход в комплексе",
  newsTitle4: "Добавьте уход к стрижке и окрашиванию",
  newsText4:
    "Скидка на уход: 10% со стрижкой, 20% с окрашиванием, 25% со стрижкой и окрашиванием. За один визит; скидки не суммируются.",
  newsImage4:
    "https://res.cloudinary.com/dhb13tygy/image/upload/v1793129267/018F7EA8-53AF-4867-9DBA-2FF6CCFAA51F_jmrpaw.jpg",
  newsBadge5: "Разглаживание",
  newsTitle5: "Кератиновое выпрямление / ботокс для волос",
  newsText5:
    "До плеч — 4 000 ₽, ниже плеч — 6 000 ₽. Подбор процедуры — после консультации.",
  newsImage5:
    "https://res.cloudinary.com/dhb13tygy/image/upload/v1793129267/E67CCF94-D69A-4801-BB23-736748BDB90D_kbmdud.png",

  /* Блок консультации перед записью */
  consultEyebrow: "Если хочется сначала уточнить",
  consultTitle: "Можно начать с короткого вопроса.",
  consultText:
    "Если нужно уточнить про состояние волос, объём работы, длительность визита или формат окрашивания, лучше сначала написать. Так записываться спокойнее и понятнее.",
  consultNote:
    "Сканируйте QR и перейдите в удобный канал для первого контакта. Здесь можно отправить фото длины, описать задачу и получить предварительный ориентир перед записью.",
  visitEyebrow: "Перед первым визитом",
  visitTitle: "Как проходит первый визит в GLAIRE",
  visitText:
    "Можно не разбираться во всех нюансах заранее. Достаточно описать задачу или отправить фото — дальше поможем сориентироваться и подобрать формат.",
  visitItems:
    "Сначала смотрим состояние волос и обсуждаем задачу.\nПодбираем формат: уход - реконструкция или окрашивание.\nСогласовываем этапы работы и итоговый результат.\nОриентируем по времени и стоимости до начала.\nПосле визита даём понятные рекомендации по уходу.",

  /* Финальный блок записи и подпись в подвале */
  ctaEyebrow: "Запись",
  ctaTitle: "Перейти к онлайн записи в DIKIDI",
  ctaText:
    "Выберите удобное время и формат визита. Все доступные окна и услуги отображаются в записи.",
  ctaButtonLabel: "Перейти к записи в DIKIDI",
  footerText:
    "GLAIRE · г. Пермь, ул. Пионерская, 15 — digital-вход в запись, консультацию и актуальное студии.",
};

/*
        Список соцсетей вынесен отдельно.
        Это позволяет использовать одни и те же ссылки в нескольких блоках страницы.
      */
const STUDIO_SOCIAL_LINKS = [
  { platform: "vk", key: "socialVkUrl" },
  { platform: "instagram", key: "socialInstagramUrl" },
  { platform: "telegram", key: "socialTelegramUrl" },
  { platform: "tiktok", key: "socialTiktokUrl" },
];

const MASTER_SOCIAL_LINKS = [
  { platform: "vk", key: "masterSocialVkUrl" },
  { platform: "instagram", key: "masterSocialInstagramUrl" },
  { platform: "telegram", key: "masterSocialTelegramUrl" },
];

/*
        Служебные константы:
        STORAGE_KEY — имя сохранения в localStorage,
        ADMIN_QUERY_* — параметр, который открывает локальную админку.
      */
// Данные конкретной страницы создаёт сборщик. Видимый текст уже есть в HTML.
const PAGE_CONFIG = (() => {
  try {
    return JSON.parse(
      document.getElementById("glairePageConfig")?.textContent || "{}",
    );
  } catch {
    return {};
  }
})();
for (const [key, value] of Object.entries(PAGE_CONFIG.text || {})) {
  if (
    Object.prototype.hasOwnProperty.call(CONFIG_DEFAULT, key) &&
    typeof value === "string"
  ) {
    CONFIG_DEFAULT[key] = value;
  }
}
const PAGE_CANONICAL =
  document.querySelector('link[rel="canonical"]')?.href || "https://glaire.ru/";
const STORAGE_KEY =
  "glaireScratchLandingFinalV3" +
  (PAGE_CONFIG.slug ? `:${PAGE_CONFIG.slug}` : "");
const ADMIN_QUERY_PARAM = "admin";
const ADMIN_QUERY_VALUE = "1";
const isAdminMode =
  new URLSearchParams(window.location.search).get(ADMIN_QUERY_PARAM) ===
  ADMIN_QUERY_VALUE;

/*
        Безопасная обёртка для фоновых задач.
        Если браузер умеет requestIdleCallback, используем его.
        Если нет, даём странице сначала отрисоваться и только потом
        запускаем необязательную работу.
      */
function runWhenIdle(callback, timeout = 600) {
  if (typeof callback !== "function") return;

  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(callback, { timeout });
    return;
  }

  window.setTimeout(callback, 1);
}

/*
        Профили оптимизации для Cloudinary.
        Фотографии отдаются в качестве q_auto:good: оно заметно чище,
        чем q_auto:eco, но всё ещё не скачивает тяжёлые оригиналы.
        Размеры оставлены прежними, чтобы не уронить скорость сайта.
      */
const CLOUDINARY_IMAGE_TRANSFORMS = {
  brandImage: "f_auto,q_auto:good,c_limit,w_96",
  heroSlide1: "f_auto,q_auto:good,c_limit,w_640",
  heroSlide2: "f_auto,q_auto:good,c_limit,w_640",
  masterPhoto: "f_auto,q_auto:good,dpr_auto,c_limit,w_640",
  consultQr: "f_auto,q_auto:good,c_limit,w_256",
  telegramQr: "f_auto,q_auto:good,c_limit,w_256",
  vkQr: "f_auto,q_auto:good,c_limit,w_256",
  newsImage1: "f_auto,q_auto:good,dpr_auto,c_limit,w_720",
  newsImage2: "f_auto,q_auto:good,dpr_auto,c_limit,w_720",
  newsImage3: "f_auto,q_auto:good,dpr_auto,c_limit,w_720",
  worksSlide: "f_auto,q_auto:good,dpr_auto,c_limit,w_960",
};

/* Проверяет, является ли ссылка Cloudinary-адресом */
function isCloudinaryUrl(value) {
  return /^https?:\/\/res\.cloudinary\.com\//.test(String(value || ""));
}

/*
        Вставляет в Cloudinary-ссылку нужный набор трансформаций.
        Это даёт более лёгкий файл без ручной правки каждой ссылки.
      */
function applyCloudinaryTransform(value, transform) {
  const source = String(value || "").trim();
  if (!source || !transform || !isCloudinaryUrl(source)) return source;

  const match = source.match(/^(.*\/(?:image|video)\/upload\/)(.*)$/);
  if (!match) return source;

  const prefix = match[1];
  const remainder = match[2];
  const versionMatch = remainder.match(/(?:^|\/)(v\d+\/.*)$/);
  const tail = versionMatch ? versionMatch[1] : remainder.replace(/^\/+/, "");

  return `${prefix}${transform}/${tail}`;
}

/* Оптимизирует изображение под конкретный блок сайта */
function optimizeConfiguredImage(key, value) {
  return applyCloudinaryTransform(
    value,
    /^heroSlide\d+$/.test(key)
      ? "f_auto,q_auto:good,c_limit,w_1200"
      : /^masterPhoto\d*$/.test(key)
        ? "f_auto,q_auto:good,c_limit,w_960"
        : /^newsImage\d+$/.test(key)
          ? "f_auto,q_auto:good,c_limit,w_960"
          : CLOUDINARY_IMAGE_TRANSFORMS[key],
  );
}

/* Возвращает данные о сети, если браузер их умеет сообщать */
function getNetworkConnectionInfo() {
  return (
    navigator.connection ||
    navigator.mozConnection ||
    navigator.webkitConnection ||
    null
  );
}

/*
        Собирает трансформацию для видео с учётом ширины карточки и сети.
        Так ролик приходит ближе к реальному размеру, а не тяжёлым оригиналом.
      */
function getContentVideoTransform(cardNode) {
  const mediaNode = cardNode?.querySelector(".content-card__media") || cardNode;
  const renderedWidth = Math.max(mediaNode?.clientWidth || 0, 320);
  const dpr = Math.min(window.devicePixelRatio || 1, 1.6);
  const connection = getNetworkConnectionInfo();
  const effectiveType = String(connection?.effectiveType || "");
  const saveData = Boolean(connection?.saveData);

  let targetWidth = Math.ceil(renderedWidth * dpr);
  let quality = "q_auto:eco";

  if (saveData || /slow-2g|2g/.test(effectiveType)) {
    targetWidth = Math.min(targetWidth, 360);
    quality = "q_auto:eco";
  } else if (effectiveType === "3g") {
    targetWidth = Math.min(targetWidth, 400);
    quality = "q_auto:eco";
  } else {
    targetWidth = Math.min(targetWidth, 420);
  }

  targetWidth = Math.max(320, targetWidth);
  return `f_auto,${quality},vc_auto,w_${targetWidth},c_limit`;
}

/* Оптимизирует видео под конкретную карточку контента */
function optimizeConfiguredVideo(value, cardNode) {
  return applyCloudinaryTransform(value, getContentVideoTransform(cardNode));
}

/*
        Делает лёгкую обложку для видео из того же Cloudinary-ролика.
        Так карточка быстрее выглядит готовой, пока сам ролик ещё загружается.
      */
function optimizeConfiguredVideoPoster(value, cardNode) {
  const mediaNode = cardNode?.querySelector(".content-card__media") || cardNode;
  const renderedWidth = Math.max(mediaNode?.clientWidth || 0, 320);
  const dpr = Math.min(window.devicePixelRatio || 1, 1.6);
  const targetWidth = Math.max(
    320,
    Math.min(Math.ceil(renderedWidth * dpr), 540),
  );
  const posterSource = applyCloudinaryTransform(
    value,
    `f_auto,q_auto,dpr_auto,so_1,w_${targetWidth},c_limit`,
  );

  if (!posterSource) return "";
  return posterSource.replace(/\.(mp4|mov|webm)(?=$|[?#])/i, ".jpg");
}

/*
        Карта миграции старых путей к изображениям.
        Она нужна только для старых значений из localStorage: если раньше
        в админке сохранялся путь из локальной папки, сайт мягко заменит
        его на актуальную Cloudinary-ссылку без 404 и без ручной чистки.
        Слева ключ, который может прийти из config или из старой версии сайта,
        справа рабочий CDN-адрес того же файла.
      */
const IMAGE_SOURCE_ALIASES = {
  "/assets/logo/group-17.png": [
    "https://res.cloudinary.com/dhb13tygy/image/upload/v1775644952/Group_17_gwygic.png",
  ],
  "лого/Group 17.png": [
    "https://res.cloudinary.com/dhb13tygy/image/upload/v1775644952/Group_17_gwygic.png",
  ],

  "/assets/studio/studio-1.webp": [
    "https://res.cloudinary.com/dhb13tygy/image/upload/f_auto,q_auto:good,c_limit,w_1200/v1793126750/IMG_3907_h6ghr5.heic",
  ],
  "/assets/studio/studio-1.jpg": [
    "https://res.cloudinary.com/dhb13tygy/image/upload/f_auto,q_auto:good,c_limit,w_1200/v1793126750/IMG_3907_h6ghr5.heic",
  ],
  "фото помещения/IMG_1407.jpg": [
    "https://res.cloudinary.com/dhb13tygy/image/upload/f_auto,q_auto:good,c_limit,w_1200/v1793126750/IMG_3907_h6ghr5.heic",
  ],
  "/assets/studio/studio-2.webp": [
    "https://res.cloudinary.com/dhb13tygy/image/upload/f_auto,q_auto:good,c_limit,w_1200/v1793126773/IMG_3901_odph7p.heic",
  ],
  "/assets/studio/studio-2.jpg": [
    "https://res.cloudinary.com/dhb13tygy/image/upload/f_auto,q_auto:good,c_limit,w_1200/v1793126773/IMG_3901_odph7p.heic",
  ],
  "фото помещения/IMG_1415.jpg": [
    "https://res.cloudinary.com/dhb13tygy/image/upload/f_auto,q_auto:good,c_limit,w_1200/v1793126773/IMG_3901_odph7p.heic",
  ],
  "https://res.cloudinary.com/dhb13tygy/image/upload/f_auto,q_auto:eco,c_limit,w_640/v1775644872/IMG_1407_vuas5m.jpg":
    [
      "https://res.cloudinary.com/dhb13tygy/image/upload/f_auto,q_auto:good,c_limit,w_1200/v1793126750/IMG_3907_h6ghr5.heic",
    ],
  "https://res.cloudinary.com/dhb13tygy/image/upload/f_auto,q_auto:eco,c_limit,w_640/v1775644826/IMG_1415_rwscxx.jpg":
    [
      "https://res.cloudinary.com/dhb13tygy/image/upload/f_auto,q_auto:good,c_limit,w_1200/v1793126773/IMG_3901_odph7p.heic",
    ],

  "/assets/master/master-photo.webp": [
    "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1775644909/IMG_0228_wncs1p.jpg",
  ],
  "/assets/master/master-photo.jpg": [
    "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1775644909/IMG_0228_wncs1p.jpg",
  ],
  "фото мастера/IMG_0228.jpg": [
    "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1775644909/IMG_0228_wncs1p.jpg",
  ],

  "/assets/qr/consult-chat.png": [
    "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1775644812/qr_%D0%BA%D0%BE%D0%BD%D1%81%D1%83%D0%BB%D1%8C%D1%82%D0%B0%D1%86%D0%B8%D1%8F_%D1%87%D0%B0%D1%82_xbo5br.png",
  ],
  "qr/qr консультация чат.png": [
    "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1775644812/qr_%D0%BA%D0%BE%D0%BD%D1%81%D1%83%D0%BB%D1%8C%D1%82%D0%B0%D1%86%D0%B8%D1%8F_%D1%87%D0%B0%D1%82_xbo5br.png",
  ],
  "qr - код/qr консультация чат.png": [
    "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1775644812/qr_%D0%BA%D0%BE%D0%BD%D1%81%D1%83%D0%BB%D1%8C%D1%82%D0%B0%D1%86%D0%B8%D1%8F_%D1%87%D0%B0%D1%82_xbo5br.png",
  ],

  "/assets/qr/telegram-qr.png": [
    "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1775644812/telegram_qr_kczbjt.png",
  ],
  "qr/telegram qr.png": [
    "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1775644812/telegram_qr_kczbjt.png",
  ],
  "qr - код/telegram qr.png": [
    "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1775644812/telegram_qr_kczbjt.png",
  ],

  "/assets/qr/vk-qr.png": [
    "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1775644812/vk_qr_lv3vds.png",
  ],
  "qr/vk qr.png": [
    "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1775644812/vk_qr_lv3vds.png",
  ],
  "qr - код/vk qr.png": [
    "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1775644812/vk_qr_lv3vds.png",
  ],

  "/assets/models/model-1.webp": [
    "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1775647544/IMG_2860_aeyldt.jpg",
  ],
  "/assets/models/model-1.jpg": [
    "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1775647544/IMG_2860_aeyldt.jpg",
  ],
  "фото моделей/IMG_2860.jpg": [
    "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1775647544/IMG_2860_aeyldt.jpg",
  ],
  "/assets/models/model-2.webp": [
    "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1775647544/IMG_2858_qlp3y2.jpg",
  ],
  "/assets/models/model-2.jpg": [
    "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1775647544/IMG_2858_qlp3y2.jpg",
  ],
  "фото моделей/IMG_2858.jpg": [
    "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1775647544/IMG_2858_qlp3y2.jpg",
  ],
  "/assets/models/model-3.webp": [
    "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1775647546/IMG_2861_lvzm2u.jpg",
  ],
  "/assets/models/model-3.jpg": [
    "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1775647546/IMG_2861_lvzm2u.jpg",
  ],
  "фото моделей/IMG_2861.jpg": [
    "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1775647546/IMG_2861_lvzm2u.jpg",
  ],

  "/assets/news/promo-1.webp": [
    "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1776415989/%D0%90%D0%9A%D0%A6%D0%98%D0%AF_1_pbznet.png",
  ],
  "/assets/news/promo-1.jpg": [
    "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1776415989/%D0%90%D0%9A%D0%A6%D0%98%D0%AF_1_pbznet.png",
  ],
  "/assets/news/promo-1.png": [
    "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1776415989/%D0%90%D0%9A%D0%A6%D0%98%D0%AF_1_pbznet.png",
  ],
  "фото акции /АКЦИЯ 1.png": [
    "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1776415989/%D0%90%D0%9A%D0%A6%D0%98%D0%AF_1_pbznet.png",
  ],
  "фото акции/АКЦИЯ 1.png": [
    "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1776415989/%D0%90%D0%9A%D0%A6%D0%98%D0%AF_1_pbznet.png",
  ],
  "/assets/news/promo-2.webp": [
    "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1775671465/%D0%90%D0%9A%D0%A6%D0%98%D0%AF_2_sfqwvh.png",
  ],
  "/assets/news/promo-2.jpg": [
    "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1775671465/%D0%90%D0%9A%D0%A6%D0%98%D0%AF_2_sfqwvh.png",
  ],
  "/assets/news/promo-2.png": [
    "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1775671465/%D0%90%D0%9A%D0%A6%D0%98%D0%AF_2_sfqwvh.png",
  ],
  "фото акции /АКЦИЯ 2.png": [
    "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1775671465/%D0%90%D0%9A%D0%A6%D0%98%D0%AF_2_sfqwvh.png",
  ],
  "фото акции/АКЦИЯ 2.png": [
    "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1775671465/%D0%90%D0%9A%D0%A6%D0%98%D0%AF_2_sfqwvh.png",
  ],
  "/assets/news/promo-3.webp": [
    "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1775671458/%D0%90%D0%9A%D0%A6%D0%98%D0%AF_3_kxybn7.png",
  ],
  "/assets/news/promo-3.jpg": [
    "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1775671458/%D0%90%D0%9A%D0%A6%D0%98%D0%AF_3_kxybn7.png",
  ],
  "/assets/news/promo-3.png": [
    "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1775671458/%D0%90%D0%9A%D0%A6%D0%98%D0%AF_3_kxybn7.png",
  ],
  "фото акции /АКЦИЯ 3.png": [
    "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1775671458/%D0%90%D0%9A%D0%A6%D0%98%D0%AF_3_kxybn7.png",
  ],
  "фото акции/АКЦИЯ 3.png": [
    "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1775671458/%D0%90%D0%9A%D0%A6%D0%98%D0%AF_3_kxybn7.png",
  ],
};

/*
        Резервные CDN-пути по смысловым ключам.
        Раньше здесь были локальные файлы из assets и старых папок, но на
        опубликованном сайте их нет, поэтому браузер ловил 404 в консоли.
        Теперь в реальные загрузки попадают только рабочие Cloudinary URL,
        а старые локальные названия ниже остаются только как ключи миграции.
      */
const LOCAL_IMAGE_FALLBACKS = {
  brandImage: [
    "https://res.cloudinary.com/dhb13tygy/image/upload/v1775644952/Group_17_gwygic.png",
  ],
  heroSlide1: [
    "https://res.cloudinary.com/dhb13tygy/image/upload/f_auto,q_auto:good,c_limit,w_1200/v1793126750/IMG_3907_h6ghr5.heic",
  ],
  heroSlide2: [
    "https://res.cloudinary.com/dhb13tygy/image/upload/f_auto,q_auto:good,c_limit,w_1200/v1793126773/IMG_3901_odph7p.heic",
  ],
  masterPhoto: [
    "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1775644909/IMG_0228_wncs1p.jpg",
  ],
  consultQr: [
    "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1775644812/qr_%D0%BA%D0%BE%D0%BD%D1%81%D1%83%D0%BB%D1%8C%D1%82%D0%B0%D1%86%D0%B8%D1%8F_%D1%87%D0%B0%D1%82_xbo5br.png",
  ],
  telegramQr: [
    "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1775644812/telegram_qr_kczbjt.png",
  ],
  vkQr: [
    "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1775644812/vk_qr_lv3vds.png",
  ],
  newsImage1: [
    "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1776415989/%D0%90%D0%9A%D0%A6%D0%98%D0%AF_1_pbznet.png",
  ],
  newsImage2: [
    "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1775671465/%D0%90%D0%9A%D0%A6%D0%98%D0%AF_2_sfqwvh.png",
  ],
  newsImage3: [
    "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1775671458/%D0%90%D0%9A%D0%A6%D0%98%D0%AF_3_kxybn7.png",
  ],
};

/*
        Читает настройки из localStorage.
        Если сохранённых данных нет или JSON повреждён, используются дефолтные значения.
      */
function stripLegacyStudioLabel(value) {
  if (
    typeof value !== "string" ||
    /^(?:https?:|data:|blob:)/i.test(value) ||
    !/(?:студи[яиюи]|Пионерск)/i.test(value)
  )
    return value;
  return value
    .replace(
      /,\s*(?:студи[яиюи]\s*)?(?:2\s*[fф]|[fф]\s*2)(?![\p{L}\p{N}])/giu,
      "",
    )
    .replace(/(студи[яиюи])\s*(?:2\s*[fф]|[fф]\s*2)(?![\p{L}\p{N}])/giu, "$1")
    .replace(/(?<![\p{L}\p{N}])(?:2\s*[fф]|[fф]\s*2)(?![\p{L}\p{N}])/giu, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function sanitizeLocationValue(key, value) {
  const cleaned = stripLegacyStudioLabel(value);
  if (typeof cleaned !== "string" || /^(?:https?:|data:|blob:)/i.test(cleaned))
    return cleaned;
  const addresses = cleaned.matchAll(
    /(?:^|[\s,(])(?:ул\.?|улиц[а-я]*|бульвар[а-я]*|бул\.?|б-р|проспект[а-я]*|пр-т|пер\.?|переул[а-я]*)\s+([^,;:|\n]+?)[,\s]+(?:д(?:ом)?\.?\s*)?(\d+(?:[а-яa-z]|[/-]\d+)?)(?=$|[\s.,;:|!?—–])/giu,
  );
  for (const address of addresses) {
    if (
      !/^пионерск(?:ая|ой|ую)$/iu.test(address[1].trim()) ||
      address[2] !== "15"
    )
      return CONFIG_DEFAULT[key] || "";
  }
  for (const address of cleaned.matchAll(
    /пионерск(?:ая|ой|ую)\s*,?\s*(?:д(?:ом)?\.?\s*)?(\d+(?:[а-яa-z]|[/-]\d+)?)/giu,
  )) {
    if (address[1] !== "15") return CONFIG_DEFAULT[key] || "";
  }
  return cleaned;
}

function getConfig() {
  try {
    const parsedConfig = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    const nextConfig = {
      ...CONFIG_DEFAULT,
      ...parsedConfig,
    };

    /*
            Важно:
            localStorage имеет приоритет над CONFIG_DEFAULT.
            Поэтому если контент уже менялся через админку, сначала загрузятся
            именно сохранённые пользовательские значения.
          */

    const temporaryHeroTitles = [
      "GLAIRE — окрашивание, стрижки, модификации, комплексный уход за волосами в Перми",
      "GLAIRE — комплексный уход за волосами в Перми",
      "GLAIRE — окрашивание и цвет волос в Перми",
      "GLAIRE — студия ухода за волосами в Перми",
      "GLAIRE — студия красоты и ухода за волосами в Перми",
      "GLAIRE Haircare",
    ];

    if (temporaryHeroTitles.includes(nextConfig.heroTitle)) {
      nextConfig.heroTitle = CONFIG_DEFAULT.heroTitle;
    }

    if (nextConfig.heroEyebrow === "Студия GLAIRE в Перми") {
      nextConfig.heroEyebrow = CONFIG_DEFAULT.heroEyebrow;
    }

    /*
            Официальное местоположение едино для всех посетителей.
            Остальные правки из localStorage сохраняются, но адрес и карта
            всегда берутся из актуальной версии сайта.
          */
    nextConfig.addressText = CONFIG_DEFAULT.addressText;
    nextConfig.mapEmbedUrl = CONFIG_DEFAULT.mapEmbedUrl;
    // Старые сохранённые тексты не должны возвращать прежнее местоположение.
    for (const [key, value] of Object.entries(nextConfig)) {
      nextConfig[key] = sanitizeLocationValue(key, value);
    }
    // Обновляем старые сохранённые галереи, сохраняя остальные настройки.
    if (parsedConfig.worksRevision !== WORKS_REVISION) {
      NEW_WORKS.forEach((_, index) => {
        for (const field of ["Title", "Note", "Photo1", "Photo2"]) {
          const key = `newWork${index + 1}${field}`;
          nextConfig[key] = CONFIG_DEFAULT[key];
        }
      });
      nextConfig.worksRevision = WORKS_REVISION;
    }
    if (parsedConfig.galleryRevision !== GALLERY_REVISION) {
      STUDIO_PHOTOS.forEach((url, index) => {
        nextConfig[`heroSlide${index + 1}`] = url;
      });
      MASTER_PHOTOS.forEach((url, index) => {
        nextConfig[index ? `masterPhoto${index + 1}` : "masterPhoto"] = url;
      });
      nextConfig.galleryRevision = GALLERY_REVISION;
    }

    /*
            Подмена старых путей картинок на рабочие Cloudinary-ссылки.
            Это помогает, если раньше в браузере уже сохранились значения
            с русскими папками, пробелами или нестабильными именами.
          */
    const legacyAssetMap = {
      "лого/Group 17.png": CONFIG_DEFAULT.brandImage,
      "https://res.cloudinary.com/dhb13tygy/image/upload/v1775644952/Group_17_gwygic.png":
        CONFIG_DEFAULT.brandImage,
      "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1775644952/Group_17_gwygic.png":
        CONFIG_DEFAULT.brandImage,
      "фото помещения/IMG_1407.jpg": CONFIG_DEFAULT.heroSlide1,
      "/assets/studio/studio-1.webp": CONFIG_DEFAULT.heroSlide1,
      "https://res.cloudinary.com/dhb13tygy/image/upload/v1775644872/IMG_1407_vuas5m.jpg":
        CONFIG_DEFAULT.heroSlide1,
      "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1775644872/IMG_1407_vuas5m.jpg":
        CONFIG_DEFAULT.heroSlide1,
      "фото помещения/IMG_1415.jpg": CONFIG_DEFAULT.heroSlide2,
      "/assets/studio/studio-2.webp": CONFIG_DEFAULT.heroSlide2,
      "https://res.cloudinary.com/dhb13tygy/image/upload/v1775644826/IMG_1415_rwscxx.jpg":
        CONFIG_DEFAULT.heroSlide2,
      "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1775644826/IMG_1415_rwscxx.jpg":
        CONFIG_DEFAULT.heroSlide2,
      "фото мастера/IMG_0228.jpg": CONFIG_DEFAULT.masterPhoto,
      "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1775644909/IMG_0228_wncs1p.jpg":
        CONFIG_DEFAULT.masterPhoto,
      "qr/qr консультация чат.png": CONFIG_DEFAULT.consultQr,
      "qr/telegram qr.png": CONFIG_DEFAULT.telegramQr,
      "qr/vk qr.png": CONFIG_DEFAULT.vkQr,
      "qr - код/qr консультация чат.png": CONFIG_DEFAULT.consultQr,
      "qr - код/telegram qr.png": CONFIG_DEFAULT.telegramQr,
      "qr - код/vk qr.png": CONFIG_DEFAULT.vkQr,
      "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1775644812/telegram_qr_kczbjt.png":
        CONFIG_DEFAULT.telegramQr,
      "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1775644812/vk_qr_lv3vds.png":
        CONFIG_DEFAULT.vkQr,
      "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1775644812/qr_%D0%BA%D0%BE%D0%BD%D1%81%D1%83%D0%BB%D1%8C%D1%82%D0%B0%D1%86%D0%B8%D1%8F_%D1%87%D0%B0%D1%82_xbo5br.png":
        CONFIG_DEFAULT.consultQr,
      "фото акции /АКЦИЯ 1.png": CONFIG_DEFAULT.newsImage1,
      "фото акции /АКЦИЯ 2.png": CONFIG_DEFAULT.newsImage2,
      "фото акции /АКЦИЯ 3.png": CONFIG_DEFAULT.newsImage3,
      "фото акции/АКЦИЯ 1.png": CONFIG_DEFAULT.newsImage1,
      "фото акции/АКЦИЯ 2.png": CONFIG_DEFAULT.newsImage2,
      "фото акции/АКЦИЯ 3.png": CONFIG_DEFAULT.newsImage3,
      "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1776415989/%D0%90%D0%9A%D0%A6%D0%98%D0%AF_1_pbznet.png":
        CONFIG_DEFAULT.newsImage1,
      "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1775671465/%D0%90%D0%9A%D0%A6%D0%98%D0%AF_2_sfqwvh.png":
        CONFIG_DEFAULT.newsImage2,
      "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1775671458/%D0%90%D0%9A%D0%A6%D0%98%D0%AF_3_kxybn7.png":
        CONFIG_DEFAULT.newsImage3,
    };

    Object.keys(legacyAssetMap).forEach((oldPath) => {
      Object.keys(nextConfig).forEach((key) => {
        if (nextConfig[key] === oldPath) {
          nextConfig[key] = legacyAssetMap[oldPath];
        }
      });
    });

    /*
            Защитная подстановка для QR консультации.
            Если значение пустое или подставлен старый путь, берётся дефолтный QR.
          */
    if (
      !nextConfig.consultQr ||
      nextConfig.consultQr === "qr/telegram qr.png"
    ) {
      nextConfig.consultQr = CONFIG_DEFAULT.consultQr;
    }

    if (
      !nextConfig.infoUrl ||
      nextConfig.infoUrl === "https://dikidi.net/1954293?p=0.pi-ssm"
    ) {
      nextConfig.infoUrl = CONFIG_DEFAULT.infoUrl;
    }

    /*
            Защитная подстановка для фото мастера.
            Если путь не заполнен, берётся изображение по умолчанию.
          */
    if (!nextConfig.masterPhoto) {
      nextConfig.masterPhoto = CONFIG_DEFAULT.masterPhoto;
    }

    if (!nextConfig.newsImage1) {
      nextConfig.newsImage1 = CONFIG_DEFAULT.newsImage1;
    }

    if (!nextConfig.newsImage2) {
      nextConfig.newsImage2 = CONFIG_DEFAULT.newsImage2;
    }

    if (!nextConfig.newsImage3) {
      nextConfig.newsImage3 = CONFIG_DEFAULT.newsImage3;
    }

    if (!nextConfig.socialVkUrl) {
      nextConfig.socialVkUrl = CONFIG_DEFAULT.socialVkUrl;
    }

    if (!nextConfig.socialInstagramUrl) {
      nextConfig.socialInstagramUrl = CONFIG_DEFAULT.socialInstagramUrl;
    }

    if (!nextConfig.socialTelegramUrl) {
      nextConfig.socialTelegramUrl = CONFIG_DEFAULT.socialTelegramUrl;
    }

    if (!nextConfig.socialTiktokUrl) {
      nextConfig.socialTiktokUrl = CONFIG_DEFAULT.socialTiktokUrl;
    }

    if (!nextConfig.masterSocialVkUrl) {
      nextConfig.masterSocialVkUrl = CONFIG_DEFAULT.masterSocialVkUrl;
    }

    if (!nextConfig.masterSocialInstagramUrl) {
      nextConfig.masterSocialInstagramUrl =
        CONFIG_DEFAULT.masterSocialInstagramUrl;
    }

    if (!nextConfig.masterSocialTelegramUrl) {
      nextConfig.masterSocialTelegramUrl =
        CONFIG_DEFAULT.masterSocialTelegramUrl;
    }

    for (let index = 1; index <= 9; index += 1) {
      const videoKey = `contentVideo${index}`;
      if (!nextConfig[videoKey]) {
        nextConfig[videoKey] = CONFIG_DEFAULT[videoKey];
      }
    }

    const oldContentVideoOrder = [
      "https://res.cloudinary.com/dhb13tygy/video/upload/q_auto/f_auto/v1775594089/IMG_3854.MOV--online-audio-convert.com.mp4_sswt4d.mp4",
      "https://res.cloudinary.com/dhb13tygy/video/upload/q_auto/f_auto/v1775594091/1511384747569664428.MP4--online-audio-convert.com.mp4_cbfxos.mp4",
      "https://res.cloudinary.com/dhb13tygy/video/upload/q_auto/f_auto/v1775762946/copy_A9C1019D-0792-4E3A-81E7-8960C959AA7C.MOV--online-audio-convert.com_vxza3t.mp4",
      "https://res.cloudinary.com/dhb13tygy/video/upload/q_auto/f_auto/v1775762975/-2890979638812717924_w6spqm.mp4",
    ];
    const submittedContentVideoOrder = [
      "https://res.cloudinary.com/dhb13tygy/video/upload/v1782890784/2026-05-06_13-54-16_1_vxoupp.mp4",
      "https://res.cloudinary.com/dhb13tygy/video/upload/v1782889924/copy_A4298B4C-7C00-4C3C-8170-0E1E07CF58D0_sdxl6f.mp4",
      "https://res.cloudinary.com/dhb13tygy/video/upload/v1782890335/%D0%B3%D0%BE%D1%82%D0%BE%D0%B2%D0%BE_%D0%BF%D0%B8%D0%BB%D0%BB%D0%B8%D0%BD%D0%B3_%D0%BE%D0%B1%D0%B7%D0%BE%D1%80_1_fceguy.mp4",
      "https://res.cloudinary.com/dhb13tygy/video/upload/v1782889333/copy_8D46F568-389C-4BC5-B529-30D308B88D09_hclr1o.mov",
      "https://res.cloudinary.com/dhb13tygy/video/upload/v1782890527/2026-05-14_12-33-16_dontoy.mp4",
    ];
    const expectedContentVideoOrder = Array.from(
      { length: 9 },
      (unusedValue, itemIndex) =>
        CONFIG_DEFAULT[`contentVideo${itemIndex + 1}`],
    );
    const currentContentVideoOrder = Array.from(
      { length: 9 },
      (unusedValue, itemIndex) => nextConfig[`contentVideo${itemIndex + 1}`],
    );
    const hasSameVideoOrder = (expectedOrder) =>
      expectedOrder.every(
        (videoSource, itemIndex) =>
          currentContentVideoOrder[itemIndex] === videoSource,
      );
    const oldFirstWithNewTail = [
      ...oldContentVideoOrder,
      ...submittedContentVideoOrder,
    ];
    const duplicatedOldWithNewTail = [
      oldContentVideoOrder[0],
      oldContentVideoOrder[0],
      oldContentVideoOrder[0],
      oldContentVideoOrder[0],
      ...submittedContentVideoOrder,
    ];
    const oldVideosStillFirst =
      oldContentVideoOrder.every(
        (videoSource, itemIndex) =>
          currentContentVideoOrder[itemIndex] === videoSource,
      ) && !hasSameVideoOrder(expectedContentVideoOrder);
    const submittedVideosSavedAtTail =
      submittedContentVideoOrder.every(
        (videoSource, itemIndex) =>
          currentContentVideoOrder[itemIndex + 4] === videoSource,
      ) && !hasSameVideoOrder(expectedContentVideoOrder);

    if (
      hasSameVideoOrder(oldFirstWithNewTail) ||
      hasSameVideoOrder(duplicatedOldWithNewTail) ||
      oldVideosStillFirst ||
      submittedVideosSavedAtTail
    ) {
      expectedContentVideoOrder.forEach((videoSource, itemIndex) => {
        nextConfig[`contentVideo${itemIndex + 1}`] = videoSource;
      });
    }

    if (
      nextConfig.contentVideo1 ===
      "контент видео/IMG_3854.MOV--online-audio-convert.com.mp4"
    ) {
      nextConfig.contentVideo1 = CONFIG_DEFAULT.contentVideo1;
    }

    if (
      nextConfig.contentVideo2 ===
      "контент видео/1511384747569664428.MP4--online-audio-convert.com.mp4"
    ) {
      nextConfig.contentVideo2 = CONFIG_DEFAULT.contentVideo2;
    }

    if (
      nextConfig.contentVideo3 ===
      "контент видео/copy_A9C1019D-0792-4E3A-81E7-8960C959AA7C.MOV--online-audio-convert.com.mp4"
    ) {
      nextConfig.contentVideo3 = CONFIG_DEFAULT.contentVideo3;
    }

    if (nextConfig.contentVideo4 === "контент видео/-2890979638812717924.mp4") {
      nextConfig.contentVideo4 = CONFIG_DEFAULT.contentVideo4;
    }

    return nextConfig;
  } catch (error) {
    return { ...CONFIG_DEFAULT };
  }
}

/* Текущая рабочая конфигурация страницы и служебное состояние изображений */
let config = getConfig();
let heroSlides = [];
let imageLoadRequestId = 0;
// Известные размеры резервируют место до загрузки; новые снимки уточняются по naturalWidth/Height.
const IMAGE_DIMENSIONS = {
  "IMG_3207_dxl5mt.jpg": [1280, 1707],
  "IMG_3198_ubfbfn.jpg": [1280, 1707],
  "IMG_1782_nawhqt.jpg": [1280, 1707],
  "IMG_1785_y7lkpg.jpg": [1280, 1707],
  "IMG_1718_e6exa6.jpg": [1280, 1707],
  "IMG_1719_vw9r6o.jpg": [1280, 1707],
  "IMG_1758_qhpqbe.jpg": [1280, 1707],
  "IMG_1757_eil4m3.jpg": [1280, 1707],
  "%D0%90%D0%9A%D0%A6%D0%98%D0%AF_1_pbznet.png": [1280, 1920],
  "%D0%90%D0%9A%D0%A6%D0%98%D0%AF_2_sfqwvh.png": [1280, 1920],
  "%D0%90%D0%9A%D0%A6%D0%98%D0%AF_3_kxybn7.png": [1280, 1920],
  "018F7EA8-53AF-4867-9DBA-2FF6CCFAA51F_jmrpaw.jpg": [1080, 1920],
  "2026-02-20_14-52-05_lykvs5.jpg": [1280, 1707],
  "2026-02-20_14-52-13_vqlojd.jpg": [1280, 1707],
  "2026-04-21_17-27-30_rie6h8.jpg": [1080, 1920],
  "2026-04-29_11-21-38_ffodjc.jpg": [1280, 1707],
  "2026-04-29_11-24-21_aezhib.jpg": [1246, 1662],
  "2026-05-22_15-16-56_hbe5ix.jpg": [1280, 1707],
  "2026-05-22_19-55-44_1779487086534_lq9moj.heic": [1280, 1706],
  "2026-05-22_20-03-54_1779487085916_nakc0f.heic": [1280, 1707],
  "2026-06-06_20-01-40_1780792175168_ucos5d.heic": [1280, 1707],
  "c5cd10d5466937056ee7392c56e2baea_ujv7v5.jpg": [1280, 1705],
  "E67CCF94-D69A-4801-BB23-736748BDB90D_kbmdud.png": [941, 1672],
  "Group_17_gwygic.png": [100, 100],
  "IMG_1279_mmamop.jpg": [967, 1717],
  "IMG_1285_xozjzc.jpg": [873, 1541],
  "IMG_1803_tujqmt.jpg": [1280, 1707],
  "IMG_1810_texurd.jpg": [1280, 1707],
  "IMG_1813_qq1p7f.jpg": [1280, 1707],
  "IMG_1824_gpqsax.jpg": [1280, 1707],
  "IMG_1832_x7d07f.jpg": [1280, 1707],
  "IMG_1836_prvxzv.jpg": [1280, 1707],
  "IMG_2715_xxkvmj.jpg": [1280, 1707],
  "IMG_2737_hjlmbx.jpg": [1280, 1707],
  "IMG_2739_hvgg5b.jpg": [1280, 1707],
  "IMG_2858_qlp3y2.jpg": [1280, 1707],
  "IMG_2860_aeyldt.jpg": [1280, 1707],
  "IMG_2861_lvzm2u.jpg": [1280, 1707],
  "IMG_3799_scxqwf.jpg": [1280, 1707],
  "IMG_3814_gzes63.jpg": [1280, 1707],
  "IMG_3862_qh1avn.heic": [1280, 1707],
  "IMG_3866_ibtcbl.heic": [1280, 1707],
  "IMG_3876_j72chp.heic": [1280, 1707],
  "IMG_3885_rdlvhk.heic": [1280, 1707],
  "IMG_3896_lwohfs.heic": [1280, 1707],
  "IMG_3898_ffpt2z.heic": [1280, 1707],
  "IMG_3901_odph7p.heic": [1280, 1707],
  "IMG_3907_h6ghr5.heic": [1280, 1707],
  "IMG_3908_bw4va2.heic": [1280, 1707],
  "IMG_3911_fjmsnd.heic": [1280, 1707],
  "IMG_3912_qyhcwi.heic": [1280, 1707],
  "IMG_8681_tk6vh1.heic": [1280, 1707],
  "qr_%D0%BA%D0%BE%D0%BD%D1%81%D1%83%D0%BB%D1%8C%D1%82%D0%B0%D1%86%D0%B8%D1%8F_%D1%87%D0%B0%D1%82_xbo5br.png":
    [300, 300],
  "telegram_qr_kczbjt.png": [300, 303],
  "vk_qr_lv3vds.png": [300, 303],
};

function updatePhotoCounter(id, index, total) {
  const counter = document.getElementById(id);
  if (!counter) return;
  counter.textContent = total ? `${index + 1}/${total}` : "";
  counter.hidden = !total;
}

function updateMediaCardCounters() {
  function setCardCounter(media, index, total) {
    if (!media) return;
    let counter = media.querySelector(":scope > .photo-counter");
    if (!counter) {
      counter = document.createElement("span");
      counter.className = "photo-counter";
      media.append(counter);
    }
    counter.textContent = `${index + 1}/${total}`;
  }
  const videos = getConfiguredContentCards();
  contentCards.forEach((card) => {
    if (!videos.includes(card)) card.querySelector(".photo-counter")?.remove();
  });
  videos.forEach((card, index) =>
    setCardCounter(
      card.querySelector(".content-card__media"),
      index,
      videos.length,
    ),
  );
}

function describeImage(image, description) {
  if (!image) return;
  image.alt = description;
  if (description) image.title = description;
  else image.removeAttribute("title");
}

function studioPhotoDescription(index) {
  return `Фото помещения студии GLAIRE ${index + 1} — Пионерская, 15`;
}

function masterPhotoDescription(index) {
  return `Фото мастера Валерия ${index + 1} — GLAIRE, Пермь`;
}

function workPhotoDescription(procedure, workIndex, photoIndex) {
  return `Фото модели и пример работы мастера Валерия — ${procedure.title}, работа ${workIndex + 1}, фото ${photoIndex + 1} из ${procedure.slides.length}`;
}

/* Метаданные перечисляют фото, но не запускают их загрузку. */
function updatePhotoMetadata() {
  const author = { "@id": "https://glaire.ru/#valeriy" };
  const images = [];
  function addImage(id, source, caption, keywords, about) {
    if (!source || !/^https?:\/\//i.test(source)) return;
    images.push({
      "@type": "ImageObject",
      "@id": `https://glaire.ru/#image-${id}`,
      contentUrl: source,
      url: source,
      name: caption,
      caption,
      description: caption,
      inLanguage: "ru-RU",
      author,
      creator: author,
      copyrightHolder: author,
      creditText: "Валерий — GLAIRE",
      keywords,
      ...(about ? { about } : {}),
      isPartOf: { "@id": `${PAGE_CANONICAL}#webpage` },
    });
  }
  STUDIO_PHOTOS.forEach((_, index) => {
    const key = `heroSlide${index + 1}`;
    addImage(
      `studio-${index + 1}`,
      getImageCandidatesForKey(key, config[key], CONFIG_DEFAULT[key])[0],
      studioPhotoDescription(index),
      ["помещение студии", "GLAIRE", "Пионерская 15"],
      { "@id": "https://glaire.ru/#business" },
    );
  });
  MASTER_PHOTOS.forEach((_, index) => {
    const key = index ? `masterPhoto${index + 1}` : "masterPhoto";
    addImage(
      `master-${index + 1}`,
      getImageCandidatesForKey(key, config[key], CONFIG_DEFAULT[key])[0],
      masterPhotoDescription(index),
      ["фото мастера Валерия", "GLAIRE"],
      author,
    );
  });
  WORKS_PROCEDURES.forEach((procedure, workIndex) => {
    procedure.slides.forEach((slide, photoIndex) => {
      if (slide.placeholder) return;
      addImage(
        `work-${workIndex + 1}-${photoIndex + 1}`,
        slide.sources[0],
        workPhotoDescription(procedure, workIndex, photoIndex),
        [
          "фото модели",
          "пример работы мастера Валерия",
          procedure.title,
          "GLAIRE",
        ],
      );
    });
  });
  for (let index = 1; index <= 5; index++) {
    const key = `newsImage${index}`;
    if (String(config[key] || "").trim()) {
      addImage(
        `offer-${index}`,
        getImageCandidatesForKey(key, config[key], CONFIG_DEFAULT[key])[0],
        `Акция GLAIRE ${index} — ${config[`newsTitle${index}`]}`,
        ["акция GLAIRE", config[`newsTitle${index}`]],
      );
    }
  }
  for (const [id, key] of [
    ["brandIcon", "brandImage"],
    ["consultQr", "consultQr"],
    ["telegramQr", "telegramQr"],
    ["vkQr", "vkQr"],
  ]) {
    addImage(
      id,
      getImageCandidatesForKey(key, config[key], CONFIG_DEFAULT[key])[0],
      document.getElementById(id)?.alt || "GLAIRE",
      ["GLAIRE"],
    );
  }
  let metadata = document.getElementById("photoMetadata");
  if (!metadata) {
    metadata = document.createElement("script");
    metadata.id = "photoMetadata";
    metadata.type = "application/ld+json";
    metadata.setAttribute("nonce", "glaire-static");
    document.head.append(metadata);
  }
  metadata.textContent = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Person",
        "@id": author["@id"],
        name: config.masterName || "Валерий",
        url: "https://glaire.ru/#master",
        worksFor: { "@id": "https://glaire.ru/#business" },
      },
      {
        "@type": "WebPage",
        "@id": `${PAGE_CANONICAL}#webpage`,
        image: images.map((image) => ({ "@id": image["@id"] })),
      },
      ...images,
    ],
  });
}

function syncImageFrame(image, width, height) {
  if (!width || !height) return;
  image.width = width;
  image.height = height;
  if (
    image.complete &&
    image.naturalWidth === width &&
    image.naturalHeight === height
  )
    syncResponsiveImageSizes(image);
}

function syncResponsiveImageSizes(image) {
  if (!image.hasAttribute("srcset")) return;
  const frame = image.parentElement;
  const width = frame?.clientWidth || image.clientWidth;
  if (!width) return;
  const key = String(image.dataset.imageCandidate || "").match(
    /\/v\d+\/([^?#]+)/,
  )?.[1];
  const dimensions = IMAGE_DIMENSIONS[key];
  const ratio = dimensions
    ? dimensions[0] / dimensions[1]
    : image.naturalWidth / image.naturalHeight;
  const requiredWidth =
    getComputedStyle(image).objectFit === "cover" && ratio
      ? Math.max(width, (frame?.clientHeight || image.clientHeight) * ratio)
      : width;
  const sizes = `${Math.ceil(requiredWidth)}px`;
  if (image.sizes !== sizes) image.sizes = sizes;
}

const responsiveImageObserver =
  typeof ResizeObserver === "function"
    ? new ResizeObserver((entries) =>
        entries.forEach((entry) => syncResponsiveImageSizes(entry.target)),
      )
    : null;

const LOCAL_GRAPHICS = {
  "v1775644952/Group_17_gwygic.png":
    "/assets/images/graphic-brand-e9ed38d8e4-96.webp",
  "v1775644812/telegram_qr_kczbjt.png":
    "/assets/images/graphic-telegram-41493b9530-300.webp",
  "v1775644812/vk_qr_lv3vds.png":
    "/assets/images/graphic-vk-31b89f461d-300.webp",
  "v1775644812/qr_%D0%BA%D0%BE%D0%BD%D1%81%D1%83%D0%BB%D1%8C%D1%82%D0%B0%D1%86%D0%B8%D1%8F_%D1%87%D0%B0%D1%82_xbo5br.png":
    "/assets/images/graphic-consult-3d4ddebdf5-300.webp",
};

const LOCAL_PHOTO_VARIANTS = {
  "v1793129155/IMG_3207_dxl5mt.jpg": {
    base: "photo-new-red-1-92c13e407b",
    widths: [320, 640, 960, 1280],
  },
  "v1793129153/IMG_3198_ubfbfn.jpg": {
    base: "photo-new-red-2-7d94d851e2",
    widths: [320, 640, 960, 1280],
  },
  "v1793129156/IMG_1782_nawhqt.jpg": {
    base: "photo-new-botox-1-51150cb96b",
    widths: [320, 640, 960, 1280],
  },
  "v1793129152/IMG_1785_y7lkpg.jpg": {
    base: "photo-new-botox-2-19708d5cf2",
    widths: [320, 640, 960, 1280],
  },
  "v1793129151/IMG_1718_e6exa6.jpg": {
    base: "photo-new-restore-1-979919c37a",
    widths: [320, 640, 960, 1280],
  },
  "v1793129151/IMG_1719_vw9r6o.jpg": {
    base: "photo-new-restore-2-83e0c24039",
    widths: [320, 640, 960, 1280],
  },
  "v1793129152/IMG_1758_qhpqbe.jpg": {
    base: "photo-new-keratin-1-cfe4e339d5",
    widths: [320, 640, 960, 1280],
  },
  "v1793129155/IMG_1757_eil4m3.jpg": {
    base: "photo-new-keratin-2-d05c1c906f",
    widths: [320, 640, 960, 1280],
  },
  "v1793126773/IMG_3901_odph7p.heic": {
    base: "photo-studio-2-1b1d128015",
    widths: [320, 640, 960, 1280],
  },
  "v1793126768/IMG_3866_ibtcbl.heic": {
    base: "photo-studio-3-d4579584e3",
    widths: [320, 640, 960, 1280],
  },
  "v1793126785/IMG_3912_qyhcwi.heic": {
    base: "photo-studio-4-c390751e26",
    widths: [320, 640, 960, 1280],
  },
  "v1793126876/IMG_3911_fjmsnd.heic": {
    base: "photo-studio-5-d54607c38a",
    widths: [320, 640, 960, 1280],
  },
  "v1793126753/IMG_3876_j72chp.heic": {
    base: "photo-studio-8-3fa62073d4",
    widths: [320, 640, 960, 1280],
  },
  "v1793126751/IMG_3898_ffpt2z.heic": {
    base: "photo-studio-6-60d47a06b1",
    widths: [320, 640, 960, 1280],
  },
  "v1793126754/IMG_8681_tk6vh1.heic": {
    base: "photo-studio-7-da893e58e3",
    widths: [320, 640, 960, 1280],
  },
  "v1793126752/IMG_3885_rdlvhk.heic": {
    base: "photo-studio-10-75123a5f5e",
    widths: [320, 640, 960, 1280],
  },
  "v1793126775/IMG_3896_lwohfs.heic": {
    base: "photo-studio-12-29b0da551f",
    widths: [320, 640, 960, 1280],
  },
  "v1793126751/IMG_3908_bw4va2.heic": {
    base: "photo-studio-9-b250e1692e",
    widths: [320, 640, 960, 1280],
  },
  "v1793126768/IMG_3862_qh1avn.heic": {
    base: "photo-studio-11-80fceb8498",
    widths: [320, 640, 960, 1280],
  },
  "v1793128857/2026-04-21_17-27-30_rie6h8.jpg": {
    base: "photo-master-4-5a617732e7",
    widths: [320, 640, 960],
  },
  "v1793128855/2026-04-29_11-21-38_ffodjc.jpg": {
    base: "photo-master-3-30be32c03b",
    widths: [320, 640, 960, 1280],
  },
  "v1793128864/IMG_3814_gzes63.jpg": {
    base: "photo-master-1-0d8b330c56",
    widths: [320, 640, 960, 1280],
  },
  "v1793128859/IMG_2737_hjlmbx.jpg": {
    base: "photo-master-2-3e3d83d842",
    widths: [320, 640, 960, 1280],
  },
  "v1793128852/IMG_1285_xozjzc.jpg": {
    base: "photo-master-6-c44e1dcd27",
    widths: [320, 640],
  },
  "v1793128853/c5cd10d5466937056ee7392c56e2baea_ujv7v5.jpg": {
    base: "photo-master-5-d99fcb4719",
    widths: [320, 640, 960, 1280],
  },
  "v1793128859/IMG_2715_xxkvmj.jpg": {
    base: "photo-master-7-32167bf218",
    widths: [320, 640, 960, 1280],
  },
  "v1793128856/2026-02-20_14-52-05_lykvs5.jpg": {
    base: "photo-master-8-dae655d036",
    widths: [320, 640, 960, 1280],
  },
  "v1793128852/IMG_1279_mmamop.jpg": {
    base: "photo-master-11-6ccffaa740",
    widths: [320, 640, 960],
  },
  "v1793128856/2026-05-22_15-16-56_hbe5ix.jpg": {
    base: "photo-master-9-02f4179c91",
    widths: [320, 640, 960, 1280],
  },
  "v1793128862/2026-02-20_14-52-13_vqlojd.jpg": {
    base: "photo-master-12-aaf397e71d",
    widths: [320, 640, 960, 1280],
  },
  "v1793128854/IMG_2739_hvgg5b.jpg": {
    base: "photo-master-10-388df39fbc",
    widths: [320, 640, 960, 1280],
  },
  "v1793128854/2026-04-29_11-24-21_aezhib.jpg": {
    base: "photo-master-14-f4a3211f4a",
    widths: [320, 640, 960],
  },
  "v1775647544/IMG_2858_qlp3y2.jpg": {
    base: "photo-work-1-2-a329e5fc4d",
    widths: [320, 640, 960, 1280],
  },
  "v1793128858/IMG_3799_scxqwf.jpg": {
    base: "photo-master-13-0200195984",
    widths: [320, 640, 960, 1280],
  },
  "v1775647544/IMG_2860_aeyldt.jpg": {
    base: "photo-work-1-1-69d4080106",
    widths: [320, 640, 960, 1280],
  },
  "v1782891483/2026-05-22_19-55-44_1779487086534_lq9moj.heic": {
    base: "photo-work-2-2-4dfde29fd4",
    widths: [320, 640, 960, 1280],
  },
  "v1776425441/IMG_1832_x7d07f.jpg": {
    base: "photo-work-3-1-a59cb19c01",
    widths: [320, 640, 960, 1280],
  },
  "v1782891485/2026-05-22_20-03-54_1779487085916_nakc0f.heic": {
    base: "photo-work-2-1-118e78680b",
    widths: [320, 640, 960, 1280],
  },
  "v1775647546/IMG_2861_lvzm2u.jpg": {
    base: "photo-work-1-3-4b62f19164",
    widths: [320, 640, 960, 1280],
  },
  "v1776425440/IMG_1810_texurd.jpg": {
    base: "photo-work-4-1-d121452170",
    widths: [320, 640, 960, 1280],
  },
  "v1776425441/IMG_1803_tujqmt.jpg": {
    base: "photo-work-4-2-76d3c3ca65",
    widths: [320, 640, 960, 1280],
  },
  "v1776425441/IMG_1824_gpqsax.jpg": {
    base: "photo-work-3-2-8925153f94",
    widths: [320, 640, 960, 1280],
  },
  "v1776425440/IMG_1836_prvxzv.jpg": {
    base: "photo-work-3-3-c7cdb08531",
    widths: [320, 640, 960, 1280],
  },
  "v1776425440/IMG_1813_qq1p7f.jpg": {
    base: "photo-work-4-3-01d0c267f2",
    widths: [320, 640, 960, 1280],
  },
  "v1776415989/%D0%90%D0%9A%D0%A6%D0%98%D0%AF_1_pbznet.png": {
    base: "photo-offer-1-ecef75c079",
    widths: [320, 640, 960, 1280],
  },
  "v1775671465/%D0%90%D0%9A%D0%A6%D0%98%D0%AF_2_sfqwvh.png": {
    base: "photo-offer-2-1820ec8a5d",
    widths: [320, 640, 960, 1280],
  },
  "v1782891485/2026-06-06_20-01-40_1780792175168_ucos5d.heic": {
    base: "photo-work-5-1-535abd6ffd",
    widths: [320, 640, 960, 1280],
  },
  "v1775671458/%D0%90%D0%9A%D0%A6%D0%98%D0%AF_3_kxybn7.png": {
    base: "photo-offer-3-51175803d6",
    widths: [320, 640, 960, 1280],
  },
  "v1793129267/018F7EA8-53AF-4867-9DBA-2FF6CCFAA51F_jmrpaw.jpg": {
    base: "photo-offer-4-6ceb87b80e",
    widths: [320, 640, 960],
  },
  "v1793129267/E67CCF94-D69A-4801-BB23-736748BDB90D_kbmdud.png": {
    base: "photo-offer-5-4c236113f4",
    widths: [320, 640],
  },
};

function assignResponsiveImage(image, candidate, preferLocal = true, reference = image) {
  const key = String(candidate).match(/\/v\d+\/([^?#]+)/)?.[1];
  const dimensions = IMAGE_DIMENSIONS[key];
  if (dimensions) syncImageFrame(image, ...dimensions);
  delete image.dataset.localImage;
  const revision = String(candidate).match(/\/(v\d+\/[^?#]+)/)?.[1];
  if (image.isConnected) responsiveImageObserver?.observe(image);
  if (preferLocal && LOCAL_GRAPHICS[revision]) {
    image.dataset.localImage = "1";
    image.removeAttribute("srcset");
    image.removeAttribute("sizes");
    image.src = new URL(LOCAL_GRAPHICS[revision], document.baseURI).href;
    return;
  }
  const localPhoto = preferLocal && LOCAL_PHOTO_VARIANTS[revision];
  if (localPhoto) {
    const frame = reference.parentElement;
    const ratio = dimensions ? dimensions[0] / dimensions[1] : 1;
    const renderedWidth = Math.max(
      160,
      Math.ceil(frame?.clientWidth || reference.clientWidth || 360),
      Math.ceil((frame?.clientHeight || 0) * ratio),
    );
    const source = (width) =>
      new URL(
        `/assets/images/${localPhoto.base}-${width}.webp`,
        document.baseURI,
      ).href;
    image.dataset.localImage = "1";
    image.sizes = `${renderedWidth}px`;
    image.srcset = localPhoto.widths
      .map((width) => `${source(width)} ${width}w`)
      .join(", ");
    image.src = source(
      localPhoto.widths.find((width) => width >= renderedWidth) ||
        localPhoto.widths.at(-1),
    );
    return;
  }
  if (preferLocal && candidate.includes("/v1793126750/IMG_3907_h6ghr5.heic")) {
    const widths = [320, 480, 640, 960, 1280];
    const renderedWidth = Math.max(
      160,
      Math.ceil(reference.parentElement?.clientWidth || reference.clientWidth || 360),
    );
    const source = (width) =>
      new URL(
        `/assets/images/IMG_3907_h6ghr5.heic-${width}-v1793126750.webp`,
        document.baseURI,
      ).href;
    image.dataset.localImage = "1";
    image.sizes = `${renderedWidth}px`;
    image.srcset = widths
      .map((width) => `${source(width)} ${width}w`)
      .join(", ");
    image.src = source(widths.find((width) => width >= renderedWidth) || 1280);
    return;
  }
  if (!isCloudinaryUrl(candidate)) {
    image.removeAttribute("srcset");
    image.removeAttribute("sizes");
    image.src = candidate;
    return;
  }
  const isQr = /Qr$/.test(image.id);
  const limit =
    image.id === "brandIcon"
      ? 96
      : isQr
        ? 320
        : /^newsImage/.test(image.id)
          ? 960
          : 1280;
  const maxWidth = Math.min(limit, dimensions?.[0] || limit);
  const renderedWidth = Math.max(
    48,
    Math.ceil(reference.parentElement?.clientWidth || reference.clientWidth || 360),
  );
  const widths = [
    ...new Set(
      [160, 320, 480, 640, 960, 1280]
        .filter((width) => width < maxWidth)
        .concat(maxWidth),
    ),
  ];
  const transform = (width) =>
    applyCloudinaryTransform(
      candidate,
      `f_auto,q_auto:good,c_limit,w_${width}`,
    );
  image.sizes = `${renderedWidth}px`;
  image.srcset = widths
    .map((width) => `${transform(width)} ${width}w`)
    .join(", ");
  const fallbackWidth =
    widths.find((width) => width >= renderedWidth) || maxWidth;
  image.src = transform(fallbackWidth);
}

/* Преобразует многострочный текст или строку через запятую в массив значений */
function parseListValue(value) {
  return String(value || "")
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

/*
  Проверяет, можно ли безопасно отдавать путь браузеру как src.
  Локальные старые пути нужны только для распознавания сохранённых настроек,
  но не должны реально скачиваться, иначе PageSpeed видит 404 в консоли.
*/
function isBrowserLoadableImageSource(src) {
  return /^(https?:|data:|blob:)/i.test(src);
}

/* Собирает список путей к одному и тому же файлу с учётом запасных вариантов */
function buildImageCandidateList(...values) {
  const queue = [];
  const seen = new Set();

  /* add рекурсивно добавляет сам путь и все известные запасные адреса */
  function add(value) {
    const src = String(value || "").trim();
    if (!src || seen.has(src)) return;
    seen.add(src);

    if (isBrowserLoadableImageSource(src)) {
      queue.push(src);
    }

    (IMAGE_SOURCE_ALIASES[src] || []).forEach(add);
  }

  values.forEach(add);
  return queue;
}

/* Собирает список источников для конкретного поля config без битых локальных 404 */
function getImageCandidatesForKey(key, ...values) {
  return buildImageCandidateList(
    ...values.map((value) => optimizeConfiguredImage(key, value)),
    ...(LOCAL_IMAGE_FALLBACKS[key] || []),
  );
}

/* Подставляет в DOM все тексты, связанные с data-edit */
function applyTextBindings() {
  document.querySelectorAll("[data-edit]").forEach((node) => {
    const key = node.dataset.edit;
    /* В такие узлы подставляется только текст, без HTML-разметки */
    if (Object.prototype.hasOwnProperty.call(config, key)) {
      node.textContent = config[key];
    }
  });
  applyHeroTitleLayout();
}

/*
        Собирает главный слоган первого экрана в более цельную композицию:
        название бренда остаётся отдельной строкой, а смысловая часть
        раскладывается на компактные строки ниже.
      */
function applyHeroTitleLayout() {
  const node = document.querySelector('[data-edit="heroTitle"]');
  if (!node) {
    return;
  }

  const rawTitle = (node.textContent || "").replace(/\s+/g, " ").trim();
  if (!rawTitle) {
    return;
  }

  const parts = rawTitle.split(/\s*[—-]\s*/);
  const brandText = (parts.shift() || "").trim();
  const bodyText = parts.join(" ").trim();

  if (!brandText || !bodyText) {
    node.removeAttribute("aria-label");
    node.textContent = rawTitle;
    return;
  }

  const words = bodyText.split(" ").filter(Boolean);
  const lines = [];

  if (bodyText === "Пространство красоты в Перми") {
    lines.push("Пространство", "красоты в Перми");
  } else if (bodyText === "окрашивание и сложные техники в Перми") {
    lines.push("окрашивание и", "сложные техники", "в Перми");
  } else if (words.length === 6) {
    lines.push(words.slice(0, 3).join(" "));
    lines.push(words.slice(3).join(" "));
  } else if (words.length <= 2) {
    lines.push(words.join(" "));
  } else if (words.length <= 4) {
    lines.push(words.slice(0, 2).join(" "));
    lines.push(words.slice(2).join(" "));
  } else if (words.length <= 6) {
    const middle = Math.floor(words.length / 2);
    lines.push(words.slice(0, middle).join(" "));
    lines.push(words.slice(middle).join(" "));
  } else {
    lines.push(words.slice(0, 2).join(" "));
    lines.push(words.slice(2, 4).join(" "));
    lines.push(words.slice(4).join(" "));
  }

  node.textContent = "";
  node.setAttribute("aria-label", rawTitle);

  const brandRow = document.createElement("span");
  brandRow.className = "hero-title__brand-row";

  const brandNode = document.createElement("span");
  brandNode.className = "hero-title__brand";
  brandNode.textContent = brandText;
  brandRow.appendChild(brandNode);

  const linesWrap = document.createElement("span");
  linesWrap.className = "hero-title__lines";

  lines.forEach((lineText, index) => {
    if (!lineText) {
      return;
    }
    const lineNode = document.createElement("span");
    lineNode.className = "hero-title__line";
    const wordsInLine = lineText.split(" ").filter(Boolean).length;
    if (lineText.includes(" ") && wordsInLine <= 3 && lineText.length <= 18) {
      lineNode.classList.add("hero-title__line--locked");
      lineNode.textContent = lineText.replace(/ /g, "\u00A0");
    } else {
      lineNode.textContent = lineText;
    }
    if (index) linesWrap.appendChild(document.createTextNode(" "));
    linesWrap.appendChild(lineNode);
  });

  node.append(brandRow, document.createTextNode(" "), linesWrap);
}

/* Подставляет одну и ту же ссылку в несколько кнопок */
function applyLinks(ids, url, fallbackUrl) {
  const safeUrl = (url || "").trim() || fallbackUrl;
  ids.forEach((id) => {
    /* Одна и та же ссылка может использоваться сразу в нескольких кнопках */
    const node = document.getElementById(id);
    if (node) node.href = safeUrl;
  });
}

/* Подставляет телефон в ссылку tel:, сохраняя текст отдельным полем */
function applyPhoneLink(id, value, fallbackValue) {
  const node = document.getElementById(id);
  if (!node) return;
  const safePhone = String(value || "").trim() || fallbackValue;
  const normalizedPhone = safePhone.replace(/[^\d+]/g, "");
  node.href = normalizedPhone ? `tel:${normalizedPhone}` : "#";
}

/* Подставляет один и тот же путь в несколько изображений */
function applyImageToIds(ids, value, fallbackValue, key = "") {
  const candidates = key
    ? getImageCandidatesForKey(key, value, fallbackValue)
    : buildImageCandidateList(value, fallbackValue);
  ids.forEach((id) => {
    const node = document.getElementById(id);
    if (!node) return;
    if (candidates.length) {
      applyImageFallbacks(node, candidates);
    } else {
      node.removeAttribute("src");
    }
  });
}

/* Собирает список фотографий для слайдера студии из конфигурации */
function getHeroSlides() {
  const slideKeys = STUDIO_PHOTOS.map((_, index) => `heroSlide${index + 1}`);
  const nextSlides = slideKeys
    .map((key, index) => ({
      /* Для каждого слайда храним не один путь, а очередь возможных источников */
      sources: getImageCandidatesForKey(key, config[key], CONFIG_DEFAULT[key]),
      alt: studioPhotoDescription(index),
    }))
    .filter((slide) => slide.sources.length);

  return nextSlides.length
    ? nextSlides
    : [
        {
          sources: getImageCandidatesForKey("heroSlide1"),
          alt: studioPhotoDescription(0),
        },
      ];
}

/* Тихо прогревает картинки в фоне, чтобы слайдер переключался без пустого кадра */

/* Собирает список возможных бонусов для scratch-блока */
function getScratchPrizes() {
  return Array.from({ length: 10 }, (_, index) => index + 1)
    .map((index) => ({
      title:
        config[`scratchPrize${index}Title`] ||
        CONFIG_DEFAULT[`scratchPrize${index}Title`],
      text:
        config[`scratchPrize${index}Text`] ||
        CONFIG_DEFAULT[`scratchPrize${index}Text`],
    }))
    .filter((prize) => prize.title && prize.text);
}

/* Состояние карты: какой URL уже подключён в iframe */
let currentMapUrl = "";
let mapLazyObserver = null;
let mapNetworkHintsReady = false;

/*
  Готовит iframe карты к совместимой загрузке.
  Важно: Яндекс.Карты могут показывать серый блок при sandbox/credentialless,
  поэтому безопасность держим через HTTPS, CSP и referrerpolicy, а не через
  жёсткую песочницу, которая ломает внешний виджет.
*/
function configureMapFrameCompatibility(mapFrame) {
  if (!mapFrame) return;
  mapFrame.removeAttribute("credentialless");
  mapFrame.removeAttribute("sandbox");
  mapFrame.setAttribute("allow", "fullscreen");
}

/*
  Добавляет сетевые подсказки для Яндекс.Карт только в момент загрузки карты.
  Так мобильный первый экран не тратит ресурсы на карту раньше времени.
*/
function prepareMapNetworkHints() {
  if (mapNetworkHintsReady) return;
  mapNetworkHintsReady = true;

  const hints = [
    ["preconnect", "https://yandex.com"],
    ["preconnect", "https://yastatic.net"],
    ["dns-prefetch", "https://api-maps.yandex.ru"],
    ["dns-prefetch", "https://mc.yandex.ru"],
  ];

  hints.forEach(([rel, href]) => {
    if (document.head.querySelector(`link[href="${href}"]`)) return;
    const link = document.createElement("link");
    link.rel = rel;
    link.href = href;
    if (rel === "preconnect") link.crossOrigin = "";
    document.head.appendChild(link);
  });
}

/*
  Подключает интерактивную карту сразу и не перезагружает тот же адрес.
*/
function loadMapNow(mapUrl, options = {}) {
  const { highPriority = false } = options;
  const mapEmbed = document.getElementById("mapEmbed");
  const mapFrame = document.getElementById("mapFrame");
  if (!mapEmbed || !mapFrame || !mapUrl) return;

  if (mapFrame.getAttribute("src") === mapUrl) {
    /*
      Если карта уже прописана прямо в HTML, не назначаем тот же src ещё раз.
      Для iframe это важно: повторная запись одинаковой ссылки может запустить
      тяжёлую перезагрузку карты и ухудшить LCP без всякой пользы.
    */
    currentMapUrl = mapUrl;
    mapEmbed.classList.remove("is-placeholder");
    mapEmbed.classList.remove("is-loading");
    return;
  }

  prepareMapNetworkHints();
  mapLazyObserver?.disconnect();
  mapLazyObserver = null;

  currentMapUrl = mapUrl;
  mapEmbed.classList.remove("is-placeholder");
  mapEmbed.classList.remove("is-loading");
  configureMapFrameCompatibility(mapFrame);
  mapFrame.loading = highPriority ? "eager" : "lazy";
  mapFrame.removeAttribute("fetchpriority");
  mapFrame.onload = null;
  mapFrame.src = mapUrl;
}

/*
  Карта начинает загружаться сразу; одинаковый адрес повторно не назначается.
*/
function applyMapState() {
  const embed = document.getElementById("mapEmbed");
  const frame = document.getElementById("mapFrame");
  if (!embed || !frame) return;
  const mapUrl = String(config.mapEmbedUrl || "").trim();
  if (!/^https:\/\/(?:yandex\.com|yandex\.ru)\/map-widget\/v1\//.test(mapUrl))
    return;
  loadMapNow(mapUrl, { highPriority: true });
}

/* Создаёт список элементов из текста и вставляет его в нужный контейнер */
function renderSimpleList(containerId, value, itemClassName, itemTag = "div") {
  const container = document.getElementById(containerId);
  if (!container) return;

  const items = parseListValue(value);
  container.innerHTML = "";
  items.forEach((item) => {
    const node = document.createElement(itemTag);
    node.className = itemClassName;
    node.textContent = item;
    container.appendChild(node);
  });
}

/* Рисует теги под фотографией в секции работ */
function renderWorkTags(value = config.worksTags) {
  const container = document.getElementById("worksTags");
  if (!container) return;
  container.innerHTML = "";
  parseListValue(value).forEach((item) => {
    const tag = document.createElement("span");
    tag.className = "work-tag";
    tag.textContent = item;
    container.appendChild(tag);
  });
}

/* Показывает активные соцсети и делает пустые ссылки неактивными */
function applySocialLinks() {
  function applySocialGroup(groupName, links, emptyNodeId = "") {
    let visibleCount = 0;

    links.forEach(({ platform, key }) => {
      const url = (config[key] || "").trim();
      document
        .querySelectorAll(
          `[data-social-group="${groupName}"][data-social-link="${platform}"]`,
        )
        .forEach((node) => {
          if (url) {
            node.href = url;
            node.hidden = false;
            node.classList.remove("is-inactive");
            node.removeAttribute("aria-disabled");
            node.removeAttribute("tabindex");
            visibleCount += 1;
          } else {
            node.hidden = false;
            node.removeAttribute("href");
            node.classList.add("is-inactive");
            node.setAttribute("aria-disabled", "true");
            node.tabIndex = -1;
          }
        });
    });

    document
      .querySelectorAll(`[data-socials-wrapper="${groupName}"]`)
      .forEach((node) => {
        node.hidden = false;
      });

    if (!emptyNodeId) return;
    const emptyNode = document.getElementById(emptyNodeId);
    if (!emptyNode) return;
    emptyNode.hidden = visibleCount > 0;
    emptyNode.textContent = config.socialsEmptyText;
  }

  applySocialGroup("studio", STUDIO_SOCIAL_LINKS);
  applySocialGroup("master", MASTER_SOCIAL_LINKS, "socialLinksEmpty");
}

/* Плавная смена кадра: исходные адаптивные изображения и fallback сохраняются. */
const mediaMotion = window.GlaireMediaMotion;
const photoWarmups = new Map();
function showGalleryPhoto(image, sources, onReady, onEmpty) {
  if (!mediaMotion) return applyImageFallbacks(image, sources, onReady, onEmpty);
  mediaMotion.photo(image, sources, applyImageFallbacks, onReady, onEmpty);
}

/* Прогреваем только соседей видимой галереи, не весь альбом и не карту. */
function warmGalleryPhoto(reference, sources) {
  const rect = reference?.getBoundingClientRect();
  if (!rect || rect.bottom <= 0 || rect.top >= innerHeight || document.hidden ||
      navigator.connection?.saveData || /(^|-)2g$/.test(navigator.connection?.effectiveType || "")) return;
  const candidate = sources?.[0];
  if (!candidate) return;
  const key = `${candidate}|${Math.round(rect.width)}|${Math.round(rect.height)}`;
  if (photoWarmups.has(key)) return;
  const image = new Image();
  image.decoding = "async";
  image.fetchPriority = "low";
  photoWarmups.set(key, image);
  while (photoWarmups.size > 6) photoWarmups.delete(photoWarmups.keys().next().value);
  runWhenIdle(() => assignResponsiveImage(image, candidate, true, reference), 1200);
}
function warmHeroNeighbors() {
  if (!heroSlides.length) return;
  [1, -1].forEach((step) => warmGalleryPhoto(heroSlideImage,
    heroSlides[(heroSlideIndex + step + heroSlides.length) % heroSlides.length]?.sources));
}
function warmMasterNeighbors() {
  [1, -1].forEach((step) => {
    const index = (masterSlideIndex + step + MASTER_PHOTOS.length) % MASTER_PHOTOS.length;
    const key = index ? `masterPhoto${index + 1}` : "masterPhoto";
    warmGalleryPhoto(document.getElementById("masterPhoto"),
      getImageCandidatesForKey(key, config[key], CONFIG_DEFAULT[key]));
  });
}
function warmWorksNeighbors() {
  const slides = getActiveWorksSlides();
  if (!slides.length) return;
  warmGalleryPhoto(worksSlideImage, slides[(worksSlideIndex + 1) % slides.length]?.sources);
}
function noteManualSlide(root) {
  root?.dispatchEvent(new Event("glaire:manual-slide"));
}

/* Фотографии мастера: порядок и переключение в постоянной рамке. */
let masterSlideIndex = 0;
function applyMasterPhotoState(nextIndex = masterSlideIndex) {
  const shell = document.getElementById("masterPhotoShell");
  const image = document.getElementById("masterPhoto");
  if (!shell || !image) return;
  masterSlideIndex = (nextIndex + MASTER_PHOTOS.length) % MASTER_PHOTOS.length;
  const key = masterSlideIndex
    ? `masterPhoto${masterSlideIndex + 1}`
    : "masterPhoto";
  const candidates = getImageCandidatesForKey(
    key,
    config[key],
    CONFIG_DEFAULT[key],
  );
  describeImage(image, masterPhotoDescription(masterSlideIndex));
  updatePhotoCounter(
    "masterSliderCounter",
    masterSlideIndex,
    MASTER_PHOTOS.length,
  );
  const dots = document.getElementById("masterSliderDots");
  dots.replaceChildren(
    ...MASTER_PHOTOS.map((_, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `slider__dot${index === masterSlideIndex ? " is-active" : ""}`;
      button.setAttribute("aria-label", masterPhotoDescription(index));
      button.setAttribute("aria-current", String(index === masterSlideIndex));
      button.addEventListener("click", () => applyMasterPhotoState(index));
      return button;
    }),
  );
  shell.classList.toggle("is-empty", !candidates.length);

  if (candidates.length) {
    showGalleryPhoto(
      image,
      candidates,
      () => {
        shell.classList.remove("is-empty");
        warmMasterNeighbors();
      },
      () => {
        shell.classList.add("is-empty");
      },
    );
  } else {
    image.removeAttribute("src");
  }
}

/*
        Пробует несколько путей к одной и той же картинке.
        Это полезно для GitHub Pages, если часть файлов уже лежит в assets,
        а часть ещё осталась в старых папках с русскими именами.
*/
function applyImageFallbacks(imageNode, sources, onReady, onEmpty) {
  const queue = [...new Set(sources.filter(Boolean))];
  const requestId = `${++imageLoadRequestId}`;

  imageNode.dataset.imageRequestId = requestId;
  imageNode.onerror = null;
  imageNode.onload = null;
  /*
    После первого быстрого показа с responsive srcset управление берёт JS.
    Убираем srcset/sizes, чтобы при переключении слайдов браузер не держался
    за первый кадр и не скачивал лишние варианты одной и той же фотографии.
  */

  if (!queue.length) {
    imageNode.removeAttribute("src");
    onEmpty?.();
    return;
  }

  let index = 0;

  function tryLoadCandidate() {
    const candidate = queue[index];

    if (!candidate) {
      if (imageNode.dataset.imageRequestId !== requestId) return;
      imageNode.onerror = null;
      imageNode.onload = null;
      imageNode.removeAttribute("src");
      onEmpty?.();
      return;
    }

    imageNode.onload = () => {
      if (imageNode.dataset.imageRequestId !== requestId) return;
      syncImageFrame(
        imageNode,
        imageNode.naturalWidth,
        imageNode.naturalHeight,
      );
      onReady?.();
    };
    imageNode.onerror = () => {
      if (imageNode.dataset.imageRequestId !== requestId) return;
      if (imageNode.dataset.localImage === "1") {
        assignResponsiveImage(imageNode, candidate, false);
        return;
      }
      index += 1;
      tryLoadCandidate();
    };

    /*
      Важно для скорости: ставим src сразу в реальный элемент изображения.
      Раньше картинка сначала грузилась в скрытом Image(), из-за чего
      браузер не мог нормально применить loading="lazy" и fetchpriority.
    */
    if (imageNode.dataset.imageCandidate !== candidate) {
      imageNode.dataset.imageCandidate = candidate;
      assignResponsiveImage(imageNode, candidate);
      return;
    }

    /*
      Если тот же самый src уже стоял на картинке, браузер может не вызвать
      повторный onerror. Поэтому вручную проверяем состояние и двигаемся
      дальше по запасным путям, если текущий файл уже оказался битым/пустым.
    */
    if (imageNode.complete) {
      if (imageNode.naturalWidth > 0) {
        syncImageFrame(
          imageNode,
          imageNode.naturalWidth,
          imageNode.naturalHeight,
        );
        onReady?.();
        return;
      }

      index += 1;
      tryLoadCandidate();
    }
  }

  tryLoadCandidate();
}

/*
        Обновляет одну карточку из блока актуального.
        index = "1", "2" или "3"
      */
function applyNewsCard(index) {
  const badgeNode = document.getElementById(`newsBadge${index}`);
  const titleNode = document.getElementById(`newsTitle${index}`);
  const textNode = document.getElementById(`newsText${index}`);
  const imageNode = document.getElementById(`newsImage${index}`);
  const cardNode = document.querySelector(`[data-story-card="${index}"]`);

  if (!badgeNode || !titleNode || !textNode || !imageNode || !cardNode) {
    return;
  }

  badgeNode.textContent = config[`newsBadge${index}`];
  titleNode.textContent = config[`newsTitle${index}`];
  textNode.textContent = config[`newsText${index}`];
  describeImage(
    imageNode,
    `Акция GLAIRE ${index} — ${config[`newsTitle${index}`]}`,
  );

  if (cardNode instanceof HTMLAnchorElement) {
    const storyCardLink = (
      config.consultQrLink ||
      CONFIG_DEFAULT.consultQrLink ||
      cardNode.getAttribute("href") ||
      ""
    ).trim();

    if (storyCardLink) {
      cardNode.href = storyCardLink;
    }
  }

  const imageSrc = (config[`newsImage${index}`] || "").trim();
  if (imageSrc) {
    const fallbackSources = getImageCandidatesForKey(
      `newsImage${index}`,
      imageSrc,
      CONFIG_DEFAULT[`newsImage${index}`],
    );

    applyImageFallbacks(
      imageNode,
      fallbackSources,
      () => {
        cardNode.classList.add("story-card--ready");
      },
      () => {
        cardNode.classList.remove("story-card--ready");
      },
    );
  } else {
    imageNode.removeAttribute("src");
    cardNode.classList.remove("story-card--ready");
  }
}

/*
        Обновляет одну карточку с видео в секции контента.
        index соответствует data-content-card в разметке.
      */
function applyContentCard(index) {
  const badgeNode = document.getElementById(`contentBadge${index}`);
  const titleNode = document.getElementById(`contentTitle${index}`);
  const textNode = document.getElementById(`contentText${index}`);
  const videoNode = document.getElementById(`contentVideo${index}`);
  const cardNode = document.querySelector(`[data-content-card="${index}"]`);

  if (!badgeNode || !titleNode || !textNode || !videoNode || !cardNode) {
    return;
  }

  badgeNode.textContent = config[`contentBadge${index}`];
  titleNode.textContent = config[`contentTitle${index}`];
  textNode.textContent = config[`contentText${index}`];

  /*
          Видео в секции контента больше не грузятся все сразу.
          В узле хранится только адрес, а реальная загрузка начинается
          лишь когда карточка видна в ленте.
        */
  const videoBaseSrc = (config[`contentVideo${index}`] || "").trim();
  videoNode.muted = true;
  videoNode.defaultMuted = true;
  videoNode.loop = false;
  videoNode.autoplay = true;
  videoNode.playsInline = true;
  videoNode.preload = "none";

  if (videoBaseSrc) {
    videoNode.dataset.videoBaseSrc = videoBaseSrc;
    videoNode.removeAttribute("poster");
  } else {
    videoNode.removeAttribute("data-video-base-src");
    videoNode.removeAttribute("src");
    videoNode.removeAttribute("poster");
  }

  videoNode.onloadeddata = null;
  videoNode.onerror = null;
  videoNode.dataset.activeSrc = "";
  videoNode.pause();
  cardNode.classList.remove("content-card--ready");
}

/*
        Главная синхронизация страницы.
        После вызова этой функции весь контент заново подставляется в DOM.
      */
function applyConfig() {
  applyTextBindings();
  applyImageToIds(
    ["brandIcon"],
    config.brandImage,
    CONFIG_DEFAULT.brandImage,
    "brandImage",
  );
  applyImageToIds(
    ["consultQr"],
    config.consultQr,
    CONFIG_DEFAULT.consultQr,
    "consultQr",
  );
  applyImageToIds(
    ["telegramQr"],
    config.telegramQr,
    CONFIG_DEFAULT.telegramQr,
    "telegramQr",
  );
  applyImageToIds(["vkQr"], config.vkQr, CONFIG_DEFAULT.vkQr, "vkQr");
  describeImage(
    document.getElementById("brandIcon"),
    "Логотип студии GLAIRE — мастер Валерий, Пермь",
  );
  describeImage(
    document.getElementById("consultQr"),
    "QR-код для консультации с мастером Валерием в Telegram",
  );
  describeImage(
    document.getElementById("telegramQr"),
    "QR-код Telegram студии GLAIRE — мастер Валерий",
  );
  describeImage(
    document.getElementById("vkQr"),
    "QR-код сообщества GLAIRE во ВКонтакте — мастер Валерий",
  );

  applyLinks(["infoBtnTop", "infoBtnHero"], config.infoUrl, "#consultation");
  applyLinks(
    ["bookBtnTop", "bookBtnHero", "bookBtnMaster", "bookBtnWorks", "bookBtnBottom"],
    config.bookUrl,
    "#book",
  );
  applyLinks(
    ["consultQrLink"],
    config.consultQrLink,
    "https://t.me/glaire_haircare_perm_admin",
  );
  applyLinks(
    ["telegramQrLink"],
    config.telegramQrLink,
    "https://t.me/glaire_haircare_perm",
  );
  applyLinks(
    ["vkQrLink"],
    config.vkQrLink,
    "https://vk.com/glaire_haircare_perm",
  );
  applyPhoneLink(
    "mobileMenuPhoneLink",
    config.mobileMenuPhone,
    "+7 (992) 213-82-59",
  );

  applyMapState();

  heroSlides = getHeroSlides();
  // Остальные кадры загружаются при переключении, без массовой фоновой загрузки.
  if (heroSlideIndex >= heroSlides.length) heroSlideIndex = 0;
  setHeroSlide(heroSlideIndex);

  /*
    Нижние секции не должны задерживать первый экран.
    Тексты уже есть в HTML, а фото/видео/карточки ниже спокойно
    подготавливаются после первой отрисовки.
  */
  runWhenIdle(() => {
    renderSimpleList("bonusList", config.bonusSideList, "", "li");
    renderSimpleList("visitList", config.visitItems, "future-item");
    applyMasterPhotoState();
    applySocialLinks();

    if (worksProcedureIndex >= WORKS_PROCEDURES.length) {
      worksProcedureIndex = 0;
    }
    setWorksProcedure(worksProcedureIndex, {
      animate: false,
      preserveSlide: true,
    });

    contentCards
      .map((cardNode) => cardNode.dataset.contentCard)
      .filter(Boolean)
      .forEach(applyContentCard);
    contentSequenceIndex = 0;
    contentAudioUnlocked = false;
    contentAudioNeedsInteraction = false;
    contentPendingPageAdvanceUntil = 0;
    ["1", "2", "3", "4", "5"].forEach(applyNewsCard);
    updateMediaCardCounters();
    updatePhotoMetadata();

    window.requestAnimationFrame(() => {
      applyContentSequenceState();
      updateContentTrackControls();
      scheduleContentVideoSync();
    });
  }, 900);
}

/* ------------------------------------------------------------------ */
/* Scratch-блок                                                        */
/* Логика стирания слоя и показа случайного бонуса                     */
/* ------------------------------------------------------------------ */
const scratchCanvas = document.getElementById("scratchCanvas");
const scratchShell = document.querySelector(".scratch-shell");
const scratchContext =
  scratchCanvas &&
  scratchCanvas.getContext("2d", {
    willReadFrequently: true,
  });
const prizeTitle = document.getElementById("prizeTitle");
const prizeText = document.getElementById("prizeText");
const resetScratchBtn = document.getElementById("resetScratchBtn");

/*
        Служебные флаги scratch-блока:
        рисует ли пользователь сейчас, открыт ли бонус,
        была ли уже инициализация и есть ли наблюдатель видимости.
      */
let scratchIsDrawing = false;
let scratchOpened = false;
let scratchInitialized = false;
let scratchResizeFrame = 0;
let scratchObserver = null;

/* Выбирает случайный бонус из списка и выводит его в блок */
function setRandomPrize() {
  const prizes = getScratchPrizes();
  const prize = prizes[Math.floor(Math.random() * prizes.length)];
  if (prizeTitle) prizeTitle.textContent = prize.title;
  if (prizeText) prizeText.textContent = prize.text;
}

/* Подгоняет canvas под фактический размер блока */
function resizeScratchCanvas() {
  if (!scratchCanvas || !scratchShell || !scratchContext) return;
  const rect = scratchShell.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  scratchCanvas.width = Math.max(1, Math.floor(rect.width * ratio));
  scratchCanvas.height = Math.max(1, Math.floor(rect.height * ratio));
  scratchCanvas.style.width = `${rect.width}px`;
  scratchCanvas.style.height = `${rect.height}px`;
  scratchContext.setTransform(ratio, 0, 0, ratio, 0, 0);
  drawScratchLayer();
}

/* Планирует resize canvas не чаще одного кадра */
function scheduleScratchResize() {
  if (scratchResizeFrame) return;
  scratchResizeFrame = window.requestAnimationFrame(() => {
    scratchResizeFrame = 0;
    resizeScratchCanvas();
  });
}

/* Рисует верхний слой, который стирается курсором или пальцем */
function drawScratchLayer() {
  if (!scratchShell || !scratchContext) return;
  const rect = scratchShell.getBoundingClientRect();
  scratchShell.classList.remove("is-open");

  scratchContext.globalCompositeOperation = "source-over";
  scratchContext.clearRect(0, 0, rect.width, rect.height);

  const gradient = scratchContext.createLinearGradient(
    0,
    0,
    rect.width,
    rect.height,
  );
  gradient.addColorStop(0, "#e8dfd5");
  gradient.addColorStop(0.3, "#b9aea2");
  gradient.addColorStop(0.68, "#7f756c");
  gradient.addColorStop(1, "#423a35");
  scratchContext.fillStyle = gradient;
  scratchContext.fillRect(0, 0, rect.width, rect.height);

  const glow = scratchContext.createRadialGradient(
    rect.width * 0.24,
    rect.height * 0.18,
    0,
    rect.width * 0.24,
    rect.height * 0.18,
    rect.width * 0.42,
  );
  glow.addColorStop(0, "rgba(255,255,255,0.22)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  scratchContext.fillStyle = glow;
  scratchContext.fillRect(0, 0, rect.width, rect.height);

  scratchContext.fillStyle = "rgba(255,255,255,0.1)";
  for (let index = 0; index < 80; index += 1) {
    scratchContext.beginPath();
    scratchContext.arc(
      Math.random() * rect.width,
      Math.random() * rect.height,
      Math.random() * 1.8 + 0.5,
      0,
      Math.PI * 2,
    );
    scratchContext.fill();
  }

  scratchContext.fillStyle = "rgba(255,255,255,0.78)";
  scratchContext.font = "600 18px Manrope, sans-serif";
  scratchContext.textAlign = "center";
  scratchContext.fillText("Сотрите слой", rect.width / 2, rect.height / 2 - 4);

  scratchContext.fillStyle = "rgba(255,255,255,0.58)";
  scratchContext.font = "500 12px Manrope, sans-serif";
  scratchContext.fillText(
    "Откройте свой бонус GLAIRE",
    rect.width / 2,
    rect.height / 2 + 20,
  );

  scratchContext.globalCompositeOperation = "destination-out";
  scratchOpened = false;
}

/* Вычисляет координаты указателя относительно canvas */
function getPointerPosition(event) {
  const rect = scratchCanvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

/* Стирает небольшой круг в точке касания */
function eraseAt(x, y) {
  if (!scratchContext) return;
  scratchContext.beginPath();
  scratchContext.arc(x, y, 34, 0, Math.PI * 2);
  scratchContext.fill();
}

/* Считает, какая часть верхнего слоя уже стёрта */
function getOpenedPercent() {
  if (!scratchShell || !scratchContext) return 0;
  const rect = scratchShell.getBoundingClientRect();
  const pixels = scratchContext.getImageData(
    0,
    0,
    rect.width,
    rect.height,
  ).data;
  let transparentPixels = 0;

  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] === 0) transparentPixels += 1;
  }

  return transparentPixels / (pixels.length / 4);
}

/* Полностью открывает бонус, если стёрта достаточная часть слоя */
function openIfNeeded() {
  if (!scratchShell || !scratchContext) return;
  if (getOpenedPercent() > 0.1) {
    const rect = scratchShell.getBoundingClientRect();
    scratchContext.clearRect(0, 0, rect.width, rect.height);
    scratchOpened = true;
    scratchShell.classList.add("is-open");
  }
}

/* Запускает процесс стирания */
function startScratch(event) {
  if (!scratchCanvas || scratchOpened) return;
  scratchIsDrawing = true;
  scratchCanvas.setPointerCapture?.(event.pointerId);
  const point = getPointerPosition(event);
  eraseAt(point.x, point.y);
}

/* Продолжает стирание при движении указателя */
function moveScratch(event) {
  if (!scratchIsDrawing || scratchOpened) return;
  event.preventDefault();
  const point = getPointerPosition(event);
  eraseAt(point.x, point.y);
}

/* Завершает стирание и проверяет, нужно ли открыть бонус полностью */
function endScratch(event) {
  if (!scratchIsDrawing || !scratchCanvas) return;
  scratchIsDrawing = false;
  if (scratchCanvas.hasPointerCapture?.(event.pointerId)) {
    scratchCanvas.releasePointerCapture(event.pointerId);
  }
  if (!scratchOpened) openIfNeeded();
}

/* Подключает scratch только когда пользователь реально подходит к блоку */
function initScratchOnce() {
  if (
    scratchInitialized ||
    !scratchCanvas ||
    !scratchShell ||
    !scratchContext
  ) {
    return;
  }

  scratchInitialized = true;
  scratchCanvas.addEventListener("pointerdown", startScratch);
  scratchCanvas.addEventListener("pointermove", moveScratch);
  scratchCanvas.addEventListener("pointerup", endScratch);
  scratchCanvas.addEventListener("pointercancel", endScratch);
  scratchCanvas.addEventListener("pointerleave", endScratch);
  window.addEventListener("resize", scheduleScratchResize, {
    passive: true,
  });

  resetScratchBtn?.addEventListener("click", () => {
    setRandomPrize();
    scheduleScratchResize();
  });

  setRandomPrize();
  scheduleScratchResize();
}

if (scratchCanvas && scratchShell && scratchContext) {
  if ("IntersectionObserver" in window) {
    scratchObserver = new IntersectionObserver(
      (entries) => {
        if (
          entries.some(
            (entry) => entry.isIntersecting || entry.intersectionRatio > 0,
          )
        ) {
          initScratchOnce();
          scratchObserver?.disconnect();
          scratchObserver = null;
        }
      },
      {
        rootMargin: "80px 0px",
      },
    );
    scratchObserver.observe(scratchShell);
  } else {
    initScratchOnce();
  }
}

/* ------------------------------------------------------------------ */
/* Слайдеры и горизонтальные ленты                                     */
/* Здесь собраны ссылки на DOM-элементы и логика переключения          */
/* ------------------------------------------------------------------ */
const heroSlideImage = document.getElementById("heroSlideImage");
const heroSliderViewport = document.getElementById("heroSliderViewport");
const heroSliderDots = document.getElementById("heroSliderDots");
const heroPrevBtn = document.getElementById("worksPrevBtn");
const heroNextBtn = document.getElementById("worksNextBtn");
const worksImageShell = document.getElementById("worksModelsSlider");
const worksProcedureBody = document.getElementById("worksProcedureBody");
const worksProcedureKicker = document.getElementById("worksProcedureKicker");
const worksProcedureTitle = document.getElementById("worksProcedureTitle");
const worksProcedureHint = document.getElementById("worksProcedureHint");
const worksProcedureNote = document.getElementById("worksProcedureNote");
const worksProcedurePrevBtn = document.getElementById("worksProcedurePrevBtn");
const worksProcedureNextBtn = document.getElementById("worksProcedureNextBtn");
const worksSlideImage = document.getElementById("worksSlideImage");
const worksSlidePlaceholder = document.getElementById("worksSlidePlaceholder");
const worksSlidePlaceholderTitle = document.getElementById(
  "worksSlidePlaceholderTitle",
);
const worksSlidePlaceholderText = document.getElementById(
  "worksSlidePlaceholderText",
);
const worksSliderViewport = document.getElementById("worksSliderViewport");
const worksSliderDots = document.getElementById("worksSliderDots");
const worksPrevBtn = document.getElementById("worksModelsPrevBtn");
const worksNextBtn = document.getElementById("worksModelsNextBtn");
const worksSection = document.getElementById("works");
const contentTrack = document.getElementById("contentTrack");
const contentPrevBtn = document.getElementById("contentPrevBtn");
const contentNextBtn = document.getElementById("contentNextBtn");
const contentCards = Array.from(
  document.querySelectorAll("[data-content-card]"),
);

/*
        Глобальное состояние слайдеров и видеоленты:
        здесь хранятся активные индексы, свайпы, интервалы,
        observer-объекты и логика очереди роликов со звуком.
      */
let heroSlideIndex = 0;
let worksProcedureIndex = 0;
let worksProcedureTargetIndex = 0;
let worksSlideIndex = 0;
let worksProcedureSwitchTimer = null;
let contentSwipeStartX = null;
let contentSwipeDeltaX = 0;
let contentVideoSyncFrame = 0;
let contentVideoLoadTimers = [];
let contentTrackIsActive = false;
let contentBlockedByWorks = false;
let contentWorksStopFrame = 0;
let contentTrackObserver = null;
let contentSequenceIndex = 0;
let contentAudioUnlocked = false;
let contentAudioNeedsInteraction = false;
let contentPendingPageAdvanceUntil = 0;

/* Возвращает video-элемент внутри карточки контента */
function getContentCardVideoNode(cardNode) {
  return cardNode?.querySelector(".content-card__video") || null;
}

/* Возвращает только те карточки контента, в которых реально есть видео */
function getConfiguredContentCards() {
  return contentCards.filter((cardNode) =>
    Boolean(
      String(
        getContentCardVideoNode(cardNode)?.dataset.videoBaseSrc || "",
      ).trim(),
    ),
  );
}

/* Возвращает шаг очереди: ролики должны переходить строго по одному */
function getContentSlidesPerPage() {
  return 1;
}

/* Для видеоленты один ролик равен одному шагу */
function getContentPageStartIndex(index) {
  return Math.max(index, 0);
}

/* Нормализует индекс активного ролика по кругу */
function normalizeContentSequenceIndex(nextIndex) {
  const total = getConfiguredContentCards().length;
  if (!total) return 0;
  return ((nextIndex % total) + total) % total;
}

/* Возвращает карточку, которая сейчас считается главной в очереди */
function getActiveContentSequenceCard() {
  const cards = getConfiguredContentCards();
  if (!cards.length) return null;
  contentSequenceIndex = normalizeContentSequenceIndex(contentSequenceIndex);
  return cards[contentSequenceIndex];
}

/* Ищет порядковый номер карточки внутри очереди роликов */
function getConfiguredContentCardIndex(cardNode) {
  return getConfiguredContentCards().indexOf(cardNode);
}

/* Считает, насколько карточка уже видна внутри горизонтальной ленты */
function getContentCardVisibleRatio(cardNode) {
  if (!contentTrack || !cardNode) return 0;

  const trackRect = contentTrack.getBoundingClientRect();
  const cardRect = cardNode.getBoundingClientRect();
  if (!trackRect.width || !cardRect.width) return 0;

  const visibleWidth = Math.max(
    0,
    Math.min(cardRect.right, trackRect.right) -
      Math.max(cardRect.left, trackRect.left),
  );

  return visibleWidth / Math.min(cardRect.width, trackRect.width);
}

/* Прокручивает ленту так, чтобы нужный ролик попал в видимую часть */
function scrollContentCardIntoView(cardNode) {
  if (!contentTrack || !cardNode) return;

  if (getContentCardVisibleRatio(cardNode) >= 0.55) return;

  const trackRect = contentTrack.getBoundingClientRect();
  const cardRect = cardNode.getBoundingClientRect();
  const maxScrollLeft = Math.max(
    0,
    contentTrack.scrollWidth - contentTrack.clientWidth,
  );
  let nextLeft = contentTrack.scrollLeft;

  if (cardRect.left < trackRect.left) {
    nextLeft -= trackRect.left - cardRect.left;
  } else if (cardRect.right > trackRect.right) {
    nextLeft += cardRect.right - trackRect.right;
  }

  nextLeft = Math.min(Math.max(nextLeft, 0), maxScrollLeft);

  contentTrack.scrollTo({
    left: nextLeft,
    behavior: "smooth",
  });
}

/* Синхронно переводит ролик в нужный режим по звуку */
function setContentVideoAudibleState(videoNode, shouldBeAudible) {
  if (!videoNode) return;

  videoNode.dataset.syncingAudio = "1";
  videoNode.defaultMuted = !shouldBeAudible;
  videoNode.muted = !shouldBeAudible;

  if (shouldBeAudible && videoNode.volume === 0) {
    videoNode.volume = 1;
  }

  window.setTimeout(() => {
    if (videoNode.isConnected) {
      delete videoNode.dataset.syncingAudio;
    }
  }, 0);
}

/* Обновляет, какой ролик сейчас должен быть со звуком */
function applyContentSequenceState(options = {}) {
  const { scrollIntoView = false, restartActive = false } = options;
  const activeCard = getActiveContentSequenceCard();
  if (!activeCard) return;

  if (scrollIntoView) {
    scrollContentCardIntoView(activeCard);
  }

  contentCards.forEach((cardNode) => {
    const videoNode = getContentCardVideoNode(cardNode);
    if (!videoNode) return;
    setContentVideoAudibleState(
      videoNode,
      contentAudioUnlocked && cardNode === activeCard,
    );
  });

  if (!contentTrackIsActive) return;

  if (restartActive) {
    activateContentCardVideo(activeCard, { restart: true });
    return;
  }

  scheduleContentVideoSync();
}

/* Переключает очередь на следующий ролик и зацикливает её */
function advanceContentSequence() {
  const configuredCards = getConfiguredContentCards();
  if (!configuredCards.length) return;

  contentPendingPageAdvanceUntil = Date.now() + 520;
  contentSequenceIndex = normalizeContentSequenceIndex(
    contentSequenceIndex + 1,
  );
  applyContentSequenceState({
    scrollIntoView: true,
    restartActive: true,
  });
}

/* После первого тапа по ролику пробуем включить цикл уже со звуком */
function unlockContentAudioForCard(cardNode) {
  const nextIndex = getConfiguredContentCardIndex(cardNode);
  if (nextIndex === -1) return;

  contentAudioUnlocked = true;
  contentAudioNeedsInteraction = false;
  contentSequenceIndex = nextIndex;
  applyContentSequenceState({
    restartActive: false,
  });
}

/* Сбрасывает отложенные загрузки роликов, если пользователь уже прокрутил дальше */
function clearScheduledContentVideoLoads() {
  contentVideoLoadTimers.forEach((timerId) => window.clearTimeout(timerId));
  contentVideoLoadTimers = [];
}

/*
        Мягко останавливает все ролики контент-блока.
        Видео остаются на месте с последним кадром или плейсхолдером:
        мы глушим звук и ставим паузу, но не удаляем src и не скрываем
        карточки, чтобы при прокрутке ролики никогда не пропадали.
      */
function forceStopContentVideos() {
  contentTrackIsActive = false;

  if (contentVideoSyncFrame) {
    window.cancelAnimationFrame(contentVideoSyncFrame);
    contentVideoSyncFrame = 0;
  }

  clearScheduledContentVideoLoads();
  contentCards.forEach((cardNode) => deactivateContentCardVideo(cardNode));
}

/*
        Подготавливает соседний ролик заранее, но не запускает его.
        Это убирает паузу между первым и вторым роликом на экране.
      */
function prepareContentCardVideo(cardNode) {
  const video = getContentCardVideoNode(cardNode);
  const source = video?.dataset.videoBaseSrc;
  if (!video || !source) return;
  if (!video.poster)
    video.poster = optimizeConfiguredVideoPoster(source, cardNode);
  cardNode.classList.add("content-card--poster-ready");
  if (video.paused) video.preload = "none";
  setContentVideoAudibleState(video, false);
}

/* Включает и запускает только те ролики, которые реально видны */
function activateContentCardVideo(cardNode, options = {}) {
  const { restart = false } = options;
  const videoNode = getContentCardVideoNode(cardNode);
  if (!videoNode) return;

  const videoBaseSrc = String(videoNode.dataset.videoBaseSrc || "").trim();
  const videoSrc = optimizeConfiguredVideo(videoBaseSrc, cardNode);
  if (!videoSrc) {
    cardNode.classList.remove("content-card--ready");
    return;
  }

  if (!videoNode.poster) {
    const posterSrc = optimizeConfiguredVideoPoster(videoBaseSrc, cardNode);
    if (posterSrc) videoNode.poster = posterSrc;
  }

  const activeCard = getActiveContentSequenceCard();
  const shouldBeAudible =
    contentAudioUnlocked && Boolean(activeCard) && activeCard === cardNode;

  const revealAndPlay = () => {
    cardNode.classList.add("content-card--ready");
    setContentVideoAudibleState(videoNode, shouldBeAudible);
    if (shouldBeAudible) {
      contentAudioNeedsInteraction = false;
    }

    if (restart) {
      try {
        videoNode.currentTime = 0;
      } catch (error) {
        /* Некоторые браузеры могут запрещать сброс времени до полной готовности */
      }
    }

    const playPromise = videoNode.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        if (!shouldBeAudible) return;

        contentAudioUnlocked = false;
        contentAudioNeedsInteraction = true;
        setContentVideoAudibleState(videoNode, false);

        const mutedRetry = videoNode.play();
        if (mutedRetry && typeof mutedRetry.catch === "function") {
          mutedRetry.catch(() => {});
        }
      });
    }
  };

  videoNode.onended = () => {
    if (cardNode !== getActiveContentSequenceCard()) return;
    advanceContentSequence();
  };

  if (videoNode.dataset.activeSrc !== videoSrc) {
    cardNode.classList.remove("content-card--ready");
    videoNode.onloadeddata = () => {
      if (videoNode.dataset.activeSrc !== videoSrc) return;
      revealAndPlay();
    };
    videoNode.onerror = () => {
      if (videoNode.dataset.activeSrc === videoSrc) {
        cardNode.classList.remove("content-card--ready");
      }
    };
    videoNode.preload = "metadata";
    videoNode.src = videoSrc;
    videoNode.dataset.activeSrc = videoSrc;
    videoNode.load();
    return;
  }

  if (videoNode.readyState >= 2) {
    revealAndPlay();
  }
}

/*
        Останавливает неактивный ролик без выгрузки файла.
        Важно: src и класс готовности остаются на месте, поэтому видео
        не превращается в пустой блок при свайпе, скролле или переходе
        к следующей секции.
      */
function deactivateContentCardVideo(cardNode) {
  const videoNode = getContentCardVideoNode(cardNode);
  if (!videoNode) return;

  setContentVideoAudibleState(videoNode, false);
  videoNode.pause();
  videoNode.onloadeddata = null;
  videoNode.onerror = null;
  videoNode.onended = null;
}

/* Проверяет, какие карточки контента сейчас видны в ленте */
function syncVisibleContentVideos() {
  if (!contentTrack) return;
  const trackRect = contentTrack.getBoundingClientRect();
  if (!trackRect.width) return;

  clearScheduledContentVideoLoads();
  const visibleCards = [];
  let activeCard = getActiveContentSequenceCard();

  contentCards.forEach((cardNode) => {
    const rect = cardNode.getBoundingClientRect();
    const visibleWidth = Math.max(
      0,
      Math.min(rect.right, trackRect.right) -
        Math.max(rect.left, trackRect.left),
    );
    const visibleRatio = visibleWidth / Math.min(rect.width, trackRect.width);

    if (visibleRatio >= 0.55) {
      visibleCards.push({ cardNode, visibleRatio });
    } else {
      deactivateContentCardVideo(cardNode);
    }
  });

  const sortedVisibleCards = visibleCards.sort(
    (left, right) => right.visibleRatio - left.visibleRatio,
  );

  if (
    activeCard &&
    sortedVisibleCards.some(({ cardNode }) => cardNode === activeCard)
  ) {
    contentPendingPageAdvanceUntil = 0;
  }

  if (
    sortedVisibleCards.length &&
    Date.now() > contentPendingPageAdvanceUntil &&
    (!activeCard ||
      !sortedVisibleCards.some(({ cardNode }) => cardNode === activeCard))
  ) {
    const fallbackCard = sortedVisibleCards[0].cardNode;
    const fallbackIndex = getConfiguredContentCardIndex(fallbackCard);
    if (fallbackIndex !== -1) {
      contentSequenceIndex = getContentPageStartIndex(fallbackIndex);
      activeCard = getActiveContentSequenceCard();
    }
  }

  const prioritizedVisibleCards = [];

  if (activeCard) {
    const activeVisibleEntry = sortedVisibleCards.find(
      ({ cardNode }) => cardNode === activeCard,
    );
    if (activeVisibleEntry) {
      prioritizedVisibleCards.push(activeVisibleEntry);
    }
  }

  sortedVisibleCards.forEach((entry) => {
    if (prioritizedVisibleCards.includes(entry)) return;
    prioritizedVisibleCards.push(entry);
  });

  prioritizedVisibleCards.forEach(({ cardNode }, index) => {
    if (cardNode === activeCard) {
      activateContentCardVideo(cardNode);
      return;
    }

    const timerId = window.setTimeout(() => {
      prepareContentCardVideo(cardNode);
    }, 260 * index);
    contentVideoLoadTimers.push(timerId);
  });
}

/* Обновляет список активных роликов не чаще одного кадра */
function scheduleContentVideoSync() {
  if (
    !contentTrack ||
    !contentTrackIsActive ||
    contentBlockedByWorks ||
    contentVideoSyncFrame
  )
    return;
  contentVideoSyncFrame = window.requestAnimationFrame(() => {
    contentVideoSyncFrame = 0;
    syncVisibleContentVideos();
  });
}

/* Включает синхронизацию роликов только когда секция реально рядом */
function setContentTrackActive(nextActive) {
  if (nextActive && contentBlockedByWorks) {
    forceStopContentVideos();
    return;
  }

  if (!nextActive) {
    forceStopContentVideos();
    return;
  }

  if (contentTrackIsActive === nextActive) return;
  contentTrackIsActive = nextActive;

  updateContentTrackControls();
  scheduleContentVideoSync();
}

/*
        Проверяет приближение блока "Работы".
        Триггер стоит около нижней границы экрана: видео не гаснет
        при входе в видеоблок, но выключается до активного просмотра работ.
      */
function isWorksSectionStoppingContent() {
  if (!worksSection) return false;
  const rect = worksSection.getBoundingClientRect();
  const triggerLine = window.innerHeight * 0.9;
  return rect.top <= triggerLine && rect.bottom > 0;
}

/* Включает или снимает блокировку видеоленты при переходе к работам */
function setContentBlockedByWorks(nextBlocked) {
  if (contentBlockedByWorks === nextBlocked) return;
  contentBlockedByWorks = nextBlocked;

  if (nextBlocked) {
    forceStopContentVideos();
    return;
  }

  if (!contentTrack) return;
  const rect = contentTrack.getBoundingClientRect();
  const isTrackNearViewport =
    rect.bottom > -80 && rect.top < window.innerHeight + 80;

  if (isTrackNearViewport) {
    setContentTrackActive(true);
  }
}

/* Проверяет позицию блока работ не чаще одного раза за кадр */
function scheduleContentWorksStopCheck() {
  if (contentWorksStopFrame) return;
  contentWorksStopFrame = window.requestAnimationFrame(() => {
    contentWorksStopFrame = 0;
    setContentBlockedByWorks(isWorksSectionStoppingContent());
  });
}

const EMPTY_IMAGE_SRC =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

/* Внешний слайдер выбирает работу, внутренний — её фотографии. */
const WORKS_PROCEDURE_CATALOG = [
  {
    kicker: "Процедура 01",
    title: "Окрашивание и уход",
    hint: "Результаты после процедур GLAIRE.",
    note: "Ушли от блонда, выровняли цвет по длине, добавили глубину. Обновили форму каскадом и уложили мягкими локонами.",
    tags: null,
    slides: [
      {
        sources: buildImageCandidateList(
          optimizeConfiguredImage(
            "worksSlide",
            "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1775647544/IMG_2860_aeyldt.jpg",
          ),
        ),
      },
      {
        sources: buildImageCandidateList(
          optimizeConfiguredImage(
            "worksSlide",
            "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1775647544/IMG_2858_qlp3y2.jpg",
          ),
        ),
      },
      {
        sources: buildImageCandidateList(
          optimizeConfiguredImage(
            "worksSlide",
            "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1775647546/IMG_2861_lvzm2u.jpg",
          ),
        ),
      },
    ],
  },
  {
    kicker: "Процедура 02",
    title: "wolf cut + copper hair ⚡",
    hint: "Результаты после процедур GLAIRE.",
    note: "Сделали layered wolf cut: рваную форму с короткими слоями, движением и лёгким творческим хаосом. По цвету ушли в тёплый медный рыжий оттенок, Волосы стали легче, текстурнее и намного интереснее в движении.",
    tags: "Окрашивание\nУход\nСтрижка\nУкладка\n",
    slides: [
      {
        sources: buildImageCandidateList(
          optimizeConfiguredImage(
            "worksSlide",
            "https://res.cloudinary.com/dhb13tygy/image/upload/v1782891485/2026-05-22_20-03-54_1779487085916_nakc0f.heic",
          ),
        ),
      },
      {
        sources: buildImageCandidateList(
          optimizeConfiguredImage(
            "worksSlide",
            "https://res.cloudinary.com/dhb13tygy/image/upload/v1782891483/2026-05-22_19-55-44_1779487086534_lq9moj.heic",
          ),
        ),
      },
    ],
  },
  {
    kicker: "Процедура 03",
    title: "Мелирование и контуринг",
    hint: "Результаты после процедур GLAIRE.",
    note: "Осветлили пряди у лица и по длине, добавили объём и глубину за счёт мелирования и аккуратно выровняли цвет.",
    tags: "Мелирование\nКонтуринг\nCтрижка\nУход\nУкладка",
    slides: [
      {
        sources: buildImageCandidateList(
          optimizeConfiguredImage(
            "worksSlide",
            "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1776425441/IMG_1832_x7d07f.jpg",
          ),
        ),
      },
      {
        sources: buildImageCandidateList(
          optimizeConfiguredImage(
            "worksSlide",
            "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1776425441/IMG_1824_gpqsax.jpg",
          ),
        ),
      },
      {
        sources: buildImageCandidateList(
          optimizeConfiguredImage(
            "worksSlide",
            "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1776425440/IMG_1836_prvxzv.jpg",
          ),
        ),
      },
    ],
  },
  {
    kicker: "Процедура 04",
    title: "выход из темного",
    hint: "Результаты после процедур GLAIRE.",
    note: "Выполнили кислотную смывку, аккуратно вышли из тёмного цвета. Перекрасили в рыжий оттенок, добавили глубину по длине.",
    tags: "Окрашивание\nВыход из темного\nСтрижка\nУход\nУкладка",
    slides: [
      {
        sources: buildImageCandidateList(
          optimizeConfiguredImage(
            "worksSlide",
            "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1776425440/IMG_1810_texurd.jpg",
          ),
        ),
      },
      {
        sources: buildImageCandidateList(
          optimizeConfiguredImage(
            "worksSlide",
            "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1776425441/IMG_1803_tujqmt.jpg",
          ),
        ),
      },
      {
        sources: buildImageCandidateList(
          optimizeConfiguredImage(
            "worksSlide",
            "https://res.cloudinary.com/dhb13tygy/image/upload/q_auto/f_auto/v1776425440/IMG_1813_qq1p7f.jpg",
          ),
        ),
        position: "center top",
      },
    ],
  },
  {
    kicker: "Процедура 05",
    title: "Кератиновое выпрямление и уход",
    hint: "Результаты после процедур GLAIRE.",
    note: "Поработали с сильно пористой длиной: подготовили волосы уходом, выполнили кератиновое выпрямление и сделали их более гладкими, послушными и стабильными в носке.",
    tags: "Кератиновое выпрямление\nУход\nСтрижка кончиков",
    slides: [
      {
        sources: buildImageCandidateList(
          optimizeConfiguredImage(
            "worksSlide",
            "https://res.cloudinary.com/dhb13tygy/image/upload/v1782891485/2026-06-06_20-01-40_1780792175168_ucos5d.heic",
          ),
        ),
      },
    ],
  },
  ...NEW_WORKS.map((work, offset) => {
    const number = offset + 1;
    return {
      kicker: `Работа ${String(offset + 6).padStart(2, "0")}`,
      get title() {
        return config[`newWork${number}Title`];
      },
      hint: "Результаты после процедур GLAIRE.",
      get note() {
        return config[`newWork${number}Note`];
      },
      tags: work.tags,
      get slides() {
        return [1, 2].map((photo) => {
          const source = String(
            config[`newWork${number}Photo${photo}`] || "",
          ).trim();
          return {
            sources: source
              ? buildImageCandidateList(
                  optimizeConfiguredImage("worksSlide", source),
                )
              : [],
            placeholder: !source,
            fit: "cover",
            label: `Фото ${photo} из 2`,
            text: "Фотография этой работы скоро появится.",
          };
        });
      },
    };
  }),
];

// Один раз перемешанный порядок карточек; порядок фото внутри них сохраняется.
const WORKS_PROCEDURES = [0, 6, 2, 5, 8, 3, 7, 1, 4].map(
  (index) => WORKS_PROCEDURE_CATALOG[index],
);

/*
  Первичная синхронизация запускается после первого кадра.
  Первый экран уже содержит нужные тексты и основные src в HTML,
  а такой перенос снимает часть нагрузки с критического пути загрузки.
*/
window.requestAnimationFrame(applyConfig);

/* Рисует точки навигации под слайдером студии */
function renderSliderDots() {
  if (!heroSliderDots) return;

  heroSliderDots.innerHTML = "";
  heroSliderDots.hidden = heroSlides.length <= 1;
  heroSlides.forEach((slide, index) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "slider__dot";
    dot.setAttribute("aria-label", slide.alt);
    if (index === heroSlideIndex) dot.classList.add("is-active");
    dot.setAttribute("aria-current", String(index === heroSlideIndex));
    dot.addEventListener("click", () => setHeroSlide(index));
    heroSliderDots.appendChild(dot);
  });
}

/* Показывает нужную фотографию студии по индексу */
function setHeroSlide(nextIndex) {
  const total = heroSlides.length;
  if (!total) return;
  heroSlideIndex = (nextIndex + total) % total;
  const slide = heroSlides[heroSlideIndex];
  updatePhotoCounter("heroSliderCounter", heroSlideIndex, total);

  if (heroSlideImage) {
    describeImage(heroSlideImage, slide.alt);
    showGalleryPhoto(heroSlideImage, slide.sources, warmHeroNeighbors);
  }

  renderSliderDots();
}

/* Переключает слайдер студии на шаг вперёд или назад */
function moveHeroSlide(direction) {
  setHeroSlide(heroSlideIndex + direction);
  noteManualSlide(heroSliderViewport?.closest(".hero-slider"));
}

/* Возвращает активную процедуру в левом блоке работ */
function getActiveWorksProcedure() {
  return WORKS_PROCEDURES[worksProcedureIndex] || WORKS_PROCEDURES[0];
}

/* Возвращает фотографии выбранной процедуры в исходном порядке. */
function getActiveWorksSlides() {
  return getActiveWorksProcedure()?.slides || [];
}

/* Собирает все реальные фото из блока работ для мягкого фонового прогрева */

/* Обновляет подписи, теги и активный кадр выбранной процедуры */
function commitWorksProcedure(nextIndex, preserveSlide = false) {
  const total = WORKS_PROCEDURES.length;
  if (!total) return;

  worksProcedureIndex = (nextIndex + total) % total;
  worksProcedureTargetIndex = worksProcedureIndex;
  const procedure = getActiveWorksProcedure();

  if (!preserveSlide) worksSlideIndex = 0;
  if (worksSlideIndex >= procedure.slides.length) worksSlideIndex = 0;

  if (worksProcedureKicker) {
    worksProcedureKicker.textContent = `Работа ${worksProcedureIndex + 1}/${total}`;
  }
  if (worksProcedureTitle) {
    worksProcedureTitle.textContent = procedure.title;
  }
  if (worksProcedureHint) {
    worksProcedureHint.textContent = procedure.hint;
  }
  if (worksProcedureNote) {
    worksProcedureNote.textContent =
      procedure.note || config.worksNote || worksProcedureNote.textContent;
  }

  renderWorkTags(procedure.tags || config.worksTags);
  setWorksSlide(worksSlideIndex);
}

/* Переключает весь левый блок работ на другую процедуру */
function setWorksProcedure(nextIndex, options = {}) {
  const { animate = true, preserveSlide = false } = options;
  const total = WORKS_PROCEDURES.length;
  if (!total) return;
  worksProcedureTargetIndex = ((nextIndex % total) + total) % total;
  nextIndex = worksProcedureTargetIndex;

  window.clearTimeout(worksProcedureSwitchTimer);

  if (!animate || !worksProcedureBody) {
    commitWorksProcedure(nextIndex, preserveSlide);
    worksProcedureBody?.classList.remove("is-switching");
    return;
  }

  worksProcedureBody.classList.add("is-switching");
  worksProcedureSwitchTimer = window.setTimeout(() => {
    commitWorksProcedure(nextIndex, preserveSlide);
    window.requestAnimationFrame(() => {
      worksProcedureBody.classList.remove("is-switching");
    });
  }, 150);
}

/* Переключает весь набор процедуры на шаг вперёд или назад */
function moveWorksProcedure(direction) {
  setWorksProcedure(worksProcedureTargetIndex + direction);
}

/* Рисует точки навигации под кадрами выбранной процедуры */
function renderWorksSliderDots() {
  if (!worksSliderDots) return;

  const slides = getActiveWorksSlides();
  worksSliderDots.innerHTML = "";
  worksSliderDots.hidden = slides.length <= 1;
  slides.forEach((slide, index) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "slider__dot";
    dot.setAttribute(
      "aria-label",
      workPhotoDescription(
        getActiveWorksProcedure(),
        worksProcedureIndex,
        index,
      ),
    );
    if (index === worksSlideIndex) dot.classList.add("is-active");
    dot.addEventListener("click", () => {
      setWorksSlide(index);
      restartWorksSliderAutoplay();
    });
    worksSliderDots.appendChild(dot);
  });
}

/* Показывает нужный кадр внутри выбранной процедуры */
function setWorksSlide(nextIndex) {
  const slides = getActiveWorksSlides();
  const total = slides.length;
  if (!total) return;
  worksSlideIndex = (nextIndex + total) % total;
  const slide = slides[worksSlideIndex];
  updatePhotoCounter("worksPhotoCounter", worksSlideIndex, total);

  worksImageShell?.classList.toggle("is-placeholder", !!slide.placeholder);
  worksImageShell?.classList.toggle("is-contain", slide.fit === "contain");

  if (worksSlideImage) {
    describeImage(
      worksSlideImage,
      slide.placeholder
        ? ""
        : workPhotoDescription(
            getActiveWorksProcedure(),
            worksProcedureIndex,
            worksSlideIndex,
          ),
    );
    worksSlideImage.style.objectPosition = slide.position || "center center";
    if (slide.placeholder) {
      delete worksSlideImage.dataset.imageCandidate;
      worksSlideImage.onload = null;
      worksSlideImage.onerror = null;
      worksSlideImage.removeAttribute("srcset");
      worksSlideImage.removeAttribute("sizes");
      worksSliderViewport.style.setProperty("--image-aspect", "3 / 4");
      worksSlideImage.src = EMPTY_IMAGE_SRC;
    } else {
      showGalleryPhoto(worksSlideImage, slide.sources, warmWorksNeighbors);
    }
  }

  if (worksSlidePlaceholder) {
    worksSlidePlaceholder.setAttribute(
      "aria-hidden",
      String(!slide.placeholder),
    );
  }
  if (worksSlidePlaceholderTitle) {
    worksSlidePlaceholderTitle.textContent = slide.label || "Фото";
  }
  if (worksSlidePlaceholderText) {
    worksSlidePlaceholderText.textContent =
      slide.text || "Фото процедуры временно недоступно";
  }

  renderWorksSliderDots();
}

/* Переключает кадр внутри выбранной процедуры на шаг вперёд или назад */
function moveWorksSlide(direction) {
  setWorksSlide(worksSlideIndex + direction);
}

/*
        Автопрокрутка работает как круговая галерея:
        сначала показывает 3 кадра текущей процедуры,
        затем переключает весь левый блок на следующую процедуру.
      */
function restartWorksSliderAutoplay() {
  worksMediaPlayer?.interaction();
}

/* Вычисляет ширину одного шага горизонтальной ленты контента */
function getContentScrollStep() {
  if (!contentTrack) return 0;
  const trackStyles = window.getComputedStyle(contentTrack);
  const gap = Number.parseFloat(
    trackStyles.columnGap || trackStyles.gap || "0",
  );
  const firstCard = getConfiguredContentCards()[0] || contentCards[0] || null;
  const cardWidth = firstCard?.getBoundingClientRect().width || 0;
  return (cardWidth || contentTrack.clientWidth) + gap;
}

/* Блокирует стрелки контента в начале и в конце ленты */
function updateContentTrackControls() {
  if (!contentTrack || !contentPrevBtn || !contentNextBtn) return;
  const maxScrollLeft = Math.max(
    0,
    contentTrack.scrollWidth - contentTrack.clientWidth,
  );
  contentPrevBtn.disabled = contentTrack.scrollLeft <= 4;
  contentNextBtn.disabled = contentTrack.scrollLeft >= maxScrollLeft - 4;
}

/* Прокручивает ленту контента влево или вправо на один шаг */
function scrollContentTrack(direction) {
  if (!contentTrack) return;
  const step = getContentScrollStep();
  contentTrack.scrollBy({
    left: direction * step,
    behavior: "smooth",
  });
}

/* Ниже идёт логика свайпа и перетаскивания для touch-устройств и мыши */
/* Подключает стрелки и кнопки навигации для слайдеров */
if (heroSlideImage) {
  heroPrevBtn?.addEventListener("click", () => moveHeroSlide(-1));
  heroNextBtn?.addEventListener("click", () => moveHeroSlide(1));
}

if (worksSlideImage) {
  worksPrevBtn?.addEventListener("click", () => {
    moveWorksSlide(-1);
    restartWorksSliderAutoplay();
  });
  worksNextBtn?.addEventListener("click", () => {
    moveWorksSlide(1);
    restartWorksSliderAutoplay();
  });

  worksProcedurePrevBtn?.addEventListener("click", () => {
    moveWorksProcedure(-1);
    restartWorksSliderAutoplay();
  });
  worksProcedureNextBtn?.addEventListener("click", () => {
    moveWorksProcedure(1);
    restartWorksSliderAutoplay();
  });


}

if (contentTrack) {
  contentCards.forEach((cardNode) => {
    const videoNode = getContentCardVideoNode(cardNode);
    if (!videoNode || videoNode.dataset.sequenceBound === "1") return;

    videoNode.dataset.sequenceBound = "1";

    videoNode.addEventListener("click", () => {
      unlockContentAudioForCard(cardNode);
    });

    videoNode.addEventListener("volumechange", () => {
      if (videoNode.dataset.syncingAudio === "1") return;
      if (videoNode.muted || videoNode.volume <= 0) return;

      const nextIndex = getConfiguredContentCardIndex(cardNode);
      if (nextIndex === -1) return;

      contentAudioUnlocked = true;
      contentAudioNeedsInteraction = false;
      contentSequenceIndex = nextIndex;
      applyContentSequenceState({
        restartActive: false,
      });
    });
  });

  const resumeContentAudioFromInteraction = () => {
    if (!contentTrackIsActive || !contentAudioNeedsInteraction) return;
    contentAudioUnlocked = true;
    contentAudioNeedsInteraction = false;
    applyContentSequenceState({
      restartActive: false,
    });
  };

  document.addEventListener("pointerup", resumeContentAudioFromInteraction, {
    passive: true,
  });
  document.addEventListener("touchend", resumeContentAudioFromInteraction, {
    passive: true,
  });
  document.addEventListener("keydown", resumeContentAudioFromInteraction);

  contentPrevBtn?.addEventListener("click", () => {
    scrollContentTrack(-1);
  });
  contentNextBtn?.addEventListener("click", () => {
    scrollContentTrack(1);
  });
  contentTrack.addEventListener(
    "scroll",
    () => {
      updateContentTrackControls();
      scheduleContentVideoSync();
    },
    {
      passive: true,
    },
  );
  window.addEventListener("resize", () => {
    updateContentTrackControls();
    if (contentTrackIsActive) {
      scheduleContentVideoSync();
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      document
        .querySelectorAll(".content-card__video")
        .forEach((videoNode) => videoNode.pause());
      return;
    }
    if (contentTrackIsActive) {
      scheduleContentVideoSync();
    }
  });

  if ("IntersectionObserver" in window) {
    contentTrackObserver = new IntersectionObserver(
      (entries) => {
        const isVisible = entries.some(
          (entry) => entry.isIntersecting && entry.intersectionRatio >= 0.28,
        );
        setContentTrackActive(isVisible);
      },
      {
        rootMargin: "0px",
        threshold: [0, 0.28, 0.6],
      },
    );
    contentTrackObserver.observe(contentTrack);
  } else {
    setContentTrackActive(true);
  }

  /*
    Страховка для всех браузеров:
    при скролле к блоку "Работы" видеолента сверху выключается заранее.
  */
  if (worksSection) {
    window.addEventListener("scroll", scheduleContentWorksStopCheck, {
      passive: true,
    });
    window.addEventListener("resize", scheduleContentWorksStopCheck);
    scheduleContentWorksStopCheck();
  }

  contentTrack.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    contentSwipeStartX = event.clientX;
    contentSwipeDeltaX = 0;
    contentTrack.setPointerCapture?.(event.pointerId);
  });

  contentTrack.addEventListener("pointermove", (event) => {
    if (contentSwipeStartX === null) return;
    contentSwipeDeltaX = event.clientX - contentSwipeStartX;
  });

  const finishContentSwipe = (event) => {
    if (contentSwipeStartX === null) return;
    if (Math.abs(contentSwipeDeltaX) > 44) {
      scrollContentTrack(contentSwipeDeltaX > 0 ? -1 : 1);
    }
    if (contentTrack.hasPointerCapture?.(event.pointerId)) {
      contentTrack.releasePointerCapture(event.pointerId);
    }
    contentSwipeStartX = null;
    contentSwipeDeltaX = 0;
  };

  contentTrack.addEventListener("pointerup", finishContentSwipe);
  contentTrack.addEventListener("pointercancel", finishContentSwipe);
}

document
  .getElementById("masterPrevBtn")
  .addEventListener("click", () => applyMasterPhotoState(masterSlideIndex - 1));
document
  .getElementById("masterNextBtn")
  .addEventListener("click", () => applyMasterPhotoState(masterSlideIndex + 1));
const masterViewport = document.getElementById("masterSliderViewport");
mediaMotion?.swipe(masterViewport, (direction) => {
  applyMasterPhotoState(masterSlideIndex + direction);
  noteManualSlide(document.getElementById("masterPhotoShell"));
});
masterViewport.tabIndex = 0;
masterViewport.setAttribute("role", "region");
masterViewport.setAttribute(
  "aria-label",
  "Фотографии мастера, переключение стрелками клавиатуры",
);
masterViewport.addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
  event.preventDefault();
  applyMasterPhotoState(
    masterSlideIndex + (event.key === "ArrowLeft" ? -1 : 1),
  );
});

const newsTrack = document.getElementById("newsTrack");
const newsPrev = document.getElementById("newsPrevBtn");
const newsNext = document.getElementById("newsNextBtn");
function updateNewsControls() {
  newsPrev.disabled = newsTrack.scrollLeft < 2;
  newsNext.disabled =
    newsTrack.scrollLeft + newsTrack.clientWidth >= newsTrack.scrollWidth - 2;
}
function moveNews(direction, wrap = false) {
  if (!wrap) noteManualSlide(newsTrack);
  const card = newsTrack.firstElementChild;
  const step =
    card.getBoundingClientRect().width +
    parseFloat(getComputedStyle(newsTrack).columnGap);
  if (mediaMotion) mediaMotion.scrollRail(newsTrack, direction, step, wrap);
  else newsTrack.scrollBy({ left: direction * step, behavior: "smooth" });
}
newsPrev.addEventListener("click", () => moveNews(-1));
newsNext.addEventListener("click", () => moveNews(1));
newsTrack.addEventListener("scroll", updateNewsControls, { passive: true });
newsTrack.addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
  event.preventDefault();
  moveNews(event.key === "ArrowLeft" ? -1 : 1);
});
window.addEventListener("resize", updateNewsControls, { passive: true });
updateNewsControls();

/* Поддержка свайпа и перетаскивания для фото студии */
if (heroSliderViewport) {
  heroSliderViewport.addEventListener("dragstart", (event) =>
    event.preventDefault(),
  );
  heroSliderViewport.tabIndex = 0;
  heroSliderViewport.setAttribute("role", "region");
  heroSliderViewport.setAttribute(
    "aria-label",
    "Фотографии студии, переключение стрелками клавиатуры",
  );
  heroSliderViewport.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    moveHeroSlide(event.key === "ArrowLeft" ? -1 : 1);
  });
  mediaMotion?.swipe(heroSliderViewport, (direction) => {
    moveHeroSlide(direction);
    noteManualSlide(heroSliderViewport.closest(".hero-slider"));
  });
}

mediaMotion?.swipe(worksSliderViewport, (direction) => {
  moveWorksSlide(direction);
  restartWorksSliderAutoplay();
});

/* Автопоказ: только видимые фото, неторопливо, с паузой после ручных действий. */
let worksMediaPlayer = null;
mediaMotion?.autoplay(heroSliderViewport?.closest(".hero-slider"), {
  interval: 9000, advance: () => moveHeroSlide(1), prepare: warmHeroNeighbors,
  busy: () => heroSlideImage?.dataset.mediaPending === "1", label: "студия",
});
mediaMotion?.autoplay(document.getElementById("masterPhotoShell"), {
  interval: 10000, advance: () => applyMasterPhotoState(masterSlideIndex + 1),
  prepare: warmMasterNeighbors, busy: () => document.getElementById("masterPhoto")?.dataset.mediaPending === "1",
  label: "мастер",
});
worksMediaPlayer = mediaMotion?.autoplay(worksImageShell, {
  interval: 9000, prepare: warmWorksNeighbors,
  busy: () => worksSlideImage?.dataset.mediaPending === "1",
  advance: () => {
    const slides = getActiveWorksSlides();
    if (worksSlideIndex >= slides.length - 1) setWorksProcedure(worksProcedureIndex + 1);
    else moveWorksSlide(1);
  }, label: "работы",
});
mediaMotion?.autoplay(newsTrack, {
  interval: 12000, advance: () => moveNews(1, true), label: "акции",
  controlHost: document.querySelector(".news-controls"),
});


/* ------------------------------------------------------------------ */
/* Локальная админка                                                   */
/* Панель редактирования контента прямо в браузере                     */
/* ------------------------------------------------------------------ */
/* Эти элементы отвечают уже не за публичный контент, а за интерфейс управления сайтом */
const menuToggleBtn = document.getElementById("menuToggleBtn");
const siteNav = document.getElementById("siteNav");
const backToTopBtn = document.getElementById("backToTopBtn");
const mobileMenuMedia = window.matchMedia("(max-width: 1080px)");
/*
        Админка вынесена в отдельный файл и подключается только в режиме ?admin=1.
        Так обычная версия сайта не скачивает и не парсит лишний JS.
      */
window.__glaireAdminApi = window.__glaireAdminApi || {
  closeAdmin() {},
};

/*
        Это "мост" между основной страницей и отдельным файлом админки.
        Сюда передаются только те функции и данные, которые нужны панели:
        текущий config, дефолтные значения, функция перерисовки и доступ к localStorage-ключу.
      */
window.__glaireRuntime = {
  isAdminMode,
  runWhenIdle,
  closeMobileMenu,
  STORAGE_KEY,
  CONFIG_DEFAULT,
  applyConfig,
  getConfig: () => config,
  setConfig: (nextConfig) => {
    config = Object.fromEntries(
      Object.entries(nextConfig).map(([key, value]) => [
        key,
        sanitizeLocationValue(key, value),
      ]),
    );
  },
};

/*
        Открывает админку автоматически, если страница запущена в режиме ?admin=1.
        Это помогает и на телефоне, и на GitHub Pages: не нужно искать кнопку
        "Админ" в шапке или внутри бургер-меню.
      */
function openAdminPanelFromQuery() {
  if (!isAdminMode) return;

  window.requestAnimationFrame(() => {
    window.__glaireAdminApi?.openAdmin?.();
  });
}

/* Подключает файл admin-panel.js только когда страница открыта с ?admin=1 */
function loadAdminScript() {
  if (!isAdminMode) return;
  if (document.querySelector("script[data-glaire-admin]")) {
    openAdminPanelFromQuery();
    return;
  }

  const adminScript = document.createElement("script");
  adminScript.src = "/admin-panel.js?v=20261028-client-works";
  adminScript.defer = true;
  adminScript.dataset.glaireAdmin = "1";
  adminScript.onload = openAdminPanelFromQuery;
  document.body.appendChild(adminScript);
}

if (isAdminMode) {
  loadAdminScript();
}

/* Открывает или закрывает мобильное меню и обновляет aria-атрибуты */
function setMobileMenuOpen(nextOpen) {
  if (!siteNav || !menuToggleBtn) return;
  siteNav.classList.toggle("is-open", nextOpen);
  menuToggleBtn.classList.toggle("is-open", nextOpen);
  menuToggleBtn.setAttribute("aria-expanded", String(nextOpen));
  menuToggleBtn.setAttribute(
    "aria-label",
    nextOpen ? "Закрыть меню" : "Открыть меню",
  );
}

/* Короткая функция, чтобы закрывать мобильное меню из разных мест */
function closeMobileMenu() {
  setMobileMenuOpen(false);
}

/* Показывает кнопку "наверх" только после заметной прокрутки страницы */
function updateBackToTopState() {
  if (!backToTopBtn) return;
  const showAfter = Math.max(520, window.innerHeight * 0.8);
  backToTopBtn.classList.toggle("is-visible", window.scrollY > showAfter);
}

/* Бургер управляет меню только на планшете и телефоне. */
menuToggleBtn?.addEventListener("click", () => {
  if (!siteNav || !mobileMenuMedia.matches) return;
  setMobileMenuOpen(!siteNav.classList.contains("is-open"));
});

/* После выбора пункта панель закрывается */
siteNav?.querySelectorAll("a, button").forEach((node) => {
  node.addEventListener("click", () => {
    closeMobileMenu();
  });
});

/* При возврате на десктоп меню сбрасывается в исходное состояние */
mobileMenuMedia.addEventListener("change", (event) => {
  if (!event.matches) {
    closeMobileMenu();
  }
});

document.addEventListener("click", (event) => {
  if (!siteNav?.classList.contains("is-open")) return;
  if (siteNav.contains(event.target) || menuToggleBtn?.contains(event.target))
    return;
  closeMobileMenu();
});

/* Кнопка "наверх" мягко возвращает пользователя в начало страницы */
backToTopBtn?.addEventListener("click", () => {
  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
});

window.addEventListener("scroll", updateBackToTopState, {
  passive: true,
});
window.addEventListener("resize", updateBackToTopState);
updateBackToTopState();

/* Escape закрывает админку и мобильное меню */
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  window.__glaireAdminApi?.closeAdmin?.();
  const menuWasOpen = siteNav?.classList.contains("is-open");
  closeMobileMenu();
  if (menuWasOpen) menuToggleBtn?.focus();
});

;
