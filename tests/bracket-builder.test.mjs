import test from "node:test";
import assert from "node:assert/strict";
import { buildBrackets } from "../src/bracket-builder.ts";
import { draw8, draw6, athlete } from "./fixtures-bracket.mjs";

test("reconstruit la division, l'ordre de l'arbre, les moitiés et les quarts", () => {
  const [division] = buildBrackets(draw8());
  assert.equal(division.status, "ok", division.issues.join(" | "));
  assert.equal(division.size, 8);
  assert.equal(division.finalFight, "301");
  assert.deepEqual(division.entrants.map((e) => e.athleteId), ["A", "B", "C", "D", "E", "F", "G", "H"]);
  assert.deepEqual(division.semiFights.sort(), ["201", "202"]);
  assert.deepEqual(division.quarterFights.sort(), ["101", "102", "103", "104"]);
  const a = division.entrants[0];
  assert.equal(a.half, "201"); assert.equal(a.quarter, "101"); assert.equal(a.seed, 1);
});

test("gère les exempts qui entrent directement en demi-finale", () => {
  const [division] = buildBrackets(draw6());
  assert.equal(division.status, "ok", division.issues.join(" | "));
  assert.deepEqual(division.quarterFights.sort(), ["101", "102"]);
  assert.equal(division.entrants.find((e) => e.athleteId === "C").quarter, undefined);
});

test("sépare deux divisions d'un même PDF par leur finale", () => {
  const index = draw8();
  index.athletes.push(
    { ...athlete("X", "left", 100, ["111", "311"]), category: "Senior Women -49 kg", page: 2 },
    { ...athlete("Y", "right", 100, ["111", "311"]), category: "Senior Women -49 kg", page: 2 },
  );
  const divisions = buildBrackets(index);
  assert.equal(divisions.length, 2);
  assert.equal(divisions[1].size, 2);
});

test("met en revue un arbre incohérent au lieu de le corriger", () => {
  const index = draw8();
  index.athletes[1].path = ["101", "202", "301"]; // le quart 101 mènerait à deux demis
  const [division] = buildBrackets(index);
  assert.equal(division.status, "review");
  assert.ok(division.issues.some((i) => i.includes("plusieurs demi-finales")));
});

test("signale une tête de série en double", () => {
  const index = draw8();
  index.athletes[1].seed = 1;
  const [division] = buildBrackets(index);
  assert.equal(division.status, "review");
  assert.ok(division.issues.some((i) => i.includes("en double")));
});
