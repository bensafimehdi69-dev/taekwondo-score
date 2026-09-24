import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { formatCountdown } from "../web/src/format.ts";
import { lang, placeLabel, placeShort, setCurrentLang, tr, translateIssue } from "../web/src/i18n-core.ts";

test("langue : français par défaut hors navigateur, bascule en anglais", () => {
  assert.equal(lang(), "fr");
  assert.equal(tr("Enregistrer", "Save"), "Enregistrer");
  setCurrentLang("en");
  assert.deepEqual([tr("Enregistrer", "Save"), placeShort("gold"), placeLabel("quarter")], ["Save", "1st", "Lost in quarterfinal"]);
  assert.equal(formatCountdown(2 * 3_600_000 + 5 * 60_000), "in 2 h 05 min");
  setCurrentLang("fr");
  assert.equal(formatCountdown(2 * 3_600_000 + 5 * 60_000), "dans 2 h 05 min");
});

test("chaque message de cohérence du moteur (src/prediction.ts) a sa traduction anglaise", () => {
  const source = readFileSync(new URL("../src/prediction.ts", import.meta.url), "utf8");
  const messages = [...source.matchAll(/issues\.push\((`[^`]*`|"[^"]*")\)/g)].map((m) => m[1].slice(1, -1).replace(/\$\{[^}]+\}/g, "2"));
  assert.ok(messages.length >= 10, `${messages.length} messages trouvés`);
  setCurrentLang("en");
  try {
    for (const message of messages) assert.notEqual(translateIssue(message), message, `sans traduction : ${message}`);
  } finally {
    setCurrentLang("fr");
  }
  assert.equal(translateIssue(messages[0]), messages[0]);
});
