const DEFAULT_LABELS = {
  back: "Back",
  home: "Home",
  price: "Price",
  purchase: "Purchase",
  history_next: "Next",
  history_prev: "Prev",
  history_row: 200,
  history_next_order: 20,
  history_prev_order: 10,
  back_order: 10000,
  home_order: 10001,
  back_row: null,
  home_row: null,
  back_style: "",
  home_style: "",
  history_prev_style: "",
  history_next_style: "",
  back_color: "",
  home_color: "",
  history_prev_color: "",
  history_next_color: "",
  back_icon_custom_emoji_id: "",
  home_icon_custom_emoji_id: "",
  history_prev_icon_custom_emoji_id: "",
  history_next_icon_custom_emoji_id: "",
  back_icon_custom_emoji_position: "",
  home_icon_custom_emoji_position: "",
  history_prev_icon_custom_emoji_position: "",
  history_next_icon_custom_emoji_position: "",
};

const DEFAULT_CONTENT = {
  menu_title: "Menu",
  labels: { ...DEFAULT_LABELS },
  sections: [],
};

const BUTTON_STYLE_OPTIONS = [
  { value: "", label: "По умолчанию" },
  { value: "primary", label: "Primary (синий)" },
  { value: "success", label: "Success (зелёный)" },
  { value: "danger", label: "Danger (красный)" },
];

const EMOJI_POSITION_OPTIONS = [
  { value: "", label: "По умолчанию (слева)" },
  { value: "left", label: "Слева" },
  { value: "right", label: "Справа" },
];

const stateStore = {
  content: null,
  inventory: null,
  selected: { type: "menu" },
  activeTab: "interface",
  dirty: false,
  inventoryDirty: false,
  lastSavedAt: null,
};

const treeEl = document.getElementById("tree");
const editorEl = document.getElementById("editor");
const editorSubtitleEl = document.getElementById("editor-subtitle");
const editorActionsEl = document.getElementById("editor-actions");
const previewEl = document.getElementById("preview");
const jsonViewEl = document.getElementById("json-view");
const warningsEl = document.getElementById("warnings");
const statusEl = document.getElementById("status");
const inventoryBodyEl = document.getElementById("inventory-body");
const interfaceViewEl = document.getElementById("interface-view");
const inventoryViewEl = document.getElementById("inventory-view");
const tabInterfaceBtn = document.getElementById("tab-interface");
const tabInventoryBtn = document.getElementById("tab-inventory");

const saveBtn = document.getElementById("save-btn");
const reloadBtn = document.getElementById("reload-btn");
const addSectionBtn = document.getElementById("add-section");

function normalizeContent(raw) {
  const content = typeof raw === "object" && raw ? raw : {};
  content.menu_title = content.menu_title ?? DEFAULT_CONTENT.menu_title;
  if (!content.labels || typeof content.labels !== "object") {
    content.labels = { ...DEFAULT_LABELS };
  } else {
    content.labels = { ...DEFAULT_LABELS, ...content.labels };
  }
  content.sections = Array.isArray(content.sections) ? content.sections : [];
  content.sections.forEach((section) => normalizeSection(section));
  return content;
}

function normalizeInventory(raw) {
  const inventory = typeof raw === "object" && raw ? raw : {};
  if (!inventory.items || typeof inventory.items !== "object") {
    inventory.items = {};
  }
  return inventory;
}

function normalizeSection(section) {
  section.groups = Array.isArray(section.groups) ? section.groups : [];
  section.buttons = Array.isArray(section.buttons) ? section.buttons : [];
  section.sections = Array.isArray(section.sections) ? section.sections : [];
  section.groups.forEach((group) => normalizeGroup(group));
  section.sections.forEach((subsection) => normalizeSection(subsection));
  if (section.id === "about" && !section.style) {
    section.style = "primary";
  }
  if (section.id === "about" && !section.color) {
    section.color = "#3b82f6";
  }
}

function normalizeGroup(group) {
  group.items = Array.isArray(group.items) ? group.items : [];
  group.groups = Array.isArray(group.groups) ? group.groups : [];
  group.groups.forEach((child) => normalizeGroup(child));
}

function setDirty(flag, scope = "content") {
  if (scope === "inventory") {
    stateStore.inventoryDirty = flag;
  } else {
    stateStore.dirty = flag;
  }
  updateStatus();
}

function updateStatus(message) {
  if (message) {
    statusEl.textContent = message;
    statusEl.title = message;
    if (message.toLowerCase().includes("ошибка")) {
      statusEl.style.color = "var(--danger)";
      statusEl.style.background = "rgba(182, 66, 53, 0.12)";
    } else {
      statusEl.style.color = "var(--accent)";
      statusEl.style.background = "rgba(27, 109, 114, 0.12)";
    }
    return;
  }
  if (stateStore.dirty || stateStore.inventoryDirty) {
    statusEl.textContent = "Есть несохраненные изменения";
    statusEl.title = statusEl.textContent;
    statusEl.style.color = "var(--danger)";
    statusEl.style.background = "rgba(182, 66, 53, 0.12)";
    return;
  }
  statusEl.style.color = "var(--accent)";
  statusEl.style.background = "rgba(27, 109, 114, 0.12)";
  if (stateStore.lastSavedAt) {
    statusEl.textContent = `Сохранено: ${stateStore.lastSavedAt}`;
  } else {
    statusEl.textContent = "Готово";
  }
  statusEl.title = statusEl.textContent;
}

function setActiveTab(tab) {
  if (tab !== "inventory" && tab !== "interface") return;
  stateStore.activeTab = tab;
  if (tabInterfaceBtn) {
    tabInterfaceBtn.classList.toggle("active", tab === "interface");
    tabInterfaceBtn.setAttribute("aria-selected", tab === "interface" ? "true" : "false");
  }
  if (tabInventoryBtn) {
    tabInventoryBtn.classList.toggle("active", tab === "inventory");
    tabInventoryBtn.setAttribute("aria-selected", tab === "inventory" ? "true" : "false");
  }
  if (interfaceViewEl) {
    interfaceViewEl.classList.toggle("hidden", tab !== "interface");
  }
  if (inventoryViewEl) {
    inventoryViewEl.classList.toggle("hidden", tab !== "inventory");
  }
}

function selectNode(selection) {
  stateStore.selected = selection;
  renderAll();
}

function getSectionList(sectionPath) {
  let list = stateStore.content.sections;
  if (!Array.isArray(sectionPath) || sectionPath.length === 0) {
    return { list, index: null };
  }
  for (let i = 0; i < sectionPath.length - 1; i += 1) {
    const section = list?.[sectionPath[i]];
    if (!section) return { list: null, index: null };
    list = Array.isArray(section.sections) ? section.sections : [];
  }
  return { list, index: sectionPath[sectionPath.length - 1] };
}

function getSection(sectionPath) {
  const { list, index } = getSectionList(sectionPath);
  if (!list || index === null || index === undefined) return null;
  return list[index];
}

function getGroup(sectionPath, groupPath) {
  const section = getSection(sectionPath);
  if (!section || !Array.isArray(groupPath) || groupPath.length === 0) return null;
  let groups = section.groups || [];
  let current = null;
  for (let i = 0; i < groupPath.length; i += 1) {
    current = groups?.[groupPath[i]];
    if (!current) return null;
    groups = current.groups || [];
  }
  return current;
}

function getGroupList(sectionPath, groupPath) {
  if (!Array.isArray(groupPath) || groupPath.length === 0) {
    return { list: null, index: null };
  }
  if (groupPath.length === 1) {
    const section = getSection(sectionPath);
    return { list: section?.groups || null, index: groupPath[0] };
  }
  const parent = getGroup(sectionPath, groupPath.slice(0, -1));
  return { list: parent?.groups || null, index: groupPath[groupPath.length - 1] };
}

function getItem(sectionPath, groupPath, itemIndex) {
  const group = getGroup(sectionPath, groupPath);
  return group?.items?.[itemIndex];
}

function getButton(sectionPath, buttonIndex) {
  const section = getSection(sectionPath);
  return section?.buttons?.[buttonIndex];
}

