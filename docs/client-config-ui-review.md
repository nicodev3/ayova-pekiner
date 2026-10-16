# Revue du questionnaire client-config

## Périmètre et couverture

Revue et corrections du questionnaire `/client-config/` : navigation des quatre étapes,
champs vides, listes ajoutées et validation. Astro, TypeScript et Tailwind existants.
Convention consultée : `docs/design-fork.md`. Présentation neutre, sans ajout de marque,
et conservation de la taille des titres demandée par l’utilisateur.

| Domaine | Éléments inspectés | Résultat |
| --- | --- | --- |
| Accessibilité | Noms des champs dans l’arbre accessible, navigation, focus clavier, erreurs et listes | Libellés manquants complétés, erreurs accessibles par bouton, focus restauré |
| Mise en page | Navigation et contrôles à 320, 612 et 1280 px | Étapes visibles sans défilement horizontal, panneaux simplifiés |
| Rédaction | Instructions, validation et messages d’envoi | Consigne unique, choix invalides expliqués en français, statut intégré |
| Typographie | Contrôles et titres du questionnaire | Contrôles à 16 px mesurés, titres inchangés |
| Couleurs | Couleurs calculées des champs sur blanc | Texte 17,74:1 ; placeholders et bordures 4,83:1 |
| Finition UI | Panneaux, actions et changements d’étape | Ombres des panneaux et contrôles retirées, changement d’étape sans défilement animé |

## Constats et corrections

Les emplacements désignent les fonctions ou composants après correction.

| Sévérité initiale | Domaine | Emplacement | Avant | Après | Effet |
| --- | --- | --- | --- | --- | --- |
| HIGH | Accessibilité | `src/scripts/client-config-form.ts`, `renderBusiness`, `renderOptionalFamilyOtherList` | Affiliations et champs libres sans nom propre | Labels associés ou noms accessibles explicites | Identification des champs, WCAG 4.1.2 |
| HIGH | Rédaction | `src/scripts/client-config-form.ts:150`, `confirmRemove` | Suppression immédiate d’une entrée remplie | Confirmation avant suppression | Protection des informations saisies |
| HIGH | Accessibilité | `src/scripts/client-config-form.ts`, `setActiveTab`, `showErrors` | Défilement fluide systématique | Défilement instantané et gestion du focus | Suppression du mouvement imposé |
| MEDIUM | Mise en page | `src/scripts/client-config-form.ts:991` | Étapes en ligne débordante | Grille de deux colonnes puis quatre sur grand écran | Quatre étapes visibles sur mobile |
| MEDIUM | Accessibilité | `src/scripts/client-config-form.ts:998`, `focusField` | Liste d’erreurs statique et alerte supplémentaire | Boutons vers les champs, conservation du marquage entre étapes | Correction plus directe au clavier |
| MEDIUM | Accessibilité | `src/scripts/client-config-form.ts`, `textInput` | Coordonnées en texte générique | Types e-mail, téléphone, URL, saisie numérique et autocomplétion | Clavier et remplissage adaptés |
| MEDIUM | Rédaction | `src/lib/dev/clientConfigValidationUI.ts:258` | Certaines erreurs de choix en anglais | Instructions françaises pour métier et inscription | Action de correction explicite |
| LOW | Finition UI | `src/scripts/client-config-form.ts:107`, `src/pages/client-config.astro:10` | Panneaux ombrés, consignes doublées et pied de page public | Panneaux sobres, consigne unique et questionnaire autonome | Cohérence avec le socle minimal |

## Vérification

- `npm run check` : 76 fichiers, aucune erreur, aucun avertissement.
- `npm run build` : validation des données et génération statique réussies.
- Navigateur : les quatre étapes ont été ouvertes ; les champs du premier écran
  sont initialement vides ; une réponse saisie est conservée après aller-retour entre étapes.
- Formulaire vide : liste de validation affichée ; un bouton d’erreur de l’étape
  Cabinet & tarifs ouvre cette étape et place le focus dans Politique d’annulation.
- Ajout d’expérience : focus placé dans Poste / fonction ; confirmation observée
  lors de la suppression d’une expérience remplie.
- À 320 px : largeur du document 305 px pour une fenêtre de 320 px, sans débordement
  horizontal ; focus clavier visible sur la navigation.
- Contraste calculé à partir des valeurs effectivement rendues du premier champ :
  `rgb(17, 24, 39)` et `rgb(107, 114, 128)` sur `rgb(255, 255, 255)`.

Non vérifiés : lecteur d’écran réel, zoom à 200 %, miroir RTL, tous les champs
conditionnels, téléchargement valide complet et envoi réel Web3Forms. Cette revue
ne constitue pas une certification de conformité de l’ensemble du questionnaire.

## Verdict

**Approve** pour les éléments inspectés et corrigés ci-dessus. Les scénarios non
vérifiés restent exclus de ce verdict.
