/* Автоматически собрано scripts/build-site.py. Редактируйте исходные файлы, не этот результат. */

/* Источник: assets/events/halloween/event-config.js */
/* Halloween campaign. Publication and an early wheel launch are authorised.
   Discount dates stay separate from the wheel's opening date. */
window.GLAIRE_EVENT_CONFIG = Object.freeze({
  theme: "halloween",
  campaignId: "halloween-2026",
  codePrefix: "GL-H26",
  name: "Хэллоуин в GLAIRE",
  discount: 15,
  startsAt: "2026-10-30T00:00:00+05:00",
  wheelStartsAt: "2026-10-29T00:00:00+05:00",
  wheelDatesLabel: "Бонусы доступны до 30 ноября",
  endsAt: "2026-12-01T00:00:00+05:00",
  datesLabel: "30 октября — 30 ноября",
  discountTerms: "На все услуги. Не суммируется с другими скидками.",
  wheelTerms:
    "Один результат в этом браузере за время акции. Бонус колеса или скидка −15% — на выбор.",
  redemptionInstructions:
    "Сохраните скриншот итогового приза с промокодом или скопируйте код. Чтобы воспользоваться акцией, отправьте скриншот или промокод в сообщении при записи. При онлайн-записи укажите промокод в комментарии.",
  organizer:
    "Организатор: Домнин Валерий, самозанятый (НПД). Пермь, ул. Пионерская, 15. Связь: +7 (992) 213-82-59.",
  usageTerms:
    "Бонусы доступны до 30 ноября 2026 года включительно. Вращение бесплатно. Подарки к процедуре предоставляются в рамках визита; основная услуга оплачивается по согласованной стоимости. Бонус колеса не суммируется с другими скидками.",
  prizes: [
    {
      id: "shine",
      label: "Блеск",
      symbol: "✦",
      title: "Ритуал блеска",
      text: "Завершающий экспресс-ритуал для блеска длины в подарок к визиту.",
    },
    {
      id: "massage",
      label: "Массаж",
      symbol: "✧",
      title: "Пять минут спокойствия",
      text: "Пять минут расслабляющего массажа кожи головы при мытье — в подарок к основной услуге.",
    },
    {
      id: "ends",
      label: "Кончики",
      symbol: "✧",
      title: "Комплимент для кончиков",
      text: "Дополнительный этап ухода для кончиков волос в рамках основной процедуры.",
    },
    {
      id: "plan",
      label: "План",
      symbol: "✦",
      title: "План ухода на месяц",
      text: "Персональная памятка с рекомендациями по уходу за волосами на ближайший месяц после визита.",
    },
    {
      id: "color",
      label: "Цвет",
      symbol: "✧",
      title: "Защита цвета",
      text: "Дополнительный этап защиты цвета в подарок при записи на окрашивание.",
    },
    {
      id: "home",
      label: "Разбор",
      symbol: "✧",
      title: "Разбор домашнего ухода",
      text: "Разбор ваших средств и короткая персональная схема: что оставить, как сочетать и что стоит заменить.",
    },
    {
      id: "finish",
      label: "Финиш",
      symbol: "✦",
      title: "Финиш с характером",
      text: "Лёгкая завершающая укладка после процедуры ухода — в подарок к визиту.",
    },
    {
      id: "halloween",
      label: "−15%",
      symbol: "✧",
      title: "Хэллоуин: −15%",
      text: "Скидка 15% на все услуги с 30 октября по 30 ноября. Не суммируется с другими скидками.",
    },
  ],
});

;

