/**
 * Modèle de données Firestore de Taekwondo Score, partagé par la web app, les scripts admin et, plus tard, l'app iOS.
 *
 * competitions/{cid}                                  CompetitionDoc  (lu par tous une fois publiée)
 * competitions/{cid}/divisions/{did}                  DivisionDoc     (lu une fois ouverte)
 * competitions/{cid}/divisions/{did}/predictions/{uid} PredictionDoc  (écrit par l'utilisateur avant le verrouillage)
 * competitions/{cid}/leaderboard/{uid}                LeaderboardDoc  (classement de la compétition, écrit par l'admin)
 * leaderboard/{uid}                                   LeaderboardDoc  (classement général, écrit par l'admin)
 * users/{uid}                                         UserDoc         (pseudo et date d'inscription)
 *
 * Les règles de sécurité (firestore.rules) lisent ces mêmes champs : toute modification se fait des deux côtés.
 * `Time` vaut Date côté application (le SDK la convertit en Timestamp) et Timestamp à la lecture.
 */
import type { BracketDivision, BracketEntrant } from "./bracket-builder.ts";
import { expectedPicks, type DivisionResult, type Pick, type Place } from "./prediction.ts";

// `Pick` désigne ici un choix de pronostic : sous-ensemble de champs, sans masquer ce nom.
type Fields<T, K extends keyof T> = { [P in K]: T[P] };

export const PLACES: readonly Place[] = ["gold", "silver", "bronze", "quarter"];

/** Places pronostiquées (ou résultat réel) : une liste d'athlètes par place, forme vérifiable par les règles. */
export type Places = Record<Place, string[]>;

/**
 * Cycle de vie stocké. « Verrouillée » n'est pas un statut : une division ouverte l'est dès que l'heure
 * `lockAt` est passée, selon l'horloge du serveur. brouillon = draft, contrôle = review.
 */
export const DIVISION_STATUSES = ["draft", "review", "open", "results", "closed"] as const;
export type DivisionStatus = (typeof DIVISION_STATUSES)[number];

export type CompetitionDoc = {
  name: string;
  location: string;
  /** Fuseau IANA du lieu, ex. « Asia/Riyadh » : sert à placer l'heure de verrouillage. */
  timezone: string;
  /** Dates locales AAAA-MM-JJ. */
  startDate: string;
  endDate: string;
  published: boolean;
};

export type DivisionDoc<Time = Date> = {
  /** Jour de compétition, date locale AAAA-MM-JJ. */
  day: string;
  category: string;
  ageCategory: string;
  genderCategory: string;
  weightCategory: string;
  status: DivisionStatus;
  lockAt: Time;
  /** Augmente à chaque correction de l'arbre après publication ; un pronostic garde la version sur laquelle il a été fait. */
  version: number;
  bracket: {
    finalFight?: string;
    semiFights: string[];
    quarterFights: string[];
    entrants: BracketEntrant[];
  };
  /** Identifiants des athlètes de l'arbre : les règles refusent tout autre athlète dans un pronostic. */
  athleteIds: string[];
  /** Nombre de choix possibles par place selon l'arbre (expectedPicks). */
  expected: Record<Place, number>;
  result?: Places;
  source: { fileName: string; sha256: string; pages: number[] };
};

export type PredictionScore = { total: number; exactGolds: number };

export type PredictionDoc<Time = Date> = {
  picks: Places;
  bracketVersion: number;
  updatedAt: Time;
  /** Écrit par l'admin au calcul des points. */
  score?: PredictionScore;
};

export type UserDoc<Time = Date> = { displayName: string; createdAt: Time };

export type LeaderboardDoc<Time = Date> = { displayName: string; points: number; exactGolds: number; registeredAt: Time };

export function placesFromPicks(picks: Pick[]): Places {
  const places: Places = { gold: [], silver: [], bronze: [], quarter: [] };
  for (const pick of picks) places[pick.place].push(pick.athleteId);
  return places;
}

export function picksFromPlaces(places: Places): Pick[] {
  return PLACES.flatMap((place) => places[place].map((athleteId): Pick => ({ athleteId, place })));
}

export const PLACE_LABELS: Record<Place, string> = { gold: "Vainqueur", silver: "Finaliste", bronze: "Bronze", quarter: "Battu en quart" };

/**
 * Attribue une place à un athlète (null = retirer). Un athlète n'occupe qu'une place.
 * Vainqueur et finaliste remplacent l'athlète déjà choisi ; bronze et quart refusent d'aller au-delà de la limite.
 */
export function assignPlace(places: Places, athleteId: string, place: Place | null, limits: Record<Place, number>): { places: Places; error?: string } {
  const next = Object.fromEntries(PLACES.map((p) => [p, places[p].filter((id) => id !== athleteId)])) as Places;
  if (!place) return { places: next };
  if (limits[place] === 0) return { places, error: `Pas de place « ${PLACE_LABELS[place]} » dans cette division.` };
  if (limits[place] === 1) return { places: { ...next, [place]: [athleteId] } };
  if (next[place].length >= limits[place]) {
    return { places, error: `Déjà ${limits[place]} athlètes pour « ${PLACE_LABELS[place]} » : retires-en un d'abord.` };
  }
  return { places: { ...next, [place]: [...next[place], athleteId] } };
}

