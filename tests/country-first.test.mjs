import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildDrawIndex } from "../src/team-path-parser.ts";
import { readDraw } from "../src/read-draw.ts";

const item = (text, x, y, width = 180) => ({ text, x, y, width, height: 8 });
const page = (items) => ({ pageNumber: 1, width: 1000, height: 700, items, lines: items,
  orderedText: items.map((entry) => entry.text), rawText: "Senior Men -58 kg",
  customWtFont: false, extractionMethod: "native", extractionConfidence: 0.98 });
const athletes = (items) => buildDrawIndex([page(items)]).athletes
  .map((a) => [a.name, a.country, a.seed ?? null]).sort((a, b) => a[0].localeCompare(b[0]));

test("livret européen : le pays avant le nom, avec ou sans tête de série", () => {
  assert.deepEqual(athletes([
    item("(1) EGY ASEM ATA ABU SREE Moataz Bellah", 20, 110), item("ASEM ATA ABU SREE M. (EGY)", 240, 120),
    item("(17) ITA LAMPIS Filippo Maria", 20, 170), item("CYP ANDRONIKOU Chrysovalantis", 20, 190),
    item("BIH Makas, Ejla", 790, 110), item("(8) FRA OWEN Haddad", 790, 170), item("LAMPIS F. (ITA)", 590, 180),
  ]), [
    ["ANDRONIKOU Chrysovalantis", "CYP", null], ["ASEM ATA ABU SREE Moataz Bellah", "EGY", 1],
    ["LAMPIS Filippo Maria", "ITA", 17], ["Makas Ejla", "BIH", null], ["OWEN Haddad", "FRA", 8],
  ]);
});

test("page classique : un nom de trois lettres n'est jamais pris pour un pays", () => {
  assert.deepEqual(athletes([
    item("(1) LIU You-yun TPE", 20, 110), item("LEE Dae-hoon KOR", 20, 170), item("KIM Tae-hun KOR", 20, 230),
    item("(2) PAK Ji-won PRK", 790, 110), item("GOETHALS Torre BEL", 790, 170), item("LIU Y.Y. (TPE)", 240, 120),
  ]), [
    ["GOETHALS Torre", "BEL", null], ["KIM Tae-hun", "KOR", null], ["LEE Dae-hoon", "KOR", null],
    ["LIU You-yun", "TPE", 1], ["PAK Ji-won", "PRK", 2],
  ]);
});

test("le format « pays en tête » exige au moins trois lignes sans ambiguïté", () => {
  // Deux lignes seulement : la page reste lue comme une page classique, rien n'est inventé.
  assert.deepEqual(athletes([item("EGY ASEM Moataz", 20, 110), item("CYP ANDRONIKOU Chrysovalantis", 20, 170)]), []);
});

test("TaekoPlan : la tête de série imprimée sur la ligne du dossard est lue", () => {
  const index = buildDrawIndex([page([
    item("B/1353", 20, 100, 40), item("(1) HAMDI Riad", 70, 100), item("Saudi National Team (2025) KSA", 20, 110, 200),
    item("B/535", 20, 160, 40), item("AL-LOUZI Radad", 70, 160), item("Talents 2025 JOR", 20, 170, 120),
    item("R/1986", 20, 220, 40), item("(8) KAZLOU Aliaksandr", 70, 220), item("Individual Neutral Athlete (AIN) AIN", 20, 230, 220),
  ])]);
  const byName = Object.fromEntries(index.athletes.map((a) => [a.name, [a.country, a.seed ?? null, a.drawFormat]]));
  assert.deepEqual(byName["HAMDI Riad"], ["KSA", 1, "taekoplan"]);
  assert.deepEqual(byName["AL-LOUZI Radad"], ["JOR", null, "taekoplan"]);
  assert.deepEqual(byName["KAZLOU Aliaksandr"], ["AIN", 8, "taekoplan"]);
});

// PDF réels privés (jamais commités).
const locations = process.env.TKD_PDF_FIXTURES_DIRS ? JSON.parse(process.env.TKD_PDF_FIXTURES_DIRS)
  : [process.env.TKD_PDF_FIXTURES_DIR || "fixtures"];
const fixture = (file) => locations.map((directory) => join(directory, file)).find(existsSync);
const skip = (path) => !path && process.env.TKD_REQUIRE_PDF_FIXTURES !== "1" ? "Private PDF fixture unavailable; set TKD_PDF_FIXTURES_DIR" : false;
async function read(file, path) {
  const log = console.log; const warn = console.warn;
  console.log = () => {}; console.warn = () => {};
  try { return await readDraw(new File([readFileSync(path)], file, { type: "application/pdf" })); }
  finally { console.log = log; console.warn = warn; }
}

const euroU21 = "euro_u21_2025.pdf";
test(`real PDF: ${euroU21} (pays en tête, « Nom, Prénom »)`, { skip: skip(fixture(euroU21)) }, async () => {
  const path = fixture(euroU21);
  assert.ok(path, "Required private PDF fixture is missing: " + euroU21);
  const { index, brackets } = await read(euroU21, path);
  assert.equal(brackets.length, 4);
  assert.equal(brackets.filter((d) => d.status === "ok").length, 3);
  const makas = index.athletes.find((a) => a.name === "Makas Ejla");
  assert.equal(makas?.country, "BIH");
  assert.ok(index.athletes.every((a) => /^[A-Z]{3}$/.test(a.country ?? "")), "un code pays par athlète");
  assert.ok(!index.athletes.some((a) => /\.\s*$/.test(a.name)), "aucun vainqueur abrégé compté comme athlète");
});

const etuResults = "draw with result taekoplan fornat.pdf";
test(`real PDF: ${etuResults} (pays en tête, têtes de série)`, { skip: skip(fixture(etuResults)) }, async () => {
  const path = fixture(etuResults);
  assert.ok(path, "Required private PDF fixture is missing: " + etuResults);
  const { index, brackets } = await read(etuResults, path);
  assert.equal(brackets.length, 16);
  assert.equal(brackets.filter((d) => d.status === "ok").length, 13);
  const asem = index.athletes.find((a) => a.name.startsWith("ASEM ATA ABU SREE"));
  assert.deepEqual([asem?.country, asem?.seed], ["EGY", 1]);
  // Têtes de série uniques dans chaque division lue sans anomalie.
  for (const d of brackets.filter((b) => b.status === "ok")) {
    const seeds = d.entrants.map((e) => e.seed).filter((s) => s !== undefined);
    assert.equal(new Set(seeds).size, seeds.length, d.category);
  }
});

const fujairah = "Draws - Day 1 - Fujairah Open 2025.pdf";
test(`real PDF: ${fujairah} (têtes de série TaekoPlan)`, { skip: skip(fixture(fujairah)) }, async () => {
  const path = fixture(fujairah);
  assert.ok(path, "Required private PDF fixture is missing: " + fujairah);
  const { brackets } = await read(fujairah, path);
  assert.deepEqual(brackets.map((d) => d.entrants.filter((e) => e.seed !== undefined).length), [15, 12, 16, 11, 5, 10, 6, 9]);
  const hamdi = brackets[0].entrants.find((e) => e.name === "HAMDI Riad");
  assert.equal(hamdi?.seed, 1);
});
