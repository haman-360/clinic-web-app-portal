const STORAGE_KEY = "clinicPortalAppsDraft";
const GAS_ENDPOINT_KEY = "clinicPortalGasEndpoint";
const GAS_TOKEN_KEY = "clinicPortalGasToken";

const state = {
  apps: [],
};

const adminList = document.querySelector("#adminList");
const addAppTitle = document.querySelector("#addAppTitle");
const appForm = document.querySelector("#appForm");
const appFormHelp = document.querySelector("#appFormHelp");
const cancelEditButton = document.querySelector("#cancelEditButton");
const categoryInput = document.querySelector("#categoryInput");
const copyButton = document.querySelector("#copyButton");
const descriptionInput = document.querySelector("#descriptionInput");
const downloadButton = document.querySelector("#downloadButton");
const editIndexInput = document.querySelector("#editIndexInput");
const gasEndpointInput = document.querySelector("#gasEndpointInput");
const gasTokenInput = document.querySelector("#gasTokenInput");
const jsonOutput = document.querySelector("#jsonOutput");
const loadFromGasButton = document.querySelector("#loadFromGasButton");
const nameInput = document.querySelector("#nameInput");
const previewButton = document.querySelector("#previewButton");
const resetDraftButton = document.querySelector("#resetDraftButton");
const saveGasSettingsButton = document.querySelector("#saveGasSettingsButton");
const saveToGasButton = document.querySelector("#saveToGasButton");
const statusText = document.querySelector("#adminStatus");
const submitButton = document.querySelector("#submitButton");
const urlInput = document.querySelector("#urlInput");

async function loadApps() {
  try {
    loadGasSettings();

    const savedDraft = localStorage.getItem(STORAGE_KEY);
    if (savedDraft) {
      state.apps = JSON.parse(savedDraft);
      render();
      setStatus("保存済みの下書きを読み込みました。");
      return;
    }

    const response = await fetch("apps.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`apps.json returned ${response.status}`);
    }

    state.apps = await response.json();
    render();
  } catch (error) {
    console.error(error);
    state.apps = [];
    render();
    setStatus("apps.json を読み込めませんでした。");
  }
}

function loadGasSettings() {
  gasEndpointInput.value =
    localStorage.getItem(GAS_ENDPOINT_KEY) ||
    window.CLINIC_PORTAL_CONFIG?.appsScriptEndpoint ||
    "";
  gasTokenInput.value = localStorage.getItem(GAS_TOKEN_KEY) || "";
}

function saveGasSettings() {
  localStorage.setItem(GAS_ENDPOINT_KEY, gasEndpointInput.value.trim());
  localStorage.setItem(GAS_TOKEN_KEY, gasTokenInput.value);
}

async function loadAppsFromJson() {
  const response = await fetch("apps.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`apps.json returned ${response.status}`);
  }

  state.apps = await response.json();
  resetFormMode();
  render();
}

async function loadAppsFromGas() {
  state.apps = await fetchAppsFromGas();
  resetFormMode();
  render();
}

async function fetchAppsFromGas() {
  const endpoint = gasEndpointInput.value.trim();
  if (!endpoint) {
    throw new Error("ウェブアプリURLを入力してください。");
  }

  const payload = await loadAppsScriptPayload(endpoint);
  if (!payload.ok || !Array.isArray(payload.apps)) {
    throw new Error(payload.error || "GASの応答形式が正しくありません。");
  }

  return payload.apps;
}

async function saveAppsToGas() {
  const endpoint = gasEndpointInput.value.trim();
  const token = gasTokenInput.value;
  if (!endpoint || !token) {
    throw new Error("ウェブアプリURLと管理用トークンを入力してください。");
  }

  await fetch(endpoint, {
    method: "POST",
    mode: "no-cors",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify({ token, apps: state.apps }),
  });
}

function wait(milliseconds) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

async function confirmSavedApps(expectedApps) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await wait(attempt === 0 ? 1500 : 2000);
    const savedApps = await fetchAppsFromGas();
    if (isExpectedSaveResult(savedApps, expectedApps)) {
      return savedApps;
    }
  }

  return null;
}

