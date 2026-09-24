// Accès Firestore de la web app. Les formes de documents viennent de src/model.ts ; les droits, de firestore.rules.
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, Timestamp, updateDoc, where, writeBatch,
  type DocumentData,
} from "firebase/firestore";
import {
  bracketOf, divisionId, picksFromPlaces, resultFromPlaces, sameBracket,
  type CompetitionDoc, type DivisionDoc, type DivisionStatus, type LeaderboardDoc, type Places, type PredictionDoc,
} from "../../src/model.ts";
import { rankEntries, scoreDivision, sumScores, type LeaderboardEntry } from "../../src/scoring.ts";
import { db } from "./firebase.ts";
import { tr } from "./i18n.tsx";

export type WithId<T> = T & { id: string };

const PUBLIC_STATUSES: DivisionStatus[] = ["open", "results", "closed"];
const SCORED_STATUSES: DivisionStatus[] = ["results", "closed"];

/** Timestamp Firestore → Date, récursivement (lockAt, updatedAt, createdAt…). */
function revive<T>(value: unknown): T {
  if (value instanceof Timestamp) return value.toDate() as T;
  if (Array.isArray(value)) return value.map((v) => revive(v)) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, revive(v)])) as T;
  return value as T;
}
const withId = <T>(id: string, data: DocumentData): WithId<T> => ({ ...revive<T>(data), id });

// Écritures groupées : 500 opérations au plus par lot Firestore.
async function inBatches<T>(items: T[], write: (batch: ReturnType<typeof writeBatch>, item: T) => void) {
  for (let i = 0; i < items.length; i += 450) {
    const batch = writeBatch(db);
    for (const item of items.slice(i, i + 450)) write(batch, item);
    await batch.commit();
  }
}

// --- Profil -----------------------------------------------------------------------------------------------

export async function createProfile(uid: string, displayName: string) {
  await setDoc(doc(db, "users", uid), { displayName: displayName.trim(), createdAt: serverTimestamp() });
}

export async function renameProfile(uid: string, displayName: string) {
  await updateDoc(doc(db, "users", uid), { displayName: displayName.trim() });
}

// --- Compétitions -----------------------------------------------------------------------------------------

export async function listCompetitions(admin: boolean): Promise<WithId<CompetitionDoc>[]> {
  const source = admin ? collection(db, "competitions") : query(collection(db, "competitions"), where("published", "==", true));
  const snapshot = await getDocs(source);
  return snapshot.docs.map((d) => withId<CompetitionDoc>(d.id, d.data()))
    .sort((a, b) => b.startDate.localeCompare(a.startDate) || a.name.localeCompare(b.name));
}

export async function getCompetition(cid: string): Promise<WithId<CompetitionDoc> | null> {
  const snapshot = await getDoc(doc(db, "competitions", cid));
  return snapshot.exists() ? withId<CompetitionDoc>(snapshot.id, snapshot.data()) : null;
}

export async function saveCompetition(cid: string | null, data: CompetitionDoc): Promise<string> {
  if (cid) {
    await setDoc(doc(db, "competitions", cid), data);
    return cid;
  }
  return (await addDoc(collection(db, "competitions"), data)).id;
}

// --- Divisions --------------------------------------------------------------------------------------------

export async function listDivisions(cid: string, admin: boolean): Promise<WithId<DivisionDoc>[]> {
  const divisions = collection(db, "competitions", cid, "divisions");
  const snapshot = await getDocs(admin ? divisions : query(divisions, where("status", "in", PUBLIC_STATUSES)));
  return snapshot.docs.map((d) => withId<DivisionDoc>(d.id, d.data()))
    .sort((a, b) => a.day.localeCompare(b.day) || a.category.localeCompare(b.category, "fr", { numeric: true }));
}

export async function getDivision(cid: string, did: string): Promise<WithId<DivisionDoc> | null> {
  const snapshot = await getDoc(doc(db, "competitions", cid, "divisions", did));
  return snapshot.exists() ? withId<DivisionDoc>(snapshot.id, snapshot.data()) : null;
}

export type Publication = { id: string; version: number; outcome: "created" | "corrected" | "unchanged" };

/**
 * Publie des divisions contrôlées. Republier le même tirage (même jour, catégorie, finale) met à jour le même document.
 * La version n'augmente que si l'arbre a changé : les pronostics déjà faits restent valables sinon.
 */
