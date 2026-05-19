const SHEET_NAME = "apps";
const HEADERS = ["name", "description", "category", "url", "profiles", "visible"];
const ADMIN_TOKEN_KEY = "ADMIN_TOKEN";
const ADMIN_TOKEN_LEGACY_KEY = "ADMIN-TOKEN";

function doGet(event) {
  try {
    const payload = {
      ok: true,
      apps: readApps(),
      updatedAt: new Date().toISOString(),
    };
    return outputResponse(payload, event);
  } catch (error) {
    return outputResponse({ ok: false, error: error.message }, event);
  }
}

function doPost(event) {
  try {
    const payload = JSON.parse(event.postData.contents || "{}");
    assertAdminToken(payload.token);

    if (!Array.isArray(payload.apps)) {
      throw new Error("apps must be an array");
    }

    writeApps(payload.apps);

    return jsonResponse({
      ok: true,
      count: payload.apps.length,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message });
  }
}

function setupPortalSheet() {
  const sheet = getAppsSheet();
  ensureHeaders(sheet);
}

function setAdminToken(token) {
  const properties = PropertiesService.getScriptProperties();
  if (!token) {
    const existingToken =
      properties.getProperty(ADMIN_TOKEN_KEY) ||
      properties.getProperty(ADMIN_TOKEN_LEGACY_KEY);
    if (existingToken) {
      Logger.log("ADMIN_TOKEN is already set in Script Properties.");
      return "ADMIN_TOKEN is already set in Script Properties.";
    }

    throw new Error('token is required. Set ADMIN_TOKEN in Script Properties, or call setAdminToken("your-token") from another function.');
  }

  properties.setProperty(ADMIN_TOKEN_KEY, token);
  Logger.log("ADMIN_TOKEN was saved.");
  return "ADMIN_TOKEN was saved.";
}

function checkAdminTokenSetting() {
  const properties = PropertiesService.getScriptProperties();
  const existingToken =
    properties.getProperty(ADMIN_TOKEN_KEY) ||
    properties.getProperty(ADMIN_TOKEN_LEGACY_KEY);

  if (!existingToken) {
    throw new Error("ADMIN_TOKEN is not set in Script Properties.");
  }

  Logger.log("ADMIN_TOKEN is set.");
  return "ADMIN_TOKEN is set.";
}

function readApps() {
  const sheet = getAppsSheet();
  ensureHeaders(sheet);

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }

  const values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  return values
    .filter((row) => row.some((value) => value !== ""))
    .map((row) => ({
      name: String(row[0] || ""),
      description: String(row[1] || ""),
      category: String(row[2] || "その他"),
      url: String(row[3] || ""),
      profiles: String(row[4] || "")
        .split(",")
        .map((profile) => profile.trim())
        .filter(Boolean),
      visible: row[5] === "" ? true : row[5] === true || String(row[5]).toLowerCase() === "true",
    }));
}

function writeApps(apps) {
  const sheet = getAppsSheet();
  ensureHeaders(sheet);

  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).clearContent();
  }

  if (apps.length === 0) {
    return;
  }

  const rows = apps.map((app) => [
    app.name || "",
    app.description || "",
    app.category || "その他",
    app.url || "",
    Array.isArray(app.profiles) ? app.profiles.join(",") : "",
    app.visible !== false,
  ]);

  sheet.getRange(2, 1, rows.length, HEADERS.length).setValues(rows);
}

function assertAdminToken(token) {
  const properties = PropertiesService.getScriptProperties();
  const expectedToken =
    properties.getProperty(ADMIN_TOKEN_KEY) ||
    properties.getProperty(ADMIN_TOKEN_LEGACY_KEY);
  if (!expectedToken) {
    throw new Error("ADMIN_TOKEN is not set");
  }

  if (token !== expectedToken) {
    throw new Error("invalid token");
  }
}

function getAppsSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  return spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.insertSheet(SHEET_NAME);
}

function ensureHeaders(sheet) {
  const currentHeaders = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  const needsHeaders = HEADERS.some((header, index) => currentHeaders[index] !== header);

  if (needsHeaders) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function outputResponse(payload, event) {
  const callback = event && event.parameter && event.parameter.callback;
  if (!callback) {
    return jsonResponse(payload);
  }

  return ContentService
    .createTextOutput(`${callback}(${JSON.stringify(payload)});`)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}