function isExpectedSaveResult(savedApps, expectedApps) {
  if (savedApps.length !== expectedApps.length) {
    return false;
  }

  return savedApps.every((savedApp, index) => {
    const expectedApp = expectedApps[index];
    return JSON.stringify(normalizeApp(savedApp)) === JSON.stringify(normalizeApp(expectedApp));
  });
}

function normalizeApp(app) {
  return {
    name: app.name || "",
    description: app.description || "",
    category: app.category || "その他",
    url: app.url || "",
    profiles: Array.isArray(app.profiles) ? app.profiles : [],
    visible: app.visible !== false,
  };
}

function loadAppsScriptPayload(endpoint) {
  return new Promise((resolve, reject) => {
    const callbackName = `clinicPortalAdminCallback${Date.now()}`;
    const script = document.createElement("script");
    const timeoutId = window.setTimeout(() => {
      delete window[callbackName];
      script.remove();
      reject(new Error("GASの応答がタイムアウトしました。"));
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
      reject(new Error("GASを読み込めませんでした。"));
    };

    script.src = url.toString();
    document.body.append(script);
  });
}

function render() {
  adminList.replaceChildren();

  state.apps.forEach((app, index) => {
    const item = document.createElement("article");
    item.className = "admin-list-item";

    const details = document.createElement("div");
    details.className = "admin-list-details";

    const title = document.createElement("h3");
    title.textContent = app.name || "名称未設定";

    const meta = document.createElement("p");
    meta.textContent = `${app.category || "その他"} / ${(app.profiles || []).join(", ") || "共通のみ"}`;

    const url = document.createElement("p");
    url.className = "admin-url";
    url.textContent = app.url || "URL未設定";

    details.append(title, meta, url);

    const actions = document.createElement("div");
    actions.className = "admin-item-actions";

    const upButton = createActionButton("上へ", () => moveApp(index, -1), "move-up");
    upButton.disabled = index === 0;

    const downButton = createActionButton("下へ", () => moveApp(index, 1), "move-down");
    downButton.disabled = index === state.apps.length - 1;

    const editButton = createActionButton("編集", () => editApp(index), "edit");

    const deleteButton = createActionButton("削除", () => deleteApp(index), "delete");
    deleteButton.classList.add("danger-button");

    actions.append(upButton, downButton, editButton, deleteButton);
    item.append(details, actions);
    adminList.append(item);
  });

  jsonOutput.value = JSON.stringify(state.apps, null, 2);
  localStorage.setItem(STORAGE_KEY, jsonOutput.value);
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

function setSelectedProfiles(profiles) {
  appForm.querySelectorAll("input[name='profiles']").forEach((input) => {
    input.checked = profiles.includes(input.value);
  });
}

function resetFormMode() {
  appForm.reset();
  editIndexInput.value = "";
  categoryInput.value = "医師用";
  addAppTitle.textContent = "URL登録";
  appFormHelp.textContent = "URLを貼り付けて、表示名と対象トップページを選びます。";
  submitButton.textContent = "追加";
  cancelEditButton.hidden = true;
}

function moveApp(index, direction) {
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= state.apps.length) return;

  const [app] = state.apps.splice(index, 1);
  state.apps.splice(nextIndex, 0, app);
  render();
  setStatus("並び順を更新しました。");
}

function editApp(index) {
  const app = state.apps[index];
  editIndexInput.value = String(index);
  urlInput.value = app.url || "";
  nameInput.value = app.name || "";
  descriptionInput.value = app.description || "";
  categoryInput.value = app.category || "その他";
  setSelectedProfiles(Array.isArray(app.profiles) ? app.profiles : []);
  addAppTitle.textContent = "リンク編集中";
  appFormHelp.textContent = "既存リンクを修正しています。新しく追加したい場合は「編集をキャンセル」を押してください。";
  submitButton.textContent = "更新";
  cancelEditButton.hidden = false;
  urlInput.focus();
  setStatus("選択したリンクを編集中です。");
}

function deleteApp(index) {
  state.apps.splice(index, 1);
  resetFormMode();
  render();
  setStatus("リンクを削除しました。");
}

function getSelectedProfiles() {
  return [...appForm.querySelectorAll("input[name='profiles']:checked")].map((input) => input.value);
}

function getNameFromUrl(value) {
  try {
    const url = new URL(value);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function setStatus(message) {
  statusText.textContent = message;
}

function setButtonLoading(button, isLoading, loadingText) {
  if (isLoading) {
    button.dataset.defaultText = button.textContent;
    button.textContent = loadingText;
    button.disabled = true;
    return;
  }

  button.textContent = button.dataset.defaultText || button.textContent;
  button.disabled = false;
  delete button.dataset.defaultText;
}

urlInput.addEventListener("paste", () => {
  window.setTimeout(() => {
    if (!nameInput.value.trim()) {
      nameInput.value = getNameFromUrl(urlInput.value.trim());
    }
  });
});

urlInput.addEventListener("input", () => {
  if (!nameInput.value.trim()) {
    nameInput.value = getNameFromUrl(urlInput.value.trim());
  }
});

appForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const profiles = getSelectedProfiles();
  if (profiles.length === 0) {
    setStatus("表示するトップページを1つ以上選んでください。");
    return;
  }

  const app = {
    name: nameInput.value.trim(),
    description: descriptionInput.value.trim() || "説明は未設定です。",
    category: categoryInput.value,
    url: urlInput.value.trim(),
    profiles,
    visible: true,
  };

  const isEditMode = editIndexInput.value !== "";
  const editIndex = Number(editIndexInput.value);
  const isEditing = isEditMode && Number.isInteger(editIndex) && editIndex >= 0 && editIndex < state.apps.length;

  if (isEditing) {
    state.apps[editIndex] = app;
  } else {
    state.apps.push(app);
  }

  resetFormMode();
  render();
  setStatus(isEditing ? "リンクを更新しました。反映するには「GASへ保存」を押してください。" : "リンクを追加しました。反映するには「GASへ保存」を押してください。");
});

cancelEditButton.addEventListener("click", () => {
  resetFormMode();
  setStatus("編集をキャンセルしました。");
});

saveGasSettingsButton.addEventListener("click", () => {
  saveGasSettings();
  setStatus("GAS接続設定を保存しました。");
});

loadFromGasButton.addEventListener("click", async () => {
  try {
    setButtonLoading(loadFromGasButton, true, "読み込み中...");
    saveGasSettings();
    setStatus("GASから読み込んでいます...");
    await loadAppsFromGas();
    setStatus("GASから読み込みました。");
  } catch (error) {
    console.error(error);
    setStatus(error.message);
  } finally {
    setButtonLoading(loadFromGasButton, false);
  }
});

saveToGasButton.addEventListener("click", async () => {
  try {
    setButtonLoading(saveToGasButton, true, "保存中...");
    saveGasSettings();
    const submittedApps = JSON.parse(JSON.stringify(state.apps));
    await saveAppsToGas();
    setStatus("GASへ保存リクエストを送信しました。反映を確認しています...");
    const savedApps = await confirmSavedApps(submittedApps);

    if (!savedApps) {
      state.apps = submittedApps;
      render();
      setStatus("GASの反映確認がまだ取れません。下書きは保持しています。少し待ってから「GASへ保存」をもう一度押してください。");
      return;
    }

    state.apps = savedApps;
    render();
    setStatus(`GASへ保存し、${state.apps.length}件を確認しました。`);
  } catch (error) {
    console.error(error);
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
  link.download = "apps.json";
  link.click();
  URL.revokeObjectURL(link.href);
  setStatus("apps.json をダウンロードしました。");
});

resetDraftButton.addEventListener("click", async () => {
  localStorage.removeItem(STORAGE_KEY);
  await loadAppsFromJson();
  setStatus("下書きを破棄して apps.json を読み直しました。");
});

previewButton.addEventListener("click", () => {
  window.open("index.html?draft=1", "_blank", "noopener");
});

loadApps();
