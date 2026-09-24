// Français / anglais, partie sans React (testable) : langue courante, tr(), libellés des places, messages du moteur traduits.
// Chaque texte est écrit dans les deux langues à l'endroit où il s'affiche : tr("Enregistrer", "Save").
import type { Place } from "../../src/prediction.ts";

export type Lang = "fr" | "en";
const KEY = "tkd:langue";

function detect(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "fr" || saved === "en") return saved;
  } catch { /* stockage indisponible */ }
  return (navigator.languages?.[0] ?? navigator.language ?? "fr").toLowerCase().startsWith("fr") ? "fr" : "en";
}

let current: Lang = typeof window === "undefined" ? "fr" : detect();

/** Change la langue courante (le fournisseur React remonte ensuite l'app). */
export function setCurrentLang(next: Lang) {
  try { localStorage.setItem(KEY, next); } catch { /* choix non gardé */ }
  current = next;
}

/** Langue courante, pour le code hors composants (formats, messages d'erreur). */
export const lang = () => current;
/** Texte dans la langue courante. */
export const tr = (fr: string, en: string) => (current === "en" ? en : fr);
/** Locale pour Intl (dates, nombres). */
export const locale = () => (current === "en" ? "en-GB" : "fr-FR");

/** Libellés des places (l'interface les affiche ; le modèle garde les identifiants gold, silver…). */
export const placeLabel = (place: Place) => ({
  gold: tr("Vainqueur", "Winner"), silver: tr("Finaliste", "Finalist"), bronze: tr("Bronze", "Bronze"), quarter: tr("Battu en quart", "Lost in quarterfinal"),
})[place];
export const placeShort = (place: Place) => ({
  gold: tr("1er", "1st"), silver: tr("2e", "2nd"), bronze: tr("3e", "3rd"), quarter: tr("Quart", "QF"),
})[place];

/** Messages de cohérence du moteur (src/prediction.ts, en français) traduits pour l'affichage. */
export function translateIssue(issue: string): string {
  if (current === "fr") return issue;
  const rules: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
    [/^Athlète inconnu dans cette division : (.+)\.$/, (m) => `Unknown athlete in this division: ${m[1]}.`],
    [/^(.+) occupe plusieurs places\.$/, (m) => `${m[1]} holds several places.`],
    [/^(\d+) choix pour « (.+) », (\d+) au maximum\.$/, (m) => `${m[1]} picks for “${m[2]}”, ${m[3]} at most.`],
    [/^(\d+) choix manquant\(s\) pour « (.+) »\.$/, (m) => `${m[1]} missing pick(s) for “${m[2]}”.`],
    [/^Le vainqueur et le finaliste viennent de la même moitié d'arbre/, () => "The winner and the finalist come from the same half of the bracket: they cannot meet in the final."],
    [/^Deux médaillés de bronze viennent de la même moitié d'arbre\.$/, () => "Two bronze medallists come from the same half of the bracket."],
    [/^Deux médaillés viennent du même quart d'arbre/, () => "Two medallists come from the same quarter of the bracket: only one can reach the semifinals."],
    [/^(.+) entre directement en demi-finale/, (m) => `${m[1]} enters directly in the semifinal: they cannot lose in the quarterfinal.`],
    [/^(.+) est battu en quart, mais aucun médaillé ne sort de son quart d'arbre\.$/, (m) => `${m[1]} lost in the quarterfinal, but no medallist comes out of that quarter of the bracket.`],
    [/^Deux battus en quart viennent du même quart de finale\.$/, () => "Two quarterfinal losers come from the same quarterfinal."],
    [/^Deux quarts de finalistes viennent de la même branche/, () => "Two quarterfinalists come from the same branch: they meet before the quarterfinals."],
  ];
  for (const [pattern, render] of rules) {
    const match = issue.match(pattern);
    if (match) return render(match);
  }
  return issue;
}
