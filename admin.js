const STORAGE_KEY = "clinicPortalAppsDraftV2";
const GAS_ENDPOINT_KEY = "clinicPortalGasEndpoint";
const GAS_TOKEN_KEY = "clinicPortalGasToken";
const DEFAULT_GROUPS = ["喘息", "便秘", "アトピー", "アレルギー性鼻炎", "ワクチン", "夜尿症", "小児肥満", "院内業務", "その他"];

const state = {
  apps: [],
  baselineApps: [],
  serverRevision: "",
  lastGasLoadSucceeded: false,
  listMode: "active",
  savedDraft: null,
};

const $ = (selector) => document.querySelector(selector);
const adminList = $("#adminList");
const addAppTitle = $("#addAppTitle");
const appForm = $("#appForm");
const appFormHelp = $("#appFormHelp");
const cancelEditButton = $("#cancelEditButton");
const copyButton = $("#copyButton");
const descriptionInput = $("#descriptionInput");
const downloadButton = $("#downloadButton");
const editIndexInput = $("#editIndexInput");
const gasEndpointInput = $("#gasEndpointInput");
const gasTokenInput = $("#gasTokenInput");
const groupInput = $("#groupInput");
const groupSuggestions = $("#groupSuggestions");
const importInput = $("#importInput");
const jsonOutput = $("#jsonOutput");
const keywordsInput = $("#keywordsInput");
const loadFromGasButton = $("#loadFromGasButton");
const nameInput = $("#nameInput");
const previewButton = $("#previewButton");
const purposeInput = $("#purposeInput");
const resetDraftButton = $("#resetDraftButton");
const restoreDraftButton = $("#restoreDraftButton");
const saveGasSettingsButton = $("#saveGasSettingsButton");
const saveToGasButton = $("#saveToGasButton");
const showActiveButton = $("#showActiveButton");
const showTrashButton = $("#showTrashButton");
const staffVisibleInput = $("#staffVisibleInput");
const statusText = $("#adminStatus");
const submitButton = $("#submitButton");
const urlInput = $("#urlInput");

async function loadApps() {
  loadGasSettings();
  state.savedDraft = readDraft();
  if (gasEndpointInput.value.trim()) {
    try {
      setStatus("本番データを読み込んでいます...");
      await loadAppsFromGas();
      const hasDifferentDraft = state.savedDraft && !appsEqual(state.savedDraft, state.apps);
      restoreDraftButton.hidden = !hasDifferentDraft;
      setStatus(hasDifferentDraft
        ? `本番${activeCount(state.apps)}件を読み込みました。未反映の下書きも残っています。`
        : `本番${activeCount(state.apps)}件を安全に読み込みました。`);
      return;
    } catch (error) {
      console.warn(error);
      setStatus(`本番を読み込めませんでした。保存は無効です: ${error.message}`);
      if (state.apps.length > 0) {
        render(false);
        return;
      }
    }
  }

  if (state.savedDraft) {
    state.apps = state.savedDraft.map(normalizeApp);
    render(false);
    return;
  }
  try {
    const response = await fetch("apps.json", { cache: "no-store" });
    state.apps = (await response.json()).map(normalizeApp);
  } catch {
    state.apps = [];
  }
  render(false);
}

function loadGasSettings() {
  gasEndpointInput.value = localStorage.getItem(GAS_ENDPOINT_KEY) || window.CLINIC_PORTAL_CONFIG?.appsScriptEndpoint || "";
  gasTokenInput.value = localStorage.getItem(GAS_TOKEN_KEY) || "";
}

function saveGasSettings() {
  localStorage.setItem(GAS_ENDPOINT_KEY, gasEndpointInput.value.trim());
  localStorage.setItem(GAS_TOKEN_KEY, gasTokenInput.value);
}

function readDraft() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return Array.isArray(value) ? value.map(normalizeApp) : null;
  } catch {
    return null;
  }
}

function persistDraft() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.apps));
}

