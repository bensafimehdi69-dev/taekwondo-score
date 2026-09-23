import {
  createUserWithEmailAndPassword, GoogleAuthProvider, sendPasswordResetEmail, signInWithCustomToken, signInWithEmailAndPassword,
  signInWithPopup, signOut,
} from "firebase/auth";
import { useEffect, useState, type FormEvent } from "react";
import { createProfile, renameProfile } from "../data.ts";
import { auth, usingEmulators } from "../firebase.ts";
import { errorMessage, formatDay } from "../format.ts";
import { navigate } from "../router.tsx";
import { useSession } from "../session.tsx";
import { BracketIcon } from "../components/Icons.tsx";

/** Icône de l'app (carré arrondi dégradé), en tête des écrans d'accueil du compte. */
const AppMark = () => <span className="app-mark" aria-hidden="true"><BracketIcon /></span>;

const AUTH_ERRORS: Record<string, string> = {
  "auth/invalid-credential": "E-mail ou mot de passe incorrect.",
  "auth/invalid-email": "Adresse e-mail invalide.",
  "auth/email-already-in-use": "Un compte existe déjà avec cette adresse : connecte-toi.",
  "auth/weak-password": "Mot de passe trop court : 6 caractères au moins.",
  "auth/too-many-requests": "Trop de tentatives. Réessaie dans quelques minutes.",
  "auth/popup-closed-by-user": "Connexion Google annulée.",
  "auth/popup-blocked": "Le navigateur a bloqué la fenêtre Google. Autorise-la puis réessaie.",
};
const authError = (error: unknown) => AUTH_ERRORS[(error as { code?: string })?.code ?? ""] ?? errorMessage(error);

/**
 * Mode démo uniquement : l'émulateur d'authentification accepte des jetons non signés.
 * Permet d'essayer l'app avec les comptes fictifs de scripts/seed-demo.mjs, sans mot de passe.
 */
function demoToken(uid: string) {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  const now = Math.floor(Date.now() / 1000);
  return `${encode({ alg: "none", typ: "JWT" })}.${encode({
    iss: "demo@demo-taekwondo-score.iam.gserviceaccount.com", sub: "demo@demo-taekwondo-score.iam.gserviceaccount.com",
    aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit", iat: now, exp: now + 3600, uid,
  })}.`;
}

function DemoAccounts() {
  if (!usingEmulators) return null;
  return (
    <div className="panel">
      <strong>Comptes de démonstration</strong>
      <p className="muted small">Émulateur local uniquement.</p>
      <div className="actions">
        <button onClick={() => signInWithCustomToken(auth, demoToken("joueur"))}>Joueur démo</button>
        <button onClick={() => signInWithCustomToken(auth, demoToken("admin"))}>Admin démo</button>
      </div>
    </div>
  );
}

function returnPath() {
  const target = new URLSearchParams(window.location.search).get("retour");
  return target?.startsWith("/") && !target.startsWith("//") ? target : "/";
}

