import { useMemo, useState } from "react";
import { buildTree, sanitizePlaces } from "../../../src/bracket-tree.ts";
import { bracketOf, emptyPlaces, PLACE_LABELS, PLACES, picksFromPlaces, resultFromPlaces, type Places } from "../../../src/model.ts";
import { scorePrediction, validatePrediction } from "../../../src/prediction.ts";
import { BracketSheet } from "../components/BracketSheet.tsx";
import { PicksSummary } from "../components/PicksSummary.tsx";
import { getCompetition, getDivision, getPrediction, savePrediction } from "../data.ts";
import { errorMessage, formatCountdown, formatDay, formatLocalTime, formatPoints } from "../format.ts";
import { Link, usePath } from "../router.tsx";
import { useSession } from "../session.tsx";
import { useAsync, useNow } from "../useAsync.ts";

const samePlaces = (a: Places, b: Places) => PLACES.every((p) => [...a[p]].sort().join() === [...b[p]].sort().join());

export function DivisionPage({ cid, did }: { cid: string; did: string }) {
  const { user } = useSession();
  const path = usePath();
  const now = useNow(10_000);
  const [draft, setDraft] = useState<Places | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const { data, error, loading, reload } = useAsync(async () => {
    const [competition, division] = await Promise.all([getCompetition(cid), getDivision(cid, did)]);
    const prediction = user && division ? await getPrediction(cid, did, user.uid) : null;
    return { competition, division, prediction };
  }, [cid, did, user?.uid]);
  const loaded = data?.division;
  const bracket = useMemo(() => (loaded ? bracketOf(did, loaded) : null), [loaded, did]);
  const tree = useMemo(() => (bracket ? buildTree(bracket) : null), [bracket]);

  if (loading && !data) return <main className="page"><p className="muted">Chargement…</p></main>;
  if (error || !data?.division || !data.competition || !bracket || !tree) {
    return <main className="page"><h1>Division indisponible</h1><p className="muted">{error ?? "Ce tirage n'est pas encore publié."}</p><Link to={`/competitions/${cid}`}>Retour à la compétition</Link></main>;
  }
  const { competition, prediction } = data;
  const current = data.division;
  const limits = current.expected;
  // Places enregistrées, nettoyées si le tirage a été corrigé depuis ; l'arbre se dessine à partir d'elles.
  const saved = prediction ? sanitizePlaces(tree, prediction.picks) : emptyPlaces();
  const places = draft ?? saved;
  const division = current;
  const locked = now >= division.lockAt.getTime();
  const hasResults = division.status === "results" || division.status === "closed";
  const editable = !!user && division.status === "open" && !locked;
  const check = validatePrediction(bracket, picksFromPlaces(places), { requireComplete: false });
  const chosen = PLACES.reduce((n, p) => n + places[p].length, 0);
  const total = PLACES.reduce((n, p) => n + limits[p], 0);
  const dirty = draft !== null && !samePlaces(draft, saved);
  const stale = !!prediction && prediction.bracketVersion !== division.version;
  const outcome = division.result ? resultFromPlaces(division.result) : undefined;
  const lines = outcome && prediction ? scorePrediction(bracket, picksFromPlaces(prediction.picks), outcome).lines : [];
  const nameOf = (id: string) => bracket.entrants.find((e) => e.athleteId === id)?.name ?? "—";

  async function save() {
    if (!user || !check.valid) return;
    setBusy(true);
    setMessage(null);
    try {
      await savePrediction(cid, did, user.uid, places, division.version);
      setDraft(null);
      setMessage({ tone: "ok", text: "Pronostic enregistré. Tu peux le modifier jusqu'au verrouillage." });
      reload();
    } catch (cause) {
      setMessage({ tone: "error", text: errorMessage(cause) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={`page ${editable ? "has-savebar" : ""}`}>
      <p className="crumbs"><Link to={`/competitions/${cid}`}>{competition.name}</Link> · {formatDay(division.day, { weekday: "short", day: "numeric", month: "short" })}</p>
      <h1>{division.category}</h1>
      <p className="lock-line">
        {hasResults ? "Résultats saisis : voici tes points."
          : division.status !== "open" ? "Ce tirage n'est pas encore ouvert aux pronostics."
          : locked ? `Verrouillée depuis ${formatLocalTime(division.lockAt, competition.timezone)} : les pronostics sont figés.`
          : `Pronostics ouverts jusqu'à ${formatLocalTime(division.lockAt, competition.timezone)} · ${formatCountdown(division.lockAt.getTime() - now)}`}
      </p>

      {!user && division.status === "open" && !locked && (
        <p className="notice"><Link to={`/connexion?retour=${encodeURIComponent(path)}`}>Connecte-toi</Link> pour pronostiquer cette division.</p>
      )}
      {stale && !hasResults && (
        <p className="notice warn">Le tirage a été corrigé depuis ton pronostic. Vérifie tes choix{editable ? " et enregistre à nouveau" : ""}.</p>
      )}
      {editable && <p className="muted small">Touche un athlète et choisis sa place : 1er, 2e, 3e ou battu en quart. Son chemin se dessine tout seul dans l'arbre. Zoome avec deux doigts ou les boutons.</p>}

      {hasResults && prediction?.score && (
        <div className="score-card">
          <strong>{formatPoints(prediction.score.total)} points</strong>
          <span className="muted">{prediction.score.exactGolds ? "Vainqueur trouvé !" : "Vainqueur manqué"}</span>
        </div>
      )}

      {division.result && <p className="muted small">Vert : juste · rouge : manqué.</p>}
      <BracketSheet tree={tree} places={places} result={division.result}
        onChange={editable ? (next) => { setDraft(next); setMessage(null); } : undefined} />

      {(user || hasResults) && (
        <section>
          <h2>{hasResults ? "Ton pronostic" : "Récapitulatif"}</h2>
          <PicksSummary bracket={bracket} places={places} limits={limits} />
          {!check.valid && <ul className="issues">{check.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
        </section>
      )}

      {lines.length > 0 && (
        <section>
          <h2>Détail des points</h2>
          <table className="points-table">
            <thead><tr><th>Athlète</th><th>Ton choix</th><th>Réel</th><th>Points</th></tr></thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.athleteId}>
                  <td>{nameOf(line.athleteId)}</td>
                  <td>{PLACE_LABELS[line.place]}</td>
                  <td>{line.actual ? PLACE_LABELS[line.actual] : "—"}</td>
                  <td>{formatPoints(line.points)}{line.bonus > 0 && <small className="muted"> dont {formatPoints(line.bonus)} de bonus</small>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {editable && (
        <div className="savebar">
          <span className="muted small">{message?.text ?? `${chosen} choix sur ${total}${chosen < total ? " : un pronostic incomplet compte quand même" : ""}`}</span>
          <button className="primary" disabled={busy || !check.valid || (!dirty && !stale)} onClick={save}>
            {busy ? "Enregistrement…" : prediction && !dirty && !stale ? "Enregistré" : "Enregistrer"}
          </button>
        </div>
      )}
      {!editable && message && <p className={message.tone}>{message.text}</p>}
    </main>
  );
}
