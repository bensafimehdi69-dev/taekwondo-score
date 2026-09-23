import { getCompetition, leaderboard } from "../data.ts";
import { formatPoints } from "../format.ts";
import { Link } from "../router.tsx";
import { useSession } from "../session.tsx";
import { useAsync } from "../useAsync.ts";

const initial = (name: string) => name.trim().slice(0, 1).toUpperCase() || "?";

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
      {cid && <p className="crumbs"><Link to={`/competitions/${cid}`}>{data?.competition?.name ?? "Compétition"}</Link></p>}
      <header className="home-header">
        <p className="eyebrow">{cid ? data?.competition?.name ?? "Compétition" : "Toutes compétitions"}</p>
        <h1>{cid ? "Classement" : "Classement général"}</h1>
      </header>
      {loading && !data && <div className="skeleton" aria-label="Chargement" />}
      {error && <p className="error">{error}</p>}
      {data && rows.length === 0 && <p className="empty-state">Pas encore de points : le classement s'affiche après les premiers résultats.</p>}

      {podium.length > 0 && (
        <section className="podium" aria-label="Podium">
          {[podium[1], podium[0], podium[2]].map((row, i) => row && (
            <div key={row.uid} className={`podium-step step-${[2, 1, 3][i]} ${row.uid === user?.uid ? "is-me" : ""}`}>
              <span className={`podium-avatar place-${["silver", "gold", "bronze"][i]}`}>{initial(row.displayName)}</span>
              <span className="podium-name">{row.displayName}</span>
              <span className="podium-points">{formatPoints(row.points)} pts</span>
              <span className={`podium-block place-${["silver", "gold", "bronze"][i]}`}>{row.rank}</span>
            </div>
          ))}
        </section>
      )}

      {me && me.rank > 3 && (
        <p className="notice">Tu es <strong>{me.rank}e</strong> avec {formatPoints(me.points)} points.</p>
      )}

      {rows.length > 0 && (
        <ul className="ranking-list">
          {rows.map((row) => (
            <li key={row.uid} className={row.uid === user?.uid ? "is-me" : ""}>
              <span className="rank">{row.rank}</span>
              <span className="rank-avatar">{initial(row.displayName)}</span>
              <span className="rank-name"><span>{row.displayName}{row.uid === user?.uid && <span className="muted"> · toi</span>}</span>
                <small className="muted">{row.exactGolds} vainqueur{row.exactGolds > 1 ? "s" : ""} trouvé{row.exactGolds > 1 ? "s" : ""}</small>
              </span>
              <span className="rank-points">{formatPoints(row.points)}<small> pts</small></span>
            </li>
          ))}
        </ul>
      )}
      <p className="muted small">Cumul des points{cid ? " de la compétition" : " depuis l'inscription"}. Égalité : plus de vainqueurs trouvés, puis inscription la plus ancienne.</p>
    </main>
  );
}
