import test from "node:test";
import assert from "node:assert/strict";
import { buildBrackets } from "../src/bracket-builder.ts";
import { validatePrediction, validateResult, scorePrediction, expectedPicks, rankLeaderboard } from "../src/prediction.ts";
import { draw8, draw6 } from "./fixtures-bracket.mjs";

const picks = (gold, silver, bronze, quarter) => [
  { athleteId: gold, place: "gold" }, { athleteId: silver, place: "silver" },
  ...bronze.map((athleteId) => ({ athleteId, place: "bronze" })),
  ...quarter.map((athleteId) => ({ athleteId, place: "quarter" })),
];
const [div8] = buildBrackets(draw8());

test("accepte un pronostic cohérent avec l'arbre", () => {
  const result = validatePrediction(div8, picks("A", "H", ["C", "F"], ["B", "D", "E", "G"]));
  assert.deepEqual(result, { valid: true, issues: [] });
});

test("refuse un vainqueur et un finaliste de la même moitié", () => {
  const result = validatePrediction(div8, picks("A", "C", ["F", "H"], ["B", "D", "E", "G"]));
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((i) => i.includes("même moitié")));
});

test("refuse deux médaillés issus du même quart d'arbre", () => {
  const result = validatePrediction(div8, picks("A", "H", ["B", "F"], ["C", "D", "E", "G"]));
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((i) => i.includes("même quart")));
});

test("adapte le nombre de places aux exempts", () => {
  const [div6] = buildBrackets(draw6());
  assert.deepEqual(expectedPicks(div6), { gold: 1, silver: 1, bronze: 2, quarter: 2 });
  assert.ok(validatePrediction(div6, picks("A", "D", ["C", "F"], ["B", "E"])).valid);
  const bad = validatePrediction(div6, picks("A", "D", ["B", "E"], ["C", "F"]));
  assert.ok(bad.issues.some((i) => i.includes("directement en demi-finale")));
});

test("tolère un pronostic partiel si on ne l'exige pas complet", () => {
  assert.ok(validatePrediction(div8, [{ athleteId: "A", place: "gold" }], { requireComplete: false }).valid);
  assert.equal(validatePrediction(div8, [{ athleteId: "A", place: "gold" }]).valid, false);
});

test("barème : les favoris à leur place ne rapportent pas de bonus", () => {
  const result = { gold: "A", silver: "H", bronze: ["C", "F"], quarter: ["B", "D", "E", "G"] };
  assert.ok(validateResult(div8, result).valid);
  const score = scorePrediction(div8, picks("A", "H", ["C", "F"], ["B", "D", "E", "G"]), result);
  // or 10 + argent 8 + 2 bronzes 6 + 4 quarts non têtes de série 3 × 2
  assert.equal(score.total, 10 + 8 + 6 + 6 + 4 * 6);
  assert.equal(score.exactGolds, 1);
});

test("barème : bonus d'audace et points partiels", () => {
  const result = { gold: "B", silver: "H", bronze: ["C", "F"], quarter: ["A", "D", "E", "G"] };
  const score = scorePrediction(div8, picks("B", "F", ["A", "H"], []), result);
  const line = (id) => score.lines.find((l) => l.athleteId === id);
  assert.equal(line("B").points, 20); // non tête de série vainqueur : +100 %
  assert.equal(line("F").points, 1);  // médaillé, mais pas finaliste
  assert.equal(line("A").points, 1);  // dans le top 8, mauvaise place
  assert.equal(line("H").points, 1);
});

test("barème : une tête de série qui dépasse sa place attendue prend +50 %", () => {
  const index = draw8();
  index.athletes.find((a) => a.id === "E").seed = 6;
  const [division] = buildBrackets(index);
  const result = { gold: "E", silver: "A", bronze: ["C", "H"], quarter: ["B", "D", "F", "G"] };
  const score = scorePrediction(division, [{ athleteId: "E", place: "gold" }], result);
  assert.equal(score.total, 15);
});

test("classement : cumul brut puis départage", () => {
  const ranked = rankLeaderboard([
    { userId: "u1", points: 40, exactGolds: 1, registeredAt: "2026-09-01" },
    { userId: "u2", points: 40, exactGolds: 2, registeredAt: "2026-09-10" },
    { userId: "u3", points: 55, exactGolds: 0, registeredAt: "2026-09-20" },
  ]);
  assert.deepEqual(ranked.map((r) => r.userId), ["u3", "u2", "u1"]);
});

test("refuse deux quarts de finalistes issus de la même branche (ils se rencontrent avant les quarts)", async () => {
  const { athlete } = await import("./fixtures-bracket.mjs");
  // Tableau de 16 : huitièmes 101-108, quarts 201-204, demies 301-302, finale 401. A et B s'affrontent au combat 101.
  const draw16 = { pageCount: 1, ocrPageCount: 0, warnings: [], athletes: "ABCDEFGHIJKLMNOP".split("").map((id, i) =>
    athlete(id, i < 8 ? "left" : "right", 100 + (i % 8) * 40, [String(101 + (i >> 1)), String(201 + (i >> 2)), String(301 + (i >> 3)), "401"])) };
  const [div16] = buildBrackets(draw16);
  const ok = validatePrediction(div16, picks("A", "I", ["E", "M"], ["C", "G", "K", "O"]));
  assert.deepEqual(ok, { valid: true, issues: [] });
  const sameBranch = validatePrediction(div16, picks("A", "I", ["E", "M"], ["B", "G", "K", "O"]));
  assert.equal(sameBranch.valid, false);
  assert.ok(sameBranch.issues.some((i) => i.includes("même branche")));
});
