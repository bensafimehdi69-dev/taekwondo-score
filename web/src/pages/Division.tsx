import { useMemo, useState } from "react";
import { buildTree, sanitizePlaces } from "../../../src/bracket-tree.ts";
import { bracketOf, emptyPlaces, PLACES, picksFromPlaces, resultFromPlaces, type DivisionDoc, type PredictionDoc, type Places } from "../../../src/model.ts";
import { scorePrediction, validatePrediction } from "../../../src/prediction.ts";
import { flagOf } from "../../../src/flags.ts";
import { BracketSheet } from "../components/BracketSheet.tsx";
import { PicksSummary } from "../components/PicksSummary.tsx";
import { getCompetition, getDivision, getPrediction, listDivisions, myPredictions, savePrediction, type WithId } from "../data.ts";
import { errorMessage, formatDay, formatLocalTime, formatPoints } from "../format.ts";
import { placeLabel, tr, translateIssue } from "../i18n.tsx";
import { Link, usePath } from "../router.tsx";
import { useSession } from "../session.tsx";
import { useAsync, useNow } from "../useAsync.ts";

const samePlaces = (a: Places, b: Places) => PLACES.every((p) => [...a[p]].sort().join() === [...b[p]].sort().join());

const TIP_KEY = "tkd:astuce-division-vue";
const tipSeen = () => { try { return localStorage.getItem(TIP_KEY) === "1"; } catch { return false; } };

