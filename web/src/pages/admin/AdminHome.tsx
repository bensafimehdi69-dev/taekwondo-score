import { listCompetitions, saveCompetition } from "../../data.ts";
import { formatDates } from "../../format.ts";
import { Link, navigate } from "../../router.tsx";
import { useAsync } from "../../useAsync.ts";
import { blankCompetition, CompetitionForm } from "./CompetitionForm.tsx";
import { DeleteCompetitionButton } from "./DeleteCompetition.tsx";

export function AdminHomePage() {
  const { data, error, loading, reload } = useAsync(() => listCompetitions(true), []);
  return (
    <main className="page">
      <header className="home-header">
        <p className="eyebrow">Espace admin</p>
        <h1>Administration</h1>
      </header>
      <h2>Compétitions</h2>
      {loading && <p className="muted">Chargement…</p>}
      {error && <p className="error">{error}</p>}
      {data?.length === 0 && <p className="muted">Aucune compétition : crée la première ci-dessous.</p>}
      <ul className="admin-competitions">
        {data?.map((c) => (
          <li key={c.id} className="admin-competition">
            <Link to={`/admin/competitions/${c.id}`}>
              <strong>{c.name}</strong>
              <span className="muted small">{c.location} · {formatDates(c.startDate, c.endDate)}</span>
              <span className={`chip ${c.published ? "chip-open" : "chip-draft"}`}>{c.published ? "Publiée" : "Non publiée"}</span>
            </Link>
            <DeleteCompetitionButton competition={c} small onDeleted={reload} />
          </li>
        ))}
      </ul>
      <details className="panel new-item">
        <summary>＋ Nouvelle compétition</summary>
        <CompetitionForm initial={blankCompetition()} submitLabel="Créer la compétition"
          onSubmit={async (competition) => navigate(`/admin/competitions/${await saveCompetition(null, competition)}`)} />
      </details>
    </main>
  );
}
