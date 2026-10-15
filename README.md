# Ma Bibliothèque

Application web de gestion de bibliothèque personnelle avec challenge de lecture.

## Fonctionnalités

- **Bibliothèque visuelle** : étagère interactive avec tranches colorées et personnalisables
- **Catalogue de livres** : parcourir, ajouter, modifier et supprimer des livres avec filtres et tri
- **Marquer comme lu / noter** : suivre ses lectures et attribuer des notes sur 5 étoiles
- **Wishlist** : gérer une liste de livres souhaités et les marquer comme achetés
- **Challenge de lecture** : se fixer un objectif annuel, suivre sa progression avec roulette et jokers
- **Quiz lecture** : quiz en élimination directe entre genres pour trouver quoi lire
- **Emprunts** : noter qui emprunte quel livre, depuis quand, et marquer les retours
- **Statistiques** : tableaux de bord avec jauges, graphiques, records et classements
- **Base de données** : persistance via MySQL (API PHP)

## Stack technique

- **Frontend** : React, shadcn/ui, Tailwind CSS v4, JavaScript
- **Backend** : PHP, MySQL (PDO)
- **Build** : Vite
- **Typographie** : police système sans serif
- **Thème** : shadcn neutral, composants standards, accent orange discret

## Installation locale

```bash
npm install
npm run dev
```

Le serveur de dev proxy les appels `/api` vers `http://127.0.0.1:8000`.
Pour le backend PHP local :

```bash
php -S localhost:8000
```

## Build

```bash
npm run build
```

Les fichiers de production sont générés dans `dist/`.

## Déploiement (Hostinger)

### Prérequis

1. Créer une base de données MySQL dans hPanel
2. Exécuter `schema.sql` dans phpMyAdmin
3. Copier `api/config.example.php` en `api/config.php` et remplir les identifiants

### Déploiement manuel

1. `npm run build`
2. Copier `api/` et `.htaccess` dans `dist/`
3. Uploader le contenu de `dist/` dans `public_html/`
4. Accéder à `/api/seed.php` pour importer les livres initiaux (une seule fois)

### Déploiement automatique (GitHub Actions)

Ajouter ces secrets dans GitHub (Settings > Secrets > Actions) :

| Secret | Description |
|--------|-------------|
| `FTP_HOST` | Serveur FTP Hostinger |
| `FTP_USER` | Utilisateur FTP |
| `FTP_PASSWORD` | Mot de passe FTP |
| `DB_NAME` | Nom de la base de données |
| `DB_USER` | Utilisateur de la base de données |
| `DB_PASSWORD` | Mot de passe de la base de données |

Chaque push sur `main` déclenche le build et le déploiement automatique.

## Structure du projet

```
├── index.html                    # Page principale
├── src/index.css                 # Tailwind + thème de l’application
├── src/                          # Écrans React, composants shadcn et client API
├── vite.config.js                # Configuration Vite
├── schema.sql                    # Structure de la base de données
├── .htaccess                     # Sécurité et HTTPS
├── api/
│   ├── config.example.php        # Template de configuration BDD
│   ├── books.php                 # CRUD livres
│   ├── read.php                  # Toggle lu/non lu
│   ├── rate.php                  # Notes (1-5 étoiles)
│   ├── wishlist.php              # Wishlist (marquer comme acheté)
│   ├── challenge.php             # CRUD challenge
│   ├── loans.php                 # Gestion des emprunts
│   ├── migrate.php               # Migrations de schéma
│   └── seed.php                  # Import initial des livres
└── .github/workflows/
    └── deploy.yml                # Déploiement automatique
```

## Refonte mobile (React + shadcn/ui)

Le frontend utilise désormais React, les composants shadcn/ui et Tailwind CSS.
Les endpoints PHP et le schéma de base de données sont conservés à l’identique.
La navigation utilise des URL avec `#` pour rester compatible avec l’hébergement PHP existant.

### Développement

`npm run dev` utilise désormais une API **locale** sur `http://127.0.0.1:8000`.
Configurer `api/config.php` avec une base de développement, puis lancer `php -S 127.0.0.1:8000`.
Pour une autre API de développement, définir `API_PROXY_TARGET` avant de lancer Vite.
Ne pas pointer les tests de mutation vers la production.

### Démonstration sans MySQL

Dans deux terminaux :

```sh
node scripts/demo.mjs
```

```sh
API_PROXY_TARGET=http://127.0.0.1:8018 VITE_DEMO=true npm run dev -- --port 5180
```

L’API de démonstration garde ses changements en mémoire et repart du jeu d’exemple à chaque redémarrage.
La bannière de démonstration est limitée au serveur de développement. Le build utilise `/api/` normalement.

### Vérification

