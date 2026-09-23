import test from "node:test";
import assert from "node:assert/strict";
import { buildBrackets } from "../src/bracket-builder.ts";
import { allowedPlaces, buildTree, chainOf, participants, placesFromState, playableSlots, sanitizePlaces, setPlace, stateFromPlaces } from "../src/bracket-tree.ts";
import { validatePrediction } from "../src/prediction.ts";
import { picksFromPlaces } from "../src/model.ts";
import { athlete, draw6, draw8 } from "./fixtures-bracket.mjs";

// Tableau de 16 : huitièmes 101-108, quarts 201-204, demies 301-302, finale 401.
const draw16 = () => ({ pageCount: 1, ocrPageCount: 0, warnings: [], athletes: "ABCDEFGHIJKLMNOP".split("").map((id, i) =>
  athlete(id, i < 8 ? "left" : "right", 100 + (i % 8) * 40, [String(101 + (i >> 1)), String(201 + (i >> 2)), String(301 + (i >> 3)), "401"])) });
const [div16] = buildBrackets(draw16());
const tree16 = buildTree(div16);
const empty = () => ({ gold: [], silver: [], bronze: [], quarter: [] });
const assign = (tree, steps, from = empty()) => steps.reduce((places, [id, place]) => setPlace(tree, places, id, place).places, from);

test("arbre de 16 : moitiés, profondeur, chaîne de cases d'un athlète", () => {
  assert.equal(tree16.final.code, "401");
  assert.deepEqual(tree16.halves.map((h) => h.code), ["301", "302"]);
  assert.equal(tree16.depth, 3);
  assert.deepEqual(chainOf(tree16, "A"), ["101", "201", "301", "401"]);
  assert.equal(playableSlots(tree16).length, 15);
});

test("une place dessine tout le chemin : vainqueur jusqu'au titre, battu en quart jusqu'aux quarts", () => {
  assert.deepEqual(stateFromPlaces(tree16, assign(tree16, [["A", "gold"]])), { 101: "A", 201: "A", 301: "A", 401: "A" });
  assert.deepEqual(stateFromPlaces(tree16, assign(tree16, [["I", "silver"]])), { 105: "I", 203: "I", 302: "I" });
  assert.deepEqual(stateFromPlaces(tree16, assign(tree16, [["E", "bronze"]])), { 103: "E", 202: "E" });
  assert.deepEqual(stateFromPlaces(tree16, assign(tree16, [["C", "quarter"]])), { 102: "C" });
  // Changer de place redessine le chemin ; « Retirer » l'efface.
  assert.deepEqual(assign(tree16, [["A", "gold"], ["A", "bronze"]]), { ...empty(), bronze: ["A"] });
  assert.deepEqual(assign(tree16, [["A", "gold"], ["A", null]]), empty());
});

test("conflits : le dernier choix l'emporte, les autres descendent comme sur le tapis", () => {
  const complete = assign(tree16, [["A", "gold"], ["I", "silver"], ["E", "bronze"], ["M", "bronze"],
    ["C", "quarter"], ["G", "quarter"], ["K", "quarter"], ["O", "quarter"]]);
  assert.deepEqual(complete, { gold: ["A"], silver: ["I"], bronze: ["E", "M"], quarter: ["C", "G", "K", "O"] });
  assert.deepEqual(validatePrediction(div16, picksFromPlaces(complete)), { valid: true, issues: [] });
  // I (autre moitié) devient vainqueur : A et I se retrouvent en finale, A passe finaliste.
  let move = setPlace(tree16, complete, "I", "gold");
  assert.deepEqual([move.places.gold, move.places.silver], [["I"], ["A"]]);
  assert.deepEqual(move.changes, [{ athleteId: "A", from: "gold", to: "silver" }]);
  // E (même moitié que A) devient vainqueur : il bat A en demie, A passe 3e ; I reste finaliste.
  move = setPlace(tree16, complete, "E", "gold");
  assert.deepEqual(move.places, { gold: ["E"], silver: ["I"], bronze: ["M", "A"], quarter: ["C", "G", "K", "O"] });
  assert.deepEqual(move.changes, [{ athleteId: "A", from: "gold", to: "bronze" }]);
  // B, adversaire de A au premier tour, devient vainqueur : A est battu en huitième et perd sa place,
  // C (battu en quart par A) l'est désormais par B.
  move = setPlace(tree16, complete, "B", "gold");
  assert.deepEqual(move.places.gold, ["B"]);
  assert.deepEqual(move.changes, [{ athleteId: "A", from: "gold" }]);
  assert.ok(move.places.quarter.includes("C"));
  // G, battu en quart par E, passe 3e : il bat E en quart, E devient battu en quart (échange).
  move = setPlace(tree16, complete, "G", "bronze");
  assert.deepEqual([move.places.bronze, move.places.quarter], [["M", "G"], ["C", "K", "O", "E"]]);
  assert.deepEqual(move.changes, [{ athleteId: "E", from: "bronze", to: "quarter" }]);
  // Deux 3e de la même demie sans finaliste désigné : l'un des deux l'a gagnée, l'app n'invente pas lequel.
  const twice = setPlace(tree16, assign(tree16, [["E", "bronze"]]), "C", "bronze");
  assert.deepEqual([twice.places.bronze, twice.changes], [["C"], [{ athleteId: "E", from: "bronze" }]]);
  // Toujours cohérent avec l'arbre, quel que soit l'ordre des choix.
  for (const places of [move.places, setPlace(tree16, complete, "B", "gold").places, setPlace(tree16, complete, "D", "quarter").places]) {
    assert.deepEqual(validatePrediction(div16, picksFromPlaces(places), { requireComplete: false }), { valid: true, issues: [] });
    assert.deepEqual(placesFromState(tree16, stateFromPlaces(tree16, places)).gold, places.gold);
  }
});

