/*
==========================================================================
Локальная админка сайта GLAIRE
--------------------------------------------------------------------------
Этот файл подключается только если страница открыта с параметром ?admin=1.
Обычный посетитель его не загружает, поэтому публичная версия сайта
остаётся легче и быстрее.

Что делает файл:
1. Создаёт структуру разделов админки
2. Строит форму редактирования по схеме ADMIN_SECTIONS
3. Подставляет текущие значения из config
4. Сохраняет изменения в localStorage
5. Возвращает страницу к дефолтным значениям при сбросе
==========================================================================
*/
(() => {
  /* runtime приходит из основного index.html и содержит всё нужное для админки */
  const runtime = window.__glaireRuntime;
  if (!runtime?.isAdminMode) return;

  /* Основные DOM-узлы панели редактирования */
  const adminPanel = document.getElementById("adminPanel");
  const adminGrid = document.getElementById("adminGrid");
  const openAdminBtn = document.getElementById("openAdminBtn");
  const closeAdminBtn = document.getElementById("closeAdminBtn");
  const saveAdminBtn = document.getElementById("saveAdminBtn");
  const resetAdminBtn = document.getElementById("resetAdminBtn");

  if (
    !adminPanel ||
    !adminGrid ||
    !openAdminBtn ||
    !closeAdminBtn ||
    !saveAdminBtn ||
    !resetAdminBtn
  ) {
    return;
  }

  /*
    Схема админки.
    Здесь не меняется логика сайта, а только описывается, какие поля
    показывать владельцу сайта, в каком порядке и с какими подсказками.
  */
  const ADMIN_SECTIONS = [
    {
      title: "Основные ссылки и изображения",
      hint: "Здесь меняются основные URL, логотип, фотографии, QR и картинки ключевых блоков.",
      fields: [
        { key: "infoUrl", label: "Ссылка для консультации / информации", placeholder: "https://dikidi.net/..." },
        { key: "bookUrl", label: "Ссылка на запись в DIKIDI", placeholder: "https://dikidi.net/..." },
        { key: "mapEmbedUrl", label: "Ссылка на embed карты", placeholder: "https://yandex.ru/map-widget/..." },
        { key: "brandImage", label: "Логотип / иконка бренда", placeholder: "assets/logo/group-17.png" },
        { key: "heroSlide1", label: "Hero-слайд 1", placeholder: "assets/studio/studio-1.jpg" },
        { key: "heroSlide2", label: "Hero-слайд 2", placeholder: "assets/studio/studio-2.jpg" },
        { key: "masterPhoto", label: "Фото мастера", placeholder: "https://... или локальный путь" },
        { key: "consultQr", label: "QR для консультации", placeholder: "assets/qr/consult-chat.png" },
        { key: "consultQrLink", label: "Ссылка по QR консультации", placeholder: "https://t.me/..." },
        { key: "telegramQr", label: "QR Telegram", placeholder: "assets/qr/telegram-qr.png" },
        { key: "telegramQrLink", label: "Ссылка по QR Telegram", placeholder: "https://t.me/..." },
        { key: "vkQr", label: "QR VK", placeholder: "assets/qr/vk-qr.png" },
        { key: "vkQrLink", label: "Ссылка по QR VK", placeholder: "https://vk.com/..." },
        { key: "mobileMenuPhone", label: "Телефон в мобильном меню", placeholder: "+7 (999) 000-00-00" },
        { key: "mobileMenuHours", label: "Часы работы в мобильном меню", placeholder: "Ежедневно с 9:00 до 21:00" },
      ],
    },
    {
      title: "Главный экран",
      hint: "Первый экран отвечает за первое впечатление. Лучше держать подачу спокойной, ясной и без перегруза.",
      fields: [
        { key: "brandSub", label: "Подпись под логотипом" },
        { key: "navInfoLabel", label: "Кнопка в шапке: консультация" },
        { key: "navBookLabel", label: "Кнопка в шапке: запись" },
        { key: "heroEyebrow", label: "Подзаголовок hero" },
        { key: "heroTitle", label: "Главный заголовок", type: "textarea" },
        { key: "heroText", label: "Описание hero", type: "textarea" },
        { key: "heroBookLabel", label: "Главная CTA-кнопка" },
        { key: "heroInfoLabel", label: "Вторичная CTA-кнопка" },
        { key: "heroSliderCaption", label: "Подпись под фото студии" },
        { key: "heroMetaTitle1", label: "Карточка 1 — заголовок" },
        { key: "heroMetaText1", label: "Карточка 1 — текст", type: "textarea" },
        { key: "heroMetaTitle2", label: "Карточка 2 — заголовок" },
        { key: "heroMetaText2", label: "Карточка 2 — текст", type: "textarea" },
        { key: "heroMetaTitle3", label: "Карточка 3 — заголовок" },
        { key: "heroMetaText3", label: "Карточка 3 — текст", type: "textarea" },
      ],
    },
    {
      title: "Контакты, карта и QR",
      hint: "Эта секция помогает человеку быстро понять локацию и каналы связи без лишнего поиска.",
      fields: [
        { key: "contactText", label: "Текст контактного блока", type: "textarea" },
        { key: "locationTitle", label: "Заголовок блока карты" },
        { key: "addressText", label: "Подпись у карты", type: "textarea" },
        { key: "telegramQrTitle", label: "Telegram — заголовок" },
        { key: "telegramQrText", label: "Telegram — описание", type: "textarea" },
        { key: "vkQrTitle", label: "VK — заголовок" },
        { key: "vkQrText", label: "VK — описание", type: "textarea" },
      ],
    },
    {
      title: "Scratch-бонус",
      hint: "Главная digital-механика сайта. Здесь управляются тексты блока и пояснения рядом с бонусом.",
      fields: [
        { key: "bonusEyebrow", label: "Подзаголовок секции" },
        { key: "bonusTitle", label: "Заголовок секции", type: "textarea" },
        { key: "bonusText", label: "Описание секции", type: "textarea" },
        { key: "scratchLabel", label: "Подпись внутри scratch" },
        { key: "scratchSwipeHint", label: "Подсказка поверх scratch" },
        { key: "scratchHint", label: "Подсказка под scratch", type: "textarea" },
        { key: "scratchResetLabel", label: "Кнопка перезапуска" },
        { key: "bonusSideTitle1", label: "Правая карточка 1 — заголовок" },
        { key: "bonusSideText1", label: "Правая карточка 1 — текст", type: "textarea" },
        { key: "bonusSideTitle2", label: "Правая карточка 2 — заголовок" },
        { key: "bonusSideList", label: "Правая карточка 2 — список", type: "textarea", help: "По одному пункту с новой строки." },
        { key: "bonusSideTitle3", label: "Правая карточка 3 — заголовок" },
        { key: "bonusSideText3", label: "Правая карточка 3 — текст", type: "textarea" },
      ],
    },
    {
      title: "Призы внутри scratch",
      hint: "Каждый бонус хранится отдельно, чтобы можно было быстро поменять смысл механики без редактирования JS.",
      fields: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].flatMap((index) => [
        { key: `scratchPrize${index}Title`, label: `Бонус ${index} — заголовок` },
        { key: `scratchPrize${index}Text`, label: `Бонус ${index} — описание`, type: "textarea" },
      ]),
    },
    {
      title: "Блок мастера и соцсети",
      hint: "Секция нужна, чтобы клиент понимал, к кому он идёт, и мог перейти в нужную соцсеть или канал связи.",
      fields: [
        { key: "masterSectionEyebrow", label: "Подзаголовок секции" },
        { key: "masterTitle", label: "Заголовок секции", type: "textarea" },
        { key: "masterText", label: "Описание секции", type: "textarea" },
        { key: "masterEyebrow", label: "Подпись над именем мастера" },
        { key: "masterName", label: "Имя мастера / подпись" },
        { key: "masterRole", label: "Роль / специализация" },
        { key: "masterDescription", label: "Описание мастера", type: "textarea" },
        { key: "masterPointTitle1", label: "Преимущество 1 — заголовок" },
        { key: "masterPointText1", label: "Преимущество 1 — текст", type: "textarea" },
        { key: "masterPointTitle2", label: "Преимущество 2 — заголовок" },
        { key: "masterPointText2", label: "Преимущество 2 — текст", type: "textarea" },
        { key: "masterPointTitle3", label: "Преимущество 3 — заголовок" },
        { key: "masterPointText3", label: "Преимущество 3 — текст", type: "textarea" },
        { key: "socialsTitle", label: "Заголовок блока соцсетей" },
        { key: "socialsText", label: "Текст блока соцсетей", type: "textarea" },
        { key: "socialsEmptyText", label: "Текст, если ссылки пока пустые", type: "textarea" },
        { key: "masterSocialVkUrl", label: "Ссылка мастера — VK" },
        { key: "masterSocialInstagramUrl", label: "Ссылка мастера — Instagram" },
        { key: "masterSocialTelegramUrl", label: "Ссылка мастера — Telegram" },
      ],
    },
    {
      title: "Контент / вертикальные видео",
      hint: "Блок для reels, stories и другого вертикального контента. Можно подставлять локальные пути к mp4, mov или webm-файлам.",
      fields: [
        { key: "contentEyebrow", label: "Подзаголовок секции" },
        { key: "contentTitle", label: "Заголовок секции", type: "textarea" },
        { key: "contentLead", label: "Описание секции", type: "textarea" },
        { key: "contentNote", label: "Подпись над лентой", type: "textarea" },
        { key: "contentBadge1", label: "Видео 1 — бейдж" },
        { key: "contentTitle1", label: "Видео 1 — заголовок" },
        { key: "contentText1", label: "Видео 1 — текст", type: "textarea" },
        { key: "contentVideo1", label: "Видео 1 — файл / ссылка", placeholder: "видео/clip-01.mp4" },
        { key: "contentBadge2", label: "Видео 2 — бейдж" },
        { key: "contentTitle2", label: "Видео 2 — заголовок" },
        { key: "contentText2", label: "Видео 2 — текст", type: "textarea" },
        { key: "contentVideo2", label: "Видео 2 — файл / ссылка", placeholder: "видео/clip-02.mp4" },
        { key: "contentBadge3", label: "Видео 3 — бейдж" },
        { key: "contentTitle3", label: "Видео 3 — заголовок" },
        { key: "contentText3", label: "Видео 3 — текст", type: "textarea" },
        { key: "contentVideo3", label: "Видео 3 — файл / ссылка", placeholder: "видео/clip-03.mp4" },
        { key: "contentBadge4", label: "Видео 4 — бейдж" },
        { key: "contentTitle4", label: "Видео 4 — заголовок" },
        { key: "contentText4", label: "Видео 4 — текст", type: "textarea" },
        { key: "contentVideo4", label: "Видео 4 — файл / ссылка", placeholder: "видео/clip-04.mp4" },
      ],
    },
    {
      title: "Работы",
      hint: "Здесь редактируется визуальный блок направлений и короткий список того, что получает клиент.",
      fields: [
        { key: "worksEyebrow", label: "Подзаголовок секции" },
        { key: "worksTitle", label: "Заголовок секции", type: "textarea" },
        { key: "worksNote", label: "Подпись под фото", type: "textarea" },
        { key: "worksTags", label: "Теги направления", type: "textarea", help: "По одному тегу с новой строки." },
        { key: "worksInfoEyebrow", label: "Подзаголовок правой колонки" },
        { key: "worksInfoLead", label: "Лид правой колонки", type: "textarea" },
        { key: "worksItemTitle1", label: "Карточка 1 — заголовок" },
        { key: "worksItemText1", label: "Карточка 1 — текст", type: "textarea" },
        { key: "worksItemTitle2", label: "Карточка 2 — заголовок" },
        { key: "worksItemText2", label: "Карточка 2 — текст", type: "textarea" },
        { key: "worksItemTitle3", label: "Карточка 3 — заголовок" },
        { key: "worksItemText3", label: "Карточка 3 — текст", type: "textarea" },
        { key: "worksItemTitle4", label: "Карточка 4 — заголовок" },
        { key: "worksItemText4", label: "Карточка 4 — текст", type: "textarea" },
        { key: "worksItemTitle5", label: "Карточка 5 — заголовок" },
        { key: "worksItemText5", label: "Карточка 5 — текст", type: "textarea" },
      ],
    },
    {
      title: "Актуальные карточки",
      hint: "Stories-карточки удобно использовать для окон, сезонных предложений, новинок и поводов написать мастеру.",
      fields: [
        { key: "newsEyebrow", label: "Подзаголовок секции" },
        { key: "newsTitle", label: "Заголовок секции", type: "textarea" },
        { key: "newsLead", label: "Описание секции", type: "textarea" },
        { key: "newsHint", label: "Подсказка над карточками" },
        { key: "newsBadge1", label: "Карточка 1 — бейдж" },
        { key: "newsTitle1", label: "Карточка 1 — заголовок" },
        { key: "newsText1", label: "Карточка 1 — текст", type: "textarea" },
        { key: "newsImage1", label: "Карточка 1 — фото" },
        { key: "newsBadge2", label: "Карточка 2 — бейдж" },
        { key: "newsTitle2", label: "Карточка 2 — заголовок" },
        { key: "newsText2", label: "Карточка 2 — текст", type: "textarea" },
        { key: "newsImage2", label: "Карточка 2 — фото" },
        { key: "newsBadge3", label: "Карточка 3 — бейдж" },
        { key: "newsTitle3", label: "Карточка 3 — заголовок" },
        { key: "newsText3", label: "Карточка 3 — текст", type: "textarea" },
        { key: "newsImage3", label: "Карточка 3 — фото" },
      ],
    },
    {
      title: "Консультация и финальный CTA",
      hint: "Последние экраны помогают снять сомнения и привести человека к записи без давления.",
      fields: [
        { key: "consultEyebrow", label: "Подзаголовок консультации" },
        { key: "consultTitle", label: "Заголовок консультации", type: "textarea" },
        { key: "consultText", label: "Текст консультации", type: "textarea" },
        { key: "consultNote", label: "Текст рядом с QR", type: "textarea" },
        { key: "visitEyebrow", label: "Подзаголовок правой карточки" },
        { key: "visitTitle", label: "Заголовок правой карточки", type: "textarea" },
        { key: "visitText", label: "Описание правой карточки", type: "textarea" },
        { key: "visitItems", label: "Список перед визитом", type: "textarea", help: "По одному пункту с новой строки." },
        { key: "ctaEyebrow", label: "Подзаголовок финального CTA" },
        { key: "ctaTitle", label: "Заголовок финального CTA", type: "textarea" },
        { key: "ctaText", label: "Текст финального CTA", type: "textarea" },
        { key: "ctaButtonLabel", label: "Кнопка финального CTA" },
        { key: "footerText", label: "Текст в подвале", type: "textarea" },
      ],
    },
  ];

  const ADMIN_FIELDS = ADMIN_SECTIONS.flatMap((section) =>
    section.fields.map((field) => field.key),
  );

  /* Превращает ключ config в стабильный id HTML-поля */
  function fieldIdFromKey(key) {
    return `cfg${key.charAt(0).toUpperCase()}${key.slice(1)}`;
  }

  /*
    Собирает всю админ-форму из схемы ADMIN_SECTIONS.
    Так список полей не дублируется вручную в HTML и проще поддерживается.
  */
  function renderAdminForm() {
    adminGrid.innerHTML = "";

    ADMIN_SECTIONS.forEach((section) => {
      /* Один sectionNode = одна смысловая группа настроек в панели */
      const sectionNode = document.createElement("section");
      sectionNode.className = "admin-section";

      /* Head содержит название раздела и короткое пояснение владельцу сайта */
      const headNode = document.createElement("div");
      headNode.className = "admin-section__head";

      const titleNode = document.createElement("div");
      titleNode.className = "admin-section__title";
      titleNode.textContent = section.title;

      const hintNode = document.createElement("div");
      hintNode.className = "admin-section__hint";
      hintNode.textContent = section.hint;

      headNode.appendChild(titleNode);
      headNode.appendChild(hintNode);

      const fieldsNode = document.createElement("div");
      fieldsNode.className = "admin-fields";

      section.fields.forEach((field) => {
        /* wrapper объединяет label, input/textarea и маленькую подсказку */
        const wrapper = document.createElement("div");
        wrapper.className = "field";

        const label = document.createElement("label");
        label.htmlFor = fieldIdFromKey(field.key);
        label.textContent = field.label;

        /*
          Для коротких значений создаётся input,
          для длинных описаний и списков — textarea.
        */
        const control =
          field.type === "textarea"
            ? document.createElement("textarea")
            : document.createElement("input");

        control.id = fieldIdFromKey(field.key);

        if (field.type !== "textarea") {
          control.type = "text";
        }

        if (field.placeholder) {
          control.placeholder = field.placeholder;
        }

        wrapper.appendChild(label);
        wrapper.appendChild(control);

        if (field.help) {
          const help = document.createElement("small");
          help.textContent = field.help;
          wrapper.appendChild(help);
        }

        fieldsNode.appendChild(wrapper);
      });

      sectionNode.appendChild(headNode);
      sectionNode.appendChild(fieldsNode);
      adminGrid.appendChild(sectionNode);
    });
  }

  /* Заполняет форму тем, что уже сохранено в config на этой странице */
  function fillAdminForm() {
    const currentConfig = runtime.getConfig();
    ADMIN_FIELDS.forEach((key) => {
      const field = document.getElementById(fieldIdFromKey(key));
      if (field) field.value = currentConfig[key] || "";
    });
  }

  /* Считывает все поля обратно и собирает обновлённый объект config */
  function readAdminForm() {
    const nextConfig = { ...runtime.getConfig() };

    ADMIN_FIELDS.forEach((key) => {
      const field = document.getElementById(fieldIdFromKey(key));
      if (field) nextConfig[key] = field.value.trim();
    });

    return nextConfig;
  }

  /* Открывает панель редактирования поверх сайта */
  function openAdmin() {
    if (!adminGrid.children.length) {
      renderAdminForm();
    }
    fillAdminForm();
    adminPanel.classList.add("is-open");
  }

  /* Закрывает панель редактирования */
  function closeAdmin() {
    adminPanel.classList.remove("is-open");
  }

  /* Наружу отдаётся только минимум: открыть и закрыть панель */
  window.__glaireAdminApi = {
    openAdmin,
    closeAdmin,
  };

  /* Кнопка входа в админку показывается только владельцу сайта */
  openAdminBtn.hidden = false;

  /* Форму можно собрать в фоне, чтобы открытие админки было быстрее */
  runtime.runWhenIdle(renderAdminForm);

  /* Открытие админки из шапки */
  openAdminBtn.addEventListener("click", () => {
    openAdmin();
    runtime.closeMobileMenu?.();
  });

  /* Закрытие по кнопке */
  closeAdminBtn.addEventListener("click", closeAdmin);

  /* Клик по затемнённому фону вокруг панели тоже закрывает окно */
  adminPanel.addEventListener("click", (event) => {
    if (event.target === adminPanel) closeAdmin();
  });

  /* Сохраняет новую версию config, обновляет сайт и прячет панель */
  saveAdminBtn.addEventListener("click", () => {
    const nextConfig = readAdminForm();
    runtime.setConfig(nextConfig);
    localStorage.setItem(runtime.STORAGE_KEY, JSON.stringify(nextConfig));
    runtime.applyConfig();
    closeAdmin();
  });

  /* Сбрасывает локальные правки и возвращает все значения к дефолтным */
  resetAdminBtn.addEventListener("click", () => {
    localStorage.removeItem(runtime.STORAGE_KEY);
    runtime.setConfig({ ...runtime.CONFIG_DEFAULT });
    runtime.applyConfig();
    fillAdminForm();
  });
})();
