import { useState } from "react";
import { bracketOf, PLACES } from "../../../../src/model.ts";
import { readDraw } from "../../../../src/read-draw.ts";
import { matchRankings, readRankings, readWinnerMarks, type DivisionResult } from "../../../../src/result-reader.ts";
import { flagOf } from "../../../../src/flags.ts";
import { SHORT } from "../../components/PicksSummary.tsx";
import { getCompetition, listDivisions } from "../../data.ts";
import { errorMessage, formatDay } from "../../format.ts";
import { storeImportedResult } from "../../importedResults.ts";
import { Link, navigate } from "../../router.tsx";
import { useAsync } from "../../useAsync.ts";

/**
 * Import du PDF des résultats d'une journée : le tableau de classement de chaque division est lu et associé
 * à la division publiée ; l'admin vérifie ensuite chaque division dans l'arbre avant d'enregistrer.
 */
export function AdminResultsImportPage({ cid, day }: { cid: string; day: string }) {
  const { data, error, loading } = useAsync(async () => ({
    competition: await getCompetition(cid),
    divisions: (await listDivisions(cid, true)).filter((d) => d.day === day && d.status !== "draft"),
  }), [cid, day]);
  const [progress, setProgress] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [read, setRead] = useState<{ fileName: string; rankings: number; winners: number; results: Map<string, { result: DivisionResult | null; ambiguous: boolean }> } | null>(null);

  if (loading && !data) return <main className="page"><p className="muted">Chargement…</p></main>;
  if (error || !data?.competition) return <main className="page"><p className="error">{error ?? "Compétition introuvable."}</p></main>;
  const { competition, divisions } = data;

  async function onFile(file: File | undefined) {
    if (!file) return;
    setFailure(null);
    setRead(null);
    setProgress("Lecture du PDF…");
    try {
      const draw = await readDraw(file, "", "all", (page, total) => setProgress(`Lecture de la page ${page} sur ${total}…`));
      const rankings = readRankings(draw.pages);
      const marks = readWinnerMarks(draw.pages);
      const matched = matchRankings(divisions.map((d) => ({ id: d.id, bracket: bracketOf(d.id, d) })), rankings, marks);
      setRead({ fileName: file.name, rankings: rankings.length, winners: marks.length, results: new Map(matched.map((m) => [m.id, { result: m.result, ambiguous: m.ambiguous }])) });
    } catch (cause) {
      setFailure(errorMessage(cause));
    } finally {
      setProgress(null);
    }
  }

  return (
    <main className="page">
      <p className="crumbs"><Link to={`/admin/competitions/${cid}`}>{competition.name}</Link> · {formatDay(day, { weekday: "short", day: "numeric", month: "short" })}</p>
      <h1>Importer les résultats</h1>
      <p className="muted small">Choisis le PDF officiel du tirage avec résultats de cette journée. Pour chaque division, l'app lit le tableau de classement
        (« Classification », « Prize winners ») et le vainqueur de chaque combat réimprimé dans l'arbre, qui donne aussi les battus en quart.
        Rien n'est enregistré tant que tu n'as pas vérifié chaque division.</p>
      {divisions.length === 0 && <p className="notice warn">Aucune division publiée ce jour-là : importe d'abord le tirage.</p>}
      <label className="button primary file-button">
        {read ? "Choisir un autre PDF" : "Choisir le PDF des résultats"}
        <input type="file" accept="application/pdf" hidden disabled={!!progress || divisions.length === 0} onChange={(e) => void onFile(e.target.files?.[0])} />
      </label>
      {progress && <p className="muted" role="status">{progress}</p>}
      {failure && <p className="error" role="status">{failure}</p>}

      {read && (
        <section>
          <h2>{read.fileName}</h2>
          <p className="muted small">{read.rankings} tableau(x) de classement · {read.winners} vainqueur(s) de combat lu(s) · {[...read.results.values()].filter((r) => r.result).length} division(s) sur {divisions.length} associée(s).</p>
          {read.rankings === 0 && read.winners === 0 && <p className="notice warn">Ni classement ni vainqueurs de combat lisibles dans ce PDF (format sans résultats ou PDF scanné) : saisis les résultats à la main.</p>}
          <ul className="admin-divisions">
            {divisions.map((division) => {
              const entry = read.results.get(division.id);
              const result = entry?.result;
              const name = (id: string) => {
                const entrant = division.bracket.entrants.find((e) => e.athleteId === id);
                return entrant ? `${flagOf(entrant.country)} ${entrant.name}`.trim() : id;
              };
              return (
                <li key={division.id} className="admin-division">
                  <div>
                    <strong>{division.category}</strong>
                    {division.result && <span className="chip chip-done">Résultat déjà enregistré</span>}
                  </div>
                  {result ? (
                    <>
                      <ul className="read-result">
                        {PLACES.filter((p) => result.places[p].length).map((p) => (
                          <li key={p}><span className={`place place-${p}`}>{SHORT[p]}</span> {result.places[p].map((id) => `${name(id)}${result.deduced.includes(id) ? " (déduit de l'arbre)" : result.fromWinners.includes(id) ? " (lu dans les combats)" : ""}`).join(" · ")}</li>
                        ))}
                      </ul>
                      {result.issues.length > 0 && <ul className="issues">{result.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
                      {result.issues.some((i) => i.includes("incohérent")) && <p className="muted small">Un classement officiel incohérent avec l'arbre signale souvent une erreur dans le tirage publié : compare l'arbre au PDF.</p>}
                      <button className="primary small" onClick={() => {
                        storeImportedResult(cid, division.id, { places: result.places, fileName: read.fileName, deduced: result.deduced, fromWinners: result.fromWinners, issues: result.issues });
                        navigate(`/admin/competitions/${cid}/divisions/${division.id}/resultats`);
                      }}>Vérifier dans l'arbre et enregistrer</button>
                    </>
                  ) : (
                    <p className="muted small">{entry?.ambiguous ? "Plusieurs classements pourraient correspondre : rien n'est prérempli." : "Pas de classement trouvé pour cette division dans ce PDF."}{" "}
                      <Link to={`/admin/competitions/${cid}/divisions/${division.id}/resultats`}>Saisir à la main</Link></p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
