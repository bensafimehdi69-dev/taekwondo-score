// Règles Firestore, testées dans l'émulateur (projet « demo- », jamais le vrai projet) : npm run test:rules
import test, { after, before, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { buildBrackets } from "../src/bracket-builder.ts";
import { divisionDoc } from "../src/model.ts";
import { draw8 } from "../tests/fixtures-bracket.mjs";

let env;
const HOUR = 3_600_000;
const [division8] = buildBrackets(draw8());
const source = { fileName: "tirage.pdf", sha256: "abc", pages: [1] };
const competition = (published) => ({ name: "Grand Prix", location: "Riyad", timezone: "Asia/Riyadh", startDate: "2026-10-12", endDate: "2026-10-14", published });
const division = (status, lockAt) => divisionDoc(division8, { day: "2026-10-12", lockAt, status, source });
// Pronostic cohérent avec l'arbre de 8 : A et H en finale, C et F en bronze, les autres battus en quart.
const places = (overrides = {}) => ({ gold: ["A"], silver: ["H"], bronze: ["C", "F"], quarter: ["B", "D", "E", "G"], ...overrides });
const prediction = (overrides = {}) => ({ picks: places(), bracketVersion: 1, updatedAt: serverTimestamp(), ...overrides });

const visitor = () => env.unauthenticatedContext().firestore();
const user = (uid) => env.authenticatedContext(uid).firestore();
const admin = () => env.authenticatedContext("admin", { admin: true }).firestore();
const OPEN = "competitions/gp/divisions/open";
const LOCKED = "competitions/gp/divisions/locked";

before(async () => {
  env = await initializeTestEnvironment({ projectId: "demo-taekwondo-score", firestore: { rules: readFileSync("firestore.rules", "utf8") } });
});
after(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "competitions/gp"), competition(true));
    await setDoc(doc(db, "competitions/draft-comp"), competition(false));
    await setDoc(doc(db, OPEN), division("open", new Date(Date.now() + 24 * HOUR)));
    await setDoc(doc(db, LOCKED), division("open", new Date(Date.now() - HOUR)));
    await setDoc(doc(db, "competitions/gp/divisions/review"), division("review", new Date(Date.now() + 24 * HOUR)));
    await setDoc(doc(db, "competitions/draft-comp/divisions/open"), division("open", new Date(Date.now() + 24 * HOUR)));
    await setDoc(doc(db, `${LOCKED}/predictions/alice`), { picks: places(), bracketVersion: 1, updatedAt: new Date(Date.now() - 2 * HOUR) });
    await setDoc(doc(db, "leaderboard/alice"), { displayName: "Alice", points: 20, exactGolds: 1, registeredAt: new Date() });
    await setDoc(doc(db, "users/alice"), { displayName: "Alice", createdAt: new Date() });
  });
});

test("compétitions : publiées lisibles par tous, écrites par l'admin seulement", async () => {
  await assertSucceeds(getDoc(doc(visitor(), "competitions/gp")));
  await assertFails(getDoc(doc(visitor(), "competitions/draft-comp")));
  await assertSucceeds(getDoc(doc(admin(), "competitions/draft-comp")));
  await assertFails(setDoc(doc(user("alice"), "competitions/new"), competition(false)));
  await assertSucceeds(setDoc(doc(admin(), "competitions/new"), competition(false)));
  const { timezone, ...withoutTimezone } = competition(false);
  await assertFails(setDoc(doc(admin(), "competitions/new2"), withoutTimezone));
});

test("divisions : lisibles une fois ouvertes dans une compétition publiée", async () => {
  await assertSucceeds(getDoc(doc(visitor(), OPEN)));
  await assertFails(getDoc(doc(user("alice"), "competitions/gp/divisions/review")));
  await assertFails(getDoc(doc(user("alice"), "competitions/draft-comp/divisions/open")));
  await assertSucceeds(getDoc(doc(admin(), "competitions/gp/divisions/review")));
  await assertFails(updateDoc(doc(user("alice"), OPEN), { status: "closed" }));
  await assertSucceeds(updateDoc(doc(admin(), OPEN), { status: "results" }));
  await assertFails(updateDoc(doc(admin(), OPEN), { status: "locked" }));
});

test("pronostic : l'utilisateur écrit le sien avant le verrouillage, complet ou partiel", async () => {
  await assertSucceeds(setDoc(doc(user("bob"), `${OPEN}/predictions/bob`), prediction()));
  await assertSucceeds(setDoc(doc(user("bob"), `${OPEN}/predictions/bob`), prediction({ picks: places({ bronze: ["C"], quarter: [] }) })));
  await assertSucceeds(deleteDoc(doc(user("bob"), `${OPEN}/predictions/bob`)));
  await assertFails(setDoc(doc(user("bob"), `${OPEN}/predictions/carol`), prediction()));
  await assertFails(setDoc(doc(visitor(), `${OPEN}/predictions/bob`), prediction()));
});

test("pronostic : refusé après l'heure de verrouillage ou hors division ouverte", async () => {
  await assertFails(setDoc(doc(user("bob"), `${LOCKED}/predictions/bob`), prediction()));
  await assertFails(updateDoc(doc(user("alice"), `${LOCKED}/predictions/alice`), { picks: places({ gold: ["H"], silver: ["A"] }), updatedAt: serverTimestamp() }));
  await assertFails(deleteDoc(doc(user("alice"), `${LOCKED}/predictions/alice`)));
  await assertFails(setDoc(doc(user("bob"), "competitions/gp/divisions/review/predictions/bob"), prediction()));
});

