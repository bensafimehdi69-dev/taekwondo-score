import { listCompetitions, saveCompetition } from "../../data.ts";
import { formatDates } from "../../format.ts";
import { Link, navigate } from "../../router.tsx";
import { useAsync } from "../../useAsync.ts";
import { blankCompetition, CompetitionForm } from "./CompetitionForm.tsx";

export function AdminHomePage() {
  const { data, error, loading } = useAsync(() => listCompetitions(true), []);
  return (
    <main className="page">
      <h1>Administration</h1>
      <h2>Compétitions</h2>
      {loading && <p className="muted">Chargement…</p>}
      {error && <p className="error">{error}</p>}
      <div className="cards">
        {data?.map((c) => (
          <Link key={c.id} to={`/admin/competitions/${c.id}`} className="card-link">
            <strong>{c.name}</strong>
            <span className="muted">{c.location} · {formatDates(c.startDate, c.endDate)}</span>
            <span className={`chip ${c.published ? "chip-open" : "chip-draft"}`}>{c.published ? "Publiée" : "Non publiée"}</span>
          </Link>
        ))}
      </div>
      <details className="panel">
        <summary>Nouvelle compétition</summary>
        <CompetitionForm initial={blankCompetition()} submitLabel="Créer la compétition"
          onSubmit={async (competition) => navigate(`/admin/competitions/${await saveCompetition(null, competition)}`)} />
      </details>
    </main>
  );
}
