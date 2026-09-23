import { useState } from "react";
import { DIVISION_STATUSES, zonedTimeToUtc, type DivisionStatus } from "../../../../src/model.ts";
import { deleteDivision, getCompetition, listDivisions, recomputeLeaderboards, saveCompetition, setDivisionLock, setDivisionStatus } from "../../data.ts";
import { adminError, formatDay, localDayAndTime } from "../../format.ts";
import { Link, navigate } from "../../router.tsx";
import { useAsync } from "../../useAsync.ts";
import { CompetitionForm } from "./CompetitionForm.tsx";
import { DeleteCompetitionButton } from "./DeleteCompetition.tsx";

export const STATUS_LABELS: Record<DivisionStatus, string> = {
  draft: "Brouillon", review: "En contrôle", open: "Ouverte", results: "Résultats saisis", closed: "Clôturée",
};

/** Jours de la compétition, du début à la fin (31 au plus), plus ceux des divisions publiées en dehors. */
function competitionDays(startDate: string, endDate: string, divisionDays: string[]): string[] {
  const days = new Set(divisionDays);
  const cursor = new Date(`${startDate}T12:00:00Z`);
  for (let i = 0; i < 31 && cursor.toISOString().slice(0, 10) <= endDate; i += 1) {
    days.add(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return [...days].sort();
}

export function AdminCompetitionPage({ cid }: { cid: string }) {
  const { data, error, loading, reload } = useAsync(async () => ({
    competition: await getCompetition(cid), divisions: await listDivisions(cid, true),
  }), [cid]);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  if (loading && !data) return <main className="page"><p className="muted">Chargement…</p></main>;
  if (error || !data?.competition) return <main className="page"><p className="error">{error ?? "Compétition introuvable."}</p></main>;
  const { competition, divisions } = data;
  const days = competitionDays(competition.startDate, competition.endDate, divisions.map((d) => d.day));
  const now = Date.now();

  async function act(action: () => Promise<unknown>, done: string) {
    setMessage(null);
    try { await action(); setMessage({ tone: "ok", text: done }); reload(); }
    catch (cause) { setMessage({ tone: "error", text: adminError(cause) }); }
  }

  return (
    <main className="page">
      <p className="crumbs"><Link to="/admin">Administration</Link></p>
      <h1>{competition.name}</h1>
      <p className="actions">
        <Link to={`/competitions/${cid}`} className="button">Voir comme un joueur</Link>
        <button onClick={() => act(() => recomputeLeaderboards(cid), "Classements recalculés.")}>Recalculer les classements</button>
      </p>
      {message && <p className={message.tone} role="status">{message.text}</p>}

      <h2>Journées</h2>
      <p className="muted small">Pour chaque journée : importe le tirage publié après la pesée, puis, une fois les combats terminés, saisis les résultats.
        Pour ajouter une journée, change les dates dans « Modifier la compétition ».</p>
      {days.map((day, index) => {
        const ofDay = divisions.filter((d) => d.day === day);
        const published = ofDay.filter((d) => d.status !== "draft" && d.status !== "review");
        const withResult = published.filter((d) => d.result);
        const firstPending = published.find((d) => !d.result);
        const started = published.some((d) => d.lockAt.getTime() <= now);
        return (
        <section key={day} className="admin-day">
          <h3>Jour {index + 1} · {formatDay(day)}</h3>
          <p className="muted small">{ofDay.length === 0 ? "Aucun tirage importé pour cette journée."
            : `${ofDay.length} division(s) · résultats saisis : ${withResult.length}/${published.length}`}</p>
          <p className="actions">
            <Link to={`/admin/competitions/${cid}/jours/${day}/import`} className={`button ${ofDay.length === 0 ? "primary" : ""}`}>
              {ofDay.length === 0 ? "Importer le tirage de ce jour" : "Importer un autre PDF de tirage"}</Link>
            {firstPending && <Link to={`/admin/competitions/${cid}/divisions/${firstPending.id}/resultats`} className={`button ${started ? "primary" : ""}`}>
              Saisir les résultats du jour ({published.length - withResult.length} à faire)</Link>}
          </p>
          {ofDay.length > 0 && <ul className="admin-divisions">
            {ofDay.map((division) => {
              const lock = localDayAndTime(division.lockAt, competition.timezone);
              const toEnter = !division.result && (division.status === "open" || division.status === "results") && division.lockAt.getTime() <= now;
              return (
                <li key={division.id} className="admin-division">
                  <div>
                    <strong>{division.category}</strong>
                    <span className="muted small"> · {division.bracket.entrants.length} athlètes · version {division.version}</span>
                    {division.result ? <span className="chip chip-done">Résultats saisis</span> : toEnter && <span className="chip chip-todo">Résultats à saisir</span>}
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
                    <Link to={`/admin/competitions/${cid}/divisions/${division.id}/resultats`} className={`button small ${toEnter ? "primary" : ""}`}>
                      {division.result ? "Modifier les résultats" : "Saisir les résultats"}</Link>
                    <button className="small danger" onClick={() => {
                      if (window.confirm(`Supprimer ${division.category} ? Ses pronostics seront supprimés aussi, définitivement.`)) {
                        void act(() => deleteDivision(cid, division.id), "Division supprimée.");
                      }
                    }}>Supprimer</button>
                  </div>
                </li>
              );
            })}
          </ul>}
        </section>
        );
      })}

      <details className="panel">
        <summary>Modifier la compétition</summary>
        <CompetitionForm initial={{ name: competition.name, location: competition.location, timezone: competition.timezone,
          startDate: competition.startDate, endDate: competition.endDate, published: competition.published }}
          submitLabel="Enregistrer" onSubmit={async (next) => { await saveCompetition(cid, next); reload(); }} />
      </details>

      <section className="panel danger-zone">
        <strong>Supprimer la compétition</strong>
        <p className="muted small">Efface ses divisions, les pronostics des joueurs et son classement. Le classement général est recalculé sans elle.</p>
        <DeleteCompetitionButton competition={competition} onDeleted={() => navigate("/admin", { replace: true })} />
      </section>
    </main>
  );
}
