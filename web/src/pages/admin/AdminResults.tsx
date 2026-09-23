import { useState } from "react";
import { bracketOf, emptyPlaces, PLACES, picksFromPlaces, type Places } from "../../../../src/model.ts";
import { validatePrediction } from "../../../../src/prediction.ts";
import { BracketPicker, PicksSummary } from "../../components/BracketPicker.tsx";
import { getCompetition, getDivision, saveResultAndScore } from "../../data.ts";
import { errorMessage } from "../../format.ts";
import { Link } from "../../router.tsx";
import { useAsync } from "../../useAsync.ts";

/** Saisie du classement réel en cliquant dans l'arbre, puis calcul des points et des classements. */
export function AdminResultsPage({ cid, did }: { cid: string; did: string }) {
  const { data, error, loading, reload } = useAsync(async () => ({
    competition: await getCompetition(cid), division: await getDivision(cid, did),
  }), [cid, did]);
  const [draft, setDraft] = useState<Places | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  if (loading && !data) return <main className="page"><p className="muted">Chargement…</p></main>;
  if (error || !data?.division) return <main className="page"><p className="error">{error ?? "Division introuvable."}</p></main>;
  const { competition, division } = data;
  const bracket = bracketOf(did, division);
  const places = draft ?? division.result ?? emptyPlaces();
  const complete = validatePrediction(bracket, picksFromPlaces(places));
  const coherent = validatePrediction(bracket, picksFromPlaces(places), { requireComplete: false });
  const missing = PLACES.reduce((n, p) => n + division.expected[p] - places[p].length, 0);
  const ready = coherent.valid && places.gold.length === 1 && places.silver.length === 1;

  async function save() {
    if (!ready) return;
    if (missing > 0 && !window.confirm(`Résultat incomplet : ${missing} place(s) manquante(s) (forfait, abandon ?). Enregistrer quand même ?`)) return;
    setBusy(true);
    setMessage(null);
    try {
      const summary = await saveResultAndScore(cid, division, places);
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
      <p className="muted small">Touche chaque athlète pour saisir le classement réel : vainqueur, finaliste, les médaillés de bronze et les battus en quart.
        {division.result && " Un résultat est déjà enregistré : le modifier recalcule tous les points."}</p>
      <BracketPicker bracket={bracket} places={places} limits={division.expected} onChange={(next) => { setDraft(next); setMessage(null); }} />
      <section>
        <h2>Classement saisi</h2>
        <PicksSummary bracket={bracket} places={places} limits={division.expected} />
        {!coherent.valid && <ul className="issues">{coherent.issues.map((i) => <li key={i}>{i}</li>)}</ul>}
        {coherent.valid && !complete.valid && <p className="muted small">{missing} place(s) encore vide(s).</p>}
      </section>
      {message && <p className={message.tone} role="status">{message.text}</p>}
      <div className="savebar">
        <span className="muted small">{ready ? "Prêt à enregistrer." : "Vainqueur et finaliste obligatoires, arbre cohérent."}</span>
        <button className="primary" disabled={busy || !ready} onClick={save}>{busy ? "Calcul…" : "Enregistrer et calculer les points"}</button>
      </div>
    </main>
  );
}
