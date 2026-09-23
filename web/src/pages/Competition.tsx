import type { DivisionDoc } from "../../../src/model.ts";
import { getCompetition, listDivisions, myPredictions } from "../data.ts";
import { formatCountdown, formatDates, formatDay, formatLocalTime } from "../format.ts";
import { PodiumIcon } from "../components/Icons.tsx";
import { Link } from "../router.tsx";
import { useSession } from "../session.tsx";
import { useAsync, useNow } from "../useAsync.ts";

/** État affiché d'une division : « verrouillée » se déduit de l'heure, comme dans les règles Firestore. */
export function divisionState(division: DivisionDoc, now: number): { label: string; tone: "open" | "locked" | "results" | "draft" } {
  if (division.status === "results" || division.status === "closed") return { label: "Résultats", tone: "results" };
  if (division.status !== "open") return { label: "Bientôt", tone: "draft" };
  const left = division.lockAt.getTime() - now;
  return left > 0 ? { label: `Ouverte · verrouillage ${formatCountdown(left)}`, tone: "open" } : { label: "Verrouillée", tone: "locked" };
}

export function CompetitionPage({ cid }: { cid: string }) {
  const { user } = useSession();
  const now = useNow();
  const { data, error, loading } = useAsync(async () => {
    const [competition, divisions] = await Promise.all([getCompetition(cid), listDivisions(cid, false)]);
    const mine = user ? await myPredictions(cid, divisions.map((d) => d.id), user.uid) : new Map();
    return { competition, divisions, mine };
  }, [cid, user?.uid]);

  if (loading && !data) return <main className="page"><p className="muted">Chargement…</p></main>;
  if (error) return <main className="page"><p className="error">{error}</p></main>;
  if (!data?.competition) return <main className="page"><h1>Compétition introuvable</h1><Link to="/">Retour</Link></main>;
  const { competition, divisions, mine } = data;
  const days = [...new Set(divisions.map((d) => d.day))];

  const openNow = divisions.filter((d) => divisionState(d, now).tone === "open");
  const doneNow = openNow.filter((d) => mine.has(d.id)).length;

  return (
    <main className="page">
      <p className="crumbs"><Link to="/">Compétitions</Link></p>
      <header className="home-header">
        <p className="eyebrow">{competition.location} · {formatDates(competition.startDate, competition.endDate)}</p>
        <h1>{competition.name}</h1>
      </header>

      {user && openNow.length > 0 && (
        <section className={`status-card ${doneNow < openNow.length ? "tone-open" : ""}`}>
          <span className={`chip ${doneNow < openNow.length ? "chip-todo" : "chip-open"}`}>{doneNow < openNow.length ? "À faire" : "À jour"}</span>
          <span className="status-value">{doneNow} / {openNow.length}</span>
          <span className="status-label">{doneNow < openNow.length ? "divisions ouvertes pronostiquées" : "Toutes les divisions ouvertes sont pronostiquées."}</span>
          <span className="progress" aria-hidden="true">
            {openNow.map((d) => <span key={d.id} className={`progress-dot ${mine.has(d.id) ? "place-quarter" : ""}`} />)}
          </span>
        </section>
      )}

      <ul className="division-list">
        <li><Link to={`/competitions/${cid}/classement`} className="division-row row-with-icon">
          <span className="row-icon tone-gold"><PodiumIcon /></span>
          <span className="division-title">Classement de la compétition</span>
        </Link></li>
      </ul>

      {divisions.length === 0 && <p className="empty-state">Les tirages seront publiés après la pesée.</p>}
      {days.map((day, index) => (
        <section key={day} className="group">
          <h2><span className="eyebrow">Jour {index + 1}</span><br />{formatDay(day)}</h2>
          <ul className="division-list">
            {divisions.filter((d) => d.day === day).map((division) => {
              const state = divisionState(division, now);
              const prediction = mine.get(division.id);
              const icon = !user ? null : prediction ? "done" : state.tone === "open" ? "todo" : null;
              return (
                <li key={division.id}>
                  <Link to={`/competitions/${cid}/divisions/${division.id}`} className={`division-row ${user ? "row-with-status" : ""}`}>
                    {user && <span className={`row-status ${icon ? `is-${icon}` : ""}`} aria-label={icon === "done" ? "Pronostic fait" : icon === "todo" ? "À faire" : undefined}>{icon === "done" ? "✓" : ""}</span>}
                    <span className="division-title">{division.category}</span>
                    <span className="muted small">{division.bracket.entrants.length} athlètes · verrouillage {formatLocalTime(division.lockAt, competition.timezone)}</span>
                    <span className="division-badges">
                      <span className={`chip chip-${state.tone}`}>{state.label}</span>
                      {prediction?.score && <span className="chip chip-done">{prediction.score.total} pts</span>}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </main>
  );
}
