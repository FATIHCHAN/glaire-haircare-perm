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
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
  };
  const read = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
  const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } };
  const random = max => {
    if (window.crypto?.getRandomValues) {
      const limit = Math.floor(4294967296 / max) * max;
      let value;
      do { value = crypto.getRandomValues(new Uint32Array(1))[0]; } while (value >= limit);
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
      this.preview = location.protocol === "file:" || ["127.0.0.1", "localhost"].includes(location.hostname);
      this.key = `glaire:wheel:${config.campaignId}${this.preview ? ":preview" : ""}:v1`;
      this.saved = read(this.key);
      if (!this.prizes.some(prize => prize.id === this.saved?.prizeId)) this.saved = null;
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
      this.disc = svg("svg", {viewBox:"0 0 360 360", class:"fortune-wheel__disc"});
      const step = 360 / this.prizes.length;
      const point = (radius, degrees) => {
        const angle = (degrees - 90) * Math.PI / 180;
        return [180 + radius * Math.cos(angle), 180 + radius * Math.sin(angle)];
      };
      this.prizes.forEach((prize, index) => {
        const start = point(178, index * step);
        const end = point(178, (index + 1) * step);
        const sector = svg("path", {
          d:`M180 180 L${start} A178 178 0 ${step > 180 ? 1 : 0} 1 ${end} Z`,
          class:`fortune-wheel__sector--${index % 2 ? "b" : "a"} fortune-wheel__line`,
        });
        const group = svg("g", {transform:`rotate(${index * step + step / 2} 180 180)`});
        const symbol = svg("text", {x:180, y:64, class:"fortune-wheel__symbol"});
        symbol.textContent = prize.symbol || "✦";
        const label = svg("text", {x:180, y:89, class:"fortune-wheel__label"});
        label.textContent = prize.label;
        group.append(symbol, label);
        this.disc.append(sector, group);
      });
      const pointer = make("span", "fortune-wheel__pointer");
      const hub = make("div", "fortune-wheel__hub");
      hub.append(make("strong", "", "GLAIRE"), make("small", "", "Ваш бонус"));
      this.wheel.append(this.disc, pointer, hub);
      stage.append(this.wheel, make("p", "fortune-wheel__caption", "Подарок к вашему визиту"));

      const copy = make("div", "fortune-dialog__copy");
      this.eyebrow = make("p", "fortune-dialog__eyebrow", "Сезонный бонус");
      const title = make("h2", "fortune-dialog__title", "Колесо Хэллоуина");
      title.id = "fortuneTitle";
      this.dates = make("p", "fortune-dialog__dates", this.config.wheelDatesLabel || this.config.datesLabel);
      this.intro = make("p", "fortune-dialog__intro", "Поверните колесо и откройте небольшой подарок к вашему визиту.");
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
      const redemption = make("p", "fortune-redemption", this.config.redemptionInstructions);
      this.result.append(make("span", "fortune-result__label", "Ваш праздничный бонус"), this.resultTitle, this.resultText, this.code, this.copyButton, redemption);
      copy.append(this.eyebrow, title, this.dates, this.intro, this.result);

      const actions = make("div", "fortune-dialog__actions");
      this.spinButton = make("button", "fortune-action", "Открыть мой бонус ↗");
      this.spinButton.type = "button";
      this.spinButton.addEventListener("click", () => this.spin());
      this.bookButton = make("a", "fortune-action", "Записаться с бонусом ↗");
      this.bookButton.href = document.getElementById("bookBtnTop")?.href || "#book";
      this.bookButton.hidden = true;
      this.bookButton.addEventListener("click", () => this.close());
      const rule = make("p", "fortune-dialog__rule", `Бонус колеса или скидка −${this.config.discount}% — на выбор. При записи понадобится промокод или скриншот приза.`);
      const details = make("details", "fortune-dialog__details");
      const list = make("ul");
      this.prizes.forEach(prize => list.append(make("li", "", `${prize.title}: ${prize.text}`)));
      list.append(make("li", "", this.config.wheelTerms));
      list.append(make("li", "", this.config.redemptionInstructions));
      details.append(make("summary", "", "Что внутри и как использовать"), list);
      this.status = make("p", "fortune-dialog__status");
      this.status.setAttribute("role", "status");
      this.status.setAttribute("aria-live", "polite");
      actions.append(this.spinButton, this.bookButton, rule, this.status, details);
      if (this.preview) {
        this.previewAgain = make("button", "fortune-preview-again", "Прокрутить ещё раз");
        this.previewAgain.type = "button";
        this.previewAgain.hidden = true;
        this.previewAgain.addEventListener("click", () => this.repeatPreview());
        actions.insertBefore(this.previewAgain, rule);
      }
      body.append(stage, copy, actions);
      this.dialog.append(close, body);
      document.body.append(this.dialog);
      this.dialog.addEventListener("click", event => {
        if (event.target !== this.dialog) return;
        const r = this.dialog.getBoundingClientRect();
        if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) this.close();
      });
      this.dialog.addEventListener("cancel", event => {
        event.preventDefault();
        this.close();
      });
      this.dialog.addEventListener("close", () => {
        clearTimeout(this.closeTimer);
        this.closing = false;
        this.dialog.classList.remove("is-closing", "is-instant-entry");
        document.documentElement.classList.remove("fortune-modal-open");
        if (this.spinning) this.finish();
        this.pausedVideos?.forEach(video => {
          if (video.isConnected && video.getBoundingClientRect().bottom > 0 && video.getBoundingClientRect().top < innerHeight) video.play().catch(() => {});
        });
        this.lastFocus?.focus({preventScroll:true});
      });
      document.addEventListener("play", event => {
        if (this.dialog.open && event.target instanceof HTMLVideoElement) event.target.pause();
      }, true);
      if (this.saved) this.restore();
      if (!this.preview) window.addEventListener("storage", event => {
        if (event.key !== this.key || this.spinning) return;
        const saved = read(this.key);
        if (this.prizes.some(prize => prize.id === saved?.prizeId)) {
          this.saved = saved;
          this.restore();
        }
      });
    }

    isActive() {
      const now = Date.now();
      return this.preview || (now >= Date.parse(this.config.wheelStartsAt || this.config.startsAt) && now < Date.parse(this.config.endsAt));
    }

    open({immediate = false} = {}) {
      if (this.dialog.open) {
        if (this.closing) {
          clearTimeout(this.closeTimer);
          this.closing = false;
          this.dialog.classList.remove("is-closing");
        }
        return;
      }
      this.lastFocus = document.activeElement;
      this.pausedVideos = [...document.querySelectorAll("video")].filter(video => !video.paused);
      this.pausedVideos.forEach(video => video.pause());
      this.dialog.classList.toggle("is-instant-entry", immediate);
      this.dialog.showModal();
      document.documentElement.classList.add("fortune-modal-open");
      if (!this.isActive()) {
        this.spinButton.disabled = true;
        const beginsAt = Date.parse(this.config.wheelStartsAt || this.config.startsAt);
        const starts = new Intl.DateTimeFormat("ru-RU", {day:"numeric",month:"long",timeZone:"Asia/Yekaterinburg"}).format(new Date(beginsAt));
        this.spinButton.textContent = Date.now() < beginsAt ? `Старт — ${starts}` : "Акция завершена";
        this.bookButton.textContent = "Перейти к записи ↗";
        this.status.textContent = Date.now() < beginsAt ? `Праздничные бонусы доступны с ${starts}.` : "Срок акции завершён. Сохранённый результат больше не действует.";
      } else if (!this.saved && !this.spinning) {
        this.spinButton.disabled = false;
        this.spinButton.textContent = "Открыть мой бонус ↗";
        this.status.textContent = "";
      }
      (this.saved ? this.bookButton : this.spinButton).focus({preventScroll:true});
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
      if (this.spinning || this.saved || this.claiming || !this.isActive()) return;
      // Serialise a draw across open tabs where Web Locks is available.
      if (!this.preview && navigator.locks?.request) {
        this.claiming = true;
        navigator.locks.request(this.key, () => {
          this.claiming = false;
          this.draw();
        }).catch(() => {
          this.claiming = false;
          this.status.textContent = "Не удалось открыть бонус. Попробуйте ещё раз.";
        });
      } else this.draw();
    }

    draw() {
      if (this.spinning || this.saved || !this.isActive()) return;
      if (!this.preview) {
        const saved = read(this.key);
        if (this.prizes.some(prize => prize.id === saved?.prizeId)) {
          this.saved = saved;
          this.restore();
          return;
        }
      }
      const index = random(this.prizes.length);
      const prize = this.prizes[index];
      this.saved = {prizeId:prize.id, code:`${this.preview ? "TEST-" : ""}${this.config.codePrefix || "GL-BONUS"}-${prize.id.toUpperCase()}-${random(10000).toString().padStart(4,"0")}`, openedAt:new Date().toISOString()};
      this.persisted = write(this.key, this.saved);
      this.spinning = true;
      this.spinButton.disabled = true;
      this.spinButton.textContent = "Колесо выбирает сюрприз…";
      this.wheel.classList.add("is-spinning");
      const step = 360 / this.prizes.length;
      const target = 360 - (index + .5) * step;
      this.rotation += 5 * 360 + (target - this.rotation % 360 + 360) % 360;
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
      this.dialog.querySelector(".fortune-dialog__close").focus({preventScroll:true});
    }

    finish() {
      clearTimeout(this.timer);
      this.disc.getAnimations?.().forEach(animation => animation.finish());
      this.spinning = false;
      this.wheel.classList.remove("is-spinning");
      this.restore(true);
    }

    restore(keepRotation = false) {
      const index = this.prizes.findIndex(prize => prize.id === this.saved?.prizeId);
      if (index < 0) return;
      const prize = this.prizes[index];
      if (!keepRotation) {
        this.disc.style.transition = "none";
        this.rotation = 360 - (index + .5) * (360 / this.prizes.length);
        this.disc.style.transform = `rotate(${this.rotation}deg)`;
        requestAnimationFrame(() => this.disc.style.removeProperty("transition"));
      }
      this.resultTitle.textContent = prize.title;
      this.resultText.textContent = prize.text;
      this.code.textContent = this.saved.code;
      this.result.hidden = false;
      this.intro.hidden = true;
      this.spinButton.hidden = true;
      this.bookButton.hidden = false;
      if (this.previewAgain) this.previewAgain.hidden = false;
      this.status.textContent = this.preview ? "Пробный результат для просмотра. Можно прокрутить ещё раз." : `Ваш бонус: ${prize.title}. ` + (this.persisted === false ? "Сохраните скриншот приза с промокодом: браузер не разрешил его запомнить." : "Результат сохранён в этом браузере.");
      if (this.dialog.open) this.bookButton.focus({preventScroll:true});
    }

    async copyResult() {
      const prize = this.prizes.find(prize => prize.id === this.saved?.prizeId);
      if (!prize) return;
      try { await navigator.clipboard.writeText(this.saved.code); this.status.textContent = "Промокод скопирован. Отправьте его в сообщении или укажите в комментарии к онлайн-записи."; }
      catch { this.status.textContent = "Сохраните скриншот приза с промокодом или перепишите код для сообщения или комментария к записи."; }
    }

    setTheme(theme) {
      this.dialog.dataset.wheelTheme = ["halloween", "winter", "base"].includes(theme) ? theme : "base";
      this.eyebrow.textContent = "Сезонный бонус";
      document.getElementById("fortuneTitle").textContent = theme === "halloween" ? "Колесо Хэллоуина" : "Подарок к вашему визиту";
    }
  }
  window.GlaireFortuneWheel = GlaireFortuneWheel;
})();
