# FlammeFR

**FlammeFR** est un site statique en français qui affiche le risque d’incendie de forêt pour chaque département de France métropolitaine, à **J+1** et **J+2**.

Le calcul est mis à jour chaque jour, toute l’année, à partir des prévisions météo horaires d’Open-Meteo et de l’indice forêt-météo canadien (FWI).

> ⚠️ **Outil d’information uniquement.** Ce site ne remplace pas les consignes des autorités ni les bulletins officiels. En cas d’urgence, appelez le **18** (sapeurs-pompiers) ou le **112**.

## Fonctionnalités

- Niveau de risque d’incendie par département pour demain et après-demain.
- Mise à jour quotidienne automatisée avec GitHub Actions.
- Une page dédiée pour chacun des 96 départements.
- Site statique, rapide et léger.
- Aucun cookie, aucun traceur, aucun script tiers.
- Aucune clé d’API exposée dans le navigateur.

## Niveaux de risque

Les niveaux reposent sur l’indice forêt-météo canadien (FWI), selon les classes utilisées par le système européen EFFIS.

| Niveau | Libellé | FWI |
|---|---|---|
| 1 | Faible | inférieur à 11,2 |
| 2 | Modéré | de 11,2 à 21,3 |
| 3 | Élevé | de 21,3 à 38 |
| 4 | Très élevé | 38 et plus |

## Comment ça marche

```text
GitHub Actions (cron quotidien, 05 h 00 UTC)
   └─ scripts/fetch-data.js ──► API Open-Meteo
          └─ calcul du FWI au chef-lieu de chaque département
          └─ data/fwi.json (commit si changement)
                 └─ Vercel ──► site statique
```

1. Le workflow `.github/workflows/update-data.yml` s’exécute chaque jour, ou manuellement depuis **Actions > Run workflow**.
2. `scripts/fetch-data.js` récupère les prévisions horaires des 96 chefs-lieux, calcule le FWI et écrit `data/fwi.json`.
3. Le fichier n’est commité que si les niveaux ont réellement changé.
4. Le site lit ensuite ce fichier JSON ; il n’appelle jamais l’API directement.

## Limites importantes

- **Ce n’est pas une prévision officielle.** Les niveaux sont calculés par FlammeFR, et non fournis par Météo-France.
- **Un seul point de mesure par département.** Le calcul est effectué au chef-lieu ; un département au relief ou au climat très contrasté peut présenter des conditions différentes localement.
- **Méthode à valider.** L’implémentation suit les équations publiques du FWI, mais n’a pas encore été comparée systématiquement à une implémentation de référence telle que le paquet R `cffdrs`.

## Démarrage local

Prérequis : **Node.js 20 ou plus récent**. Aucune dépendance n’est nécessaire.

```bash
node scripts/fetch-data.js     # génère data/fwi.json ; accès Internet requis
node scripts/build-seo.js      # régénère les pages, le sitemap et les balises
npm run check                  # vérifie la syntaxe des scripts
```

Pour consulter le site en local, servez le dossier avec un serveur statique :

```bash
npx serve .
# ou
python3 -m http.server 8000
```

Le site doit être servi via HTTP : `fetch` ne fonctionne pas depuis une ouverture directe du fichier avec `file://`.

## Déploiement

Le projet est conçu pour être déployé sur [Vercel](https://vercel.com).

1. Poussez le dépôt sur GitHub, en incluant le dossier `.github/workflows`.
2. Sur Vercel, importez le dépôt GitHub avec le framework **Other**.
3. Laissez vides les commandes de build et d’installation : `vercel.json` les gère.
4. Dans GitHub, activez **Settings > Actions > General > Workflow permissions > Read and write permissions** afin que le workflow puisse mettre à jour `data/fwi.json`.
5. Lancez une première fois le workflow depuis l’onglet **Actions**.

Chaque commit de données déclenche automatiquement un nouveau déploiement.

## Configuration

Aucun secret n’est requis.

| Variable | Obligatoire | Description |
|---|---|---|
| `OPEN_METEO_URL` | Non | URL de l’API Open-Meteo. Par défaut : `https://api.open-meteo.com/v1/forecast` |
| `SITE_URL` | Non | Adresse publique du site, avec `https://` et une barre oblique finale |

## Structure du dépôt

```text
.
├── index.html
├── assets/
├── data/fwi.json                 # généré automatiquement
├── scripts/fetch-data.js         # prévisions Open-Meteo et calcul FWI
├── scripts/build-seo.js          # pages départements, sitemap et balises
├── departement/                  # pages générées automatiquement
├── .github/workflows/update-data.yml
├── package.json
├── LICENSE
└── README.md
```

Les fichiers `data/fwi.json`, `departement/`, `sitemap.xml`, `robots.txt`, `manifest.webmanifest` et `404.html` sont générés automatiquement : évitez de les modifier manuellement.

## Contributions

Les contributions sont bienvenues, notamment pour :

- améliorer la documentation ;
- renforcer l’accessibilité et l’interface ;
- valider le calcul FWI avec une implémentation de référence ;
- proposer des améliorations de performance ou de référencement.

Ouvrez d’abord une *issue* pour les changements importants, puis soumettez une *pull request*.

## Licence et attribution

- Le code est distribué sous licence **MIT**. Voir le fichier [`LICENSE`](LICENSE).
- Les prévisions météo proviennent d’[Open-Meteo](https://open-meteo.com/), sous licence [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.fr). Cette mention doit rester visible dans le pied de page du site.
- L’offre gratuite d’Open-Meteo est destinée aux usages non commerciaux et limitée en volume. Pour un usage commercial, consultez leurs conditions et souscrivez une offre adaptée.
- FlammeFR n’est ni affilié à Open-Meteo, ni à Météo-France, ni approuvé par eux.
