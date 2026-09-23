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
    <main className="page narrow">
      <h1>{mode === "login" ? "Connexion" : "Créer un compte"}</h1>
      <p className="muted">Un compte est nécessaire pour pronostiquer. Aucun argent en jeu.</p>
      <DemoAccounts />
      <button className="google" onClick={google}>Continuer avec Google</button>
      <div className="or"><span>ou</span></div>
      <form className="form" onSubmit={submit}>
        <label>E-mail<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Mot de passe
          <input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={6}
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {message && <p className={message.tone === "error" ? "error" : "ok"} role="status">{message.text}</p>}
        <button className="primary" disabled={busy}>{mode === "login" ? "Se connecter" : "Créer mon compte"}</button>
      </form>
      <div className="form-links">
        {mode === "login" && <button className="link" onClick={reset}>Mot de passe oublié</button>}
        <button className="link" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMessage(null); }}>
          {mode === "login" ? "Pas encore de compte ? Créer un compte" : "Déjà un compte ? Se connecter"}
        </button>
      </div>
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
    <main className="page narrow">
      <h1>Bienvenue !</h1>
      <p className="muted">Choisis le pseudo qui apparaîtra dans les classements.</p>
      <PseudoForm initial={user?.displayName ?? ""} submitLabel="Commencer" />
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
      <h1>Mon compte</h1>
      <dl className="facts">
        <dt>E-mail</dt><dd>{user.email ?? "—"}</dd>
        {profile && <><dt>Inscription</dt><dd>{formatDay(profile.createdAt.toISOString().slice(0, 10), { day: "numeric", month: "long", year: "numeric" })}</dd></>}
        {isAdmin && <><dt>Rôle</dt><dd>Administrateur</dd></>}
      </dl>
      {profile && <PseudoForm initial={profile.displayName} submitLabel="Changer de pseudo" onSaved={() => setSaved(true)} />}
      {saved && <p className="ok" role="status">Pseudo enregistré.</p>}
      <button onClick={() => signOut(auth).then(() => navigate("/"))}>Se déconnecter</button>
    </main>
  );
}