function isSamePath(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

function getSectionTitlePath(sectionPath) {
  if (!Array.isArray(sectionPath) || sectionPath.length === 0) return "";
  const titles = [];
  let list = stateStore.content?.sections || [];
  for (let i = 0; i < sectionPath.length; i += 1) {
    const section = list?.[sectionPath[i]];
    if (!section) break;
    titles.push(section.title || section.id || `Раздел ${i + 1}`);
    list = section.sections || [];
  }
  return titles.join(" / ");
}

function getGroupTitlePath(sectionPath, groupPath) {
  const section = getSection(sectionPath);
  if (!section || !Array.isArray(groupPath)) return "";
  const titles = [];
  let groups = section.groups || [];
  for (let i = 0; i < groupPath.length; i += 1) {
    const group = groups?.[groupPath[i]];
    if (!group) break;
    titles.push(group.title || group.id || `Группа ${i + 1}`);
    groups = group.groups || [];
  }
  return titles.join(" / ");
}

function addSection() {
  if (!stateStore.content) return;
  const id = generateId("section", collectIds("section"));
  stateStore.content.sections.push({
    id,
    title: "Новый раздел",
    order: 10,
    sections: [],
    groups: [],
    buttons: [],
  });
  setDirty(true);
  selectNode({ type: "section", sectionPath: [stateStore.content.sections.length - 1] });
}

function addSubsection(sectionPath) {
  const section = getSection(sectionPath);
  if (!section) return;
  section.sections = Array.isArray(section.sections) ? section.sections : [];
  const id = generateId("section", collectIds("section"));
  section.sections.push({
    id,
    title: "Новый раздел",
    order: 10,
    sections: [],
    groups: [],
    buttons: [],
  });
  setDirty(true);
  selectNode({
    type: "section",
    sectionPath: [...sectionPath, section.sections.length - 1],
  });
}

function addGroup(sectionPath, parentGroupPath = null) {
  if (parentGroupPath && parentGroupPath.length > 0) {
    const parent = getGroup(sectionPath, parentGroupPath);
    if (!parent) return;
    parent.groups = Array.isArray(parent.groups) ? parent.groups : [];
    const id = generateId("group", collectIds("group", parent));
    parent.groups.push({
      id,
      title: "Новая группа",
      order: 10,
      description: "",
      groups: [],
      items: [],
    });
    setDirty(true);
    selectNode({
      type: "group",
      sectionPath,
      groupPath: [...parentGroupPath, parent.groups.length - 1],
    });
    return;
  }

  const section = getSection(sectionPath);
  if (!section) return;
  const id = generateId("group", collectIds("group", section));
  section.groups.push({
    id,
    title: "Новая группа",
    order: 10,
    description: "",
    groups: [],
    items: [],
  });
  setDirty(true);
  selectNode({
    type: "group",
    sectionPath,
    groupPath: [section.groups.length - 1],
  });
}

function addItem(sectionPath, groupPath) {
  const group = getGroup(sectionPath, groupPath);
  if (!group) return;
  const id = generateId("item", collectIds("item", group));
  group.items.push({
    id,
    title: "Новая карточка",
    order: 10,
    description: "",
  });
  setDirty(true);
  selectNode({
    type: "item",
    sectionPath,
    groupPath,
    itemIndex: group.items.length - 1,
  });
}

function addButton(sectionPath) {
  const section = getSection(sectionPath);
  if (!section) return;
  const id = generateId("action", collectIds("button", section));
  section.buttons.push({
    id,
    title: "Новое действие",
    action: "save_user",
    order: 10,
  });
  setDirty(true);
  selectNode({
    type: "button",
    sectionPath,
    buttonIndex: section.buttons.length - 1,
  });
}

function deleteNode() {
  const sel = stateStore.selected;
  if (!sel) return;
  if (sel.type === "section") {
    const { list, index } = getSectionList(sel.sectionPath);
    if (!list || index === null || index === undefined) return;
    list.splice(index, 1);
    setDirty(true);
    if (sel.sectionPath.length > 1) {
      selectNode({ type: "section", sectionPath: sel.sectionPath.slice(0, -1) });
    } else {
      selectNode({ type: "menu" });
    }
    return;
  }
  if (sel.type === "group") {
    const { list, index } = getGroupList(sel.sectionPath, sel.groupPath);
    if (!list || index === null || index === undefined) return;
    list.splice(index, 1);
    setDirty(true);
    if (sel.groupPath.length > 1) {
      selectNode({
        type: "group",
        sectionPath: sel.sectionPath,
        groupPath: sel.groupPath.slice(0, -1),
      });
    } else {
      selectNode({ type: "section", sectionPath: sel.sectionPath });
    }
    return;
  }
  if (sel.type === "item") {
    const group = getGroup(sel.sectionPath, sel.groupPath);
    group?.items?.splice(sel.itemIndex, 1);
    setDirty(true);
    selectNode({
      type: "group",
      sectionPath: sel.sectionPath,
      groupPath: sel.groupPath,
    });
    return;
  }
  if (sel.type === "button") {
    const section = getSection(sel.sectionPath);
    section?.buttons?.splice(sel.buttonIndex, 1);
    setDirty(true);
    selectNode({ type: "section", sectionPath: sel.sectionPath });
  }
}

function collectIds(kind, parent) {
  if (kind === "section") {
    const ids = new Set();
    const walk = (sections) => {
      (sections || []).forEach((section) => {
        if (section.id) ids.add(section.id);
        if (Array.isArray(section.sections)) walk(section.sections);
      });
    };
    walk(stateStore.content.sections);
    return ids;
  }
  if (kind === "group") {
    return new Set((parent?.groups || []).map((g) => g.id).filter(Boolean));
  }
  if (kind === "item") {
    return new Set((parent?.items || []).map((i) => i.id).filter(Boolean));
  }
  if (kind === "button") {
    return new Set((parent?.buttons || []).map((b) => b.id).filter(Boolean));
  }
  return new Set();
}

function generateId(prefix, existing) {
  let idx = 1;
  let next = `${prefix}_${idx}`;
  while (existing.has(next)) {
    idx += 1;
    next = `${prefix}_${idx}`;
  }
  return next;
}

function renderAll() {
  renderTree();
  renderEditor();
  renderPreview();
  renderInventory();
  renderJson();
  renderWarnings();
}

function renderTree() {
  treeEl.innerHTML = "";

  treeEl.appendChild(buildTreeItem({
    label: "Настройки меню",
    meta: "menu_title / menu_image",
    active: stateStore.selected.type === "menu",
    onClick: () => selectNode({ type: "menu" }),
  }));

  treeEl.appendChild(buildTreeItem({
    label: "Навигационные подписи",
    meta: "labels.*",
    active: stateStore.selected.type === "labels",
    onClick: () => selectNode({ type: "labels" }),
  }));

  stateStore.content.sections.forEach((section, sectionIndex) => {
    treeEl.appendChild(buildSectionTree(section, [sectionIndex]));
  });
}

function buildSectionTree(section, sectionPath) {
  const sectionEl = buildTreeItem({
    label: section.title || "(Без названия)",
    meta: `Раздел · id: ${section.id || "—"}`,
    active:
      stateStore.selected.type === "section" &&
      isSamePath(stateStore.selected.sectionPath, sectionPath),
    onClick: () => selectNode({ type: "section", sectionPath }),
  });

  const children = document.createElement("div");
  children.className = "tree-children";

  if (Array.isArray(section.sections) && section.sections.length > 0) {
    const subLabel = document.createElement("div");
    subLabel.className = "tree-meta";
    subLabel.textContent = "Подразделы";
    children.appendChild(subLabel);

    section.sections.forEach((subsection, subIndex) => {
      children.appendChild(buildSectionTree(subsection, [...sectionPath, subIndex]));
    });
  }

  section.groups.forEach((group, groupIndex) => {
    children.appendChild(buildGroupTree(group, sectionPath, [groupIndex]));
  });

  if (section.buttons.length > 0) {
    const actionLabel = document.createElement("div");
    actionLabel.className = "tree-meta";
    actionLabel.textContent = "Действия";
    children.appendChild(actionLabel);

    section.buttons.forEach((button, buttonIndex) => {
      children.appendChild(
        buildTreeItem({
          label: button.title || "(Кнопка)",
          meta: `Action: ${button.action || "—"}`,
          active:
            stateStore.selected.type === "button" &&
            isSamePath(stateStore.selected.sectionPath, sectionPath) &&
            stateStore.selected.buttonIndex === buttonIndex,
          onClick: () =>
            selectNode({ type: "button", sectionPath, buttonIndex }),
        })
      );
    });
  }

  if (children.children.length > 0) {
    sectionEl.appendChild(children);
  }

  return sectionEl;
}

function buildGroupTree(group, sectionPath, groupPath) {
  const groupEl = buildTreeItem({
    label: group.title || "(Группа без названия)",
    meta: `Группа · id: ${group.id || "—"}`,
    active:
      stateStore.selected.type === "group" &&
      isSamePath(stateStore.selected.sectionPath, sectionPath) &&
      isSamePath(stateStore.selected.groupPath, groupPath),
    onClick: () =>
      selectNode({ type: "group", sectionPath, groupPath }),
  });

  const children = document.createElement("div");
  children.className = "tree-children";

  if (Array.isArray(group.groups) && group.groups.length > 0) {
    const subLabel = document.createElement("div");
    subLabel.className = "tree-meta";
    subLabel.textContent = "Подгруппы";
    children.appendChild(subLabel);

    group.groups.forEach((subgroup, subIndex) => {
      children.appendChild(buildGroupTree(subgroup, sectionPath, [...groupPath, subIndex]));
    });
  }

  if (Array.isArray(group.items) && group.items.length > 0) {
    if (Array.isArray(group.groups) && group.groups.length > 0) {
      const itemLabel = document.createElement("div");
      itemLabel.className = "tree-meta";
      itemLabel.textContent = "Карточки";
      children.appendChild(itemLabel);
    }

    group.items.forEach((item, itemIndex) => {
      children.appendChild(
        buildTreeItem({
          label: item.title || "(Карточка без названия)",
          meta: `Карточка · id: ${item.id || "—"}`,
          active:
            stateStore.selected.type === "item" &&
            isSamePath(stateStore.selected.sectionPath, sectionPath) &&
            isSamePath(stateStore.selected.groupPath, groupPath) &&
            stateStore.selected.itemIndex === itemIndex,
          onClick: () =>
            selectNode({
              type: "item",
              sectionPath,
              groupPath,
              itemIndex,
            }),
        })
      );
    });
  }

  if (children.children.length > 0) {
    groupEl.appendChild(children);
  }

  return groupEl;
}

function buildTreeItem({ label, meta, active, onClick }) {
  const wrapper = document.createElement("div");
  wrapper.className = "tree-item" + (active ? " active" : "");
  const labelEl = document.createElement("div");
  labelEl.className = "tree-label";
  labelEl.textContent = label;
  wrapper.appendChild(labelEl);
  if (meta) {
    const metaEl = document.createElement("div");
    metaEl.className = "tree-meta";
    metaEl.textContent = meta;
    wrapper.appendChild(metaEl);
  }
  wrapper.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick();
  });
  return wrapper;
}

