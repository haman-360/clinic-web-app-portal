const SHEET_NAME = "apps";
const BACKUP_SHEET_NAME = "_portal_backups";
const HEADERS = ["name", "description", "category", "url", "profiles", "tags", "visible", "purpose", "keywords", "staffVisible"];
const BACKUP_HEADERS = ["savedAt", "revision", "activeCount", "appsJson"];
const MAX_BACKUP_ROWS = 100;
const ADMIN_TOKEN_KEY = "ADMIN_TOKEN";
const ADMIN_TOKEN_LEGACY_KEY = "ADMIN-TOKEN";
const BACKUP_FOLDER_ID_KEY = "BACKUP_FOLDER_ID";

function doGet(event) {
  try {
    const apps = readApps();
    return outputResponse({
      ok: true,
      apps: apps,
      revision: createRevision(apps),
      updatedAt: new Date().toISOString(),
    }, event);
  } catch (error) {
    return outputResponse({ ok: false, error: error.message }, event);
  }
}

function doPost(event) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const payload = JSON.parse(event.postData.contents || "{}");
    assertAdminToken(payload.token);
    if (!Array.isArray(payload.apps)) throw new Error("apps must be an array");

    const currentApps = readApps();
    const currentRevision = createRevision(currentApps);
    if (payload.baseRevision && payload.baseRevision !== currentRevision) {
      throw new Error("本番データが別の画面で更新されています。再読み込みしてから保存してください。");
    }

    backupApps(currentApps, currentRevision);
    writeApps(payload.apps);
    const savedApps = readApps();
    return jsonResponse({
      ok: true,
      count: savedApps.length,
      revision: createRevision(savedApps),
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message });
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function setupPortalSheet() {
  ensureHeaders(getAppsSheet());
  getBackupSheet();
}

function setAdminToken(token) {
  const properties = PropertiesService.getScriptProperties();
  if (!token) {
    const existingToken = properties.getProperty(ADMIN_TOKEN_KEY) || properties.getProperty(ADMIN_TOKEN_LEGACY_KEY);
    if (existingToken) return "ADMIN_TOKEN is already set in Script Properties.";
    throw new Error('token is required. Set ADMIN_TOKEN in Script Properties, or call setAdminToken("your-token") from another function.');
  }
  properties.setProperty(ADMIN_TOKEN_KEY, token);
  return "ADMIN_TOKEN was saved.";
}

function checkAdminTokenSetting() {
  const properties = PropertiesService.getScriptProperties();
  const existingToken = properties.getProperty(ADMIN_TOKEN_KEY) || properties.getProperty(ADMIN_TOKEN_LEGACY_KEY);
  if (!existingToken) throw new Error("ADMIN_TOKEN is not set in Script Properties.");
  return "ADMIN_TOKEN is set.";
}

function readApps() {
  const sheet = getAppsSheet();
  ensureHeaders(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  return values
    .filter(function(row) { return row.some(function(value) { return value !== ""; }); })
    .map(function(row) {
      const profiles = splitList(row[4]);
      const tags = splitList(row[5]);
      const group = String(row[2] || inferLegacyGroup(tags));
      const staffVisible = row[9] === "" ? profiles.indexOf("reception") >= 0 || profiles.indexOf("staff") >= 0 : toBoolean(row[9]);
      const compatibilityProfiles = ["doctor", "admin"];
      if (staffVisible) compatibilityProfiles.push("reception");
      return {
        name: String(row[0] || ""),
        description: String(row[1] || ""),
        group: group,
        category: group,
        purpose: String(row[7] || inferLegacyPurpose(row[0], row[1], row[3])),
        url: String(row[3] || ""),
        staffVisible: staffVisible,
        profiles: compatibilityProfiles,
        keywords: splitList(row[8]).length ? splitList(row[8]) : createLegacyKeywords(group, tags, row[0], row[3]),
        tags: tags.length ? tags : [group],
        visible: row[6] === "" ? true : toBoolean(row[6]),
      };
    });
}

function writeApps(apps) {
  const sheet = getAppsSheet();
  ensureHeaders(sheet);
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).clearContent();
  }
  if (apps.length === 0) return;
  const rows = apps.map(function(app) {
    const group = app.group || app.category || "その他";
    const staffVisible = typeof app.staffVisible === "boolean"
      ? app.staffVisible
      : Array.isArray(app.profiles) && (app.profiles.indexOf("reception") >= 0 || app.profiles.indexOf("staff") >= 0);
    const profiles = staffVisible ? ["doctor", "reception"] : ["doctor"];
    return [
      app.name || "",
      app.description || "",
      group,
      app.url || "",
      profiles.join(","),
      "",
      app.visible !== false,
      app.purpose || inferLegacyPurpose(app.name, app.description, app.url),
      normalizeList(app.keywords).join(","),
      staffVisible,
    ];
  });
  sheet.getRange(2, 1, rows.length, HEADERS.length).setValues(rows);
}

