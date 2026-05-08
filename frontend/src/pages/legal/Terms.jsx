import { Link } from "react-router-dom";
import { FileText, Mail, CheckCircle2, AlertTriangle } from "lucide-react";

export default function Terms() {
    const today = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

    return (
        <div className="relative z-10 container-mx max-w-4xl py-16" data-testid="terms-page">
            <div className="overline">Conditions générales d'utilisation</div>
            <h1 className="mt-2 font-display text-4xl font-bold sm:text-5xl">
                Conditions<br />
                <span className="gradient-text">d'utilisation</span>
            </h1>
            <p className="mt-4 text-sm text-white/50">
                Dernière mise à jour : {today} · Loi applicable : France
            </p>

            <div className="mt-10 rounded-2xl border border-magenta/30 bg-gradient-to-br from-magenta/10 via-surface to-surface p-6" data-testid="terms-summary">
                <div className="flex items-start gap-3">
                    <FileText className="flex-none text-magenta-200" size={22} />
                    <div>
                        <h2 className="font-display text-xl font-bold">En résumé</h2>
                        <p className="mt-2 text-sm leading-relaxed text-white/70">
                            En utilisant me&you, tu acceptes ces conditions. La plateforme met en relation fans et créatrices de contenu premium (mode, lifestyle, art, glamour). Toute publication doit respecter notre <Link to="/legal/acceptable-use" className="underline hover:text-white">Politique d'utilisation acceptable</Link>. Les paiements utilisent une économie de coins (1 coin = 0,10 €), avec 80 % reversés aux créatrices.
                        </p>
                    </div>
                </div>
            </div>

            <section className="mt-12" data-testid="terms-1">
                <h2 className="font-display text-2xl font-bold">1. Objet et acceptation</h2>
                <p className="mt-3 text-sm text-white/70">
                    me&you est une plateforme française éditée par <strong className="text-white">me&you SAS</strong> (en cours d'immatriculation), accessible sur <a href="https://meandyou.fans" className="underline hover:text-white">https://meandyou.fans</a>. En créant un compte ou en utilisant le site, tu acceptes sans réserve les présentes conditions, la <Link to="/legal/privacy" className="underline hover:text-white">Politique de confidentialité</Link> et la <Link to="/legal/acceptable-use" className="underline hover:text-white">Politique d'utilisation acceptable</Link>.
                </p>
            </section>

            <section className="mt-10" data-testid="terms-2">
                <h2 className="font-display text-2xl font-bold">2. Inscription et accès</h2>
                <ul className="mt-3 space-y-3 text-sm text-white/70">
                    <li><strong className="text-white">2.1</strong> L'inscription est réservée aux personnes majeures (18 ans minimum). Une vérification d'âge peut être demandée.</li>
                    <li><strong className="text-white">2.2</strong> Tu garantis l'exactitude des informations fournies et t'engages à maintenir leur sécurité (mot de passe, double authentification).</li>
                    <li><strong className="text-white">2.3</strong> Un seul compte par personne physique. Le partage ou la revente de comptes est interdit.</li>
                    <li><strong className="text-white">2.4</strong> me&you peut refuser, suspendre ou clôturer un compte en cas de violation de ces conditions, sans préavis ni indemnité.</li>
                </ul>
            </section>

            <section className="mt-10" data-testid="terms-3">
                <h2 className="font-display text-2xl font-bold">3. Comptes Fan et Créatrice</h2>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                        <div className="overline">Compte Fan</div>
                        <p className="mt-2 text-sm text-white/70">Achète des coins, abonne-toi, déverrouille du contenu, envoie des pourboires et messages privés.</p>
                    </div>
                    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                        <div className="overline">Compte Créatrice</div>
                        <p className="mt-2 text-sm text-white/70">Publie du contenu premium, fixe tes tarifs, retire tes gains (80 % de la valeur en €) sur ton IBAN.</p>
                    </div>
                </div>
            </section>

            <section className="mt-10" data-testid="terms-4">
                <h2 className="font-display text-2xl font-bold">4. Économie de coins</h2>
                <ul className="mt-3 space-y-3 text-sm text-white/70">
                    <li><strong className="text-white">4.1 Taux fixe.</strong> 1 coin = 0,10 €. Les coins ne sont ni remboursables ni échangeables contre des espèces côté Fan.</li>
                    <li><strong className="text-white">4.2 Achat.</strong> Les coins s'achètent par packs via Stripe (cartes Visa, Mastercard, Amex, Apple Pay, Google Pay). Aucune information bancaire n'est stockée sur nos serveurs.</li>
                    <li><strong className="text-white">4.3 Utilisation.</strong> Les coins servent à : abonnements, pourboires, déverrouillage de contenu, messages payants, paid DMs, dons en live.</li>
                    <li><strong className="text-white">4.4 Renouvellement automatique.</strong> Les abonnements se renouvellent automatiquement à l'échéance sauf annulation. Tu peux désactiver le renouvellement à tout moment depuis `/subscriptions`.</li>
                    <li><strong className="text-white">4.5 Recharge automatique.</strong> Optionnelle, désactivable à tout moment dans `/wallet`.</li>
                </ul>
            </section>

            <section className="mt-10" data-testid="terms-5">
                <h2 className="font-display text-2xl font-bold">5. Rémunération et retraits créatrice</h2>
                <ul className="mt-3 space-y-3 text-sm text-white/70">
                    <li><strong className="text-white">5.1 Partage 80/20.</strong> La créatrice reçoit 80 % de la valeur en € de chaque transaction (abonnement, pourboire, unlock, paid DM). 20 % constituent la commission plateforme.</li>
                    <li><strong className="text-white">5.2 Seuil minimum.</strong> Le retrait est possible à partir de 500 coins (40 € net créatrice).</li>
                    <li><strong className="text-white">5.3 Délais.</strong> Virement SEPA sur l'IBAN renseigné, sous 3 à 5 jours ouvrés après validation par notre équipe.</li>
                    <li><strong className="text-white">5.4 Fiscalité.</strong> Tu es seule responsable de la déclaration de tes revenus auprès de l'administration fiscale française. Au-delà de 3 000 € / an, déclaration obligatoire (BNC ou micro-entreprise). me&you transmet annuellement les montants versés à la DGFiP conformément à la directive DAC7.</li>
                    <li><strong className="text-white">5.5 Stripe Connect.</strong> Les créatrices peuvent activer Stripe Connect Express pour recevoir leurs gains directement (versements quasi-instantanés, KYC géré par Stripe).</li>
                </ul>
            </section>

            <section className="mt-10" data-testid="terms-6">
                <h2 className="font-display text-2xl font-bold">6. Propriété intellectuelle</h2>
                <p className="mt-3 text-sm text-white/70">
                    Tu conserves la propriété de tout contenu que tu publies. En publiant, tu accordes à me&you une licence non exclusive, mondiale, gratuite, pour héberger, afficher, redimensionner, watermarker et distribuer ton contenu aux abonnés autorisés, dans la limite stricte du fonctionnement de la plateforme. Cette licence prend fin à la suppression du contenu (sauf si déjà déverrouillé par un Fan, auquel cas il reste accessible à ce Fan dans son historique).
                </p>
                <p className="mt-3 text-sm text-white/70">
                    Tu garantis être titulaire de tous les droits nécessaires sur le contenu publié (droit à l'image, droit d'auteur, droits voisins). me&you peut retirer tout contenu signalé pour atteinte aux droits d'un tiers (procédure DMCA via <a href="mailto:abuse@meandyou.fans" className="underline hover:text-white">abuse@meandyou.fans</a>).
                </p>
            </section>

            <section className="mt-10" data-testid="terms-7">
                <h2 className="font-display text-2xl font-bold">7. Comportements interdits</h2>
                <p className="mt-3 text-sm text-white/70">
                    Sont strictement interdits, en plus des contenus listés dans la <Link to="/legal/acceptable-use" className="underline hover:text-white">Politique d'utilisation acceptable</Link> :
                </p>
                <ul className="mt-3 space-y-2 text-sm text-white/70">
                    <li className="flex gap-3"><span className="text-red-400">✕</span><span>Utilisation de robots, scrapers, ou tout outil automatisé non autorisé.</span></li>
                    <li className="flex gap-3"><span className="text-red-400">✕</span><span>Tentatives d'accès non autorisé à la plateforme ou aux comptes d'autres utilisateurs.</span></li>
                    <li className="flex gap-3"><span className="text-red-400">✕</span><span>Capture, enregistrement, retransmission ou redistribution du contenu accessible derrière paywall.</span></li>
                    <li className="flex gap-3"><span className="text-red-400">✕</span><span>Création de comptes multiples, usurpation d'identité, fausses créatrices.</span></li>
                    <li className="flex gap-3"><span className="text-red-400">✕</span><span>Chargebacks abusifs (fraude au paiement) → bannissement définitif et signalement à Stripe.</span></li>
                </ul>
            </section>

            <section className="mt-10" data-testid="terms-8">
                <h2 className="font-display text-2xl font-bold flex items-center gap-2">
                    <AlertTriangle size={22} className="text-amber-400" />
                    8. Responsabilité
                </h2>
                <p className="mt-3 text-sm text-white/70">
                    me&you fournit la plateforme « en l'état », sans garantie de disponibilité ininterrompue. Notre responsabilité est limitée au montant payé par l'utilisateur sur les 12 derniers mois, dans la limite autorisée par la loi française. me&you n'est pas responsable du contenu publié par les créatrices ni des relations entre Fans et créatrices.
                </p>
            </section>

            <section className="mt-10" data-testid="terms-9">
                <h2 className="font-display text-2xl font-bold">9. Suspension, résiliation, suppression</h2>
                <ul className="mt-3 space-y-3 text-sm text-white/70">
                    <li><strong className="text-white">9.1 Par toi.</strong> Tu peux supprimer ton compte à tout moment depuis tes paramètres. Les coins non utilisés sont perdus (non remboursables côté Fan). Les gains créatrice non encore retirés peuvent être réclamés sous 30 jours.</li>
                    <li><strong className="text-white">9.2 Par me&you.</strong> Suspension immédiate en cas de violation des CGU, de la Politique d'utilisation acceptable, ou pour protéger les autres utilisateurs.</li>
                    <li><strong className="text-white">9.3 Conservation.</strong> Données conservées 3 ans après suppression à des fins comptables et légales (article L.123-22 Code de commerce).</li>
                </ul>
            </section>

            <section className="mt-10" data-testid="terms-10">
                <h2 className="font-display text-2xl font-bold flex items-center gap-2">
                    <CheckCircle2 size={22} className="text-green-400" />
                    10. Droit applicable et litiges
                </h2>
                <p className="mt-3 text-sm text-white/70">
                    Les présentes conditions sont régies par le <strong className="text-white">droit français</strong>. En cas de litige, une solution amiable sera recherchée par écrit auprès de <a href="mailto:legal@meandyou.fans" className="underline hover:text-white">legal@meandyou.fans</a>. À défaut, le litige sera porté devant les tribunaux compétents du ressort du siège social de me&you, sauf disposition légale contraire.
                </p>
                <p className="mt-3 text-sm text-white/70">
                    Conformément à l'article L.612-1 du Code de la consommation, tu peux recourir gratuitement à un médiateur de la consommation. Plateforme européenne de RLL : <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer" className="underline hover:text-white">ec.europa.eu/consumers/odr</a>.
                </p>
            </section>

            <section className="mt-10" data-testid="terms-11">
                <h2 className="font-display text-2xl font-bold">11. Évolution des conditions</h2>
                <p className="mt-3 text-sm text-white/70">
                    me&you peut modifier ces conditions. Toute modification substantielle est notifiée par email et bannière in-app au moins 14 jours avant l'entrée en vigueur. La poursuite de l'utilisation vaut acceptation.
                </p>
            </section>

            <div className="mt-16 rounded-2xl border border-white/5 bg-surface p-6 text-center text-sm text-white/60" data-testid="terms-footer-cta">
                <p>Une question juridique ?</p>
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
