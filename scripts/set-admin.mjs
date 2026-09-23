// Accorde (ou retire) le rôle admin à un compte existant, avec la clé du compte de service.
// Usage : npm run admin -- utilisateur@exemple.com [--retirer]
// FIREBASE_SERVICE_ACCOUNT : chemin du fichier JSON de la clé, ou son contenu JSON (lu aussi dans .env).
import { readFileSync } from "node:fs";
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const args = process.argv.slice(2);
const email = args.find((arg) => !arg.startsWith("--"));
const remove = args.includes("--retirer");
const source = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();

if (!email || !source) {
  console.error("Usage: npm run admin -- utilisateur@exemple.com [--retirer]  (FIREBASE_SERVICE_ACCOUNT requis)");
  process.exitCode = 1;
} else {
  try {
    const key = JSON.parse(source.startsWith("{") ? source : readFileSync(source, "utf8"));
    const expected = JSON.parse(readFileSync(new URL("../.firebaserc", import.meta.url), "utf8")).projects.default;
    if (key.project_id !== expected) throw new Error(`Clé du projet « ${key.project_id} », attendu « ${expected} ».`);
    const auth = getAuth(initializeApp({ credential: cert(key), projectId: key.project_id }));
    const user = await auth.getUserByEmail(email);
    const claims = { ...user.customClaims };
    if (remove) delete claims.admin;
    else claims.admin = true;
    await auth.setCustomUserClaims(user.uid, claims);
    console.log(`${email} : rôle admin ${remove ? "retiré" : "accordé"} sur ${expected} (effectif à la prochaine connexion).`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
