import test from "node:test";
import assert from "node:assert/strict";
import { buildDrawIndex } from "../src/team-path-parser.ts";
const item = (text, x, y, width = 170) => ({ text, x, y, width, height: 8 });

function page(category, pageNumber = 1) {
  const items = [item("(1) Alice Martin FRA", 30, 120), item("(2) Bob Park KOR", 30, 180),
    item("(3) Charlie Smith GBR", 770, 120), item("(4) Danny Lee USA", 770, 180),
    item("101", 280, 150, 20), item("201", 700, 150, 20), item("110", 490, 240, 20)];
  return { pageNumber, width: 1000, height: 700, items, lines: items, orderedText: items.map((entry) => entry.text),
    rawText: `${category} Contestants: 4`, customWtFont: false, extractionMethod: "native", extractionConfidence: .95 };
}

const ages = (categories) => {
  const index = buildDrawIndex(categories.map((category, i) => page(category, i + 1)));
  return categories.map((_, i) => [...new Set(index.athletes.filter((athlete) => athlete.page === i + 1).map((athlete) => athlete.ageCategory))]);
};

test("recognises upper Olympic/Grand Prix divisions without an explicit Senior label", () => {
  assert.deepEqual(ages(["Women +67 kg"]), [["Senior"]]);
  assert.deepEqual(ages(["Men +80 kg"]), [["Senior"]]);
  assert.deepEqual(ages(["Women +67 kg", "Men -68 kg", "Men +80 kg"]), [["Senior"], ["Senior"], ["Senior"]]);
});

test("normalises cadet Boys and Girls category labels", () => {
  assert.deepEqual(ages(["Cadets / Boys -33kg", "Cadets / Girls +59kg"]), [["Cadet"], ["Cadet"]]);
  const index = buildDrawIndex([page("Cadets / Boys -33kg"), page("Cadets / Girls +59kg", 2)]);
  assert.deepEqual([...new Set(index.athletes.filter((athlete) => athlete.page === 1).map((athlete) => athlete.genderCategory))], ["Men"]);
  assert.deepEqual([...new Set(index.athletes.filter((athlete) => athlete.page === 2).map((athlete) => athlete.genderCategory))], ["Women"]);
});

test("shared weight classes remain ambiguous without supporting evidence from the same block", () => {
  assert.deepEqual(ages(["Men -68 kg"]), [["To confirm"]]);
  assert.deepEqual(ages(["Men -68 kg", "Women +67 kg"]), [["To confirm"], ["Senior"]]);
  assert.deepEqual(ages(["Men -63 kg", "Men -68 kg"]), [["To confirm"], ["To confirm"]]);
});

test("explicit ages win and conflicting age labels split blocks even with unlabelled pages between them", () => {
  assert.deepEqual(ages(["Junior Men +80 kg"]), [["Junior"]]);
  assert.deepEqual(ages(["Junior Men -63 kg", "Men -68 kg", "Senior Men +80 kg"]), [["Junior"], ["Junior"], ["Senior"]]);
});

test("a majority of repeated senior pages never relabels a junior division", () => {
  assert.deepEqual(ages(["Men -48 kg", "Men +80 kg", "Men +80 kg"]), [["Junior"], ["Senior"], ["Senior"]]);
  assert.deepEqual(ages(["Men -48 kg", "Men -68 kg", "Men +80 kg"]), [["Junior"], ["To confirm"], ["Senior"]]);
});