async function loadAppsFromGas() {
  const payload = await fetchAppsFromGas();
  state.apps = payload.apps.map(normalizeApp);
  state.baselineApps = clone(state.apps);
  state.serverRevision = payload.revision || "";
  state.lastGasLoadSucceeded = Boolean(payload.revision);
  saveToGasButton.disabled = !state.lastGasLoadSucceeded;
  resetFormMode();
  render(false);
  if (!payload.revision) {
    throw new Error("GASが旧バージョンです。バックアップ対応のCode.gsを先にデプロイしてください。");
  }
  return state.apps;
}

async function fetchAppsFromGas() {
  const endpoint = gasEndpointInput.value.trim();
  if (!endpoint) throw new Error("ウェブアプリURLを入力してください。");
  const payload = await loadAppsScriptPayload(endpoint);
  if (!payload.ok || !Array.isArray(payload.apps)) throw new Error(payload.error || "GASの応答形式が正しくありません。");
  return payload;
}

function loadAppsScriptPayload(endpoint) {
  return new Promise((resolve, reject) => {
    const callbackName = `clinicPortalAdminCallback${Date.now()}`;
    const script = document.createElement("script");
    const timeoutId = window.setTimeout(() => {
      delete window[callbackName];
      script.remove();
      reject(new Error("GASの応答がタイムアウトしました。"));
    }, 10000);
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
      reject(new Error("GASを読み込めませんでした。"));
    };
    script.src = url.toString();
    document.body.append(script);
  });
}

function normalizeApp(app) {
  const profiles = Array.isArray(app.profiles) ? app.profiles : [];
  const tags = Array.isArray(app.tags) ? app.tags : [];
  const firstTag = tags[0] || "";
  const mappedGroup = { AR: "アレルギー性鼻炎", enuresis: "夜尿症", obesity: "小児肥満" }[firstTag];
  const group = app.group || mappedGroup || firstTag || (["医師用", "受付用", "管理用", "看護師用"].includes(app.category) ? "院内業務" : app.category) || "その他";
  return {
    name: app.name || "",
    description: app.description || "",
    group,
    purpose: app.purpose || inferPurpose(app),
    url: app.url || "",
    staffVisible: typeof app.staffVisible === "boolean" ? app.staffVisible : profiles.includes("reception") || profiles.includes("staff"),
    keywords: normalizeList(app.keywords).length ? normalizeList(app.keywords) : legacyKeywords(group, tags, app.name, app.url),
    visible: app.visible !== false,
  };
}

function inferPurpose(app) {
  const text = `${app.name || ""} ${app.description || ""} ${app.url || ""}`.toLowerCase();
  if (/action=staff|reception|\bqr\b|受付/.test(text)) return "受付";
  if (/action=form|患者用|患者問診|初診問診/.test(text)) return "患者入口";
  if (/spreadsheet|spredsheet|dashboard|履歴|データ|確認|action=doctor/.test(text)) return "データ確認";
  if (/売上|パスワード|pin/.test(text)) return "院内業務";
  return "診察";
}

