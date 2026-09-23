# Taekwondo Score — moteur de lecture et règles de pronostic

Base : moteur de lecture PDF de TKD Manage Competition (export du 18/09/2026), reconstitué tel quel.
Ajouts du 23/09/2026 (modifications du moteur d'origine visibles dans `CHANGES-moteur.diff`) :

| Fichier | Ajout |
| --- | --- |
| `src/team-path-parser.ts` | Champ `seed` (tête de série) ; exclusion des vainqueurs abrégés « NOM X.Y. (PAYS) » des livrets de résultats |
| `src/bracket-builder.ts` | Arbre par division : ordre, moitié et quart de chaque athlète, contrôles de cohérence, statut `ok` / `review` |
| `src/prediction.ts` | Validation des pronostics contre l'arbre, barème (`DEFAULT_SCORING`, à valider), classement cumulé et départage |
| `src/read-draw.ts` | Renvoie aussi `brackets` ; une division passe en revue si un athlète n'est pas « recognised » |
| `scripts/brackets.mjs` | Résumé d'un PDF, une ligne par division |

## Utilisation

```sh
npm install --ignore-scripts
npm run typecheck
npm test                                   # 77 tests : 65 réussis, 12 ignorés sans PDF réels
npm run brackets -- "/chemin/tirage.pdf"   # une ligne par division + anomalies
```

Tests sur PDF réels : `TKD_PDF_FIXTURES_DIR="/chemin/pdf" TKD_REQUIRE_PDF_FIXTURES=1 npm test`

## Écran de contrôle des tirages

```sh
npm run dev      # http://localhost:5173 : import d'un PDF, arbre reconstruit à côté du PDF, corrections, validation
npm run build    # version compilée dans dist/
```

Le PDF est lu dans le navigateur et n'est envoyé nulle part. Le contrôle s'exporte en JSON (bouton « Exporter le contrôle »).

## Firebase

Projet `taekwondo-score-app` (Firestore eur3, connexion e-mail et Google). Détails dans `CLAUDE.md`.

```sh
npm run admin -- utilisateur@exemple.com   # rôle admin (FIREBASE_SERVICE_ACCOUNT : chemin ou JSON de la clé)
firebase deploy --only firestore           # publie firestore.rules et firestore.indexes.json
```

## Limite connue

Grand Prix de Rome 2026 (livret de résultats) : 0 division sur 7 sans revue. Côté droit mal décodé et
une colonne de combats manquée côté gauche. Les contrôles le détectent ; la correction demande
plusieurs tirages officiels (publiés après la pesée) du même format.