export const emptyPlaces = (): Places => ({ gold: [], silver: [], bronze: [], quarter: [] });

/** Résultat saisi par l'admin, au format de prediction.ts ; absent tant que vainqueur et finaliste ne sont pas connus. */
export function resultFromPlaces(places: Places): DivisionResult | undefined {
  const [gold] = places.gold;
  const [silver] = places.silver;
  if (!gold || !silver) return undefined;
  return { gold, silver, bronze: [...places.bronze], quarter: [...places.quarter] };
}

/** Arbre d'un document de division, au format des règles de pronostic (prediction.ts). */
export function bracketOf(id: string, doc: DivisionDoc<unknown>): BracketDivision {
  return {
    key: id,
    category: doc.category,
    ageCategory: doc.ageCategory,
    genderCategory: doc.genderCategory,
    weightCategory: doc.weightCategory,
    pages: doc.source.pages,
    finalFight: doc.bracket.finalFight,
    size: doc.bracket.entrants.length,
    entrants: doc.bracket.entrants,
    semiFights: doc.bracket.semiFights,
    quarterFights: doc.bracket.quarterFights,
    status: "ok",
    issues: [],
  };
}

/**
 * Même arbre ? Mêmes combats et mêmes athlètes, aux mêmes places. Sert à ne changer la version d'une division
 * que si le tirage a vraiment changé : un pronostic reste lié à la version sur laquelle il a été fait.
 */
export function sameBracket(a: DivisionDoc<unknown>["bracket"], b: DivisionDoc<unknown>["bracket"]): boolean {
  const entrant = (e: BracketEntrant) => [e.athleteId, e.name, e.country ?? "", e.seed ?? "", e.half ?? "", e.quarter ?? "", e.path.join(" ")].join("|");
  return (a.finalFight ?? "") === (b.finalFight ?? "")
    && a.semiFights.join() === b.semiFights.join() && a.quarterFights.join() === b.quarterFights.join()
    && a.entrants.length === b.entrants.length && a.entrants.every((e, i) => entrant(e) === entrant(b.entrants[i]));
}

/** Identifiant stable d'une division dans sa compétition : republier le même tirage met à jour le même document. */
export function divisionId(doc: Fields<DivisionDoc<unknown>, "day" | "category" | "bracket">): string {
  const slug = doc.category.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/\+/g, "plus").replace(/-(?=\d)/g, "moins").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return [doc.day, slug, doc.bracket.finalFight ?? "sans-finale"].join("_");
}

/** Firestore refuse `undefined` : les champs optionnels absents sont retirés, pas écrits vides. */
function withoutUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withoutUndefined) as T;
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) => [k, withoutUndefined(v)])) as T;
  }
  return value;
}

/** Document d'une division validée sur l'écran de contrôle, prêt à écrire dans Firestore. */
export function divisionDoc(
  division: BracketDivision,
  meta: { day: string; lockAt: Date; status?: DivisionStatus; version?: number; source: DivisionDoc["source"] },
): DivisionDoc {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.day)) throw new Error(`Jour invalide : ${meta.day} (AAAA-MM-JJ attendu).`);
  if (Number.isNaN(meta.lockAt.getTime())) throw new Error("Heure de verrouillage invalide.");
  const ids = division.entrants.map((e) => e.athleteId);
  if (new Set(ids).size !== ids.length) throw new Error(`${division.category} : identifiant d'athlète en double.`);
  return withoutUndefined({
    day: meta.day,
    category: division.category,
    ageCategory: division.ageCategory,
    genderCategory: division.genderCategory,
    weightCategory: division.weightCategory,
    status: meta.status ?? "draft",
    lockAt: meta.lockAt,
    version: meta.version ?? 1,
    bracket: {
      finalFight: division.finalFight,
      semiFights: division.semiFights,
      quarterFights: division.quarterFights,
      entrants: division.entrants,
    },
    athleteIds: ids,
    expected: expectedPicks(division),
    source: meta.source,
  });
}

/**
 * Instant UTC d'une heure locale dans un fuseau IANA, ex. 9 h à Riyad le 12/10/2026 → 06:00 UTC.
 * Sert à fixer l'heure de verrouillage « à l'heure de début, heure locale du lieu ». Changements d'heure compris :
 * une heure qui n'existe pas (passage à l'heure d'été) est décalée d'une heure plus tard, comme sur une horloge.
 */
export function zonedTimeToUtc(day: string, time: string, timeZone: string): Date {
  const date = day.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const clock = time.match(/^(\d{2}):(\d{2})$/);
  if (!date || !clock) throw new Error(`Date ou heure invalide : ${day} ${time} (AAAA-MM-JJ HH:MM attendu).`);
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const localAt = (instant: number) => {
    const parts = Object.fromEntries(format.formatToParts(new Date(instant)).map((p) => [p.type, Number(p.value)]));
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  };
  const wallClock = Date.UTC(Number(date[1]), Number(date[2]) - 1, Number(date[3]), Number(clock[1]), Number(clock[2]));
  const first = wallClock - (localAt(wallClock) - wallClock);
  const second = wallClock - (localAt(first) - first);
  // Heure inexistante : le second calcul retombe avant le changement d'heure ; le premier est l'heure avancée.
  return new Date(localAt(second) === wallClock ? second : first);
}