function renderEditor() {
  editorEl.innerHTML = "";
  editorActionsEl.innerHTML = "";

  const sel = stateStore.selected;
  if (sel.type === "menu") {
    editorSubtitleEl.textContent = "Главный экран";
    editorEl.appendChild(
      buildField("menu_title", "Заголовок меню", stateStore.content.menu_title)
    );
    editorEl.appendChild(
      buildField("menu_image", "Картинка (путь)", stateStore.content.menu_image, {
        optional: true,
      })
    );
    editorEl.appendChild(
      buildField("menu_caption", "Подпись к картинке", stateStore.content.menu_caption, {
        optional: true,
        multiline: true,
      })
    );
    editorEl.appendChild(
      buildField("history_template", "Шаблон истории", stateStore.content.history_template, {
        optional: true,
        multiline: true,
      })
    );
    editorEl.appendChild(
      buildField("purchase_template", "Шаблон покупки", stateStore.content.purchase_template, {
        optional: true,
        multiline: true,
      })
    );
    editorEl.appendChild(
      buildField("purchase_image", "Картинка после покупки (путь)", stateStore.content.purchase_image, {
        optional: true,
        help: "Путь от корня проекта. Пример: shitystuff/blank5_2.png",
      })
    );
    editorEl.appendChild(
      buildField("out_of_stock_text", "Текст нет в наличии", stateStore.content.out_of_stock_text, {
        optional: true,
        multiline: true,
      })
    );
    editorEl.appendChild(
      buildField(
        "admin_history_template",
        "Шаблон истории админов",
        stateStore.content.admin_history_template,
        {
          optional: true,
          multiline: true,
        }
      )
    );
    editorEl.appendChild(
      buildHelper(
        "Пути указывай от корня проекта. Пример: shitystuff/main_menu.jpg"
      )
    );

    editorEl.appendChild(
      buildImagePreview(stateStore.content.menu_image, "menu-image-preview")
    );
    return;
  }

  if (sel.type === "labels") {
    editorSubtitleEl.textContent = "Навигация: labels.*";
    editorEl.appendChild(
      buildField("back", "Кнопка Назад", stateStore.content.labels.back)
    );
    editorEl.appendChild(
      buildField("home", "Кнопка В меню", stateStore.content.labels.home)
    );
    editorEl.appendChild(
      buildSelectField("back_style", "Стиль Назад", stateStore.content.labels.back_style, {
        optional: true,
        choices: BUTTON_STYLE_OPTIONS,
      })
    );
    editorEl.appendChild(
      buildSelectField("home_style", "Стиль В меню", stateStore.content.labels.home_style, {
        optional: true,
        choices: BUTTON_STYLE_OPTIONS,
      })
    );
    editorEl.appendChild(
      buildField("back_color", "Цвет Назад (preview)", stateStore.content.labels.back_color, {
        optional: true,
        help: "HEX цвет. Реальный бот использует только style.",
      })
    );
    editorEl.appendChild(
      buildField("home_color", "Цвет В меню (preview)", stateStore.content.labels.home_color, {
        optional: true,
        help: "HEX цвет. Реальный бот использует только style.",
      })
    );
    editorEl.appendChild(
      buildFieldRow([
        buildField(
          "back_icon_custom_emoji_id",
          "Premium emoji Назад (id)",
          stateStore.content.labels.back_icon_custom_emoji_id,
          {
            optional: true,
            help: "Нужен Telegram Premium у владельца бота.",
          }
        ),
        buildSelectField(
          "back_icon_custom_emoji_position",
          "Позиция",
          stateStore.content.labels.back_icon_custom_emoji_position,
          {
            optional: true,
            choices: EMOJI_POSITION_OPTIONS,
            help: "Позиция премиум-иконки в превью.",
          }
        ),
      ])
    );
    editorEl.appendChild(
      buildFieldRow([
        buildField(
          "home_icon_custom_emoji_id",
          "Premium emoji В меню (id)",
          stateStore.content.labels.home_icon_custom_emoji_id,
          {
            optional: true,
            help: "Нужен Telegram Premium у владельца бота.",
          }
        ),
        buildSelectField(
          "home_icon_custom_emoji_position",
          "Позиция",
          stateStore.content.labels.home_icon_custom_emoji_position,
          {
            optional: true,
            choices: EMOJI_POSITION_OPTIONS,
            help: "Позиция премиум-иконки в превью.",
          }
        ),
      ])
    );
    editorEl.appendChild(
      buildField("price", "Подпись цены", stateStore.content.labels.price)
    );
    editorEl.appendChild(
      buildField("purchase", "Кнопка Приобрести", stateStore.content.labels.purchase, {
        optional: true,
      })
    );
    editorEl.appendChild(
      buildField("history_prev", "История: Пред. заказ", stateStore.content.labels.history_prev, {
        optional: true,
      })
    );
    editorEl.appendChild(
      buildField("history_next", "История: След. заказ", stateStore.content.labels.history_next, {
        optional: true,
      })
    );
    editorEl.appendChild(
      buildSelectField(
        "history_prev_style",
        "История: стиль Пред. заказа",
        stateStore.content.labels.history_prev_style,
        {
          optional: true,
          choices: BUTTON_STYLE_OPTIONS,
        }
      )
    );
    editorEl.appendChild(
      buildSelectField(
        "history_next_style",
        "История: стиль След. заказа",
        stateStore.content.labels.history_next_style,
        {
          optional: true,
          choices: BUTTON_STYLE_OPTIONS,
        }
      )
    );
    editorEl.appendChild(
      buildField(
        "history_prev_color",
        "История: цвет Пред. заказа (preview)",
        stateStore.content.labels.history_prev_color,
        {
          optional: true,
          help: "HEX цвет. Реальный бот использует только style.",
        }
      )
    );
    editorEl.appendChild(
      buildField(
        "history_next_color",
        "История: цвет След. заказа (preview)",
        stateStore.content.labels.history_next_color,
        {
          optional: true,
          help: "HEX цвет. Реальный бот использует только style.",
        }
      )
    );
    editorEl.appendChild(
      buildFieldRow([
        buildField(
          "history_prev_icon_custom_emoji_id",
          "История: emoji Пред. заказа (id)",
          stateStore.content.labels.history_prev_icon_custom_emoji_id,
          {
            optional: true,
            help: "Нужен Telegram Premium у владельца бота.",
          }
        ),
        buildSelectField(
          "history_prev_icon_custom_emoji_position",
          "Позиция",
          stateStore.content.labels.history_prev_icon_custom_emoji_position,
          {
            optional: true,
            choices: EMOJI_POSITION_OPTIONS,
            help: "Позиция премиум-иконки в превью.",
          }
        ),
      ])
    );
    editorEl.appendChild(
      buildFieldRow([
        buildField(
          "history_next_icon_custom_emoji_id",
          "История: emoji След. заказа (id)",
          stateStore.content.labels.history_next_icon_custom_emoji_id,
          {
            optional: true,
            help: "Нужен Telegram Premium у владельца бота.",
          }
        ),
        buildSelectField(
          "history_next_icon_custom_emoji_position",
          "Позиция",
          stateStore.content.labels.history_next_icon_custom_emoji_position,
          {
            optional: true,
            choices: EMOJI_POSITION_OPTIONS,
            help: "Позиция премиум-иконки в превью.",
          }
        ),
      ])
    );
    editorEl.appendChild(
      buildField(
        "history_prev_order",
        "История: порядок Пред. заказа",
        stateStore.content.labels.history_prev_order,
        {
          number: true,
          optional: true,
          help: "Меньше число — выше кнопка. Пример: 10 будет выше 20.",
        }
      )
    );
    editorEl.appendChild(
      buildField(
        "history_next_order",
        "История: порядок След. заказа",
        stateStore.content.labels.history_next_order,
        {
          number: true,
          optional: true,
          help: "Меньше число — выше кнопка. Пример: 10 будет выше 20.",
        }
      )
    );
    editorEl.appendChild(
      buildField("history_row", "История: ряд кнопок", stateStore.content.labels.history_row, {
        number: true,
        optional: true,
        help: "Одинаковый row — кнопки истории будут в одной строке.",
      })
    );
    editorEl.appendChild(
      buildField("back_order", "Порядок Назад", stateStore.content.labels.back_order, {
        number: true,
        optional: true,
        help: "Меньше число — выше кнопка. Пример: 10 будет выше 20.",
      })
    );
    editorEl.appendChild(
      buildField("home_order", "Порядок В меню", stateStore.content.labels.home_order, {
        number: true,
        optional: true,
        help: "Меньше число — выше кнопка. Пример: 10 будет выше 20.",
      })
    );
    editorEl.appendChild(
      buildField("back_row", "Ряд Назад", stateStore.content.labels.back_row, {
        number: true,
        optional: true,
        help: "Одинаковый row — в одной строке. Пример: две кнопки с row=1 рядом.",
      })
    );
    editorEl.appendChild(
      buildField("home_row", "Ряд В меню", stateStore.content.labels.home_row, {
        number: true,
        optional: true,
        help: "Одинаковый row — в одной строке. Пример: две кнопки с row=1 рядом.",
      })
    );
    return;
  }

  if (sel.type === "section") {
    const section = getSection(sel.sectionPath);
    if (!section) return;
    const sectionPathLabel = getSectionTitlePath(sel.sectionPath);
    const sectionId = section.id || "—";
    editorSubtitleEl.textContent = sectionPathLabel
      ? `Раздел: ${sectionPathLabel} (id: ${sectionId})`
      : `Раздел (id: ${sectionId})`;

    editorEl.appendChild(buildField("id", "ID", section.id));
    editorEl.appendChild(buildField("title", "Название", section.title));
    editorEl.appendChild(
      buildField("order", "Порядок", section.order, {
        number: true,
        optional: true,
        help: "Меньше число — выше в списке разделов.",
      })
    );
    editorEl.appendChild(
      buildField("row", "Ряд", section.row, {
        number: true,
        optional: true,
        help: "Одинаковый row объединяет кнопки в одну строку.",
      })
    );
    editorEl.appendChild(
      buildSelectField("style", "Стиль кнопки", section.style, {
        optional: true,
        choices: BUTTON_STYLE_OPTIONS,
        help: "Цвет кнопки по Telegram Bot API 9.4.",
      })
    );
    editorEl.appendChild(
      buildField("color", "Цвет кнопки (preview)", section.color, {
        optional: true,
        help: "HEX цвет. Реальный бот использует только style.",
      })
    );
    editorEl.appendChild(
      buildFieldRow([
        buildField("icon_custom_emoji_id", "Premium emoji (id)", section.icon_custom_emoji_id, {
          optional: true,
          help: "Нужен Telegram Premium у владельца бота.",
        }),
        buildSelectField("icon_custom_emoji_position", "Позиция", section.icon_custom_emoji_position, {
          optional: true,
          choices: EMOJI_POSITION_OPTIONS,
          help: "Позиция премиум-иконки в превью.",
        }),
      ])
    );
    editorEl.appendChild(
      buildField("text", "Текст раздела", section.text, {
        multiline: true,
        optional: true,
      })
    );
    editorEl.appendChild(
      buildField("description", "Описание (если нет text)", section.description, {
        multiline: true,
        optional: true,
      })
    );
    editorEl.appendChild(
      buildField("file", "Файл с текстом", section.file, { optional: true })
    );
    editorEl.appendChild(
      buildField("template", "Шаблон (template)", section.template, {
        multiline: true,
        optional: true,
      })
    );
    editorEl.appendChild(
      buildField("image", "Картинка (путь)", section.image, {
        optional: true,
        help: "Путь от корня проекта. Пример: shitystuff/mango.png",
      })
    );
    editorEl.appendChild(
      buildField("image_caption", "Подпись к картинке", section.image_caption, {
        optional: true,
        multiline: true,
      })
    );
    editorEl.appendChild(
      buildImagePreview(section.image, "section-image-preview")
    );
    editorEl.appendChild(
      buildToggleField("Раздел истории", section.history, (value) => {
        section.history = value;
        setDirty(true);
        renderAll();
      })
    );
    editorEl.appendChild(
      buildToggleField("История админов", section.admin_history, (value) => {
        section.admin_history = value;
        setDirty(true);
        renderAll();
      })
    );
    editorEl.appendChild(
      buildToggleField("Только для админов", section.admin_only, (value) => {
        section.admin_only = value;
        setDirty(true);
        renderAll();
      })
    );
    if (section.history || section.admin_history) {
      editorEl.appendChild(
        buildField("empty_text", "Текст, когда история пуста", section.empty_text, {
          optional: true,
          multiline: true,
        })
      );
    }

    editorActionsEl.appendChild(
      buildActionButton("+ Подраздел", () => addSubsection(sel.sectionPath))
    );
    editorActionsEl.appendChild(
      buildActionButton("+ Группа", () => addGroup(sel.sectionPath))
    );
    editorActionsEl.appendChild(
      buildActionButton("+ Действие", () => addButton(sel.sectionPath))
    );
    editorActionsEl.appendChild(
      buildActionButton("Удалить", () => confirmDelete("раздел"), "danger")
    );
    return;
  }

  if (sel.type === "group") {
    const group = getGroup(sel.sectionPath, sel.groupPath);
    if (!group) return;
    const sectionPathLabel = getSectionTitlePath(sel.sectionPath);
    const groupPathLabel = getGroupTitlePath(sel.sectionPath, sel.groupPath);
    const groupId = group.id || "—";
    editorSubtitleEl.textContent = sectionPathLabel
      ? `Раздел: ${sectionPathLabel} · Группа: ${groupPathLabel || "—"} (id: ${groupId})`
      : `Группа: ${groupPathLabel || "—"} (id: ${groupId})`;
    editorEl.appendChild(buildField("id", "ID", group.id));
    editorEl.appendChild(buildField("title", "Название", group.title));
    editorEl.appendChild(
      buildField("order", "Порядок", group.order, {
        number: true,
        optional: true,
        help: "Меньше число — выше в списке групп.",
      })
    );
    editorEl.appendChild(
      buildField("row", "Ряд", group.row, {
        number: true,
        optional: true,
        help: "Одинаковый row объединяет кнопки в одну строку.",
      })
    );
    editorEl.appendChild(
      buildSelectField("style", "Стиль кнопки", group.style, {
        optional: true,
        choices: BUTTON_STYLE_OPTIONS,
        help: "Цвет кнопки по Telegram Bot API 9.4.",
      })
    );
    editorEl.appendChild(
      buildField("color", "Цвет кнопки (preview)", group.color, {
        optional: true,
        help: "HEX цвет. Реальный бот использует только style.",
      })
    );
    editorEl.appendChild(
      buildFieldRow([
        buildField("icon_custom_emoji_id", "Premium emoji (id)", group.icon_custom_emoji_id, {
          optional: true,
          help: "Нужен Telegram Premium у владельца бота.",
        }),
        buildSelectField("icon_custom_emoji_position", "Позиция", group.icon_custom_emoji_position, {
          optional: true,
          choices: EMOJI_POSITION_OPTIONS,
          help: "Позиция премиум-иконки в превью.",
        }),
      ])
    );
    editorEl.appendChild(
      buildField("description", "Описание", group.description, {
        multiline: true,
        optional: true,
      })
    );
    editorEl.appendChild(
      buildField("image", "Картинка (путь)", group.image, {
        optional: true,
        help: "Путь от корня проекта. Пример: shitystuff/mango.png",
      })
    );
    editorEl.appendChild(
      buildField("image_caption", "Подпись к картинке", group.image_caption, {
        optional: true,
        multiline: true,
      })
    );
    editorEl.appendChild(
      buildImagePreview(group.image, "group-image-preview")
    );
    editorActionsEl.appendChild(
      buildActionButton("+ Карточка", () => addItem(sel.sectionPath, sel.groupPath))
    );
    editorActionsEl.appendChild(
      buildActionButton("+ Подгруппа", () => addGroup(sel.sectionPath, sel.groupPath))
    );
    editorActionsEl.appendChild(
      buildActionButton("Удалить", () => confirmDelete("группу"), "danger")
    );
    return;
  }

  if (sel.type === "item") {
    const item = getItem(sel.sectionPath, sel.groupPath, sel.itemIndex);
    if (!item) return;
    const sectionPathLabel = getSectionTitlePath(sel.sectionPath);
    const groupPathLabel = getGroupTitlePath(sel.sectionPath, sel.groupPath);
    const itemTitle = item.title || item.id || "—";
    const itemId = item.id || "—";
    const pathParts = [];
    if (sectionPathLabel) pathParts.push(`Раздел: ${sectionPathLabel}`);
    if (groupPathLabel) pathParts.push(`Группа: ${groupPathLabel}`);
    editorSubtitleEl.textContent = pathParts.length
      ? `Карточка: ${itemTitle} (id: ${itemId}) · ${pathParts.join(" · ")}`
      : `Карточка: ${itemTitle} (id: ${itemId})`;
    editorEl.appendChild(buildField("id", "ID", item.id));
    editorEl.appendChild(buildField("title", "Название", item.title));
    editorEl.appendChild(
      buildField("price", "Цена", item.price, { optional: true })
    );
    editorEl.appendChild(
      buildField("description", "Описание", item.description, {
        multiline: true,
        optional: true,
      })
    );
    editorEl.appendChild(
      buildField("out_of_stock_text", "Текст нет в наличии (для товара)", item.out_of_stock_text, {
        optional: true,
        multiline: true,
      })
    );
    editorEl.appendChild(
      buildField("image", "Картинка (путь)", item.image, {
        optional: true,
        help: "Путь от корня проекта. Пример: shitystuff/mango.png",
      })
    );
    editorEl.appendChild(
      buildField("order", "Порядок", item.order, {
        number: true,
        optional: true,
        help: "Меньше число — выше в списке карточек.",
      })
    );
    editorEl.appendChild(
      buildField("row", "Ряд", item.row, {
        number: true,
        optional: true,
        help: "Одинаковый row объединяет карточки в одну строку.",
      })
    );
    editorEl.appendChild(
      buildSelectField("style", "Стиль кнопки", item.style, {
        optional: true,
        choices: BUTTON_STYLE_OPTIONS,
        help: "Цвет кнопки по Telegram Bot API 9.4.",
      })
    );
    editorEl.appendChild(
      buildField("color", "Цвет кнопки (preview)", item.color, {
        optional: true,
        help: "HEX цвет. Реальный бот использует только style.",
      })
    );
    editorEl.appendChild(
      buildFieldRow([
        buildField("icon_custom_emoji_id", "Premium emoji (id)", item.icon_custom_emoji_id, {
          optional: true,
          help: "Нужен Telegram Premium у владельца бота.",
        }),
        buildSelectField("icon_custom_emoji_position", "Позиция", item.icon_custom_emoji_position, {
          optional: true,
          choices: EMOJI_POSITION_OPTIONS,
          help: "Позиция премиум-иконки в превью.",
        }),
      ])
    );
    const purchaseActions = buildInlineActions("Кнопка покупки");
    if (item.purchase) {
      purchaseActions.appendChild(
        buildActionButton("Удалить кнопку", () => {
          delete item.purchase;
          setDirty(true);
          renderAll();
        }, "danger")
      );
    } else {
      purchaseActions.appendChild(
        buildActionButton("Добавить кнопку", () => {
          item.purchase = {};
          setDirty(true);
          renderAll();
        })
      );
    }
    editorEl.appendChild(purchaseActions);

    if (item.purchase) {
      editorEl.appendChild(
        buildField("purchase_title", "Текст кнопки", item.purchase.title, {
          optional: true,
          onChange: (value) =>
            updatePurchaseField(item, "title", value, { optional: true }),
        })
      );
      editorEl.appendChild(
        buildField("purchase_order", "Порядок кнопки", item.purchase.order, {
          number: true,
          optional: true,
          help: "Меньше число — выше. Пример: 5 будет выше 20.",
          onChange: (value) =>
            updatePurchaseField(item, "order", value, {
              number: true,
              optional: true,
            }),
        })
      );
      editorEl.appendChild(
        buildField("purchase_row", "Ряд кнопки", item.purchase.row, {
          number: true,
          optional: true,
          help: "Одинаковый row объединяет кнопки в одну строку.",
          onChange: (value) =>
            updatePurchaseField(item, "row", value, {
              number: true,
              optional: true,
            }),
        })
      );
      editorEl.appendChild(
        buildSelectField("purchase_style", "Стиль кнопки", item.purchase.style, {
          optional: true,
          choices: BUTTON_STYLE_OPTIONS,
          help: "Цвет кнопки по Telegram Bot API 9.4.",
          onChange: (value) =>
            updatePurchaseField(item, "style", value, {
              optional: true,
            }),
        })
      );
      editorEl.appendChild(
        buildField("purchase_color", "Цвет кнопки (preview)", item.purchase.color, {
          optional: true,
          help: "HEX цвет. Реальный бот использует только style.",
          onChange: (value) =>
            updatePurchaseField(item, "color", value, {
              optional: true,
            }),
        })
      );
      editorEl.appendChild(
        buildFieldRow([
          buildField(
            "purchase_icon_custom_emoji_id",
            "Premium emoji (id)",
            item.purchase.icon_custom_emoji_id,
            {
              optional: true,
              help: "Нужен Telegram Premium у владельца бота.",
              onChange: (value) =>
                updatePurchaseField(item, "icon_custom_emoji_id", value, {
                  optional: true,
                }),
            }
          ),
          buildSelectField(
            "purchase_icon_custom_emoji_position",
            "Позиция",
            item.purchase.icon_custom_emoji_position,
            {
              optional: true,
              choices: EMOJI_POSITION_OPTIONS,
              help: "Позиция премиум-иконки в превью.",
              onChange: (value) =>
                updatePurchaseField(item, "icon_custom_emoji_position", value, {
                  optional: true,
                }),
            }
          ),
        ])
      );
      editorEl.appendChild(
        buildField("purchase_message", "Сообщение после покупки", item.purchase.message, {
          optional: true,
          multiline: true,
          onChange: (value) =>
            updatePurchaseField(item, "message", value, {
              optional: true,
            }),
        })
      );
      editorEl.appendChild(
        buildField("purchase_image", "Картинка после покупки (путь)", item.purchase.image, {
          optional: true,
          help: "Путь от корня проекта. Пример: shitystuff/blank5_2.png",
          onChange: (value) =>
            updatePurchaseField(item, "image", value, {
              optional: true,
            }),
        })
      );
    }
    editorActionsEl.appendChild(
      buildActionButton("Удалить", () => confirmDelete("карточку"), "danger")
    );
    editorEl.appendChild(
      buildImagePreview(item.image, "item-image-preview")
    );
    return;
  }

  if (sel.type === "button") {
    const button = getButton(sel.sectionPath, sel.buttonIndex);
    if (!button) return;
    const sectionPathLabel = getSectionTitlePath(sel.sectionPath);
    const buttonTitle = button.title || button.id || "—";
    const buttonId = button.id || "—";
    editorSubtitleEl.textContent = sectionPathLabel
      ? `Действие: ${buttonTitle} (id: ${buttonId}) · Раздел: ${sectionPathLabel}`
      : `Действие: ${buttonTitle} (id: ${buttonId})`;
    editorEl.appendChild(buildField("id", "ID", button.id));
    editorEl.appendChild(buildField("title", "Название", button.title));
    editorEl.appendChild(buildField("action", "Action", button.action));
    editorEl.appendChild(
      buildField("order", "Порядок", button.order, {
        number: true,
        optional: true,
        help: "Меньше число — выше в списке действий.",
      })
    );
    editorEl.appendChild(
      buildField("row", "Ряд", button.row, {
        number: true,
        optional: true,
        help: "Одинаковый row объединяет кнопки в одну строку.",
      })
    );
    editorEl.appendChild(
      buildSelectField("style", "Стиль кнопки", button.style, {
        optional: true,
        choices: BUTTON_STYLE_OPTIONS,
        help: "Цвет кнопки по Telegram Bot API 9.4.",
      })
    );
    editorEl.appendChild(
      buildField("color", "Цвет кнопки (preview)", button.color, {
        optional: true,
        help: "HEX цвет. Реальный бот использует только style.",
      })
    );
    editorEl.appendChild(
      buildFieldRow([
        buildField("icon_custom_emoji_id", "Premium emoji (id)", button.icon_custom_emoji_id, {
          optional: true,
          help: "Нужен Telegram Premium у владельца бота.",
        }),
        buildSelectField("icon_custom_emoji_position", "Позиция", button.icon_custom_emoji_position, {
          optional: true,
          choices: EMOJI_POSITION_OPTIONS,
          help: "Позиция премиум-иконки в превью.",
        }),
      ])
    );
    editorActionsEl.appendChild(
      buildActionButton("Удалить", () => confirmDelete("кнопку"), "danger")
    );
  }
}

