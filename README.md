# Groupe AOS — site vitrine (en construction)

« De la Guinée au monde, nous éclairons l'avenir. »

Page unique avec une scène 3D temps réel qui raconte la chaîne de valeur du groupe :
mine de bauxite → transport routier → navires (barges, grue flottante, vraquier) →
soutage → hydrocarbures (plateforme offshore), puis la nuit tombe et toute la chaîne
s'illumine jusqu'aux routes maritimes « vers le monde ».

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `index.html` | Structure et **tous les textes** de la page |
| `css/style.css` | Mise en forme (palette du logo : verts AOS, or, ambre de la goutte, crème du panneau) |
| `js/site.js` | Interface : introduction, défilement ↔ caméra 3D, cartes, rail lumineux |
| `js/3d/core.js` | Moteur : ciel physique, brume, shaders (terrain, eau), post-traitement HDR |
| `js/3d/world.js` | Relief, pistes, eau, végétation, port, villages |
| `js/3d/machines.js` | Engins, navires, plateforme (modèles procéduraux, aucun fichier 3D) |
| `js/3d/director.js` | Mise en scène : circulation, caméras, jour/nuit, éclairages, boucle de rendu |
| `three.min.js` | Moteur Three.js r149 (ne pas modifier) |
| `img/logo-aos-removebg-preview.png` | Logo couleur sans fond (utilisé sur fond clair : section contact) |
| `img/logo-aos-blanc.png` | Logo blanc avec goutte dorée (en-tête, intro, pied de page — fonds sombres) |
| `img/logo-aos.jpg` | Logo sur fond blanc (fichier source, disponible pour d'autres usages) |
| `img/og-groupe-aos.jpg` | Image d'aperçu des liens partagés, 1200×630 : logo, « GROUPE AOS » et slogan |
| `img/icon-aos-180.png` | Icône carrée (raccourci sur l'écran d'accueil iPhone / iPad) |

`img/logo-aos-blanc.png` a été dérivé du logo sans fond. Si une version blanche officielle
existe, il suffit de la déposer sous le même nom.

## Coordonnées et domaine

Renseignés dans `index.html` :
- section « Contact » : Conakry (Guinée), `contact@groupe-aos.com`, `+224 623 23 55 02`
  (liens `mailto:` et `tel:` cliquables) ;
- en-tête : `canonical` et `og:url` → `https://www.groupe-aos.com/`, image de partage
  `og:image` / `twitter:image` → `https://www.groupe-aos.com/img/og-groupe-aos.jpg` ;
- données structurées `Organization` (JSON-LD, lues par Google) avec les mêmes coordonnées.

En cas de changement de coordonnées ou de domaine, mettre à jour ces trois endroits.

Les intitulés des cinq activités (FR / EN / 中文) reprennent le panneau « Énergie, mines et
logistique ». Les phrases de description sous chaque activité sont des propositions à faire
valider par le client.

## Mise en ligne

Site 100 % statique : déposer tout le dossier à la racine de `https://www.groupe-aos.com/`
sur n'importe quel hébergement (Netlify, Vercel, OVH, serveur Apache/Nginx…). La police
« Outfit » est chargée depuis Google Fonts. La page s'ouvre aussi directement en local
(double-clic sur `index.html`).

## Aperçu des liens partagés

Quand on partage `https://www.groupe-aos.com/` dans WhatsApp, Facebook, Messenger, LinkedIn,
X, Telegram ou les messages privés Instagram, la carte d'aperçu affiche :
- l'image `img/og-groupe-aos.jpg` (logo, « GROUPE AOS », slogan) — composée pour rester
  lisible même recadrée en carré, comme le fait WhatsApp pour les petites vignettes ;
- le titre « Groupe AOS » ;
- la description qui commence par le slogan.

Ces informations viennent des balises `og:*` et `twitter:*` de `index.html`.

- L'aperçu n'apparaît qu'une fois le site en ligne sur le domaine (les applications vont
  chercher l'image à son adresse publique).
- Instagram n'affiche pas d'aperçu dans les publications ni dans la bio (les liens n'y sont
  pas des cartes) : seulement dans les messages privés.
- Les applications gardent les aperçus en cache. Après une modification, rafraîchir avec le
  [débogueur de partage Facebook](https://developers.facebook.com/tools/debug/) (Facebook,
  Messenger) et le [Post Inspector LinkedIn](https://www.linkedin.com/post-inspector/). Pour
  WhatsApp, un lien déjà partagé peut garder l'ancien aperçu : partager
  `https://www.groupe-aos.com/?v=2` force une nouvelle lecture.
- Pour changer l'image, remplacer le fichier par une autre image 1200×630 de moins de 300 Ko
  (au-delà, WhatsApp peut ne pas l'afficher).

## Qualité 3D et compatibilité

La qualité s'adapte seule à l'appareil (ordinateur puissant, portable, mobile) et la résolution
de rendu s'ajuste en continu pour rester fluide. Options d'URL pour tester :

- `?full` : force la qualité maximale
- `?medium` : force la qualité intermédiaire
- `?lite` : force la version allégée (mobile)
- `?no3d` : affiche la version sans 3D (fond illustré), utilisée automatiquement si WebGL est indisponible

Le rendu se met en pause quand l'onglet est masqué ou quand la section contact couvre l'écran.
Les préférences « animations réduites » du système sont respectées.

## Repères pour les retouches

- Hauteur du soleil selon l'étape du récit : tableau `ELEV` dans `js/3d/director.js`.
- Cadrage de chaque activité : fonction `station()` dans `js/3d/director.js`
  (0 = accueil, 1 = mines, 2 = transport, 3 = navires, 4 = soutage, 5 = hydrocarbures, 6-7 = final).
- Nombre de camions : `haul` (tombereaux) et `road` (camions routiers) dans `PRESETS`.
