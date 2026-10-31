# FlammeFR — risque d’incendie de forêt en France métropolitaine

Site statique en français qui affiche, pour chaque département de France métropolitaine, le niveau de risque d’incendie de forêt pour **J+1** (demain) et **J+2** (après-demain). Le calcul est refait chaque jour, **toute l’année**.

> Outil d’information uniquement. Il ne remplace pas les consignes des autorités, ni un bulletin officiel. En cas d’urgence : **18** (sapeurs-pompiers) ou **112**.

## Fonctionnement général

```
GitHub Actions (cron quotidien, 05 h 00 UTC)
   └─ scripts/fetch-data.js ──► API Open-Meteo (prévisions horaires, sans clé)
          └─ calcul de l’indice FWI au chef-lieu de chaque département
          └─ data/fwi.json (commit si le résultat change)
                 └─ Vercel ──► index.html + assets/ (lecture seule du JSON)
```

1. Le workflow `.github/workflows/update-data.yml` s’exécute chaque jour (ou à la demande via **Actions > Run workflow**).
2. `scripts/fetch-data.js` interroge Open-Meteo pour les 96 chefs-lieux, calcule l’indice forêt-météo (FWI) et écrit `data/fwi.json`.
3. Le fichier n’est réécrit, et donc commité, que si les niveaux ont changé (la date `fileDate` n’entre pas dans la comparaison).
4. Le site charge ce JSON avec `fetch`. Il n’appelle jamais l’API directement : aucune clé n’est donc exposée dans le navigateur.

## Méthode de calcul

- **Indice** : indice forêt-météo canadien (FWI), selon les équations de Van Wagner (1987) : codes FFMC, DMC et DC, indices ISI et BUI, puis FWI.
- **Données d’entrée** : température, humidité relative, vent à 10 m et pluie horaires, fournis par Open-Meteo pour le chef-lieu de chaque département.
- **Heure de calcul** : 12 h, heure de Paris. La pluie est cumulée sur les 24 heures précédentes.
- **Amorçage** : la série est calculée sur les 30 derniers jours, puis sur aujourd’hui, demain et après-demain. Cela permet aux codes DMC et DC de tenir compte des périodes sèches ou humides récentes.
- **Niveaux** : ils suivent les classes du FWI utilisées par le système européen EFFIS.

| Niveau | Libellé | FWI |
|---|---|---|
| 1 | Faible | inférieur à 11,2 |
| 2 | Modéré | de 11,2 à 21,3 |
| 3 | Élevé | de 21,3 à 38 |
| 4 | Très élevé | 38 et plus |

### Limites à connaître

- **Ce n’est pas une prévision officielle.** Les niveaux ne proviennent plus de la Météo des forêts de Météo-France : ils sont calculés par le site. Le site le dit dans son pied de page et ses questions fréquentes.
- **Un point par département.** Le calcul est fait au chef-lieu. Un massif éloigné du chef-lieu, ou un département contrasté (par exemple un littoral et un relief), peut avoir un niveau réel différent.
- **Validation à faire.** L’implémentation suit les équations publiques du FWI, mais elle n’a pas encore été comparée à une implémentation de référence (par exemple le paquet R `cffdrs`). Avant une mise en production, comparez quelques journées et quelques départements avec cette référence.

## Structure du dépôt

```
.
├── index.html
├── assets/css/styles.css
├── assets/js/app.js, dept.js
├── assets/img/                   # favicon, icônes, image de partage 1200×630
├── data/fwi.json                 # généré automatiquement
├── scripts/fetch-data.js         # prévisions Open-Meteo et calcul FWI
├── scripts/build-seo.js          # pages départements, sitemap, balises
├── departement/                  # 96 pages générées (ne pas modifier à la main)
├── sitemap.xml, robots.txt, manifest.webmanifest, 404.html   # générés
├── .github/workflows/update-data.yml
├── package.json                  # sans dépendance ; Node.js ≥ 20, module ES
├── README.md
└── LICENSE
```

## Référencement naturel (SEO)

Le script `scripts/build-seo.js` s’exécute après le calcul et génère :

- **une page statique par département** (`/departement/gironde-33/`) avec titre, description, `h1`, région, préfecture et niveaux J+1 / J+2 ;
- les balises de la page d’accueil : `title`, description, URL canonique, Open Graph, Twitter Card, `hreflang`, données structurées JSON-LD (`WebSite`, `Dataset`, `BreadcrumbList` sur les pages départements) ;
- un contenu éditorial visible (liens vers les 96 départements, questions fréquentes), `sitemap.xml`, `robots.txt`, `manifest.webmanifest` et `404.html` ;
- aucun cookie, aucun traceur, aucun script tiers.