function buildField(key, label, value, options = {}) {
  const wrapper = document.createElement("div");
  wrapper.className = "field";
  const labelEl = document.createElement("label");
  labelEl.textContent = label;
  wrapper.appendChild(labelEl);

  const input = options.multiline
    ? document.createElement("textarea")
    : document.createElement("input");

  if (!options.multiline) {
    input.type = options.number ? "number" : "text";
  }
  input.value = value ?? "";
  input.addEventListener("input", (event) => {
    if (options.onChange) {
      options.onChange(parseFieldValue(event.target.value, options));
    } else {
      handleFieldChange(key, event.target.value, options);
    }
  });
  wrapper.appendChild(input);
  if (options.help) {
    wrapper.appendChild(buildHelper(options.help));
  }
  return wrapper;
}

function buildSelectField(key, label, value, options = {}) {
  const wrapper = document.createElement("div");
  wrapper.className = "field";
  const labelEl = document.createElement("label");
  labelEl.textContent = label;
  wrapper.appendChild(labelEl);

  const select = document.createElement("select");
  (options.choices || []).forEach((choice) => {
    const opt = document.createElement("option");
    opt.value = choice.value ?? "";
    opt.textContent = choice.label ?? String(choice.value ?? "");
    select.appendChild(opt);
  });
  select.value = value ?? "";
  select.addEventListener("change", (event) => {
    handleFieldChange(key, event.target.value, options);
  });
  wrapper.appendChild(select);
  if (options.help) {
    wrapper.appendChild(buildHelper(options.help));
  }
  return wrapper;
}

