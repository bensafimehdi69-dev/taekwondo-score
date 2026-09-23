import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildBrackets } from "../src/bracket-builder.ts";
import { readDraw, withReadingChecks } from "../src/read-draw.ts";
import { athlete } from "./fixtures-bracket.mjs";

// Tableau TaekoPlan coupé en trois pages, comme le Fujairah Open 2025 :
// page 1 = moitié haute jusqu'au combat 131, page 2 = moitié basse jusqu'au 229,
// page 3 = page de la finale (230), qui réimprime les exempts des pages 1 et 2.
const on = (page, a) => ({ ...a, page, category: "Senior Men -54 kg", weightCategory: "-54 kg", drawFormat: "taekoplan" });
const threePages = () => ({ pageCount: 3, ocrPageCount: 0, warnings: [], athletes: [
  on(1, athlete("HAMDI Riad", "left", 67, ["116", "124", "128", "131"])),
  on(1, athlete("SHABIN Taha", "left", 127, ["105", "116", "124", "128", "131"])),
  on(1, athlete("TRABELSI Amen", "left", 163, ["105", "116", "124", "128", "131"])),
  on(1, athlete("KHAN Shahzaib", "right", 67, ["120", "126", "129", "131"])),
  on(1, athlete("SINGH Sahil", "right", 127, ["109", "120", "126", "129", "131"])),
  on(2, athlete("MARA Jibryl", "left", 67, ["206", "218", "225", "229"])),
  on(2, athlete("GARCIA Noah", "right", 67, ["208", "219", "226", "229"])),
  on(2, athlete("ALKARMATI Abdulrahman Khaled", "right", 127, ["111", "208", "219", "226", "229"])),
  // Page de la finale : exempts réimprimés, dont un nom coupé au bord de la feuille.
  on(3, athlete("HAMDI Riad", "left", 67, ["116", "124", "128", "131", "230"])),
  on(3, athlete("KHAN Shahzaib", "left", 307, ["120", "126", "129", "131", "230"])),
  on(3, athlete("MARA Jibryl", "right", 67, ["206", "218", "225", "229", "230"])),
  on(3, athlete("GARCIA Noah", "right", 187, ["208", "219", "226", "229", "230"])),
  on(3, athlete("ALKARMATI Abdulrah", "right", 427, ["208", "219", "226", "229", "230"])),
] });

test("raccorde un tableau coupé en trois pages en une seule division", () => {
  const divisions = buildBrackets(threePages());
  assert.equal(divisions.length, 1);
  const [division] = divisions;
  assert.equal(division.status, "ok", division.issues.join(" | "));
  assert.deepEqual(division.pages, [1, 2, 3]);
  assert.equal(division.finalFight, "230");
  assert.equal(division.size, 8);
  assert.deepEqual(division.semiFights, ["131", "229"]);
  assert.deepEqual(division.quarterFights, ["128", "129", "225", "226"]);
  // Ordre de l'arbre complet : moitié haute (page 1, gauche puis droite), puis moitié basse (page 2).
  assert.deepEqual(division.entrants.map((e) => e.name),
    ["HAMDI Riad", "SHABIN Taha", "TRABELSI Amen", "KHAN Shahzaib", "SINGH Sahil", "MARA Jibryl", "GARCIA Noah", "ALKARMATI Abdulrahman Khaled"]);
  // Le côté vient de la page de la finale ; les parcours vont jusqu'à la vraie finale.
  assert.ok(division.entrants.slice(0, 5).every((e) => e.side === "left" && e.page === 1 && e.path.at(-1) === "230"));
  assert.ok(division.entrants.slice(5).every((e) => e.side === "right" && e.page === 2));
  assert.deepEqual(division.entrants[1].path, ["105", "116", "124", "128", "131", "230"]);
});

