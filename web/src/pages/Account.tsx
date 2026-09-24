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
import { lang, LangSwitch, tr } from "../i18n.tsx";

/** Icône de l'app (carré arrondi dégradé), en tête des écrans d'accueil du compte. */
const AppMark = () => <span className="app-mark" aria-hidden="true"><BracketIcon /></span>;

// Fonctions : le texte est choisi au moment de l'affichage (la langue peut changer entre-temps).
const AUTH_ERRORS: Record<string, () => string> = {
  "auth/invalid-credential": () => tr("E-mail ou mot de passe incorrect.", "Incorrect email or password."),
  "auth/invalid-email": () => tr("Adresse e-mail invalide.", "Invalid email address."),
  "auth/email-already-in-use": () => tr("Un compte existe déjà avec cette adresse : connecte-toi.", "An account already exists with this address: sign in."),
  "auth/weak-password": () => tr("Mot de passe trop court : 6 caractères au moins.", "Password too short: at least 6 characters."),
  "auth/too-many-requests": () => tr("Trop de tentatives. Réessaie dans quelques minutes.", "Too many attempts. Try again in a few minutes."),
  "auth/popup-closed-by-user": () => tr("Connexion Google annulée.", "Google sign-in cancelled."),
  "auth/popup-blocked": () => tr("Le navigateur a bloqué la fenêtre Google. Autorise-la puis réessaie.", "The browser blocked the Google window. Allow it, then try again."),
};
const authError = (error: unknown) => AUTH_ERRORS[(error as { code?: string })?.code ?? ""]?.() ?? errorMessage(error);

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
      <strong>{tr("Comptes de démonstration", "Demo accounts")}</strong>
      <p className="muted small">{tr("Émulateur local uniquement.", "Local emulator only.")}</p>
      <div className="actions">
        <button onClick={() => signInWithCustomToken(auth, demoToken("joueur"))}>{tr("Joueur démo", "Demo player")}</button>
        <button onClick={() => signInWithCustomToken(auth, demoToken("admin"))}>{tr("Admin démo", "Demo admin")}</button>
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
    auth.languageCode = lang();
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch (error) { setMessage({ tone: "error", text: authError(error) }); }
  }

  async function reset() {
    if (!email.trim()) { setMessage({ tone: "error", text: tr("Saisis ton adresse e-mail, puis touche « Mot de passe oublié ».", "Enter your email address, then tap “Forgot password”.") }); return; }
    try {
      auth.languageCode = lang();
      await sendPasswordResetEmail(auth, email.trim());
      setMessage({ tone: "ok", text: tr("Si un compte existe pour cette adresse, un e-mail de réinitialisation vient d'être envoyé.", "If an account exists for this address, a password reset email has just been sent.") });
    } catch (error) { setMessage({ tone: "error", text: authError(error) }); }
  }

  return (
    <main className="page narrow auth-page">
      <header className="auth-header">
        <AppMark />
        <h1>{mode === "login" ? tr("Connexion", "Sign in") : tr("Créer un compte", "Create account")}</h1>
        <p className="muted">{tr("Un compte est nécessaire pour pronostiquer. Aucun argent en jeu.", "You need an account to predict. No money involved.")}</p>
        <LangSwitch compact />
      </header>
      <div className="segmented full" role="tablist" aria-label={tr("Connexion ou création de compte", "Sign in or create an account")}>
        <button role="tab" aria-selected={mode === "login"} className={mode === "login" ? "is-active" : ""} onClick={() => { setMode("login"); setMessage(null); }}>{tr("Connexion", "Sign in")}</button>
        <button role="tab" aria-selected={mode === "signup"} className={mode === "signup" ? "is-active" : ""} onClick={() => { setMode("signup"); setMessage(null); }}>{tr("Créer un compte", "Create account")}</button>
      </div>
      <DemoAccounts />
      <button className="google" onClick={google}>{tr("Continuer avec Google", "Continue with Google")}</button>
      <div className="or"><span>{tr("ou", "or")}</span></div>
      <form className="form panel" onSubmit={submit}>
        <label>{tr("E-mail", "Email")}<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>{tr("Mot de passe", "Password")}
          <input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={6}
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {message && <p className={message.tone === "error" ? "error" : "ok"} role="status">{message.text}</p>}
        <button className="primary" disabled={busy}>{mode === "login" ? tr("Se connecter", "Sign in") : tr("Créer mon compte", "Create my account")}</button>
      </form>
      {mode === "login" && <div className="form-links"><button className="link" onClick={reset}>{tr("Mot de passe oublié ?", "Forgot password?")}</button></div>}
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
      <label>{tr("Pseudo (visible dans les classements)", "Nickname (shown in leaderboards)")}
        <input value={name} maxLength={30} autoComplete="nickname" onChange={(e) => setName(e.target.value)} />
      </label>
      <small className="muted">{tr("2 à 30 caractères.", "2 to 30 characters.")}</small>
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
        <h1>{tr("Bienvenue !", "Welcome!")}</h1>
        <p className="muted">{tr("Choisis le pseudo qui apparaîtra dans les classements.", "Choose the nickname that will appear in the leaderboards.")}</p>
      </header>
      <div className="panel"><PseudoForm initial={user?.displayName ?? ""} submitLabel={tr("Commencer", "Get started")} /></div>
      <button className="link" onClick={() => signOut(auth)}>{tr("Se déconnecter", "Sign out")}</button>
    </main>
  );
}

export function AccountPage() {
  const { user, profile, isAdmin, loading } = useSession();
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (!loading && !user) navigate("/connexion?retour=/compte", { replace: true }); }, [loading, user]);
  if (!user) return <main className="page"><p className="muted">{tr("Chargement…", "Loading…")}</p></main>;
  return (
    <main className="page narrow">
      <header className="profile-card">
        <span className="profile-avatar">{(profile?.displayName ?? user.email ?? "?").slice(0, 1).toUpperCase()}</span>
        <strong className="profile-name">{profile?.displayName ?? tr("Sans pseudo", "No nickname")}</strong>
        <span className="muted">{user.email ?? ""}</span>
      </header>
      <ul className="info-list">
        {profile && <li><span>{tr("Inscription", "Joined")}</span><span className="muted">{formatDay(profile.createdAt.toISOString().slice(0, 10), { day: "numeric", month: "long", year: "numeric" })}</span></li>}
        <li><span>{tr("Rôle", "Role")}</span><span className="muted">{isAdmin ? tr("Administrateur", "Administrator") : tr("Joueur", "Player")}</span></li>
      </ul>
      {profile && (
        <section className="group">
          <h2>{tr("Pseudo", "Nickname")}</h2>
          <div className="panel"><PseudoForm initial={profile.displayName} submitLabel={tr("Changer de pseudo", "Change nickname")} onSaved={() => setSaved(true)} /></div>
          {saved && <p className="ok" role="status">{tr("Pseudo enregistré.", "Nickname saved.")}</p>}
        </section>
      )}
      <section className="group">
        <h2>{tr("Langue", "Language")}</h2>
        <LangSwitch />
      </section>
      <button className="destructive-row" onClick={() => signOut(auth).then(() => navigate("/"))}>{tr("Se déconnecter", "Sign out")}</button>
    </main>
  );
}
