import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildBrackets } from "../src/bracket-builder.ts";
import { readDraw } from "../src/read-draw.ts";
import { divisionResult, matchRankings, pageRankings, parseRankingRow, readRankings, readWinnerMarks } from "../src/result-reader.ts";
import { draw8 } from "./fixtures-bracket.mjs";

const item = (text, x, y, width = 150) => ({ text, x, y, width, height: 6 });
const page = (items, pageNumber = 1) => ({ pageNumber, width: 842, height: 595, items, lines: items,
  orderedText: items.map((i) => i.text), rawText: "", customWtFont: false, extractionMethod: "native", extractionConfidence: 0.95 });

test("ligne de classement : formats WT, Arab Cup (dossard) et pays collé au nom", () => {
  assert.deepEqual(parseRankingRow("1 DE MORAES Giovanni aubin (BRA)"), { rank: 1, name: "DE MORAES Giovanni aubin", country: "BRA" });
  assert.deepEqual(parseRankingRow("3 ASEM ATA ABU SREE' Moataz Bellah , EGY (82)"), { rank: 3, name: "ASEM ATA ABU SREE' Moataz Bellah", country: "EGY" });
  assert.deepEqual(parseRankingRow("2 HSU Hao-yu TPE"), { rank: 2, name: "HSU Hao-yu", country: "TPE" });
  assert.equal(parseRankingRow("PTF 2 - 1"), null);
});

test("tableau de classement : colonne des rangs seulement, morceaux de l'arbre voisins écartés, pays dans un morceau à part", () => {
  const rows = pageRankings(page([
    item("Classification", 373, 469), item("AYAZ H. (TUR)", 182, 477), item("DIAWARA A. (GER)", 605, 477),
    item("1 ASEM ATA ABU SREE Moataz Bellah", 348, 484), item("EGY", 498, 484, 20), item("PTF 2-1", 182, 485),
    item("2 DIAWARA Abdoul Aziz Aboubacar", 348, 499), item("GER", 492, 499, 20),
    item("3 ERMAKOV Artem", 348, 514), item("RUS", 425, 514, 20), item("3 ROUNTARIS Stylianos", 348, 529), item("GRE", 446, 529, 20),
    item("RSC: Win by Referee stops contest", 348, 560),
  ]));
  assert.deepEqual(rows, [[
    { rank: 1, name: "ASEM ATA ABU SREE Moataz Bellah", country: "EGY" }, { rank: 2, name: "DIAWARA Abdoul Aziz Aboubacar", country: "GER" },
    { rank: 3, name: "ERMAKOV Artem", country: "RUS" }, { rank: 3, name: "ROUNTARIS Stylianos", country: "GRE" },
  ]]);
  // Tableau réimprimé à l'identique sur la page suivante (tableau coupé) : compté une fois.
  const table = [item("Prize winners:", 294, 450), item("1 ALDAOUD Jafar , JOR (265)", 296, 475), item("2 AL TOOQI Nibras , OMA (686)", 296, 488)];
  assert.deepEqual(readRankings([page(table, 1), page(table, 2)]).map((r) => r.pages), [[1, 2]]);
});

// Tableau de 8 : quarts 101-104 (A-B, C-D, E-F, G-H), demies 201-202, finale 301.
const [div8] = buildBrackets(draw8());
const named = { ...div8, entrants: div8.entrants.map((e) => ({ ...e, name: `${e.athleteId}name Alpha` })) };
const row = (rank, id) => ({ rank, name: `${id}name Alpha`, country: "XXX" });

test("résultat : podium lu, battus en quart déduits quand l'arbre les rend certains", () => {
  const result = divisionResult(named, { pages: [1], rows: [row(1, "A"), row(2, "H"), row(3, "C"), row(3, "F")] });
  assert.deepEqual(result.places, { gold: ["A"], silver: ["H"], bronze: ["C", "F"], quarter: ["B", "G", "D", "E"] });
  assert.deepEqual(result.deduced, ["B", "G", "D", "E"]);
  assert.deepEqual(result.issues, []);
});

test("résultat : un classement incohérent avec l'arbre est signalé, jamais forcé ; nom introuvable signalé", () => {
  // A et B se rencontrent en quart : ils ne peuvent pas être 1er et 3e.
  const result = divisionResult(named, { pages: [1], rows: [row(1, "A"), row(2, "H"), row(3, "B"), row(3, "Z")] });
  assert.deepEqual([result.places.gold, result.places.bronze], [["A"], []]);
  assert.ok(result.issues.some((i) => i.startsWith("3 Bname Alpha : incohérent")));
  assert.ok(result.issues.some((i) => i.includes("introuvable") && i.includes("Zname Alpha")));
});

