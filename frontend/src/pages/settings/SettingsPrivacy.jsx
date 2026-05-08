import { Link } from "react-router-dom";
import { Lock, Shield, FileText, Cookie, Mail } from "lucide-react";

export default function SettingsPrivacy() {
    return (
        <div className="space-y-6" data-testid="settings-privacy">
            <header>
                <h2 className="font-display text-2xl font-bold">Confidentialité</h2>
                <p className="mt-1 text-sm text-white/55">Tes données, tes droits.</p>
            </header>

            <div className="surface-card">
                <div className="overline mb-4 flex items-center gap-1.5"><Shield size={11} /> Tes droits RGPD</div>
                <ul className="space-y-3 text-sm text-white/70">
                    <li className="flex items-start gap-3">
                        <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-magenta" />
                        <span><strong className="text-white">Droit d'accès :</strong> tu peux demander un export de tes données par email.</span>
                    </li>
                    <li className="flex items-start gap-3">
                        <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-magenta" />
                        <span><strong className="text-white">Droit de rectification :</strong> tu peux modifier ton profil dans <Link to="/settings/profile" className="text-magenta-200 underline hover:text-white">Profil public</Link>.</span>
                    </li>
                    <li className="flex items-start gap-3">
                        <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-magenta" />
                        <span><strong className="text-white">Droit à l'oubli :</strong> tu peux supprimer ton compte (voir <Link to="/settings/delete" className="text-red-300 underline hover:text-red-200">Supprimer le compte</Link>).</span>
                    </li>
                    <li className="flex items-start gap-3">
                        <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-magenta" />
                        <span><strong className="text-white">Droit de portabilité :</strong> demande un export structuré JSON.</span>
                    </li>
                </ul>
                <div className="mt-5 rounded-2xl border border-white/5 bg-white/[0.02] p-3 text-xs text-white/60 flex items-center gap-2">
                    <Mail size={12} /> Pour toute demande RGPD : <a href="mailto:privacy@meandyou.fans" className="text-magenta-200 hover:text-white">privacy@meandyou.fans</a>
                </div>
            </div>

            <div className="surface-card">
                <div className="overline mb-4 flex items-center gap-1.5"><Cookie size={11} /> Cookies</div>
                <p className="text-sm text-white/60">Nous utilisons uniquement des cookies essentiels (auth, panier, préférence langue). Aucun tracking publicitaire tiers.</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
                <Link to="/legal/privacy" data-testid="settings-link-privacy" className="surface-card !p-4 flex items-center gap-3 transition-all hover:border-magenta/40">
                    <Lock size={16} className="text-magenta-200 shrink-0" />
                    <span className="text-sm font-semibold">Politique de confidentialité</span>
                </Link>
                <Link to="/legal/terms" data-testid="settings-link-terms" className="surface-card !p-4 flex items-center gap-3 transition-all hover:border-magenta/40">
                    <FileText size={16} className="text-magenta-200 shrink-0" />
                    <span className="text-sm font-semibold">Conditions d'utilisation</span>
                </Link>
                <Link to="/legal/acceptable-use" data-testid="settings-link-aup" className="surface-card !p-4 flex items-center gap-3 transition-all hover:border-magenta/40">
                    <Shield size={16} className="text-magenta-200 shrink-0" />
                    <span className="text-sm font-semibold">Politique d'utilisation</span>
                </Link>
            </div>
        </div>
    );
}
