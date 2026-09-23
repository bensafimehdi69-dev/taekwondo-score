import test from "node:test";
import assert from "node:assert/strict";
import { buildBrackets } from "../src/bracket-builder.ts";
import { updateEntrant } from "../src/bracket-editing.ts";
import { entryState, exportControl, summarize } from "../web/src/control/control.ts";
import { athlete, draw8 } from "./fixtures-bracket.mjs";

const [div8] = buildBrackets(draw8());
const entry = (current, extra = {}) => ({ original: div8, current, validated: false, checked: false, ...extra });

test("une anomalie de structure bloque la validation, même après la case cochée", () => {
  const broken = updateEntrant(div8, "E", { quarter: "101" });
  assert.equal(entryState(entry(broken, { checked: true })).canValidate, false);
  assert.equal(entryState(entry(div8)).canValidate, true);
});

test("une alerte de lecture exige la comparaison au PDF avant validation", () => {
  const flagged = draw8();
  flagged.athletes[0] = { ...athlete("A", "left", 100, ["101", "201", "301"], 1), warnings: ["Nom illisible"] };
  const [division] = buildBrackets(flagged);
  const base = { original: division, current: division, validated: false, checked: false };
  assert.equal(entryState(base).canValidate, false);
  assert.equal(entryState({ ...base, checked: true }).canValidate, true);
});

test("le bilan distingue les divisions validées telles que lues", () => {
  const corrected = updateEntrant(div8, "A", { name: "Corrigé" });
  const summary = summarize([entry(div8, { validated: true }), entry(corrected, { validated: true }), entry(div8)]);
  assert.deepEqual(summary, { total: 3, readOk: 3, validated: 2, validatedAsRead: 1 });
});

test("l'export garde la source, le bilan et la validation de chaque division", async () => {
  const session = { fileName: "tirage.pdf", sha256: "abc", pageCount: 1, ocrPages: 0, entries: [entry(div8, { validated: true })] };
  const content = JSON.parse(await exportControl(session).text());
  assert.equal(content.format, "taekwondo-score/controle@1");
  assert.deepEqual(content.source, { fileName: "tirage.pdf", sha256: "abc", pageCount: 1, ocrPages: 0 });
  assert.deepEqual(content.divisions[0].validation, { validated: true, checkedAgainstPdf: false, corrections: 0 });
  assert.equal(content.divisions[0].entrants.length, 8);
});
