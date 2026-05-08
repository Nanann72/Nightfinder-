import { Link } from "react-router-dom";
import { CreditCard, Wallet as WalletIcon, ArrowRight, Building2, Coins } from "lucide-react";
import { useAuth } from "@/lib/auth";

/**
 * Hub Paiements — pointe vers /wallet (cards + auto-reload + packs)
 * et /bank (IBAN créatrice).
 */
export default function SettingsPayments() {
    const { user } = useAuth();
    const isCreator = user?.role === "creator";

    return (
        <div className="space-y-6" data-testid="settings-payments">
            <header>
                <h2 className="font-display text-2xl font-bold">Paiements & wallet</h2>
                <p className="mt-1 text-sm text-white/55">Gère tes coins, tes cartes et ton compte bancaire.</p>
            </header>

            <Link to="/wallet" data-testid="settings-link-wallet" className="block">
                <div className="surface-card transition-all hover:border-magenta/40 hover:bg-[var(--bg-elevated)]">
                    <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-magenta/30 bg-magenta/15 text-magenta-200">
                            <WalletIcon size={20} />
                        </div>
                        <div className="flex-1">
                            <div className="font-display text-lg font-semibold">Wallet & coins</div>
                            <div className="text-xs text-white/50">Solde, packs, transactions, badges fidélité</div>
                        </div>
                        <ArrowRight size={18} className="text-magenta-200" />
                    </div>
                </div>
            </Link>

            <Link to="/wallet#cards" data-testid="settings-link-cards" className="block">
                <div className="surface-card transition-all hover:border-magenta/40 hover:bg-[var(--bg-elevated)]">
                    <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-white/70">
                            <CreditCard size={20} />
                        </div>
                        <div className="flex-1">
                            <div className="font-display text-lg font-semibold">Cartes enregistrées</div>
                            <div className="text-xs text-white/50">Pour la recharge automatique</div>
                        </div>
                        <ArrowRight size={18} className="text-magenta-200" />
                    </div>
                </div>
            </Link>

            <Link to="/parrainage" data-testid="settings-link-referral" className="block">
                <div className="surface-card transition-all hover:border-magenta/40 hover:bg-[var(--bg-elevated)]">
                    <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/15 text-amber-200">
                            <Coins size={20} />
                        </div>
                        <div className="flex-1">
                            <div className="font-display text-lg font-semibold">Parrainage</div>
                            <div className="text-xs text-white/50">Gagne des coins gratuits en invitant des ami·e·s</div>
                        </div>
                        <ArrowRight size={18} className="text-magenta-200" />
                    </div>
                </div>
            </Link>

            {isCreator && (
                <Link to="/bank" data-testid="settings-link-bank" className="block">
                    <div className="surface-card transition-all hover:border-magenta/40 hover:bg-[var(--bg-elevated)]">
                        <div className="flex items-center gap-4">
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                                <Building2 size={20} />
                            </div>
                            <div className="flex-1">
                                <div className="font-display text-lg font-semibold">Compte bancaire (IBAN)</div>
                                <div className="text-xs text-white/50">Pour recevoir tes retraits SEPA</div>
                            </div>
                            <ArrowRight size={18} className="text-magenta-200" />
                        </div>
                    </div>
                </Link>
            )}
        </div>
    );
}
