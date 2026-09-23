import type { BracketDivision } from "../../src/bracket-builder.ts";
import type { EntrantPatch } from "../../src/bracket-editing.ts";

type Props = {
  division: BracketDivision;
  original: BracketDivision;
  athleteId: string;
  onChange: (patch: EntrantPatch) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
  onClose: () => void;
};

/** Correction manuelle d'un athlète : chaque champ affiche la valeur lue quand elle a été modifiée. */
export function EntrantEditor({ division, original, athleteId, onChange, onMove, onRemove, onClose }: Props) {
  const entrant = division.entrants.find((e) => e.athleteId === athleteId);
  if (!entrant) return null;
  const read = original.entrants.find((e) => e.athleteId === athleteId);
  const hint = (value: unknown, before: unknown) =>
    read && (value ?? "") !== (before ?? "") ? <small className="muted">Lu : {String(before ?? "vide")}</small> : null;

  return (
    <aside className="editor" aria-label="Correction de l'athlète">
      <header>
        <strong>{read ? `Athlète n° ${entrant.position}` : "Athlète ajouté"}</strong>
        <button className="link" onClick={onClose}>Fermer</button>
      </header>
      <label>Nom
        <input value={entrant.name} onChange={(e) => onChange({ name: e.target.value })} />
        {hint(entrant.name, read?.name)}
      </label>
      <div className="row">
        <label>Pays
          <input value={entrant.country ?? ""} maxLength={3} onChange={(e) => onChange({ country: e.target.value })} />
          {hint(entrant.country, read?.country)}
        </label>
        <label>Tête de série
          <input type="number" min={1} value={entrant.seed ?? ""}
            onChange={(e) => onChange({ seed: e.target.value ? Number(e.target.value) : undefined })} />
          {hint(entrant.seed, read?.seed)}
        </label>
      </div>
      <div className="row">
        <label>Demi-finale (combat)
          <input list="semi-fights" value={entrant.half ?? ""} onChange={(e) => onChange({ half: e.target.value })} />
          {hint(entrant.half, read?.half)}
        </label>
        <label>Quart (combat)
          <input list="quarter-fights" value={entrant.quarter ?? ""} placeholder="vide = exempt"
            onChange={(e) => onChange({ quarter: e.target.value })} />
          {hint(entrant.quarter, read?.quarter)}
        </label>
      </div>
      <datalist id="semi-fights">{division.semiFights.map((f) => <option key={f} value={f} />)}</datalist>
      <datalist id="quarter-fights">{division.quarterFights.map((f) => <option key={f} value={f} />)}</datalist>
      <div className="editor-actions">
        <button onClick={() => onMove(-1)} disabled={entrant.position === 1}>↑ Monter</button>
        <button onClick={() => onMove(1)} disabled={entrant.position === division.entrants.length}>↓ Descendre</button>
        <button className="danger" onClick={onRemove}>Retirer de l'arbre</button>
      </div>
    </aside>
  );
}