test("association : chaque division reçoit le classement de ses athlètes, rien si aucun ou ambigu", () => {
  const other = { ...named, entrants: named.entrants.map((e) => ({ ...e, name: `${e.athleteId}autre Beta` })) };
  const rankings = [{ pages: [2], rows: [row(1, "A"), row(2, "H"), row(3, "C"), row(3, "F")] }];
  const [mine, theirs] = matchRankings([{ id: "d1", bracket: named }, { id: "d2", bracket: other }], rankings);
  assert.deepEqual([mine.result?.places.gold, theirs.result], [["A"], null]);
  const twice = matchRankings([{ id: "d1", bracket: named }], [...rankings, { pages: [3], rows: rankings[0].rows }]);
  assert.deepEqual([twice[0].result, twice[0].ambiguous], [null, true]);
});

test("vainqueurs des combats : le nom abrégé est rattaché à la case du combat collée à lui", () => {
  const marks = readWinnerMarks([page([
    item("324", 230, 470, 13), item("TSANG C. H. (HKG)", 249, 469, 60), item("PTF 2 - 1", 249, 475, 40),
    item("617", 584, 470, 13), item("DE DIOS JOSE A. (ESP)", 522, 467, 60),
    item("1 DE MORAES Giovanni aubin (BRA)", 346, 463),
  ])]);
  assert.deepEqual(marks, [
    { page: 1, name: "TSANG C. H.", country: "HKG", fight: "324" }, { page: 1, name: "DE DIOS JOSE A.", country: "ESP", fight: "617" },
  ]);
});

test("résultat par les combats seuls : podium et battus en quart, sans tableau de classement", () => {
  const mark = (id, fight) => ({ page: 1, name: `${id}name A.`, country: "XXX", fight });
  // A bat B (101), C bat D (102), F bat E (103), H bat G (104) ; A bat C (201), H bat F (202) ; A bat H (301).
  const marks = [mark("A", "101"), mark("C", "102"), mark("F", "103"), mark("H", "104"), mark("A", "201"), mark("H", "202"), mark("A", "301")];
  const result = divisionResult(named, null, marks);
  assert.deepEqual(result.places, { gold: ["A"], silver: ["H"], bronze: ["C", "F"], quarter: ["B", "D", "E", "G"] });
  assert.deepEqual(result.issues, []);
  // Un nom collé à une case qui contredit la branche (C en finale alors que A a gagné la demie) n'est pas retenu.
  const wrong = divisionResult(named, null, [...marks.slice(0, 6), mark("C", "301")]);
  assert.deepEqual([wrong.places.gold, wrong.places.silver], [[], []]);
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
const results = (draw, withWinners = false) => matchRankings(draw.brackets.map((b, i) => ({ id: String(i), bracket: b })), readRankings(draw.pages),
  withWinners ? readWinnerMarks(draw.pages) : []);

const wtResults = "Results-Competition-Draw-Sheet-Seniors.pdf";
test(`real PDF: ${wtResults} (16 classements, podiums cohérents)`, { skip: skip(fixture(wtResults)) }, async () => {
  const draw = await read(wtResults);
  const matched = results(draw);
  assert.equal(matched.filter((m) => m.result && m.result.places.gold.length === 1 && m.result.places.silver.length === 1 && !m.result.issues.length).length, 16);
  const first = draw.brackets[0];
  const names = (ids) => ids.map((id) => first.entrants.find((e) => e.athleteId === id)?.name);
  assert.deepEqual([names(matched[0].result.places.gold), names(matched[0].result.places.silver)], [["DE MORAES Giovanni aubin"], ["HIDAYAT Aziz"]]);
  assert.deepEqual(names(matched[0].result.places.bronze).sort(), ["CHAU Ngai long", "PANG Keston"]);
  // Étape 2 : ce que les combats seuls donnent est toujours conforme au classement officiel (jamais contredit),
  // et ajoute les battus en quart ; un vainqueur incertain reste vide.
  const marks = readWinnerMarks(draw.pages);
  let golds = 0;
  draw.brackets.forEach((bracket, i) => {
    const byFights = divisionResult(bracket, null, marks).places;
    for (const place of ["gold", "silver", "bronze"]) {
      for (const id of byFights[place]) assert.ok(matched[i].result.places[place].includes(id), `${bracket.category} ${place}`);
    }
    golds += byFights.gold.length;
  });
  assert.ok(golds >= 14, `${golds} vainqueurs trouvés par les combats`);
  const combined = results(draw, true);
  assert.ok(combined.reduce((n, m) => n + m.result.places.quarter.length, 0) >= 56);
});

const taekoplan = "draw with result taekoplan fornat.pdf";
test(`real PDF: ${taekoplan} (classement officiel qui révèle un arbre mal lu)`, { skip: skip(fixture(taekoplan)) }, async () => {
  const draw = await read(taekoplan);
  const matched = results(draw);
  assert.equal(matched.filter((m) => m.result).length, 16);
  const men58 = matched[draw.brackets.findIndex((b) => b.category === "Senior · Men · -58 kg")];
  assert.ok(men58.result.issues.some((i) => i.startsWith("3 SOKOLOWSKI Antoni : incohérent")));
});