function buildFieldRow(fields = []) {
  const row = document.createElement("div");
  row.className = "field-row";
  fields.forEach((field) => {
    if (field) row.appendChild(field);
  });
  return row;
}

function buildHelper(text) {
  const el = document.createElement("div");
  el.className = "helper";
  el.textContent = text;
  return el;
}

function buildInlineActions(title) {
  const wrapper = document.createElement("div");
  wrapper.className = "inline-actions";
  const label = document.createElement("div");
  label.className = "inline-title";
  label.textContent = title;
  wrapper.appendChild(label);
  return wrapper;
}

function buildToggleField(label, checked, onChange) {
  const wrapper = document.createElement("div");
  wrapper.className = "toggle-field";
  const labelEl = document.createElement("label");
  labelEl.textContent = label;
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = Boolean(checked);
  input.addEventListener("change", (event) => onChange(event.target.checked));
  wrapper.appendChild(labelEl);
  wrapper.appendChild(input);
  return wrapper;
}

function buildImagePreview(path, id) {
  const img = document.createElement("img");
  img.className = "preview-image";
  if (id) img.id = id;
  img.alt = "preview";
  if (path) {
    img.src = `/files/${encodeURI(path)}`;
    img.style.display = "block";
  } else {
    img.style.display = "none";
  }
  return img;
}

function updateImagePreview(id, path) {
  if (!id) return;
  const img = document.getElementById(id);
  if (!img) return;
  if (path) {
    img.src = `/files/${encodeURI(path)}`;
    img.style.display = "block";
  } else {
    img.removeAttribute("src");
    img.style.display = "none";
  }
}

function parseFieldValue(rawValue, options) {
  let value = rawValue;
  if (options.number) {
    if (rawValue === "") {
      value = null;
    } else {
      const parsed = Number(rawValue);
      value = Number.isNaN(parsed) ? rawValue : parsed;
    }
  }
  return value;
}

function applyFieldValue(obj, key, value, options) {
  if (options.optional && (value === "" || value === null)) {
    delete obj[key];
  } else {
    obj[key] = value;
  }
}

function refreshLiveViews() {
  renderTree();
  renderPreview();
  renderInventory();
  renderJson();
  renderWarnings();
}

