import { listCompetitions, saveCompetition } from "../../data.ts";
import { formatDates } from "../../format.ts";
import { tr } from "../../i18n.tsx";
import { Link, navigate } from "../../router.tsx";
import { useAsync } from "../../useAsync.ts";
import { blankCompetition, CompetitionForm } from "./CompetitionForm.tsx";
import { DeleteCompetitionButton } from "./DeleteCompetition.tsx";

export function AdminHomePage() {
  const { data, error, loading, reload } = useAsync(() => listCompetitions(true), []);
  return (
    <main className="page">
      <header className="home-header">
        <p className="eyebrow">{tr("Espace admin", "Admin area")}</p>
        <h1>{tr("Administration", "Admin")}</h1>
      </header>
      <h2>{tr("Compétitions", "Competitions")}</h2>
      {loading && <p className="muted">{tr("Chargement…", "Loading…")}</p>}
      {error && <p className="error">{error}</p>}
      {data?.length === 0 && <p className="muted">{tr("Aucune compétition : crée la première ci-dessous.", "No competitions yet: create the first one below.")}</p>}
      <ul className="admin-competitions">
        {data?.map((c) => (
          <li key={c.id} className="admin-competition">
            <Link to={`/admin/competitions/${c.id}`}>
              <strong>{c.name}</strong>
              <span className="muted small">{c.location} · {formatDates(c.startDate, c.endDate)}</span>
              <span className={`chip ${c.published ? "chip-open" : "chip-draft"}`}>{c.published ? tr("Publiée", "Published") : tr("Non publiée", "Not published")}</span>
            </Link>
            <DeleteCompetitionButton competition={c} small onDeleted={reload} />
          </li>
        ))}
      </ul>
      <details className="panel new-item">
        <summary>＋ {tr("Nouvelle compétition", "New competition")}</summary>
        <CompetitionForm initial={blankCompetition()} submitLabel={tr("Créer la compétition", "Create competition")}
          onSubmit={async (competition) => navigate(`/admin/competitions/${await saveCompetition(null, competition)}`)} />
      </details>
    </main>
  );
}
