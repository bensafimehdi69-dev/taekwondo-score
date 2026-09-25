import { useState } from "react";
import { PdfPreview } from "../../control/PdfPreview.tsx";
import { bracketOf, PLACES } from "../../../../src/model.ts";
import { readDraw } from "../../../../src/read-draw.ts";
import { matchRankings, readRankings, readWinnerMarks, type DivisionResult, type ResultReason } from "../../../../src/result-reader.ts";
import { flagOf } from "../../../../src/flags.ts";
import { getCompetition, listDivisions, saveResultAndScore } from "../../data.ts";
import { adminError, errorMessage, formatDay } from "../../format.ts";
import { placeShort, tr } from "../../i18n.tsx";
import { rememberResultsPdf, storeImportedResult } from "../../importedResults.ts";
import { Link, navigate } from "../../router.tsx";
import { useAsync } from "../../useAsync.ts";

/** Raison pour laquelle un résultat n'est pas vérifié automatiquement, dans la langue de l'interface. */
export const reasonText = (reason: ResultReason | string) => ({
  "no-ranking": tr("pas de tableau de classement : seule la lecture des combats est disponible", "no ranking table: only the bout reading is available"),
  "unmatched-names": tr("un nom du classement ne correspond à aucun athlète de la division", "a name in the ranking matches no athlete of the division"),
  "podium-incomplete": tr("le classement ne donne pas tout le podium", "the ranking does not give the whole podium"),
  "podium-not-confirmed": tr("les vainqueurs des combats ne confirment pas les finalistes et les 3es du classement", "the bout winners do not confirm the ranking's finalists and 3rd places"),
  "quarters-missing": tr("des battus en quart restent à trouver", "some quarterfinal losers are still missing"),
  "inconsistent": tr("une place lue contredit l'arbre publié", "a place read contradicts the published bracket"),
} as Record<string, string>)[reason] ?? reason;

/**
 * Import du PDF des résultats d'une journée : le tableau de classement de chaque division est lu et associé
 * à la division publiée ; l'admin vérifie ensuite chaque division dans l'arbre avant d'enregistrer.
 */