export async function publishDivisions(cid: string, divisions: DivisionDoc[]): Promise<Publication[]> {
  const saved: Publication[] = [];
  for (const division of divisions) {
    const id = divisionId(division);
    const existing = await getDivision(cid, id);
    const outcome = !existing ? "created" : sameBracket(existing.bracket, division.bracket) ? "unchanged" : "corrected";
    const version = !existing ? 1 : outcome === "corrected" ? existing.version + 1 : existing.version;
    // Une division dont les résultats sont saisis garde son statut et son résultat : republier ne la rouvre pas.
    const scored = existing && (existing.status === "results" || existing.status === "closed");
    await setDoc(doc(db, "competitions", cid, "divisions", id), {
      ...division, version,
      ...(scored ? { status: existing.status } : {}),
      ...(existing?.result && (scored || outcome === "unchanged") ? { result: existing.result } : {}),
    });
    saved.push({ id, version, outcome });
  }
  return saved;
}

export async function setDivisionStatus(cid: string, did: string, status: DivisionStatus) {
  await updateDoc(doc(db, "competitions", cid, "divisions", did), { status });
}

export async function setDivisionLock(cid: string, did: string, lockAt: Date) {
  await updateDoc(doc(db, "competitions", cid, "divisions", did), { lockAt });
}

/** Supprime une division et ses pronostics (Firestore ne supprime pas les sous-collections), puis recalcule les classements si elle avait compté. */
export async function deleteDivision(cid: string, did: string) {
  const ref = doc(db, "competitions", cid, "divisions", did);
  const division = await getDivision(cid, did);
  const predictions = await getDocs(collection(ref, "predictions"));
  await inBatches(predictions.docs, (batch, d) => batch.delete(d.ref));
  await deleteDoc(ref);
  if (division && SCORED_STATUSES.includes(division.status)) await recomputeLeaderboards(cid);
}

/** Ce qu'une suppression de compétition effacerait : affiché avant de confirmer. */
export async function competitionFootprint(cid: string): Promise<{ divisions: number; predictions: number }> {
  const divisions = await getDocs(collection(db, "competitions", cid, "divisions"));
  const counts = await Promise.all(divisions.docs.map(async (d) => (await getDocs(collection(d.ref, "predictions"))).size));
  return { divisions: divisions.size, predictions: counts.reduce((a, b) => a + b, 0) };
}

/**
 * Supprime une compétition et tout ce qu'elle contient : pronostics, divisions, classement de la compétition.
 * Le classement général est ensuite recalculé sans elle. Irréversible.
 */
export async function deleteCompetition(cid: string) {
  const divisions = await getDocs(collection(db, "competitions", cid, "divisions"));
  for (const division of divisions.docs) {
    const predictions = await getDocs(collection(division.ref, "predictions"));
    await inBatches(predictions.docs, (batch, d) => batch.delete(d.ref));
  }
  await inBatches(divisions.docs, (batch, d) => batch.delete(d.ref));
  const board = await getDocs(collection(db, "competitions", cid, "leaderboard"));
  await inBatches(board.docs, (batch, d) => batch.delete(d.ref));
  await deleteDoc(doc(db, "competitions", cid));
  await recomputeGeneralLeaderboard();
}

// --- Pronostics -------------------------------------------------------------------------------------------

const predictionRef = (cid: string, did: string, uid: string) => doc(db, "competitions", cid, "divisions", did, "predictions", uid);

export async function getPrediction(cid: string, did: string, uid: string): Promise<PredictionDoc | null> {
  const snapshot = await getDoc(predictionRef(cid, did, uid));
  return snapshot.exists() ? revive<PredictionDoc>(snapshot.data()) : null;
}

/** Pronostics de l'utilisateur pour toute une compétition : pour l'indicateur « fait / à faire ». */
export async function myPredictions(cid: string, divisionIds: string[], uid: string): Promise<Map<string, PredictionDoc>> {
  const entries = await Promise.all(divisionIds.map(async (did) => [did, await getPrediction(cid, did, uid)] as const));
  return new Map(entries.filter((entry): entry is readonly [string, PredictionDoc] => entry[1] !== null));
}

export async function savePrediction(cid: string, did: string, uid: string, picks: Places, bracketVersion: number) {
  await setDoc(predictionRef(cid, did, uid), { picks, bracketVersion, updatedAt: serverTimestamp() });
}