function handleFieldChange(key, rawValue, options) {
  const sel = stateStore.selected;
  if (!sel) return;
  const value = parseFieldValue(rawValue, options);
  const applyValue = (obj) => applyFieldValue(obj, key, value, options);

  if (sel.type === "menu") {
    applyValue(stateStore.content);
  } else if (sel.type === "labels") {
    applyValue(stateStore.content.labels);
  } else if (sel.type === "section") {
    const section = getSection(sel.sectionPath);
    if (section) applyValue(section);
  } else if (sel.type === "group") {
    const group = getGroup(sel.sectionPath, sel.groupPath);
    if (group) applyValue(group);
  } else if (sel.type === "item") {
    const item = getItem(sel.sectionPath, sel.groupPath, sel.itemIndex);
    if (item) applyValue(item);
  } else if (sel.type === "button") {
    const button = getButton(sel.sectionPath, sel.buttonIndex);
    if (button) applyValue(button);
  }

  setDirty(true);
  if (sel.type === "menu" && key === "menu_image") {
    updateImagePreview("menu-image-preview", value);
  }
  if (sel.type === "section" && key === "image") {
    updateImagePreview("section-image-preview", value);
  }
  if (sel.type === "group" && key === "image") {
    updateImagePreview("group-image-preview", value);
  }
  if (sel.type === "item" && key === "image") {
    updateImagePreview("item-image-preview", value);
  }
  refreshLiveViews();
}

function updatePurchaseField(item, key, value, options) {
  if (!item.purchase) {
    item.purchase = {};
  }
  applyFieldValue(item.purchase, key, value, options);
  setDirty(true);
  refreshLiveViews();
}

function buildActionButton(label, onClick, variant = "ghost") {
  const btn = document.createElement("button");
  btn.className = variant;
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}

function confirmDelete(target) {
  if (!confirm(`Удалить ${target}?`)) return;
  deleteNode();
}

function renderPreview() {
  previewEl.innerHTML = "";
  const sel = stateStore.selected;
  const labels = stateStore.content.labels;
  let text = "";
  let image = null;
  let keyboardEntries = [];

  if (sel.type === "menu") {
    text = resolveMenuText();
    image = stateStore.content.menu_image || null;
    keyboardEntries = buildMenuEntries();
  } else if (sel.type === "labels") {
    text = "Навигационные кнопки";
    keyboardEntries = [
      {
        text: labels.back || "Back",
        order: labels.back_order,
        row: labels.back_row,
        style: labels.back_style,
        color: labels.back_color,
        icon_custom_emoji_id: labels.back_icon_custom_emoji_id,
        icon_custom_emoji_position: labels.back_icon_custom_emoji_position,
      },
      {
        text: labels.home || "Home",
        order: labels.home_order,
        row: labels.home_row,
        style: labels.home_style,
        color: labels.home_color,
        icon_custom_emoji_id: labels.home_icon_custom_emoji_id,
        icon_custom_emoji_position: labels.home_icon_custom_emoji_position,
      },
    ];
  } else if (sel.type === "section") {
    const section = getSection(sel.sectionPath);
    if (!section) return;
    if (section.history || section.admin_history) {
      const historyText =
        section.empty_text || section.text || "History is empty";
      text = section.image
        ? section.image_caption || historyText
        : historyText;
      image = section.image || null;
      keyboardEntries = buildHistoryEntries(labels);
    } else {
      const sectionText = resolveSectionText(section);
      text = section.image ? (section.image_caption || sectionText) : sectionText;
      image = section.image || null;
      keyboardEntries = buildSectionEntries(section, labels);
      if (Array.isArray(sel.sectionPath) && sel.sectionPath.length > 1) {
        keyboardEntries.push({
          text: labels.back || "Back",
          order: labels.back_order ?? 10000,
          row: labels.back_row ?? null,
          style: labels.back_style,
          color: labels.back_color,
          icon_custom_emoji_id: labels.back_icon_custom_emoji_id,
          icon_custom_emoji_position: labels.back_icon_custom_emoji_position,
        });
      }
    }
  } else if (sel.type === "group") {
    const group = getGroup(sel.sectionPath, sel.groupPath);
    if (!group) return;
    const groupText = resolveGroupText(group);
    text = group.image ? (group.image_caption || groupText) : groupText;
    image = group.image || null;
    keyboardEntries = buildGroupEntries(group, labels);
  } else if (sel.type === "item") {
    const item = getItem(sel.sectionPath, sel.groupPath, sel.itemIndex);
    if (!item) return;
    text = formatItemText(item, labels);
    image = item.image || null;
    keyboardEntries = buildItemEntries(item, labels);
  } else if (sel.type === "button") {
    const button = getButton(sel.sectionPath, sel.buttonIndex);
    if (!button) return;
    text = `${button.title || "Кнопка"}\nAction: ${button.action || ""}`;
  }

  previewEl.appendChild(
    buildTelegramPreview({
      text,
      image,
      keyboardEntries,
    })
  );
}

function resolveMenuText() {
  return stateStore.content.menu_caption || stateStore.content.menu_title || "";
}

function resolveSectionText(section) {
  if (!section) return "";
  if (section.template) return section.template;
  if (section.file) return `Файл: ${section.file}`;
  if (section.text) return section.text;
  if (section.description) return section.description;
  return section.title || "";
}

function resolveGroupText(group) {
  if (!group) return "";
  if (group.description) return group.description;
  return group.title || "";
}

function buildTelegramPreview({ text, image, keyboardEntries }) {
  const device = document.createElement("div");
  device.className = "tg-device";

  const screen = document.createElement("div");
  screen.className = "tg-preview";
  device.appendChild(screen);

  screen.appendChild(
    buildTelegramHeader(stateStore.content.menu_title || "Menu Bot")
  );

  const body = document.createElement("div");
  body.className = "tg-body";
  body.appendChild(buildTelegramMessage(text, image));

  if (keyboardEntries && keyboardEntries.length) {
    body.appendChild(buildTelegramKeyboard(keyboardEntries));
  }

  screen.appendChild(body);
  return device;
}

function buildTelegramHeader(title) {
  const header = document.createElement("div");
  header.className = "tg-header";

  const avatar = document.createElement("div");
  avatar.className = "tg-avatar";
  avatar.textContent = getInitials(title || "MB");

  const meta = document.createElement("div");
  meta.className = "tg-header-meta";

  const name = document.createElement("div");
  name.className = "tg-title";
  name.textContent = title || "Menu Bot";

  const status = document.createElement("div");
  status.className = "tg-status";
  status.textContent = "online";

  meta.appendChild(name);
  meta.appendChild(status);
  header.appendChild(avatar);
  header.appendChild(meta);
  return header;
}

function getInitials(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return "MB";
  const parts = trimmed.split(/\s+/).slice(0, 2);
  const initials = parts.map((part) => part[0]?.toUpperCase() || "").join("");
  return initials || "MB";
}

function buildTelegramMessage(text, imagePath) {
  const message = document.createElement("div");
  message.className = "tg-message";

  const bubble = document.createElement("div");
  bubble.className = imagePath ? "tg-bubble tg-bubble-media" : "tg-bubble";

  if (imagePath) {
    bubble.appendChild(buildTelegramImage(imagePath));
  }

  if (text) {
    const caption = document.createElement("div");
    caption.className = imagePath ? "tg-caption" : "";
    caption.textContent = text;
    bubble.appendChild(caption);
  } else if (!imagePath) {
    bubble.classList.add("tg-placeholder");
    bubble.textContent = "Нет текста";
  }

  message.appendChild(bubble);
  return message;
}

function buildTelegramImage(path) {
  const img = document.createElement("img");
  img.className = "tg-photo";
  img.src = `/files/${encodeURI(path)}`;
  img.alt = "photo";
  return img;
}

function getContrastColor(color) {
  if (!color || typeof color !== "string") return null;
  const hex = color.trim().replace("#", "");
  if (hex.length !== 3 && hex.length !== 6) return null;
  const normalized =
    hex.length === 3
      ? hex.split("").map((c) => c + c).join("")
      : hex;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#0d0f14" : "#ffffff";
}

function buildTelegramKeyboard(entries) {
  const keyboard = document.createElement("div");
  keyboard.className = "tg-keyboard";
  const rows = groupRows(entries);
  rows.forEach((row) => {
    const rowEl = document.createElement("div");
    rowEl.className = "tg-key-row";
    row.buttons.forEach((entry) => {
      const btn = document.createElement("div");
      btn.className = "tg-key-btn";
      if (entry.color) {
        btn.style.background = entry.color;
        btn.style.borderColor = entry.color;
        const textColor = getContrastColor(entry.color);
        if (textColor) {
          btn.style.color = textColor;
        }
      } else if (entry.style) {
        btn.classList.add(`tg-key-btn--${entry.style}`);
      }
      if (entry.icon_custom_emoji_id) {
        const emoji = document.createElement("span");
        emoji.className = "tg-key-emoji";
        emoji.textContent = "⭐";
        emoji.title = entry.icon_custom_emoji_id;
        const position = entry.icon_custom_emoji_position || "left";
        const label = document.createElement("span");
        label.textContent = entry.text;
        if (position === "right") {
          emoji.classList.add("tg-key-emoji--right");
          btn.appendChild(label);
          btn.appendChild(emoji);
        } else {
          btn.appendChild(emoji);
          btn.appendChild(label);
        }
      } else {
        const label = document.createElement("span");
        label.textContent = entry.text;
        btn.appendChild(label);
      }
      rowEl.appendChild(btn);
    });
    keyboard.appendChild(rowEl);
  });
  return keyboard;
}

function buildMenuEntries() {
  return stateStore.content.sections
    .map((section) => ({
      text: section.title || "(Без названия)",
      order: section.order ?? 1000,
      row: section.row ?? null,
      style: section.style,
      color: section.color,
      icon_custom_emoji_id: section.icon_custom_emoji_id,
      icon_custom_emoji_position: section.icon_custom_emoji_position,
    }));
}

