import { useState } from "react";
import { DIVISION_STATUSES, zonedTimeToUtc, type DivisionStatus } from "../../../../src/model.ts";
import { deleteDivision, getCompetition, listDivisions, recomputeLeaderboards, saveCompetition, setDivisionLock, setDivisionStatus } from "../../data.ts";
import { errorMessage, formatDay, localDayAndTime } from "../../format.ts";
import { Link } from "../../router.tsx";
import { useAsync } from "../../useAsync.ts";
import { CompetitionForm } from "./CompetitionForm.tsx";

export const STATUS_LABELS: Record<DivisionStatus, string> = {
  draft: "Brouillon", review: "En contrôle", open: "Ouverte", results: "Résultats saisis", closed: "Clôturée",
};

export function AdminCompetitionPage({ cid }: { cid: string }) {
  const { data, error, loading, reload } = useAsync(async () => ({
    competition: await getCompetition(cid), divisions: await listDivisions(cid, true),
  }), [cid]);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  if (loading && !data) return <main className="page"><p className="muted">Chargement…</p></main>;
  if (error || !data?.competition) return <main className="page"><p className="error">{error ?? "Compétition introuvable."}</p></main>;
  const { competition, divisions } = data;
  const days = [...new Set(divisions.map((d) => d.day))];

  async function act(action: () => Promise<unknown>, done: string) {
    setMessage(null);
    try { await action(); setMessage({ tone: "ok", text: done }); reload(); }
    catch (cause) { setMessage({ tone: "error", text: errorMessage(cause) }); }
  }

  return (
    <main className="page">
      <p className="crumbs"><Link to="/admin">Administration</Link></p>
      <h1>{competition.name}</h1>
      <p className="actions">
        <Link to={`/admin/competitions/${cid}/import`} className="button primary">Importer un PDF de tirage</Link>
        <Link to={`/competitions/${cid}`} className="button">Voir comme un joueur</Link>
        <button onClick={() => act(() => recomputeLeaderboards(cid), "Classements recalculés.")}>Recalculer les classements</button>
      </p>
      {message && <p className={message.tone} role="status">{message.text}</p>}

      <h2>Divisions</h2>
      {divisions.length === 0 && <p className="muted">Aucune division : importe le PDF du tirage publié après la pesée.</p>}
      {days.map((day) => (
        <section key={day}>
          <h3>{formatDay(day)}</h3>
          <ul className="admin-divisions">
            {divisions.filter((d) => d.day === day).map((division) => {
              const lock = localDayAndTime(division.lockAt, competition.timezone);
              return (
                <li key={division.id} className="admin-division">
                  <div>
                    <strong>{division.category}</strong>
                    <span className="muted small"> · {division.bracket.entrants.length} athlètes · version {division.version}</span>
                  </div>
                  <div className="admin-division-controls">
                    <label>Statut
                      <select value={division.status} onChange={(e) => act(() => setDivisionStatus(cid, division.id, e.target.value as DivisionStatus), `${division.category} : ${STATUS_LABELS[e.target.value as DivisionStatus]}.`)}>
                        {DIVISION_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
                      </select>
                    </label>
                    <label>Verrouillage (heure locale)
                      <input type="time" defaultValue={lock.time} onBlur={(e) => {
                        if (e.target.value && e.target.value !== lock.time) {
                          void act(() => setDivisionLock(cid, division.id, zonedTimeToUtc(lock.day, e.target.value, competition.timezone)), `Verrouillage : ${e.target.value}.`);
                        }
                      }} />
                    </label>
                    <Link to={`/competitions/${cid}/divisions/${division.id}`} className="button small">Voir</Link>
                    <Link to={`/admin/competitions/${cid}/divisions/${division.id}/resultats`} className="button small">Résultats</Link>
                    <button className="small danger" onClick={() => {
                      if (window.confirm(`Supprimer ${division.category} ? Les pronostics déjà faits ne seront plus visibles.`)) {
                        void act(() => deleteDivision(cid, division.id), "Division supprimée.");
                      }
                    }}>Supprimer</button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <details className="panel">
        <summary>Modifier la compétition</summary>
        <CompetitionForm initial={{ name: competition.name, location: competition.location, timezone: competition.timezone,
          startDate: competition.startDate, endDate: competition.endDate, published: competition.published }}
          submitLabel="Enregistrer" onSubmit={async (next) => { await saveCompetition(cid, next); reload(); }} />
      </details>
    </main>
  );
}