/* Источник: assets/events/fortune-wheel.js */
/* A small, theme-independent wheel. No third-party libraries or remote assets. */
(() => {
  "use strict";
  const svgNS = "http://www.w3.org/2000/svg";
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };
  const svg = (tag, attributes) => {
    const node = document.createElementNS(svgNS, tag);
    Object.entries(attributes).forEach(([key, value]) =>
      node.setAttribute(key, value),
    );
    return node;
  };
  const read = (key) => {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch {
      return null;
    }
  };
  const write = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  };
  const random = (max) => {
    if (window.crypto?.getRandomValues) {
      const limit = Math.floor(4294967296 / max) * max;
      let value;
      do {
        value = crypto.getRandomValues(new Uint32Array(1))[0];
      } while (value >= limit);
      return value % max;
    }
    return Math.floor(Math.random() * max);
  };

  class GlaireFortuneWheel {
    constructor(config) {
      this.config = config;
      this.prizes = config.prizes;
      this.rotation = 0;
      this.spinning = false;
      this.preview =
        location.protocol === "file:" ||
        ["127.0.0.1", "localhost"].includes(location.hostname);
      this.key = `glaire:wheel:${config.campaignId}${this.preview ? ":preview" : ""}:v1`;
      this.saved = read(this.key);
      if (!this.prizes.some((prize) => prize.id === this.saved?.prizeId))
        this.saved = null;
      this.build();
    }

    build() {
      this.dialog = make("dialog", "fortune-dialog");
      this.dialog.id = "glaireFortuneDialog";
      this.dialog.dataset.wheelTheme = this.config.theme;
      this.dialog.setAttribute("aria-labelledby", "fortuneTitle");
      this.dialog.setAttribute("aria-describedby", "fortuneIntro");
      const close = make("button", "fortune-dialog__close", "×");
      close.type = "button";
      close.setAttribute("aria-label", "Закрыть колесо бонусов");
      close.addEventListener("click", () => this.close());
      const body = make("div", "fortune-dialog__body");
      const stage = make("div", "fortune-stage");
      this.wheel = make("div", "fortune-wheel");
      this.wheel.setAttribute("aria-hidden", "true");
      this.disc = svg("svg", {
        viewBox: "0 0 360 360",
        class: "fortune-wheel__disc",
      });
      const step = 360 / this.prizes.length;
      const point = (radius, degrees) => {
        const angle = ((degrees - 90) * Math.PI) / 180;
        return [180 + radius * Math.cos(angle), 180 + radius * Math.sin(angle)];
      };
      this.prizes.forEach((prize, index) => {
        const start = point(178, index * step);
        const end = point(178, (index + 1) * step);
        const sector = svg("path", {
          d: `M180 180 L${start} A178 178 0 ${step > 180 ? 1 : 0} 1 ${end} Z`,
          class: `fortune-wheel__sector--${index % 2 ? "b" : "a"} fortune-wheel__line`,
        });
        const group = svg("g", {
          transform: `rotate(${index * step + step / 2} 180 180)`,
        });
        const symbol = svg("text", {
          x: 180,
          y: 64,
          class: "fortune-wheel__symbol",
        });
        symbol.textContent = prize.symbol || "✦";
        const label = svg("text", {
          x: 180,
          y: 89,
          class: "fortune-wheel__label",
        });
        label.textContent = prize.label;
        group.append(symbol, label);
        this.disc.append(sector, group);
      });
      const pointer = make("span", "fortune-wheel__pointer");
      const hub = make("div", "fortune-wheel__hub");
      hub.append(make("strong", "", "GLAIRE"), make("small", "", "Ваш бонус"));
      this.wheel.append(this.disc, pointer, hub);
      stage.append(
        this.wheel,
        make("p", "fortune-wheel__caption", "Подарок к вашему визиту"),
      );

      const copy = make("div", "fortune-dialog__copy");
      this.eyebrow = make("p", "fortune-dialog__eyebrow", "Сезонный бонус");
      const title = make("h2", "fortune-dialog__title", "Колесо Хэллоуина");
      title.id = "fortuneTitle";
      this.dates = make(
        "p",
        "fortune-dialog__dates",
        this.config.wheelDatesLabel || this.config.datesLabel,
      );
      this.intro = make(
        "p",
        "fortune-dialog__intro",
        "Поверните колесо и откройте небольшой подарок к вашему визиту.",
      );
      this.intro.id = "fortuneIntro";
      this.result = make("section", "fortune-result");
      this.result.hidden = true;
      this.result.setAttribute("aria-label", "Результат колеса");
      this.resultTitle = make("h3", "fortune-result__title");
      this.resultText = make("p", "fortune-result__text");
      this.code = make("span", "fortune-result__code");
      this.copyButton = make("button", "fortune-copy", "Скопировать промокод");
      this.copyButton.type = "button";
      this.copyButton.addEventListener("click", () => this.copyResult());
      const redemption = make(
        "p",
        "fortune-redemption",
        this.config.redemptionInstructions,
      );
      this.result.append(
        make("span", "fortune-result__label", "Ваш праздничный бонус"),
        this.resultTitle,
        this.resultText,
        this.code,
        this.copyButton,
        redemption,
      );
      copy.append(this.eyebrow, title, this.dates, this.intro, this.result);

      const actions = make("div", "fortune-dialog__actions");
      this.spinButton = make(
        "button",
        "fortune-action",
        "Открыть мой бонус ↗",
      );
      this.spinButton.type = "button";
      this.spinButton.addEventListener("click", () => this.spin());
      this.bookButton = make("a", "fortune-action", "Записаться с бонусом ↗");
      this.bookButton.href =
        document.getElementById("bookBtnTop")?.href || "#book";
      this.bookButton.hidden = true;
      this.bookButton.addEventListener("click", () => this.close());
      const rule = make(
        "p",
        "fortune-dialog__rule",
        `Бонус колеса или скидка −${this.config.discount}% — на выбор. При записи понадобится промокод или скриншот приза.`,
      );
      const details = make("details", "fortune-dialog__details");
      const list = make("ul");
      this.prizes.forEach((prize) =>
        list.append(make("li", "", `${prize.title}: ${prize.text}`)),
      );
      list.append(make("li", "", this.config.wheelTerms));
      list.append(make("li", "", this.config.redemptionInstructions));
      if (this.config.usageTerms)
        list.append(make("li", "", this.config.usageTerms));
      if (this.config.organizer)
        list.append(make("li", "", this.config.organizer));
      details.append(
        make("summary", "", "Что внутри и как использовать"),
        list,
      );
      this.status = make("p", "fortune-dialog__status");
      this.status.setAttribute("role", "status");
      this.status.setAttribute("aria-live", "polite");
      actions.append(
        this.spinButton,
        this.bookButton,
        rule,
        this.status,
        details,
      );
      if (this.preview) {
        this.previewAgain = make(
          "button",
          "fortune-preview-again",
          "Прокрутить ещё раз",
        );
        this.previewAgain.type = "button";
        this.previewAgain.hidden = true;
        this.previewAgain.addEventListener("click", () => this.repeatPreview());
        actions.insertBefore(this.previewAgain, rule);
      }
      body.append(stage, copy, actions);
      this.dialog.append(close, body);
      document.body.append(this.dialog);
      this.dialog.addEventListener("click", (event) => {
        if (event.target !== this.dialog) return;
        const r = this.dialog.getBoundingClientRect();
        if (
          event.clientX < r.left ||
          event.clientX > r.right ||
          event.clientY < r.top ||
          event.clientY > r.bottom
        )
          this.close();
      });
      this.dialog.addEventListener("cancel", (event) => {
        event.preventDefault();
        this.close();
      });
      this.dialog.addEventListener("close", () => {
        clearTimeout(this.closeTimer);
        this.closing = false;
        this.dialog.classList.remove("is-closing", "is-instant-entry");
        document.documentElement.classList.remove("fortune-modal-open");
        if (this.spinning) this.finish();
        this.pausedVideos?.forEach((video) => {
          if (
            video.isConnected &&
            video.getBoundingClientRect().bottom > 0 &&
            video.getBoundingClientRect().top < innerHeight
          )
            video.play().catch(() => {});
        });
        this.lastFocus?.focus({ preventScroll: true });
      });
      document.addEventListener(
        "play",
        (event) => {
          if (this.dialog.open && event.target instanceof HTMLVideoElement)
            event.target.pause();
        },
        true,
      );
      if (this.saved) this.restore();
      if (!this.preview)
        window.addEventListener("storage", (event) => {
          if (event.key !== this.key || this.spinning) return;
          const saved = read(this.key);
          if (this.prizes.some((prize) => prize.id === saved?.prizeId)) {
            this.saved = saved;
            this.restore();
          }
        });
    }

    isActive() {
      const now = Date.now();
      return (
        this.preview ||
        (now >= Date.parse(this.config.wheelStartsAt || this.config.startsAt) &&
          now < Date.parse(this.config.endsAt))
      );
    }

    open({ immediate = false } = {}) {
      if (this.dialog.open) {
        if (this.closing) {
          clearTimeout(this.closeTimer);
          this.closing = false;
          this.dialog.classList.remove("is-closing");
        }
        return;
      }
      this.lastFocus = document.activeElement;
      this.pausedVideos = [...document.querySelectorAll("video")].filter(
        (video) => !video.paused,
      );
      this.pausedVideos.forEach((video) => video.pause());
      this.dialog.classList.toggle("is-instant-entry", immediate);
      this.dialog.showModal();
      document.documentElement.classList.add("fortune-modal-open");
      if (!this.isActive()) {
        this.spinButton.disabled = true;
        const beginsAt = Date.parse(
          this.config.wheelStartsAt || this.config.startsAt,
        );
        const starts = new Intl.DateTimeFormat("ru-RU", {
          day: "numeric",
          month: "long",
          timeZone: "Asia/Yekaterinburg",
        }).format(new Date(beginsAt));
        this.spinButton.textContent =
          Date.now() < beginsAt ? `Старт — ${starts}` : "Акция завершена";
        this.bookButton.textContent = "Перейти к записи ↗";
        this.status.textContent =
          Date.now() < beginsAt
            ? `Праздничные бонусы доступны с ${starts}.`
            : "Срок акции завершён. Сохранённый результат больше не действует.";
      } else if (!this.saved && !this.spinning) {
        this.spinButton.disabled = false;
        this.spinButton.textContent = "Открыть мой бонус ↗";
        this.status.textContent = "";
      }
      (this.saved ? this.bookButton : this.spinButton).focus({
        preventScroll: true,
      });
    }

    close() {
      if (!this.dialog.open || this.closing) return;
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
        this.dialog.close();
        return;
      }
      this.closing = true;
      this.dialog.classList.add("is-closing");
      // Keep the native dialog modal until its short exit animation finishes.
      this.closeTimer = setTimeout(() => this.dialog.close(), 200);
    }

    spin() {
      if (this.spinning || this.saved || this.claiming || !this.isActive())
        return;
      // Serialise a draw across open tabs where Web Locks is available.
      if (!this.preview && navigator.locks?.request) {
        this.claiming = true;
        navigator.locks
          .request(this.key, () => {
            this.claiming = false;
            this.draw();
          })
          .catch(() => {
            this.claiming = false;
            this.status.textContent =
              "Не удалось открыть бонус. Попробуйте ещё раз.";
          });
      } else this.draw();
    }

    draw() {
      if (this.spinning || this.saved || !this.isActive()) return;
      if (!this.preview) {
        const saved = read(this.key);
        if (this.prizes.some((prize) => prize.id === saved?.prizeId)) {
          this.saved = saved;
          this.restore();
          return;
        }
      }
      const index = random(this.prizes.length);
      const prize = this.prizes[index];
      this.saved = {
        prizeId: prize.id,
        code: `${this.preview ? "TEST-" : ""}${this.config.codePrefix || "GL-BONUS"}-${prize.id.toUpperCase()}-${random(10000).toString().padStart(4, "0")}`,
        openedAt: new Date().toISOString(),
      };
      this.persisted = write(this.key, this.saved);
      this.spinning = true;
      this.spinButton.disabled = true;
      this.spinButton.textContent = "Колесо выбирает сюрприз…";
      this.wheel.classList.add("is-spinning");
      const step = 360 / this.prizes.length;
      const target = 360 - (index + 0.5) * step;
      this.rotation += 5 * 360 + ((target - (this.rotation % 360) + 360) % 360);
      this.disc.style.transform = `rotate(${this.rotation}deg)`;
      const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
      this.timer = setTimeout(() => this.finish(), reduced ? 0 : 4900);
    }

    repeatPreview() {
      if (!this.preview || this.spinning) return;
      this.saved = null;
      this.result.hidden = true;
      this.intro.hidden = false;
      this.bookButton.hidden = true;
      this.spinButton.hidden = false;
      this.previewAgain.hidden = true;
      this.status.textContent = "Пробное вращение…";
      this.spin();
      this.dialog
        .querySelector(".fortune-dialog__close")
        .focus({ preventScroll: true });
    }

    finish() {
      clearTimeout(this.timer);
      this.disc.getAnimations?.().forEach((animation) => animation.finish());
      this.spinning = false;
      this.wheel.classList.remove("is-spinning");
      this.restore(true);
    }

    restore(keepRotation = false) {
      const index = this.prizes.findIndex(
        (prize) => prize.id === this.saved?.prizeId,
      );
      if (index < 0) return;
      const prize = this.prizes[index];
      if (!keepRotation) {
        this.disc.style.transition = "none";
        this.rotation = 360 - (index + 0.5) * (360 / this.prizes.length);
        this.disc.style.transform = `rotate(${this.rotation}deg)`;
        requestAnimationFrame(() =>
          this.disc.style.removeProperty("transition"),
        );
      }
      this.resultTitle.textContent = prize.title;
      this.resultText.textContent = prize.text;
      this.code.textContent = this.saved.code;
      this.result.hidden = false;
      this.intro.hidden = true;
      this.spinButton.hidden = true;
      this.bookButton.hidden = false;
      if (this.previewAgain) this.previewAgain.hidden = false;
      this.status.textContent = this.preview
        ? "Пробный результат для просмотра. Можно прокрутить ещё раз."
        : `Ваш бонус: ${prize.title}. ` +
          (this.persisted === false
            ? "Сохраните скриншот приза с промокодом: браузер не разрешил его запомнить."
            : "Результат сохранён в этом браузере.");
      if (this.dialog.open) this.bookButton.focus({ preventScroll: true });
    }

    async copyResult() {
      const prize = this.prizes.find(
        (prize) => prize.id === this.saved?.prizeId,
      );
      if (!prize) return;
      try {
        await navigator.clipboard.writeText(this.saved.code);
        this.status.textContent =
          "Промокод скопирован. Отправьте его в сообщении или укажите в комментарии к онлайн-записи.";
      } catch {
        this.status.textContent =
          "Сохраните скриншот приза с промокодом или перепишите код для сообщения или комментария к записи.";
      }
    }

    setTheme(theme) {
      this.dialog.dataset.wheelTheme = ["halloween", "winter", "base"].includes(
        theme,
      )
        ? theme
        : "base";
      this.eyebrow.textContent = "Сезонный бонус";
      document.getElementById("fortuneTitle").textContent =
        theme === "halloween" ? "Колесо Хэллоуина" : "Подарок к вашему визиту";
    }
  }
  window.GlaireFortuneWheel = GlaireFortuneWheel;
})();

