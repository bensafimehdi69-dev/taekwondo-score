import test from "node:test";
import assert from "node:assert/strict";
import { buildBrackets } from "../src/bracket-builder.ts";
import { advance, buildTree, chainOf, clearSlot, participants, placesFromState, playableSlots, stateFromPlaces } from "../src/bracket-tree.ts";
import { validatePrediction } from "../src/prediction.ts";
import { picksFromPlaces } from "../src/model.ts";
import { athlete, draw6, draw8 } from "./fixtures-bracket.mjs";

// Tableau de 16 : huitièmes 101-108, quarts 201-204, demies 301-302, finale 401.
const draw16 = () => ({ pageCount: 1, ocrPageCount: 0, warnings: [], athletes: "ABCDEFGHIJKLMNOP".split("").map((id, i) =>
  athlete(id, i < 8 ? "left" : "right", 100 + (i % 8) * 40, [String(101 + (i >> 1)), String(201 + (i >> 2)), String(301 + (i >> 3)), "401"])) });
const [div16] = buildBrackets(draw16());
const tree16 = buildTree(div16);
const run = (tree, taps) => taps.reduce((state, id) => advance(tree, state, id), {});

test("arbre de 16 : moitiés, profondeur, chaîne de cases d'un athlète", () => {
  assert.equal(tree16.final.code, "401");
  assert.deepEqual(tree16.halves.map((h) => h.code), ["301", "302"]);
  assert.equal(tree16.depth, 3);
  assert.deepEqual(chainOf(tree16, "A"), ["101", "201", "301", "401"]);
  assert.equal(playableSlots(tree16).length, 15);
});

test("faire avancer : quart, demie, finale, titre ; un rival prend la case et libère les tours suivants", () => {
  let state = run(tree16, ["A", "A", "A", "A"]);
  assert.deepEqual(state, { 101: "A", 201: "A", 301: "A", 401: "A" });
  // B, adversaire de A au premier tour, prend la case du quart : A disparaît de tous les tours suivants.
  state = advance(tree16, state, "B");
  assert.deepEqual(state, { 101: "B" });
  // Vider une case retire son occupant des tours suivants seulement.
  state = run(tree16, ["C", "C", "C"]);
  assert.deepEqual(clearSlot(tree16, state, "201"), { 102: "C" });
});

test("impossible par construction : deux finalistes du même haut de tableau", () => {
  const state = run(tree16, ["A", "A", "A", "C", "C", "C"]);
  // C appartient au même demi-tableau que A : il remplace A en finale au lieu d'y être en plus.
  assert.equal(state["301"], "C");
  assert.equal(Object.values(state).filter((v) => v === "A").length, 1);
});

test("places déduites : seul ce qui est décidé compte, et le pronostic complet est cohérent", () => {
  assert.deepEqual(placesFromState(tree16, run(tree16, ["A", "C", "A"])), { gold: [], silver: [], bronze: [], quarter: ["C"] });
  const full = run(tree16, ["A", "C", "E", "G", "I", "K", "M", "O", "A", "E", "I", "M", "A", "I", "A"]);
  const places = placesFromState(tree16, full);
  assert.deepEqual(places, { gold: ["A"], silver: ["I"], bronze: ["E", "M"], quarter: ["C", "G", "K", "O"] });
  assert.deepEqual(validatePrediction(div16, picksFromPlaces(places)), { valid: true, issues: [] });
  // Aller-retour : l'arbre reconstitué depuis les places redonne les mêmes places.
  assert.deepEqual(placesFromState(tree16, stateFromPlaces(tree16, places)), places);
});

test("tableau de 8 : les quarts de finalistes sont fixés, on commence aux demies", () => {
  const [div8] = buildBrackets(draw8());
  const tree = buildTree(div8);
  // Quarts 101-104 (participants fixés : les athlètes eux-mêmes), demies 201-202, finale 301.
  assert.deepEqual(chainOf(tree, "A"), ["101", "201", "301"]);
  const state = run(tree, ["A", "A", "A", "H", "H"]);
  // A et H en finale, A vainqueur ; leurs adversaires de quart (B, G) sont battus en quart ; les demies restent à décider.
  assert.deepEqual(placesFromState(tree, state), { gold: ["A"], silver: ["H"], bronze: [], quarter: ["B", "G"] });
  const places = { gold: ["A"], silver: ["H"], bronze: ["C", "F"], quarter: ["B", "D", "E", "G"] };
  assert.deepEqual(placesFromState(tree, stateFromPlaces(tree, places)), places);
});

test("exempts : un athlète qui entre en demi-finale a une chaîne plus courte", () => {
  const [div6] = buildBrackets(draw6());
  const tree = buildTree(div6);
  assert.deepEqual(chainOf(tree, "C"), ["201", "301"]);
  const places = { gold: ["C"], silver: ["F"], bronze: ["A", "D"], quarter: ["B", "E"] };
  assert.deepEqual(placesFromState(tree, stateFromPlaces(tree, places)), places);
});

