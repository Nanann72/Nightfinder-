import { api } from "@/lib/api";

/**
 * Convert a base64url VAPID public key to Uint8Array for PushManager.subscribe.
 */
function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(base64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
    return out;
}

/**
 * Registers the push service worker, requests permission, subscribes, and
 * POSTs the subscription to the backend. Safe to call multiple times
 * (idempotent). Returns `{ subscribed:boolean, reason?:string }`.
 */
export async function ensurePushSubscription() {
    if (typeof window === "undefined") return { subscribed: false, reason: "no-window" };
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        return { subscribed: false, reason: "unsupported" };
    }
    // Fetch VAPID key
    let pub = "";
    try {
        const { data } = await api.get("/push/vapid-public-key");
        if (!data.enabled || !data.public_key) return { subscribed: false, reason: "vapid-disabled" };
        pub = data.public_key;
    } catch { return { subscribed: false, reason: "vapid-fetch-failed" }; }

    // Register service worker
    let reg;
    try {
        reg = await navigator.serviceWorker.register("/sw-push.js", { scope: "/" });
        await navigator.serviceWorker.ready;
    } catch (e) {
        return { subscribed: false, reason: "sw-register-failed" };
    }

    // Ask for permission if not already granted
    let perm = Notification.permission;
    if (perm === "default") {
        try { perm = await Notification.requestPermission(); } catch { perm = "denied"; }
    }
    if (perm !== "granted") return { subscribed: false, reason: "permission-denied" };

    // Subscribe (reuse existing subscription when possible)
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
        try {
            sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(pub),
            });
        } catch (e) {
            return { subscribed: false, reason: "subscribe-failed: " + e.message };
        }
    }

    // POST subscription to backend
    try {
        const json = sub.toJSON();
        await api.post("/push/subscribe", {
            endpoint: json.endpoint,
            keys: json.keys || {},
        });
    } catch { return { subscribed: false, reason: "backend-post-failed" }; }

    return { subscribed: true };
}

/** Unsubscribes locally and tells the backend. */
export async function unsubscribePush() {
    if (!("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && (await reg.pushManager.getSubscription());
    if (sub) {
        const endpoint = sub.endpoint;
        try { await sub.unsubscribe(); } catch { /* ignore */ }
        try { await api.post("/push/unsubscribe", { endpoint }); } catch { /* ignore */ }
    }
}
