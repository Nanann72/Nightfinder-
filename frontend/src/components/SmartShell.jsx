import { useAuth } from "@/lib/auth";
import PublicLayout from "@/components/PublicLayout";
import AuthedShell from "@/components/AuthedShell";

/**
 * Picks the right shell based on auth state:
 * - Logged in → AuthedShell (3-column Fanvue style)
 * - Not logged in → PublicLayout (top Navbar + Footer)
 *
 * Used for hybrid pages that work for both audiences (e.g. /createurs, /live, /createur/:id).
 */
export default function SmartShell() {
    const { user, loading } = useAuth();
    if (loading) {
        return <div className="container-mx py-24 text-center text-white/40">Chargement…</div>;
    }
    return user ? <AuthedShell /> : <PublicLayout />;
}