// PDF réels privés (jamais commités) : arbres de toutes formes (64 raccordés sur trois pages, exempts, petits tableaux).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readDraw } from "../src/read-draw.ts";
const locations = process.env.TKD_PDF_FIXTURES_DIRS ? JSON.parse(process.env.TKD_PDF_FIXTURES_DIRS)
  : [process.env.TKD_PDF_FIXTURES_DIR || "fixtures"];
const fixture = (file) => locations.map((directory) => join(directory, file)).find(existsSync);
for (const file of ["Draws - Day 1 - Fujairah Open 2025.pdf", "ec531622-40fb-48ff-b7be-6525868f7ec2.pdf", "GO-2026_Draws_Cadets_Juniors.pdf", "spanish_open_2026.pdf"]) {
  const path = fixture(file);
  test(`real PDF: ${file} (arbres rejouables jusqu'au titre)`, { skip: !path && process.env.TKD_REQUIRE_PDF_FIXTURES !== "1" ? "Private PDF fixture unavailable; set TKD_PDF_FIXTURES_DIR" : false }, async () => {
    const log = console.log; const warn = console.warn;
    console.log = () => {}; console.warn = () => {};
    let draw;
    try { draw = await readDraw(new File([readFileSync(path)], file, { type: "application/pdf" })); }
    finally { console.log = log; console.warn = warn; }
    let seed = 7;
    const random = (n) => { seed = (seed * 16807) % 2147483647; return seed % n; };
    for (const division of draw.brackets.filter((d) => d.status === "ok")) {
      const tree = buildTree(division);
      for (const entrant of division.entrants) assert.equal(chainOf(tree, entrant.athleteId).at(-1), tree.final.id, division.category);
      // Pronostic partiel au hasard : toujours cohérent avec l'arbre.
      let partial = {};
      for (let i = 0; i < 60; i += 1) partial = advance(tree, partial, division.entrants[random(division.entrants.length)].athleteId);
      const partialCheck = validatePrediction(division, picksFromPlaces(placesFromState(tree, partial)), { requireComplete: false });
      assert.deepEqual(partialCheck, { valid: true, issues: [] }, `${division.category} partiel`);
      // Pronostic complet, tour par tour (quarts, demies, finale, titre) : cohérent et complet, aller-retour exact.
      let state = {};
      const leavesUnder = (node) => node.kind === "athlete" ? [node.entrant.athleteId] : node.children.flatMap(leavesUnder);
      const walk = (node, level, out) => { if (node.kind !== "fight") return; if (node.level === level) out.push(node); else node.children.forEach((c) => walk(c, level, out)); return out; };
      for (const level of [3, 2, 1, 0]) {
        for (const node of walk(tree.final, level, [])) {
          const candidates = level === 3 ? leavesUnder(node) : participants(state, node).filter(Boolean);
          state = advance(tree, state, candidates[random(candidates.length)]);
        }
      }
      const places = placesFromState(tree, state);
      assert.deepEqual(validatePrediction(division, picksFromPlaces(places)), { valid: true, issues: [] }, `${division.category} p.${division.pages}`);
      assert.deepEqual(placesFromState(tree, stateFromPlaces(tree, places)), places, division.category);
    }
  });
}

test("géométrie de la feuille : moitiés en miroir, une case par combat jouable, traits reliant chaque combat", async () => {
  const { layoutSheet, SHEET } = await import("../src/bracket-layout.ts");
  const sheet = layoutSheet(tree16);
  const kinds = (k) => sheet.boxes.filter((b) => b.kind === k);
  assert.equal(kinds("athlete").length, 16);
  assert.equal(kinds("slot").length, 15);
  assert.equal(kinds("chip").length, 0);
  assert.equal(sheet.lines.length, 30);
  const a = kinds("athlete").find((b) => b.athleteId === "A");
  const p = kinds("athlete").find((b) => b.athleteId === "P");
  assert.deepEqual([a.side, a.x, p.side, p.x + p.w], ["left", 0, "right", sheet.width]);
  const champion = kinds("slot").find((b) => b.level === 0);
  assert.equal(champion.side, "center");
  assert.equal(Math.round(champion.x + champion.w / 2), Math.round(sheet.width / 2));
  // Case d'un huitième : à mi-hauteur de ses deux athlètes.
  const slot101 = kinds("slot").find((b) => b.key === "101");
  const b = kinds("athlete").find((x) => x.athleteId === "B");
  assert.equal(slot101.y, (a.y + b.y) / 2);
  assert.deepEqual(sheet.labels.map((l) => l.text), ["Quarts", "Quarts", "Demies", "Demies", "Finale", "Finale", "Vainqueur"]);
  assert.equal(sheet.height, SHEET.top + 8 * SHEET.row + SHEET.boxHeight);
});

test("arbre enregistré relu : cases disparues ou sans suite écartées", async () => {
  const { sanitizeState } = await import("../src/bracket-tree.ts");
  assert.deepEqual(sanitizeState(tree16, { 101: "A", 201: "A", 999: "A", 102: "Z", 301: "C" }), { 101: "A", 201: "A" });
  assert.deepEqual(sanitizeState(tree16, undefined), {});
});