;

/* Источник: assets/events/halloween/halloween.js */
/* Optional event layer. It never edits map elements or existing photo sources. */
(() => {
  "use strict";
  const config = window.GLAIRE_EVENT_CONFIG;
  if (!config || !window.GlaireFortuneWheel) return;
  const root = document.documentElement;
  const assetBase = new URL(
    ".",
    document.currentScript?.src ||
      new URL("/assets/events/halloween/event-layer.js", location.href),
  );
  const create = (tag, className, text) => {
    const node = document.createElement(tag);
    node.className = className;
    if (text) node.textContent = text;
    return node;
  };
  const image = (file, className) => {
    const img = create("img", className);
    img.src = new URL(file, assetBase).href;
    img.alt = "";
    img.width = 120;
    img.height = 120;
    img.decoding = "async";
    img.setAttribute("aria-hidden", "true");
    return img;
  };
  const backdrop = create("div", "halloween-backdrop");
  backdrop.setAttribute("aria-hidden", "true");
  document.body.prepend(backdrop);

  /* Одна поверхность на всю длину документа: соседние нити рисуются
     без промежуточных прямоугольных тайлов и их сглаживаемых краёв.
     ResizeObserver нужен только для размеров, прокрутка ничего не перерисовывает. */
  const svgNS = "http://www.w3.org/2000/svg";
  const webField = document.createElementNS(svgNS, "svg");
  webField.classList.add("halloween-web-field");
  webField.setAttribute("fill", "none");
  webField.setAttribute("stroke-linecap", "round");
  webField.setAttribute("stroke-linejoin", "round");
  webField.setAttribute("aria-hidden", "true");
  webField.setAttribute("focusable", "false");
  backdrop.prepend(webField);
  const webShapes = new URL("web-shapes-v2.svg", assetBase);
  let fieldSize = "";
  let fieldFrame = 0;
  const drawWebField = () => {
    fieldFrame = 0;
    const { width, height } = backdrop.getBoundingClientRect();
    const scale = width <= 760 ? 2 / 3 : 1;
    const size = `${Math.ceil(width)}:${Math.ceil(height)}:${scale}`;
    if (!width || !height || size === fieldSize) return;
    fieldSize = size;
    const field = document.createDocumentFragment();
    const columns = Math.ceil(width / (960 * scale));
    const rows = Math.ceil(height / (800 * scale));
    for (let row = -1; row <= rows; row++) {
      for (let column = -1; column <= columns; column++) {
        [["web1", 80, 110], ["web2", 590, 520]].forEach(([id, x, y]) => {
          const web = document.createElementNS(svgNS, "use");
          web.setAttribute("href", `${webShapes.href}#${id}`);
          web.setAttribute("transform",
            `translate(${(column * 960 + x) * scale} ${(row * 800 + y) * scale}) scale(${scale})`);
          field.append(web);
        });
      }
    }
    webField.replaceChildren(field);
  };
  const scheduleWebField = () => {
    if (!fieldFrame) fieldFrame = requestAnimationFrame(drawWebField);
  };
  drawWebField();
  if ("ResizeObserver" in window) {
    new ResizeObserver(scheduleWebField).observe(document.body);
  } else {
    window.addEventListener("resize", scheduleWebField, { passive: true });
    window.addEventListener("load", scheduleWebField, { once: true });
  }
  const brandIcon = document.getElementById("brandIcon");
  if (
    brandIcon &&
    !brandIcon.parentElement.classList.contains("halloween-logo-mark")
  ) {
    const mark = create("span", "halloween-logo-mark");
    brandIcon.before(mark);
    mark.append(brandIcon);
  }
  const brandTitle = document.querySelector(".brand__title");
  if (brandTitle && !brandTitle.querySelector(".halloween-brand-pumpkin")) {
    brandTitle.append(image("jack-lantern.svg", "halloween-brand-pumpkin"));
  }
  const fireflies = create("div", "halloween-fireflies");
  fireflies.setAttribute("aria-hidden", "true");
  ["one", "two", "three"].forEach((name) =>
    fireflies.append(
      create("i", `halloween-firefly halloween-firefly--${name}`),
    ),
  );
  backdrop.append(fireflies);
  const aura = create("div", "halloween-aura");
  [
    ["spider", "4%", "13%"],
    ["spark", "94%", "20%"],
    ["pumpkin", "95%", "32%"],
    ["bat", "4%", "43%"],
    ["spark", "92%", "53%"],
    ["spider", "96%", "64%"],
    ["pumpkin", "4%", "75%"],
    ["bat", "94%", "86%"],
    ["spark", "7%", "94%"],
  ].forEach(([kind, left, top]) => {
    const mark = create(
      "span",
      `halloween-aura__mark halloween-aura__mark--${kind}`,
    );
    mark.style.setProperty("--aura-x", left);
    mark.style.setProperty("--aura-y", top);
    aura.append(mark);
  });
  backdrop.append(aura);
  const copy = document.querySelector(".hero__copy");
  const announcement = create("aside", "halloween-announcement");
  announcement.setAttribute("aria-label", "Акция на Хэллоуин");
  const message = create("div", "halloween-announcement__copy");
  const openButton = create(
    "button",
    "halloween-announcement__open",
    "Открыть подарок Хэллоуина ↗",
  );
  openButton.type = "button";
  message.append(
    create(
      "span",
      "halloween-announcement__eyebrow",
      "Немного магии. Много GLAIRE.",
    ),
    create(
      "strong",
      "halloween-announcement__title",
      "Хэллоуин: −15% на все услуги",
    ),
    create("span", "halloween-announcement__date", config.datesLabel),
    create(
      "span",
      "halloween-announcement__terms",
      "Не суммируется с другими скидками.",
    ),
    openButton,
  );
  announcement.append(
    image("jack-lantern.svg", "halloween-announcement__icon"),
    message,
    create("span", "halloween-announcement__seal", "Halloween edition"),
  );
  copy?.append(announcement);
  const mobileNote = create("button", "halloween-topnote container");
  mobileNote.type = "button";
  mobileNote.append(
    image("jack-lantern.svg", "halloween-topnote__icon"),
    create("span", "", "Хэллоуин · −15% на все услуги"),
    create("small", "", config.datesLabel),
  );
  document.querySelector(".hero")?.prepend(mobileNote);

  // Place the larger ornaments in page gutters or the existing gaps between sections.
  const scenes = [
    [".hero", "bats", "right", "22%"],
    ["#bonus", "pumpkins", "left", "44%"],
    ["#master", "ghosts", "right", "35%"],
    ["#content", "ghosts", "left", "25%"],
    ["#works", "bats", "right", "48%"],
    ["#news", "pumpkins", "left", "56%"],
    ["#consultation", "ghosts", "right", "38%"],
  ];
  scenes.forEach(([selector, kind, side, top]) => {
    const section = document.querySelector(selector);
    if (!section) return;
    section.classList.add("halloween-scene-host");
    const ornament = create(
      "span",
      `halloween-scene halloween-scene--${kind} halloween-scene--${side}`,
    );
    ornament.style.setProperty("--scene-top", top);
    ornament.setAttribute("aria-hidden", "true");
    section.append(ornament);
  });
  if ("IntersectionObserver" in window) {
    const sceneObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) =>
          entry.target.classList.toggle("is-in-view", entry.isIntersecting),
        );
      },
      { threshold: 0.1 },
    );
    document
      .querySelectorAll(".halloween-scene")
      .forEach((scene) => sceneObserver.observe(scene));
  }
  const updateAnimationState = () =>
    root.classList.toggle("halloween-motion-paused", document.hidden);
  document.addEventListener("visibilitychange", updateAnimationState);
  updateAnimationState();

  const invitation = create("button", "halloween-invitation");
  invitation.type = "button";
  const invitationCopy = create("span", "");
  invitationCopy.append(
    create("strong", "", "Праздник любит приятные сюрпризы"),
    create(
      "small",
      "",
      "Поверните колесо Хэллоуина и откройте бонус к визиту.",
    ),
  );
  invitation.append(
    image("jack-lantern.svg", "halloween-invitation__icon"),
    invitationCopy,
    create("span", "halloween-invitation__arrow", "↗"),
  );
  document.querySelector("#bonus > .container")?.append(invitation);

  const wheel = new window.GlaireFortuneWheel(config);
  const launcher = create("button", "fortune-launcher halloween-launcher");
  launcher.type = "button";
  launcher.setAttribute("aria-label", "Открыть колесо бонусов GLAIRE");
  launcher.setAttribute("aria-haspopup", "dialog");
  launcher.setAttribute("aria-controls", "glaireFortuneDialog");
  launcher.append(
    image("jack-lantern.svg", "halloween-launcher__pumpkin"),
    create("span", "fortune-launcher__symbol", "✦"),
    create("span", "halloween-launcher__label", "Ваш подарок Хэллоуина"),
  );
  document.body.append(launcher);
  // Один автоматический показ при посещении каждой страницы. Ручное открытие
  // до блока мастера не расходует этот показ; выигрыш хранится отдельно.
  let autoShownThisVisit = false;
  const open = (options = {}) => {
    wheel.open(options);
  };
  [openButton, mobileNote, invitation, launcher].forEach((button) =>
    button.addEventListener("click", open),
  );
  let scrollFrame = 0;
  const params = new URLSearchParams(location.search);
  const isAdmin = params.get("admin") === "1";
  const directEntry =
    ["/halloween-bonus", "/halloween-surprise", "/halloween"].includes(
      location.pathname.replace(/\/+$/, ""),
    ) ||
    ["1", "halloween", config.campaignId].includes(
      String(params.get("wheel") || "").toLowerCase(),
    );
  // Наблюдаем весь блок: на адаптиве фото и текст могут занимать разную высоту.
  const masterTrigger = document.getElementById("master");
  const autoOpen = () => {
    if (
      autoShownThisVisit ||
      isAdmin ||
      document.hidden ||
      root.dataset.event !== "halloween" ||
      !wheel.isActive()
    )
      return;
    if (
      document.querySelector("dialog[open], [data-glaire-booking-modal]") ||
      document
        .getElementById("menuToggleBtn")
        ?.getAttribute("aria-expanded") === "true"
    )
      return;
    const master = masterTrigger?.getBoundingClientRect();
    if (
      !master ||
      master.top >= innerHeight * 0.78 ||
      master.bottom <= innerHeight * 0.12 ||
      window.scrollY < 1
    )
      return;
    open();
    if (wheel.dialog.open) autoShownThisVisit = true;
  };
  const updateScroll = () => {
    scrollFrame = 0;
    autoOpen();
  };
  window.addEventListener(
    "scroll",
    () => {
      if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScroll);
    },
    { passive: true },
  );
  window.addEventListener("resize", autoOpen, { passive: true });
  document.addEventListener("visibilitychange", autoOpen);
  // Если блок уже виден, после закрытия меню нового scroll может не быть.
  document.getElementById("menuToggleBtn")?.addEventListener("click", () => {
    requestAnimationFrame(autoOpen);
  });
  if (masterTrigger && "IntersectionObserver" in window) {
    const masterObserver = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) autoOpen();
      },
      { threshold: 0.12, rootMargin: "0px 0px -22% 0px" },
    );
    masterObserver.observe(masterTrigger);
  }
  window.GlaireSeason = {
    wheel,
    openWheel: open,
    setTheme(theme) {
      const next = ["halloween", "winter", "base"].includes(theme)
        ? theme
        : "base";
      root.dataset.event = next;
      wheel.setTheme(next);
      launcher.dataset.theme = next;
      launcher.querySelector(".fortune-launcher__symbol").textContent =
        next === "winter" ? "❄" : "✦";
      launcher.querySelector(".halloween-launcher__label").textContent =
        next === "halloween" ? "Ваш подарок Хэллоуина" : "Ваш бонус GLAIRE";
    },
  };
  window.GlaireSeason.setTheme(config.theme);
  // A share link opens the actual dialog immediately, without a click or scroll.
  if (directEntry && !isAdmin) {
    open({ immediate: true });
    autoShownThisVisit = true;
  } else updateScroll();
})();

