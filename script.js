const DEFAULT_CATEGORIES = ["医師用", "看護師用", "受付用", "管理用", "その他"];
const PROFILE_LABELS = {
  doctor: "医師用トップページ",
  nurse: "看護師用トップページ",
  reception: "受付スタッフ用トップページ",
  admin: "管理者用トップページ",
};
const GAS_APPS_CACHE_KEY = "clinicPortalGasAppsCache";
const TAG_ORDER_STORAGE_KEY = "clinicPortalTagOrder";
const TAG_COLOR_VERSION_STORAGE_KEY = "clinicPortalTagColorVersion";
const COLOR_CLASS_BY_LABEL = {
  "医師用": "color-doctor",
  "看護師用": "color-nurse",
  "受付用": "color-reception",
  "管理用": "color-admin",
  "その他": "color-other",
};
const TAG_COLOR_HUES = [188, 27, 145, 268, 52, 216, 103, 335, 173, 10, 238, 77];

const state = {
  apps: [],
  profile: getProfileFromUrl(),
  activeCategory: "all",
  activeTags: new Set(),
  tagOrder: loadSavedTagOrder(),
  tagColorVersion: loadTagColorVersion(),
  didDragTag: false,
  pointerTagDrag: null,
  query: "",
};

const appGrid = document.querySelector("#appGrid");
const categoryTabs = document.querySelector("#categoryTabs");
const emptyState = document.querySelector("#emptyState");
const errorState = document.querySelector("#errorState");
const profileLabel = document.querySelector("#profileLabel");
const resultSummary = document.querySelector("#resultSummary");
const searchInput = document.querySelector("#searchInput");
const tagTabs = document.querySelector("#tagTabs");
const regenerateColorsButton = document.querySelector("#regenerateColorsButton");
const template = document.querySelector("#appCardTemplate");

async function loadApps() {
  try {
    const draftApps = getDraftApps();
    if (draftApps) {
      setApps(draftApps);
      return;
    }

    const configuredApps = await tryLoadConfiguredApps();
    if (configuredApps.length > 0) {
      setApps(configuredApps);
      return;
    }

    const cachedApps = getCachedConfiguredApps();
    if (cachedApps.length > 0) {
      setApps(cachedApps);
      return;
    }

    const apps = await loadFallbackApps();
    setApps(apps);
  } catch (error) {
    console.error(error);
    resultSummary.textContent = "";
    errorState.hidden = false;
  }
}

function setApps(apps) {
  state.apps = apps.filter((app) => app.visible !== false);
  renderProfileLabel();
  renderCategoryTabs();
  renderTagTabs();
  renderApps();
}

