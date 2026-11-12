# Site vitrine — mise en ligne et mises à jour

## Fichiers
- `index.html` : la page (textes, couleurs, scène 3D)
- `three.min.js` : moteur 3D (ne pas modifier)

## Modifier les textes
Ouvrir `index.html` et remplacer les zones entre crochets :
`[NOM DE L'ENTREPRISE]`, `[VILLE, PAYS]`, `[EMAIL]`, `[TÉLÉPHONE]`, la phrase d'activité,
ainsi que `mailto:contact@exemple.com` et `tel:+000000000`.
Couleur des engins et nombre de camions : `var CONFIG = { accent: '#F2B705', trucks: 6 };`

## Options d'URL (test)
- `?lite` : force la version allégée
- `?full` : force la version complète (ombres, plus d'arbres et de camions)
La version allégée s'active seule sur mobile et appareils modestes.
