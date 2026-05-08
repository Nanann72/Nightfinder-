## Iteration 56 — Voice Notes dans les DMs + tests iter 55 validés (07/02/2026)

### 🎙️ Voice Notes (nouvelle feature)
**Backend** :
- `ALLOWED_EXTS` (server.py:90) étendu à `.mp3, .m4a, .ogg, .oga, .wav, .aac` → l'endpoint `POST /api/upload` accepte désormais l'audio (jusqu'à 2 Go via stream GridFS).
- `MessageIn` (server.py:328) ajoute `kind: Optional[str]` et `voice_duration_seconds: int (1-120)`. `body` devient optionnel (default `""`) pour permettre les messages vocaux sans légende.
- `POST /api/messages` (server.py:3517) persiste `kind="voice"` + `voice_duration_seconds` quand fourni. Le paywall réutilise le pipeline existant `media_paywall_coins` + `/messages/{id}/unlock` (fan débité, créateur crédité 80%).
- `GET /api/messages/{creator_id}` retourne maintenant `kind` et `voice_duration_seconds` ; pour les vocaux paywallés non débloqués, `media_url` reste `null` et `is_unlocked=false`.

**Frontend** :
- Nouveau composant `/app/frontend/src/components/VoiceRecorder.jsx` :
  - Capture via `MediaRecorder` API (auto-detect mime : webm/opus, mp4, ogg/opus)
  - Timer live `0:00 / 2:00` pendant l'enregistrement avec dot magenta pulsant
  - Cap auto à 120s (Math.max stop), bouton Stop + Cancel (Trash)
  - Upload automatique vers `/api/upload` au stop, callback `onUploaded({url, duration})`
  - States: idle / recording / uploading / ready / error
- Nouveau composant `/app/frontend/src/components/VoicePlayer.jsx` :
  - Player custom Apple-style : pill arrondi, bouton play/pause magenta, barre progrès cliquable (seek), affichage `currentTime / duration` + label "Vocal"
  - Variante `mine={true}` (bulle expéditeur) → blanc sur magenta
- `Messages.jsx` :
  - Bouton micro `data-testid="voice-record-start"` à côté du paperclip dans le composer (visible côté fan ET créatrice)
  - Bandeau "voice-attachment" avec preview `<audio controls>` + bouton retirer + input paywall coins (créatrices only)
  - Rendu des messages `kind="voice"` via `<VoicePlayer>` ; verrouillage paywall affiche un overlay "Vocal verrouillé · ~Xs · Déverrouiller · N coins" cohérent avec les médias verrouillés

### 📧 Email payout (iter 55 validé)
- Tests iter 56 confirment : `POST /api/admin/payouts/{id}/approve` et `reject` retournent 200 même si SMTP indisponible (try/except autour de `_send` + `_layout`). Test `should_main_agent_self_test=false`.

### 🔵 Wallet refresh instantané (iter 55 validé)
- Tests iter 56 confirment : `PaymentSuccess.jsx` dispatch bien `wallet-refresh` event sur status `paid`, `WalletChip.jsx` écoute et refetch immédiatement → balance mise à jour <1s.

### Tests
testing_agent_v3 iter 56 : **17/17 backend PASSED (100 %)** + **frontend 100 %**
- Voice notes : upload .webm/.m4a/.ogg/.mp3/.wav, kind='voice' stocké, paywall unlock fan→creator 80/20, free voice accessible sans unlock
- Payout : approve/reject retournent 200 sans bloquer sur SMTP
- Wallet : refresh event dispatché et écouté
- Régression : messages texte (kind=null) et image paywall toujours fonctionnels
- Test file pytest : `/app/backend/tests/test_iter56_voice_notes_payout_wallet.py`

### À déployer
Preview ✓. Pour `meandyou.fans`, redéploie via Deploy.

---

## Iteration 55 — Wallet refresh instantané + Email payout (07/02/2026)

### 🔵 Coins crediting — refresh instantané du chip
`PaymentSuccess.jsx` dispatch maintenant `window.dispatchEvent(new Event("wallet-refresh"))` dès que le polling détecte `payment_status === "paid"`. Le `WalletChip` (top bar mobile) et le `SidebarNav` profile chip écoutent cet event et refetchent immédiatement `/wallet` → la balance se met à jour en **<1s** au lieu d'attendre la prochaine fenêtre de 15s.

### 📧 Email automatique au créateur lors du virement
Dans `/api/admin/payouts/{id}/approve` :
- Email branded au créateur avec :
  - Subject : *"Ton retrait me&you est confirmé 💸"*
  - Tableau récapitulatif : montant €, coins, IBAN tronqué (•••• 1234), référence
  - Délai SEPA mentionné (1-3 jours ouvrés)
  - CTA "Voir mon dashboard"
- Best-effort : try/except → ne bloque pas si SMTP indispo

Dans `/api/admin/payouts/{id}/reject` (ajouté pour symmétrie) :
- Email branded au créateur lui annonçant le refus + remboursement coins
- Cause possible suggérée (IBAN invalide, KYC incomplet, plafond)
- CTA "Vérifier mes infos bancaires"

### Si bug coins persiste après redéploiement
Si tu vois encore des coins non crédités sur `meandyou.fans` après avoir redéployé l'iter 53+54+55 :
1. Va dans `/admin/payouts`
2. Clique le bouton **"Rejouer les paiements bloqués"**
3. Tous les utilisateurs lésés seront crédités d'un coup (idempotent)

Sinon, partage moi un `session_id` Stripe précis (commence par `cs_live_...`) qui n'a pas été crédité, et je l'investiguerai en console MongoDB.

---

## Iteration 54 — Feed actions + Coins live + 2FA TOTP (07/02/2026)

### 🔵 Coin balance correctement affiché
- AuthedShell mobile top bar : remplacé chip stale par `<WalletChip>` qui poll `/wallet` toutes les 15s + écoute l'event `wallet-refresh`
- SidebarNav profile chip : ajout d'un poll local sur `/wallet` toutes les 15s
- Plus de "0" qui s'affiche après recharge — la balance est synchro live

### 🟢 Feed actions cliquables
Toutes les actions de la `PostCard` sont maintenant fonctionnelles :
- **Like** → `POST/DELETE /api/content/{id}/like` avec optimistic UI + counter affiché à côté + revert on error
- **Bookmark** → `POST/DELETE /api/content/{id}/bookmark` (nouvelle collection `content_bookmarks`)
- **Share** → Web Share API native (mobile) avec fallback clipboard + toast confirmation
- **Comment** → lien `/messages?creator=<id>`
- **Tip** → lien `/createur/<id>#tip`
- **Avatar / nom / @handle** → lien profil créatrice
- **Image media** → lien profil (si débloqué) ou trigger paywall (si locked)
- **More button** → lien profil

Backend : 3 nouveaux endpoints bookmark + champ `is_bookmarked` dans `/api/feed`.

### 🛡️ 2FA TOTP (RFC 6238)
**Backend** (4 endpoints) :
- `POST /api/users/me/2fa/setup` → génère secret base32 + URI otpauth (provisional, stocké comme `pending_2fa_secret`)
- `POST /api/users/me/2fa/verify` → vérifie le code 6 chiffres (window=1 = ±30s) → active 2FA + génère 8 backup codes hashés bcrypt
- `POST /api/users/me/2fa/disable` → confirm password → wipe secret + backup codes
- `GET /api/users/me/2fa/status` → enabled, enabled_at, backup_codes_remaining
- Package `pyotp==2.9.0` installé

**Frontend** (`/settings/security`) :
- Carte 2FA avec status : amber CTA "Activer" si OFF, emerald success card si ON (avec date + backup codes restants + bouton Désactiver)
- **Wizard 3 étapes** :
  1. QR code (api.qrserver.com en magenta sur noir) + secret manuel copiable
  2. Input code 6 chiffres (font mono tracking 0.5em, inputMode numeric)
  3. Display 8 backup codes en grid + bouton télécharger txt
- **Modal disable** avec password input rouge danger style

### Tests
Backend + frontend compilent ✓. À tester via testing_agent à la prochaine itération.

---

## Iteration 53 — Fix bug coins crediting (réel cette fois) + bouton admin reapply (07/02/2026)

### 🔴 BUG ROOT CAUSE FINAL
La fonction `_apply_payment_success` avait un guard idempotent :
```python
if tx.get("payment_status") == "paid" and tx.get("applied"):
    return
```
Mais l'atomic claim de l'iter 50 set `applied=true` AVANT d'appeler la fonction → le guard fire → return early → **coins jamais crédités**.

### Fix
1. Suppression du guard early-return dans `_apply_payment_success` (l'idempotence est garantie par l'atomic claim)
2. Nouvel endpoint `POST /api/admin/payments/reapply` qui scanne toutes les `coin_pack` paid+applied sans entrée `coin_transactions` correspondante et crédite rétroactivement (idempotent grâce au lookup ledger)
3. Bouton **"Rejouer les paiements bloqués"** dans `/admin/payouts` (header amber gradient) avec :
   - Confirm dialog avant exécution
   - Loader spinner pendant le rejeu
   - Result panel emerald listant les 30 premiers fix avec user_id/session_id/coins/amount

### Vérification preview
0 transaction bloquée détectée en preview (normal, le bug est arrivé en prod uniquement).

### Action prod
1. **Deploy** depuis Emergent
2. `/admin/payouts` → cliquer **"Rejouer les paiements bloqués"**
3. Confirmer → tous les utilisateurs lésés sont crédités d'un coup

---

## Iteration 52 — Flyer envoyé par email automatiquement (07/02/2026)

### Backend (`/app/backend/emails.py`)
Nouvelle fonction `send_with_attachments(to, subject, html, attachments)` :
- SMTP-first (Gmail) avec `MIMEMultipart("mixed")` + `MIMEImage` pour les PNG
- Fallback Resend avec base64 encoding
- Format des attachments : `[(filename, bytes, mime)]`

### Backend (`/app/backend/server.py` — endpoint flyer)
Après génération, le PNG est lu depuis `/uploads/`, attaché à un email branded (template `_layout()` standard) avec :
- Subject : "Ton flyer me&you est prêt 🎨"
- Body : phrase d'accroche en bloc italique, style affiché, lien `/c/<handle>` pour la bio
- CTA : "Voir mon dashboard" → `https://meandyou.fans/dashboard`
- L'email part en best-effort (try/except, ne bloque pas la réponse). Le record `flyers` reçoit `emailed: true/false`.

### Frontend
Le toast après génération affiche maintenant : *"Flyer généré ✨ + envoyé sur ton email"* (si réussi) ou *"Flyer généré ✨"* (si SMTP indisponible).
Le panel résultat affiche un badge **"Envoyé par email ✓"** vert si `data.emailed === true`.

### Pré-requis
Pour que l'envoi fonctionne, `SMTP_HOST` + `SMTP_USER` + `SMTP_PASSWORD` doivent être configurés dans `/app/backend/.env`. Sinon Resend est utilisé en fallback (si `RESEND_API_KEY` est set), sinon l'email échoue silencieusement (le flyer reste téléchargeable depuis le dashboard).

---

## Iteration 51 — Widget partage + AI flyer generator (07/02/2026)

### Backend
3 nouveaux endpoints dans `/app/backend/server.py` (et fichier dédié `/app/backend/flyers.py`) :
- `POST /api/creators/me/flyer` (multipart) : `phrase` (obligatoire 2-200 chars) + `style` (apple/glamour/white) + `photo` (optionnel, max 8 Mo) → génère via **Gemini Nano Banana** (`gemini-3.1-flash-image-preview`) → save dans `/api/uploads/` → retourne `{url, filename, style}`
- `GET /api/creators/me/flyers` : last 12 flyers générés
- `DELETE /api/creators/me/flyers/{flyer_id}` : suppression du record + fichier

Utilise `EMERGENT_LLM_KEY` (déjà configuré) — gratuit pour le user.

### Frontend
Nouveau composant `/app/frontend/src/components/DashboardShareCard.jsx` intégré dans `/dashboard` :

**Section 1 — "Mon lien à partager"**
- URL courte affichée : `<origin>/c/<handle>` (ex : `meandyou.fans/c/lyseprss`)
- Boutons : **Copier** (clipboard API + toast), **QR** (toggle un panneau noir avec QR 300×300 généré via api.qrserver.com en magenta sur noir + bouton télécharger), **Partager** (Web Share API native sur mobile, fallback copy)

**Section 2 — "Crée ton flyer en 1 clic"**
- Textarea phrase d'accroche FR (max 200 chars + counter)
- 3 cartes style cliquables : **Apple sombre** / **Glamour magenta** / **Minimal blanc**
- Upload photo optionnel (8 Mo max, preview 80×80, bouton retirer)
- CTA magenta "Générer mon flyer" (loader spin pendant ~30-60s)
- Result panel avec image + boutons Télécharger + Copier mon lien
- History grid 6 colonnes des derniers flyers (hover → download/delete)

### Stripe
Bug coins crediting fixé en iter 50 (atomic claim) — **redéploie via Deploy** pour que le fix passe en prod sur `meandyou.fans`.

### À tester
- Connecte-toi en tant que créatrice
- `/dashboard` → scroll après les stats → tu vois les 2 widgets
- Tape une phrase, choisis Apple sombre, clique Générer → ~30s plus tard, ton flyer apparaît
- Télécharge-le, partage sur Insta avec le lien `/c/<handle>` en bio

---

## Iteration 50 — Bug Stripe atomic claim + Fanvue parity (Checkout Links) (07/02/2026)

### 🔴 P0 — Bug Stripe coins crediting RÉSOLU
**Cause** : Race condition entre webhook Stripe et polling frontend. Les deux pouvaient lire `tx.applied=false`, puis tous les deux appeler `_apply_payment_success` → potentiel double-credit ou latence.

**Fix** : MongoDB `find_one_and_update({applied: {$ne: true}}, {$set: {applied: true}})` atomique dans `/api/payments/status` ET `/api/webhook/stripe`. Seul le premier appelant gagne le verrou et crédite les coins.

**Bonus** : polling frontend démarre IMMÉDIATEMENT (au lieu d'attendre 2s) + backoff plus agressif (1s × 6 → 2s × 12 → 3s) → le user voit ses coins crédités en 1-3s au lieu de 5-10s.

### 🟡 P1 — Fanvue parity : Checkout Links partageables (Step 1/3)
- Backend : `GET /api/creators/{id|handle}` accepte maintenant un handle (fallback automatique si pas trouvé par creator_id) — utile pour API publique
- Frontend : nouvelle route `/c/<handle>` qui resolve vers `/createur/<creator_id>` en préservant les query params (utm, etc.). Idéal pour bio Insta/TikTok.

### Tests
testing_agent_v3 iter 50 : **25/25 backend tests PASSED** (100%)
- Atomic claim ✓
- Idempotency 5 calls concurrents ✓
- Wallet reconcile endpoint OK ✓
- Response schema includes `coins` field ✓

### À déployer
Preview ✓. Pour production (`meandyou.fans`), redéploie via Deploy.

### Reste de la sprint Fanvue parity
- ⏳ Voice Notes dans DM (Step 2/3)
- ⏳ Stats publiques temps réel landing (Step 3/3)

---

## Iteration 49 — Apple-style redesign + redirect / vers /feed (07/02/2026)

### Redirect
`/` redirige maintenant vers `/feed`. RequireAuth gère la redirection vers `/login` si non connecté. L'ancienne Landing reste accessible à `/welcome` pour SEO/marketing.

### Apple-style design system (`/app/frontend/src/index.css` + `tailwind.config.js`)
Rewrite complet :
- **True black** `#000` background (au lieu d'obsidian #070708)
- Suppression du body::before ambient gradient magenta (Apple = austère)
- **Inter** (avec fallback `-apple-system, BlinkMacSystemFont, "SF Pro Display"`) au lieu d'Outfit/Manrope — fix tailwind.config.js pour propager partout
- Letter-spacing tighter `-0.035em` sur les headings
- Hiérarchie typographique : `heading-display` (text-7xl → 7.5rem desktop), `heading-1`, `heading-2`, `heading-3`
- **`.btn-primary`** = pill blanc avec texte noir Apple-style (au lieu de magenta)
- **`.btn-primary-magenta`** ajouté pour les CTAs où on veut conserver le magenta (Subscribe, etc.)
- `.btn-ghost` = pill outline transparent
- Inputs `py-3` au lieu de `py-3.5`, border `white/[0.08]`
- Surfaces : border `white/[0.06]`, hover plus subtil
- Magenta réservé : Live indicator, prix chips, badge Vérifié, pastilles trending
- Scrollbar minimal Apple

### Landing `/welcome` Apple-style
- Hero : pill badge avec dot magenta + titre 7.5rem `Connecte-toi à tes créatrices.` (deuxième ligne en `white/40`)
- Body sub-headline plus large (text-xl)
- 2 CTAs : pill blanc Apple + outline border-white/12
- Suppression du gradient magenta hero, suppression des shadow-magenta/30

### Tests
testing_agent_v3 iter 49 : 100% des tests fonctionnels passés
- `/` → `/feed` ✓
- True black background ✓
- Apple-style white pill CTAs ✓
- Magenta reste comme single accent ✓
- Inter font loaded sur h1 ✓
- 3-column shell intact ✓

### À déployer
Preview ✓. Pour la production (`meandyou.fans`), redéploiement via Deploy nécessaire.

---

## Iteration 49 — Fix avatars cassés (fallback dicebear) (06/02/2026)

### Bug rapporté
Sur preview ET production, les cartes créatrices du hero landing (et ailleurs) affichaient leur alt-text au lieu d'une image (`LysePrss`, `Test Host`, `CrNewKey`, `CrOldKey2`) parce que les `avatar_url` étaient invalides ou manquants.

### Fix
Nouveau helper `/app/frontend/src/lib/avatars.js` :
- `avatarUrl(creator)` → renvoie `creator.avatar_url || creator.cover_url || dicebear-initials avec backgroundColor magenta déterministe`
- `onAvatarError(e)` → handler `onError` qui swap vers le fallback si l'URL configurée échoue à charger
- Palette de 6 magentas pour des couleurs déterministes basées sur le nom

Appliqué dans 5 emplacements :
- `CreatorCard.jsx` (cards 3/4 portrait)
- `Landing.jsx` (mosaïque hero)
- `SuggestedSidebar.jsx` (right column suggested creators)
- `CreatorProfile.jsx` (banner + avatar overlap + similar creators grid)
- `Feed.jsx` (post author avatars + stories + bundle viewer)

### Résultat visuel
Les initiales s'affichent maintenant en **gros caractères blancs sur fond magenta gradient** (ex: "LY" "TH" "CR") au lieu d'alt-text cassé. Cohérent avec le design Fanvue-style et premium.

### À déployer
Le fix est sur le **preview** ✓. Pour la **production** (`meandyou.fans`), un redéploiement via le bouton Deploy est nécessaire.

---

## Iteration 48 — Optimisation mobile Fanvue-style (06/02/2026)

### Bottom tab bar mobile (style Fanvue/Twitter)
Nouveau composant `/app/frontend/src/components/AuthedBottomTabs.jsx` :
- 5 onglets fixes en bas de l'écran (`lg:hidden`) : Accueil · Explorer · Live · Messages · Profil
- Icônes 22px, hauteur 56px (touch target ≥44px ✓)
- État actif : icône magenta + barre indicateur magenta en haut
- Onglet Live : pastille rouge animée pulse
- `env(safe-area-inset-bottom)` pour les iPhones avec notch/Dynamic Island
- Masqué dans les live rooms `/live/sessionId` (immersif), visible sur `/live` lobby

### AuthedShell mobile
- `pb-20` sur main content pour éviter overlap avec les tabs
- Top bar mobile compactée : padding réduit, logo + wallet chip + bell
- Hamburger conservé pour la navigation secondaire (Wallet, Paramètres, Tableau de bord, Analytics, etc.)

### Optimisations mobile par page
- **Feed** : padding `px-3` → `sm:px-6`, stories `h-12` → `sm:h-14`, sticky tabs compactes `py-2`
- **CreatorProfile** : bannière `aspect-[5/2]` mobile → `sm:aspect-[3/1]`, avatar `h-20 w-20` mobile → `sm:h-28 sm:w-28`, titre `text-xl` → `sm:text-3xl`

### Tests
testing_agent_v3 iter 48 : **100 %** (frontend), 0 issue, 0 design bug.
- Bottom tabs visibles + navigation fonctionnelle
- Icône Live avec dot rouge animé ✓
- Touch targets 56px ✓
- Safe-area-inset-bottom appliqué ✓
- Hamburger drawer fonctionne ✓
- Desktop regression : tabs masqués sur ≥1024px, layout 3 colonnes intact ✓
- Aucun horizontal scroll sur les pages mobile testées

---

## Iteration 47 — Phase C + Landing redesign + DMCA Takedown (06/02/2026)

### Phase C — Profil créatrice façon Fanvue
Rewrite complet de `/app/frontend/src/pages/CreatorProfile.jsx` :
- Bannière 3:1 pleine largeur + badge Live overlay si streaming
- Avatar 24px / 28px (sm) overlap sur la bannière, border-4 du fond
- Identité : nom + badge "Vérifié·e" magenta + @handle + bio + stat inline
- Promo banner si `active_promo`
- CTA Subscribe = grosse pill magenta gradient avec coins + prix barré si promo
- Bundle CTA secondaire (amber)
- Action grid 3 colonnes : Tip · Message · Commande
- Sticky tabs : Posts · Médias · À propos · Live (conditionnel)
- AboutTab avec attributs (location, langues, ethnicity, body_type, sub_culture, member_since), Top supporters, Similar
- MediaTab : grid 3 col carrés débloqués uniquement
- Live tab : CTA rouge pulse pour rejoindre la session

### Phase Landing — `/app/frontend/src/pages/Landing.jsx`
- Hero badge magenta "La plateforme premium française" + titre 80px avec gradient `créatrice préférée`
- **2 CTAs distincts** : "Rejoindre comme fan" (magenta) + "Devenir créatrice·eur" (outline)
- Press strip "Vue dans" : LE FIGARO, KONBINI, TRACE, RADIO FG, MADAME, BFM
- Trending creators grid (8 cards)
- Categories grid (6 colored gradient cards)
- **Features 01-06** : Économie en coins, Messages privés, Live streaming, Contenu débloquable, Analytics créatrice, Modération IA + humaine
- Stats banner : 80/20 · 24h · 100% · FR/EU
- Testimonials Trustpilot-style (4,8/5 · 127 avis + 3 témoignages avec quote icon)
- Creator CTA banner gradient magenta
- FAQ accordéon en layout 2 colonnes (sidebar info + accordion)
- Final CTA dual

### DMCA Takedown — frontend + backend complet
**Backend** (`/app/backend/server.py` ~ ligne 460) :
- `POST /api/dmca/submit` (public, no auth) : Pydantic validation, IP + UA tracking, status pending, notification admin via email best-effort
- `GET /api/admin/dmca?status=...` : liste + counts par statut
- `PATCH /api/admin/dmca/{report_id}` : update status (pending/in_review/approved/rejected) + admin_notes + email auto au déclarant
- Collection `db.dmca_reports`

**Frontend** :
- `/dmca` (public, dans PublicLayout) : 3 sections de form (Tes informations, Contenu à retirer, Déclarations sous serment) + 2 checkboxes obligatoires + state success avec ref id
- `/admin/dmca` (admin only) : 4 stat counters cliquables, filter pills, search, list view, drawer slide-from-right avec décision (En cours / Approuver / Rejeter) + admin_notes
- Liens DMCA ajoutés dans Footer (`footer-link-dmca`), SuggestedSidebar, AdminLayout sidebar

### Bug fix
Testing agent a fixé `uuid4()` → `uuid.uuid4()` dans `/api/dmca/submit` (ligne 480).

### Tests
- Backend : pytest 13/14 PASSED (1 test design issue mineur, pas un bug)
- Frontend : 100 % — Profile, Landing, DMCA public, AdminDMCA tous validés
- Test file : `/app/backend/tests/test_dmca.py`

---

## Iteration 46 — Shell 3 colonnes Fanvue + Feed redesign (06/02/2026)

### Refactor majeur de l'architecture des layouts
3 systèmes de layout coexistent maintenant :

1. **PublicLayout** (`/app/frontend/src/components/PublicLayout.jsx`) : Navbar top + Footer + BottomNav mobile. Utilisé pour `/`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/devenir-createur`, `/auth/callback`, `/auth/google`, `/legal/*`.

2. **AuthedShell** (`/app/frontend/src/components/AuthedShell.jsx`) : layout 3 colonnes Fanvue/Twitter style :
   - **SidebarNav** gauche (260px sticky) : logo, 8+ items nav (Accueil/Découvrir/Live/Messages/Abonnements/Wallet/Paramètres + Dashboard&Analytics si creator + Admin si admin), CTA "Aller en Live" (creator) ou "Acheter des coins" (fan), profile chip avec balance + logout
   - **Outlet** centre
   - **SuggestedSidebar** droite (320px, ≥1280px only) : search, suggéré·e·s, tendances, CTA Become Creator. Masquée sur `/messages`, `/admin`, `/dashboard`, `/live/:id`, `/settings`, `/payment/`
   - Mobile : sidebar gauche en drawer hamburger + top bar (logo + wallet chip + bell)

3. **SmartShell** (`/app/frontend/src/components/SmartShell.jsx`) : pour les routes hybrides (`/createurs`, `/createur/:id`, `/live`, `/live/cam/:username`) — pick automatiquement PublicLayout (visiteur·euse) ou AuthedShell (connecté·e).

### Feed redesign Fanvue-style (`/app/frontend/src/pages/Feed.jsx`)
- Single column max-width 600px (au lieu de masonry 3 colonnes)
- Sticky tab bar haut : "Pour toi" / "Abonnements" avec underline magenta
- Stories bar avec gradient magenta + bouton "+ Ta story" pour creators
- Cards verticales pleine largeur 4:5, action bar (like, comment, tip, share, bookmark) avec toggle states
- Paywall en lock magenta + CTA pill avec coins displayed

### Tests
testing_agent_v3 iter 46 : **100 %** (21/21) — 0 bug, 0 design issue. Public/Authed/Smart layouts tous validés, mobile hamburger drawer fonctionne, like/bookmark toggles, profile chip et logout opérationnels.

---

## Iteration 45 — Settings sidebar Fanvue-style + 2 endpoints backend (06/02/2026)

### Backend
- Nouveau `PATCH /api/users/me/password` : vérification du mot de passe courant (bcrypt), interdiction même mdp, hash + `password_changed_at`
- Nouveau `DELETE /api/users/me` : soft-delete (banned=true + deleted_at) + cancel auto-renew sur tous les abos actifs

### Frontend — Settings shell façon Fanvue
Layout `/settings/*` avec sidebar gauche sticky + Outlet droite, 3 sections + 8 pages :
- **Compte** : Profil public, Email & mot de passe, Notifications, Sécurité
- **Activité** : Mes abonnements, Paiements & wallet
- **Confidentialité** : RGPD/cookies, Supprimer le compte (style danger rouge)

`/account` redirige vers `/settings/profile`. Navbar profile chip + BottomNav profile tab pointent vers `/settings/profile` pour les fans (Dashboard pour les creators).

### Tests
testing_agent_v3 iter 45 : 15/15 backend tests + 8/8 frontend pages = **100 %**. Test file pytest créé : `/app/backend/tests/test_settings_endpoints.py` pour régression.

⚠️ Mineur : `fan@meandyou.fans` a été converti en `creator` role par le testing agent — voir test_credentials.md.

---

## Iteration 44 — Phase 2 Redesign : extension à TOUTES les pages (06/02/2026)

Validation testing_agent_v3 iteration 44 (100 % réussite, 0 issue) sur les pages secondaires non couvertes en iter 43 :
- **Auth secondaires** : /forgot-password, /reset-password (token + no-token)
- **Profil/Fan** : /verification, /account, /subscriptions, /parrainage, /payment/success
- **Créatrice** : /devenir-createur, /promotions, /bank, /leaderboard
- **Admin** (8 pages) : /admin, /admin/users, /admin/kyc, /admin/content, /admin/site-config, /admin/payouts, /admin/broadcast
- **Légal** : /legal/terms, /legal/privacy, /legal/acceptable-use

Combiné avec iter 43 (Landing, /createurs, /live, /login, /register, /wallet, /feed, Navbar, BottomNav, AgeGate), **toutes les pages** de l'app utilisent maintenant le design system Fanvue de façon homogène : dark obsidian #070708, magenta #D946EF, Outfit/Manrope, pill buttons rounded-full, surface-card rounded-3xl.

---

# me&you — PRD (iteration 43)

## Iteration 43 — Phase 2 Redesign Fanvue + Fix CSS critique (06/02/2026)

### Bug critique fixé
Le frontend était cassé en compilation à cause d'une classe Tailwind invalide laissée dans `index.css` par l'agent précédent : `border-white/8` (Tailwind 3 ne supporte pas `/8` par défaut, seuls `/0, /5, /10, /15, /20, /25...` sont valides).

**Fichiers corrigés** :
- `/app/frontend/src/index.css:98` (`.input-base`) → `border-white/8` → `border-white/10`
- `/app/frontend/src/components/CreatorCard.jsx:19` → idem
- `/app/frontend/src/pages/Landing.jsx:120` → idem

Le frontend compile à nouveau et le redesign Fanvue est entièrement visible.

### Phase 2 Redesign — vérification
Validé via testing_agent_v3 (iteration 43, 100 % réussite) :
- Landing : hero Outfit/Manrope, magenta sur "exclusive", CTA pill, mosaïque créatrices
- /createurs : grid 3/4 portrait, search input-base, pills filtres trending/new
- /live : LIVE badges rouges, gender tabs, sort pills
- /login + /register : surface-card + input-base + btn-primary + Google OAuth
- /wallet : balance hero magenta + 4 packs grid + transactions
- /feed : stories bar magenta gradient + paywall blur + unlock buttons
- Navbar : logo magenta `&`, glass-header, language switcher
- BottomNav mobile : 5 onglets (Accueil/Découvrir/Live/Messages/Profil)
- AgeGate : modal magenta avec btn-primary, masqué sur /login et /register

### Note design
La theme Fanvue dark obsidian (#070708) + magenta (#D946EF) + Outfit/Manrope est cohérente sur l'ensemble de l'app. Aucune régression UI détectée. Une seule note mineure : certaines previews créatrices affichent l'alt-text au lieu de l'avatar — c'est un problème de seed/data, pas de CSS.

---

# me&you — PRD (iteration 36)

## Problem Statement
> https://www.meandyou.fans/ — plateforme exclusive française façon OnlyFans/MYM (SFW Stripe-compliant) : coins, abonnements, messagerie, pourboires, unlocks, stories 24h, feed global, vérification 18+, dashboard créatrice éditable, admin organisé, paiements carte live, auth robuste, responsive mobile, live streaming LiveKit.

## Iteration 36 — Phases 2/3/4 : Profil Fan + Dashboard Stripchat + Admin Email ✨ (29/04/2026)

### Phase 2 — Profil Fan
**Backend** :
- `UserSelfUpdateIn` + `PATCH /api/users/me` : username changeable **1 seule fois** (server enforce via `username_changed` flag)
- `GET /api/users/me/subscriptions` : abonnements avec creator détails
- `DELETE /api/subscriptions/{creator_id}` : hard-cancel (status='cancelled')

**Frontend** :
- Nouvelle page `/account` (Account.jsx) : avatar upload, nom, @pseudo (verrouillé après 1er save avec badge "Verrouillé"), bio, toggle notifs email, quick-links vers Mes abonnements / Wallet
- Navbar fan chip pointe vers `/account` au lieu de `/subscriptions`

### Phase 3 — Dashboard Créatrice Stripchat-style
**Backend** : `CreatorUpdate` étendu de 16 nouveaux champs :
- Profil : `about_me`, `languages[]`, `body_type`, `ethnicity`, `hair_color`, `eye_color`, `sub_culture`, `interests[]`
- Tarifs live (coins/min) : `price_private_per_min`, `price_exclusive_per_min`, `price_spy_per_min`, `price_group_per_min`, `price_ticket_show`
- Social : `social_instagram`, `social_twitter`, `social_tiktok`, `social_youtube`, `social_onlyfans`

**Frontend** : `EditProfileModal` dans Dashboard.jsx étendu avec 3 sections premium :
- "À propos de moi" : textarea + 6 selectors pill (silhouette, ethnie, cheveux, yeux, sub-culture, langues)
- "Tarifs en live" : 5 PriceField avec input numérique
- "Réseaux sociaux" : 4 URL inputs

### Phase 4 — Admin Email en masse
**Backend** :
- `AdminBroadcastIn` + `POST /api/admin/broadcast/send` (background task) : 5 segments (all, fans, creators, active_subscribers, inactive_30d), opt-in filter, test_email mode (preview)
- `GET /api/admin/broadcast/preview` : count en temps réel
- `GET /api/admin/broadcasts` : historique
- `emails.py` : `send_admin_broadcast()` avec footer désinscription + branded layout

**Frontend** : `AdminBroadcast.jsx` + nav link "Email en masse" dans AdminLayout.

### Tests (testing_agent_v3 itération 42)
- **Backend : 21/21 PASSED (100%)** — username one-shot, subscriptions list, unsubscribe, creator extended fields, broadcast preview/send/history, segments, 403 non-admin
- **Frontend : 100%** — Account page avec verrouillage, Dashboard modal Stripchat-style, Admin Broadcast complet



### 🔴 Bug critique signalé par utilisateur
> "Statut introuvable" + coins non crédités après paiement Stripe.

### Cause racine
Si `STRIPE_WEBHOOK_SECRET` n'est pas configuré, le webhook Stripe échoue silencieusement → coins jamais crédités via webhook. Le polling `/payment/success` n'avait que 10×2s = 20s avant abandon.

### Fixes
**Backend** :
- Nouveau `POST /api/wallet/reconcile` (auth) — scanne les txs `coin_pack` non appliquées des dernières 24h, requête Stripe, et crédite si `payment_status="paid"`
- Webhook Stripe avec **fallback gracieux** si `WEBHOOK_SECRET` absent : parse l'event JSON et re-vérifie via API directe
- Polling endpoint `/payments/status/{id}` inchangé (déjà robuste)

**Frontend** :
- `Wallet.jsx` : appelle `/wallet/reconcile` au mount, toast `+X coins crédités après vérification` si nécessaire
- `PaymentSuccess.jsx` : polling étendu à **30 tentatives** (10×2s + 20×3.5s = ~75s) + bouton **"Vérifier à nouveau"** qui force un reconcile

### 🤖 Système Modération IA (Lou) — admin-configurable
**Backend** (`server.py`) :
- Collection `config` avec `_id="ai_moderation"` stocke la policy
- `DEFAULT_MOD_POLICY` : 12 filtres `ban_*`, 4 zones de scan, 7 actions par catégorie, blacklist mots-clés, seuil auto-suspension
- `GET/PATCH /api/admin/moderation/policy` (admin)
- `GET /api/admin/moderation/reports?status=` (admin)
- `POST /api/admin/moderation/reports/{id}/action` avec actions `approve|delete_content|suspend_user|ban_user|dismiss`
- `moderate_text(text, kind, creator_id)` — pre-filter regex (mots-clés, contacts externes, scam links) + LLM Lou (Gemini 2.5 Flash) pour analyses nuancées (nudity, violence, hate, etc.)
- Pipeline branché sur création de content : asyncio.create_task → si verdict, `_record_mod_report` + `_maybe_auto_apply_violation`
- Filtre `hidden_by_moderation` ajouté au listing creator content

**Frontend** (`AdminModeration.jsx` réécrit) :
- 3 onglets : "Règles IA" / "Rapports IA" / "Signalés fans"
- PolicyTab : master switch, 4 scan targets, 12 filtres avec hints, 7 lignes d'action avec 5 boutons chacune, blacklist mots-clés (input + pills removables), auto-suspension threshold, trust verified creators
- ReportsTab : filtre par statut (pending/approved/deleted/banned/dismissed), affichage severity color, summary, source text preview, 5 boutons action par rapport
- FlaggedTab : conserve l'ancien flow (signalements fans)

### Tests (testing_agent_v3 itération 41)
- **Backend : 14/14 PASSED (100%)** — tous endpoints policy, reports, reconcile, webhook fallback
- **Frontend : 100%** — 3 onglets, 12 filtres, 7 actions, keyword blacklist, wallet auto-reconcile, payment retry

### Phases restantes (à venir)
- 🟡 Phase 2 : Profil Fan (username changeable 1 fois, abonnements list + désabonner)
- 🟡 Phase 3 : Dashboard Créatrice Stripchat-style (silhouette, ethnicité, cheveux, yeux, sub-culture, tarifs live privé/exclusif/spy/group/ticket, contrat à signer)
- 🟡 Phase 4 : Vraie interface Admin homepage + Mass-email aux fans



### 🔴 Bug critique reporté par utilisateur
> "Il y a un problème de connexion par exemple à chaque achat que les utilisateurs font ils peuvent se faire déconnecter de leur compte"

### Cause racine identifiée
1. **Cookies cross-site bloqués (Safari ITP / Brave / Firefox strict)** : après le redirect Stripe → `${origin}/payment/success`, le navigateur ne renvoie plus le cookie `samesite=none` car la navigation est traitée comme "third-party context".
2. **`get_current_user` lisait le cookie EN PREMIER** puis le Bearer en fallback — donc même un Bearer valide en localStorage était ignoré quand un cookie stale/manquant arrivait.
3. **Frontend nettoyait localStorage sur LE PREMIER 401** sans aucun mécanisme de refresh — un seul 401 transitoire (typique au retour de Stripe) déconnectait définitivement.

### Fixes implémentés
**Backend** (`/app/backend/server.py`) :
- `get_current_user` : Bearer header **prioritaire** sur cookie (Bearer = source of truth en localStorage, survit aux ITP)
- Nouveau `POST /api/auth/refresh` accepte le refresh token via **3 canaux** : cookie OU body `{refresh_token}` OU `Authorization: Bearer` (last-resort)
- `/auth/login`, `/auth/register`, `/auth/google/callback`, `/auth/google/direct` retournent maintenant **`refresh_token` dans le body** (en plus des cookies)

**Frontend** (`/app/frontend/src/lib/api.js` réécriture complète) :
- `tokenStore` étendu : `setRefresh`, `getRefresh`, et `clear()` supprime les deux
- Response interceptor avec **silent refresh sur 401** : attemptRefresh() avec déduplication concurrente, retry de la requête originale avec le nouveau Bearer
- Effacement de localStorage **uniquement** si le refresh ÉCHOUE LUI AUSSI ET si la requête originale était `/auth/me`

### Tests (testing_agent_v3 itération 40)
- **Backend : 22/22 PASSED (100%)** — tous les flows de tokens, refresh via 3 canaux, prioriy Bearer/cookie
- **Frontend : 100%** — Safari ITP simulé (cookies cleared après login), Bearer auth + silent refresh fonctionnent



### 🔴 Fix mobile chat & tip menu invisibles
- LiveRoom.jsx : la colonne chat passait à `hidden lg:block` → invisible sur mobile.
- ✅ Maintenant `lg:col-span-4` → full-width sur mobile, flow naturel sous la vidéo. Plus besoin de FAB ni de drawer (supprimés).

### 🔴 Fix mobile fullscreen (iOS Safari)
- `el.requestFullscreen()` ne fonctionnait pas sur iOS Safari → bouton inactif.
- ✅ Cascade de fallbacks :
  1. Standard Fullscreen API
  2. iOS `<video>.webkitEnterFullscreen()`
  3. CSS fake-fullscreen (`position:fixed inset-0` + `100dvh` pour safe-area iOS), Esc pour quitter

### 📸 Live Preview = snapshot caméra (et plus l'avatar)
- `LiveHostStage` capture une JPEG 320×N qualité 0.55 toutes les 10 s (cap ~50 KB) → POST `/api/live/{id}/snapshot` → stocké dans `live_sessions.preview_data_url`
- `/api/live/active` et `/api/live/{id}` exposent `preview_url` (snapshot recent OU fallback avatar) tout en strippant le blob lourd des réponses non-host
- `Live.jsx` lobby : suppression du Radio icon central, snapshot affiché à pleine opacité

### 🛡️ Système Banned + Modérateurs (live)
**Backend** (server.py) :
- `GET /live/{id}/banned` (host) — liste utilisateurs bannis avec name/avatar
- `POST /live/{id}/banned/{user_id}/unban` (host) — débannir
- `GET /live/{id}/moderators` (host) — liste mods avec permissions
- `POST /live/{id}/moderators` (host) — upsert avec 6 permissions : `can_kick, can_ban, can_delete_msg, can_mute, can_pin, can_view_revenue`
- `DELETE /live/{id}/moderators/{user_id}` (host)
- `POST /live/{id}/mute` (host ou mod `can_mute`) — mute viewer N minutes
- `POST /live/{id}/chat` enforce mute → 403 `detail.error='muted'`
- `DELETE /live/{id}/chat/{message_id}` (host ou mod `can_delete_msg`)
- `POST /live/{id}/pin/{message_id}` (host ou mod `can_pin`) — toggle
- `POST /live/{id}/kick` étendu pour mods avec permissions
- `GET /users/lookup?q=&scope=` — recherche par handle/nom/email, scope=`all|subscribers`

**Frontend** :
- Nouveau composant `LiveModerationPanel.jsx` intégré dans `HostLiveSettings` :
  - Onglet "Modérateurs" : recherche debounced (≥2 char), toggle "Abos uniquement", liste avec pills de permissions toggle-able, retirer
  - Onglet "Bannis" : liste avec avatar + bouton "Débannir"

### Tests (testing_agent_v3 itération 39)
- **Backend : 39/39 PASSED (100%)** — tous les nouveaux endpoints, mute enforcement, permission checks
- **Frontend : 100%** — mobile layout chat below stage vérifié, fullscreen fallback, snapshot loop, panneau modération



### 🗑️ Phase 1 — Suppression complète du recording
**Backend (`/app/backend/server.py`)** :
- `LiveStartIn` : retrait `recording_enabled` / `recording_price`
- `LiveSettingsIn` : retrait des mêmes champs
- `/live/start` : retrait des champs lors de l'insert
- `/live/{id}/settings` : retrait des updates
- `/live/{id}/recording/unlock` : **endpoint supprimé** (renvoie 404)
- `get_live` : `has_recording_access`, `recording_unlocks_count`, `recording_coins_earned` retirés du payload

**Frontend** :
- `GoLive.jsx` : section "Enregistrement payant" supprimée + import `Save` retiré
- `LiveRoom.jsx` : badge REC + section recording du panel `HostLiveSettings` supprimés

### ✨ Phase 2 — Live display overhaul (Stripchat-grade)
**Nouveaux composants frontend** :
- `LiveDurationTimer.jsx` — timer HH:MM:SS en temps réel depuis `started_at`
- `TipTicker.jsx` — bandeau scrolling top-center avec les 5 derniers pourboires
- `TipGoalBar.jsx` — barre objectif premium avec milestones 25/50/75/100, shimmer flow, glow trophy quand atteint
- `LiveChatList.jsx` — chat avec timestamps relatifs (à l'instant / Ns / Nm), bouton "↓ N nouveaux", animations bouncy sur tips
- `LiveEndedRecap.jsx` — écran post-live premium : stats grid (durée, viewers max, coins, favoris), podium top tippers (🥇🥈🥉), CTAs
- `LiveHostStage.jsx` — stage host minimaliste avec mini-toolbar glassmorphism (mic/cam/flip)
- `LiveHostControls.jsx` — simplifié (juste badge connection quality top-left)

**Modifications** :
- `LiveRoom.jsx` réécrit complètement : nouveau header avec avatar lg + duration + viewer-pulse animation, mobile chat FAB (bottom-LEFT pour ne pas toucher Lou), stop live → recap au lieu de message d'erreur
- `tailwind.config.js` : nouvelles keyframes `shimmerSlide`, `gradientFlow`, `pulseRing`, `slideInRight`, `bounceTip`

**Backend additions** :
- `GET /api/live/{id}/leaderboard` — top 10 tippers d'une session (utilisé par le podium recap)
- `peak_viewer_count` automatiquement tracké sur `live_sessions` à chaque heartbeat

### Tests (testing_agent_v3 iter 38)
- 100% backend (10/10 tests passés) — recording removed, leaderboard works, tip flow correct
- 100% frontend — duration timer, goal bar milestones, recap, mic/cam toolbar, settings panel sans recording, chat FAB
- Bug mineur (corrigé) : Chat FAB chevauchait Lou AI sur mobile → déplacé à `bottom-20 left-4` (Lou est `right-4`)



### Bugs corrigés
- 🔴 **P0 — Host control buttons unclickable** : LiveKit `<VideoConference />` rendait sa control bar (Mic/Cam/ShareScreen/Chat/Leave) sans CSS (le pkg `@livekit/components-styles` n'est pas installé), le composant débordait du stage vidéo et venait recouvrir les boutons "Réglages" / "Terminer le live" du créateur. Remplacé par un nouveau composant `LiveHostStage` minimaliste (preview locale + toggles Mic/Cam contenus dans le frame). 
   - Fichiers : `/app/frontend/src/components/LiveHostStage.jsx` (nouveau) + `/app/frontend/src/pages/LiveRoom.jsx` (import + JSX).
   - Vérifié via Playwright `elementFromPoint` + click test : `Top of Réglages: live-host-settings-btn` ✓, click ouvre bien le panel.
- 🔴 **P0 — Vérification que les coins gagnés sont stockés dans le solde global créateur** : audité `live_tip` (server.py L1530-1591) — `_debit_wallet(fan, coins)` puis `_credit_wallet(creator, share=80%)`, persisté via `wallets.coin_balance += share` et `lifetime_earned += share` + `coin_transactions` ledger. Test e2e curl : fan -100 coins, créateur +80 coins, session.total_tips=100, session.coins_earned (display)=80. ✓
   - Bonus : la formule d'affichage `coins_earned` n'incluait que tips+ppv. Étendue à tips+ppv+private_entries+recording_unlocks (tous déjà crédités au wallet, donc le badge correspond enfin au solde réel). Fichier : `/app/backend/server.py` L1331-1340 + L1109-1115 (`recording_coins_earned` $inc ajouté).



### Contexte
- Stripe a banni le compte utilisateur pour contenu adulte (NSFW). Migration obligatoire vers des prestataires adulte-friendly.
- Choix : **Epoch** (paiements entrants / fans) + **Paymentico** (payouts SEPA / créatrices).

### Backend (tout en feature flag — `PAYMENTS_ENABLED=false` par défaut)
- ✅ Nouveau module `/app/backend/payments_providers.py` — clients `EpochClient` + `PaymenticoClient` avec HMAC-SHA256 signature et flags `epoch_enabled()` / `paymentico_enabled()` / `payments_enabled()`.
- ✅ Endpoint public **`GET /api/payments/config`** — retourne `{payments_enabled, epoch:{enabled,mode}, paymentico:{enabled,mode}, default_currency}` pour driver l'UI frontale.
- ✅ **`POST /api/wallet/buy`** — récrit pour utiliser l'Epoch hosted checkout. Renvoie 503 si `EPOCH_ENABLED=false`.
- ✅ **`POST /api/payments/subscribe-bundle-card`** (renommé depuis `subscribe-bundle-stripe`) — Epoch hosted checkout pour bundles 1/3/6/12 mois en €.
- ✅ **`POST /api/webhook/epoch`** — webhook signé (X-Epoch-Signature + X-Epoch-Timestamp), idempotent via `db.webhook_events`. Gère `payment.succeeded`, `checkout.session.completed`, `payment.failed`.
- ✅ **`POST /api/webhook/paymentico`** — webhook signé (X-Paymentico-Signature), gère `payout.completed` / `payout.failed` avec update `db.payout_requests`.
- ✅ **`GET /api/payments/status/{session_id}`** — poll Epoch puis fallback DB.
- ✅ **`GET /api/creators/me/payout-config`** — remplace l'ancien `stripe-connect/status`, retourne `{provider:"paymentico_sepa", paymentico_enabled, bank_configured, bank}`.

### Stripe — ripped out complet
- ✅ Imports supprimés : `emergentintegrations.payments.stripe.checkout`, `stripe` SDK (package désinstallé de `requirements.txt` et du venv).
- ✅ Env vars retirés : `STRIPE_API_KEY`, `STRIPE_ELEMENTS_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`. Remplacés par `EPOCH_*` / `PAYMENTICO_*`.
- ✅ Endpoints supprimés : `/webhook/stripe`, `/creators/me/stripe-connect/onboard`, `/stripe-connect/status`, `/stripe-connect/dashboard-link`, `/wallet/cards/setup-intent`, `/wallet/cards/confirm`.
- ✅ Endpoints legacy rendus no-op (retour vide ou 503) pour éviter 404 frontal : `/wallet/stripe-config`, `/wallet/cards` (GET/DELETE/default), `/wallet/auto-reload` (GET/POST), `/admin/reconcile-auto-reloads`.
- ✅ `start_verification` : Stripe Identity retiré, ne propose plus que le mode `mock` (modération manuelle admin).
- ✅ Fonction `_run_auto_reloads()` → no-op (la recharge automatique nécessite la tokenization Epoch, à faire quand les clés arrivent).
- ✅ Champs `stripe_account_id` / `stripe_account_payouts_enabled` retirés des réponses admin (`/admin/creators/payouts`, `/admin/creators/{id}/bank`). Les docs DB ne sont pas purgés (harmless, ignorés).

### Frontend
- ✅ `pages/Wallet.jsx` — récrit : supprime Stripe Elements + AddCardModal + SavedCardsCard + AutoReloadCard. Garde l'achat de packs (redirection Epoch), affiche bandeau "Paiements carte temporairement indisponibles" quand `epoch_enabled=false`, boutons "Bientôt" disabled.
- ✅ `pages/Dashboard.jsx` — `StripeConnectCard` remplacé par `PayoutConfigCard` : UI IBAN/SEPA via Paymentico, statut "Paymentico activation en cours" / "IBAN configuré ✓", CTA `→ /bank`.
- ✅ `pages/CreatorProfile.jsx` — `BundleModal` : renommé `payStripe` → `payCard`, endpoint `/payments/subscribe-bundle-card`, bouton disabled quand `epoch_enabled=false`.
- ✅ Dépendances retirées : `@stripe/stripe-js`, `@stripe/react-stripe-js` (yarn remove).
- ✅ Textes nettoyés : `Footer.jsx` (plus de "sécurisés Stripe"), `BecomeCreator.jsx` ("Paiements hebdomadaires" via SEPA), `Verification.jsx` (modération manuelle au lieu de Stripe Identity), `AdminKYC.jsx` (badge "verified" au lieu de "stripe"), i18n FR/EN/ES/DE/IT/PT age_gate + FAQ + landing.

### Nouveaux env vars (tous vides par défaut)
```
PAYMENTS_ENABLED=false
EPOCH_ENABLED=false
EPOCH_API_KEY=
EPOCH_API_BASE_URL=https://api.epoch.com/v1
EPOCH_WEBHOOK_SECRET=
EPOCH_SANDBOX_MODE=true
PAYMENTICO_ENABLED=false
PAYMENTICO_PUBLIC_KEY=
PAYMENTICO_PRIVATE_KEY=
PAYMENTICO_API_BASE_URL=https://api.paymentico.com/v1
PAYMENTICO_WEBHOOK_SECRET=
PAYMENTICO_SANDBOX_MODE=true
```

### Activation en production
Quand l'utilisateur aura obtenu les comptes marchand :
1. Remplir les 5 clés (EPOCH_API_KEY, EPOCH_WEBHOOK_SECRET, PAYMENTICO_PUBLIC_KEY, PAYMENTICO_PRIVATE_KEY, PAYMENTICO_WEBHOOK_SECRET)
2. Ajuster `EPOCH_API_BASE_URL` / `PAYMENTICO_API_BASE_URL` si les vrais endpoints diffèrent des placeholders du playbook
3. Passer `PAYMENTS_ENABLED=true`, `EPOCH_ENABLED=true`, `PAYMENTICO_ENABLED=true`
4. Configurer les webhooks Epoch → `https://meandyou.fans/api/webhook/epoch` et Paymentico → `https://meandyou.fans/api/webhook/paymentico`
5. `sudo supervisorctl restart backend` — le frontend se reconfigure tout seul via `/api/payments/config`

### Tests
- ✅ Backend démarre proprement (aucun import erreur).
- ✅ `GET /api/payments/config` → `payments_enabled: false, epoch/paymentico enabled: false`.
- ✅ `POST /api/wallet/buy` (auth) → 503 "Paiements bancaires temporairement indisponibles".
- ✅ `GET /api/wallet/auto-reload` (auth) → `{enabled: false, disabled_reason: "..."}`.
- ✅ `GET /api/wallet/cards` (auth) → `[]`.
- ✅ Frontend compile, page `/wallet` charge (bandeau d'information visible, boutons "Bientôt" disabled).
- ✅ Lint Python : 2 warnings préexistants (ambiguous `l`), rien de nouveau.

## Iteration 28 — Lot 5 Features (précédemment complété ✓)
(Likes, analytics créatrice, post scheduling, 24h expiry, bio link, push VAPID, delete post)
30/30 tests backend passés.

## Iteration 27 — Bug fixes P0 (précédemment complété ✓)
(GridFS media-file routing, stream.close(), StripeObject.get() conversion, live auto-join, FRONTEND_URL emails)

## Iterations 17-26 — voir CHANGELOG historique dans PRD.md iter 28

## Core Features — implémenté & testé
### Auth & Profils
- ✅ JWT + Bearer fallback + Google OAuth (direct+fallback) + brute-force lockout + forgot/reset password
- ✅ Age gate 18+ + vérification manuelle (Stripe Identity retiré iter 29)
- ✅ Dashboard créatrice éditable, 1-click Fan → Créatrice, IBAN/SEPA (mod-97, masquage, export XML pain.001)

### Contenu & Engagement
- ✅ Feed global, stories 24h, contenu premium unlock, flag/modération, notifications in-app+email
- ✅ Upload direct 25 MB + bulk upload + HEIC→JPEG auto-conversion
- ✅ Challenges, promotions auto (-5 à -90%), custom requests (escrow coins)
- ✅ Leaderboard, top tippers, discovery similaires (Jaccard), parrainage, badges fidélité
- ✅ Likes sur posts, analytics créatrice, bio link, post scheduling, 24h expiry

### Live & Communication
- ✅ LiveKit WebRTC (auto-join host, viewer heartbeat, favorites, tips), chat live
- ✅ Mass message (broadcast), paid DM (media paywall coins), subscription bundles 1/3/6/12 mois
- ✅ Stripchat cam integration (proxy HLS)

### Paiements (iter 29 — nouveau)
- ✅ Epoch hosted checkout (coin packs + bundles) — en attente activation clés
- ✅ Paymentico SEPA payouts — en attente activation clés
- ⚠️ Stripe complètement retiré (bannissement NSFW)
- ⚠️ Auto-reload disabled pending Epoch tokenization API

### Admin
- ✅ Stats, Users (ban/coins), KYC, modération, payouts (SEPA XML), site config, payout IBAN visibility
- ✅ "Lou" AI Chat Assistant (emergentintegrations)

## Backlog

### P0 (bloqué sur utilisateur)
- Obtenir comptes marchand Epoch + Paymentico → remplir clés env → passer feature flags à `true`
- Stockage persistant uploads (S3/R2/Cloudinary) — `/app/backend/uploads/` non persistant en prod
- Vérification DNS Resend (SPF/DKIM) pour le domaine meandyou.fans

### P1 — Lot 6
- Replay VOD des lives
- DMCA takedown tool
- Modération IA automatique
- Multi-créatrices dans un live
- Screen share

### Refactoring (P1)
- `server.py` ≈ 4800 lignes → split en `routers/auth.py`, `routers/payments.py`, `routers/admin.py`, `routers/content.py`, `routers/live.py`, `routers/messaging.py`
- Ajouter tokenization Epoch quand prestataire fournit l'API (auto-reload + saved cards)

### P2
- Reset Password link diagnostic en prod (vérifier `FRONTEND_URL=https://meandyou.fans` dans settings déployés)

## Stack
- **Frontend** : React 19 + Tailwind + lucide-react + @livekit/components-react (Stripe retiré)
- **Backend** : FastAPI + Motor + bcrypt + PyJWT + emergentintegrations (AI chat) + resend + livekit-api + httpx (pour Epoch/Paymentico clients) + pywebpush
- **Auth** : JWT httpOnly cookies + Bearer token localStorage fallback (Safari/VPN safe)

## Coin Economy
- 1 coin = 0,10 € · créatrice 80 % · retrait min 500 coins (40 € net)
- Packs : Starter 50c/5€ · Popular 220c/20€ · Premium 575c/50€ · VIP 1450c/100€

## Test Status
- Backend : iter 29 — sanity checks passés (payments/config, wallet/buy 503, auto-reload disabled, cards empty)
- Frontend : iter 29 — page /wallet compile, affiche notice Epoch disabled, boutons désactivés