test("un athlète de la page de la finale qu'on ne sait pas rattacher reste visible et signalé", () => {
  const draw = threePages();
  // « SINGH Sahi » (nom coupé) correspond à deux athlètes de la page 1 : aucun rattachement deviné.
  draw.athletes.push(on(1, athlete("SINGH Sahil Kumar", "right", 163, ["109", "120", "126", "129", "131"])));
  draw.athletes.push(on(3, athlete("SINGH Sahi", "left", 367, ["109", "120", "126", "129", "131", "230"])));
  // Nom absent des pages de moitié.
  draw.athletes.push(on(3, athlete("NOUVEAU Nom", "left", 400, ["121", "126", "129", "131", "230"])));
  const [division] = buildBrackets(draw);
  assert.equal(division.status, "review");
  assert.ok(division.issues.includes("2 athlète(s) de la page de la finale absent(s) de la partie qui mène au combat 131."), division.issues.join(" | "));
  assert.ok(division.entrants.some((e) => e.name === "NOUVEAU Nom" && e.page === 3));
  assert.deepEqual(division.entrants.filter((e) => e.name.startsWith("SINGH")).map((e) => e.name).sort(),
    ["SINGH Sahi", "SINGH Sahil", "SINGH Sahil Kumar"]);
});

test("des pages de catégories différentes ne sont jamais raccordées", () => {
  const draw = threePages();
  draw.athletes = draw.athletes.map((a) => a.page === 2 ? { ...a, category: "Senior Men -58 kg", weightCategory: "-58 kg" } : a);
  const divisions = buildBrackets(draw);
  assert.equal(divisions.length, 2);
  assert.deepEqual(divisions.find((d) => d.category === "Senior Men -58 kg").pages, [2]);
});

const verification = (declared, codes = ["count-mismatch"]) => ({
  status: "review",
  pages: [1, 2, 3].map((page) => ({ page, status: "review", format: "", athleteCount: 0, expectedCount: declared, fightCodes: [], issues: [] })),
  athletes: Object.fromEntries(threePages().athletes.map((a) => [a.id, { status: "review", issues: codes.map((code) => ({ code, field: "page", message: code })) }])),
});

test("l'écart « Contestants » page par page disparaît quand la division raccordée a le nombre annoncé", () => {
  const [division] = withReadingChecks(buildBrackets(threePages()), verification(8));
  assert.equal(division.status, "ok", division.issues.join(" | "));
});

test("un nombre différent de celui annoncé reste signalé, sans rien retirer", () => {
  const [division] = withReadingChecks(buildBrackets(threePages()), verification(9));
  assert.equal(division.status, "review");
  assert.equal(division.size, 8);
  assert.ok(division.issues.includes("8 athlètes lus sur les pages 1, 2, 3, 9 annoncés sur la feuille."));
  assert.ok(division.issues.includes("8 athlète(s) à vérifier selon le contrôle de lecture."));
});

test("une autre alerte de lecture que le comptage reste signalée", () => {
  const [division] = withReadingChecks(buildBrackets(threePages()), verification(8, ["count-mismatch", "branch-conflict"]));
  assert.equal(division.status, "review");
});

// PDF réel privé (jamais commité) : Fujairah Open 2025, jour 1, format TaekoPlan sur trois pages.
const locations = process.env.TKD_PDF_FIXTURES_DIRS ? JSON.parse(process.env.TKD_PDF_FIXTURES_DIRS)
  : [process.env.TKD_PDF_FIXTURES_DIR || "fixtures"];
const fujairah = "Draws - Day 1 - Fujairah Open 2025.pdf";
const fujairahPath = locations.map((directory) => join(directory, fujairah)).find(existsSync);
test(`real PDF: ${fujairah} (divisions sur plusieurs pages)`, { skip: !fujairahPath && process.env.TKD_REQUIRE_PDF_FIXTURES !== "1" ? "Private PDF fixture unavailable; set TKD_PDF_FIXTURES_DIR" : false }, async () => {
  assert.ok(fujairahPath, "Required private PDF fixture is missing: " + fujairah);
  const log = console.log; const warn = console.warn;
  console.log = () => {}; console.warn = () => {};
  try {
    const { brackets } = await readDraw(new File([readFileSync(fujairahPath)], fujairah, { type: "application/pdf" }));
    assert.equal(brackets.length, 8);
    assert.ok(brackets.every((d) => d.status === "ok"), brackets.flatMap((d) => d.issues).join(" | "));
    const [m54] = brackets;
    assert.equal(m54.weightCategory, "-54 kg");
    assert.deepEqual(m54.pages, [1, 2, 3]);
    assert.equal(m54.size, 45);
    assert.equal(m54.finalFight, "230");
    assert.deepEqual(m54.semiFights, ["131", "229"]);
    assert.equal(m54.quarterFights.length, 4);
    assert.deepEqual(brackets.map((d) => d.size), [45, 46, 42, 47, 39, 31, 23, 25]);
  } finally {
    console.log = log; console.warn = warn;
  }
});
