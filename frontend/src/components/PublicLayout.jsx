import { Outlet } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import BottomNav from "@/components/BottomNav";

/**
 * Public/marketing layout with the legacy top Navbar + Footer + mobile BottomNav.
 * Used for unauthenticated users and for marketing/legal/auth pages.
 */
export default function PublicLayout() {
    return (
        <div className="relative min-h-screen overflow-x-hidden pb-16 md:pb-0">
            <Navbar />
            <main className="relative z-10">
                <Outlet />
            </main>
            <Footer />
            <BottomNav />
        </div>
    );
}
