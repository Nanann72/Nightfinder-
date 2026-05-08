/**
 * Avatar fallback helpers.
 * Generates a deterministic dicebear avatar when the creator/user has no
 * uploaded avatar_url, OR when the configured URL fails to load.
 */
const PALETTE = ["D946EF", "E879F9", "F472B6", "EC4899", "C026D3", "A21CAF"];

function pickColor(seed = "") {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return PALETTE[h % PALETTE.length];
}

/** Build a deterministic dicebear initials avatar URL. */
export function fallbackAvatarUrl(seed) {
    const safe = encodeURIComponent((seed || "?").trim() || "?");
    const bg = pickColor(seed || "");
    return `https://api.dicebear.com/7.x/initials/svg?seed=${safe}&backgroundColor=${bg}&textColor=ffffff&fontWeight=700`;
}

/** Returns the creator's avatar_url, or a fallback if none. */
export function avatarUrl(creator) {
    if (!creator) return fallbackAvatarUrl("?");
    return creator.avatar_url || creator.cover_url ||
        fallbackAvatarUrl(creator.display_name || creator.name || creator.handle || creator.email || "?");
}

/** onError handler that swaps to a fallback only once. Use as `onError={onAvatarError}`. */
export function onAvatarError(e) {
    if (e?.currentTarget && !e.currentTarget.dataset.fallback) {
        e.currentTarget.dataset.fallback = "1";
        const seed = e.currentTarget.alt || e.currentTarget.dataset.seed || "?";
        e.currentTarget.src = fallbackAvatarUrl(seed);
    }
}
