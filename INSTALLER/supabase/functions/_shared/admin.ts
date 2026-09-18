import { createClient } from "npm:@supabase/supabase-js@2";

// SUPABASE_URL and the service key are injected into every Edge Function
// automatically. Newer projects may expose the key only through
// SUPABASE_SECRET_KEYS, so fall back to that.
function serviceKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    const k = keys.default ?? Object.values(keys)[0];
    if (typeof k === "string") return k;
  } catch {
    // fall through
  }
  throw new Error("No service key available to the function");
}

export const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

export interface Settings {
  company_name: string;
  office_phone: string | null;
  office_emails: string[];
  app_url: string | null;
}

export async function getSettings(): Promise<Settings> {
  const { data } = await admin.from("app_settings").select("*").eq("id", true).maybeSingle();
  return {
    company_name: data?.company_name ?? "Dispatch",
    office_phone: data?.office_phone ?? null,
    office_emails: data?.office_emails ?? [],
    app_url: data?.app_url ?? null,
  };
}

export async function logEvent(
  workOrderId: string,
  kind: string,
  actor: "office" | "installer" | "system",
  actorName: string | null,
  message: string | null,
) {
  await admin.from("work_order_events").insert({
    work_order_id: workOrderId,
    kind,
    actor,
    actor_name: actorName,
    message,
  });
}
