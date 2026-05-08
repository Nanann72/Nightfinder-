import { Link } from "react-router-dom";
import { Shield, Ban, AlertTriangle, CheckCircle2, FileWarning, Mail } from "lucide-react";

export default function AcceptableUse() {
    const today = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

    return (
        <div className="relative z-10 container-mx max-w-4xl py-16" data-testid="acceptable-use-page">
            <div className="overline">Politique d'utilisation acceptable</div>
            <h1 className="mt-2 font-display text-4xl font-bold sm:text-5xl">
                Acceptable Use<br />
                <span className="gradient-text">Policy</span>
            </h1>
            <p className="mt-4 text-sm text-white/50">
                Dernière mise à jour : {today} · Effective immédiatement pour tous les utilisateurs.
            </p>

            {/* Quick summary banner */}
            <div className="mt-10 rounded-2xl border border-magenta/30 bg-gradient-to-br from-magenta/10 via-surface to-surface p-6" data-testid="aup-summary">
                <div className="flex items-start gap-3">
                    <Shield className="flex-none text-magenta-200" size={22} />
                    <div>
                        <h2 className="font-display text-xl font-bold">En résumé</h2>
                        <p className="mt-2 text-sm leading-relaxed text-white/70">
                            me&you est une plateforme française de contenu créatif premium (mode, lifestyle, fitness, art, glamour). Le contenu sexuellement explicite, la nudité explicite, la pornographie et tout contenu illégal sont <strong className="text-white">strictement interdits</strong>. Toute violation entraîne la suspension immédiate du compte et le remboursement des fans concernés.
                        </p>
                    </div>
                </div>
            </div>

            {/* Section 1 */}
            <section className="mt-12" data-testid="aup-prohibited">
                <h2 className="font-display text-2xl font-bold flex items-center gap-2">
                    <Ban size={22} className="text-red-400" />
                    1. Contenus strictement interdits
                </h2>
                <p className="mt-3 text-sm text-white/70">
                    Les types de contenu suivants sont prohibés sur me&you, qu'ils soient publics, privés, en messagerie, en live ou en média téléchargeable :
                </p>
                <ul className="mt-4 space-y-3 text-sm text-white/70">
                    <li className="flex gap-3"><span className="text-red-400">✕</span><span><strong className="text-white">Contenu sexuellement explicite (no sexually explicit content)</strong> : représentation visuelle ou écrite d'actes sexuels, pénétration, masturbation, éjaculation, fluides corporels à caractère sexuel, ou simulation de ces actes.</span></li>
                    <li className="flex gap-3"><span className="text-red-400">✕</span><span><strong className="text-white">Nudité explicite</strong> : exposition non artistique des organes génitaux, anus ou poitrine non couverte (sauf contexte artistique manifestement non sexuel et conforme aux standards d'Instagram/Meta).</span></li>
                    <li className="flex gap-3"><span className="text-red-400">✕</span><span><strong className="text-white">Pornographie</strong> sous toutes ses formes — incluant softcore, hentai, deepfake pornographique, ou contenu suggestif visant à provoquer une excitation sexuelle.</span></li>
                    <li className="flex gap-3"><span className="text-red-400">✕</span><span><strong className="text-white">Contenu impliquant des mineurs</strong> dans un contexte sexualisé, suggestif ou inapproprié — tolérance zéro, signalement automatique aux autorités (article 227-23 du Code pénal).</span></li>
                    <li className="flex gap-3"><span className="text-red-400">✕</span><span><strong className="text-white">Escort, prostitution, services sexuels payants</strong> : aucune offre, aucune référence, aucune mise en relation.</span></li>
                    <li className="flex gap-3"><span className="text-red-400">✕</span><span><strong className="text-white">Violence, gore, harcèlement, menaces, contenu haineux</strong> (raciste, sexiste, LGBTphobe, antisémite, etc.).</span></li>
                    <li className="flex gap-3"><span className="text-red-400">✕</span><span><strong className="text-white">Drogues, armes, contenus illégaux</strong> : promotion ou vente de substances réglementées, armes à feu, contrefaçons.</span></li>
                    <li className="flex gap-3"><span className="text-red-400">✕</span><span><strong className="text-white">Vol de contenu / DMCA</strong> : republication d'images, vidéos ou textes sans l'autorisation explicite des ayants droit.</span></li>
                    <li className="flex gap-3"><span className="text-red-400">✕</span><span><strong className="text-white">Spam, fraude, blanchiment, schémas pyramidaux, crypto-scams</strong>.</span></li>
                </ul>
            </section>

            {/* Section 2 */}
            <section className="mt-12" data-testid="aup-permitted">
                <h2 className="font-display text-2xl font-bold flex items-center gap-2">
                    <CheckCircle2 size={22} className="text-green-400" />
                    2. Contenus autorisés et encouragés
                </h2>
                <p className="mt-3 text-sm text-white/70">
                    me&you valorise les créatrices qui partagent leur univers premium dans les catégories suivantes :
                </p>
                <ul className="mt-4 grid gap-2 text-sm text-white/70 sm:grid-cols-2">
                    <li className="flex gap-2"><span className="text-green-400">✓</span> Mode, looks, défilés, accessoires</li>
                    <li className="flex gap-2"><span className="text-green-400">✓</span> Lifestyle, voyage, gastronomie, déco</li>
                    <li className="flex gap-2"><span className="text-green-400">✓</span> Fitness, yoga, danse, sport</li>
                    <li className="flex gap-2"><span className="text-green-400">✓</span> Beauté, maquillage, soins, hair</li>
                    <li className="flex gap-2"><span className="text-green-400">✓</span> Art, photographie, illustration</li>
                    <li className="flex gap-2"><span className="text-green-400">✓</span> Musique, performances, DJ sets</li>
                    <li className="flex gap-2"><span className="text-green-400">✓</span> Cosplay, costumes, événements</li>
                    <li className="flex gap-2"><span className="text-green-400">✓</span> Glamour, lingerie élégante (non explicite)</li>
                    <li className="flex gap-2"><span className="text-green-400">✓</span> Coulisses, tutoriels, conseils pro</li>
                    <li className="flex gap-2"><span className="text-green-400">✓</span> Conversations privées, fan service</li>
                </ul>
                <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-amber-100" data-testid="aup-glamour-rule">
                    <strong>Règle glamour :</strong> les tenues sexy, lingerie, swimwear sont autorisées tant qu'elles respectent les standards Instagram/Meta — pas d'exposition explicite des parties intimes, pas de simulation d'actes sexuels.
                </div>
            </section>

            {/* Section 3 */}
            <section className="mt-12" data-testid="aup-enforcement">
                <h2 className="font-display text-2xl font-bold flex items-center gap-2">
                    <AlertTriangle size={22} className="text-amber-400" />
                    3. Application et sanctions
                </h2>
                <ol className="mt-4 space-y-3 text-sm text-white/70">
                    <li><strong className="text-white">3.1 Modération.</strong> Toute publication, message ou stream est susceptible d'être examiné par notre équipe de modération humaine et nos systèmes automatisés (détection IA, hash matching).</li>
                    <li><strong className="text-white">3.2 Signalements.</strong> Tout utilisateur peut signaler un contenu en cliquant sur l'icône <FileWarning size={12} className="inline" /> présente sur chaque post / message / profil. Les signalements sont traités sous 24 h.</li>
                    <li><strong className="text-white">3.3 Premier manquement.</strong> Suppression immédiate du contenu, avertissement par email, mise en quarantaine du profil pendant 48 h.</li>
                    <li><strong className="text-white">3.4 Récidive ou faute grave.</strong> Suspension permanente du compte, blocage des paiements, gel des fonds en attente de retrait, remboursement intégral des fans concernés.</li>
                    <li><strong className="text-white">3.5 Contenu illégal.</strong> Signalement immédiat aux autorités compétentes (PHAROS, INTERPOL, Europol, NCMEC), gel des données et coopération pleine avec les enquêtes judiciaires.</li>
                    <li><strong className="text-white">3.6 Pas de remboursement.</strong> Les sanctions n'ouvrent aucun droit à indemnisation pour le créateur sanctionné.</li>
                </ol>
            </section>

            {/* Section 4 */}
            <section className="mt-12" data-testid="aup-payments">
                <h2 className="font-display text-2xl font-bold flex items-center gap-2">
                    <Shield size={22} className="text-magenta-200" />
                    4. Conformité paiements et partenaires
                </h2>
                <p className="mt-3 text-sm text-white/70">
                    me&you opère avec des partenaires de paiement de premier plan (Stripe, banques européennes). Nous appliquons strictement leurs conditions générales — notamment l'interdiction de toute activité adulte explicite — afin de préserver la qualité du service pour l'ensemble de la communauté.
                </p>
                <p className="mt-3 text-sm text-white/70">
                    En tant que créatrice, en publiant sur me&you tu déclares que ton contenu respecte intégralement la présente politique ainsi que les conditions générales de nos partenaires de paiement. Tu indemnises me&you contre tout litige, frais ou pénalité résultant d'une violation.
                </p>
            </section>

            {/* Section 5 */}
            <section className="mt-12" data-testid="aup-reporting">
                <h2 className="font-display text-2xl font-bold flex items-center gap-2">
                    <Mail size={22} className="text-magenta-200" />
                    5. Signaler une violation
                </h2>
                <p className="mt-3 text-sm text-white/70">
                    Tu observes un contenu qui viole cette politique ?
                </p>
                <ul className="mt-3 space-y-2 text-sm text-white/70">
                    <li>• <strong className="text-white">Sur la plateforme :</strong> clique sur le bouton "Signaler" présent sous chaque post, message ou profil.</li>
                    <li>• <strong className="text-white">Par email (DMCA / contenu illégal) :</strong> <a href="mailto:abuse@meandyou.fans" className="underline hover:text-white">abuse@meandyou.fans</a></li>
                    <li>• <strong className="text-white">Urgences (mineurs en danger) :</strong> contacte directement le 119 (France) ou <a href="https://www.internet-signalement.gouv.fr/" target="_blank" rel="noopener noreferrer" className="underline hover:text-white">PHAROS</a>.</li>
                </ul>
            </section>

            {/* Section 6 */}
            <section className="mt-12" data-testid="aup-changes">
                <h2 className="font-display text-2xl font-bold">6. Évolution de cette politique</h2>
                <p className="mt-3 text-sm text-white/70">
                    me&you peut faire évoluer cette politique pour refléter les changements légaux ou les exigences de nos partenaires. Toute modification substantielle est notifiée par email et bannière in-app au moins 14 jours avant son entrée en vigueur. La poursuite de l'utilisation de la plateforme après cette période vaut acceptation.
                </p>
            </section>

            {/* Final CTA back */}
            <div className="mt-16 rounded-2xl border border-white/5 bg-surface p-6 text-center text-sm text-white/60" data-testid="aup-footer-cta">
                <p>Une question sur cette politique ?</p>
                <a href="mailto:legal@meandyou.fans" className="mt-3 inline-flex items-center gap-1.5 text-magenta-200 hover:text-white">
                    <Mail size={14} /> legal@meandyou.fans
                </a>
                <div className="mt-4">
                    <Link to="/" className="text-xs text-white/40 hover:text-white">← Retour à l'accueil</Link>
                </div>
            </div>
        </div>
    );
}
