import { useState } from "react";
import { bracketOf, PLACES } from "../../../../src/model.ts";
import { readDraw } from "../../../../src/read-draw.ts";
import { matchRankings, readRankings, readWinnerMarks, type DivisionResult } from "../../../../src/result-reader.ts";
import { flagOf } from "../../../../src/flags.ts";
import { getCompetition, listDivisions } from "../../data.ts";
import { errorMessage, formatDay } from "../../format.ts";
import { placeShort, tr } from "../../i18n.tsx";
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

  if (loading && !data) return <main className="page"><p className="muted">{tr("Chargement…", "Loading…")}</p></main>;
  if (error || !data?.competition) return <main className="page"><p className="error">{error ?? tr("Compétition introuvable.", "Competition not found.")}</p></main>;
  const { competition, divisions } = data;

  async function onFile(file: File | undefined) {
    if (!file) return;
    setFailure(null);
    setRead(null);
    setProgress(tr("Lecture du PDF…", "Reading the PDF…"));
    try {
      const draw = await readDraw(file, "", "all", (page, total) => setProgress(tr(`Lecture de la page ${page} sur ${total}…`, `Reading page ${page} of ${total}…`)));
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
      <h1>{tr("Importer les résultats", "Import results")}</h1>
      <p className="muted small">{tr("Choisis le PDF officiel du tirage avec résultats de cette journée. Pour chaque division, l'app lit le tableau de classement (« Classification », « Prize winners ») et le vainqueur de chaque combat réimprimé dans l'arbre, qui donne aussi les battus en quart. Rien n'est enregistré tant que tu n'as pas vérifié chaque division.",
        "Choose the official draw PDF with this day's results. For each division, the app reads the ranking table (“Classification”, “Prize winners”) and the winner of each bout reprinted in the bracket, which also gives the quarterfinal losers. Nothing is saved until you have checked each division.")}</p>
      {divisions.length === 0 && <p className="notice warn">{tr("Aucune division publiée ce jour-là : importe d'abord le tirage.", "No division published for this day: import the draw first.")}</p>}
      <label className="button primary file-button">
        {read ? tr("Choisir un autre PDF", "Choose another PDF") : tr("Choisir le PDF des résultats", "Choose the results PDF")}
        <input type="file" accept="application/pdf" hidden disabled={!!progress || divisions.length === 0} onChange={(e) => void onFile(e.target.files?.[0])} />
      </label>
      {progress && <p className="muted" role="status">{progress}</p>}
      {failure && <p className="error" role="status">{failure}</p>}

      {read && (
        <section>
          <h2>{read.fileName}</h2>
          <p className="muted small">{(() => {
            const matched = [...read.results.values()].filter((r) => r.result).length;
            return tr(`${read.rankings} tableau(x) de classement · ${read.winners} vainqueur(s) de combat lu(s) · ${matched} division(s) sur ${divisions.length} associée(s).`,
              `${read.rankings} ranking table${read.rankings === 1 ? "" : "s"} · ${read.winners} bout winner${read.winners === 1 ? "" : "s"} read · ${matched} of ${divisions.length} division${divisions.length === 1 ? "" : "s"} matched.`);
          })()}</p>
          {read.rankings === 0 && read.winners === 0 && <p className="notice warn">{tr("Ni classement ni vainqueurs de combat lisibles dans ce PDF (format sans résultats ou PDF scanné) : saisis les résultats à la main.", "No readable ranking or bout winners in this PDF (format without results, or scanned PDF): enter the results by hand.")}</p>}
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
                    {division.result && <span className="chip chip-done">{tr("Résultat déjà enregistré", "Result already saved")}</span>}
                  </div>
                  {result ? (
                    <>
                      <ul className="read-result">
                        {PLACES.filter((p) => result.places[p].length).map((p) => (
                          <li key={p}><span className={`place place-${p}`}>{placeShort(p)}</span> {result.places[p].map((id) => `${name(id)}${result.deduced.includes(id) ? ` (${tr("déduit de l'arbre", "deduced from the bracket")})` : result.fromWinners.includes(id) ? ` (${tr("lu dans les combats", "read from the bouts")})` : ""}`).join(" · ")}</li>
                        ))}
                      </ul>
                      {result.issues.length > 0 && <ul className="issues">{result.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
                      {result.issues.some((i) => i.includes("incohérent")) && <p className="muted small">{tr("Un classement officiel incohérent avec l'arbre signale souvent une erreur dans le tirage publié : compare l'arbre au PDF.", "An official ranking inconsistent with the bracket often points to an error in the published draw: compare the bracket with the PDF.")}</p>}
                      <button className="primary small" onClick={() => {
                        storeImportedResult(cid, division.id, { places: result.places, fileName: read.fileName, deduced: result.deduced, fromWinners: result.fromWinners, issues: result.issues });
                        navigate(`/admin/competitions/${cid}/divisions/${division.id}/resultats`);
                      }}>{tr("Vérifier dans l'arbre et enregistrer", "Check in the bracket and save")}</button>
                    </>
                  ) : (
                    <p className="muted small">{entry?.ambiguous ? tr("Plusieurs classements pourraient correspondre : rien n'est prérempli.", "Several rankings could match: nothing is prefilled.") : tr("Pas de classement trouvé pour cette division dans ce PDF.", "No ranking found for this division in this PDF.")}{" "}
                      <Link to={`/admin/competitions/${cid}/divisions/${division.id}/resultats`}>{tr("Saisir à la main", "Enter by hand")}</Link></p>
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
