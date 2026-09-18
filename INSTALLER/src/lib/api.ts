import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";

/** The console's own address — email links point back here. */
export function appUrl(): string {
  return window.location.origin + window.location.pathname;
}

export interface ActionResult<T = Record<string, unknown>> {
  ok: boolean;
  error?: string;
  warning?: string;
  data?: T;
}

async function invoke<T>(fn: string, body: Record<string, unknown>): Promise<ActionResult<T>> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      try {
        const payload = await error.context.json();
        return { ok: false, error: payload?.error ?? "Request failed", data: payload };
      } catch {
        return { ok: false, error: `Request failed (${error.context.status})` };
      }
    }
    return {
      ok: false,
      error: "Couldn't reach the server. Check your connection, and that the functions are deployed.",
    };
  }
  return { ok: Boolean(data?.ok), error: data?.error, warning: data?.warning, data };
}

type OfficeAction =
  | { action: "dispatch"; ids: string[] }
  | { action: "resend"; id: string }
  | { action: "recall"; id: string; reason?: string }
  | { action: "cancel"; id: string; reason?: string }
  | { action: "test_email" };

export function officeAction<T = Record<string, unknown>>(payload: OfficeAction) {
  return invoke<T>("work-order-action", { ...payload, app_url: appUrl() });
}

export function installerAction<T = Record<string, unknown>>(
  token: string,
  action: "view" | "accept" | "decline" | "on_site" | "done",
  note?: string,
) {
  return invoke<T>("installer-action", { token, action, note });
}
