import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildBrackets } from "../src/bracket-builder.ts";
import { readDraw } from "../src/read-draw.ts";
import { auditDivision, sameAthlete, sourceNames, withSourceAthletes } from "../src/source-audit.ts";
import { draw8 } from "./fixtures-bracket.mjs";

const item = (text, x, y, width = 150) => ({ text, x, y, width, height: 6 });
const page = (items, pageNumber = 1, rawText = "Senior Men -58 kg") => ({ pageNumber, width: 1000, height: 700, items, lines: items,
  orderedText: items.map((i) => i.text), rawText, customWtFont: false, extractionMethod: "native", extractionConfidence: 0.95 });
const names = (p) => sourceNames(p).map((n) => [n.name, n.country ?? null, n.seed ?? null, n.reprint]);

test("relecture : codes pays de 2 ou 3 lettres, avant ou après le nom, abréviations de la feuille", () => {
  assert.deepEqual(names(page([
    item("(1) PSARROS A.N. GRE", 20, 100), item("(4) BASSETT Jaycee WT", 20, 160), item("SILVA NAZARIO J. BRA", 20, 220),
    item("(8) ASEM ATA ABU SREE. EGY", 820, 100), item("LIU Y.Y. (TPE)", 200, 110, 60),
  ])), [
    ["PSARROS A.N.", "GRE", 1, false], ["LIU Y.Y", "TPE", null, true], ["BASSETT Jaycee", "WT", 4, false],
    ["SILVA NAZARIO J.", "BRA", null, false], ["ASEM ATA ABU SREE.", "EGY", 8, false],
  ]);
});

test("relecture : numéro de combat et score collés sur la même rangée ne font pas partie du nom", () => {
  assert.deepEqual(names(page([item("107", 150, 100, 13), item("ITA Criscuolo, Anna", 10, 100, 50),
    item("CRO Prpic, Sara", 10, 120, 50), item("TUR Cerci, Irmak", 10, 140, 50), item("PTF 2-0", 190, 140, 30)])),
  [["Criscuolo Anna", "ITA", null, false], ["Prpic Sara", "CRO", null, false], ["Cerci Irmak", "TUR", null, false]]);
});

test("relecture : nom long sur deux lignes, mention (DSQ), dossard TaekoPlan et ligne de club", () => {
  assert.deepEqual(names(page([item("(1) RODRIGUES FERNANDES", 48, 112, 76), item("Henrique marques BRA", 48, 118, 60)])),
    [["RODRIGUES FERNANDES Henrique marques", "BRA", 1, false]]);
  assert.deepEqual(names(page([
    item("B/6", 17, 258, 10), item("ALYAQOOB Shaikha", 56, 258, 66), item("Bahrain National Team BRN", 17, 267, 100),
    item("B/391", 790, 258, 19), item("GARBA Sara (DSQ)", 828, 258, 65), item("Jordan tigers JOR", 790, 267, 90),
    item("R/443", 790, 300, 19), item("ABU JAMOUS Hamam", 828, 300, 72),
  ])), [["ALYAQOOB Shaikha", null, null, false], ["GARBA Sara", null, null, false], ["ABU JAMOUS Hamam", null, null, false]]);
});

test("même athlète : initiales, nom coupé, prénom manquant au milieu ; pas d'homonyme approché d'un autre pays", () => {
  assert.ok(sameAthlete({ name: "PSARROS A.N.", country: "GRE" }, { name: "PSARROS Anastasios Nikolaos", country: "GRE" }));
  assert.ok(sameAthlete({ name: "MIYANYEDI ozkan", country: "GER" }, { name: "MIYANYEDI Semi ozkan", country: "GER" }));
  assert.ok(sameAthlete({ name: "KINTSURASHVIL", country: "GEO" }, { name: "KINTSURASHVILI Giorgi", country: "GEO" }));
  assert.ok(!sameAthlete({ name: "KINTSURASHVIL" }, { name: "KINTSURASHVILI Giorgi", country: "GEO" }));
  assert.ok(!sameAthlete({ name: "LEE Ye-Ji", country: "KOR" }, { name: "LEE Yumin", country: "KOR" }));
  assert.ok(!sameAthlete({ name: "KIM A.", country: "KOR" }, { name: "KIM Anna", country: "USA" }));
});

// Arbre de 8 lu sans l'athlète H ; la feuille, elle, l'imprime dans la colonne des athlètes.
const [div8] = buildBrackets(draw8());
const withoutH = { ...div8, entrants: div8.entrants.filter((e) => e.athleteId !== "H"), size: 7 };
const sheet = page([
  ...["A", "B", "C", "D"].map((name, i) => item(`${name}name Alpha XXX`, 20, 100 + i * 60)),
  ...["E", "F", "G", "H"].map((name, i) => item(`${name}name Alpha XXX`, 820, 100 + i * 60, 160)),
], 1, "Contestants: 8");
const named = (division) => ({ ...division, entrants: division.entrants.map((e) => ({ ...e, name: `${e.athleteId}name Alpha` })) });

