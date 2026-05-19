const STORAGE_KEY = "clinicPortalAppsDraft";

const state = {
  apps: [],
};

const adminList = document.querySelector("#adminList");
const appForm = document.querySelector("#appForm");
const categoryInput = document.querySelector("#categoryInput");
const copyButton = document.querySelector("#copyButton");
const descriptionInput = document.querySelector("#descriptionInput");
const downloadButton = document.querySelector("#downloadButton");
const jsonOutput = document.querySelector("#jsonOutput");
const nameInput = document.querySelector("#nameInput");
const previewButton = document.querySelector("#previewButton");
const resetDraftButton = document.querySelector("#resetDraftButton");
const statusText = document.querySelector("#adminStatus");
const urlInput = document.querySelector("#urlInput");

async function loadApps() {
  try {
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

async function loadAppsFromJson() {
  const response = await fetch("apps.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`apps.json returned ${response.status}`);
  }

  state.apps = await response.json();
  render();
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

    const upButton = createActionButton("上へ", () => moveApp(index, -1));
    upButton.disabled = index === 0;

    const downButton = createActionButton("下へ", () => moveApp(index, 1));
    downButton.disabled = index === state.apps.length - 1;

    const deleteButton = createActionButton("削除", () => deleteApp(index));
    deleteButton.classList.add("danger-button");

    actions.append(upButton, downButton, deleteButton);
    item.append(details, actions);
    adminList.append(item);
  });

  jsonOutput.value = JSON.stringify(state.apps, null, 2);
  localStorage.setItem(STORAGE_KEY, jsonOutput.value);
}

function createActionButton(label, onClick) {
  const button = document.createElement("button");
  button.className = "secondary-button compact-button";
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function moveApp(index, direction) {
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= state.apps.length) return;

  const [app] = state.apps.splice(index, 1);
  state.apps.splice(nextIndex, 0, app);
  render();
  setStatus("並び順を更新しました。");
}

function deleteApp(index) {
  state.apps.splice(index, 1);
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

  state.apps.push({
    name: nameInput.value.trim(),
    description: descriptionInput.value.trim() || "説明は未設定です。",
    category: categoryInput.value,
    url: urlInput.value.trim(),
    profiles,
    visible: true,
  });

  appForm.reset();
  categoryInput.value = "医師用";
  render();
  setStatus("リンクを追加しました。");
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
