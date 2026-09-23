// Résultats lus dans un PDF, en attente de vérification par l'admin : gardés le temps de la session du navigateur,
// puis repris par la page de saisie des résultats de la division. Rien n'est enregistré en ligne avant sa validation.
import type { Places } from "../../src/model.ts";

export type ImportedResult = { places: Places; fileName: string; deduced: string[]; fromWinners?: string[]; issues: string[] };

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
