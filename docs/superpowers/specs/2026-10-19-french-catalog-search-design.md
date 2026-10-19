# Recherche d’éditions françaises — périmètre validé

L’audit UX du 19 octobre 2026 a été validé pour mise en œuvre et création d’une PR.
L’objectif est de retrouver l’exemplaire lu en français et de comprendre précisément
ce qui sera associé ou modifié dans la bibliothèque.

## Recherche

- Permettre ISBN et titre/auteur pour un nouvel ajout comme pour une fiche existante.
- Interroger Open Library, la BnF et le Sudoc immédiatement, afficher leurs réponses
  progressivement et distinguer absence de résultat et indisponibilité.
- Classer l’ISBN exact d’abord, puis les éditions déclarées en français, les langues
  inconnues et les autres langues. Ne pas inférer la langue depuis le pays ou l’ISBN.
- Afficher langue, format et collection lorsqu’ils sont documentés ; grouper les
  notices d’un même ISBN sans fusionner les informations contradictoires.
- Conserver la pagination indépendante et les notices déjà chargées. Sans identifiant
  d’œuvre, explorer plusieurs œuvres Open Library plutôt que la seule première.
- Effacer les anciens résultats lors d’une nouvelle requête et empêcher les réponses
  tardives de remplacer la dernière édition choisie.

## Comparaison et secours

- Avertir d’une divergence significative de titre ou auteur et exiger une confirmation
  explicite également contrôlée côté serveur. La détection reste heuristique.
- Conserver les données locales par défaut ; ne rien préremplir depuis une autre œuvre
  sans décision. Résumer les modifications et replier les champs identiques.
- Garder visibles les conflits de pagination, le choix du total et la conversion
  proportionnelle de progression ; préserver l’historique et les données personnelles.
- Offrir recherche élargie, lien de recherche Goodreads et ajout manuel prérempli
  conservant l’ISBN et les informations saisies, avec protection contre les doublons.
- Permettre de reprendre la recherche/comparaison après rechargement du même onglet.

## Contraintes et limites

Réutiliser React/PHP et le stockage bibliographique JSON existants, sans nouvelle
dépendance, clé API ou migration. Les pages ne garantissent pas toutes les éditions
publiées ; la priorité française s’applique aux notices reçues. Le stockage de
brouillon est local à la session du navigateur. Goodreads n’offre pas de nouvel accès
API officiel identifié ; le lien de secours ne prétend pas importer automatiquement
ses données. L’ajout d’une quatrième source reste conditionné à un accès réel et à
une validation de sa couverture des éditions françaises manquantes.

Les contrôles réels portent sur Daraya (`9791041426027`, retrouvé au Sudoc) et
La Clé USB (`9782707358158`, toujours absent des catalogues au 19 octobre 2026).
Ils ne permettent pas de mesurer un taux global de couverture. Les parcours de
régression utilisent une bibliothèque de test et ne modifient aucune donnée réelle.