export function AdminResultsImportPage({ cid, day }: { cid: string; day: string }) {
  const { data, error, loading, reload } = useAsync(async () => ({
    competition: await getCompetition(cid),
    divisions: (await listDivisions(cid, true)).filter((d) => d.day === day && d.status !== "draft"),
  }), [cid, day]);
  const [progress, setProgress] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pdfFor, setPdfFor] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [read, setRead] = useState<{ fileName: string; rankings: number; winners: number; results: Map<string, { result: DivisionResult | null; ambiguous: boolean }> } | null>(null);

  if (loading && !data) return <main className="page"><p className="muted">{tr("Chargement…", "Loading…")}</p></main>;
  if (error || !data?.competition) return <main className="page"><p className="error">{error ?? tr("Compétition introuvable.", "Competition not found.")}</p></main>;
  const { competition, divisions } = data;

  async function onFile(file: File | undefined) {
    if (!file) return;
    setFailure(null);
    setSaved(null);
    setRead(null);
    setFile(file);
    rememberResultsPdf(file);
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

  // Résultats vérifiés automatiquement, pas encore enregistrés : enregistrables d'un coup.
  const ready = read ? divisions.filter((d) => !d.result && read.results.get(d.id)?.result?.verified) : [];

  async function saveVerified() {
    if (!read || !ready.length) return;
    if (!window.confirm(tr(`Enregistrer les résultats de ${ready.length} division(s) vérifiée(s) automatiquement et calculer les points ?`,
      `Save the results of ${ready.length} automatically verified division${ready.length === 1 ? "" : "s"} and calculate the points?`))) return;
    setSaved(null);
    let done = 0;
    try {
      for (const division of ready) {
        setSaving(tr(`Enregistrement ${done + 1} / ${ready.length} : ${division.category}…`, `Saving ${done + 1} / ${ready.length}: ${division.category}…`));
        await saveResultAndScore(cid, division, read.results.get(division.id)!.result!.places);
        done += 1;
      }
      setSaved({ tone: "ok", text: tr(`${done} résultat(s) enregistré(s), points et classements calculés.`, `${done} result${done === 1 ? "" : "s"} saved, points and leaderboards calculated.`) });
    } catch (cause) {
      setSaved({ tone: "error", text: tr(`${done} enregistré(s), puis erreur : ${adminError(cause)}`, `${done} saved, then an error: ${adminError(cause)}`) });
    } finally {
      setSaving(null);
      reload();
    }
  }

  return (
    <main className="page">
      <p className="crumbs"><Link to={`/admin/competitions/${cid}`}>{competition.name}</Link> · {formatDay(day, { weekday: "short", day: "numeric", month: "short" })}</p>
      <h1>{tr("Importer les résultats", "Import results")}</h1>
      <p className="muted small">{tr("Choisis le PDF officiel du tirage avec résultats de cette journée. Pour chaque division, l'app lit le tableau de classement (« Classification », « Prize winners ») et le vainqueur de chaque combat réimprimé dans l'arbre, qui donne aussi les battus en quart. Les divisions où ces deux lectures concordent sont vérifiées automatiquement et s'enregistrent d'un coup ; les autres se vérifient dans l'arbre, avec la page du PDF.",
        "Choose the official draw PDF with this day's results. For each division, the app reads the ranking table (“Classification”, “Prize winners”) and the winner of each bout reprinted in the bracket, which also gives the quarterfinal losers. Divisions where both readings agree are verified automatically and can be saved in one go; the others are checked in the bracket, next to the PDF page.")}</p>
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
          {ready.length > 0 && (
            <div className="status-card tone-open">
              <span className="chip chip-open">{tr("Vérification automatique", "Automatic check")}</span>
              <span className="status-value">{ready.length} / {divisions.filter((d) => !d.result).length}</span>
              <span className="status-label">{tr("division(s) vérifiée(s) : le classement officiel et les vainqueurs des combats concordent, tous les battus en quart sont trouvés.",
                "division(s) verified: the official ranking and the bout winners agree, and all quarterfinal losers are found.")}</span>
              <button className="primary" disabled={!!saving} onClick={() => void saveVerified()}>
                {saving ?? tr(`Enregistrer les ${ready.length} résultat(s) vérifié(s)`, `Save the ${ready.length} verified result${ready.length === 1 ? "" : "s"}`)}</button>
            </div>
          )}
          {saved && <p className={saved.tone === "ok" ? "notice success" : "error"} role="status">{saved.text}</p>}
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
                    {result && (result.verified
                      ? <span className="chip chip-open">✓ {tr("Vérifié automatiquement", "Automatically verified")}</span>
                      : <span className="chip chip-review">{tr("À vérifier", "To check")}</span>)}
                  </div>
                  {result && !result.verified && (
                    <ul className="reasons muted small">{result.reasons.map((r) => <li key={r}>{reasonText(r)}</li>)}</ul>
                  )}
                  {result ? (
                    <>
                      <ul className="read-result">
                        {PLACES.filter((p) => result.places[p].length).map((p) => (
                          <li key={p}><span className={`place place-${p}`}>{placeShort(p)}</span> {result.places[p].map((id) => `${name(id)}${result.deduced.includes(id) ? ` (${tr("déduit de l'arbre", "deduced from the bracket")})` : result.fromWinners.includes(id) ? ` (${tr("lu dans les combats", "read from the bouts")})` : ""}`).join(" · ")}</li>
                        ))}
                      </ul>
                      {result.issues.length > 0 && <ul className="issues">{result.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
                      {result.issues.some((i) => i.includes("incohérent")) && <p className="muted small">{tr("Un classement officiel incohérent avec l'arbre signale souvent une erreur dans le tirage publié : compare l'arbre au PDF.", "An official ranking inconsistent with the bracket often points to an error in the published draw: compare the bracket with the PDF.")}</p>}
                      <p className="actions">
                        <button className={`small ${result.verified ? "" : "primary"}`} onClick={() => {
                          storeImportedResult(cid, division.id, { places: result.places, fileName: read.fileName, deduced: result.deduced, fromWinners: result.fromWinners,
                            issues: result.issues, verified: result.verified, reasons: result.reasons, pages: result.pages });
                          navigate(`/admin/competitions/${cid}/divisions/${division.id}/resultats`);
                        }}>{result.verified ? tr("Voir dans l'arbre", "View in the bracket") : tr("Vérifier dans l'arbre et enregistrer", "Check in the bracket and save")}</button>
                        {file && result.pages.length > 0 && <button className="small" onClick={() => setPdfFor(pdfFor === division.id ? null : division.id)}>
                          {pdfFor === division.id ? tr("Masquer le PDF", "Hide the PDF") : tr("Voir la page du PDF", "View the PDF page")}</button>}
                      </p>
                      {file && pdfFor === division.id && <div className="pdf-inline"><PdfPreview file={file} pages={result.pages} /></div>}
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