async function loadFallbackApps() {
  const response = await fetch(`apps.json?cache=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`apps.json returned ${response.status}`);
  }

  const apps = await response.json();
  if (!Array.isArray(apps)) {
    throw new Error("apps.json must be an array");
  }

  return apps;
}

async function refreshConfiguredApps() {
  const configuredApps = await tryLoadConfiguredApps();
  if (configuredApps.length > 0 && JSON.stringify(configuredApps) !== JSON.stringify(state.apps)) {
    setApps(configuredApps);
  }
}

async function tryLoadConfiguredApps() {
  try {
    return (await loadConfiguredApps()) || [];
  } catch (error) {
    console.warn("Apps Scriptから読み込めなかったため apps.json にフォールバックします。", error);
    return [];
  }
}

async function loadConfiguredApps() {
  const endpoint = window.CLINIC_PORTAL_CONFIG?.appsScriptEndpoint?.trim();
  if (!endpoint) {
    return null;
  }

  const payload = await loadAppsScriptPayload(endpoint);
  if (!payload.ok || !Array.isArray(payload.apps)) {
    throw new Error(payload.error || "Apps Script response is invalid");
  }

  localStorage.setItem(GAS_APPS_CACHE_KEY, JSON.stringify(payload.apps));
  return payload.apps;
}

function getCachedConfiguredApps() {
  try {
    const apps = JSON.parse(localStorage.getItem(GAS_APPS_CACHE_KEY) || "[]");
    return Array.isArray(apps) ? apps : [];
  } catch {
    return [];
  }
}

function loadAppsScriptPayload(endpoint) {
  return new Promise((resolve, reject) => {
    const callbackName = `clinicPortalCallback${Date.now()}`;
    const script = document.createElement("script");
    const timeoutId = window.setTimeout(() => {
      delete window[callbackName];
      script.remove();
      reject(new Error("Apps Scriptの応答がタイムアウトしました。"));
    }, 15000);
    const url = new URL(endpoint);
    url.searchParams.set("callback", callbackName);
    url.searchParams.set("cache", String(Date.now()));

    window[callbackName] = (payload) => {
      window.clearTimeout(timeoutId);
      delete window[callbackName];
      script.remove();
      resolve(payload);
    };

    script.onerror = () => {
      window.clearTimeout(timeoutId);
      delete window[callbackName];
      script.remove();
      reject(new Error("Apps Scriptを読み込めませんでした。"));
    };

    script.src = url.toString();
    document.body.append(script);
  });
}

function getDraftApps() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("draft") !== "1") {
    return null;
  }

  try {
    const apps = JSON.parse(localStorage.getItem("clinicPortalAppsDraft") || "[]");
    return Array.isArray(apps) ? apps : null;
  } catch {
    return null;
  }
}

function getProfileFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("profile")?.trim() || "";
}

function renderProfileLabel() {
  profileLabel.textContent = state.profile
    ? PROFILE_LABELS[state.profile] || `${state.profile} 用トップページ`
    : "共通トップページ";
}

function renderCategoryTabs() {
  categoryTabs.querySelectorAll("button[data-category]:not([data-category='all'])").forEach((button) => {
    button.remove();
  });

  const categories = [
    ...DEFAULT_CATEGORIES,
    ...getProfileApps().map((app) => app.category).filter(Boolean),
  ];
  const uniqueCategories = [...new Set(categories)];

  uniqueCategories.forEach((category) => {
    const button = document.createElement("button");
    button.className = "tab-button";
    button.classList.add(getColorClass(category));
    button.type = "button";
    button.dataset.category = category;
    button.setAttribute("aria-pressed", "false");
    button.textContent = category;
    categoryTabs.append(button);
  });
}

function renderTagTabs() {
  tagTabs.querySelectorAll("button[data-tag]:not([data-tag='all'])").forEach((button) => {
    button.remove();
  });

  const tags = getProfileApps().flatMap((app) => getAppTags(app));
  const uniqueTags = sortTags([...new Set(tags)]);

  const uniqueTagSet = new Set(uniqueTags);
  state.activeTags = new Set([...state.activeTags].filter((tag) => uniqueTagSet.has(tag)));

  const allButton = tagTabs.querySelector("button[data-tag='all']");
  const isAllActive = state.activeTags.size === 0;
  allButton.classList.toggle("is-active", isAllActive);
  allButton.setAttribute("aria-pressed", String(isAllActive));

  uniqueTags.forEach((tag, index) => {
    const button = document.createElement("button");
    const isActive = state.activeTags.has(tag);
    button.className = "tag-button";
    button.classList.add("color-auto");
    button.type = "button";
    button.dataset.tag = tag;
    button.dataset.sortable = "true";
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
    button.setAttribute("aria-label", `${tag}${isActive ? "、選択中" : ""}。クリックで選択、ドラッグで並び替え`);
    button.title = "ドラッグして並び替え";
    applyTagColor(button, tag, index);
    button.textContent = tag;
    tagTabs.append(button);
  });
}

function sortTags(tags) {
  const savedIndexByTag = new Map(state.tagOrder.map((tag, index) => [tag, index]));
  return [...tags].sort((firstTag, secondTag) => {
    const firstIndex = savedIndexByTag.has(firstTag) ? savedIndexByTag.get(firstTag) : Number.MAX_SAFE_INTEGER;
    const secondIndex = savedIndexByTag.has(secondTag) ? savedIndexByTag.get(secondTag) : Number.MAX_SAFE_INTEGER;

    if (firstIndex !== secondIndex) {
      return firstIndex - secondIndex;
    }

    return tags.indexOf(firstTag) - tags.indexOf(secondTag);
  });
}

function loadSavedTagOrder() {
  try {
    const tagOrder = JSON.parse(localStorage.getItem(TAG_ORDER_STORAGE_KEY) || "[]");
    return Array.isArray(tagOrder)
      ? tagOrder.map((tag) => tag.toString().trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function loadTagColorVersion() {
  const version = Number(localStorage.getItem(TAG_COLOR_VERSION_STORAGE_KEY));
  return Number.isFinite(version) && version >= 0 ? version : 0;
}

function saveTagColorVersion() {
  localStorage.setItem(TAG_COLOR_VERSION_STORAGE_KEY, String(state.tagColorVersion));
}

function saveTagOrderFromVisibleTabs() {
  const visibleTags = [...tagTabs.querySelectorAll("button[data-tag]:not([data-tag='all'])")]
    .map((button) => button.dataset.tag)
    .filter(Boolean);
  const visibleTagSet = new Set(visibleTags);
  const hiddenOrderedTags = state.tagOrder.filter((tag) => !visibleTagSet.has(tag));

  state.tagOrder = [...visibleTags, ...hiddenOrderedTags];
  localStorage.setItem(TAG_ORDER_STORAGE_KEY, JSON.stringify(state.tagOrder));
}

function getDropPlacement(event, targetButton) {
  const rect = targetButton.getBoundingClientRect();
  return event.clientX > rect.left + rect.width / 2;
}

function renderApps() {
  const filteredApps = getFilteredApps();
  const colorIndexByTag = getColorIndexByTag();
  appGrid.replaceChildren();

  filteredApps.forEach((app) => {
    const card = template.content.firstElementChild.cloneNode(true);
    const appTags = getAppTags(app);
    const primaryTag = getPrimaryTag(appTags);
    const categoryBadge = card.querySelector(".category-badge");
    const title = card.querySelector("h2");
    const description = card.querySelector(".description");
    const tags = card.querySelector(".app-tags");
    const link = card.querySelector(".launch-button");

    if (primaryTag) {
      card.classList.add("color-auto");
      applyCardColor(card, primaryTag, colorIndexByTag.get(primaryTag) || 0);
    } else {
      card.classList.add("color-default");
    }
    categoryBadge.textContent = app.category || "その他";
    categoryBadge.classList.add(getColorClass(app.category || "その他"));
    title.textContent = app.name || "名称未設定";
    description.textContent = app.description || "説明は未設定です。";
    renderAppTags(tags, appTags, colorIndexByTag);
    link.href = app.url || "#";
    if (primaryTag) {
      link.classList.add("color-auto");
      applyLaunchColor(link, primaryTag, colorIndexByTag.get(primaryTag) || 0);
    }
    link.setAttribute("aria-label", `${title.textContent}を起動`);

    if (!app.url) {
      link.removeAttribute("href");
      link.textContent = "URL未設定";
      link.setAttribute("aria-disabled", "true");
    }

    appGrid.append(card);
  });

  const categoryLabel = state.activeCategory === "all" ? "すべて" : state.activeCategory;
  const tagLabel = state.activeTags.size === 0 ? "タグすべて" : `タグ: ${[...state.activeTags].join(" / ")}`;
  const profileLabelText = state.profile
    ? PROFILE_LABELS[state.profile] || `${state.profile} 用`
    : "共通";
  resultSummary.textContent = `${profileLabelText} / ${categoryLabel} / ${tagLabel}: ${filteredApps.length}件`;
  emptyState.hidden = filteredApps.length > 0;
}

function renderAppTags(container, tags, colorIndexByTag) {
  container.replaceChildren();
  container.hidden = tags.length === 0;

  tags.forEach((tag) => {
    const tagChip = document.createElement("span");
    tagChip.className = "app-tag";
    tagChip.classList.add("color-auto");
    applyTagColor(tagChip, tag, colorIndexByTag.get(tag) || 0);
    tagChip.textContent = tag;
    container.append(tagChip);
  });
}

function getColorClass(label) {
  return COLOR_CLASS_BY_LABEL[label] || "color-default";
}

function getProfileApps() {
  if (!state.profile) {
    return state.apps;
  }

  return state.apps.filter((app) => {
    if (!Array.isArray(app.profiles)) {
      return false;
    }

    return app.profiles.includes(state.profile);
  });
}

function getFilteredApps() {
  const normalizedQuery = normalizeText(state.query);

  return getProfileApps().filter((app) => {
    const matchesCategory =
      state.activeCategory === "all" || app.category === state.activeCategory;
    const appTags = getAppTags(app);
    const matchesTag =
      state.activeTags.size === 0 || appTags.some((tag) => state.activeTags.has(tag));
    const searchableText = normalizeText(
      `${app.name || ""} ${app.description || ""} ${app.category || ""} ${appTags.join(" ")}`,
    );
    const matchesQuery = searchableText.includes(normalizedQuery);

    return matchesCategory && matchesTag && matchesQuery;
  });
}

function getAppTags(app) {
  return Array.isArray(app.tags)
    ? app.tags.map((tag) => tag.toString().trim()).filter(Boolean)
    : [];
}

function getPrimaryTag(tags) {
  return tags[0] || "";
}

function getColorIndexByTag() {
  const tags = sortTags([...new Set(getProfileApps().flatMap((app) => getAppTags(app)))]);
  return new Map(tags.map((tag, index) => [tag, index]));
}

function getTagColorSet(tag, index = 0) {
  const hueBase = TAG_COLOR_HUES[index % TAG_COLOR_HUES.length];
  const cycleShift = Math.floor(index / TAG_COLOR_HUES.length) * 17;
  const versionShift = (state.tagColorVersion * 41 + stableHash(tag) % 23) % 360;
  const hue = (hueBase + cycleShift + versionShift) % 360;

  return {
    accent: `hsl(${hue} 62% 34%)`,
    accentDark: `hsl(${hue} 66% 25%)`,
    border: `hsl(${hue} 48% 74%)`,
    tint: `hsl(${hue} 74% 96%)`,
    soft: `hsl(${hue} 74% 91%)`,
    text: `hsl(${hue} 66% 28%)`,
  };
}

function stableHash(value) {
  let hash = 0;
  for (const character of value) {
    hash = (hash * 31 + character.codePointAt(0)) >>> 0;
  }
  return hash;
}

function applyTagColor(element, tag, index) {
  const color = getTagColorSet(tag, index);
  element.style.setProperty("--tag-accent", color.accent);
  element.style.setProperty("--tag-border", color.border);
  element.style.setProperty("--tag-bg", color.soft);
  element.style.setProperty("--tag-text", color.text);
}

function applyCardColor(element, tag, index) {
  const color = getTagColorSet(tag, index);
  element.style.setProperty("--card-accent", color.accent);
  element.style.setProperty("--card-accent-dark", color.accentDark);
  element.style.setProperty("--card-border", color.border);
  element.style.setProperty("--card-tint", color.tint);
}

function applyLaunchColor(element, tag, index) {
  const color = getTagColorSet(tag, index);
  element.style.setProperty("--launch-bg", color.accent);
  element.style.setProperty("--launch-bg-hover", color.accentDark);
}

function normalizeText(value) {
  return value.toString().trim().toLocaleLowerCase("ja-JP");
}

categoryTabs.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-category]");
  if (!button) return;

  state.activeCategory = button.dataset.category;

  categoryTabs.querySelectorAll(".tab-button").forEach((tab) => {
    const isActive = tab === button;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-pressed", String(isActive));
  });

  renderApps();
});

tagTabs.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-tag]");
  if (!button) return;
  if (state.didDragTag) {
    state.didDragTag = false;
    return;
  }

  const selectedTag = button.dataset.tag;
  if (selectedTag === "all") {
    state.activeTags.clear();
  } else if (state.activeTags.has(selectedTag)) {
    state.activeTags.delete(selectedTag);
  } else {
    state.activeTags.add(selectedTag);
  }

  renderTagTabs();
  renderApps();
});

regenerateColorsButton.addEventListener("click", () => {
  state.tagColorVersion += 1;
  saveTagColorVersion();
  renderTagTabs();
  renderApps();
});

tagTabs.addEventListener("pointerdown", (event) => {
  const button = event.target.closest("button[data-tag]:not([data-tag='all'])");
  if (!button) return;

  button.setPointerCapture(event.pointerId);
  state.pointerTagDrag = {
    button,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    isSorting: false,
  };
});

tagTabs.addEventListener("pointermove", (event) => {
  const dragState = state.pointerTagDrag;
  if (!dragState || dragState.pointerId !== event.pointerId) return;

  const movedEnough =
    Math.abs(event.clientX - dragState.startX) > 8 ||
    Math.abs(event.clientY - dragState.startY) > 8;
  if (!dragState.isSorting && movedEnough) {
    dragState.isSorting = true;
    dragState.button.classList.add("is-dragging");
  }
  if (!dragState.isSorting) return;

  event.preventDefault();
  const targetButton = document
    .elementFromPoint(event.clientX, event.clientY)
    ?.closest("button[data-tag]:not([data-tag='all'])");
  if (!targetButton || targetButton === dragState.button || !tagTabs.contains(targetButton)) return;

  const shouldPlaceAfter = getDropPlacement(event, targetButton);
  tagTabs.insertBefore(dragState.button, shouldPlaceAfter ? targetButton.nextSibling : targetButton);
});

tagTabs.addEventListener("pointerup", (event) => {
  const dragState = state.pointerTagDrag;
  if (!dragState || dragState.pointerId !== event.pointerId) return;

  if (dragState.button.hasPointerCapture(event.pointerId)) {
    dragState.button.releasePointerCapture(event.pointerId);
  }

  if (dragState.isSorting) {
    state.didDragTag = true;
    dragState.button.classList.remove("is-dragging");
    saveTagOrderFromVisibleTabs();
    renderTagTabs();
    window.setTimeout(() => {
      state.didDragTag = false;
    }, 0);
  }

  state.pointerTagDrag = null;
});

tagTabs.addEventListener("pointercancel", () => {
  const dragState = state.pointerTagDrag;
  dragState?.button.classList.remove("is-dragging");
  if (dragState?.button.hasPointerCapture(dragState.pointerId)) {
    dragState.button.releasePointerCapture(dragState.pointerId);
  }
  state.pointerTagDrag = null;
});

searchInput.addEventListener("input", (event) => {
  state.query = event.target.value;
  renderApps();
});

loadApps();