function legacyKeywords(group, tags, name = "", url = "") {
  const groupKeywords = {
    "喘息": ["asthma"], "便秘": ["constipation"], "アトピー": ["atopic", "atopy"],
    "アレルギー性鼻炎": ["allergic rhinitis", "rhinitis", "AR", "SLIT"],
    "ワクチン": ["vaccine", "vaccination"], "夜尿症": ["enuresis"], "小児肥満": ["obesity"],
  };
  const text = `${name} ${url}`.toLowerCase();
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

function normalizeList(value) {
  const list = Array.isArray(value) ? value : String(value || "").split(/[,、\n]/);
  return [...new Set(list.map((item) => String(item).trim()).filter(Boolean))];
}

function render(saveDraft = true) {
  adminList.replaceChildren();
  const filtered = state.apps.map((app, index) => ({ app, index })).filter(({ app }) => state.listMode === "active" ? app.visible !== false : app.visible === false);
  filtered.forEach(({ app, index }, position) => adminList.append(createAdminItem(app, index, position, filtered.length)));
  if (filtered.length === 0) {
    const empty = document.createElement("p");
    empty.className = "admin-empty";
    empty.textContent = state.listMode === "active" ? "使用中のリンクはありません。" : "ゴミ箱は空です。";
    adminList.append(empty);
  }
  jsonOutput.value = JSON.stringify(state.apps, null, 2);
  updateGroupSuggestions();
  updateListModeButtons();
  if (saveDraft) persistDraft();
}

function createAdminItem(app, index, position, count) {
  const item = document.createElement("article");
  item.className = "admin-list-item";
  const details = document.createElement("div");
  details.className = "admin-list-details";
  const title = document.createElement("h3");
  title.textContent = app.name || "名称未設定";
  const meta = document.createElement("p");
  meta.textContent = `${app.group} / ${app.purpose} / ${app.staffVisible ? "医師・スタッフ" : "医師のみ"} / 検索: ${app.keywords.join(", ") || "なし"}`;
  const url = document.createElement("p");
  url.className = "admin-url";
  url.textContent = app.url || "URL未設定";
  details.append(title, meta, url);
  const actions = document.createElement("div");
  actions.className = "admin-item-actions";
  if (state.listMode === "active") {
    const up = createActionButton("上へ", () => moveVisibleApp(position, -1), "move-up");
    up.disabled = position === 0;
    const down = createActionButton("下へ", () => moveVisibleApp(position, 1), "move-down");
    down.disabled = position === count - 1;
    actions.append(up, down, createActionButton("編集", () => editApp(index), "edit"));
    const trash = createActionButton("ゴミ箱へ", () => trashApp(index), "delete");
    trash.classList.add("danger-button");
    actions.append(trash);
  } else {
    actions.append(createActionButton("復元", () => restoreApp(index), "restore"));
  }
  item.append(details, actions);
  return item;
}

function createActionButton(label, onClick, action) {
  const button = document.createElement("button");
  button.className = "secondary-button compact-button";
  button.type = "button";
  button.dataset.action = action;
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function updateGroupSuggestions() {
  groupSuggestions.replaceChildren();
  [...new Set([...DEFAULT_GROUPS, ...state.apps.map((app) => app.group)])].forEach((group) => {
    const option = document.createElement("option");
    option.value = group;
    groupSuggestions.append(option);
  });
}

function updateListModeButtons() {
  showActiveButton.classList.toggle("is-active", state.listMode === "active");
  showTrashButton.classList.toggle("is-active", state.listMode === "trash");
  showTrashButton.textContent = `ゴミ箱 (${state.apps.filter((app) => app.visible === false).length})`;
}

function resetFormMode() {
  appForm.reset();
  editIndexInput.value = "";
  groupInput.value = "";
  purposeInput.value = "診察";
  addAppTitle.textContent = "URL登録";
  appFormHelp.textContent = "日本語の表示名と、英語・略語の検索キーワードを登録します。";
  submitButton.textContent = "追加";
  cancelEditButton.hidden = true;
}

function moveVisibleApp(position, direction) {
  const indices = state.apps.map((app, index) => app.visible !== false ? index : -1).filter((index) => index >= 0);
  const from = indices[position];
  const to = indices[position + direction];
  if (from === undefined || to === undefined) return;
  [state.apps[from], state.apps[to]] = [state.apps[to], state.apps[from]];
  render();
  setStatus("並び順を更新しました。まだ本番には保存されていません。");
}

function editApp(index) {
  const app = state.apps[index];
  editIndexInput.value = String(index);
  urlInput.value = app.url;
  nameInput.value = app.name;
  descriptionInput.value = app.description;
  groupInput.value = app.group;
  purposeInput.value = app.purpose;
  keywordsInput.value = app.keywords.join(", ");
  staffVisibleInput.checked = app.staffVisible;
  addAppTitle.textContent = "リンク編集中";
  appFormHelp.textContent = "変更後、「更新」と「差分を確認して保存」の両方が必要です。";
  submitButton.textContent = "更新";
  cancelEditButton.hidden = false;
  urlInput.focus();
}

function trashApp(index) {
  state.apps[index].visible = false;
  resetFormMode();
  render();
  setStatus("ゴミ箱へ移動しました。ゴミ箱から復元できます。まだ本番には保存されていません。");
}

function restoreApp(index) {
  state.apps[index].visible = true;
  render();
  setStatus("リンクを復元しました。まだ本番には保存されていません。");
}

function getDiff() {
  const before = new Map(state.baselineApps.map((app) => [app.url || app.name, app]));
  const after = new Map(state.apps.map((app) => [app.url || app.name, app]));
  let added = 0;
  let changed = 0;
  let deleted = 0;
  after.forEach((app, key) => {
    if (!before.has(key)) added += 1;
    else if (JSON.stringify(app) !== JSON.stringify(before.get(key))) changed += 1;
  });
  before.forEach((app, key) => {
    const next = after.get(key);
    if (app.visible !== false && (!next || next.visible === false)) deleted += 1;
  });
  return { added, changed, deleted, before: activeCount(state.baselineApps), after: activeCount(state.apps) };
}

async function saveAppsToGas() {
  if (!state.lastGasLoadSucceeded) throw new Error("先に本番データの読み込みを成功させてください。");
  const endpoint = gasEndpointInput.value.trim();
  const token = gasTokenInput.value;
  if (!endpoint || !token) throw new Error("ウェブアプリURLと管理用トークンを入力してください。");
  const diff = getDiff();
  const message = `本番との差分\n\n追加: ${diff.added}件\n変更: ${diff.changed}件\nゴミ箱へ: ${diff.deleted}件\n使用中: ${diff.before}件 → ${diff.after}件\n\n保存前の本番データは自動バックアップされます。保存しますか？`;
  if (!window.confirm(message)) throw new Error("保存をキャンセルしました。");
  const risky = diff.deleted >= 5 || (diff.before > 0 && diff.after < diff.before * 0.8);
  if (risky && window.prompt("リンクが大幅に減ります。続行するには「保存」と入力してください。") !== "保存") {
    throw new Error("大幅削除を伴う保存を中止しました。");
  }
  await fetch(endpoint, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ token, apps: state.apps, baseRevision: state.serverRevision }),
  });
}

