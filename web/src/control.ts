// État d'une séance de contrôle : divisions lues, corrections, validations, bilan de la phase 0.
import { checkBracket, type BracketDivision, type BracketEntrant } from "../../src/bracket-builder.ts";
import { countCorrections, readingIssues } from "../../src/bracket-editing.ts";

export type Entry = {
  original: BracketDivision;
  current: BracketDivision;
  validated: boolean;
  /** L'admin a comparé chaque athlète au PDF : exigé tant qu'une alerte de lecture reste affichée. */
  checked: boolean;
};

export type Session = { fileName: string; sha256: string; pageCount: number; ocrPages: number; entries: Entry[] };

export function entryState(entry: Entry) {
  const structural = checkBracket(entry.current.entrants, entry.current.finalFight);
  const reading = readingIssues(entry.current);
  const corrections = countCorrections(entry.original, entry.current);
  return { structural, reading, corrections, canValidate: structural.length === 0 && (reading.length === 0 || entry.checked) };
}

export function summarize(entries: Entry[]) {
  const validated = entries.filter((e) => e.validated);
  return {
    total: entries.length,
    readOk: entries.filter((e) => e.original.status === "ok").length,
    validated: validated.length,
    validatedAsRead: validated.filter((e) => countCorrections(e.original, e.current) === 0).length,
  };
}

export function entrantChange(original: BracketDivision, entrant: BracketEntrant): "added" | "changed" | undefined {
  const before = original.entrants.find((e) => e.athleteId === entrant.athleteId);
  if (!before) return "added";
  const fields = ["name", "country", "seed", "half", "quarter"] as const;
  return fields.some((f) => (before[f] ?? undefined) !== (entrant[f] ?? undefined)) ? "changed" : undefined;
}

export async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Fichier de contrôle téléchargé par l'admin : reste sur sa machine, sert à l'import dans Firestore plus tard. */
export function exportControl(session: Session): Blob {
  const content = {
    format: "taekwondo-score/controle@1",
    exportedAt: new Date().toISOString(),
    source: { fileName: session.fileName, sha256: session.sha256, pageCount: session.pageCount, ocrPages: session.ocrPages },
    summary: summarize(session.entries),
    divisions: session.entries.map((entry) => ({
      ...entry.current,
      validation: { validated: entry.validated, checkedAgainstPdf: entry.checked, corrections: entryState(entry).corrections },
    })),
  };
  return new Blob([JSON.stringify(content, null, 2)], { type: "application/json" });
}
