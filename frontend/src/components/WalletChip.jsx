import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Coins } from "lucide-react";

export default function WalletChip() {
    const { user } = useAuth();
    const [balance, setBalance] = useState(null);

    useEffect(() => {
        if (!user) { setBalance(null); return; }
        let cancelled = false;
        const tick = async () => {
            try {
                const { data } = await api.get("/wallet");
                if (!cancelled) setBalance(data.coin_balance);
            } catch {}
        };
        tick();
        const id = setInterval(tick, 15000);
        const handler = () => tick();
        window.addEventListener("wallet-refresh", handler);
        return () => { cancelled = true; clearInterval(id); window.removeEventListener("wallet-refresh", handler); };
    }, [user]);

    if (!user) return null;
    return (
        <Link
            to="/wallet"
            data-testid="wallet-chip"
            className="flex items-center gap-1.5 rounded-full border border-magenta/40 bg-magenta/10 px-3 py-1.5 text-xs font-semibold text-magenta-200 hover:border-magenta hover:bg-magenta/20"
        >
            <Coins size={14} className="text-magenta-400" />
            <span data-testid="wallet-balance" className="font-mono">{balance ?? "…"}</span>
        </Link>
    );
}

export const refreshWallet = () => {
    if (typeof window !== "undefined") window.dispatchEvent(new Event("wallet-refresh"));
};