function backupApps(apps, revision) {
  const backupSheet = getBackupSheet();
  backupSheet.appendRow([
    new Date(),
    revision || createRevision(apps),
    apps.filter(function(app) { return app.visible !== false; }).length,
    JSON.stringify(apps),
  ]);
  const dataRows = backupSheet.getLastRow() - 1;
  if (dataRows > MAX_BACKUP_ROWS) {
    backupSheet.deleteRows(2, dataRows - MAX_BACKUP_ROWS);
  }
}

function restoreBackup(backupRowNumber) {
  if (!Number.isInteger(backupRowNumber) || backupRowNumber < 2) {
    throw new Error("backupRowNumber must be a backup sheet row number (2 or greater).");
  }
  const backupSheet = getBackupSheet();
  const json = backupSheet.getRange(backupRowNumber, 4).getValue();
  if (!json) throw new Error("Backup row is empty.");
  const apps = JSON.parse(json);
  if (!Array.isArray(apps)) throw new Error("Backup data is invalid.");
  const current = readApps();
  backupApps(current, createRevision(current));
  writeApps(apps);
  return apps.length + " apps restored. The previous current data was backed up first.";
}

function createDailyDriveBackup() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const file = DriveApp.getFileById(spreadsheet.getId());
  const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd_HHmm");
  const name = "Clinic Portal Backup " + timestamp;
  const folderId = PropertiesService.getScriptProperties().getProperty(BACKUP_FOLDER_ID_KEY);
  return folderId ? file.makeCopy(name, DriveApp.getFolderById(folderId)).getUrl() : file.makeCopy(name).getUrl();
}

function setupDailyBackupTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === "createDailyDriveBackup") ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger("createDailyDriveBackup").timeBased().everyDays(1).atHour(2).create();
  return "Daily backup trigger was created.";
}

function setBackupFolderId(folderId) {
  if (!folderId) throw new Error("folderId is required.");
  PropertiesService.getScriptProperties().setProperty(BACKUP_FOLDER_ID_KEY, folderId);
  return "BACKUP_FOLDER_ID was saved.";
}

function createRevision(apps) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(apps), Utilities.Charset.UTF_8);
  return Utilities.base64EncodeWebSafe(digest).replace(/=+$/, "");
}

function assertAdminToken(token) {
  const properties = PropertiesService.getScriptProperties();
  const expectedToken = properties.getProperty(ADMIN_TOKEN_KEY) || properties.getProperty(ADMIN_TOKEN_LEGACY_KEY);
  if (!expectedToken) throw new Error("ADMIN_TOKEN is not set");
  if (token !== expectedToken) throw new Error("invalid token");
}

function getAppsSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  return spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.insertSheet(SHEET_NAME);
}

function getBackupSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(BACKUP_SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(BACKUP_SHEET_NAME);
  if (sheet.getMaxColumns() < BACKUP_HEADERS.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), BACKUP_HEADERS.length - sheet.getMaxColumns());
  }
  const current = sheet.getRange(1, 1, 1, BACKUP_HEADERS.length).getValues()[0];
  if (!BACKUP_HEADERS.every(function(header, index) { return current[index] === header; })) {
    sheet.getRange(1, 1, 1, BACKUP_HEADERS.length).setValues([BACKUP_HEADERS]);
  }
  sheet.setFrozenRows(1);
  if (!sheet.isSheetHidden()) sheet.hideSheet();
  return sheet;
}

function ensureHeaders(sheet) {
  if (sheet.getMaxColumns() < HEADERS.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), HEADERS.length - sheet.getMaxColumns());
  }
  let current = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  if (HEADERS.every(function(header, index) { return current[index] === header; })) {
    sheet.setFrozenRows(1);
    return;
  }

  const sixColumnLegacy = ["name", "description", "category", "url", "profiles", "visible"];
  if (sixColumnLegacy.every(function(header, index) { return current[index] === header; })) {
    sheet.insertColumnBefore(6);
    current = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  }

  const sevenColumnLegacy = ["name", "description", "category", "url", "profiles", "tags", "visible"];
  if (sevenColumnLegacy.every(function(header, index) { return current[index] === header; })) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
    return;
  }

  const firstRowIsEmpty = current.every(function(value) { return value === ""; });
  if (!firstRowIsEmpty) sheet.insertRowBefore(1);
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  sheet.setFrozenRows(1);
}

function splitList(value) {
  return String(value || "").split(",").map(function(item) { return item.trim(); }).filter(Boolean);
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map(function(item) { return String(item).trim(); }).filter(Boolean);
  return splitList(value);
}

function toBoolean(value) {
  return value === true || String(value).toLowerCase() === "true";
}

function inferLegacyGroup(tags) {
  const first = tags[0] || "";
  const map = { AR: "アレルギー性鼻炎", enuresis: "夜尿症", obesity: "小児肥満" };
  return map[first] || first || "院内業務";
}

function inferLegacyPurpose(name, description, url) {
  const text = String(name || "") + " " + String(description || "") + " " + String(url || "");
  const lower = text.toLowerCase();
  if (/action=staff|reception|\bqr\b|受付/.test(lower)) return "受付";
  if (/action=form|患者用|患者問診|初診問診/.test(lower)) return "患者入口";
  if (/spreadsheet|spredsheet|dashboard|履歴|データ|確認|action=doctor/.test(lower)) return "データ確認";
  if (/売上|パスワード|pin/.test(lower)) return "院内業務";
  return "診察";
}

function createLegacyKeywords(group, tags, name, url) {
  const map = {
    "喘息": ["asthma"], "便秘": ["constipation"], "アトピー": ["atopic", "atopy"],
    "アレルギー性鼻炎": ["allergic rhinitis", "rhinitis", "AR", "SLIT"],
    "ワクチン": ["vaccine", "vaccination"], "夜尿症": ["enuresis"], "小児肥満": ["obesity"],
  };
  const text = (String(name || "") + " " + String(url || "")).toLowerCase();
  const specific = [];
  if (/spreadsheet|spredsheet/.test(text)) specific.push("spreadsheet", "sheet");
  if (/\bqr\b/.test(text)) specific.push("qr");
  if (/履歴|history/.test(text)) specific.push("history");
  if (/日誌|diary/.test(text)) specific.push("diary");
  if (/初診/.test(text)) specific.push("initial", "first visit");
  if (/action=form/.test(text)) specific.push("form", "questionnaire", "patient");
  if (/action=staff/.test(text)) specific.push("staff", "link");
  if (/follow|light/.test(text)) specific.push("follow", "light");
  return (map[group] || []).concat(specific, tags).filter(function(value, index, array) { return array.indexOf(value) === index; });
}

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function outputResponse(payload, event) {
  const callback = event && event.parameter && event.parameter.callback;
  if (!callback) return jsonResponse(payload);
  return ContentService.createTextOutput(callback + "(" + JSON.stringify(payload) + ");").setMimeType(ContentService.MimeType.JAVASCRIPT);
}