```sh
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

Les tests navigateur interceptent les appels API avec une bibliothèque de test. Ils ne modifient aucune base réelle.
Les fichiers de `public/` (manifeste, icônes et service worker) sont copiés automatiquement dans `dist/`.
Le worker retire le cache obsolète de l’ancienne interface ; la consultation et la modification nécessitent une connexion.
Le déploiement Hostinger reste celui décrit plus haut. Un push sur `main` déclenche toujours la publication.

## Import de livres et migration d’une installation existante

L’ajout manuel reste disponible dans « Tous mes livres », sous l’ajout par ISBN.
Les recherches passent par `api/catalog.php` vers [Open Library](https://openlibrary.org/dev/docs/api/books).
PHP doit disposer de cURL et mbstring ; aucune clé API n’est nécessaire.

Avant de mettre le nouveau frontend en service, sauvegarder la base, déposer les
fichiers PHP mis à jour puis exécuter `/api/migrate.php`. Pour appliquer uniquement
les changements Open Library dans phpMyAdmin, exécuter une seule fois
`migrations/2026-10-15-openlibrary.sql` dans l’onglet SQL avant de fusionner la PR. Vérifier que chaque
migration est `OK` ou `SKIP`. Cela ajoute les colonnes ISBN, couverture, éditeur,
date de publication et provenance, ainsi que les contraintes d’unicité des éditions.
Les anciennes fiches restent manuelles jusqu’à leur rapprochement. Pour une
nouvelle base, `schema.sql` contient déjà ces colonnes.

« Import Management » permet de sélectionner une fiche, rechercher une édition,
puis ouvrir « Réconciliation ». Les valeurs locales existantes sont sélectionnées
par défaut ; une valeur API absente n’efface jamais la fiche. La validation met à
jour uniquement les champs bibliographiques. L’année d’acquisition, les notes,
la lecture, les cadeaux, la wishlist, les couleurs/tailles et les emprunts restent
inchangés. Une fiche liée peut être comparée à nouveau depuis le filtre « Fiches
liées à l’API ». La source et son dernier instantané sont conservés en base.

L’association est explicite : une recherche titre/auteur peut proposer une autre
édition ou une autre langue. Vérifier l’éditeur, la date et la couverture ; l’ISBN
est préférable pour identifier l’exemplaire. Les sujets Open Library peuvent
être en anglais. Ils peuvent être corrigés dans la prévisualisation d’un nouvel
ajout ou conservés tels quels depuis la fiche locale lors de la réconciliation.
Aucune synchronisation automatique n’écrase les choix enregistrés.

## Vérification

```bash
npm test
npm run build
```

Les tests PHP exécutent les requêtes d’import sur une base SQLite en mémoire,
sans accéder à la base configurée dans `api/config.php`. Ils vérifient la
conservation des données personnelles, les conflits, les doublons et la provenance.
La suppression de `FOR UPDATE` dans l’adaptateur SQLite de test signifie que les
verrous/concurrences MySQL doivent encore être vérifiés sur un environnement de test MySQL.

Les parcours navigateur sont dans `tests/import.spec.js` (Playwright). Ils utilisent
une bibliothèque simulée, jamais les données de production. `npm run test:browser`
lance les parcours d’import sur ordinateur et mobile avec le serveur Vite local
fourni par Playwright. `npm run test:e2e` lance aussi les parcours de l’interface mobile.
Installer Chromium avec `npx playwright install chromium` si nécessaire.

Contrôle optionnel de l’API publique en lecture seule : `php tests/catalog-live.php`.
Il vérifie les recherches ISBN, titre/auteur et la liste paginée des autres éditions.

### Progression lors d’un changement de pagination

La réconciliation adapte automatiquement la position des lectures en cours au
pourcentage déjà lu : 120/300 devient 160/400. Si le total précédent est inconnu,
la page est conservée et plafonnée au nouveau total. La conversion utilise la
progression la plus récente au moment de l’enregistrement et se fait dans la même
transaction que la fiche. Un aperçu est affiché sans choix supplémentaire.

Les pages réellement lues et les dates du journal restent inchangées : un changement
d’édition ne crée aucune activité dans la heatmap. Les livres terminés restent lus.
Pour les anciennes fiches, l’application récupère automatiquement la progression
précédemment affichée avant de la convertir ; aucune correction rétroactive ni
migration SQL supplémentaire n’est nécessaire.

## Déploiement Git direct dans Hostinger

La commande reste `npm run build`, avec `dist` comme répertoire de sortie.
Le build prépare désormais **le frontend et l’API PHP** (`dist/api`), ainsi que
`.htaccess`. Le serveur de publication doit exécuter PHP ; un hébergement
strictement statique ne suffit pas pour cette application.

Définir dans l’environnement du build Hostinger `DB_NAME`, `DB_USER` et
`DB_PASSWORD`, ainsi que `DB_HOST` si différent de `localhost`. Utiliser les
identifiants MySQL Hostinger, pas les identifiants de connexion au panneau.
Le build génère `dist/api/config.php` depuis ces variables ; il ne copie jamais
le fichier privé local `api/config.php`. Ces identifiants ne sont pas inclus dans
le JavaScript du navigateur et ne sont pas affichés dans les journaux de build.
Sans ces variables, l’API renvoie un message JSON de configuration manquante.

Le déploiement Git direct Hostinger ne nécessite pas les secrets FTP GitHub :
ceux-ci concernent seulement le workflow GitHub Actions optionnel.
