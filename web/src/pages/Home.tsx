import { listCompetitions } from "../data.ts";
import { formatDates } from "../format.ts";
import { Link } from "../router.tsx";
import { useSession } from "../session.tsx";
import { useAsync } from "../useAsync.ts";

export function HomePage() {
  const { user } = useSession();
  const { data, error, loading } = useAsync(() => listCompetitions(false), []);
  const today = new Date().toISOString().slice(0, 10);
  const current = (data ?? []).filter((c) => c.endDate >= today);
  const past = (data ?? []).filter((c) => c.endDate < today);

  return (
    <main className="page">
      <section className="hero">
        <h1>Pronostique les tirages officiels de taekwondo</h1>
        <p>Choisis ton podium et tes quarts de finalistes, directement dans l'arbre. Sans argent, pour le plaisir et le classement.</p>
        {!user && <Link to="/connexion" className="button primary">Créer un compte</Link>}
      </section>
      {loading && <p className="muted">Chargement des compétitions…</p>}
      {error && <p className="error">{error}</p>}
      {data && data.length === 0 && <p className="muted">Aucune compétition publiée pour le moment.</p>}
      {current.length > 0 && <h2>À venir et en cours</h2>}
      <div className="cards">
        {current.map((c) => (
          <Link key={c.id} to={`/competitions/${c.id}`} className="card-link">
            <strong>{c.name}</strong>
            <span className="muted">{c.location} · {formatDates(c.startDate, c.endDate)}</span>
          </Link>
        ))}
      </div>
      {past.length > 0 && <h2>Terminées</h2>}
      <div className="cards">
        {past.map((c) => (
          <Link key={c.id} to={`/competitions/${c.id}`} className="card-link is-past">
            <strong>{c.name}</strong>
            <span className="muted">{c.location} · {formatDates(c.startDate, c.endDate)}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
