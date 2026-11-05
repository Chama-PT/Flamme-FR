# FlammeFR

Niveau de risque d'incendie de forêt pour les 96 départements de France métropolitaine, calculé chaque jour à partir de prévisions météo (indice forêt-météo, FWI). Aujourd'hui, demain et après-demain.

Site statique, sans dépendance et sans étape de build : les fichiers du dépôt sont servis tels quels par Vercel.

## Structure

```
index.html                    accueil (carte, vigilance nationale, FAQ, index des départements)
departement/<slug>/index.html 96 pages départements
methodologie/, a-propos/, 404.html
assets/css/styles.css         thème « Vigilance Naturelle »
assets/js/                    lib.js (données, utilitaires) · site.js (menu, recherche) · home.js · dept.js · content.js
assets/fonts/                 Instrument Serif, Geist, Geist Mono (licence SIL OFL, textes inclus)
assets/data/departements.json code, nom, slug, région, préfecture
data/fwi.json                 données du jour (mises à jour par GitHub Actions)
scripts/fetch-data.js         récupération Open-Meteo + calcul du FWI
.github/workflows/update-data.yml   exécution quotidienne à 05:00 UTC, commit de data/fwi.json
vercel.json                   en-têtes de sécurité (CSP), cache, trailing slash
tools/                        outils optionnels de régénération (voir plus bas)
```

## Déploiement sur Vercel

Réglages du projet Vercel : Framework Preset « Other », Build Command vide, Output Directory `.`, aucune variable d'environnement. Ils sont déjà fixés par `vercel.json`. Un `git push` sur la branche de production déclenche le déploiement.

Après la première mise en ligne, lancez une fois le workflow « Mise à jour des données » (onglet Actions de GitHub, bouton « Run workflow ») pour que `data/fwi.json` passe au schéma 3 : les onglets « Aujourd'hui » et le bloc « Conditions » apparaissent alors. Le workflow doit avoir le droit d'écrire (Settings, Actions, General, Workflow permissions : Read and write).

## Données

`data/fwi.json`, schéma 3 (ajouts compatibles avec le schéma 2) : pour chaque département `j0, fwi0, j1, fwi1, j2, fwi2` (niveau 1 à 4 et indice) et `m0, m1, m2` (`t` température, `h` humidité, `w` vent, `r` pluie, `ffmc`, `dmc`, `dc`). Si ces champs sont absents, l'interface les masque sans erreur.

Niveaux (classes EFFIS) : 1 Faible (< 11,2) · 2 Modéré (11,2 à 21,3) · 3 Élevé (21,3 à 38) · 4 Très élevé (≥ 38).

## Outils optionnels (non requis pour déployer)

- `node tools/generate-pages.mjs` régénère les pages HTML (accueil, départements, etc.). Variable `SITE_URL` pour changer le domaine (par défaut `https://flammefr.vercel.app/`).
- `tools/build-map.mjs` reconstruit les tracés de la carte depuis le dépôt france-geojson.
- `npm run check` vérifie la syntaxe des scripts.

## Sources et licences

- Prévisions météo : [Open-Meteo](https://open-meteo.com/), licence CC BY 4.0 (mention conservée dans le pied de page).
- Calcul FWI : système canadien (Van Wagner, 1987) ; classes de danger EFFIS.
- Contours des départements : IGN Admin Express, version simplifiée par Grégoire David (Licence ouverte).
- Polices : Instrument Serif et Geist, SIL Open Font License 1.1.
- Code : MIT (voir `LICENSE`).

Les niveaux affichés sont indicatifs et ne remplacent pas les arrêtés préfectoraux. En cas d'incendie : 18 ou 112.
