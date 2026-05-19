const DEFAULT_CATEGORIES = ["医師用", "看護師用", "受付用", "管理用", "その他"];
const PROFILE_LABELS = {
  doctor: "医師用トップページ",
  nurse: "看護師用トップページ",
  reception: "受付スタッフ用トップページ",
  admin: "管理者用トップページ",
};
const GAS_APPS_CACHE_KEY = "clinicPortalGasAppsCache";

const state = {
  apps: [],
  profile: getProfileFromUrl(),
  activeCategory: "all",
  query: "",
};

const appGrid = document.querySelector("#appGrid");
const categoryTabs = document.querySelector("#categoryTabs");
const emptyState = document.querySelector("#emptyState");
const errorState = document.querySelector("#errorState");
const profileLabel = document.querySelector("#profileLabel");
const resultSummary = document.querySelector("#resultSummary");
const searchInput = document.querySelector("#searchInput");
const template = document.querySelector("#appCardTemplate");

async function loadApps() {
  try {
    const draftApps = getDraftApps();
    if (draftApps) {
      setApps(draftApps);
      return;
    }

    const cachedApps = getCachedConfiguredApps();
    if (cachedApps.length > 0) {
      setApps(cachedApps);
      refreshConfiguredApps();
      return;
    }

    const apps = await loadFallbackApps();
    setApps(apps);
    refreshConfiguredApps();
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
  renderApps();
}

async function loadFallbackApps() {
  const response = await fetch("apps.json");
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
    }, 5000);
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
    button.type = "button";
    button.dataset.category = category;
    button.setAttribute("aria-pressed", "false");
    button.textContent = category;
    categoryTabs.append(button);
  });
}

function renderApps() {
  const filteredApps = getFilteredApps();
  appGrid.replaceChildren();

  filteredApps.forEach((app) => {
    const card = template.content.firstElementChild.cloneNode(true);
    const categoryBadge = card.querySelector(".category-badge");
    const title = card.querySelector("h2");
    const description = card.querySelector(".description");
    const link = card.querySelector(".launch-button");

    categoryBadge.textContent = app.category || "その他";
    title.textContent = app.name || "名称未設定";
    description.textContent = app.description || "説明は未設定です。";
    link.href = app.url || "#";
    link.setAttribute("aria-label", `${title.textContent}を起動`);

    if (!app.url) {
      link.removeAttribute("href");
      link.textContent = "URL未設定";
      link.setAttribute("aria-disabled", "true");
    }

    appGrid.append(card);
  });

  const categoryLabel = state.activeCategory === "all" ? "すべて" : state.activeCategory;
  const profileLabelText = state.profile
    ? PROFILE_LABELS[state.profile] || `${state.profile} 用`
    : "共通";
  resultSummary.textContent = `${profileLabelText} / ${categoryLabel}: ${filteredApps.length}件`;
  emptyState.hidden = filteredApps.length > 0;
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
    const searchableText = normalizeText(
      `${app.name || ""} ${app.description || ""} ${app.category || ""}`,
    );
    const matchesQuery = searchableText.includes(normalizedQuery);

    return matchesCategory && matchesQuery;
  });
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

searchInput.addEventListener("input", (event) => {
  state.query = event.target.value;
  renderApps();
});

loadApps();
