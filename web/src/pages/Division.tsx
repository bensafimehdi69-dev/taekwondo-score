import { useMemo, useState } from "react";
import { buildTree, sanitizePlaces } from "../../../src/bracket-tree.ts";
import { bracketOf, emptyPlaces, PLACE_LABELS, PLACES, picksFromPlaces, resultFromPlaces, type DivisionDoc, type PredictionDoc, type Places } from "../../../src/model.ts";
import { scorePrediction, validatePrediction } from "../../../src/prediction.ts";
import { flagOf } from "../../../src/flags.ts";
import { BracketSheet } from "../components/BracketSheet.tsx";
import { PicksSummary } from "../components/PicksSummary.tsx";
import { getCompetition, getDivision, getPrediction, listDivisions, myPredictions, savePrediction, type WithId } from "../data.ts";
import { errorMessage, formatDay, formatLocalTime, formatPoints } from "../format.ts";
import { Link, usePath } from "../router.tsx";
import { useSession } from "../session.tsx";
import { useAsync, useNow } from "../useAsync.ts";

const samePlaces = (a: Places, b: Places) => PLACES.every((p) => [...a[p]].sort().join() === [...b[p]].sort().join());

const TIP_KEY = "tkd:astuce-division-vue";
const tipSeen = () => { try { return localStorage.getItem(TIP_KEY) === "1"; } catch { return false; } };

