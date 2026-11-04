/* Онлайн-запись DIKIDI, виджет 221806.
   Официальный сценарий подключается один раз и только при нажатии.
   Без JavaScript остаётся обычная ссылка DIKIDI. Данные клиента здесь не собираются. */
(() => {
  "use strict";
  const widgetUrl = "https://dikidi.net/#widget=221806";
  const recordUrl = "https://dikidi.net/record/?widget=221806";
  const fallbackUrl = "https://dikidi.net/1954293?p=1.pi-ssm";
  const scriptUrl = "https://dikidi.ru/assets/js/widget_record/widget2.min.js?v=1825777749";
  let vendorPromise;
  let opening = false;
  let status;

  const announce = (text) => {
    if (!status) {
      status = document.createElement("div");
      status.className = "booking-status";
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
      document.body.append(status);
    }
    status.textContent = text;
    status.hidden = !text;
  };

  const loadVendor = () => {
    if (vendorPromise) return vendorPromise;
    vendorPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = scriptUrl;
      script.async = true;
      const timeout = setTimeout(() => reject(new Error("DIKIDI timeout")), 12000);
      script.onload = () => {
        clearTimeout(timeout);
        if (window.dikidi?.openModal) resolve(window.dikidi);
        else reject(new Error("DIKIDI unavailable"));
      };
      script.onerror = () => {
        clearTimeout(timeout);
        reject(new Error("DIKIDI script failed"));
      };
      document.head.append(script);
    });
    return vendorPromise;
  };

  // Дополняем штатное окно именем и клавиатурой, не вмешиваясь в форму DIKIDI.
  const prepareModal = (trigger) => {
    const frame = [...document.querySelectorAll("iframe")].find((item) =>
      item.src.startsWith(recordUrl) && item.parentElement?.parentElement?.style.display !== "none");
    const modal = frame?.parentElement?.parentElement;
    if (!modal) return () => {};
    modal.dataset.glaireBookingModal = "";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", "Онлайн-запись в GLAIRE через DIKIDI");
    frame.title = "Выбор услуги и времени — DIKIDI";
    const close = modal.querySelector('[class$="-close"]');
    close.setAttribute("role", "button");
    close.setAttribute("aria-label", "Закрыть онлайн-запись");
    close.tabIndex = 0;
    close.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        close.click();
      }
    });
    const restore = [...document.body.children]
      .filter((element) => element !== modal && !element.inert && element.tagName !== "SCRIPT");
    restore.forEach((element) => { element.inert = true; });
    const before = document.createElement("span");
    const after = document.createElement("span");
    [before, after].forEach((guard) => {
      guard.className = "booking-focus-guard";
      guard.tabIndex = 0;
      guard.setAttribute("aria-hidden", "true");
    });
    before.addEventListener("focus", () => frame.focus());
    after.addEventListener("focus", () => close.focus());
    // Корневой firstChild оставляем диалогом: на него опирается DIKIDI.
    frame.parentElement.prepend(before);
    frame.parentElement.append(after);
    const external = document.createElement("a");
    external.className = "booking-external-link";
    external.href = fallbackUrl;
    external.target = "_blank";
    external.rel = "noopener noreferrer";
    external.textContent = "Открыть запись на сайте DIKIDI ↗";
    frame.parentElement.append(external, after);
    const escape = (event) => {
      if (event.key === "Escape") { event.preventDefault(); close.click(); }
    };
    document.addEventListener("keydown", escape);
    close.focus({ preventScroll: true });
    return () => {
      restore.forEach((element) => { element.inert = false; });
      document.removeEventListener("keydown", escape);
      delete modal.dataset.glaireBookingModal;
      before.remove(); after.remove();
      external.remove();
      trigger.focus({ preventScroll: true });
    };
  };

  document.addEventListener("click", async (event) => {
    const link = event.target.closest?.("a[href]");
    if (!link || link.href !== widgetUrl || event.button !== 0 ||
        event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    // Поставщик также слушает document. Одно нажатие должно открыть одно окно.
    event.stopImmediatePropagation();
    if (opening || document.querySelector("[data-glaire-booking-modal]")) return;
    opening = true;
    link.setAttribute("aria-busy", "true");
    announce("Открываем онлайн-запись…");
    try {
      const vendor = await loadVendor();
      // Нативное колесо не должно остаться поверх окна записи. Приз сохраняется.
      document.querySelector("#glaireFortuneDialog[open]")?.close();
      let cleanup = () => {};
      vendor.openModal(recordUrl, {
        start: "2", mode: "website", backdrop: "1",
        cbShow: () => { announce(""); cleanup = prepareModal(link); },
        cbHide: () => { cleanup(); opening = false; },
      });
      announce("");
    } catch {
      announce("Открываем запись на странице DIKIDI…");
      window.location.assign(fallbackUrl);
    } finally {
      link.removeAttribute("aria-busy");
      opening = false;
    }
  });
})();