test("vérification : l'athlète de la feuille absent de l'arbre est ajouté à sa place et signalé", () => {
  const { division, audit, added } = withSourceAthletes(named(withoutH), [sheet], { findPath: () => ["104", "202", "301"] });
  assert.equal(audit.declared, 8);
  assert.equal(audit.sourceCount, 8);
  assert.deepEqual(added.map((e) => [e.name, e.quarter, e.half]), [["Hname Alpha", "104", "202"]]);
  assert.equal(division.size, 8);
  assert.equal(division.entrants.at(-1).name, "Hname Alpha");
  assert.equal(division.status, "review");
  assert.ok(division.issues.some((i) => i.startsWith("Vérification du PDF : 1 athlète(s) absent(s) de la lecture")));
});

test("vérification : rien n'est ajouté hors de la colonne des athlètes, ni depuis une autre division de la page", () => {
  // Un nom décalé par rapport à la colonne des athlètes est signalé, jamais ajouté.
  const stray = page([...sheet.items, item("Hors Colonne XXX", 100, 500)], 1);
  const audit = auditDivision(named(withoutH), [stray]);
  assert.deepEqual(audit.missing.map((n) => n.name), ["Hname Alpha"]);
  assert.deepEqual(audit.uncertain.map((n) => n.name), ["Hors Colonne"]);
  // H appartient à une autre division imprimée sur la même page : il n'est pas ajouté ici.
  const other = { ...named(div8), key: "autre", entrants: [named(div8).entrants[7]] };
  const fromSibling = withSourceAthletes(named(withoutH), [sheet], { siblings: [other], findPath: () => ["104", "202", "301"] });
  assert.equal(fromSibling.added.length, 0);
  // Arbre complet : rien à ajouter, rien d'introuvable, division inchangée.
  const full = named(div8);
  const complete = withSourceAthletes(full, [sheet]);
  assert.equal(complete.added.length, 0);
  assert.deepEqual(complete.audit.notInSource, []);
  assert.equal(complete.division, full);
});

// PDF réels privés (jamais commités).
const locations = process.env.TKD_PDF_FIXTURES_DIRS ? JSON.parse(process.env.TKD_PDF_FIXTURES_DIRS)
  : [process.env.TKD_PDF_FIXTURES_DIR || "fixtures"];
const fixture = (file) => locations.map((directory) => join(directory, file)).find(existsSync);
const skip = (path) => !path && process.env.TKD_REQUIRE_PDF_FIXTURES !== "1" ? "Private PDF fixture unavailable; set TKD_PDF_FIXTURES_DIR" : false;
async function read(file) {
  const log = console.log; const warn = console.warn;
  console.log = () => {}; console.warn = () => {};
  try { return await readDraw(new File([readFileSync(fixture(file))], file, { type: "application/pdf" })); }
  finally { console.log = log; console.warn = warn; }
}

const muju = "ec531622-40fb-48ff-b7be-6525868f7ec2.pdf";
test(`real PDF: ${muju} (BASSETT Jaycee, code « WT » : lue par le moteur, rien à ajouter)`, { skip: skip(fixture(muju)) }, async () => {
  const draw = await read(muju);
  // Retrouvée d'abord par la vérification ; depuis la règle « WT » du moteur, elle est lue directement, à la même place.
  const bassett = draw.brackets[0].entrants.find((e) => e.name === "BASSETT Jaycee");
  assert.deepEqual([bassett?.country, bassett?.seed, bassett?.quarter, bassett?.half], ["WT", 4, "316", "219"]);
  assert.equal(draw.brackets[0].size, 31);
  assert.deepEqual([...draw.brackets[0].semiFights].sort(), ["219", "220"]);
  for (const { added, audit } of draw.brackets.map((d) => withSourceAthletes(d, draw.pages, { siblings: draw.brackets }))) {
    assert.deepEqual([added.length, audit.notInSource.length, audit.uncertain.length, audit.sourceCount], [0, 0, 0, 31]);
  }
});

for (const file of ["Draws - Day 1 - Fujairah Open 2025.pdf", "GO-2026_Draws_Cadets_Juniors.pdf", "euro_u21_2025.pdf", "Drawsheets Saturday Day 2.pdf"]) {
  test(`real PDF: ${file} (vérification sans fausse alerte)`, { skip: skip(fixture(file)) }, async () => {
    const draw = await read(file);
    for (const bracket of draw.brackets) {
      const { added, audit } = withSourceAthletes(bracket, draw.pages, { siblings: draw.brackets });
      assert.deepEqual([added.length, audit.notInSource.length, audit.uncertain.length], [0, 0, 0], `${bracket.category} p.${bracket.pages}`);
    }
  });
}
