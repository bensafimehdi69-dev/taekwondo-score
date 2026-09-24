import { useState } from "react";
import { DIVISION_STATUSES, zonedTimeToUtc, type DivisionStatus } from "../../../../src/model.ts";
import { deleteDivision, getCompetition, listDivisions, recomputeLeaderboards, saveCompetition, setDivisionLock, setDivisionStatus } from "../../data.ts";
import { adminError, formatDay, localDayAndTime } from "../../format.ts";
import { tr } from "../../i18n.tsx";
import { Link, navigate } from "../../router.tsx";
import { takeFlash } from "../../flash.ts";
import { useAsync } from "../../useAsync.ts";
import { CompetitionForm } from "./CompetitionForm.tsx";
import { DeleteCompetitionButton } from "./DeleteCompetition.tsx";

/** Libellé d'un statut dans la langue courante (calculé à l'affichage). */
export const statusLabel = (status: DivisionStatus): string => ({
  draft: tr("Brouillon", "Draft"), review: tr("En contrôle", "In review"), open: tr("Ouverte", "Open"),
  results: tr("Résultats saisis", "Results entered"), closed: tr("Clôturée", "Closed"),
})[status];

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
  // Message laissé par la page précédente (publication d'un tirage), affiché une fois.
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(() => {
    const flash = takeFlash();
    return flash ? { tone: "ok", text: flash } : null;
  });

  if (loading && !data) return <main className="page"><p className="muted">{tr("Chargement…", "Loading…")}</p></main>;
  if (error || !data?.competition) return <main className="page"><p className="error">{error ?? tr("Compétition introuvable.", "Competition not found.")}</p></main>;
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
      <p className="crumbs"><Link to="/admin">{tr("Administration", "Admin")}</Link></p>
      <header className="home-header">
        <p className="eyebrow">{competition.location} · {competition.published ? tr("Publiée", "Published") : tr("Non publiée", "Not published")}</p>
        <h1>{competition.name}</h1>
      </header>
      <p className="actions">
        <Link to={`/competitions/${cid}`} className="button">{tr("Voir comme un joueur", "View as player")}</Link>
        <button onClick={() => act(() => recomputeLeaderboards(cid), tr("Classements recalculés.", "Leaderboards recalculated."))}>{tr("Recalculer les classements", "Recalculate leaderboards")}</button>
      </p>
      {message && <p className={message.tone === "ok" ? "notice success" : "error"} role="status">{message.text}</p>}

      <h2>{tr("Journées", "Days")}</h2>
      <p className="muted small">{tr("Pour chaque journée : importe le tirage publié après la pesée, puis, une fois les combats terminés, saisis les résultats. Pour ajouter une journée, change les dates dans « Modifier la compétition ».",
        "For each day: import the draw published after the weigh-in, then, once the bouts are over, enter the results. To add a day, change the dates in “Edit competition”.")}</p>
      {days.map((day, index) => {
        const ofDay = divisions.filter((d) => d.day === day);
        const published = ofDay.filter((d) => d.status !== "draft" && d.status !== "review");
        const withResult = published.filter((d) => d.result);
        const firstPending = published.find((d) => !d.result);
        const started = published.some((d) => d.lockAt.getTime() <= now);
        return (
        <section key={day} className="admin-day">
          <h3><span className="eyebrow">{tr(`Jour ${index + 1}`, `Day ${index + 1}`)}</span><br />{formatDay(day)}</h3>
          <p className="muted small">{ofDay.length === 0 ? tr("Aucun tirage importé pour cette journée.", "No draw imported for this day yet.")
            : tr(`${ofDay.length} division(s) · résultats saisis : ${withResult.length}/${published.length}`,
              `${ofDay.length} division${ofDay.length === 1 ? "" : "s"} · results entered: ${withResult.length}/${published.length}`)}</p>
          <p className="actions">
            <Link to={`/admin/competitions/${cid}/jours/${day}/import`} className={`button ${ofDay.length === 0 ? "primary" : ""}`}>
              {ofDay.length === 0 ? tr("Importer le tirage de ce jour", "Import this day's draw") : tr("Importer un autre PDF de tirage", "Import another draw PDF")}</Link>
            {published.length > 0 && <Link to={`/admin/competitions/${cid}/jours/${day}/resultats`} className="button">{tr("Importer le PDF des résultats", "Import results PDF")}</Link>}
            {firstPending && <Link to={`/admin/competitions/${cid}/divisions/${firstPending.id}/resultats`} className={`button ${started ? "primary" : ""}`}>
              {tr(`Saisir les résultats du jour (${published.length - withResult.length} à faire)`, `Enter the day's results (${published.length - withResult.length} to do)`)}</Link>}
          </p>
          {ofDay.length > 0 && <ul className="admin-divisions">
            {ofDay.map((division) => {
              const lock = localDayAndTime(division.lockAt, competition.timezone);
              const toEnter = !division.result && (division.status === "open" || division.status === "results") && division.lockAt.getTime() <= now;
              return (
                <li key={division.id} className="admin-division">
                  <div>
                    <strong>{division.category}</strong>
                    <span className="muted small"> · {tr(`${division.bracket.entrants.length} athlètes · version ${division.version}`, `${division.bracket.entrants.length} athlete${division.bracket.entrants.length === 1 ? "" : "s"} · version ${division.version}`)}</span>
                    {division.result ? <span className="chip chip-done">{tr("Résultats saisis", "Results entered")}</span> : toEnter && <span className="chip chip-todo">{tr("Résultats à saisir", "Results to enter")}</span>}
                  </div>
                  <div className="admin-division-controls">
                    <label>{tr("Statut", "Status")}
                      <select value={division.status} onChange={(e) => act(() => setDivisionStatus(cid, division.id, e.target.value as DivisionStatus), tr(`${division.category} : ${statusLabel(e.target.value as DivisionStatus)}.`, `${division.category}: ${statusLabel(e.target.value as DivisionStatus)}.`))}>
                        {DIVISION_STATUSES.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
                      </select>
                    </label>
                    <label>{tr("Verrouillage (heure locale)", "Lock (local time)")}
                      <input type="time" defaultValue={lock.time} onBlur={(e) => {
                        if (e.target.value && e.target.value !== lock.time) {
                          void act(() => setDivisionLock(cid, division.id, zonedTimeToUtc(lock.day, e.target.value, competition.timezone)), tr(`Verrouillage : ${e.target.value}.`, `Lock: ${e.target.value}.`));
                        }
                      }} />
                    </label>
                    <Link to={`/competitions/${cid}/divisions/${division.id}`} className="button small">{tr("Voir", "View")}</Link>
                    <Link to={`/admin/competitions/${cid}/divisions/${division.id}/resultats`} className={`button small ${toEnter ? "primary" : ""}`}>
                      {division.result ? tr("Modifier les résultats", "Edit results") : tr("Saisir les résultats", "Enter results")}</Link>
                    <button className="small danger" onClick={() => {
                      if (window.confirm(tr(`Supprimer ${division.category} ? Ses pronostics seront supprimés aussi, définitivement.`, `Delete ${division.category}? Its predictions will be deleted too, permanently.`))) {
                        void act(() => deleteDivision(cid, division.id), tr("Division supprimée.", "Division deleted."));
                      }
                    }}>{tr("Supprimer", "Delete")}</button>
                  </div>
                </li>
              );
            })}
          </ul>}
        </section>
        );
      })}

      <details className="panel">
        <summary>{tr("Modifier la compétition", "Edit competition")}</summary>
        <CompetitionForm initial={{ name: competition.name, location: competition.location, timezone: competition.timezone,
          startDate: competition.startDate, endDate: competition.endDate, published: competition.published }}
          submitLabel={tr("Enregistrer", "Save")} onSubmit={async (next) => { await saveCompetition(cid, next); reload(); }} />
      </details>

      <section className="panel danger-zone">
        <strong>{tr("Supprimer la compétition", "Delete competition")}</strong>
        <p className="muted small">{tr("Efface ses divisions, les pronostics des joueurs et son classement. Le classement général est recalculé sans elle.", "Deletes its divisions, the players' predictions and its leaderboard. The overall leaderboard is recalculated without it.")}</p>
        <DeleteCompetitionButton competition={competition} onDeleted={() => navigate("/admin", { replace: true })} />
      </section>
    </main>
  );
}
