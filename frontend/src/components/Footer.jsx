import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Shield, Heart, Mail } from "lucide-react";

export default function Footer() {
    const [config, setConfig] = useState(null);
    useEffect(() => {
        api.get("/site-config").then(r => setConfig(r.data)).catch(() => {});
    }, []);
    const tagline = config?.footer_tagline || "La plateforme exclusive pour fans et créateurs. Contenu premium, messagerie privée, expérience immersive — uniquement pour les adultes vérifiés.";
    const contactEmail = config?.contact_email;

    return (
        <footer data-testid="main-footer" className="relative z-10 mt-32 border-t border-white/5 bg-obsidian/80 backdrop-blur">
            <div className="container-mx py-16 grid gap-10 md:grid-cols-4">
                <div className="md:col-span-2">
                    <div className="font-display text-2xl font-extrabold">
                        me<span className="text-magenta">&</span>you
                    </div>
                    <p className="mt-4 max-w-sm text-sm text-white/60">
                        {tagline}
                    </p>
                    <div className="mt-6 flex items-center gap-2 text-xs text-white/40">
                        <Shield size={14} /> Identité vérifiée · Paiements sécurisés
                    </div>
                    {contactEmail && (
                        <a href={`mailto:${contactEmail}`} data-testid="footer-contact-email"
                           className="mt-3 inline-flex items-center gap-1.5 text-xs text-white/50 hover:text-white">
                            <Mail size={12} /> {contactEmail}
                        </a>
                    )}
                </div>
                <div>
                    <div className="overline mb-4">Plateforme</div>
                    <ul className="space-y-2 text-sm text-white/70">
                        <li><Link to="/createurs" className="hover:text-white">Créateurs</Link></li>
                        <li><Link to="/devenir-createur" className="hover:text-white">Devenir créateur</Link></li>
                        <li><Link to="/register" className="hover:text-white">Rejoindre</Link></li>
                    </ul>
                </div>
                <div>
                    <div className="overline mb-4">Légal</div>
                    <ul className="space-y-2 text-sm text-white/70">
                        <li><Link to="/legal/acceptable-use" data-testid="footer-link-aup" className="hover:text-white">Politique d'utilisation</Link></li>
                        <li><Link to="/legal/terms" data-testid="footer-link-terms" className="hover:text-white">Conditions d'utilisation</Link></li>
                        <li><Link to="/legal/privacy" data-testid="footer-link-privacy" className="hover:text-white">Confidentialité</Link></li>
                        <li><Link to="/dmca" data-testid="footer-link-dmca" className="hover:text-white">Signalement DMCA</Link></li>
                    </ul>
                </div>
            </div>
            <div className="border-t border-white/5 py-6">
                <div className="container-mx flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-white/40">
                    <span>© {new Date().getFullYear()} me&you — Tous droits réservés</span>
                    <span className="flex items-center gap-1.5">
                        Construit avec <Heart size={12} className="fill-magenta text-magenta" /> à Paris
                    </span>
                </div>
            </div>
        </footer>
    );
}
