const GAS_APPS_CACHE_KEY = "clinicPortalGasAppsCacheV2";
const GROUP_ORDER = ["喘息", "便秘", "アトピー", "アレルギー性鼻炎", "ワクチン", "夜尿症", "小児肥満", "院内業務", "その他"];

const state = {
  apps: [],
  profile: getProfileFromUrl(),
  activeGroup: "all",
  query: "",
  composing: false,
};

const appSections = document.querySelector("#appSections");
const emptyState = document.querySelector("#emptyState");
const errorState = document.querySelector("#errorState");
const groupNav = document.querySelector("#groupNav");
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
    setApps(await loadFallbackApps());
  } catch (error) {
    console.error(error);
    resultSummary.textContent = "";
    errorState.hidden = false;
  }
}

function setApps(apps) {
  state.apps = apps.map(normalizeApp).filter((app) => app.visible !== false);
  renderProfileLabel();
  renderGroupNav();
  renderApps();
}

function normalizeApp(app) {
  const legacyProfiles = Array.isArray(app.profiles) ? app.profiles : [];
  const legacyTags = Array.isArray(app.tags) ? app.tags : [];
  return {
    ...app,
    group: app.group || migrateLegacyGroup(app.category, legacyTags),
    purpose: app.purpose || migrateLegacyPurpose(app),
    keywords: normalizeList(app.keywords).length
      ? normalizeList(app.keywords)
      : createLegacyKeywords(app.group || migrateLegacyGroup(app.category, legacyTags), legacyTags, app.name, app.url),
    staffVisible: typeof app.staffVisible === "boolean"
      ? app.staffVisible
      : legacyProfiles.includes("reception") || legacyProfiles.includes("staff"),
  };
}

function migrateLegacyGroup(category, tags) {
  const firstTag = tags[0] || "";
  const groupByTag = { AR: "アレルギー性鼻炎", enuresis: "夜尿症", obesity: "小児肥満", vaccine: "ワクチン" };
  if (groupByTag[firstTag]) return groupByTag[firstTag];
  if (firstTag) return firstTag;
  if (["医師用", "受付用", "管理用", "看護師用"].includes(category)) return "院内業務";
  return category || "その他";
}

function migrateLegacyPurpose(app) {
  const searchable = `${app.name || ""} ${app.description || ""} ${app.url || ""}`.toLowerCase();
  if (/action=staff|reception|\bqr\b|受付/.test(searchable)) return "受付";
  if (/action=form|患者用|患者問診|初診問診/.test(searchable)) return "患者入口";
  if (/spreadsheet|spredsheet|dashboard|履歴|データ|確認|action=doctor/.test(searchable)) return "データ確認";
  if (/売上|パスワード|pin/.test(searchable)) return "院内業務";
  return "診察";
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value || "").split(/[,、\n]/).map((item) => item.trim()).filter(Boolean);
}

function createLegacyKeywords(group, tags, name = "", url = "") {
  const groupKeywords = {
    "喘息": ["asthma"], "便秘": ["constipation"], "アトピー": ["atopic", "atopy"],
    "アレルギー性鼻炎": ["allergic rhinitis", "rhinitis", "AR", "SLIT"],
    "ワクチン": ["vaccine", "vaccination"], "夜尿症": ["enuresis"], "小児肥満": ["obesity"],
  };
  const text = `${name || ""} ${url || ""}`.toLowerCase();
  const specific = [];
  if (/spreadsheet|spredsheet/.test(text)) specific.push("spreadsheet", "sheet");
  if (/\bqr\b/.test(text)) specific.push("qr");
  if (/履歴|history/.test(text)) specific.push("history");
  if (/日誌|diary/.test(text)) specific.push("diary");
  if (/初診/.test(text)) specific.push("initial", "first visit");
  if (/action=form/.test(text)) specific.push("form", "questionnaire", "patient");
  if (/action=staff/.test(text)) specific.push("staff", "link");
  if (/follow|light/.test(text)) specific.push("follow", "light");
  return [...new Set([...(groupKeywords[group] || []), ...specific, ...tags])];
}