export async function deletePrediction(cid: string, did: string, uid: string) {
  await deleteDoc(predictionRef(cid, did, uid));
}

// --- Résultats, points, classements (admin) ----------------------------------------------------------------

/**
 * Enregistre le résultat d'une division, calcule les points de chaque pronostic,
 * puis recalcule le classement de la compétition et le classement général.
 */
export async function saveResultAndScore(cid: string, division: WithId<DivisionDoc>, result: Places) {
  const outcome = resultFromPlaces(result);
  if (!outcome) throw new Error(tr("Le vainqueur et le finaliste sont obligatoires.", "The winner and the finalist are required."));
  await updateDoc(doc(db, "competitions", cid, "divisions", division.id), { result, status: "results" satisfies DivisionStatus });

  const predictions = await getDocs(collection(db, "competitions", cid, "divisions", division.id, "predictions"));
  const scores = scoreDivision(bracketOf(division.id, division), outcome,
    predictions.docs.map((d) => ({ uid: d.id, picks: picksFromPlaces(revive<PredictionDoc>(d.data()).picks) })));
  await inBatches(scores, (batch, score) => batch.update(predictionRef(cid, division.id, score.uid), {
    score: { total: score.total, exactGolds: score.exactGolds },
  }));
  await recomputeLeaderboards(cid);
  return { predictions: scores.length, invalid: scores.filter((s) => !s.valid).length };
}

async function profiles(uids: string[]): Promise<Map<string, { displayName: string; createdAt: Date }>> {
  const entries = await Promise.all(uids.map(async (uid) => {
    const snapshot = await getDoc(doc(db, "users", uid));
    const data = snapshot.exists() ? revive<{ displayName: string; createdAt: Date }>(snapshot.data()) : null;
    return [uid, data ?? { displayName: "Joueur supprimé", createdAt: new Date(0) }] as const;
  }));
  return new Map(entries);
}

async function writeLeaderboard(path: string[], totals: Map<string, { points: number; exactGolds: number }>) {
  const board = collection(db, path.join("/"));
  const users = await profiles([...totals.keys()]);
  const stale = (await getDocs(board)).docs.filter((d) => !totals.has(d.id));
  await inBatches([...totals], (batch, [uid, total]) => {
    const user = users.get(uid)!;
    batch.set(doc(board, uid), { displayName: user.displayName, points: total.points, exactGolds: total.exactGolds, registeredAt: user.createdAt } satisfies LeaderboardDoc);
  });
  await inBatches(stale, (batch, d) => batch.delete(d.ref));
}

/** Classement de la compétition (divisions avec résultats), puis classement général (somme des compétitions). */
export async function recomputeLeaderboards(cid: string) {
  const divisions = (await listDivisions(cid, true)).filter((d) => SCORED_STATUSES.includes(d.status));
  const scores: Array<{ uid: string; total: number; exactGolds: number }> = [];
  for (const division of divisions) {
    const predictions = await getDocs(collection(db, "competitions", cid, "divisions", division.id, "predictions"));
    for (const d of predictions.docs) {
      const score = (d.data() as PredictionDoc).score;
      if (score) scores.push({ uid: d.id, total: score.total, exactGolds: score.exactGolds });
    }
  }
  await writeLeaderboard(["competitions", cid, "leaderboard"], sumScores(scores));
  await recomputeGeneralLeaderboard();
}

/** Classement général : somme des classements de toutes les compétitions. */
export async function recomputeGeneralLeaderboard() {
  const general: Array<{ uid: string; total: number; exactGolds: number }> = [];
  for (const competition of await listCompetitions(true)) {
    const board = await getDocs(collection(db, "competitions", competition.id, "leaderboard"));
    for (const d of board.docs) {
      const row = d.data() as LeaderboardDoc<Timestamp>;
      general.push({ uid: d.id, total: row.points, exactGolds: row.exactGolds });
    }
  }
  await writeLeaderboard(["leaderboard"], sumScores(general));
}

export async function leaderboard(cid?: string): Promise<Array<LeaderboardEntry & { rank: number }>> {
  const snapshot = await getDocs(cid ? collection(db, "competitions", cid, "leaderboard") : collection(db, "leaderboard"));
  return rankEntries(snapshot.docs.map((d) => {
    const row = revive<LeaderboardDoc>(d.data());
    return { uid: d.id, displayName: row.displayName, points: row.points, exactGolds: row.exactGolds, registeredAt: row.registeredAt };
  }));
}
