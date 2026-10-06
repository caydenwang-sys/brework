import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { importPKCS8, SignJWT } from "npm:jose@6";

let cachedJwt = "";
let jwtCreatedAt = 0;
type Environment = "sandbox" | "production";

function requiredSecret(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing secret: ${name}`);
  return value;
}

async function appleJwt(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && now - jwtCreatedAt < 3000) return cachedJwt;
  const privateKey = requiredSecret("APNS_PRIVATE_KEY").replace(/\\n/g, "\n").trim();
  const key = await importPKCS8(privateKey, "ES256");
  cachedJwt = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: requiredSecret("APNS_KEY_ID") })
    .setIssuer(requiredSecret("APNS_TEAM_ID"))
    .setIssuedAt(now)
    .sign(key);
  jwtCreatedAt = now;
  return cachedJwt;
}

export default {
  async fetch(req: Request): Promise<Response> {
    if (req.method !== "POST") {
      return Response.json({ error: "POST required" }, { status: 405 });
    }
    try {
      if (req.headers.get("x-webhook-secret") !== requiredSecret("PUSH_WEBHOOK_SECRET")) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
      const payload = await req.json();
      if (payload.type && (payload.type !== "INSERT" || payload.schema !== "public" || payload.table !== "notifications")) {
        return Response.json({ skipped: "Unrelated event" });
      }
      const notificationId = payload.record?.id ?? payload.notification_id;
      if (!/^[0-9]+$/.test(String(notificationId ?? ""))) {
        return Response.json({ error: "Valid notification ID required" }, { status: 400 });
      }
      const supabase = createClient(
        requiredSecret("SUPABASE_URL"), requiredSecret("SUPABASE_SERVICE_ROLE_KEY"),
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      const { data: notification, error: notificationError } = await supabase
        .from("notifications").select("id,user_id,title,message,is_read")
        .eq("id", notificationId).maybeSingle();
      if (notificationError) throw notificationError;
      if (!notification) return Response.json({ error: "Notification not found" }, { status: 404 });
      if (notification.is_read) return Response.json({ skipped: "Already read" });
      const { data: devices, error: tokenError } = await supabase
        .from("push_tokens").select("token").eq("user_id", notification.user_id);
      if (tokenError) throw tokenError;
      if (!devices?.length) return Response.json({ sent: 0, skipped: "No registered devices" });

      // Use the database's unread count, rather than incrementing a device counter.
      const { count: unreadCount, error: badgeError } = await supabase
        .from("notifications").select("id", { count: "exact", head: true })
        .eq("user_id", notification.user_id).eq("is_read", false);
      // A count failure must not prevent the existing alert from being delivered.
      if (badgeError) console.error("Could not count unread notifications:", badgeError.message);

      const preferred = requiredSecret("APNS_ENVIRONMENT");
      if (preferred !== "sandbox" && preferred !== "production") throw new Error("Invalid APNS_ENVIRONMENT");
      const alternate: Environment = preferred === "sandbox" ? "production" : "sandbox";
      const jwt = await appleJwt();
      const bundleId = requiredSecret("APNS_BUNDLE_ID");
      const body = JSON.stringify({
        aps: {
          alert: {
            title: String(notification.title || "Brework").slice(0, 150),
            body: String(notification.message || "You have a new notification.").slice(0, 500),
          },
          sound: "default",
          ...(!badgeError && unreadCount !== null ? { badge: unreadCount } : {}),
        },
        notification_id: String(notification.id),
      });
      const client = Deno.createHttpClient({ http1: false, http2: true });
      async function sendToApple(token: string, environment: Environment) {
        const host = environment === "sandbox" ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com";
        const response = await fetch(`${host}/3/device/${encodeURIComponent(token)}`, {
          method: "POST", client, signal: AbortSignal.timeout(8000),
          headers: {
            authorization: `bearer ${jwt}`, "apns-topic": bundleId,
            "apns-push-type": "alert", "apns-priority": "10", "content-type": "application/json",
          },
          body,
        });
        const responseText = await response.text();
        let reason = "";
        if (responseText) {
          try { reason = JSON.parse(responseText).reason || ""; }
          catch { reason = "Unexpected Apple response"; }
        }
        return { status: response.status, reason, environment };
      }
      const results: Array<{ status: number; reason: string; environment: Environment }> = [];
      try {
        for (const device of devices) {
          try {
            let result = await sendToApple(device.token, preferred);
            // Retry only an explicit token rejection, never an accepted or timed-out request.
            if (result.status === 400 && result.reason === "BadDeviceToken") {
              result = await sendToApple(device.token, alternate);
            }
            results.push(result);
          } catch (error) {
            console.error("Device delivery failed:", error instanceof Error ? error.message : "Unknown error");
            results.push({ status: 0, reason: "Network request failed", environment: preferred });
          }
        }
      } finally { client.close(); }
      const sent = results.filter(result => result.status === 200).length;
      console.info("Push delivery result", { notificationId, sent, results });
      return Response.json({ sent, results }, { status: sent === results.length ? 200 : 502 });
    } catch (error) {
      console.error("Push sender failed:", error instanceof Error ? error.message : "Unknown error");
      return Response.json({ error: "Push sender failed; check function logs" }, { status: 500 });
    }
  },
};
