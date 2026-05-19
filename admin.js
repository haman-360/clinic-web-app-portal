const STORAGE_KEY = "clinicPortalAppsDraft";
const GAS_ENDPOINT_KEY = "clinicPortalGasEndpoint";
const GAS_TOKEN_KEY = "clinicPortalGasToken";

const state = {
  apps: [],
};

const adminList = document.querySelector("#adminList");
const appForm = document.querySelector("#appForm");
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
  render();
}

async function loadAppsFromGas() {
  const endpoint = gasEndpointInput.value.trim();
  if (!endpoint) {
    throw new Error("ウェブアプリURLを入力してください。");
  }

  const payload = await loadAppsScriptPayload(endpoint);
  if (!payload.ok || !Array.isArray(payload.apps)) {
    throw new Error(payload.error || "GASの応答形式が正しくありません。");
  }

  state.apps = payload.apps;
  render();
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

  const editIndex = Number(editIndexInput.value);
  const isEditing = Number.isInteger(editIndex) && editIndex >= 0 && editIndex < state.apps.length;

  if (isEditing) {
    state.apps[editIndex] = app;
  } else {
    state.apps.push(app);
  }

  resetFormMode();
  render();
  setStatus(isEditing ? "リンクを更新しました。" : "リンクを追加しました。");
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
    saveGasSettings();
    await loadAppsFromGas();
    setStatus("GASから読み込みました。");
  } catch (error) {
    console.error(error);
    setStatus(error.message);
  }
});

saveToGasButton.addEventListener("click", async () => {
  try {
    saveGasSettings();
    await saveAppsToGas();
    setStatus("GASへ保存リクエストを送信しました。反映を確認しています...");
    await wait(1500);
    await loadAppsFromGas();
    setStatus(`GASへ保存し、${state.apps.length}件を確認しました。`);
  } catch (error) {
    console.error(error);
    setStatus(error.message);
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
