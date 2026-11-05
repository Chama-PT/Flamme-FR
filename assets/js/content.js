/* FlammeFR — textes partagés (module sans dépendance au navigateur : utilisé aussi par l'outil de génération des pages).
 * Les conseils reprennent les consignes déjà publiées par le site ; {pref} est remplacé par la préfecture du département. */

export const MEANING = {
  1: 'Le dessèchement de la végétation et les conditions météo sont peu favorables au démarrage et à la propagation d’un feu.',
  2: 'Un feu peut démarrer et se propager si la végétation est sèche ou si le vent se lève : la prudence reste de mise.',
  3: 'Les conditions favorisent le départ et la propagation des incendies de végétation.',
  4: 'Les conditions sont les plus favorables au départ et à la propagation rapide d’un feu de végétation.',
};

export const ADVICE = {
  1: [
    'Ce niveau ne s’accompagne d’aucune consigne particulière. Les arrêtés locaux restent applicables.',
    'Avant d’allumer un feu, renseignez-vous auprès de la préfecture ({pref}) ou de votre mairie.',
    'Ne jetez jamais de mégot dans la nature, quel que soit le niveau.',
  ],
  2: [
    'Soyez prudent avec les barbecues, les feux de camp et tout appareil produisant des flammes ou des étincelles.',
    'Ne jetez jamais de mégot et ne laissez aucun feu sans surveillance.',
    'Respectez les consignes locales et renseignez-vous auprès de la préfecture ({pref}) ou de votre mairie.',
  ],
  3: [
    'Ne faites ni feu ni barbecue en forêt ou à proximité de la végétation sèche, et ne jetez jamais de mégot.',
    'Ne stationnez pas sur l’herbe sèche.',
    'Renseignez-vous auprès de la préfecture ({pref}) ou de votre mairie sur les arrêtés limitant l’accès aux massifs ou l’usage du feu.',
    'En cas de départ de feu, appelez immédiatement le 18 (sapeurs-pompiers) ou le 112.',
  ],
  4: [
    'Évitez tout feu, barbecue ou point chaud en forêt et à proximité de la végétation sèche.',
    'Renseignez-vous avant de vous rendre dans un massif : la préfecture ({pref}) peut en limiter ou en interdire l’accès.',
    'Ne stationnez pas sur l’herbe sèche et ne jetez jamais de mégot.',
    'En cas de départ de feu, appelez le 18 ou le 112, éloignez-vous et laissez les accès libres pour les secours.',
  ],
};

export const adviceFor = (level, pref) => ADVICE[level].map((t) => t.replace('{pref}', pref));

/* Facteurs de la méthode (page d'accueil et page Méthodologie). */
export const FACTORS = [
  { icon: 'thermo', title: 'Chaleur', text: 'Une température élevée assèche l’air et la végétation, et la rend plus inflammable.', tag: 'Température à 12 h' },
  { icon: 'drop', title: 'Humidité de l’air', text: 'Quand l’air est sec, feuilles et brindilles mortes perdent leur eau en quelques heures.', tag: 'Humidité relative à 12 h' },
  { icon: 'wind', title: 'Vent', text: 'Le vent apporte de l’oxygène au feu et lui fait gagner du terrain beaucoup plus vite.', tag: 'Vent à 10 m, en km/h' },
  { icon: 'sun', title: 'Sécheresse', text: 'Des semaines sans pluie assèchent aussi l’humus et les couches profondes du sol.', tag: 'Codes DMC et DC' },
  { icon: 'leaf', title: 'Végétation', text: 'Litière de feuilles, herbes et brindilles : c’est le combustible qui s’enflamme en premier.', tag: 'Code FFMC' },
];
