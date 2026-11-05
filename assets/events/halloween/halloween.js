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
  // Если посетитель закрыл вручную открытое колесо уже у мастера,
  // не показываем его тут же повторно из-за восстановления фокуса/прокрутки.
  wheel.dialog.addEventListener("close", () => {
    const rect = masterTrigger?.getBoundingClientRect();
    if (rect && rect.top < innerHeight * .78 && rect.bottom > innerHeight * .12)
      autoShownThisVisit = true;
  });
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
