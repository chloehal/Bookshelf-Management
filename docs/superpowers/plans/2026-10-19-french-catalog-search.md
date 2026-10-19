# Recherche française et réconciliation — Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Appliquer l’audit UX validé : retrouver les éditions françaises dans les trois catalogues, sans association silencieuse ni perte du contexte.

**Architecture:** Conserver React/PHP et les trois fournisseurs existants. Exposer une recherche par fournisseur avec des curseurs indépendants ; le client lance les trois appels simultanément, affiche chaque réponse puis classe/regroupe les notices par ISBN. Les détails bibliographiques supplémentaires restent dans le snapshot JSON, sans migration.

**Tech Stack:** React 19, PHP, Vite, Playwright, node:test.

**Spec:** `docs/superpowers/specs/2026-10-19-french-catalog-search-design.md` (audit UX validé).

## Global Constraints
- ISBN exact prioritaire ; français ensuite, langue inconnue conservée et signalée.
- Pas de nouvelle dépendance ni clé API ; Goodreads reste un lien de recherche, sans faux accès API.
- Préserver données personnelles, choix locaux, progression et protection 409.
- Réutiliser les endpoints historiques et leurs tests.

## Review Focus
- Une édition multilingue/inconnue doit rester visible ; la langue de l’œuvre ne prouve pas celle de l’édition.
- Panne ou réponse lente d’une source : les résultats des autres restent utilisables.
- Annulation/changement de cible : aucune réponse tardive ne doit changer la nouvelle cible.
- ISBN partagé avec valeurs contradictoires : sources conservées et conflits visibles.
- Reprise d’un brouillon après mutation externe : relire la fiche, conserver la protection 409.

### Task 1: Fournisseurs et métadonnées
**Files:** `api/catalog-search.php` (nouveau), `api/catalog.php`, `api/catalog-lib.php`, `api/catalog-bnf.php`, `api/catalog-sudoc.php`, `api/catalog-editions.php`, `tests/search-test.php`, `package.json`.
**Interfaces:** `catalog_search_source(input, providers)` -> items, next, source ; `catalog_search_openlibrary(query, offset)` -> page. `languages`, `format`, `collection`, `translator` sont des métadonnées d’édition conservées dans le snapshot.
- [x] Écrire les tests de recherche directe multi-source, langue/format des trois catalogues, ISBN exact et pagination ; constater leur échec.
- [x] Implémenter les routes source + normalisation ; limiter et valider les paramètres.
- [x] Vérifier PHP et `npm test`.

### Task 2: Résultats et réconciliation
**Files:** `catalog.mjs`, `src/pages/import.jsx`, `tests/catalog.test.mjs`, `tests/import.spec.js`, `api/catalog-storage.php`, `tests/catalog-test.php`.
**Interfaces:** `rankEditionResults`, `groupEditionResults`, `identityConflict` partagés par le parcours ; requêtes indépendantes, statuts par source et reprise des curseurs en erreur.
- [x] Écrire les tests de classement français/ISBN, groupes avec conflits, titres/auteurs divergents, affichage titre/auteur pour nouvel ajout, résultats progressifs et effacement des anciens résultats ; constater les échecs.
- [x] Implémenter classement, filtres langue, regroupement et choix explicite de la notice à comparer.
- [x] Afficher identité + alerte et demander confirmation en cas de divergence ; vérifier aussi côté serveur.
- [x] Montrer résumé des changements, lignes identiques repliées et effet de la pagination.
- [x] Ajouter secours Goodreads, recherche élargie et ajout manuel prérempli avec ISBN ; conserver un brouillon reprenable.
- [x] Vérifier les tests unitaires, PHP et navigateur.

### Task 3: Validation et livraison
**Files:** `README.md`, tests existants et documentation des limites.
- [x] Vérifier les ISBN signalés contre les services réels et les parcours mobile/bureau.
- [x] Exécuter `npm test`, `npm run test:e2e`, `npm run build`, `git diff --check`.
- [x] Revue indépendante de la branche, erreurs matérielles corrigées ; PR #11 créée et attachée.

## Progress
- Base : origin/main d22d24f ; 22 tests JS et toutes les suites PHP passent avant modification.
- Exécution dans une branche dédiée du checkout existant ; `.DS_Store` préexistant laissé hors commit.

- Revue indépendante : deux bugs reproduits puis corrigés (sélection lente et ISBN manuel modifié), tests navigateur RED → GREEN.
- Reprise après rechargement corrigée ; les quatre tests de correction passent.
- 25 tests JS et toutes les suites PHP passent, build de production validé.

- Validation finale : 29 tests navigateur passent, 25 tests JS et toutes les suites PHP passent ; syntaxe PHP et diff sans erreur.
- Les changements ne nécessitent ni migration SQL ni clé API supplémentaire.
