import { Link } from "react-router-dom";
import { Lock, Database, Cookie, Mail, Eye, Server, UserCheck } from "lucide-react";

export default function Privacy() {
    const today = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

    return (
        <div className="relative z-10 container-mx max-w-4xl py-16" data-testid="privacy-page">
            <div className="overline">Politique de confidentialité</div>
            <h1 className="mt-2 font-display text-4xl font-bold sm:text-5xl">
                Politique de<br />
                <span className="gradient-text">confidentialité</span>
            </h1>
            <p className="mt-4 text-sm text-white/50">
                Dernière mise à jour : {today} · Conforme RGPD (UE) 2016/679 et Loi Informatique et Libertés
            </p>

            <div className="mt-10 rounded-2xl border border-magenta/30 bg-gradient-to-br from-magenta/10 via-surface to-surface p-6" data-testid="privacy-summary">
                <div className="flex items-start gap-3">
                    <Lock className="flex-none text-magenta-200" size={22} />
                    <div>
                        <h2 className="font-display text-xl font-bold">En résumé</h2>
                        <p className="mt-2 text-sm leading-relaxed text-white/70">
                            me&you respecte ta vie privée. Nous collectons le minimum de données nécessaires (email, mot de passe haché, historique de paiements) et ne les partageons jamais avec les créatrices ni avec des tiers à des fins marketing. Tu disposes de tous tes droits RGPD : accès, rectification, suppression, portabilité, opposition.
                        </p>
                    </div>
                </div>
            </div>

            <section className="mt-12" data-testid="privacy-1">
                <h2 className="font-display text-2xl font-bold flex items-center gap-2">
                    <UserCheck size={22} className="text-magenta-200" />
                    1. Responsable de traitement
                </h2>
                <p className="mt-3 text-sm text-white/70">
                    <strong className="text-white">me&you SAS</strong> (en cours d'immatriculation), siège : France.<br />
                    Contact RGPD / DPO : <a href="mailto:privacy@meandyou.fans" className="underline hover:text-white">privacy@meandyou.fans</a><br />
                    Autorité de contrôle : <a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer" className="underline hover:text-white">CNIL (Commission nationale de l'informatique et des libertés)</a>.
                </p>
            </section>

            <section className="mt-10" data-testid="privacy-2">
                <h2 className="font-display text-2xl font-bold flex items-center gap-2">
                    <Database size={22} className="text-magenta-200" />
                    2. Données collectées
                </h2>
                <div className="mt-3 space-y-4 text-sm text-white/70">
                    <div>
                        <h3 className="font-semibold text-white">2.1 Données d'identification (obligatoires)</h3>
                        <ul className="mt-2 list-disc pl-5 space-y-1">
                            <li>Adresse email, mot de passe (haché bcrypt, jamais en clair)</li>
                            <li>Pseudo / nom d'affichage, avatar</li>
                            <li>Date de création de compte, dernière connexion</li>
                            <li>Adresse IP (logs de sécurité, conservée 12 mois)</li>
                        </ul>
                    </div>
                    <div>
                        <h3 className="font-semibold text-white">2.2 Données de paiement</h3>
                        <ul className="mt-2 list-disc pl-5 space-y-1">
                            <li>Historique des transactions (montant, date, type, ID Stripe)</li>
                            <li>Solde de coins, historique des recharges et dépenses</li>
                            <li>⚠️ <strong className="text-white">Aucune donnée bancaire</strong> (numéro de carte, CVV) n'est stockée sur nos serveurs. Les paiements sont traités directement par Stripe (certifié PCI-DSS Level 1). Stripe nous renvoie uniquement un identifiant de transaction et les 4 derniers chiffres de la carte.</li>
                        </ul>
                    </div>
                    <div>
                        <h3 className="font-semibold text-white">2.3 Données créatrice</h3>
                        <ul className="mt-2 list-disc pl-5 space-y-1">
                            <li>IBAN / BIC pour les retraits (chiffré au repos, masqué dans l'UI)</li>
                            <li>Pièce d'identité pour la vérification d'âge (conservée chiffrée, supprimée 90 jours après vérification)</li>
                            <li>Contenu publié, statistiques, gains</li>
                        </ul>
                    </div>
                    <div>
                        <h3 className="font-semibold text-white">2.4 Données techniques</h3>
                        <ul className="mt-2 list-disc pl-5 space-y-1">
                            <li>Logs serveur, navigateur, version OS (anonymisés au-delà de 30 jours)</li>
                            <li>Métadonnées des messages (date, expéditeur, destinataire — pas le contenu si supprimé)</li>
                        </ul>
                    </div>
                </div>
            </section>

            <section className="mt-10" data-testid="privacy-3">
                <h2 className="font-display text-2xl font-bold flex items-center gap-2">
                    <Eye size={22} className="text-magenta-200" />
                    3. Finalités et bases légales
                </h2>
                <div className="mt-3 overflow-x-auto rounded-xl border border-white/5">
                    <table className="w-full text-sm">
                        <thead className="bg-white/[0.03] text-left text-[11px] uppercase tracking-widest text-white/40">
                            <tr>
                                <th className="px-4 py-3">Finalité</th>
                                <th className="px-4 py-3">Base légale</th>
                                <th className="px-4 py-3">Conservation</th>
                            </tr>
                        </thead>
                        <tbody className="text-white/70">
                            <tr className="border-t border-white/5"><td className="px-4 py-3">Création / gestion du compte</td><td className="px-4 py-3">Exécution du contrat</td><td className="px-4 py-3">Durée du compte + 3 ans</td></tr>
                            <tr className="border-t border-white/5"><td className="px-4 py-3">Paiements et facturation</td><td className="px-4 py-3">Obligation légale (comptabilité)</td><td className="px-4 py-3">10 ans</td></tr>
                            <tr className="border-t border-white/5"><td className="px-4 py-3">Vérification d'âge</td><td className="px-4 py-3">Obligation légale</td><td className="px-4 py-3">90 jours puis suppression</td></tr>
                            <tr className="border-t border-white/5"><td className="px-4 py-3">Sécurité, lutte anti-fraude</td><td className="px-4 py-3">Intérêt légitime</td><td className="px-4 py-3">12 mois</td></tr>
                            <tr className="border-t border-white/5"><td className="px-4 py-3">Notifications email transactionnelles</td><td className="px-4 py-3">Exécution du contrat</td><td className="px-4 py-3">Durée du compte</td></tr>
                            <tr className="border-t border-white/5"><td className="px-4 py-3">Newsletter (optionnelle)</td><td className="px-4 py-3">Consentement</td><td className="px-4 py-3">Jusqu'à désinscription</td></tr>
                            <tr className="border-t border-white/5"><td className="px-4 py-3">Statistiques anonymisées</td><td className="px-4 py-3">Intérêt légitime</td><td className="px-4 py-3">25 mois max (CNIL)</td></tr>
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="mt-10" data-testid="privacy-4">
                <h2 className="font-display text-2xl font-bold flex items-center gap-2">
                    <Server size={22} className="text-magenta-200" />
                    4. Destinataires et sous-traitants
                </h2>
                <p className="mt-3 text-sm text-white/70">
                    Tes données ne sont <strong className="text-white">jamais vendues</strong> ni partagées à des fins marketing. Elles sont accessibles uniquement à :
                </p>
                <ul className="mt-3 space-y-3 text-sm text-white/70">
                    <li className="flex gap-3"><span className="text-magenta-300">•</span><span><strong className="text-white">L'équipe me&you</strong> habilitée (modération, support, comptabilité), sous accord de confidentialité.</span></li>
                    <li className="flex gap-3"><span className="text-magenta-300">•</span><span><strong className="text-white">Stripe Inc.</strong> (USA — Privacy Shield + clauses contractuelles types) pour le traitement des paiements et la conformité KYC/AML.</span></li>
                    <li className="flex gap-3"><span className="text-magenta-300">•</span><span><strong className="text-white">LiveKit Cloud</strong> (USA) pour les flux WebRTC live streaming (audio/vidéo, non stockés).</span></li>
                    <li className="flex gap-3"><span className="text-magenta-300">•</span><span><strong className="text-white">Resend</strong> et <strong className="text-white">Gmail SMTP</strong> pour l'envoi des emails transactionnels.</span></li>
                    <li className="flex gap-3"><span className="text-magenta-300">•</span><span><strong className="text-white">Hébergeur cloud</strong> (UE) pour les serveurs applicatifs et la base MongoDB.</span></li>
                    <li className="flex gap-3"><span className="text-magenta-300">•</span><span><strong className="text-white">Autorités compétentes</strong> sur réquisition judiciaire (PHAROS, police, juge, fisc).</span></li>
                </ul>
                <p className="mt-3 text-sm text-white/70">
                    Tous nos sous-traitants sont liés par un accord conforme RGPD (DPA / clauses 28).
                </p>
            </section>

            <section className="mt-10" data-testid="privacy-5">
                <h2 className="font-display text-2xl font-bold flex items-center gap-2">
                    <Cookie size={22} className="text-magenta-200" />
                    5. Cookies et traceurs
                </h2>
                <p className="mt-3 text-sm text-white/70">
                    me&you utilise uniquement des <strong className="text-white">cookies strictement nécessaires</strong> au fonctionnement du site (authentification, session, panier coins). Aucun cookie publicitaire, aucun pixel marketing, aucun tracking cross-site.
                </p>
                <ul className="mt-3 space-y-2 text-sm text-white/70">
                    <li><strong className="text-white">access_token</strong> · cookie httpOnly · authentification · 30 jours</li>
                    <li><strong className="text-white">meandyou_age_gate</strong> · localStorage · mémorisation choix d'âge · indéfinie (suppressible)</li>
                    <li><strong className="text-white">i18nextLng</strong> · localStorage · langue préférée · indéfinie</li>
                </ul>
            </section>

            <section className="mt-10" data-testid="privacy-6">
                <h2 className="font-display text-2xl font-bold">6. Tes droits RGPD</h2>
                <p className="mt-3 text-sm text-white/70">
                    Conformément aux articles 15 à 22 du RGPD, tu disposes des droits suivants :
                </p>
                <ul className="mt-3 grid gap-3 text-sm text-white/70 sm:grid-cols-2">
                    <li className="rounded-xl border border-white/5 bg-white/[0.02] p-3"><strong className="text-white">Accès</strong> · obtenir une copie de toutes tes données</li>
                    <li className="rounded-xl border border-white/5 bg-white/[0.02] p-3"><strong className="text-white">Rectification</strong> · corriger des données inexactes</li>
                    <li className="rounded-xl border border-white/5 bg-white/[0.02] p-3"><strong className="text-white">Effacement</strong> · supprimer ton compte et tes données</li>
                    <li className="rounded-xl border border-white/5 bg-white/[0.02] p-3"><strong className="text-white">Portabilité</strong> · exporter tes données au format JSON</li>
                    <li className="rounded-xl border border-white/5 bg-white/[0.02] p-3"><strong className="text-white">Limitation</strong> · figer le traitement</li>
                    <li className="rounded-xl border border-white/5 bg-white/[0.02] p-3"><strong className="text-white">Opposition</strong> · refuser certains traitements (ex : newsletter)</li>
                    <li className="rounded-xl border border-white/5 bg-white/[0.02] p-3"><strong className="text-white">Réclamation CNIL</strong> · saisir l'autorité de contrôle</li>
                    <li className="rounded-xl border border-white/5 bg-white/[0.02] p-3"><strong className="text-white">Directives post-mortem</strong> · sort de tes données après ton décès</li>
                </ul>
                <p className="mt-4 text-sm text-white/70">
                    Pour exercer un droit : email à <a href="mailto:privacy@meandyou.fans" className="underline hover:text-white">privacy@meandyou.fans</a> avec une copie de ta pièce d'identité (supprimée après vérification). Réponse sous <strong className="text-white">30 jours</strong>.
                </p>
            </section>

            <section className="mt-10" data-testid="privacy-7">
                <h2 className="font-display text-2xl font-bold">7. Sécurité</h2>
                <ul className="mt-3 space-y-2 text-sm text-white/70">
                    <li>• Chiffrement TLS 1.3 sur toutes les communications</li>
                    <li>• Mots de passe hachés avec bcrypt (cost factor 12)</li>
                    <li>• Données sensibles (IBAN, pièces d'identité) chiffrées au repos (AES-256)</li>
                    <li>• Brute-force protection sur le login (lockout après 5 échecs)</li>
                    <li>• Audit logs des accès admin</li>
                    <li>• Sauvegardes quotidiennes chiffrées, conservées 30 jours</li>
                </ul>
                <p className="mt-3 text-sm text-white/70">
                    En cas de violation de données, la CNIL et les utilisateurs concernés sont notifiés sous 72 heures (article 33 RGPD).
                </p>
            </section>

            <section className="mt-10" data-testid="privacy-8">
                <h2 className="font-display text-2xl font-bold">8. Mineurs</h2>
                <p className="mt-3 text-sm text-white/70">
                    me&you est strictement réservé aux personnes <strong className="text-white">majeures (18 ans et plus)</strong>. Aucune donnée n'est collectée sciemment auprès de mineurs. Si tu détectes un compte de mineur, signale-le à <a href="mailto:abuse@meandyou.fans" className="underline hover:text-white">abuse@meandyou.fans</a> — le compte sera fermé et les données supprimées immédiatement.
                </p>
            </section>

            <section className="mt-10" data-testid="privacy-9">
                <h2 className="font-display text-2xl font-bold">9. Modifications</h2>
                <p className="mt-3 text-sm text-white/70">
                    Cette politique peut évoluer. Toute modification substantielle est notifiée par email et bannière in-app au moins 14 jours avant son entrée en vigueur. La version la plus récente est toujours accessible sur cette page.
                </p>
            </section>

            <div className="mt-16 rounded-2xl border border-white/5 bg-surface p-6 text-center text-sm text-white/60" data-testid="privacy-footer-cta">
                <p>Une question sur tes données ?</p>
                <a href="mailto:privacy@meandyou.fans" className="mt-3 inline-flex items-center gap-1.5 text-magenta-200 hover:text-white">
                    <Mail size={14} /> privacy@meandyou.fans
                </a>
                <div className="mt-4 flex justify-center gap-3 text-xs text-white/40">
                    <Link to="/legal/acceptable-use" className="hover:text-white">Acceptable Use</Link>
                    <span>·</span>
                    <Link to="/legal/terms" className="hover:text-white">Conditions d'utilisation</Link>
                    <span>·</span>
                    <Link to="/" className="hover:text-white">Accueil</Link>
                </div>
            </div>
        </div>
    );
}
