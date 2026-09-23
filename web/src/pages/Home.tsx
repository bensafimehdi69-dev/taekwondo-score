// Accueil façon iOS 27 : grand titre personnel, widgets (rang, pronostics à faire), liste « À faire maintenant »
// des divisions ouvertes sans pronostic, puis les compétitions en cartes. Visiteur : le jeu expliqué en trois étapes.
import type { CompetitionDoc, DivisionDoc } from "../../../src/model.ts";
import { BracketIcon, PodiumIcon } from "../components/Icons.tsx";
import { leaderboard, listCompetitions, listDivisions, myPredictions, type WithId } from "../data.ts";
import { formatCountdown, formatDates, formatDay, formatPoints } from "../format.ts";
import { Link } from "../router.tsx";
import { useSession } from "../session.tsx";
import { useAsync, useNow } from "../useAsync.ts";

type Todo = { competition: WithId<CompetitionDoc>; division: WithId<DivisionDoc> };

const DAY = 86_400_000;
const todayIso = () => new Date().toISOString().slice(0, 10);

/** État d'une compétition pour sa carte : en cours, à venir (dans n jours) ou terminée. */
function competitionState(c: CompetitionDoc, today: string): { label: string; tone: "open" | "draft" | "locked" } {
  if (c.startDate <= today && c.endDate >= today) return { label: "En cours", tone: "open" };
  if (c.startDate > today) {
    const days = Math.round((Date.parse(`${c.startDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY);
    return { label: days === 1 ? "Demain" : `Dans ${days} jours`, tone: "draft" };
  }
  return { label: "Terminée", tone: "locked" };
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
        <h1>{user && firstName ? `Bonjour, ${firstName}` : "Taekwondo Score"}</h1>
      </header>

      {!user && (
        <section className="hero">
          <h2>Pronostique les tirages officiels de taekwondo</h2>
          <p>Sans argent, pour le plaisir et le classement, entre pratiquants.</p>
          <ol className="steps">
            <li><span className="step-number">1</span><span><strong>Choisis une compétition</strong> dès que le tirage est publié, après la pesée.</span></li>
            <li><span className="step-number">2</span><span><strong>Touche les athlètes</strong> pour donner ton podium et tes quarts : leur chemin se dessine dans l'arbre.</span></li>
            <li><span className="step-number">3</span><span><strong>Gagne des points</strong> à chaque résultat et grimpe au classement.</span></li>
          </ol>
          <Link to="/connexion" className="button primary">Créer un compte</Link>
        </section>
      )}

      {user && data && (
        <div className="widgets">
          <Link to="/classement" className="widget">
            <span className="widget-icon tone-gold"><PodiumIcon /></span>
            <span className="widget-value">{data.me ? `${data.me.rank}${data.me.rank === 1 ? "er" : "e"}` : "—"}</span>
            <span className="widget-label">{data.me ? `${formatPoints(data.me.points)} pts · ${data.players} joueurs` : "Pas encore de points"}</span>
          </Link>
          <a href="#a-faire" className="widget">
            <span className="widget-icon tone-accent"><BracketIcon /></span>
            <span className="widget-value">{todos.length}</span>
            <span className="widget-label">{todos.length === 0 ? "Tout est à jour" : todos.length === 1 ? "pronostic à faire" : "pronostics à faire"}</span>
          </a>
        </div>
      )}

      {loading && !data && <div className="skeleton" aria-label="Chargement" />}
      {error && <p className="error">{error}</p>}

      {user && data && (
        <section id="a-faire">
          <h2>À faire maintenant</h2>
          {todos.length === 0 ? (
            <p className="empty-state">{current.length === 0 ? "Aucune compétition en cours : les prochains tirages apparaîtront ici après la pesée."
              : "Tous tes pronostics sont faits. Tu peux encore les modifier jusqu'au verrouillage."}</p>
          ) : (
            <ul className="division-list">
              {todos.map(({ competition, division }) => {
                const left = division.lockAt.getTime() - now;
                return (
                  <li key={`${competition.id}/${division.id}`}>
                    <Link to={`/competitions/${competition.id}/divisions/${division.id}`} className="division-row">
                      <span className="division-title">{division.category}</span>
                      <span className="muted small">{competition.name} · {division.bracket.entrants.length} athlètes</span>
                      <span className="division-badges"><span className={`chip ${left < 3 * 3_600_000 ? "chip-urgent" : "chip-todo"}`}>Verrouillage {formatCountdown(left)}</span></span>
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
          <h2>Compétitions</h2>
          <div className="cards">
            {current.map((c) => {
              const state = competitionState(c, today);
              const open = openCount(c.id);
              return (
                <Link key={c.id} to={`/competitions/${c.id}`} className="card-link competition-card">
                  <span className={`chip chip-${state.tone}`}>{state.label}</span>
                  <strong>{c.name}</strong>
                  <span className="muted">{c.location} · {formatDates(c.startDate, c.endDate)}</span>
                  <span className="small">{open > 0 ? `${open} division${open > 1 ? "s" : ""} ouverte${open > 1 ? "s" : ""} aux pronostics` : "Tirages publiés après la pesée"}</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}
      {data && data.competitions.length === 0 && <p className="empty-state">Aucune compétition publiée pour le moment.</p>}

      {past.length > 0 && (
        <section>
          <h2>Terminées</h2>
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
