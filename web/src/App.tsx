import { signOut } from "firebase/auth";
import { lazy, Suspense, type ReactNode } from "react";
import { auth, usingEmulators } from "./firebase.ts";
import { Link, matchPath, usePath } from "./router.tsx";
import { useSession } from "./session.tsx";
import { AccountPage, LoginPage, PseudoGate } from "./pages/Account.tsx";
import { CompetitionPage } from "./pages/Competition.tsx";
import { DivisionPage } from "./pages/Division.tsx";
import { HomePage } from "./pages/Home.tsx";
import { LeaderboardPage } from "./pages/Leaderboard.tsx";
import { AdminCompetitionPage } from "./pages/admin/AdminCompetition.tsx";
import { AdminHomePage } from "./pages/admin/AdminHome.tsx";
import { AdminResultsPage } from "./pages/admin/AdminResults.tsx";

// Le moteur de lecture PDF (PDF.js, OCR) ne sert qu'à l'admin : chargé à la demande, pas dans l'app des joueurs.
const AdminResultsImportPage = lazy(() => import("./pages/admin/AdminResultsImport.tsx").then((m) => ({ default: m.AdminResultsImportPage })));
const AdminImportPage = lazy(() => import("./pages/admin/AdminImport.tsx").then((m) => ({ default: m.AdminImportPage })));

type Route = { pattern: string; render: (params: Record<string, string>) => ReactNode; admin?: boolean; bare?: boolean };

const routes: Route[] = [
  { pattern: "/", render: () => <HomePage /> },
  { pattern: "/connexion", render: () => <LoginPage /> },
  { pattern: "/compte", render: () => <AccountPage /> },
  { pattern: "/classement", render: () => <LeaderboardPage /> },
  { pattern: "/competitions/:cid", render: (p) => <CompetitionPage cid={p.cid} /> },
  { pattern: "/competitions/:cid/classement", render: (p) => <LeaderboardPage cid={p.cid} /> },
  { pattern: "/competitions/:cid/divisions/:did", render: (p) => <DivisionPage key={p.did} cid={p.cid} did={p.did} /> },
  { pattern: "/admin", admin: true, render: () => <AdminHomePage /> },
  { pattern: "/admin/competitions/:cid", admin: true, render: (p) => <AdminCompetitionPage cid={p.cid} /> },
  { pattern: "/admin/competitions/:cid/import", admin: true, bare: true, render: (p) => <AdminImportPage cid={p.cid} /> },
  { pattern: "/admin/competitions/:cid/jours/:day/import", admin: true, bare: true, render: (p) => <AdminImportPage key={p.day} cid={p.cid} day={p.day} /> },
  { pattern: "/admin/competitions/:cid/jours/:day/resultats", admin: true, render: (p) => <AdminResultsImportPage key={p.day} cid={p.cid} day={p.day} /> },
  { pattern: "/admin/competitions/:cid/divisions/:did/resultats", admin: true, render: (p) => <AdminResultsPage key={p.did} cid={p.cid} did={p.did} /> },
];

export function App() {
  const path = usePath();
  const session = useSession();
  const found = routes.map((route) => ({ route, params: matchPath(route.pattern, path) })).find((r) => r.params);

  let content: ReactNode;
  if (!found) content = <main className="page"><h1>Page introuvable</h1><p><Link to="/">Retour à l'accueil</Link></p></main>;
  else if (found.route.admin && session.loading) content = <main className="page"><p className="muted">Chargement…</p></main>;
  else if (found.route.admin && !session.isAdmin) {
    content = <main className="page"><h1>Accès réservé</h1><p className="muted">Cette page est réservée aux administrateurs.</p></main>;
  } else content = found.route.render(found.params!);

  // Pseudo obligatoire avant tout usage connecté (il apparaît dans les classements).
  if (session.user && !session.loading && !session.profile && path !== "/compte") content = <PseudoGate />;
  if (found?.route.bare && session.isAdmin) return <Suspense fallback={<main className="page"><p className="muted">Chargement du lecteur de PDF…</p></main>}>{content}</Suspense>;

  return (
    <div className="shell">
      <header className="site-header">
        <Link to="/" className="logo">Taekwondo <span>Score</span></Link>
        <nav>
          <Link to="/" className={path === "/" || path.startsWith("/competitions") ? "is-active" : ""}>Compétitions</Link>
          <Link to="/classement" className={path === "/classement" ? "is-active" : ""}>Classement</Link>
          {session.isAdmin && <Link to="/admin" className={path.startsWith("/admin") ? "is-active" : ""}>Admin</Link>}
        </nav>
        <div className="account">
          {session.user
            ? <Link to="/compte" className="avatar" title="Mon compte">{(session.profile?.displayName ?? "?").slice(0, 1).toUpperCase()}</Link>
            : <Link to={`/connexion?retour=${encodeURIComponent(path)}`} className="button small">Connexion</Link>}
        </div>
      </header>
      {usingEmulators && (
        <div className="demo-banner">
          Mode démo : émulateurs locaux, aucune donnée réelle.
          {session.user && <button className="link" onClick={() => signOut(auth)}>Se déconnecter</button>}
        </div>
      )}
      <Suspense fallback={<main className="page"><p className="muted">Chargement du lecteur de PDF…</p></main>}>{content}</Suspense>
    </div>
  );
}
