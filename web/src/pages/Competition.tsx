import type { DivisionDoc } from "../../../src/model.ts";
import { getCompetition, listDivisions, myPredictions } from "../data.ts";
import { formatCountdown, formatDates, formatDay, formatLocalTime } from "../format.ts";
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

  return (
    <main className="page">
      <p className="crumbs"><Link to="/">Compétitions</Link></p>
      <h1>{competition.name}</h1>
      <p className="muted">{competition.location} · {formatDates(competition.startDate, competition.endDate)}</p>
      <p><Link to={`/competitions/${cid}/classement`} className="button small">Classement de la compétition</Link></p>
      {divisions.length === 0 && <p className="muted">Les tirages seront publiés après la pesée.</p>}
      {days.map((day) => (
        <section key={day}>
          <h2>{formatDay(day)}</h2>
          <ul className="division-list">
            {divisions.filter((d) => d.day === day).map((division) => {
              const state = divisionState(division, now);
              const prediction = mine.get(division.id);
              return (
                <li key={division.id}>
                  <Link to={`/competitions/${cid}/divisions/${division.id}`} className="division-row">
                    <span className="division-title">{division.category}</span>
                    <span className="muted small">{division.bracket.entrants.length} athlètes · verrouillage {formatLocalTime(division.lockAt, competition.timezone)}</span>
                    <span className="division-badges">
                      <span className={`chip chip-${state.tone}`}>{state.label}</span>
                      {user && (prediction
                        ? <span className="chip chip-done">{prediction.score ? `${prediction.score.total} pts` : "Pronostic fait"}</span>
                        : state.tone === "open" && <span className="chip chip-todo">À faire</span>)}
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
