import test from "node:test";
import assert from "node:assert/strict";
import { buildDrawIndex, parseSeed } from "../src/team-path-parser.ts";

const item = (text, x, y, width = 150) => ({ text, x, y, width, height: 8 });
const page = (items) => ({ pageNumber: 1, width: 1000, height: 700, items, lines: items,
  orderedText: items.map((entry) => entry.text), rawText: "Senior Men -58 kg",
  customWtFont: false, extractionMethod: "native", extractionConfidence: 0.98 });

test("lit le numéro de tête de série imprimé devant le nom", () => {
  assert.equal(parseSeed("(1) Alice Martin FRA"), 1);
  assert.equal(parseSeed("(12) Bob Park KOR"), 12);
  assert.equal(parseSeed("(x) ERNESTO RAFAEL"), undefined);
  assert.equal(parseSeed("(X) ERNESTO RAFAEL"), undefined);
  assert.equal(parseSeed("Alice Martin FRA"), undefined);
  assert.equal(parseSeed("(0-0 DSQ)"), undefined);
});

test("expose la tête de série dans l'index sans modifier le nom", () => {
  const index = buildDrawIndex([page([
    item("(1) GOETHALS Torre BEL", 30, 120), item("ALQALLAF Ali yaqoub KUW", 30, 180),
    item("ROTHER Daniel GER", 30, 240), item("(3) KRZYK Jason GER", 770, 120),
    item("ALZANKI Mohamad KUW", 770, 180), item("(6) SAFFAK Berat GER", 770, 240),
  ])]);
  const byName = Object.fromEntries(index.athletes.map((a) => [a.name, a.seed]));
  assert.equal(byName["GOETHALS Torre"], 1);
  assert.equal(byName["KRZYK Jason"], 3);
  assert.equal(byName["SAFFAK Berat"], 6);
  assert.equal(byName["ALQALLAF Ali yaqoub"], undefined);
  assert.equal(byName["ROTHER Daniel"], undefined);
});

test("ignore les vainqueurs réimprimés en abrégé dans l'arbre d'un livret de résultats", () => {
  const index = buildDrawIndex([page([
    item("(1) LIU You-yun TPE", 30, 105), item("LIU Y.Y. (TPE)", 30, 117),
    item("(32) BARROSO Kiara POR", 30, 128), item("AKGUL E.S. (TUR)", 30, 426),
    item("(4) AKGUL Elif sude TUR", 30, 443),
  ])]);
  assert.deepEqual(index.athletes.map((a) => a.name).sort(), ["AKGUL Elif sude", "BARROSO Kiara", "LIU You-yun"]);
  assert.deepEqual(index.athletes.map((a) => a.seed).sort((a, b) => a - b), [1, 4, 32]);
});
