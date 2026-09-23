/**
 * Calcul des points d'une division et des classements, exécuté dans le navigateur de l'admin
 * à la saisie des résultats (plan gratuit Spark, sans Cloud Functions).
 * Fonctions pures : les lectures et écritures Firestore sont faites par l'appelant.
 */
import type { BracketDivision } from "./bracket-builder.ts";
import { DEFAULT_SCORING, rankLeaderboard, scorePrediction, validatePrediction, type DivisionResult, type Pick, type ScoringConfig } from "./prediction.ts";

export type DivisionScore = { uid: string; total: number; exactGolds: number; valid: boolean };

/**
 * Points de chaque pronostic. Un pronostic incomplet est scoré sur ses places remplies (décision du 23/09/2026) ;
 * un pronostic incohérent avec l'arbre (impossible sur le terrain) ne rapporte rien : l'app l'empêche,
 * seul un pronostic écrit hors de l'app peut l'être.
 */
export function scoreDivision(
  bracket: BracketDivision,
  result: DivisionResult,
  predictions: Array<{ uid: string; picks: Pick[] }>,
  config: ScoringConfig = DEFAULT_SCORING,
): DivisionScore[] {
  return predictions.map(({ uid, picks }) => {
    if (!validatePrediction(bracket, picks, { requireComplete: false }).valid) return { uid, total: 0, exactGolds: 0, valid: false };
    const { total, exactGolds } = scorePrediction(bracket, picks, result, config);
    return { uid, total: roundPoints(total), exactGolds, valid: true };
  });
}

/** Les bonus (+50 %) donnent des demi-points : on arrondit au dixième pour éviter les 7,500000001. */
export const roundPoints = (value: number) => Math.round(value * 10) / 10;

/** Cumul brut par utilisateur. */
export function sumScores(scores: Array<{ uid: string; total: number; exactGolds: number }>): Map<string, { points: number; exactGolds: number }> {
  const totals = new Map<string, { points: number; exactGolds: number }>();
  for (const { uid, total, exactGolds } of scores) {
    const current = totals.get(uid) ?? { points: 0, exactGolds: 0 };
    totals.set(uid, { points: roundPoints(current.points + total), exactGolds: current.exactGolds + exactGolds });
  }
  return totals;
}

export type LeaderboardEntry = { uid: string; displayName: string; points: number; exactGolds: number; registeredAt: Date };

/** Classement : cumul brut, départage par vainqueurs exacts puis par inscription la plus ancienne. */
export function rankEntries(entries: LeaderboardEntry[]): Array<LeaderboardEntry & { rank: number }> {
  const byUid = new Map(entries.map((entry) => [entry.uid, entry]));
  return rankLeaderboard(entries.map((e) => ({ userId: e.uid, points: e.points, exactGolds: e.exactGolds, registeredAt: e.registeredAt.toISOString() })))
    .map((row) => ({ ...byUid.get(row.userId)!, rank: row.rank }));
}
