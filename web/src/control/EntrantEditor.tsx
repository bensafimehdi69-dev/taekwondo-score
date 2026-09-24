import type { BracketDivision } from "../../../src/bracket-builder.ts";
import type { EntrantPatch } from "../../../src/bracket-editing.ts";
import { tr } from "../i18n.tsx";

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
    read && (value ?? "") !== (before ?? "") ? <small className="muted">{tr("Lu : ", "Read: ")}{before == null ? tr("vide", "empty") : String(before)}</small> : null;

  return (
    <aside className="editor" aria-label={tr("Correction de l'athlète", "Athlete correction")}>
      <header>
        <strong>{entrant.name || (read ? tr(`Athlète n° ${entrant.position}`, `Athlete no. ${entrant.position}`) : tr("Athlète ajouté", "Added athlete"))}</strong>
        <button className="link" onClick={onClose}>{tr("Fermer", "Close")}</button>
      </header>
      <label>{tr("Nom", "Name")}
        <input value={entrant.name} onChange={(e) => onChange({ name: e.target.value })} />
        {hint(entrant.name, read?.name)}
      </label>
      <div className="row">
        <label>{tr("Pays", "Country")}
          <input value={entrant.country ?? ""} maxLength={3} onChange={(e) => onChange({ country: e.target.value })} />
          {hint(entrant.country, read?.country)}
        </label>
        <label>{tr("Tête de série", "Seed")}
          <input type="number" min={1} value={entrant.seed ?? ""}
            onChange={(e) => onChange({ seed: e.target.value ? Number(e.target.value) : undefined })} />
          {hint(entrant.seed, read?.seed)}
        </label>
      </div>
      <div className="row">
        <label>{tr("Demi-finale (combat)", "Semifinal (bout)")}
          <input list="semi-fights" value={entrant.half ?? ""} onChange={(e) => onChange({ half: e.target.value })} />
          {hint(entrant.half, read?.half)}
        </label>
        <label>{tr("Quart (combat)", "Quarterfinal (bout)")}
          <input list="quarter-fights" value={entrant.quarter ?? ""} placeholder={tr("vide = exempt", "empty = bye")}
            onChange={(e) => onChange({ quarter: e.target.value })} />
          {hint(entrant.quarter, read?.quarter)}
        </label>
      </div>
      <datalist id="semi-fights">{division.semiFights.map((f) => <option key={f} value={f} />)}</datalist>
      <datalist id="quarter-fights">{division.quarterFights.map((f) => <option key={f} value={f} />)}</datalist>
      <div className="editor-actions">
        <button onClick={() => onMove(-1)} disabled={entrant.position === 1}>↑ {tr("Monter", "Move up")}</button>
        <button onClick={() => onMove(1)} disabled={entrant.position === division.entrants.length}>↓ {tr("Descendre", "Move down")}</button>
        <button className="danger" onClick={onRemove}>{tr("Retirer de l'arbre", "Remove from bracket")}</button>
      </div>
    </aside>
  );
}