function buildSectionEntries(section, labels) {
  const entries = [];
  (section.sections || []).forEach((subsection) => {
    entries.push({
      text: subsection.title || "(Раздел)",
      order: subsection.order ?? 1000,
      row: subsection.row ?? null,
      style: subsection.style,
      color: subsection.color,
      icon_custom_emoji_id: subsection.icon_custom_emoji_id,
      icon_custom_emoji_position: subsection.icon_custom_emoji_position,
    });
  });
  section.groups.forEach((group) => {
    entries.push({
      text: group.title || "(Группа)",
      order: group.order ?? 1000,
      row: group.row ?? null,
      style: group.style,
      color: group.color,
      icon_custom_emoji_id: group.icon_custom_emoji_id,
      icon_custom_emoji_position: group.icon_custom_emoji_position,
    });
  });
  section.buttons.forEach((button) => {
    entries.push({
      text: button.title || "(Кнопка)",
      order: button.order ?? 1000,
      row: button.row ?? null,
      style: button.style,
      color: button.color,
      icon_custom_emoji_id: button.icon_custom_emoji_id,
      icon_custom_emoji_position: button.icon_custom_emoji_position,
    });
  });
  entries.push({
    text: labels.home || "Home",
    order: labels.home_order ?? 10000,
    row: labels.home_row ?? null,
    style: labels.home_style,
    color: labels.home_color,
    icon_custom_emoji_id: labels.home_icon_custom_emoji_id,
    icon_custom_emoji_position: labels.home_icon_custom_emoji_position,
  });
  return entries;
}

function buildGroupEntries(group, labels) {
  const entries = [];
  (group.groups || []).forEach((subgroup) => {
    entries.push({
      text: subgroup.title || "(Группа)",
      order: subgroup.order ?? 1000,
      row: subgroup.row ?? null,
      style: subgroup.style,
      color: subgroup.color,
      icon_custom_emoji_id: subgroup.icon_custom_emoji_id,
      icon_custom_emoji_position: subgroup.icon_custom_emoji_position,
    });
  });
  group.items.forEach((item) => {
    entries.push({
      text: item.title || "(Карточка)",
      order: item.order ?? 1000,
      row: item.row ?? null,
      style: item.style,
      color: item.color,
      icon_custom_emoji_id: item.icon_custom_emoji_id,
      icon_custom_emoji_position: item.icon_custom_emoji_position,
    });
  });
  entries.push({
    text: labels.back || "Back",
    order: labels.back_order ?? 10000,
    row: labels.back_row ?? null,
    style: labels.back_style,
    color: labels.back_color,
    icon_custom_emoji_id: labels.back_icon_custom_emoji_id,
    icon_custom_emoji_position: labels.back_icon_custom_emoji_position,
  });
  entries.push({
    text: labels.home || "Home",
    order: labels.home_order ?? 10001,
    row: labels.home_row ?? null,
    style: labels.home_style,
    color: labels.home_color,
    icon_custom_emoji_id: labels.home_icon_custom_emoji_id,
    icon_custom_emoji_position: labels.home_icon_custom_emoji_position,
  });
  return entries;
}

function buildItemEntries(item, labels) {
  const entries = [];
  const purchase = item.purchase || null;
  if (purchase) {
    entries.push({
      text: purchase.title || labels.purchase || "Purchase",
      order: purchase.order ?? 1000,
      row: purchase.row ?? null,
      style: purchase.style,
      color: purchase.color,
      icon_custom_emoji_id: purchase.icon_custom_emoji_id,
      icon_custom_emoji_position: purchase.icon_custom_emoji_position,
    });
  }
  entries.push({
    text: labels.back || "Back",
    order: labels.back_order ?? 10000,
    row: labels.back_row ?? null,
    style: labels.back_style,
    color: labels.back_color,
    icon_custom_emoji_id: labels.back_icon_custom_emoji_id,
    icon_custom_emoji_position: labels.back_icon_custom_emoji_position,
  });
  entries.push({
    text: labels.home || "Home",
    order: labels.home_order ?? 10001,
    row: labels.home_row ?? null,
    style: labels.home_style,
    color: labels.home_color,
    icon_custom_emoji_id: labels.home_icon_custom_emoji_id,
    icon_custom_emoji_position: labels.home_icon_custom_emoji_position,
  });
  return entries;
}

function buildHistoryEntries(labels) {
  const entries = [];
  entries.push({
    text: labels.history_prev || "Prev",
    order: labels.history_prev_order ?? 10,
    row: labels.history_row ?? null,
    style: labels.history_prev_style,
    color: labels.history_prev_color,
    icon_custom_emoji_id: labels.history_prev_icon_custom_emoji_id,
    icon_custom_emoji_position: labels.history_prev_icon_custom_emoji_position,
  });
  entries.push({
    text: labels.history_next || "Next",
    order: labels.history_next_order ?? 20,
    row: labels.history_row ?? null,
    style: labels.history_next_style,
    color: labels.history_next_color,
    icon_custom_emoji_id: labels.history_next_icon_custom_emoji_id,
    icon_custom_emoji_position: labels.history_next_icon_custom_emoji_position,
  });
  entries.push({
    text: labels.home || "Home",
    order: labels.home_order ?? 10001,
    row: labels.home_row ?? null,
    style: labels.home_style,
    color: labels.home_color,
    icon_custom_emoji_id: labels.home_icon_custom_emoji_id,
    icon_custom_emoji_position: labels.home_icon_custom_emoji_position,
  });
  return entries;
}

function groupRows(entries) {
  const sorted = [...entries].sort((a, b) => {
    const orderA = a.order ?? 1000;
    const orderB = b.order ?? 1000;
    if (orderA !== orderB) return orderA - orderB;
    return (a.text || "").localeCompare(b.text || "");
  });

  const rowMap = new Map();
  const soloRows = [];

  sorted.forEach((entry) => {
    if (entry.row === null || entry.row === undefined) {
      soloRows.push({ order: entry.order ?? 1000, buttons: [entry] });
      return;
    }
    const key = String(entry.row);
    if (!rowMap.has(key)) {
      rowMap.set(key, { order: entry.order ?? 1000, buttons: [] });
    }
    const row = rowMap.get(key);
    row.order = Math.min(row.order, entry.order ?? 1000);
    row.buttons.push(entry);
  });

  const rows = [...soloRows, ...rowMap.values()];
  rows.sort((a, b) => a.order - b.order);
  return rows;
}

function formatItemText(item, labels) {
  const lines = [];
  if (item.title) lines.push(item.title);
  if (item.price !== undefined && item.price !== null && item.price !== "") {
    lines.push(`${labels.price || "Price"}: ${item.price}`);
  }
  if (item.description) lines.push(item.description);
  return lines.join("\n");
}

function sortByOrder(list) {
  return [...(list || [])].sort((a, b) => {
    const orderA = a?.order ?? 1000;
    const orderB = b?.order ?? 1000;
    if (orderA !== orderB) return orderA - orderB;
    return (a?.title || a?.id || "").localeCompare(b?.title || b?.id || "");
  });
}

function buildInventoryKey(sectionId, groupPathIds, itemId) {
  if (!sectionId || !itemId) return null;
  if (!Array.isArray(groupPathIds) || groupPathIds.length === 0) return null;
  if (groupPathIds.some((id) => !id)) return null;
  return `${sectionId}:${groupPathIds.join("/")}:${itemId}`;
}

function extractInventoryValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === "object") {
    const candidate = value.qty ?? value.count ?? value.quantity;
    const parsed = Number(candidate);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseInventoryValue(rawValue) {
  if (rawValue === "" || rawValue === null || rawValue === undefined) return null;
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.trunc(parsed));
}

function updateInventoryValue(key, value) {
  if (!key) return;
  if (!stateStore.inventory || typeof stateStore.inventory !== "object") {
    stateStore.inventory = { items: {} };
  }
  if (!stateStore.inventory.items || typeof stateStore.inventory.items !== "object") {
    stateStore.inventory.items = {};
  }
  if (value === null || value === "" || value === undefined) {
    delete stateStore.inventory.items[key];
  } else {
    stateStore.inventory.items[key] = value;
  }
  setDirty(true, "inventory");
}

function collectInventorySections() {
  const sections = [];
  const walkSections = (list, parentTitles = []) => {
    sortByOrder(list).forEach((section, sectionIndex) => {
      const title = section.title || section.id || `Раздел ${sectionIndex + 1}`;
      const label = [...parentTitles, title].join(" / ");
      const items = collectSectionItems(section);
      if (items.length > 0) {
        sections.push({ label, items });
      }
      if (Array.isArray(section.sections) && section.sections.length > 0) {
        walkSections(section.sections, [...parentTitles, title]);
      }
    });
  };
  walkSections(stateStore.content?.sections || [], []);
  return sections;
}

function collectSectionItems(section) {
  const items = [];
  sortByOrder(section?.groups || []).forEach((group, groupIndex) => {
    const groupTitle = group.title || group.id || `Группа ${groupIndex + 1}`;
    collectGroupItems(
      group,
      section?.id || "",
      [group.id],
      [groupTitle],
      items
    );
  });
  return items;
}

function collectGroupItems(group, sectionId, groupPathIds, groupPathTitles, items) {
  sortByOrder(group?.items || []).forEach((item, itemIndex) => {
    const itemTitle = item.title || item.id || `Карточка ${itemIndex + 1}`;
    const pathLabel = groupPathTitles.join(" / ");
    const key = buildInventoryKey(sectionId, groupPathIds, item.id);
    const rawValue = key ? stateStore.inventory?.items?.[key] : null;
    const value = extractInventoryValue(rawValue);
    items.push({
      title: itemTitle,
      path: pathLabel,
      key,
      value,
      disabled: !key,
      meta: !key ? "Нужен id у раздела/группы/карточки" : "",
    });
  });

  sortByOrder(group?.groups || []).forEach((child, childIndex) => {
    const childTitle = child.title || child.id || `Группа ${childIndex + 1}`;
    collectGroupItems(
      child,
      sectionId,
      [...groupPathIds, child.id],
      [...groupPathTitles, childTitle],
      items
    );
  });
}