**URL du site.** Elle est fixée par la variable `SITE_URL` du workflow (par défaut `https://flamme-fr.vercel.app/`). Pour un domaine personnalisé, créez la variable `SITE_URL` (Settings > Secrets and variables > Actions > Variables), par exemple `https://flammefr.fr/`, puis relancez le workflow. L’adresse du sitemap doit correspondre exactement à celle de la propriété Search Console.

### Après la mise en ligne

1. Ajoutez le site dans la [Google Search Console](https://search.google.com/search-console) (propriété « Préfixe d’URL »), puis soumettez `sitemap.xml`. Faites de même dans [Bing Webmaster Tools](https://www.bing.com/webmasters).
2. Demandez l’indexation de la page d’accueil et de quelques pages départements (outil « Inspection de l’URL »).
3. Le site étant utile toute l’année, la communication peut être continue. Les pics de recherche suivent toutefois les vagues de chaleur et la saison des feux (juin à septembre).

## Mise en ligne

1. Poussez le dépôt sur GitHub (le dossier `.github/workflows` doit être présent).
2. Sur [vercel.com](https://vercel.com), **Add New > Project**, importez le dépôt. Framework : **Other**. Laissez vides la commande de build et la commande d’installation (`vercel.json` s’en charge).
3. Dans GitHub, vérifiez **Settings > Actions > General > Workflow permissions** : « Read and write permissions » doit être autorisée pour que le workflow puisse pousser `data/fwi.json`.
4. Lancez une première fois le workflow (**Actions > Mise à jour du risque d’incendie de forêt > Run workflow**). Aucun secret n’est nécessaire.
5. Vérifiez `https://<votre-adresse>/sitemap.xml`, puis soumettez-le dans la Search Console.

Chaque commit de données déclenche un nouveau déploiement.

## Configuration

Aucun secret n’est requis. Une variable facultative permet de changer l’API :

| Nom | Type | Obligatoire | Valeur |
|---|---|---|---|
| `OPEN_METEO_URL` | Variable | Non | URL de l’API. Défaut : `https://api.open-meteo.com/v1/forecast` |
| `SITE_URL` | Variable | Non | Adresse publique du site, avec `https://` et `/` final |

## Exécuter le script en local

Prérequis : Node.js 20 ou plus récent. Aucune installation de paquet n’est nécessaire.

```bash
node scripts/fetch-data.js     # calcule data/fwi.json (accès réseau à Open-Meteo requis)
node scripts/build-seo.js      # régénère les pages, sitemap et balises
npm run check                  # vérifie la syntaxe des scripts
```

Pour consulter le site, servez le dossier avec un serveur statique (`fetch` ne fonctionne pas depuis `file://`) :

```bash
npx serve .          # ou : python3 -m http.server 8000
```

Codes de sortie de `fetch-data.js` : `0` succès ou données inchangées ; `1` réponse inattendue ou requête refusée ; `2` erreur réseau persistante après 3 tentatives.

## Attribution et licence

- Les prévisions météo proviennent d’**[Open-Meteo.com](https://open-meteo.com/)**, sous licence **[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.fr)**. Le site affiche cette mention dans son pied de page : ne la retirez pas.
- L’offre gratuite d’Open-Meteo est réservée aux usages non commerciaux (sites sans abonnement ni publicité, associations, recherche publique, etc.) et est limitée en volume. Si le site devient payant ou porte de la publicité, il faut souscrire une offre Open-Meteo payante, conformément à ses conditions.
- Le code de ce dépôt est distribué sous licence MIT (voir `LICENSE`). Cette licence ne s’applique pas aux données d’Open-Meteo.
- Ce site n’est ni affilié à Open-Meteo, ni à Météo-France, ni approuvé par eux.

## Format de `data/fwi.json`

```json
{"schemaVersion":2,"fileDate":"2026-10-30T05:02:11Z","source":"Open-Meteo.com","licence":"https://creativecommons.org/licenses/by/4.0/deed.fr","api":"Open-Meteo, prévisions horaires (/v1/forecast), 30 jours d’amorçage","method":"…","dataDate":"2026-10-30","departments":[{"code":"33","name":"Gironde","j1":3,"j2":4,"fwi1":27.4,"fwi2":35.9}]}
```

`fileDate` est la date de génération (UTC). `dataDate` est le jour du calcul (heure de Paris). `j1` et `j2` valent 1 à 4, ou `null` si l’échéance n’a pas pu être calculée. `fwi1` et `fwi2` sont les valeurs numériques de l’indice. Le dépôt contient un fichier initial vide (`"fileDate":null`) : le site affiche alors un message « aucune donnée » jusqu’au premier passage du workflow.
