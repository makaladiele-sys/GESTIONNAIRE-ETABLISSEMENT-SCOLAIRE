# Gestion Scolaire Suite

Application SaaS de gestion scolaire multi-établissements (ERP/SIS). Un site
statique (HTML/CSS/JS, sans build) connecté à [Supabase](https://supabase.com)
pour l'authentification, la base de données et la sécurité (Row Level
Security). Déployable gratuitement sur GitHub Pages, Netlify ou Vercel.

## Fonctionnement du SaaS

- **Un compte "Super Admin"** (vous) valide les établissements qui s'inscrivent.
- **N'importe quel établissement** peut créer son compte depuis l'écran
  "Inscrire mon établissement" : il obtient un espace isolé (multi-tenant),
  visible seulement après votre validation.
- Une fois activé, l'établissement gère lui-même ses élèves, parents,
  enseignants, classes, notes, présences, paiements, caisse, bulletins et
  paramètres — sans jamais voir les données des autres établissements
  (isolation garantie par les policies PostgreSQL, pas par le code JS).

## 1. Créer le projet Supabase

1. Créez un compte sur [supabase.com](https://supabase.com) et un nouveau projet.
2. Ouvrez **SQL Editor → New query**, collez le contenu de
   [`sql/schema.sql`](sql/schema.sql) et exécutez-le. Il crée les tables,
   active la sécurité RLS et met en place le trigger d'inscription.
3. Allez dans **Project Settings → API** : notez l'**URL du projet** et la
   clé **`anon` `public`** (jamais la clé `service_role`).
4. Dans **Authentication → URL Configuration**, ajoutez l'URL où vous
   déploierez le site (ex. `https://votre-compte.github.io/votre-repo/`)
   dans *Site URL* et *Redirect URLs*.
5. Dans **Authentication → Providers → Email**, désactivez la confirmation
   par e-mail si vous voulez que les établissements accèdent immédiatement
   après inscription (sinon ils doivent cliquer le lien reçu par e-mail).

## 2. Configurer le site

```bash
cp js/config.example.js js/config.js
```

Éditez `js/config.js` :

```js
window.GSS_CONFIG = {
  SUPABASE_URL: "https://xxxxxxxx.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOi..."
};
```

`js/config.js` est listé dans `.gitignore` : vos identifiants **ne partent
jamais sur GitHub**. La clé `anon` est publique par conception — c'est la
sécurité RLS côté base de données qui protège réellement les données.

## 3. Devenir le premier Super Admin

1. Ouvrez le site, cliquez **"Nouveau ? Inscrire mon établissement"**, et
   créez un compte avec n'importe quel nom d'établissement (il sera ignoré
   pour vous).
2. Dans Supabase → **SQL Editor**, exécutez (en remplaçant l'e-mail) :

   ```sql
   update public.profiles set role = 'platform_admin', school_id = null
   where email = 'vous@example.com';
   ```
3. Reconnectez-vous : le menu **"Super Admin"** apparaît. Vous pouvez
   désormais activer ou suspendre les établissements qui s'inscrivent.

## 4. Déployer sur GitHub (+ hébergement gratuit)

```bash
git init
git add .
git commit -m "Gestion Scolaire Suite"
git branch -M main
git remote add origin https://github.com/VOTRE-COMPTE/VOTRE-REPO.git
git push -u origin main
```

Puis choisissez un hébergeur statique :

- **GitHub Pages** : Settings → Pages → Deploy from branch → `main` / `/ (root)`.
- **Netlify** : "Add new site" → "Import an existing project" → connectez le
  repo, laissez la config par défaut (aucun build requis).
- **Vercel** : "New Project" → importez le repo → Framework Preset:
  *Other* → Deploy.

N'oubliez pas d'ajouter l'URL finale dans Supabase (étape 1.4) pour que les
liens de connexion/réinitialisation fonctionnent.

> ⚠️ Comme `js/config.js` n'est pas versionné, il n'existera pas sur votre
> hébergeur après un simple `git push`. Deux options :
> - Le plus simple : retirez `js/config.js` de `.gitignore` et commitez-le
>   (acceptable ici car la clé `anon` est publique par nature).
> - Plus propre : configurez une variable d'environnement / "Snippet
>   injection" côté Netlify/Vercel qui génère ce fichier au build, ou
>   déposez-le manuellement sur l'hébergeur.

## 5. Structure du projet

```
index.html              Coquille de l'application (pages, modales, gate d'auth)
css/styles.css           Système de design (couleurs, typographie, responsive)
js/
  config.example.js      Modèle de configuration Supabase
  config.js               ← vos identifiants (non versionné)
  supabaseClient.js       Initialisation du client Supabase
  state.js                État partagé + helpers CRUD génériques
  auth.js                 Connexion, inscription, mot de passe oublié
  ui.js                   Toasts, modales, navigation, sidebar responsive
  app.js                  Point d'entrée : routage et cycle de vie
  modules/                Un fichier par module métier (élèves, notes, …)
sql/schema.sql            Schéma PostgreSQL + policies RLS + trigger d'inscription
```

## 6. Modèle de données (résumé)

- `schools` — un établissement = un tenant (`status`: pending / active / suspended).
- `profiles` — un utilisateur Supabase Auth = un profil, rattaché à `school_id`
  et un `role` (`platform_admin`, `admin`, `secretary`, `accountant`,
  `teacher`, `parent`, `student`).
- `students`, `parents`, `teachers`, `classes`, `subjects`, `grades`,
  `attendance`, `payments`, `expenses`, `messages` — toutes scopées par
  `school_id` et protégées par RLS (`sql/schema.sql`, section 8).

## 7. Ajouter d'autres utilisateurs à un établissement

La création d'un compte secrétaire/comptable/enseignant depuis le
navigateur nécessiterait la clé `service_role`, qui **ne doit jamais** être
exposée côté client. Deux approches sûres :

- Depuis Supabase → **Authentication → Users → Invite user**, en renseignant
  `school_id` dans les métadonnées utilisateur (comme le fait l'inscription
  publique) puis en ajustant le `role` dans `profiles`.
- Ou une **Supabase Edge Function** protégée qui utilise la clé
  `service_role` côté serveur pour créer l'utilisateur et son profil.

## 8. Aller plus loin

- **SMS / WhatsApp / e-mail réels** (page Communication) : branchez un
  provider (Twilio, Wave, Infobip…) via une Supabase Edge Function déclenchée
  à l'insertion dans `messages`.
- **Sauvegardes** : Supabase effectue des sauvegardes automatiques sur les
  plans payants ; pensez à activer *Point in Time Recovery* en production.
- **Multi-année scolaire** : dupliquez `current_academic_year` dans les
  tables pédagogiques si vous voulez conserver l'historique d'une année sur
  l'autre (actuellement, seules les données de l'année courante par
  établissement sont modélisées, pour rester simple).

---

Construit à partir d'un prototype HTML unique, réorganisé en une base de
code modulaire, sécurisée par ligne (RLS) et prête pour la production.
