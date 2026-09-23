import { useState } from "react";
import type { CompetitionDoc } from "../../../../src/model.ts";
import { competitionFootprint, deleteCompetition, type WithId } from "../../data.ts";
import { adminError } from "../../format.ts";

/**
 * Suppression d'une compétition : irréversible, elle efface divisions, pronostics et classement de la compétition.
 * La confirmation annonce ce qui sera supprimé et demande de retaper le nom.
 */
export function DeleteCompetitionButton({ competition, onDeleted, small = false }: {
  competition: WithId<CompetitionDoc>; onDeleted: () => void; small?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [footprint, setFootprint] = useState<{ divisions: number; predictions: number } | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmed = typed.trim().toLowerCase() === competition.name.trim().toLowerCase();

  async function start() {
    setOpen(true);
    setTyped("");
    setError(null);
    setFootprint(null);
    try { setFootprint(await competitionFootprint(competition.id)); } catch (cause) { setError(adminError(cause)); }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await deleteCompetition(competition.id);
      setOpen(false);
      onDeleted();
    } catch (cause) {
      setError(adminError(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className={`danger ${small ? "small" : ""}`} onClick={start}>Supprimer</button>
      {open && (
        <div className="sheet-backdrop" onClick={() => !busy && setOpen(false)}>
          <div className="sheet" role="dialog" aria-label={`Supprimer ${competition.name}`} onClick={(e) => e.stopPropagation()}>
            <p className="sheet-title">Supprimer « {competition.name} » ?</p>
            <p className="muted">
              {footprint
                ? `${footprint.divisions} division(s) et ${footprint.predictions} pronostic(s) seront effacés, ainsi que le classement de la compétition. Le classement général sera recalculé sans elle.`
                : "Calcul de ce qui sera supprimé…"}
            </p>
            <p className="error">Cette action est définitive : rien ne pourra être récupéré.</p>
            <div className="form">
              <label>Pour confirmer, tape le nom de la compétition
                <input value={typed} placeholder={competition.name} autoComplete="off" onChange={(e) => setTyped(e.target.value)} />
              </label>
            </div>
            {error && <p className="error" role="status">{error}</p>}
            <div className="sheet-actions">
              <button type="button" className="danger-solid" disabled={!confirmed || busy || !footprint} onClick={remove}>
                {busy ? "Suppression…" : "Supprimer définitivement"}
              </button>
              <button type="button" onClick={() => setOpen(false)} disabled={busy}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