async function loadFallbackApps() {
  const response = await fetch(`apps.json?cache=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`apps.json returned ${response.status}`);
  const apps = await response.json();
  if (!Array.isArray(apps)) throw new Error("apps.json must be an array");
  return apps;
}

async function tryLoadConfiguredApps() {
  try {
    const endpoint = window.CLINIC_PORTAL_CONFIG?.appsScriptEndpoint?.trim();
    if (!endpoint) return [];
    const payload = await loadAppsScriptPayload(endpoint);
    if (!payload.ok || !Array.isArray(payload.apps)) throw new Error(payload.error || "Apps Script response is invalid");
    localStorage.setItem(GAS_APPS_CACHE_KEY, JSON.stringify(payload.apps));
    return payload.apps;
  } catch (error) {
    console.warn("Apps Scriptから読み込めなかったためキャッシュまたはapps.jsonを使用します。", error);
    return [];
  }
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
  if (new URLSearchParams(window.location.search).get("draft") !== "1") return null;
  try {
    const apps = JSON.parse(localStorage.getItem("clinicPortalAppsDraftV2") || "[]");
    return Array.isArray(apps) ? apps : null;
  } catch {
    return null;
  }
}

function getProfileFromUrl() {
  const value = new URLSearchParams(window.location.search).get("profile")?.trim().toLowerCase();
  return value === "staff" || value === "reception" ? "staff" : "doctor";
}

function renderProfileLabel() {
  profileLabel.textContent = state.profile === "staff" ? "スタッフ用トップページ" : "医師用トップページ（全サイト）";
}

function getProfileApps() {
  if (state.profile === "doctor") return state.apps;
  return state.apps.filter((app) => app.staffVisible);
}

function getGroups() {
  const present = [...new Set(getProfileApps().map((app) => app.group || "その他"))];
  return present.sort((a, b) => {
    const ai = GROUP_ORDER.indexOf(a);
    const bi = GROUP_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b, "ja");
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

function renderGroupNav() {
  const apps = getProfileApps();
  groupNav.replaceChildren();
  groupNav.append(createGroupButton("all", "すべて", apps.length));
  getGroups().forEach((group) => {
    groupNav.append(createGroupButton(group, group, apps.filter((app) => app.group === group).length));
  });
}

function createGroupButton(value, label, count) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.group = value;
  button.className = "group-nav-button";
  button.classList.toggle("is-active", state.activeGroup === value);
  button.setAttribute("aria-pressed", String(state.activeGroup === value));
  const text = document.createElement("span");
  text.textContent = label;
  const badge = document.createElement("span");
  badge.className = "group-count";
  badge.textContent = String(count);
  button.append(text, badge);
  return button;
}

function renderApps() {
  const apps = getFilteredApps();
  appSections.replaceChildren();
  const groups = state.activeGroup === "all" ? getGroups() : [state.activeGroup];
  groups.forEach((group) => {
    const groupApps = apps.filter((app) => app.group === group);
    if (groupApps.length === 0) return;
    const section = document.createElement("section");
    section.className = "app-group-section";
    const heading = document.createElement("div");
    heading.className = "app-group-heading";
    const title = document.createElement("h2");
    title.textContent = group;
    const count = document.createElement("span");
    count.textContent = `${groupApps.length}件`;
    heading.append(title, count);
    const grid = document.createElement("div");
    grid.className = "app-grid";
    groupApps.forEach((app) => grid.append(createAppCard(app)));
    section.append(heading, grid);
    appSections.append(section);
  });
  const queryLabel = state.query.trim() ? `「${state.query.trim()}」` : "すべて";
  resultSummary.textContent = `${queryLabel}: ${apps.length}件`;
  emptyState.hidden = apps.length > 0;
}

function createAppCard(app) {
  const card = template.content.firstElementChild.cloneNode(true);
  const title = card.querySelector("h2");
  const link = card.querySelector(".launch-button");
  card.querySelector(".group-badge").textContent = app.group || "その他";
  card.querySelector(".purpose-badge").textContent = app.purpose || "その他";
  card.querySelector(".staff-badge").hidden = !app.staffVisible || state.profile === "staff";
  title.textContent = app.name || "名称未設定";
  card.querySelector(".description").textContent = app.description || "説明は未設定です。";
  link.href = app.url || "#";
  link.setAttribute("aria-label", `${title.textContent}を開く`);
  if (!app.url) {
    link.removeAttribute("href");
    link.textContent = "URL未設定";
    link.setAttribute("aria-disabled", "true");
  }
  return card;
}

function getFilteredApps() {
  const tokens = normalizeText(state.query).split(/\s+/).filter(Boolean);
  return getProfileApps().filter((app) => {
    if (state.activeGroup !== "all" && app.group !== state.activeGroup) return false;
    const searchable = normalizeText([
      app.name,
      app.description,
      app.group,
      app.purpose,
      ...normalizeList(app.keywords),
      ...(Array.isArray(app.tags) ? app.tags : []),
    ].join(" "));
    return tokens.every((token) => searchable.includes(token));
  });
}

function normalizeText(value) {
  return String(value || "").normalize("NFKC").toLocaleLowerCase("ja-JP");
}

function updateSearch() {
  state.query = searchInput.value;
  renderApps();
}

groupNav.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-group]");
  if (!button) return;
  state.activeGroup = button.dataset.group;
  renderGroupNav();
  renderApps();
});

searchInput.addEventListener("compositionstart", () => { state.composing = true; });
searchInput.addEventListener("compositionend", () => {
  state.composing = false;
  updateSearch();
});
searchInput.addEventListener("input", () => {
  if (!state.composing) updateSearch();
});
searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    searchInput.value = "";
    updateSearch();
  }
});

loadApps();