async function confirmSavedApps(expectedApps) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await wait(attempt === 0 ? 1500 : 2000);
    const payload = await fetchAppsFromGas();
    const apps = payload.apps.map(normalizeApp);
    if (appsEqual(apps, expectedApps)) return { apps, revision: payload.revision || "" };
  }
  return null;
}

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function appsEqual(a, b) {
  return JSON.stringify(a.map(normalizeApp)) === JSON.stringify(b.map(normalizeApp));
}

function activeCount(apps) {
  return apps.filter((app) => app.visible !== false).length;
}

function setStatus(message) {
  statusText.textContent = message;
}

function setButtonLoading(button, loading, text) {
  if (loading) {
    button.dataset.defaultText = button.textContent;
    button.textContent = text;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.defaultText || button.textContent;
    button.disabled = !state.lastGasLoadSucceeded && button === saveToGasButton;
    delete button.dataset.defaultText;
  }
}

urlInput.addEventListener("input", () => {
  if (!nameInput.value.trim()) {
    try { nameInput.value = new URL(urlInput.value).hostname.replace(/^www\./, ""); } catch { /* 入力途中 */ }
  }
});

appForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const app = normalizeApp({
    name: nameInput.value.trim(),
    description: descriptionInput.value.trim() || "説明は未設定です。",
    group: groupInput.value.trim(),
    purpose: purposeInput.value,
    url: urlInput.value.trim(),
    staffVisible: staffVisibleInput.checked,
    keywords: normalizeList(keywordsInput.value),
    visible: true,
  });
  const index = Number(editIndexInput.value);
  const editing = editIndexInput.value !== "" && Number.isInteger(index) && state.apps[index];
  if (editing) state.apps[index] = app;
  else state.apps.push(app);
  resetFormMode();
  render();
  setStatus(editing ? "リンクを更新しました。差分を確認して保存してください。" : "リンクを追加しました。差分を確認して保存してください。");
});

