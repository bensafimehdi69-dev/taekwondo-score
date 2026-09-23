import { getCompetition, leaderboard } from "../data.ts";
import { formatPoints } from "../format.ts";
import { Link } from "../router.tsx";
import { useSession } from "../session.tsx";
import { useAsync } from "../useAsync.ts";

/** Classement général (sans cid) ou d'une compétition : cumul brut, départage par vainqueurs exacts puis ancienneté. */
export function LeaderboardPage({ cid }: { cid?: string }) {
  const { user } = useSession();
  const { data, error, loading } = useAsync(async () => ({
    rows: await leaderboard(cid),
    competition: cid ? await getCompetition(cid) : null,
  }), [cid]);

  return (
    <main className="page">
      {cid && <p className="crumbs"><Link to={`/competitions/${cid}`}>{data?.competition?.name ?? "Compétition"}</Link></p>}
      <h1>{cid ? "Classement de la compétition" : "Classement général"}</h1>
      <p className="muted small">Cumul des points{cid ? " de la compétition" : " depuis l'inscription"}. Égalité : plus de vainqueurs trouvés, puis inscription la plus ancienne.</p>
      {loading && <p className="muted">Chargement…</p>}
      {error && <p className="error">{error}</p>}
      {data && data.rows.length === 0 && <p className="muted">Pas encore de points : le classement s'affiche après les premiers résultats.</p>}
      {data && data.rows.length > 0 && (
        <table className="ranking">
          <thead><tr><th>#</th><th>Joueur</th><th>Points</th><th title="Vainqueurs trouvés">Vainq.</th></tr></thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.uid} className={row.uid === user?.uid ? "is-me" : ""}>
                <td>{row.rank}</td>
                <td>{row.displayName}{row.uid === user?.uid && <span className="muted"> (toi)</span>}</td>
                <td>{formatPoints(row.points)}</td>
                <td>{row.exactGolds}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