/** Temps restant en gros chiffres : « 2 h 15 min », « 45 min », « 3 j ». */
function bigCountdown(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ${String(minutes % 60).padStart(2, "0")}`;
  return `${Math.floor(hours / 24)} j`;
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
      <p className="crumbs"><Link to={`/competitions/${cid}`}>{competition.name}</Link></p>
      <header className="home-header">
        <p className="eyebrow">{formatDay(division.day, { weekday: "long", day: "numeric", month: "long" })} · {bracket.entrants.length} athlètes</p>
        <h1>{division.category}</h1>
      </header>

      {/* Carte d'état : temps restant et places choisies, ou points une fois les résultats saisis. */}
      {hasResults ? (
        <section className="status-card tone-results">
          <span className="chip chip-results">Résultats</span>
          <span className="status-value">{prediction?.score ? `${formatPoints(prediction.score.total)} pts` : prediction ? "…" : "Pas joué"}</span>
          <span className="status-label">{!prediction ? "Tu n'avais pas pronostiqué cette division."
            : prediction.score ? (prediction.score.exactGolds ? "Vainqueur trouvé !" : "Vainqueur manqué") : "Points en cours de calcul."}</span>
        </section>
      ) : (
        <section className={`status-card ${division.status === "open" && !locked ? "tone-open" : ""}`}>
          <span className={`chip ${division.status !== "open" ? "chip-draft" : locked ? "chip-locked" : "chip-open"}`}>
            {division.status !== "open" ? "Bientôt" : locked ? "Verrouillée" : "Ouverte"}</span>
          <span className="status-value">{division.status !== "open" ? "Pas encore ouverte" : locked ? "Pronostics figés" : bigCountdown(division.lockAt.getTime() - now)}</span>
          <span className="status-label">{division.status !== "open" ? "Le tirage s'ouvre aux pronostics après la pesée."
            : locked ? `Depuis ${formatLocalTime(division.lockAt, competition.timezone)}.`
            : `avant le verrouillage à ${formatLocalTime(division.lockAt, competition.timezone)}`}</span>
          {user && division.status === "open" && (
            <span className="progress" aria-label={`${chosen} places choisies sur ${total}`}>
              {PLACES.flatMap((place) => Array.from({ length: limits[place] }, (_, i) => (
                <span key={`${place}-${i}`} className={`progress-dot ${i < places[place].length ? `place-${place}` : ""}`} />
              )))}
              <span className="progress-text">{chosen} / {total}</span>
            </span>
          )}
        </section>
      )}

      {!user && division.status === "open" && !locked && (
        <p className="notice"><Link to={`/connexion?retour=${encodeURIComponent(path)}`}>Connecte-toi</Link> pour pronostiquer cette division.</p>
      )}
      {stale && !hasResults && (
        <p className="notice warn">Le tirage a été corrigé depuis ton pronostic. Vérifie tes choix{editable ? " et enregistre à nouveau" : ""}.</p>
      )}
      {editable && !tipHidden && (
        <aside className="tip">
          <p><strong>Comment jouer</strong><br />Touche un athlète et choisis sa place : 1er, 2e, 3e ou battu en quart. Son chemin se dessine tout seul dans l'arbre. Zoome avec deux doigts ou les boutons.</p>
          <button type="button" className="tip-close" aria-label="Fermer l'astuce" onClick={() => {
            setTipHidden(true);
            try { localStorage.setItem(TIP_KEY, "1"); } catch { /* préférence non gardée */ }
          }}>×</button>
        </aside>
      )}

      {/* Après les résultats : sans pronostic, l'arbre montre le résultat officiel ; avec, le pronostic corrigé (vert / rouge). */}
      <section className="group">
        <h2>{officialOnly ? "Résultat officiel" : "Tableau"}</h2>
        {division.result && !officialOnly && <p className="muted small">Vert : juste · rouge : manqué.</p>}
        <BracketSheet tree={tree} places={officialOnly ? division.result! : places} result={officialOnly ? undefined : division.result}
          onChange={editable ? (places) => { setDraft(places); setMessage(null); setJustSaved(false); } : undefined} />
      </section>

      {user && !officialOnly && (
        <section className="group">
          <h2>{hasResults ? "Ton pronostic" : "Mon pronostic"}</h2>
          <PicksSummary bracket={bracket} places={places} limits={limits} />
          {!check.valid && <ul className="issues">{check.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
        </section>
      )}
      {division.result && (
        <section className="group">
          {!officialOnly && <h2>Résultat officiel</h2>}
          <PicksSummary bracket={bracket} places={division.result} limits={limits} emptyLabel="Non renseigné" />
        </section>
      )}

      {lines.length > 0 && (
        <section className="group">
          <h2>Détail des points</h2>
          <table className="points-table">
            <thead><tr><th>Athlète</th><th>Ton choix</th><th>Réel</th><th>Points</th></tr></thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.athleteId}>
                  <td>{flagOf(bracket.entrants.find((e) => e.athleteId === line.athleteId)?.country) && <span className="flag" aria-hidden="true">{flagOf(bracket.entrants.find((e) => e.athleteId === line.athleteId)?.country)}</span>}{nameOf(line.athleteId)}</td>
                  <td>{PLACE_LABELS[line.place]}</td>
                  <td>{line.actual ? PLACE_LABELS[line.actual] : "—"}</td>
                  <td>{formatPoints(line.points)}{line.bonus > 0 && <small className="muted"> dont {formatPoints(line.bonus)} de bonus</small>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <nav className="group" aria-label="Autres divisions">
        <ul className="division-list">
          {next && (
            <li><Link to={`/competitions/${cid}/divisions/${next.division.id}`} className="division-row">
              <span className="muted small">{next.todo ? "Suivante à faire" : "Division suivante"}</span>
              <span className="division-title">{next.division.category}</span>
            </Link></li>
          )}
          <li><Link to={`/competitions/${cid}`} className="division-row">
            <span className="division-title">Toutes les divisions</span>
            <span className="muted small">{competition.name}</span>
          </Link></li>
        </ul>
      </nav>

      {editable && (justSaved && !dirty ? (
        <div className="savebar">
          <span className="ok small">✓ Pronostic enregistré</span>
          <span className="savebar-actions">
            <Link to={`/competitions/${cid}`} className="button">Divisions</Link>
            {next && <Link to={`/competitions/${cid}/divisions/${next.division.id}`} className="button primary">{next.todo ? "Suivante à faire" : "Suivante"} →</Link>}
          </span>
        </div>
      ) : (
        <div className="savebar">
          <span className="muted small">{message?.text ?? `${chosen} choix sur ${total}${chosen < total ? " : un pronostic incomplet compte quand même" : ""}`}</span>
          <button className="primary" disabled={busy || !check.valid || (!dirty && !stale)} onClick={save}>
            {busy ? "Enregistrement…" : prediction && !dirty && !stale ? "Enregistré" : "Enregistrer"}
          </button>
        </div>
      ))}
      {!editable && message && <p className={message.tone}>{message.text}</p>}
    </main>
  );
}