function renderInventory() {
  if (!inventoryBodyEl) return;
  inventoryBodyEl.innerHTML = "";

  if (!stateStore.content) {
    inventoryBodyEl.appendChild(buildHelper("Нет данных"));
    return;
  }

  const sections = collectInventorySections();
  if (!sections.length) {
    inventoryBodyEl.appendChild(buildHelper("Карточек пока нет"));
    return;
  }

  sections.forEach((section) => {
    const sectionEl = document.createElement("div");
    sectionEl.className = "inventory-section";

    const title = document.createElement("div");
    title.className = "inventory-section-title";
    title.textContent = section.label;
    sectionEl.appendChild(title);

    const list = document.createElement("div");
    list.className = "inventory-grid";
    section.items.forEach((entry) => {
      list.appendChild(buildInventoryRow(entry));
    });

    sectionEl.appendChild(list);
    inventoryBodyEl.appendChild(sectionEl);
  });
}

function buildInventoryRow(entry) {
  const card = document.createElement("div");
  card.className = "inventory-card";
  if (entry.disabled) card.classList.add("disabled");

  const title = document.createElement("div");
  title.className = "inventory-title";
  title.textContent = entry.title;
  card.appendChild(title);

  if (entry.path) {
    const path = document.createElement("div");
    path.className = "inventory-path";
    path.textContent = entry.path;
    card.appendChild(path);
  }

  const qtyWrap = document.createElement("div");
  qtyWrap.className = "inventory-qty";

  const qtyLabel = document.createElement("div");
  qtyLabel.className = "inventory-qty-label";
  qtyLabel.textContent = "Остаток";
  qtyWrap.appendChild(qtyLabel);

  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.step = "1";
  input.placeholder = "∞";
  if (entry.disabled) {
    input.disabled = true;
  } else if (entry.value !== null && entry.value !== undefined && entry.value !== "") {
    input.value = String(entry.value);
  }
  input.addEventListener("change", () => {
    const normalized = parseInventoryValue(input.value);
    if (normalized === null) {
      input.value = "";
    } else {
      input.value = String(normalized);
    }
    updateInventoryValue(entry.key, normalized);
  });
  qtyWrap.appendChild(input);
  card.appendChild(qtyWrap);

  if (entry.meta) {
    const meta = document.createElement("div");
    meta.className = "inventory-meta";
    meta.textContent = entry.meta;
    card.appendChild(meta);
  }

  return card;
}

function renderJson() {
  jsonViewEl.value = JSON.stringify(stateStore.content, null, 2);
}

function renderWarnings() {
  warningsEl.innerHTML = "";
  const warnings = validateContent(stateStore.content);
  if (!warnings.length) {
    warningsEl.appendChild(buildHelper("Ошибок не найдено"));
    return;
  }
  warnings.forEach((warning) => {
    const el = document.createElement("div");
    el.className = "warning";
    el.textContent = warning;
    warningsEl.appendChild(el);
  });
}

function validateContent(content) {
  const messages = [];
  const sectionIds = collectSectionDuplicates(content.sections);
  if (sectionIds.size > 0) {
    messages.push(`Дублируются ID разделов: ${[...sectionIds].join(", ")}`);
  }

  const validateGroup = (group, index, parentLabel) => {
    const label = parentLabel ? `${parentLabel}/${group.id || `#${index + 1}`}` : group.id || `#${index + 1}`;
    if (!group.id) {
      messages.push(`Группа ${label}: не указан id`);
    }
    if (!group.title) {
      messages.push(`Группа ${label}: не указан title`);
    }

    const subgroupIds = collectDuplicateIds(group.groups);
    if (subgroupIds.size > 0) {
      messages.push(`Группа ${label}: дублируются ID подгрупп: ${[...subgroupIds].join(", ")}`);
    }

    const itemIds = collectDuplicateIds(group.items);
    if (itemIds.size > 0) {
      messages.push(
        `Группа ${group.id || index + 1}: дублируются ID карточек: ${[
          ...itemIds,
        ].join(", ")}`
      );
    }

    group.items.forEach((item, itemIndex) => {
      if (!item.id) {
        messages.push(
          `Карточка #${itemIndex + 1} в группе ${group.id || index + 1}: не указан id`
        );
      }
      if (!item.title) {
        messages.push(
          `Карточка #${itemIndex + 1} в группе ${group.id || index + 1}: не указан title`
        );
      }
    });

    (group.groups || []).forEach((child, childIndex) => {
      validateGroup(child, childIndex, label);
    });
  };

  const validateSection = (section, index, parentLabel) => {
    const currentLabel = section.id || `#${index + 1}`;
    const label = parentLabel ? `${parentLabel}/${currentLabel}` : currentLabel;

    if (!section.id) {
      messages.push(`Раздел ${label}: не указан id`);
    }
    if (!section.title) {
      messages.push(`Раздел ${label}: не указан title`);
    }

    const groupIds = collectDuplicateIds(section.groups);
    if (groupIds.size > 0) {
      messages.push(`Раздел ${label}: дублируются ID групп: ${[...groupIds].join(", ")}`);
    }

    section.groups.forEach((group, groupIndex) => {
      validateGroup(group, groupIndex, `Раздел ${label}`);
    });

    const buttonIds = collectDuplicateIds(section.buttons);
    if (buttonIds.size > 0) {
      messages.push(`Раздел ${label}: дублируются ID кнопок: ${[...buttonIds].join(", ")}`);
    }

    section.buttons.forEach((button, buttonIndex) => {
      if (!button.id) {
        messages.push(`Кнопка #${buttonIndex + 1} в разделе ${label}: не указан id`);
      }
      if (!button.title) {
        messages.push(`Кнопка #${buttonIndex + 1} в разделе ${label}: не указан title`);
      }
      if (!button.action) {
        messages.push(`Кнопка #${buttonIndex + 1} в разделе ${label}: не указан action`);
      }
    });

    (section.sections || []).forEach((child, childIndex) => {
      validateSection(child, childIndex, label);
    });
  };

  content.sections.forEach((section, sectionIndex) => {
    validateSection(section, sectionIndex, "");
  });

  return messages;
}

function collectDuplicateIds(list) {
  const seen = new Set();
  const duplicates = new Set();
  (list || []).forEach((entry) => {
    if (!entry.id) return;
    if (seen.has(entry.id)) {
      duplicates.add(entry.id);
    }
    seen.add(entry.id);
  });
  return duplicates;
}

function collectSectionDuplicates(sections) {
  const seen = new Set();
  const duplicates = new Set();
  const walk = (list) => {
    (list || []).forEach((section) => {
      if (section.id) {
        if (seen.has(section.id)) {
          duplicates.add(section.id);
        } else {
          seen.add(section.id);
        }
      }
      if (Array.isArray(section.sections)) {
        walk(section.sections);
      }
    });
  };
  walk(sections);
  return duplicates;
}

async function loadAll() {
  updateStatus("Загрузка...");
  try {
    const contentResponse = await fetch("/api/content");
    if (!contentResponse.ok) throw new Error("Load failed");
    const contentData = await contentResponse.json();

    let inventoryData = { items: {} };
    try {
      const inventoryResponse = await fetch("/api/inventory");
      if (inventoryResponse.ok) {
        inventoryData = await inventoryResponse.json();
      }
    } catch (error) {
      inventoryData = { items: {} };
    }

    stateStore.content = normalizeContent(contentData);
    stateStore.inventory = normalizeInventory(inventoryData);
    stateStore.selected = { type: "menu" };
    stateStore.dirty = false;
    stateStore.inventoryDirty = false;
    stateStore.lastSavedAt = null;
    renderAll();
    setActiveTab(stateStore.activeTab);
    updateStatus();
  } catch (error) {
    updateStatus("Не удалось загрузить данные");
  }
}

async function postJson(url, payload) {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload, null, 2),
    });
    let errorText = "";
    if (!response.ok) {
      try {
        errorText = await response.text();
      } catch (err) {
        errorText = "";
      }
    }
    return {
      ok: response.ok,
      url,
      status: response.status,
      statusText: response.statusText,
      errorText,
    };
  } catch (error) {
    return {
      ok: false,
      url,
      status: 0,
      statusText: error?.message || "Network error",
      errorText: "",
    };
  }
}

async function saveAll() {
  if (!stateStore.content && !stateStore.inventory) return;
  updateStatus("Сохранение...");
  const tasks = [];
  if (stateStore.content) tasks.push(postJson("/api/content", stateStore.content));
  if (stateStore.inventory) tasks.push(postJson("/api/inventory", stateStore.inventory));
  const results = await Promise.all(tasks);
  const failed = results.filter((result) => !result.ok);
  if (failed.length > 0) {
    const details = failed
      .map((result) => `${result.url} ${result.status} ${result.statusText}`.trim())
      .join("; ");
    updateStatus(`Ошибка сохранения: ${details || "см. консоль"}`);
    console.error("Save error details", failed);
    return;
  }
  stateStore.dirty = false;
  stateStore.inventoryDirty = false;
  stateStore.lastSavedAt = new Date().toLocaleTimeString();
  updateStatus();
}

saveBtn.addEventListener("click", () => saveAll());
reloadBtn.addEventListener("click", () => {
  if (
    (stateStore.dirty || stateStore.inventoryDirty) &&
    !confirm("Есть несохраненные изменения. Перезагрузить?")
  ) {
    return;
  }
  loadAll();
});
addSectionBtn.addEventListener("click", () => addSection());

if (tabInterfaceBtn) {
  tabInterfaceBtn.addEventListener("click", () => setActiveTab("interface"));
}
if (tabInventoryBtn) {
  tabInventoryBtn.addEventListener("click", () => setActiveTab("inventory"));
}

setActiveTab(stateStore.activeTab);
loadAll();

