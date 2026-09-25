// Résultats lus dans un PDF, en attente de vérification par l'admin : gardés le temps de la session du navigateur,
// puis repris par la page de saisie des résultats de la division. Rien n'est enregistré en ligne avant sa validation.
import type { Places } from "../../src/model.ts";

export type ImportedResult = {
  places: Places; fileName: string; deduced: string[]; fromWinners?: string[]; issues: string[];
  /** Vérifié automatiquement (classement et combats concordent) ; pages de la division dans le PDF. */
  verified?: boolean; reasons?: string[]; pages?: number[];
};

// Le PDF des résultats reste en mémoire le temps de la session (navigation dans l'app, sans rechargement) :
// la page de saisie peut l'afficher à côté de l'arbre. Il n'est jamais envoyé en ligne.
let resultsPdf: File | null = null;
export const rememberResultsPdf = (file: File) => { resultsPdf = file; };
export const currentResultsPdf = () => resultsPdf;

const key = (cid: string, did: string) => `tkd:resultat-lu:${cid}:${did}`;

export function storeImportedResult(cid: string, did: string, result: ImportedResult) {
  try { sessionStorage.setItem(key(cid, did), JSON.stringify(result)); } catch { /* stockage indisponible : saisie à la main */ }
}

export function loadImportedResult(cid: string, did: string): ImportedResult | null {
  try {
    const raw = sessionStorage.getItem(key(cid, did));
    return raw ? JSON.parse(raw) as ImportedResult : null;
  } catch { return null; }
}

export function clearImportedResult(cid: string, did: string) {
  try { sessionStorage.removeItem(key(cid, did)); } catch { /* rien à nettoyer */ }
}
