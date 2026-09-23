import { useMemo, useState } from "react";
import { buildTree } from "../../../../src/bracket-tree.ts";
import { bracketOf, emptyPlaces, PLACES, picksFromPlaces, type Places } from "../../../../src/model.ts";
import { validatePrediction } from "../../../../src/prediction.ts";
import { BracketSheet } from "../../components/BracketSheet.tsx";
import { PicksSummary } from "../../components/PicksSummary.tsx";
import { getCompetition, getDivision, listDivisions, saveResultAndScore } from "../../data.ts";
import { errorMessage } from "../../format.ts";
import { clearImportedResult, loadImportedResult } from "../../importedResults.ts";
import { Link } from "../../router.tsx";
import { useAsync } from "../../useAsync.ts";

/** Saisie du classement réel en cliquant dans l'arbre, puis calcul des points et des classements. */
export function AdminResultsPage({ cid, did }: { cid: string; did: string }) {
  const { data, error, loading, reload } = useAsync(async () => ({
    competition: await getCompetition(cid), division: await getDivision(cid, did), divisions: await listDivisions(cid, true),
  }), [cid, did]);
  const loaded = data?.division;
  const bracket = useMemo(() => (loaded ? bracketOf(did, loaded) : null), [loaded, did]);
  const tree = useMemo(() => (bracket ? buildTree(bracket) : null), [bracket]);
  // Résultat lu dans le PDF des résultats de la journée : prérempli, à vérifier avant d'enregistrer.
  const [imported] = useState(() => loadImportedResult(cid, did));
  const [draft, setDraft] = useState<Places | null>(() => imported?.places ?? null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  if (loading && !data) return <main className="page"><p className="muted">Chargement…</p></main>;
  if (error || !data?.division || !bracket || !tree) return <main className="page"><p className="error">{error ?? "Division introuvable."}</p></main>;
  const { competition, division } = data;
  const places = draft ?? division.result ?? emptyPlaces();
  const complete = validatePrediction(bracket, picksFromPlaces(places));
  const coherent = validatePrediction(bracket, picksFromPlaces(places), { requireComplete: false });
  const missing = PLACES.reduce((n, p) => n + division.expected[p] - places[p].length, 0);
  const ready = coherent.valid && places.gold.length === 1 && places.silver.length === 1;
  // Suivante à saisir : une division publiée sans résultat, du même jour d'abord.
  const pending = data.divisions.filter((d) => d.id !== did && !d.result && d.status !== "draft" && d.status !== "review");
  // Une division déjà lue dans le PDF des résultats passe en premier.
  const nextPending = pending.find((d) => loadImportedResult(cid, d.id)) ?? pending.find((d) => d.day === division.day) ?? pending[0];

  async function save() {
    if (!ready) return;
    if (missing > 0 && !window.confirm(`Résultat incomplet : ${missing} place(s) manquante(s) (forfait, abandon ?). Enregistrer quand même ?`)) return;
    setBusy(true);
    setMessage(null);
    try {
      const summary = await saveResultAndScore(cid, division, places);
      clearImportedResult(cid, did);
      setDraft(null);
      setMessage({ tone: "ok", text: `Résultat enregistré. ${summary.predictions} pronostic(s) scoré(s)${summary.invalid ? `, dont ${summary.invalid} incohérent(s) à 0 point` : ""}. Classements mis à jour.` });
      reload();
    } catch (cause) {
      setMessage({ tone: "error", text: errorMessage(cause) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page has-savebar">
      <p className="crumbs"><Link to={`/admin/competitions/${cid}`}>{competition?.name ?? "Compétition"}</Link></p>
      <h1>Résultats · {division.category}</h1>
      <p className="muted small">Touche chaque athlète classé et donne-lui sa place réelle : son chemin se dessine dans l'arbre.
        {division.result && " Un résultat est déjà enregistré : le modifier recalcule tous les points."}</p>
      {imported && !message && (
        <p className="notice">Prérempli depuis <strong>{imported.fileName}</strong> : compare avec le PDF, corrige si besoin en touchant les athlètes, puis enregistre.
          {(imported.fromWinners?.length ?? 0) > 0 && ` ${imported.fromWinners!.length} place(s) lue(s) grâce aux vainqueurs des combats.`}
          {imported.deduced.length > 0 && ` ${imported.deduced.length} battu(s) en quart déduit(s) de l'arbre.`}
          {imported.issues.length > 0 && ` Alertes : ${imported.issues.join(" ")}`}</p>
      )}
      <BracketSheet tree={tree} places={places} onChange={(next) => { setDraft(next); setMessage(null); }} />
      <section>
        <h2>Classement saisi</h2>
        <PicksSummary bracket={bracket} places={places} limits={division.expected} emptyLabel="À saisir" />
        {!coherent.valid && <ul className="issues">{coherent.issues.map((i) => <li key={i}>{i}</li>)}</ul>}
        {coherent.valid && !complete.valid && <p className="muted small">{missing} place(s) encore vide(s).</p>}
      </section>
      {message && <p className={message.tone} role="status">{message.text}</p>}
      <nav className="division-nav">
        <Link to={`/admin/competitions/${cid}`} className="button">← Journées de la compétition</Link>
        {nextPending && <Link to={`/admin/competitions/${cid}/divisions/${nextPending.id}/resultats`} className={`button ${message?.tone === "ok" ? "primary" : ""}`}>
          Résultats suivants : {nextPending.category} →</Link>}
        {!nextPending && message?.tone === "ok" && <span className="ok small">Tous les résultats sont saisis.</span>}
      </nav>
      <div className="savebar">
        <span className="muted small">{ready ? "Prêt à enregistrer." : "Vainqueur et finaliste obligatoires, arbre cohérent."}</span>
        <button className="primary" disabled={busy || !ready} onClick={save}>{busy ? "Calcul…" : "Enregistrer et calculer les points"}</button>
      </div>
    </main>
  );
}