/** Temps restant en gros chiffres : « 2 h 15 min », « 45 min », « 3 j » (« 3 d » en anglais). */
function bigCountdown(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ${String(minutes % 60).padStart(2, "0")}`;
  return tr(`${Math.floor(hours / 24)} j`, `${Math.floor(hours / 24)} d`);
}

/** Division suivante dans l'ordre de la compétition : d'abord une encore ouverte et sans pronostic, sinon la suivante tout court. */
function nextDivision(divisions: WithId<DivisionDoc>[], mine: Map<string, PredictionDoc>, did: string, now: number) {
  const index = divisions.findIndex((d) => d.id === did);
  const after = [...divisions.slice(index + 1), ...divisions.slice(0, Math.max(0, index))];
  const todo = after.find((d) => d.status === "open" && d.lockAt.getTime() > now && !mine.has(d.id));
  return todo ? { division: todo, todo: true } : divisions[index + 1] ? { division: divisions[index + 1], todo: false } : null;
}

export function DivisionPage({ cid, did }: { cid: string; did: string }) {
  const { user } = useSession();
  const path = usePath();
  const now = useNow(10_000);
  const [draft, setDraft] = useState<Places | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [tipHidden, setTipHidden] = useState(tipSeen);
  const { data, error, loading, reload } = useAsync(async () => {
    const [competition, division, divisions] = await Promise.all([getCompetition(cid), getDivision(cid, did), listDivisions(cid, false)]);
    const prediction = user && division ? await getPrediction(cid, did, user.uid) : null;
    const mine = user ? await myPredictions(cid, divisions.filter((d) => d.id !== did).map((d) => d.id), user.uid) : new Map<string, PredictionDoc>();
    return { competition, division, prediction, divisions, mine };
  }, [cid, did, user?.uid]);
  const loaded = data?.division;
  const bracket = useMemo(() => (loaded ? bracketOf(did, loaded) : null), [loaded, did]);
  const tree = useMemo(() => (bracket ? buildTree(bracket) : null), [bracket]);

  if (loading && !data) return <main className="page"><p className="muted">{tr("Chargement…", "Loading…")}</p></main>;
  if (error || !data?.division || !data.competition || !bracket || !tree) {
    return <main className="page"><h1>{tr("Division indisponible", "Division unavailable")}</h1><p className="muted">{error ?? tr("Ce tirage n'est pas encore publié.", "This draw is not published yet.")}</p><Link to={`/competitions/${cid}`}>{tr("Retour à la compétition", "Back to the competition")}</Link></main>;
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
  const next = nextDivision(data.divisions, data.mine, did, now);
  const officialOnly = hasResults && !!division.result && !prediction;

  async function save() {
    if (!user || !check.valid) return;
    setBusy(true);
    setMessage(null);
    try {
      await savePrediction(cid, did, user.uid, places, division.version);
      setDraft(null);
      setJustSaved(true);
      setMessage({ tone: "ok", text: tr("Pronostic enregistré. Tu peux le modifier jusqu'au verrouillage.", "Prediction saved. You can change it until the lock.") });
      reload();
    } catch (cause) {
      setMessage({ tone: "error", text: errorMessage(cause) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={`page ${editable ? "has-savebar" : ""}`}>
      <p className="crumbs"><Link to={`/competitions/${cid}`}>{competition.name}</Link></p>
      <header className="home-header">
        <p className="eyebrow">{formatDay(division.day, { weekday: "long", day: "numeric", month: "long" })} · {tr(`${bracket.entrants.length} athlètes`, `${bracket.entrants.length} athlete${bracket.entrants.length === 1 ? "" : "s"}`)}</p>
        <h1>{division.category}</h1>
      </header>

      {/* Carte d'état : temps restant et places choisies, ou points une fois les résultats saisis. */}
      {hasResults ? (
        <section className="status-card tone-results">
          <span className="chip chip-results">{tr("Résultats", "Results")}</span>
          <span className="status-value">{prediction?.score ? `${formatPoints(prediction.score.total)} pts` : prediction ? "…" : tr("Pas joué", "Not played")}</span>
          <span className="status-label">{!prediction ? tr("Tu n'avais pas pronostiqué cette division.", "You did not predict this division.")
            : prediction.score ? (prediction.score.exactGolds ? tr("Vainqueur trouvé !", "Winner found!") : tr("Vainqueur manqué", "Winner missed")) : tr("Points en cours de calcul.", "Points being calculated.")}</span>
        </section>
      ) : (
        <section className={`status-card ${division.status === "open" && !locked ? "tone-open" : ""}`}>
          <span className={`chip ${division.status !== "open" ? "chip-draft" : locked ? "chip-locked" : "chip-open"}`}>
            {division.status !== "open" ? tr("Bientôt", "Soon") : locked ? tr("Verrouillée", "Locked") : tr("Ouverte", "Open")}</span>
          <span className="status-value">{division.status !== "open" ? tr("Pas encore ouverte", "Not open yet") : locked ? tr("Pronostics figés", "Predictions locked") : bigCountdown(division.lockAt.getTime() - now)}</span>
          <span className="status-label">{division.status !== "open" ? tr("Le tirage s'ouvre aux pronostics après la pesée.", "The draw opens for predictions after the weigh-in.")
            : locked ? tr(`Depuis ${formatLocalTime(division.lockAt, competition.timezone)}.`, `Since ${formatLocalTime(division.lockAt, competition.timezone)}.`)
            : tr(`avant le verrouillage à ${formatLocalTime(division.lockAt, competition.timezone)}`, `before the lock at ${formatLocalTime(division.lockAt, competition.timezone)}`)}</span>
          {user && division.status === "open" && (
            <span className="progress" aria-label={tr(`${chosen} places choisies sur ${total}`, `${chosen} of ${total} places chosen`)}>
              {PLACES.flatMap((place) => Array.from({ length: limits[place] }, (_, i) => (
                <span key={`${place}-${i}`} className={`progress-dot ${i < places[place].length ? `place-${place}` : ""}`} />
              )))}
              <span className="progress-text">{chosen} / {total}</span>
            </span>
          )}
        </section>
      )}

      {!user && division.status === "open" && !locked && (
        <p className="notice"><Link to={`/connexion?retour=${encodeURIComponent(path)}`}>{tr("Connecte-toi", "Sign in")}</Link> {tr("pour pronostiquer cette division.", "to predict this division.")}</p>
      )}
      {stale && !hasResults && (
        <p className="notice warn">{tr(`Le tirage a été corrigé depuis ton pronostic. Vérifie tes choix${editable ? " et enregistre à nouveau" : ""}.`, `The draw has been corrected since your prediction. Check your picks${editable ? " and save again" : ""}.`)}</p>
      )}
      {editable && !tipHidden && (
        <aside className="tip">
          <p><strong>{tr("Comment jouer", "How to play")}</strong><br />{tr("Touche un athlète et choisis sa place : 1er, 2e, 3e ou battu en quart. Son chemin se dessine tout seul dans l'arbre. Zoome avec deux doigts ou les boutons.", "Tap an athlete and choose their place: 1st, 2nd, 3rd or lost in quarterfinal. Their path is drawn in the bracket automatically. Zoom with two fingers or the buttons.")}</p>
          <button type="button" className="tip-close" aria-label={tr("Fermer l'astuce", "Close the tip")} onClick={() => {
            setTipHidden(true);
            try { localStorage.setItem(TIP_KEY, "1"); } catch { /* préférence non gardée */ }
          }}>×</button>
        </aside>
      )}

      {/* Après les résultats : sans pronostic, l'arbre montre le résultat officiel ; avec, le pronostic corrigé (vert / rouge). */}
      <section className="group">
        <h2>{officialOnly ? tr("Résultat officiel", "Official result") : tr("Tableau", "Bracket")}</h2>
        {division.result && !officialOnly && <p className="muted small">{tr("Vert : juste · rouge : manqué.", "Green: right · red: missed.")}</p>}
        <BracketSheet tree={tree} places={officialOnly ? division.result! : places} result={officialOnly ? undefined : division.result}
          onChange={editable ? (places) => { setDraft(places); setMessage(null); setJustSaved(false); } : undefined} />
      </section>

      {user && !officialOnly && (
        <section className="group">
          <h2>{hasResults ? tr("Ton pronostic", "Your prediction") : tr("Mon pronostic", "My prediction")}</h2>
          <PicksSummary bracket={bracket} places={places} limits={limits} />
          {!check.valid && <ul className="issues">{check.issues.map((issue) => <li key={issue}>{translateIssue(issue)}</li>)}</ul>}
        </section>
      )}
      {division.result && (
        <section className="group">
          {!officialOnly && <h2>{tr("Résultat officiel", "Official result")}</h2>}
          <PicksSummary bracket={bracket} places={division.result} limits={limits} emptyLabel={tr("Non renseigné", "Not entered")} />
        </section>
      )}

      {lines.length > 0 && (
        <section className="group">
          <h2>{tr("Détail des points", "Points breakdown")}</h2>
          <table className="points-table">
            <thead><tr><th>{tr("Athlète", "Athlete")}</th><th>{tr("Ton choix", "Your pick")}</th><th>{tr("Réel", "Actual")}</th><th>{tr("Points", "Points")}</th></tr></thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.athleteId}>
                  <td>{flagOf(bracket.entrants.find((e) => e.athleteId === line.athleteId)?.country) && <span className="flag" aria-hidden="true">{flagOf(bracket.entrants.find((e) => e.athleteId === line.athleteId)?.country)}</span>}{nameOf(line.athleteId)}</td>
                  <td>{placeLabel(line.place)}</td>
                  <td>{line.actual ? placeLabel(line.actual) : "—"}</td>
                  <td>{formatPoints(line.points)}{line.bonus > 0 && <small className="muted"> {tr(`dont ${formatPoints(line.bonus)} de bonus`, `incl. ${formatPoints(line.bonus)} bonus`)}</small>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <nav className="group" aria-label={tr("Autres divisions", "Other divisions")}>
        <ul className="division-list">
          {next && (
            <li><Link to={`/competitions/${cid}/divisions/${next.division.id}`} className="division-row">
              <span className="muted small">{next.todo ? tr("Suivante à faire", "Next to do") : tr("Division suivante", "Next division")}</span>
              <span className="division-title">{next.division.category}</span>
            </Link></li>
          )}
          <li><Link to={`/competitions/${cid}`} className="division-row">
            <span className="division-title">{tr("Toutes les divisions", "All divisions")}</span>
            <span className="muted small">{competition.name}</span>
          </Link></li>
        </ul>
      </nav>

      {editable && (justSaved && !dirty ? (
        <div className="savebar">
          <span className="ok small">✓ {tr("Pronostic enregistré", "Prediction saved")}</span>
          <span className="savebar-actions">
            <Link to={`/competitions/${cid}`} className="button">{tr("Divisions", "Divisions")}</Link>
            {next && <Link to={`/competitions/${cid}/divisions/${next.division.id}`} className="button primary">{next.todo ? tr("Suivante à faire", "Next to do") : tr("Suivante", "Next")} →</Link>}
          </span>
        </div>
      ) : (
        <div className="savebar">
          <span className="muted small">{message?.text ?? tr(`${chosen} choix sur ${total}${chosen < total ? " : un pronostic incomplet compte quand même" : ""}`, `${chosen} of ${total} picks${chosen < total ? ": an incomplete prediction still counts" : ""}`)}</span>
          <button className="primary" disabled={busy || !check.valid || (!dirty && !stale)} onClick={save}>
            {busy ? tr("Enregistrement…", "Saving…") : prediction && !dirty && !stale ? tr("Enregistré", "Saved") : tr("Enregistrer", "Save")}
          </button>
        </div>
      ))}
      {!editable && message && <p className={message.tone}>{message.text}</p>}
    </main>
  );
}
