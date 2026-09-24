// Accueil façon iOS 27 : grand titre personnel, widgets (rang, pronostics à faire), liste « À faire maintenant »
// des divisions ouvertes sans pronostic, puis les compétitions en cartes. Visiteur : le jeu expliqué en trois étapes.
import type { CompetitionDoc, DivisionDoc } from "../../../src/model.ts";
import { BracketIcon, PodiumIcon } from "../components/Icons.tsx";
import { leaderboard, listCompetitions, listDivisions, myPredictions, type WithId } from "../data.ts";
import { formatCountdown, formatDates, formatDay, formatPoints } from "../format.ts";
import { tr } from "../i18n.tsx";
import { Link } from "../router.tsx";
import { useSession } from "../session.tsx";
import { useAsync, useNow } from "../useAsync.ts";

type Todo = { competition: WithId<CompetitionDoc>; division: WithId<DivisionDoc> };

const DAY = 86_400_000;
const todayIso = () => new Date().toISOString().slice(0, 10);

/** Rang affiché : « 1er », « 2e » ; en anglais « 1st », « 2nd », « 3rd », « 11th ». */
function ordinal(rank: number): string {
  const suffix = rank % 100 >= 11 && rank % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[rank % 10] ?? "th";
  return tr(`${rank}${rank === 1 ? "er" : "e"}`, `${rank}${suffix}`);
}

