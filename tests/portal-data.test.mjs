import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const apps = JSON.parse(await readFile(new URL("apps.json", root), "utf8"));

function search(query, source = apps) {
  const tokens = query.normalize("NFKC").toLocaleLowerCase("ja-JP").split(/\s+/).filter(Boolean);
  return source.filter((app) => {
    const text = [app.name, app.description, app.group, app.purpose, ...app.keywords]
      .join(" ")
      .normalize("NFKC")
      .toLocaleLowerCase("ja-JP");
    return app.visible !== false && tokens.every((token) => text.includes(token));
  });
}

test("production fallback contains the migrated 25 links", () => {
  assert.equal(apps.length, 25);
  assert.equal(new Set(apps.map((app) => app.url)).size, 25);
});

test("doctor sees every active link and staff sees only flagged links", () => {
  assert.equal(apps.filter((app) => app.visible !== false).length, 25);
  assert.equal(apps.filter((app) => app.visible !== false && app.staffVisible).length, 10);
});

test("partial English search narrows enuresis without Enter", () => {
  assert.equal(search("enu").length, 4);
  assert.deepEqual(search("enu dia").map((app) => app.name), ["夜尿症: 日誌"]);
});

test("Japanese search remains available", () => {
  assert.equal(search("夜尿").length, 4);
  assert.deepEqual(search("asthma follow").map((app) => app.name), ["喘息フォロー入力 Light"]);
});

test("every link uses the new information model", () => {
  for (const app of apps) {
    assert.equal(typeof app.group, "string");
    assert.equal(typeof app.purpose, "string");
    assert.equal(typeof app.staffVisible, "boolean");
    assert.ok(Array.isArray(app.keywords));
    assert.equal(typeof app.visible, "boolean");
    assert.equal("profiles" in app, false);
    assert.equal("category" in app, false);
  }
});
