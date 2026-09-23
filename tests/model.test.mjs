import test from "node:test";
import assert from "node:assert/strict";
import { buildBrackets } from "../src/bracket-builder.ts";
import { divisionDoc, picksFromPlaces, placesFromPicks, resultFromPlaces, zonedTimeToUtc } from "../src/model.ts";
import { draw6, draw8 } from "./fixtures-bracket.mjs";

test("heure de verrouillage : heure locale du lieu, changements d'heure compris", () => {
  const utc = (day, time, zone) => zonedTimeToUtc(day, time, zone).toISOString();
  assert.equal(utc("2026-10-12", "09:00", "Asia/Riyadh"), "2026-10-12T06:00:00.000Z");
  assert.equal(utc("2026-07-01", "09:00", "Europe/Paris"), "2026-07-01T07:00:00.000Z");
  assert.equal(utc("2026-12-01", "09:00", "Europe/Paris"), "2026-12-01T08:00:00.000Z");
  // Jour du passage à l'heure d'hiver à Paris (25/10/2026, 3 h → 2 h) : 9 h est déjà en heure d'hiver.
  assert.equal(utc("2026-10-25", "09:00", "Europe/Paris"), "2026-10-25T08:00:00.000Z");
  assert.equal(utc("2026-03-08", "09:00", "America/New_York"), "2026-03-08T13:00:00.000Z");
  // 2 h 30 n'existe pas à New York le 8/03/2026 : l'horloge passe de 2 h à 3 h, on retient 3 h 30.
  assert.equal(utc("2026-03-08", "02:30", "America/New_York"), "2026-03-08T07:30:00.000Z");
  assert.equal(utc("2026-09-20", "09:00", "Asia/Seoul"), "2026-09-20T00:00:00.000Z");
  assert.throws(() => zonedTimeToUtc("2026-13-01", "9h", "Europe/Paris"), /invalide/);
  assert.throws(() => zonedTimeToUtc("2026-10-12", "09:00", "Mars/Olympus"), RangeError);
});

test("les pronostics passent de la liste de choix aux places et retour", () => {
  const picks = [
    { athleteId: "A", place: "gold" }, { athleteId: "H", place: "silver" },
    { athleteId: "C", place: "bronze" }, { athleteId: "F", place: "bronze" },
    { athleteId: "B", place: "quarter" }, { athleteId: "D", place: "quarter" },
  ];
  const places = placesFromPicks(picks);
  assert.deepEqual(places, { gold: ["A"], silver: ["H"], bronze: ["C", "F"], quarter: ["B", "D"] });
  assert.deepEqual(picksFromPlaces(places), picks);
  assert.deepEqual(resultFromPlaces(places), { gold: "A", silver: "H", bronze: ["C", "F"], quarter: ["B", "D"] });
  assert.equal(resultFromPlaces({ gold: ["A"], silver: [], bronze: [], quarter: [] }), undefined);
});

test("document de division : places attendues, athlètes autorisés, aucun champ vide", () => {
  const [division] = buildBrackets(draw6());
  const doc = divisionDoc(division, {
    day: "2026-10-12", lockAt: new Date("2026-10-12T06:00:00Z"),
    source: { fileName: "tirage.pdf", sha256: "abc", pages: [1] },
  });
  assert.equal(doc.status, "draft");
  assert.equal(doc.version, 1);
  assert.deepEqual(doc.athleteIds, ["A", "B", "C", "D", "E", "F"]);
  assert.deepEqual(doc.expected, { gold: 1, silver: 1, bronze: 2, quarter: 2 });
  // L'exempt C n'a pas de quart : la clé est absente, pas « undefined » (refusé par Firestore).
  const c = doc.bracket.entrants.find((e) => e.athleteId === "C");
  assert.equal("quarter" in c, false);
  const hasUndefined = (value) => value === undefined
    || (Array.isArray(value) ? value.some(hasUndefined) : value && typeof value === "object" && !(value instanceof Date) && Object.values(value).some(hasUndefined));
  assert.equal(hasUndefined(doc), false);
  assert.throws(() => divisionDoc(division, { day: "12/10/2026", lockAt: new Date(), source: doc.source }), /Jour invalide/);
});

test("document de division : un identifiant d'athlète en double est refusé", () => {
  const [division] = buildBrackets(draw8());
  const doubled = { ...division, entrants: [...division.entrants, division.entrants[0]] };
  assert.throws(() => divisionDoc(doubled, { day: "2026-10-12", lockAt: new Date(), source: { fileName: "", sha256: "", pages: [] } }), /double/);
});

test("attribution d'une place : une place par athlète, remplacement en finale, limite en bronze", async () => {
  const { assignPlace, emptyPlaces } = await import("../src/model.ts");
  const limits = { gold: 1, silver: 1, bronze: 2, quarter: 4 };
  let { places } = assignPlace(emptyPlaces(), "A", "gold", limits);
  ({ places } = assignPlace(places, "B", "gold", limits));
  assert.deepEqual(places.gold, ["B"]);
  ({ places } = assignPlace(places, "B", "bronze", limits));
  assert.deepEqual([places.gold, places.bronze], [[], ["B"]]);
  ({ places } = assignPlace(places, "C", "bronze", limits));
  const full = assignPlace(places, "D", "bronze", limits);
  assert.match(full.error, /Déjà 2 athlètes/);
  assert.deepEqual(full.places.bronze, ["B", "C"]);
  assert.deepEqual(assignPlace(places, "C", null, limits).places.bronze, ["B"]);
  assert.match(assignPlace(places, "E", "quarter", { ...limits, quarter: 0 }).error, /Pas de place/);
});