test("pronostic : athlètes de l'arbre, une place chacun, dans la limite des places", async () => {
  const write = (picks) => setDoc(doc(user("bob"), `${OPEN}/predictions/bob`), prediction({ picks }));
  await assertFails(write(places({ gold: ["Z"] })));
  await assertFails(write(places({ silver: ["A"] })));
  await assertFails(write(places({ bronze: ["C", "F", "B"], quarter: ["D", "E", "G"] })));
  await assertFails(write(places({ gold: ["A", "H"], silver: [] })));
  await assertFails(write({ gold: ["A"], silver: ["H"], bronze: ["C", "F"] }));
  await assertFails(write({ ...places(), fifth: ["B"] }));
  await assertFails(write({ ...places(), gold: "A" }));
});

test("pronostic : heure du serveur, version de l'arbre, pas de score ni de champ en plus", async () => {
  const path = `${OPEN}/predictions/bob`;
  await assertFails(setDoc(doc(user("bob"), path), prediction({ updatedAt: new Date() })));
  await assertFails(setDoc(doc(user("bob"), path), prediction({ bracketVersion: 2 })));
  await assertFails(setDoc(doc(user("bob"), path), prediction({ score: { total: 100, exactGolds: 1 } })));
  await assertFails(setDoc(doc(user("bob"), path), prediction({ comment: "sûr" })));
  // L'arbre rempli par le joueur accompagne le pronostic ; il doit rester une simple table case → athlète.
  await assertSucceeds(setDoc(doc(user("bob"), path), prediction({ tree: { 101: "A", 201: "A", 301: "A" } })));
  await assertFails(setDoc(doc(user("bob"), path), prediction({ tree: "A" })));
});

test("pronostics des autres : lisibles seulement après le verrouillage, par un utilisateur connecté", async () => {
  await assertSucceeds(setDoc(doc(user("bob"), `${OPEN}/predictions/bob`), prediction()));
  await assertSucceeds(getDoc(doc(user("bob"), `${OPEN}/predictions/bob`)));
  await assertFails(getDoc(doc(user("alice"), `${OPEN}/predictions/bob`)));
  await assertSucceeds(getDoc(doc(user("bob"), `${LOCKED}/predictions/alice`)));
  await assertFails(getDoc(doc(visitor(), `${LOCKED}/predictions/alice`)));
});

test("points : l'admin écrit le score, et seulement le score", async () => {
  await assertSucceeds(updateDoc(doc(admin(), `${LOCKED}/predictions/alice`), { score: { total: 26, exactGolds: 1 } }));
  await assertFails(updateDoc(doc(admin(), `${LOCKED}/predictions/alice`), { picks: places({ gold: ["H"], silver: ["A"] }) }));
  await assertFails(updateDoc(doc(user("alice"), `${LOCKED}/predictions/alice`), { score: { total: 999, exactGolds: 8 } }));
});

test("suppression : l'admin efface pronostics, divisions, classement et compétition ; personne d'autre", async () => {
  await assertFails(deleteDoc(doc(user("bob"), `${LOCKED}/predictions/alice`)));
  await assertFails(deleteDoc(doc(user("alice"), "competitions/gp")));
  await assertFails(deleteDoc(doc(user("alice"), OPEN)));
  await assertSucceeds(deleteDoc(doc(admin(), `${LOCKED}/predictions/alice`)));
  await assertSucceeds(deleteDoc(doc(admin(), LOCKED)));
  await assertSucceeds(deleteDoc(doc(admin(), "competitions/gp/leaderboard/alice")));
  await assertSucceeds(deleteDoc(doc(admin(), "competitions/gp")));
});

test("classements : lus par tous, écrits par l'admin", async () => {
  await assertSucceeds(getDoc(doc(visitor(), "leaderboard/alice")));
  await assertSucceeds(getDoc(doc(visitor(), "competitions/gp/leaderboard/alice")));
  await assertFails(getDoc(doc(visitor(), "competitions/draft-comp/leaderboard/alice")));
  await assertFails(setDoc(doc(user("alice"), "leaderboard/alice"), { displayName: "Alice", points: 999, exactGolds: 9, registeredAt: new Date() }));
  await assertSucceeds(setDoc(doc(admin(), "competitions/gp/leaderboard/alice"), { displayName: "Alice", points: 26, exactGolds: 1, registeredAt: new Date() }));
});

test("profil : pseudo et date d'inscription du serveur, modifiables par soi seul", async () => {
  await assertSucceeds(setDoc(doc(user("bob"), "users/bob"), { displayName: "Bob", createdAt: serverTimestamp() }));
  await assertFails(setDoc(doc(user("carol"), "users/carol"), { displayName: "Carol", createdAt: new Date("2020-01-01") }));
  await assertFails(setDoc(doc(user("carol"), "users/dave"), { displayName: "Dave", createdAt: serverTimestamp() }));
  await assertFails(setDoc(doc(user("carol"), "users/carol"), { displayName: "C", createdAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(user("alice"), "users/alice"), { displayName: "Alice K." }));
  await assertFails(updateDoc(doc(user("alice"), "users/alice"), { createdAt: new Date("2020-01-01") }));
  await assertFails(getDoc(doc(user("bob"), "users/alice")));
  await assertSucceeds(getDoc(doc(admin(), "users/alice")));
});
