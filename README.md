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