test("pronostic complet : aller-retour exact entre places et arbre", () => {
  const places = { gold: ["A"], silver: ["I"], bronze: ["E", "M"], quarter: ["C", "G", "K", "O"] };
  assert.deepEqual(placesFromState(tree16, stateFromPlaces(tree16, places)), places);
});

test("tableau de 8 : les quarts de finalistes sont fixés, on commence aux demies", () => {
  const [div8] = buildBrackets(draw8());
  const tree = buildTree(div8);
  // Quarts 101-104 (participants fixés : les athlètes eux-mêmes), demies 201-202, finale 301.
  assert.deepEqual(chainOf(tree, "A"), ["101", "201", "301"]);
  // Battu en quart : l'athlète est déjà en quart, son chemin ne dessine rien de plus ; deux battus du même quart impossibles.
  const quarter = assign(tree, [["A", "gold"], ["B", "quarter"]]);
  assert.deepEqual(stateFromPlaces(tree, quarter), { 101: "A", 201: "A", 301: "A" });
  assert.deepEqual(setPlace(tree, quarter, "C", "quarter").places.quarter, ["B", "C"]);
  assert.deepEqual(setPlace(tree, assign(tree, [["B", "quarter"]]), "A", "quarter").places.quarter, ["A"]);
  const places = { gold: ["A"], silver: ["H"], bronze: ["C", "F"], quarter: ["B", "D", "E", "G"] };
  assert.deepEqual(placesFromState(tree, stateFromPlaces(tree, places)), places);
});

test("exempts : un athlète qui entre en demi-finale a une chaîne plus courte", () => {
  const [div6] = buildBrackets(draw6());
  const tree = buildTree(div6);
  assert.deepEqual(chainOf(tree, "C"), ["201", "301"]);
  // C entre directement en demie : « battu en quart » ne lui est pas proposé.
  assert.deepEqual(allowedPlaces(tree, "C"), ["bronze", "silver", "gold"]);
  assert.deepEqual(allowedPlaces(tree, "A"), ["quarter", "bronze", "silver", "gold"]);
  assert.deepEqual(stateFromPlaces(tree, assign(tree, [["C", "bronze"]])), {});
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
      // Places données au hasard, dans le désordre, avec conflits : toujours cohérent avec l'arbre.
      let partial = empty();
      for (let i = 0; i < 60; i += 1) {
        const id = division.entrants[random(division.entrants.length)].athleteId;
        const allowed = allowedPlaces(tree, id);
        partial = setPlace(tree, partial, id, allowed[random(allowed.length)]).places;
        const partialCheck = validatePrediction(division, picksFromPlaces(partial), { requireComplete: false });
        assert.deepEqual(partialCheck, { valid: true, issues: [] }, `${division.category} partiel`);
        assert.deepEqual(sanitizePlaces(tree, partial), partial, `${division.category} relu`);
      }
      // Pronostic complet tiré tour par tour (quarts, demies, finale, titre) puis ressaisi place par place.
      const advance = (state, id) => {
        const chain = chainOf(tree, id);
        const next = chain.find((key) => state[key] !== id);
        return next ? { ...state, [next]: id } : state;
      };
      let state = {};
      const leavesUnder = (node) => node.kind === "athlete" ? [node.entrant.athleteId] : node.children.flatMap(leavesUnder);
      const walk = (node, level, out) => { if (node.kind !== "fight") return; if (node.level === level) out.push(node); else node.children.forEach((c) => walk(c, level, out)); return out; };
      for (const level of [3, 2, 1, 0]) {
        for (const node of walk(tree.final, level, [])) {
          const candidates = level === 3 ? leavesUnder(node) : participants(state, node).filter(Boolean);
          state = advance(state, candidates[random(candidates.length)]);
        }
      }
      const places = placesFromState(tree, state);
      assert.deepEqual(validatePrediction(division, picksFromPlaces(places)), { valid: true, issues: [] }, `${division.category} p.${division.pages}`);
      assert.deepEqual(placesFromState(tree, stateFromPlaces(tree, places)), places, division.category);
      const replayed = ["quarter", "bronze", "silver", "gold"].flatMap((p) => places[p].map((id) => [id, p]));
      for (let i = replayed.length - 1; i > 0; i -= 1) { const j = random(i + 1); [replayed[i], replayed[j]] = [replayed[j], replayed[i]]; }
      const retyped = assign(tree, replayed);
      for (const p of ["gold", "silver", "bronze", "quarter"]) assert.deepEqual([...retyped[p]].sort(), [...places[p]].sort(), `${division.category} ${p}`);
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

test("pronostic relu sur un tirage corrigé : athlète disparu, doublon ou place devenue incohérente écartés", () => {
  const stored = { gold: ["A", "Z"], silver: ["C"], bronze: ["E", "A"], quarter: ["K", "L"] };
  assert.deepEqual(sanitizePlaces(tree16, stored), { gold: ["A"], silver: [], bronze: ["E"], quarter: ["K"] });
});