cancelEditButton.addEventListener("click", resetFormMode);
showActiveButton.addEventListener("click", () => { state.listMode = "active"; render(false); });
showTrashButton.addEventListener("click", () => { state.listMode = "trash"; render(false); });

saveGasSettingsButton.addEventListener("click", () => {
  saveGasSettings();
  state.lastGasLoadSucceeded = false;
  saveToGasButton.disabled = true;
  setStatus("接続設定を保存しました。「本番を再読み込み」で接続を確認してください。");
});

loadFromGasButton.addEventListener("click", async () => {
  try {
    setButtonLoading(loadFromGasButton, true, "読み込み中...");
    saveGasSettings();
    await loadAppsFromGas();
    restoreDraftButton.hidden = true;
    localStorage.removeItem(STORAGE_KEY);
    setStatus(`本番${activeCount(state.apps)}件を読み込みました。`);
  } catch (error) {
    state.lastGasLoadSucceeded = false;
    saveToGasButton.disabled = true;
    setStatus(error.message);
  } finally {
    setButtonLoading(loadFromGasButton, false);
  }
});

restoreDraftButton.addEventListener("click", () => {
  if (!state.savedDraft) return;
  state.apps = clone(state.savedDraft);
  restoreDraftButton.hidden = true;
  render();
  setStatus("未反映の下書きを復元しました。本番との差分を確認してから保存してください。");
});

saveToGasButton.addEventListener("click", async () => {
  try {
    setButtonLoading(saveToGasButton, true, "保存中...");
    saveGasSettings();
    const submitted = clone(state.apps);
    await saveAppsToGas();
    setStatus("保存リクエストを送信しました。反映を確認しています...");
    const saved = await confirmSavedApps(submitted);
    if (!saved) throw new Error("本番の反映を確認できませんでした。別画面で更新された可能性があります。本番を再読み込みしてください。下書きは保持しています。");
    state.apps = saved.apps;
    state.baselineApps = clone(saved.apps);
    state.serverRevision = saved.revision;
    localStorage.removeItem(STORAGE_KEY);
    render(false);
    setStatus(`本番へ保存し、使用中${activeCount(state.apps)}件を確認しました。保存前データはバックアップ済みです。`);
  } catch (error) {
    setStatus(error.message);
  } finally {
    setButtonLoading(saveToGasButton, false);
  }
});

copyButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(jsonOutput.value);
  setStatus("JSONをコピーしました。");
});

downloadButton.addEventListener("click", () => {
  const blob = new Blob([jsonOutput.value], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `clinic-portal-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  setStatus("現在の下書きをJSONで保存しました。");
});

importInput.addEventListener("change", async () => {
  try {
    const file = importInput.files?.[0];
    if (!file) return;
    const parsed = JSON.parse(await file.text());
    if (!Array.isArray(parsed)) throw new Error("JSONはリンク配列ではありません。");
    state.apps = parsed.map(normalizeApp);
    render();
    setStatus(`${activeCount(state.apps)}件をJSONから下書きへ復元しました。まだ本番には保存されていません。`);
  } catch (error) {
    setStatus(`復元できませんでした: ${error.message}`);
  } finally {
    importInput.value = "";
  }
});

resetDraftButton.addEventListener("click", () => {
  if (!state.lastGasLoadSucceeded) {
    setStatus("本番を読み込めていないため戻せません。");
    return;
  }
  state.apps = clone(state.baselineApps);
  localStorage.removeItem(STORAGE_KEY);
  resetFormMode();
  render(false);
  setStatus("下書きを破棄し、最後に読み込んだ本番の内容へ戻しました。");
});

previewButton.addEventListener("click", () => window.open("index.html?draft=1&profile=doctor", "_blank", "noopener"));

loadApps();
