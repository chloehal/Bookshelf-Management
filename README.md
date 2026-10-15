# Ma Bibliothèque

Application web de gestion de bibliothèque personnelle avec challenge de lecture.

## Fonctionnalités

- **Bibliothèque visuelle** : étagère interactive avec tranches colorées et personnalisables
- **Ajout par ISBN** : recherche ISBN-10/13 dans Open Library, prévisualisation et correction avant ajout, sans clé API
- **Import Management** : retrouver une édition par ISBN ou titre/auteur pour les fiches déjà encodées, avec filtres manuelles/liées
- **Réconciliation** : choisir la valeur locale ou API pour chaque champ (titre, auteur, ISBN, genres, pages, éditeur, date de publication, couverture), conserver la source et son instantané original
- **Couvertures** : image complète de l’édition, sans recadrage, ou vignette titre/auteur en cas d’image absente ou inaccessible
- **Catalogue de livres** : parcourir, ajouter, modifier et supprimer des livres avec filtres et tri
- **Marquer comme lu / noter** : suivre ses lectures et attribuer des notes sur 5 étoiles
- **Wishlist** : gérer une liste de livres souhaités et les marquer comme achetés
- **Challenge de lecture** : se fixer un objectif annuel, suivre sa progression avec roulette et jokers
- **Quiz lecture** : quiz en élimination directe entre genres pour trouver quoi lire
- **Emprunts** : noter qui emprunte quel livre, depuis quand, et marquer les retours
- **Statistiques** : tableaux de bord avec jauges, graphiques, records et classements
- **Base de données** : persistance via MySQL (API PHP)

## Stack technique

- **Frontend** : HTML, Tailwind CSS v4, DaisyUI v5, JavaScript vanilla
- **Backend** : PHP, MySQL (PDO)
- **Build** : Vite
- **Police** : Lexend
- **Thème** : daisysword (custom DaisyUI)

## Installation locale

```bash
npm install
npm run dev
```

Le serveur de dev proxy les appels `/api` vers `http://localhost:8000`.
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
├── style.css                     # Tailwind + thème DaisyUI
├── script.js                     # Logique frontend
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

Les parcours navigateur sont dans `tests/browser.cjs` (Playwright). Ils utilisent
une bibliothèque simulée, jamais les données de production, sur un serveur Vite
local au port 5176. Lancer `npm run dev -- --host 127.0.0.1 --port 5176`, puis
`npm run test:browser` après installation des dépendances et du navigateur Chromium.

Contrôle optionnel de l’API publique en lecture seule : `php tests/catalog-live.php`.
Il vérifie les recherches ISBN, titre/auteur et la liste paginée des autres éditions.
