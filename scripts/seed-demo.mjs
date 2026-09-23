// Données de démonstration pour les émulateurs locaux (npm run dev:demo). Ne touche jamais le vrai projet :
// firebase-admin suit FIRESTORE_EMULATOR_HOST et FIREBASE_AUTH_EMULATOR_HOST, posés par « firebase emulators:exec ».
// Athlètes fictifs.
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { buildBrackets } from "../src/bracket-builder.ts";
import { divisionDoc, divisionId, placesFromPicks, zonedTimeToUtc } from "../src/model.ts";

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error("Émulateurs absents : ce script ne s'exécute que via « npm run dev:demo ».");
  process.exit(1);
}

const app = initializeApp({ projectId: "demo-taekwondo-score" });
const auth = getAuth(app);
const db = getFirestore(app);
const TIMEZONE = "Europe/Paris";
const day = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

/** Tableau de 16 : huitièmes 101-108, quarts 201-204, demies 301-302, finale 401 (+ base). */
function draw(category, [age, gender, weight], athletes, base) {
  const entries = athletes.map(([name, country, seed], i) => ({
    id: `${base}-${i}`, name, team: country, country, category, ageCategory: age, genderCategory: gender, weightCategory: weight,
    page: 1, side: i < 8 ? "left" : "right", path: [101 + (i >> 1), 201 + (i >> 2), 301 + (i >> 3), 401].map((f) => String(f + base)),
    confidence: 0.9, warnings: [], sourceText: name, drawFormat: "wt",
    sourceBounds: { x: i < 8 ? 30 : 770, y: 100 + (i % 8) * 50, width: 150, height: 8 }, ...(seed ? { seed } : {}),
  }));
  return buildBrackets({ athletes: entries, pageCount: 1, ocrPageCount: 0, warnings: [] })[0];
}

const men68 = draw("Senior · Men · -68 kg", ["Senior", "Men", "-68 kg"], [
  ["DURAND Lucas", "FRA", 1], ["OKAFOR Chidi", "NGR"], ["SILVA Mateo", "BRA"], ["HASSAN Omar", "EGY", 8],
  ["NAKAMURA Ren", "JPN", 5], ["ROSSI Marco", "ITA"], ["AL-FARSI Khalid", "KSA"], ["PARK Joon", "KOR", 4],
  ["MÜLLER Jonas", "GER", 3], ["BENALI Yassine", "MAR"], ["LOPEZ Diego", "ESP", 6], ["KARIMI Reza", "IRI"],
  ["NOVAK Luka", "CRO", 7], ["SMITH Ethan", "USA"], ["DIALLO Moussa", "SEN"], ["CHEN Wei", "CHN", 2],
], 0);
const women57 = draw("Senior · Women · -57 kg", ["Senior", "Women", "-57 kg"], [
  ["MARTIN Chloé", "FRA", 1], ["YILMAZ Elif", "TUR"], ["GARCIA Lucía", "ESP"], ["AHMED Sara", "JOR", 5],
  ["KIM Seo-yeon", "KOR", 4], ["BIANCHI Giulia", "ITA"], ["SANTOS Ana", "POR"], ["TANAKA Yui", "JPN"],
  ["SCHMIDT Lena", "GER", 3], ["EL AMRANI Salma", "MAR"], ["IVANOVA Daria", "AIN", 6], ["OKORO Grace", "NGR"],
  ["LI Na", "CHN"], ["JONES Emily", "GBR", 7], ["NGUYEN Linh", "VIE"], ["AL-SAYED Noor", "UAE", 2],
], 1000);
const junior55 = draw("Junior · Men · -55 kg", ["Junior", "Men", "-55 kg"], [
  ["PETIT Hugo", "FRA", 1], ["ALI Hamza", "PAK"], ["COSTA Pedro", "POR"], ["WANG Hao", "CHN"],
  ["SATO Kaito", "JPN"], ["RICCI Luca", "ITA"], ["DUBOIS Nathan", "BEL"], ["LEE Min-ho", "KOR", 2],
], 2000);

const competitionId = "open-demo";
const source = { fileName: "tirage-demo.pdf", sha256: "demo", pages: [1] };
const divisions = [
  divisionDoc(men68, { day: day(1), lockAt: zonedTimeToUtc(day(1), "09:00", TIMEZONE), status: "open", source }),
  divisionDoc(women57, { day: day(0), lockAt: new Date(Date.now() - 3_600_000), status: "open", source }),
  divisionDoc(junior55, { day: day(1), lockAt: zonedTimeToUtc(day(1), "09:00", TIMEZONE), status: "review", source }),
];

const users = [
  { uid: "admin", email: "admin@demo.local", displayName: "Mehdi (admin)", admin: true, since: "2026-01-10" },
  { uid: "joueur", email: "joueur@demo.local", displayName: "Joueur démo", since: "2026-03-02" },
  { uid: "amine", email: "amine@demo.local", displayName: "Amine", since: "2026-02-14" },
  { uid: "sofia", email: "sofia@demo.local", displayName: "Sofia", since: "2026-04-20" },
];
for (const user of users) {
  await auth.createUser({ uid: user.uid, email: user.email, password: "demo1234", emailVerified: true }).catch((error) => {
    if (error.code !== "auth/uid-already-exists") throw error;
  });
  if (user.admin) await auth.setCustomUserClaims(user.uid, { admin: true });
  await db.doc(`users/${user.uid}`).set({ displayName: user.displayName, createdAt: new Date(`${user.since}T10:00:00Z`) });
}

await db.doc(`competitions/${competitionId}`).set({
  name: "Open de démonstration", location: "Paris, France", timezone: TIMEZONE, startDate: day(0), endDate: day(1), published: true,
});
for (const division of divisions) await db.doc(`competitions/${competitionId}/divisions/${divisionId(division)}`).set(division);

// Pronostics déjà faits sur la division verrouillée (-57 kg), pour tester la saisie des résultats et les classements.
const lockedId = divisionId(divisions[1]);
const ids = Object.fromEntries(women57.entrants.map((e) => [e.name.split(" ")[0], e.athleteId]));
const picks = {
  joueur: [["MARTIN", "gold"], ["AL-SAYED", "silver"], ["KIM", "bronze"], ["SCHMIDT", "bronze"], ["BIANCHI", "quarter"], ["GARCIA", "quarter"], ["IVANOVA", "quarter"], ["NGUYEN", "quarter"]],
  amine: [["KIM", "gold"], ["SCHMIDT", "silver"], ["MARTIN", "bronze"], ["AL-SAYED", "bronze"]],
  sofia: [["MARTIN", "gold"], ["SCHMIDT", "silver"], ["KIM", "bronze"], ["JONES", "bronze"], ["AHMED", "quarter"], ["SANTOS", "quarter"]],
};
for (const [uid, list] of Object.entries(picks)) {
  await db.doc(`competitions/${competitionId}/divisions/${lockedId}/predictions/${uid}`).set({
    picks: placesFromPicks(list.map(([name, place]) => ({ athleteId: ids[name], place }))),
    bracketVersion: 1, updatedAt: new Date(Date.now() - 2 * 3_600_000),
  });
}

console.log("Démo prête : page Connexion, boutons « Joueur démo » et « Admin démo » ; compétition « Open de démonstration ».");
