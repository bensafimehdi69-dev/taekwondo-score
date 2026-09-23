import test from "node:test";
import assert from "node:assert/strict";
import { buildDrawIndex, searchDrawIndex } from "../src/team-path-parser.ts";
import { wtPageItems } from "../src/pdf-reader.ts";

const item = (text, x, y, width = 150) => ({ text, x, y, width, height: 8 });
const page = (items) => ({ pageNumber: 1, width: 1000, height: 700, items, lines: items,
  orderedText: items.map((entry) => entry.text), rawText: "Senior Men -58 kg",
  customWtFont: false, extractionMethod: "native", extractionConfidence: 0.98 });

test("indexes once, keeps full names and supports prefixes, accents and reversed names", () => {
  const pages = [page([
    item("(1) Kaziz Daulet KAZ", 30, 120), item("(2) KORSAK Oleg UKR", 30, 180),
    item("(3) José Martin ESP", 780, 120), item("(4) Әлихан Нұрлан KAZ", 780, 180),
    item("101", 280, 150, 20), item("201", 700, 150, 20), item("110", 490, 220, 20),
  ])];
  const index = buildDrawIndex(pages);
  assert.strictEqual(buildDrawIndex(pages), index);
  assert.equal(index.athletes.length, 4);
  for (const query of ["kaziz", "DAU KAZ", "daulet Kaziz"]) {
    const result = searchDrawIndex(index, query, "name").athletes;
    assert.equal(result.length, 1);
    assert.equal(result[0].name, "Kaziz Daulet");
    assert.equal(result[0].id, index.athletes[0].id);
  }
  assert.equal(searchDrawIndex(index, "jose", "name").athletes[0].name, "José Martin");
  assert.equal(searchDrawIndex(index, "Нұр", "name").athletes[0].name, "Әлихан Нұрлан");
  assert.equal(searchDrawIndex(index, "KAZ", "team").athletes.length, 2);
  assert.equal(searchDrawIndex(index, "KOR", "team").athletes.length, 0);
  assert.equal(searchDrawIndex(index, "KOR", "name").athletes[0].country, "UKR");
  assert.equal(searchDrawIndex(index, "", "name").athletes.length, 4);
});

test("does not turn repeated winners, results or podium entries into entrants", () => {
  const index = buildDrawIndex([page([
    item("(1) Alice Martin FRA", 30, 120), item("(2) Bob Park KOR", 30, 180),
    item("Alice Martin FRA", 310, 150), item("PTF 2-1", 350, 165),
    item("(0-0 DSQ)", 30, 230), item("1 Alice Martin FRA", 30, 560),
    item("101", 280, 150, 20), item("110", 490, 220, 20),
  ])]);
  assert.deepEqual(index.athletes.map((athlete) => athlete.name), ["Alice Martin", "Bob Park"]);
  assert.ok(index.athletes.every((athlete) => athlete.path.every((code) => ["101", "110"].includes(code))));
});

test("keeps unseeded athletes when the same bracket also contains seeded athletes", () => {
  const index = buildDrawIndex([page([
    item("(1) GOETHALS Torre BEL", 30, 120), item("ALQALLAF Ali yaqoub KUW", 30, 180),
    item("ROTHER Daniel GER", 30, 240), item("(3) KRZYK Jason GER", 770, 120),
    item("ALZANKI Mohamad KUW", 770, 180), item("(6) SAFFAK Berat GER", 770, 240),
    item("101", 280, 210, 20), item("103", 700, 210, 20), item("110", 490, 300, 20),
  ])]);
  assert.deepEqual(index.athletes.map((athlete) => athlete.name), [
    "GOETHALS Torre", "ALQALLAF Ali yaqoub", "ROTHER Daniel", "KRZYK Jason", "ALZANKI Mohamad", "SAFFAK Berat",
  ]);
  assert.equal(searchDrawIndex(index, "ALQALLAF", "name").athletes[0].country, "KUW");
});

test("joins wrapped seeded names and reports missing entries without inventing athletes", () => {
  const parsed = page([
    item("(x) ERNESTO RAFAEL", 30, 120), item("SIMCRENK DOM", 30, 128),
    item("(1) KANBUSAKORN PICHAISONGKRAM", 750, 180, 200), item("THA", 925, 188, 25),
    item("101", 280, 120, 20), item("201", 700, 180, 20), item("110", 490, 230, 20),
  ]);
  parsed.rawText += " Contestants: 3";
  const index = buildDrawIndex([parsed]);
  assert.deepEqual(index.athletes.map((athlete) => athlete.name), ["ERNESTO RAFAEL SIMCRENK", "KANBUSAKORN PICHAISONGKRAM"]);
  assert.ok(index.warnings.some((warning) => /2 athlete entries recognised.*3/.test(warning)));
});

test("preserves homonyms in separate clubs and ignores bib numbers as fights", () => {
  const index = buildDrawIndex([page([
    item("B/", 28, 120, 10), item("193", 39, 120, 15),
    item("B/193 Alex Smith", 28, 180), item("Astana qalasy KAZ", 28, 191),
    item("R/222 Alex Smith", 770, 180), item("Almaty qalasy KAZ", 770, 191),
    item("101", 280, 185, 20), item("201", 700, 185, 20), item("110", 490, 240, 20),
  ])]);
  assert.equal(index.athletes.length, 2);
  assert.equal(new Set(index.athletes.map((athlete) => athlete.id)).size, 2);
  assert.equal(searchDrawIndex(index, "Astana", "team").athletes.length, 1);
  assert.equal(searchDrawIndex(index, "Astana", "name").athletes.length, 0);
  assert.ok(index.athletes.every((athlete) => !athlete.path.includes("193") && !athlete.path.includes("222")));
});

test("Type3 uses outlines, respects font switches and never guesses unknown raw codes", async () => {
  const OPS = { setFont: 1, setTextMatrix: 2, showText: 3 };
  const procA = { fnArray: [7], argsArray: [[1, 2]] };
  const procB = { fnArray: [8], argsArray: [[3, 4]] };
  const hash = (value) => {
    let result = 2166136261;
    for (const char of JSON.stringify(value)) result = Math.imul(result ^ char.charCodeAt(0), 16777619);
    return (result >>> 0).toString(36);
  };
  const reference = new Map([[hash(procA), "A"], [hash(procB), "B"]]);
  let fontReads = 0;
  const mockPage = {
    commonObjs: { get(id) { fontReads += 1; return { charProcOperatorList: { glyph0: id === "pdf_f1" ? procA : procB } }; } },
    getOperatorList: async () => ({
      fnArray: [1, 2, 3, 1, 3, 1, 3],
      argsArray: [["pdf_f1", 8], [1, 0, 0, 1, 20, 100],
        [[{ operatorListId: "glyph0", originalCharCode: 0 }]], ["pdf_f2", 8],
        [[{ operatorListId: "glyph0", originalCharCode: 0 }]], ["pdf_f1", 8],
        [[{ operatorListId: "unknown", originalCharCode: 40 }]]],
    }),
  };
  const result = await wtPageItems(mockPage, { convertToViewportPoint: (x, y) => [x, y] }, OPS, reference);
  assert.deepEqual(result.items.map((entry) => entry.text), ["A", "B", "?"]);
  assert.equal(reference.get(hash(procA)), "A");
  assert.equal(fontReads, 2);
});