;

/* Источник: assets/events/halloween/halloween-audio.js */
/* Optional Halloween ambience. Audio starts quietly; a real gesture unlocks it
   when the browser blocks autoplay. The visitor's mute choice is remembered. */
(() => {
  "use strict";
  if (!window.GlaireSeason) return;
  const root = document.documentElement;
  const source = new URL(
    "halloween-atmosphere-v1.m4a",
    document.currentScript.src,
  ).href;
  const effectSource = new URL("bat-flight-v1.m4a", document.currentScript.src)
    .href;
  const effectTimes = [8.1, 28.6, 47.2, 69.3];
  const effectLevel = 0.65;
  const prefix = "glaire:halloween:audio:";
  const read = (key) => {
    try {
      return localStorage.getItem(prefix + key);
    } catch {
      return null;
    }
  };
  const save = (key, value) => {
    try {
      localStorage.setItem(prefix + key, String(value));
    } catch {}
  };
  const savedVolume = read("volume");
  let volume =
    savedVolume === null
      ? 0.2
      : Math.max(0, Math.min(100, Number(savedVolume) || 0)) / 100;
  let enabled = read("muted") !== "true";
  let starting = false,
    failed = false,
    attempt = 0,
    pauseTimer = 0,
    fadeFrame = 0;
  let context = null,
    gain = null,
    mediaSource = null;
  let effectAudio = null,
    effectLoad = null,
    nextEffect = 0,
    lastEffectTime = 0,
    effectEpoch = 0,
    effectsPlayed = 0;
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
  opener.innerHTML =
    '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 5 5.5 9H2v6h3.5l4.5 4V5Z"/><g class="halloween-sound__waves"><path d="M14 8a5 5 0 0 1 0 8M17 5a9 9 0 0 1 0 14"/></g><path class="halloween-sound__slash" d="m15 9 6 6m0-6-6 6"/></svg>';
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
  slider.min = "0";
  slider.max = "100";
  slider.step = "1";
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
  const audibleVideo = () =>
    [...document.querySelectorAll("video")].some(
      (video) =>
        !video.paused && !video.ended && !video.muted && video.volume > 0,
    );
  const playing = () =>
    enabled &&
    !audio.paused &&
    !document.hidden &&
    (!context || context.state === "running");
  const targetGain = () =>
    enabled && seasonal() && !document.hidden
      ? volume * (audibleVideo() ? 0.12 : 1)
      : 0;

  function setPanel(open, restoreFocus = false) {
    panel.hidden = !open;
    opener.setAttribute("aria-expanded", String(open));
    if (open) toggle.focus({ preventScroll: true });
    else if (restoreFocus) opener.focus({ preventScroll: true });
  }

  function updateUI() {
    const on = playing();
    dock.dataset.state = on
      ? "playing"
      : !enabled
        ? "off"
        : failed
          ? "error"
          : starting
            ? "loading"
            : "waiting";
    dock.dataset.ducked = String(on && audibleVideo());
    toggle.setAttribute("aria-pressed", String(on));
    toggle.setAttribute("aria-busy", String(starting));
    const label = on
      ? "Выключить звуки Хэллоуина"
      : starting
        ? "Отменить запуск звука"
        : "Включить звуки Хэллоуина";
    toggle.setAttribute("aria-label", label);
    toggle.title = label;
    toggle.textContent = on
      ? "Выключить звук"
      : starting
        ? "Отменить запуск"
        : "Включить звук";
    opener.setAttribute(
      "aria-label",
      `${on ? "Звук включён" : "Звук выключен"}. Открыть настройки звука`,
    );
    opener.title = `${on ? "Звук включён" : "Звук выключен"} · настройки`;
    volumeValue.value = `${Math.round(volume * 100)}%`;
    slider.setAttribute(
      "aria-valuetext",
      `${Math.round(volume * 100)} процентов`,
    );
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
      else gain.gain.setTargetAtTime(target, time, 0.16);
    } else if (immediate || document.hidden) {
      audio.volume = target;
      if (effectAudio) effectAudio.volume = target * effectLevel;
    } else {
      const from = audio.volume,
        start = performance.now();
      const fade = (now) => {
        const progress = Math.min(1, (now - start) / 450);
        audio.volume = Math.max(
          0,
          Math.min(1, from + (target - from) * progress),
        );
        if (effectAudio) effectAudio.volume = audio.volume * effectLevel;
        if (progress < 1) fadeFrame = requestAnimationFrame(fade);
      };
      fadeFrame = requestAnimationFrame(fade);
    }
    updateUI();
  }

  function stopEffects() {
    ++effectEpoch;
    activeEffects.forEach((node) => {
      try {
        node.stop();
      } catch {}
    });
    activeEffects.clear();
    effectAudio?.pause();
  }

  async function playEffect(cue) {
    if (!playing()) return;
    const epoch = effectEpoch;
    if (context && gain) {
      if (!effectLoad) {
        effectLoad = fetch(effectSource)
          .then((response) => {
            if (!response.ok) throw new Error("Sound unavailable");
            return response.arrayBuffer();
          })
          .then((data) => context.decodeAudioData(data))
          .catch(() => {
            effectLoad = null;
            return null;
          });
      }
      const buffer = await effectLoad;
      if (
        !buffer ||
        epoch !== effectEpoch ||
        !playing() ||
        Math.abs(audio.currentTime - cue) > 1.5
      )
        return;
      const node = context.createBufferSource();
      const trim = context.createGain();
      trim.gain.value = effectLevel;
      node.buffer = buffer;
      node.connect(trim);
      trim.connect(gain);
      activeEffects.add(node);
      node.onended = () => {
        activeEffects.delete(node);
        node.disconnect();
        trim.disconnect();
      };
      node.start();
      ++effectsPlayed;
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
      try {
        await effectAudio.play();
        ++effectsPlayed;
      } catch {}
    }
  }

  audio.addEventListener("timeupdate", () => {
    const time = audio.currentTime;
    if (time < lastEffectTime - 0.5) nextEffect = 0;
    lastEffectTime = time;
    if (!playing() || audio.seeking) return;
    while (nextEffect < effectTimes.length && effectTimes[nextEffect] <= time) {
      const cue = effectTimes[nextEffect++];
      if (time - cue < 0.6) playEffect(cue);
    }
  });
  audio.addEventListener("seeking", () => {
    stopEffects();
    const time = audio.currentTime;
    nextEffect = effectTimes.findIndex((cue) => cue >= time - 0.4);
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
        context = null;
        gain = null;
        mediaSource = null;
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
    starting = true;
    failed = false;
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
      status.textContent = failed
        ? "Не удалось загрузить звук. Нажмите, чтобы попробовать ещё раз."
        : "Звук включится после первого нажатия на странице.";
    } finally {
      if (token === attempt) {
        starting = false;
        updateUI();
      }
    }
  }

  function stop(remember = true, immediate = false) {
    enabled = false;
    starting = false;
    ++attempt;
    if (remember) save("muted", true);
    clearTimeout(pauseTimer);
    adjustGain(immediate);
    const pause = () => {
      audio.pause();
      context?.suspend().catch(() => {});
    };
    if (immediate) pause();
    else pauseTimer = setTimeout(pause, 500);
    status.textContent = "Звуки Хэллоуина выключены";
    updateUI();
  }

  toggle.addEventListener("click", () => {
    if (enabled && (playing() || starting)) stop();
    else {
      enabled = true;
      failed = false;
      save("muted", false);
      start(true);
    }
  });
  opener.addEventListener("click", () => {
    const opening = panel.hidden;
    setPanel(opening);
    if (opening && enabled && !playing()) start(true);
  });
  closePanel.addEventListener("click", () => setPanel(false, true));
  document.addEventListener(
    "pointerdown",
    (event) => {
      if (!dock.contains(event.target)) setPanel(false);
    },
    { passive: true, capture: true },
  );
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) {
      event.preventDefault();
      event.stopPropagation();
      setPanel(false, true);
    }
  });
  document.addEventListener("focusin", (event) => {
    if (!panel.hidden && !dock.contains(event.target)) setPanel(false);
  });
  const wheelDialog = document.querySelector(".fortune-dialog");
  if (wheelDialog)
    new MutationObserver(() => {
      if (wheelDialog.open) setPanel(false);
    }).observe(wheelDialog, { attributes: true, attributeFilter: ["open"] });
  dialogMute.addEventListener("click", () => stop());
  slider.addEventListener("input", () => {
    volume = Number(slider.value) / 100;
    save("volume", slider.value);
    adjustGain();
    if (enabled && !playing()) start(true);
  });

  // This is a genuine visitor gesture, never a simulated click or policy bypass.
  const unlock = (event) => {
    if (!event.isTrusted) return;
    if (dock.contains(event.target) || dialogMute.contains(event.target))
      return;
    if (
      event.type === "keydown" &&
      (event.key === "Escape" ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        [
          "Shift",
          "Control",
          "Alt",
          "Meta",
          "CapsLock",
          "NumLock",
          "ScrollLock",
        ].includes(event.key))
    )
      return;
    if (enabled && !playing()) start(true);
  };
  // Touch/pen activation may arrive at pointerup; some browsers require click.
  // Capture also covers gallery arrows and controls that stop event bubbling.
  ["pointerdown", "pointerup", "click", "touchend", "keydown"].forEach(
    (name) => {
      document.addEventListener(name, unlock, { passive: true, capture: true });
    },
  );
  if (!window.PointerEvent)
    document.addEventListener("mousedown", unlock, {
      passive: true,
      capture: true,
    });

  ["play", "pause", "ended", "volumechange"].forEach((name) =>
    document.addEventListener(
      name,
      (event) => {
        if (event.target instanceof HTMLVideoElement) adjustGain();
      },
      true,
    ),
  );
  ["playing", "pause", "waiting", "ended"].forEach((name) =>
    audio.addEventListener(name, updateUI),
  );
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      ++attempt;
      starting = false;
      adjustGain(true);
      audio.pause();
      context?.suspend().catch(() => {});
      updateUI();
    } else if (enabled) start();
  });
  window.addEventListener("pagehide", () => {
    audio.pause();
    context?.suspend().catch(() => {});
  });
  window.addEventListener("pageshow", () => {
    if (enabled) start();
  });
  new MutationObserver(() => {
    if (!seasonal()) {
      setPanel(false);
      stop(false, true);
    }
  }).observe(root, { attributes: true, attributeFilter: ["data-event"] });

  window.GlaireSeason.sound = {
    get enabled() {
      return enabled;
    },
    get playing() {
      return playing();
    },
    get volume() {
      return volume;
    },
    get gain() {
      return gain ? gain.gain.value : audio.volume;
    },
    get ducked() {
      return audibleVideo();
    },
    get effectsPlayed() {
      return effectsPlayed;
    },
    stop: () => stop(),
  };
  updateUI();
  if (enabled && seasonal()) start();
})();

;
