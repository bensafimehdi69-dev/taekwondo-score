// Session : utilisateur Firebase, profil (pseudo) et rôle admin (custom claim `admin`, posé par scripts/set-admin.mjs).
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, onSnapshot, Timestamp } from "firebase/firestore";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { UserDoc } from "../../src/model.ts";
import { auth, db } from "./firebase.ts";

export type Session = {
  loading: boolean;
  user: User | null;
  /** null tant que le pseudo n'a pas été choisi. */
  profile: UserDoc | null;
  isAdmin: boolean;
};

const SessionContext = createContext<Session>({ loading: true, user: null, profile: null, isAdmin: false });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>({ loading: true, user: null, profile: null, isAdmin: false });

  useEffect(() => {
    let stopProfile = () => {};
    const stopAuth = onAuthStateChanged(auth, async (user) => {
      stopProfile();
      if (!user) {
        setSession({ loading: false, user: null, profile: null, isAdmin: false });
        return;
      }
      // Jeton relu à l'ouverture : un rôle admin accordé depuis la dernière visite est pris en compte sans reconnexion.
      const token = await user.getIdTokenResult(true).catch(() => user.getIdTokenResult());
      const isAdmin = token.claims.admin === true;
      stopProfile = onSnapshot(doc(db, "users", user.uid), (snapshot) => {
        const data = snapshot.data();
        // Juste après la création, createdAt (heure du serveur) est encore en attente : null jusqu'à confirmation.
        const createdAt = data?.createdAt instanceof Timestamp ? data.createdAt.toDate() : null;
        const profile = data && createdAt ? { displayName: String(data.displayName), createdAt } : null;
        setSession({ loading: false, user, profile, isAdmin });
      }, () => setSession({ loading: false, user, profile: null, isAdmin }));
    });
    return () => {
      stopProfile();
      stopAuth();
    };
  }, []);

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);
