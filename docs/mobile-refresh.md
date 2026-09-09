# Refresh mobile — 9 septembre 2026

Direction validée : React + shadcn/ui + Tailwind, Vite, ivoire / encre / orange brûlé.
Bibliothèque personnelle avec quelques prêts. Aucune modification de l’API PHP ni du schéma SQL.

## Livraison
1. Installer le socle React et les composants shadcn. Préserver les contrats HTTP existants.
2. Navigation mobile en bas et navigation latérale sur ordinateur. Routes hash avec retour navigateur.
3. Accueil : lectures en cours, progression, challenge, prêts. Catalogue : recherche, filtres, tri, étagère.
4. Fiche livre et édition avec les champs existants, ajout, suppression confirmée, notes.
5. Reprendre lectures, prêts / retours, wishlist / achat, challenge / roulette avec jokers, quiz et statistiques.
6. Livrer les assets PWA dans le build ; remplacer l’ancien cache sans promettre la synchronisation hors connexion.
7. Vérifier les contrats avec tests unitaires, puis les parcours sur API simulée et les dimensions mobiles / desktop.

## Contraintes
- API et fichiers SQL inchangés, pas de migration, pas de nouveaux champs métier.
- Développement sur API locale par défaut (aucune écriture vers la production pendant les tests).
- Le code historique reste consultable dans Git ; les parcours sont remplacés progressivement dans React.
- Les couvertures sont des compositions typographiques à partir du titre / auteur / couleur existants, pas des images inventées présentées comme officielles.
- Un échec réseau conserve le formulaire et affiche une erreur. Une mutation réussie suivie d’un échec de recharge est signalée séparément.

## Vérification
Tests API : erreurs HTTP / JSON, corps et méthodes des parcours existants.
Tests navigateur : navigation mobile, filtres, CRUD livre, progression, prêts / retours, wishlist, challenge, quiz, erreurs.
Build Vite. Vérification que api/ et schema.sql n’ont aucun diff.

## Revue de compatibilité
- Tailles conservées : 1 petit, 2 moyen, 3 grand.
- Filtres historiques cadeaux / notés et tri par année conservés.
- Quiz sur tous les livres possédés, y compris les livres lus, avec sept duels maximum.
- Pas de bouton de relecture sur un livre déjà lu : le modèle existant ne distingue pas plusieurs lectures.
- Sélection dans une modale sans soumission implicite de formulaire.
- Couleurs de reliure claires et foncées : texte contrasté automatiquement.
- Statistiques détaillées : notes, genres, cadeaux, temps estimé, auteurs lus, records, littératures et activité.

## Validation finale
- `npm test` : 10 tests réussis.
- `npx playwright test` : 11 parcours réussis, sur API interceptée (aucune écriture en production).
- Build Vite réussi ; manifeste, icônes et worker présents dans dist/.
- Vérification visuelle : accueil desktop et mobile, catalogue, panneau d’édition ; pas de débordement des statistiques détaillées à 390 px.
- Revue indépendante : problèmes de compatibilité repérés puis corrigés.
- `git diff HEAD -- api schema.sql` : aucun changement.
- Aucun déploiement effectué ; aperçu local de démonstration seulement.
