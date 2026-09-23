import test from "node:test";
import assert from "node:assert/strict";
import { buildDrawIndex } from "../src/team-path-parser.ts";
import { verifyDrawImport } from "../src/import-verification.ts";
const item = (text, x, y, width = 170) => ({ text, x, y, width, height: 8 });

const page = (overrides = {}) => {
  const items = [item("(1) Alice Martin FRA", 30, 120), item("(2) Bob Park KOR", 30, 180),
    item("(3) Charlie Smith GBR", 770, 120), item("(4) Danny Lee USA", 770, 180),
    item("101", 280, 150, 20), item("201", 700, 150, 20), item("110", 490, 240, 20)];
  return { pageNumber: 1, width: 1000, height: 700, items, lines: items, orderedText: items.map((entry) => entry.text),
    rawText: "Senior Men -58 kg Contestants: 4", customWtFont: false, extractionMethod: "native", extractionConfidence: .95, ...overrides };
};

test("recognises a coherent bracket and allows shared future fight numbers", () => {
  const pages = [page()]; const index = buildDrawIndex(pages);
  const report = verifyDrawImport(pages, index);
  assert.equal(report.status, "recognised");
  assert.equal(report.pages[0].fightCodes.length, 3);
  assert.ok(index.athletes.every((athlete) => athlete.path.at(-1) === "110"));
  assert.ok(index.athletes.every((athlete) => report.athletes[athlete.id].status === "recognised"));
});

test("unknown readable layouts are not accepted just because a brand or fight code is present", () => {
  const pages = [page({ items: [item("TaekoPlan Championship", 50, 100), item("101", 400, 200, 20)] })];
  const report = verifyDrawImport(pages, buildDrawIndex(pages));
  assert.equal(report.status, "unknown");
  assert.ok(report.pages[0].issues.some((issue) => issue.code === "unknown-format"));
  assert.equal(report.athletes["legacy-unknown"]?.status, undefined);
});

test("count mismatches require review in both directions and never delete DSQ entries", () => {
  for (const expected of [3, 5]) {
    const pages = [page({ rawText: `Senior Men -58 kg Contestants: ${expected} (DSQ) Disqualified 0-0 DSQ` })];
    const index = buildDrawIndex(pages); const report = verifyDrawImport(pages, index);
    assert.equal(index.athletes.length, 4);
    assert.equal(report.status, "review");
    assert.ok(report.pages[0].issues.some((issue) => issue.code === "count-mismatch"));
    assert.ok(index.athletes.every((athlete) => report.athletes[athlete.id].status === "review"));
  }
});

test("flags missing finals, orphan boxes and inconsistent inferred branches", () => {
  const parsed = page(); const pages = [parsed]; const index = buildDrawIndex(pages);
  const noFinal = { ...index, athletes: index.athletes.map((athlete) => ({ ...athlete, path: athlete.path.slice(0, -1) })) };
  assert.ok(verifyDrawImport(pages, noFinal).pages[0].issues.some((issue) => issue.code === "multiple-finals"));
  assert.ok(verifyDrawImport(pages, noFinal).pages[0].issues.some((issue) => issue.code === "unlinked-fights"));
  const conflicting = { ...index, athletes: index.athletes.map((athlete, i) => i === 0 ? { ...athlete, path: ["101", "201", "110"] } : athlete) };
  assert.ok(verifyDrawImport(pages, conflicting).pages[0].issues.some((issue) => issue.code === "branch-conflict"));
  const badCode = { ...index, athletes: index.athletes.map((athlete, i) => i === 0 ? { ...athlete, path: ["999", "110"] } : athlete) };
  assert.ok(verifyDrawImport(pages, badCode).athletes[index.athletes[0].id].issues.some((issue) => issue.code === "fight-not-on-page"));
});

test("OCR and unsupported tournament systems remain review-only", () => {
  for (const override of [{ extractionMethod: "ocr" }, { extractionConfidence: .3 }, { rawText: "Senior Men -58 kg Contestants: 4 Repechage" }]) {
    const pages = [page(override)]; const report = verifyDrawImport(pages, buildDrawIndex(pages));
    assert.equal(report.status, "review");
  }
});
