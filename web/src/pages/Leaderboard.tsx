import { getCompetition, leaderboard } from "../data.ts";
import { formatPoints } from "../format.ts";
import { tr } from "../i18n.tsx";
import { Link } from "../router.tsx";
import { useSession } from "../session.tsx";
import { useAsync } from "../useAsync.ts";

const initial = (name: string) => name.trim().slice(0, 1).toUpperCase() || "?";
/** Rang ordinal anglais : 1st, 2nd, 3rd, 4th… 11th, 12th, 13th, 21st. */
const ordinalEn = (n: number) => {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
};

/**
 * Classement général (sans cid) ou d'une compétition : cumul brut, départage par vainqueurs exacts puis ancienneté.
 * Façon iOS 27 : podium des trois premiers, puis la liste groupée ; la ligne du joueur connecté est mise en avant.
 */
export function LeaderboardPage({ cid }: { cid?: string }) {
  const { user } = useSession();
  const { data, error, loading } = useAsync(async () => ({
    rows: await leaderboard(cid),
    competition: cid ? await getCompetition(cid) : null,
  }), [cid]);
  const rows = data?.rows ?? [];
  const podium = rows.slice(0, 3);
  const me = rows.find((r) => r.uid === user?.uid);

  return (
    <main className="page">
      {cid && <p className="crumbs"><Link to={`/competitions/${cid}`}>{data?.competition?.name ?? tr("Compétition", "Competition")}</Link></p>}
      <header className="home-header">
        <p className="eyebrow">{cid ? data?.competition?.name ?? tr("Compétition", "Competition") : tr("Toutes compétitions", "All competitions")}</p>
        <h1>{cid ? tr("Classement", "Leaderboard") : tr("Classement général", "Overall leaderboard")}</h1>
      </header>
      {loading && !data && <div className="skeleton" aria-label={tr("Chargement", "Loading")} />}
      {error && <p className="error">{error}</p>}
      {data && rows.length === 0 && <p className="empty-state">{tr("Pas encore de points : le classement s'affiche après les premiers résultats.", "No points yet: the leaderboard appears after the first results.")}</p>}

      {podium.length > 0 && (
        <section className="podium" aria-label={tr("Podium", "Podium")}>
          {[podium[1], podium[0], podium[2]].map((row, i) => row && (
            <div key={row.uid} className={`podium-step step-${[2, 1, 3][i]} ${row.uid === user?.uid ? "is-me" : ""}`}>
              <span className={`podium-avatar place-${["silver", "gold", "bronze"][i]}`}>{initial(row.displayName)}</span>
              <span className="podium-name">{row.displayName}</span>
              <span className="podium-points">{formatPoints(row.points)} {tr("pts", "pts")}</span>
              <span className={`podium-block place-${["silver", "gold", "bronze"][i]}`}>{row.rank}</span>
            </div>
          ))}
        </section>
      )}

      {me && me.rank > 3 && (
        <p className="notice">{tr("Tu es ", "You are ")}<strong>{tr(`${me.rank}e`, ordinalEn(me.rank))}</strong>{tr(" avec ", " with ")}{formatPoints(me.points)} {tr("points", me.points === 1 ? "point" : "points")}.</p>
      )}

      {rows.length > 0 && (
        <ul className="ranking-list">
          {rows.map((row) => (
            <li key={row.uid} className={row.uid === user?.uid ? "is-me" : ""}>
              <span className="rank">{row.rank}</span>
              <span className="rank-avatar">{initial(row.displayName)}</span>
              <span className="rank-name"><span>{row.displayName}{row.uid === user?.uid && <span className="muted"> · {tr("toi", "you")}</span>}</span>
                <small className="muted">{tr(
                  `${row.exactGolds} vainqueur${row.exactGolds > 1 ? "s" : ""} trouvé${row.exactGolds > 1 ? "s" : ""}`,
                  `${row.exactGolds} winner${row.exactGolds === 1 ? "" : "s"} found`,
                )}</small>
              </span>
              <span className="rank-points">{formatPoints(row.points)}<small> {tr("pts", "pts")}</small></span>
            </li>
          ))}
        </ul>
      )}
      <p className="muted small">{cid
        ? tr("Cumul des points de la compétition. Égalité : plus de vainqueurs trouvés, puis inscription la plus ancienne.", "Total points for the competition. Ties: most winners found, then earliest sign-up.")
        : tr("Cumul des points depuis l'inscription. Égalité : plus de vainqueurs trouvés, puis inscription la plus ancienne.", "Total points since joining. Ties: most winners found, then earliest sign-up.")}</p>
    </main>
  );
}
