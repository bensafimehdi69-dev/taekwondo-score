import test from "node:test";
import assert from "node:assert/strict";
import { buildBrackets } from "../src/bracket-builder.ts";
import { addEntrant, countCorrections, moveEntrant, readingIssues, removeEntrant, setFinalFight, updateEntrant } from "../src/bracket-editing.ts";
import { athlete, draw8 } from "./fixtures-bracket.mjs";

const [div8] = buildBrackets(draw8());

test("une correction de nom ou de pays ne touche pas la structure", () => {
  const edited = updateEntrant(div8, "A", { name: "KIM Tae-hun", country: " kor " });
  const a = edited.entrants.find((e) => e.athleteId === "A");
  assert.equal(a.name, "KIM Tae-hun");
  assert.equal(a.country, "KOR");
  assert.equal(edited.status, "ok");
  assert.equal(countCorrections(div8, edited), 1);
});

test("déplacer un athlète dans un autre quart rejoue les contrôles et recale son parcours", () => {
  const edited = updateEntrant(div8, "C", { quarter: "101" });
  const c = edited.entrants.find((e) => e.athleteId === "C");
  assert.deepEqual(c.path, ["101", "201", "301"]);
  assert.deepEqual(edited.entrants.filter((e) => e.quarter === "101").map((e) => e.athleteId), ["A", "B", "C"]);
  // Un quart qui mène à deux demi-finales est signalé.
  const broken = updateEntrant(div8, "E", { quarter: "101" });
  assert.equal(broken.status, "review");
  assert.ok(broken.issues.some((i) => i.includes("mène à plusieurs demi-finales")));
});

test("changer de demi-finale reprend le côté de la feuille de cette moitié", () => {
  const edited = updateEntrant(div8, "D", { half: "202", quarter: "104" });
  assert.equal(edited.entrants.find((e) => e.athleteId === "D").side, "right");
});

test("une tête de série en double est signalée, puis levée par la correction", () => {
  const duplicate = updateEntrant(div8, "B", { seed: 1 });
  assert.ok(duplicate.issues.some((i) => i.includes("Tête(s) de série en double : 1")));
  const fixed = updateEntrant(duplicate, "B", { seed: undefined });
  assert.equal(fixed.status, "ok");
  assert.equal(fixed.entrants.find((e) => e.athleteId === "B").seed, undefined);
});

test("ajout, retrait et déplacement renumérotent les positions et comptent comme corrections", () => {
  const { division: added, athleteId } = addEntrant(div8, { half: "201", quarter: "101" });
  assert.equal(athleteId, "manuel-1");
  assert.equal(added.size, 9);
  assert.equal(added.entrants[2].athleteId, "manuel-1");
  assert.deepEqual(added.entrants.map((e) => e.position), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const removed = removeEntrant(added, "H");
  assert.equal(countCorrections(div8, removed), 2);
  const moved = moveEntrant(div8, "B", -1);
  assert.deepEqual(moved.entrants.slice(0, 2).map((e) => e.athleteId), ["B", "A"]);
  assert.equal(countCorrections(div8, moved), 1);
  assert.equal(moveEntrant(div8, "A", -1), div8);
});

test("les alertes de lecture restent visibles après une correction", () => {
  const flagged = draw8();
  flagged.athletes[0] = { ...athlete("A", "left", 100, ["101", "201", "301"], 1), warnings: ["Nom illisible"] };
  const [division] = buildBrackets(flagged);
  assert.deepEqual(readingIssues(division), ["1 athlète(s) signalé(s) par le moteur de lecture."]);
  const edited = updateEntrant(division, "A", { name: "Nom corrigé" });
  assert.equal(edited.status, "review");
  assert.deepEqual(readingIssues(edited), ["1 athlète(s) signalé(s) par le moteur de lecture."]);
});

test("un combat de finale saisi à la main lève l'anomalie « aucun parcours relié »", () => {
  const unlinked = draw8();
  unlinked.athletes = unlinked.athletes.map((a) => ({ ...a, path: [], startFight: undefined }));
  const [division] = buildBrackets(unlinked);
  assert.ok(division.issues.includes("Aucun parcours relié : l'arbre ne peut pas être reconstruit."));
  let fixed = setFinalFight(division, "301");
  assert.equal(fixed.finalFight, "301");
  assert.ok(!fixed.issues.includes("Aucun parcours relié : l'arbre ne peut pas être reconstruit."));
  for (const [id, half, quarter] of [["A", "201", "101"], ["B", "201", "101"], ["C", "201", "102"], ["D", "201", "102"],
    ["E", "202", "103"], ["F", "202", "103"], ["G", "202", "104"], ["H", "202", "104"]]) {
    fixed = updateEntrant(fixed, id, { half, quarter });
  }
  assert.deepEqual(fixed.entrants.find((e) => e.athleteId === "E").path, ["103", "202", "301"]);
  assert.equal(fixed.status, "ok");
  assert.equal(countCorrections(division, fixed), 9);
  // Changer de finale remplace la fin du parcours au lieu de l'allonger.
  assert.deepEqual(setFinalFight(fixed, "302").entrants[0].path, ["101", "201", "302"]);
});
