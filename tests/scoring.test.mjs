import test from "node:test";
import assert from "node:assert/strict";
import { buildBrackets } from "../src/bracket-builder.ts";
import { bracketOf, divisionDoc, divisionId } from "../src/model.ts";
import { rankEntries, roundPoints, scoreDivision, sumScores } from "../src/scoring.ts";
import { draw8 } from "./fixtures-bracket.mjs";

const [div8] = buildBrackets(draw8());
const picks = (gold, silver, bronze, quarter) => [
  ...(gold ? [{ athleteId: gold, place: "gold" }] : []), ...(silver ? [{ athleteId: silver, place: "silver" }] : []),
  ...bronze.map((athleteId) => ({ athleteId, place: "bronze" })), ...quarter.map((athleteId) => ({ athleteId, place: "quarter" })),
];
// Résultat réel : A (seed 1) bat H (seed 2) ; C (seed 3) et F (seed 4) en bronze.
const result = { gold: "A", silver: "H", bronze: ["C", "F"], quarter: ["B", "D", "E", "G"] };

test("points d'une division : complet, partiel, incohérent", () => {
  const scores = scoreDivision(div8, result, [
    { uid: "parfait", picks: picks("A", "H", ["C", "F"], ["B", "D", "E", "G"]) },
    { uid: "partiel", picks: picks("A", undefined, [], []) },
    { uid: "incoherent", picks: picks("A", "C", [], []) },
  ]);
  const byUid = Object.fromEntries(scores.map((s) => [s.uid, s]));
  // Socle : 10 + 8 + 2×6 + 4×3 = 42 ; bonus +100 % pour les 4 non-têtes de série battus en quart : +12.
  assert.deepEqual(byUid.parfait, { uid: "parfait", total: 54, exactGolds: 1, valid: true });
  assert.deepEqual(byUid.partiel, { uid: "partiel", total: 10, exactGolds: 1, valid: true });
  // A et C sont dans la même moitié : ils ne peuvent pas se rencontrer en finale.
  assert.deepEqual(byUid.incoherent, { uid: "incoherent", total: 0, exactGolds: 0, valid: false });
});

test("cumul et classement : points, puis vainqueurs exacts, puis ancienneté", () => {
  assert.equal(roundPoints(0.1 + 0.2), 0.3);
  const totals = sumScores([
    { uid: "a", total: 10.5, exactGolds: 1 }, { uid: "b", total: 20, exactGolds: 0 }, { uid: "a", total: 9.5, exactGolds: 0 },
    { uid: "c", total: 20, exactGolds: 1 },
  ]);
  assert.deepEqual(Object.fromEntries(totals), { a: { points: 20, exactGolds: 1 }, b: { points: 20, exactGolds: 0 }, c: { points: 20, exactGolds: 1 } });
  const ranked = rankEntries([...totals].map(([uid, t]) => ({
    uid, displayName: uid.toUpperCase(), ...t, registeredAt: new Date(uid === "c" ? "2026-01-01" : "2026-05-01"),
  })));
  assert.deepEqual(ranked.map((r) => [r.rank, r.uid]), [[1, "c"], [2, "a"], [3, "b"]]);
});

test("identifiant de division stable et lisible ; arbre relu depuis le document", () => {
  const doc = divisionDoc({ ...div8, category: "Senior · Men · -58 kg" }, {
    day: "2026-10-12", lockAt: new Date("2026-10-12T06:00:00Z"), source: { fileName: "t.pdf", sha256: "x", pages: [3] },
  });
  assert.equal(divisionId(doc), "2026-10-12_senior-men-moins58-kg_301");
  assert.equal(divisionId({ ...doc, category: "Junior · Women · +73 kg" }), "2026-10-12_junior-women-plus73-kg_301");
  const bracket = bracketOf("d1", doc);
  assert.equal(bracket.size, 8);
  assert.deepEqual(bracket.pages, [3]);
  assert.deepEqual(bracket.semiFights, div8.semiFights);
});