/** État d'une compétition pour sa carte : en cours, à venir (dans n jours) ou terminée. */
function competitionState(c: CompetitionDoc, today: string): { label: string; tone: "open" | "draft" | "locked" } {
  if (c.startDate <= today && c.endDate >= today) return { label: tr("En cours", "Ongoing"), tone: "open" };
  if (c.startDate > today) {
    const days = Math.round((Date.parse(`${c.startDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY);
    return { label: days === 1 ? tr("Demain", "Tomorrow") : tr(`Dans ${days} jours`, `In ${days} days`), tone: "draft" };
  }
  return { label: tr("Terminée", "Finished"), tone: "locked" };
}

export function HomePage() {
  const { user, profile } = useSession();
  const now = useNow(30_000);
  const today = todayIso();
  const { data, error, loading } = useAsync(async () => {
    const competitions = await listCompetitions(false);
    const current = competitions.filter((c) => c.endDate >= todayIso());
    // Divisions ouvertes des compétitions à venir ou en cours, et les pronostics déjà faits.
    const perCompetition = await Promise.all(current.map(async (competition) => {
      const divisions = await listDivisions(competition.id, false);
      const open = divisions.filter((d) => d.status === "open" && d.lockAt.getTime() > Date.now());
      const mine = user ? await myPredictions(competition.id, open.map((d) => d.id), user.uid) : new Map();
      return { competition, open, todo: open.filter((d) => !mine.has(d.id)) };
    }));
    const rows = user ? await leaderboard() : [];
    return { competitions, perCompetition, me: rows.find((r) => r.uid === user?.uid) ?? null, players: rows.length };
  }, [user?.uid]);

  const current = (data?.competitions ?? []).filter((c) => c.endDate >= today);
  const past = (data?.competitions ?? []).filter((c) => c.endDate < today);
  const todos: Todo[] = (data?.perCompetition ?? [])
    .flatMap((p) => p.todo.map((division) => ({ competition: p.competition, division })))
    .filter((t) => t.division.lockAt.getTime() > now)
    .sort((a, b) => a.division.lockAt.getTime() - b.division.lockAt.getTime());
  const openCount = (cid: string) => data?.perCompetition.find((p) => p.competition.id === cid)?.open.length ?? 0;
  const firstName = profile?.displayName.split(/\s+/)[0];

  return (
    <main className="page home">
      <header className="home-header">
        <p className="eyebrow">{formatDay(today)}</p>
        <h1>{user && firstName ? tr(`Bonjour, ${firstName}`, `Hello, ${firstName}`) : "Taekwondo Score"}</h1>
      </header>

      {!user && (
        <section className="hero">
          <h2>{tr("Pronostique les tirages officiels de taekwondo", "Predict official taekwondo draws")}</h2>
          <p>{tr("Sans argent, pour le plaisir et le classement, entre pratiquants.", "No money involved: just for fun and the leaderboard, among practitioners.")}</p>
          <ol className="steps">
            <li><span className="step-number">1</span><span><strong>{tr("Choisis une compétition", "Pick a competition")}</strong> {tr("dès que le tirage est publié, après la pesée.", "as soon as the draw is published, after the weigh-in.")}</span></li>
            <li><span className="step-number">2</span><span><strong>{tr("Touche les athlètes", "Tap the athletes")}</strong> {tr("pour donner ton podium et tes quarts : leur chemin se dessine dans l'arbre.", "to set your podium and quarterfinal losers: their path is drawn in the bracket.")}</span></li>
            <li><span className="step-number">3</span><span><strong>{tr("Gagne des points", "Earn points")}</strong> {tr("à chaque résultat et grimpe au classement.", "with each result and climb the leaderboard.")}</span></li>
          </ol>
          <Link to="/connexion" className="button primary">{tr("Créer un compte", "Create account")}</Link>
        </section>
      )}

      {user && data && (
        <div className="widgets">
          <Link to="/classement" className="widget">
            <span className="widget-icon tone-gold"><PodiumIcon /></span>
            <span className="widget-value">{data.me ? ordinal(data.me.rank) : "—"}</span>
            <span className="widget-label">{data.me ? tr(`${formatPoints(data.me.points)} pts · ${data.players} joueurs`, `${formatPoints(data.me.points)} pts · ${data.players} player${data.players === 1 ? "" : "s"}`) : tr("Pas encore de points", "No points yet")}</span>
          </Link>
          <a href="#a-faire" className="widget">
            <span className="widget-icon tone-accent"><BracketIcon /></span>
            <span className="widget-value">{todos.length}</span>
            <span className="widget-label">{todos.length === 0 ? tr("Tout est à jour", "All up to date") : todos.length === 1 ? tr("pronostic à faire", "prediction to do") : tr("pronostics à faire", "predictions to do")}</span>
          </a>
        </div>
      )}

      {loading && !data && <div className="skeleton" aria-label={tr("Chargement", "Loading")} />}
      {error && <p className="error">{error}</p>}

      {user && data && (
        <section id="a-faire">
          <h2>{tr("À faire maintenant", "To do now")}</h2>
          {todos.length === 0 ? (
            <p className="empty-state">{current.length === 0 ? tr("Aucune compétition en cours : les prochains tirages apparaîtront ici après la pesée.", "No competition in progress: the next draws will appear here after the weigh-in.")
              : tr("Tous tes pronostics sont faits. Tu peux encore les modifier jusqu'au verrouillage.", "All your predictions are done. You can still change them until the lock.")}</p>
          ) : (
            <ul className="division-list">
              {todos.map(({ competition, division }) => {
                const left = division.lockAt.getTime() - now;
                return (
                  <li key={`${competition.id}/${division.id}`}>
                    <Link to={`/competitions/${competition.id}/divisions/${division.id}`} className="division-row">
                      <span className="division-title">{division.category}</span>
                      <span className="muted small">{competition.name} · {tr(`${division.bracket.entrants.length} athlètes`, `${division.bracket.entrants.length} athlete${division.bracket.entrants.length === 1 ? "" : "s"}`)}</span>
                      <span className="division-badges"><span className={`chip ${left < 3 * 3_600_000 ? "chip-urgent" : "chip-todo"}`}>{tr(`Verrouillage ${formatCountdown(left)}`, `Locks ${formatCountdown(left)}`)}</span></span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {current.length > 0 && (
        <section>
          <h2>{tr("Compétitions", "Competitions")}</h2>
          <div className="cards">
            {current.map((c) => {
              const state = competitionState(c, today);
              const open = openCount(c.id);
              return (
                <Link key={c.id} to={`/competitions/${c.id}`} className="card-link competition-card">
                  <span className={`chip chip-${state.tone}`}>{state.label}</span>
                  <strong>{c.name}</strong>
                  <span className="muted">{c.location} · {formatDates(c.startDate, c.endDate)}</span>
                  <span className="small">{open > 0 ? tr(`${open} division${open > 1 ? "s" : ""} ouverte${open > 1 ? "s" : ""} aux pronostics`, `${open} division${open > 1 ? "s" : ""} open for predictions`) : tr("Tirages publiés après la pesée", "Draws published after the weigh-in")}</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}
      {data && data.competitions.length === 0 && <p className="empty-state">{tr("Aucune compétition publiée pour le moment.", "No competition published yet.")}</p>}

      {past.length > 0 && (
        <section>
          <h2>{tr("Terminées", "Finished")}</h2>
          <ul className="division-list">
            {past.map((c) => (
              <li key={c.id}>
                <Link to={`/competitions/${c.id}`} className="division-row">
                  <span className="division-title">{c.name}</span>
                  <span className="muted small">{c.location} · {formatDates(c.startDate, c.endDate)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