export function LoginPage() {
  const { user } = useSession();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string } | null>(null);

  useEffect(() => { if (user) navigate(returnPath(), { replace: true }); }, [user]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      if (mode === "login") await signInWithEmailAndPassword(auth, email.trim(), password);
      else await createUserWithEmailAndPassword(auth, email.trim(), password);
    } catch (error) {
      setMessage({ tone: "error", text: authError(error) });
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setMessage(null);
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch (error) { setMessage({ tone: "error", text: authError(error) }); }
  }

  async function reset() {
    if (!email.trim()) { setMessage({ tone: "error", text: "Saisis ton adresse e-mail, puis touche « Mot de passe oublié »." }); return; }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setMessage({ tone: "ok", text: "Si un compte existe pour cette adresse, un e-mail de réinitialisation vient d'être envoyé." });
    } catch (error) { setMessage({ tone: "error", text: authError(error) }); }
  }

  return (
    <main className="page narrow auth-page">
      <header className="auth-header">
        <AppMark />
        <h1>{mode === "login" ? "Connexion" : "Créer un compte"}</h1>
        <p className="muted">Un compte est nécessaire pour pronostiquer. Aucun argent en jeu.</p>
      </header>
      <div className="segmented full" role="tablist" aria-label="Connexion ou création de compte">
        <button role="tab" aria-selected={mode === "login"} className={mode === "login" ? "is-active" : ""} onClick={() => { setMode("login"); setMessage(null); }}>Connexion</button>
        <button role="tab" aria-selected={mode === "signup"} className={mode === "signup" ? "is-active" : ""} onClick={() => { setMode("signup"); setMessage(null); }}>Créer un compte</button>
      </div>
      <DemoAccounts />
      <button className="google" onClick={google}>Continuer avec Google</button>
      <div className="or"><span>ou</span></div>
      <form className="form panel" onSubmit={submit}>
        <label>E-mail<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Mot de passe
          <input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={6}
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {message && <p className={message.tone === "error" ? "error" : "ok"} role="status">{message.text}</p>}
        <button className="primary" disabled={busy}>{mode === "login" ? "Se connecter" : "Créer mon compte"}</button>
      </form>
      {mode === "login" && <div className="form-links"><button className="link" onClick={reset}>Mot de passe oublié ?</button></div>}
    </main>
  );
}

function PseudoForm({ initial, onSaved, submitLabel }: { initial: string; onSaved?: () => void; submitLabel: string }) {
  const { user, profile } = useSession();
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = name.trim().length >= 2 && name.trim().length <= 30;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!user || !valid) return;
    setBusy(true);
    setError(null);
    try {
      if (profile) await renameProfile(user.uid, name);
      else await createProfile(user.uid, name);
      onSaved?.();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <label>Pseudo (visible dans les classements)
        <input value={name} maxLength={30} autoComplete="nickname" onChange={(e) => setName(e.target.value)} />
      </label>
      <small className="muted">2 à 30 caractères.</small>
      {error && <p className="error" role="status">{error}</p>}
      <button className="primary" disabled={busy || !valid}>{submitLabel}</button>
    </form>
  );
}

/** Première connexion : le pseudo est choisi avant tout le reste. */
export function PseudoGate() {
  const { user } = useSession();
  return (
    <main className="page narrow auth-page">
      <header className="auth-header">
        <AppMark />
        <h1>Bienvenue !</h1>
        <p className="muted">Choisis le pseudo qui apparaîtra dans les classements.</p>
      </header>
      <div className="panel"><PseudoForm initial={user?.displayName ?? ""} submitLabel="Commencer" /></div>
      <button className="link" onClick={() => signOut(auth)}>Se déconnecter</button>
    </main>
  );
}

export function AccountPage() {
  const { user, profile, isAdmin, loading } = useSession();
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (!loading && !user) navigate("/connexion?retour=/compte", { replace: true }); }, [loading, user]);
  if (!user) return <main className="page"><p className="muted">Chargement…</p></main>;
  return (
    <main className="page narrow">
      <header className="profile-card">
        <span className="profile-avatar">{(profile?.displayName ?? user.email ?? "?").slice(0, 1).toUpperCase()}</span>
        <strong className="profile-name">{profile?.displayName ?? "Sans pseudo"}</strong>
        <span className="muted">{user.email ?? ""}</span>
      </header>
      <ul className="info-list">
        {profile && <li><span>Inscription</span><span className="muted">{formatDay(profile.createdAt.toISOString().slice(0, 10), { day: "numeric", month: "long", year: "numeric" })}</span></li>}
        <li><span>Rôle</span><span className="muted">{isAdmin ? "Administrateur" : "Joueur"}</span></li>
      </ul>
      {profile && (
        <section className="group">
          <h2>Pseudo</h2>
          <div className="panel"><PseudoForm initial={profile.displayName} submitLabel="Changer de pseudo" onSaved={() => setSaved(true)} /></div>
          {saved && <p className="ok" role="status">Pseudo enregistré.</p>}
        </section>
      )}
      <button className="destructive-row" onClick={() => signOut(auth).then(() => navigate("/"))}>Se déconnecter</button>
    </main>
  );
}
