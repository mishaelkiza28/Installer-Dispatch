import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { AppSettings, Installer, WorkOrder, WorkOrderEvent } from "../types";

export const WORK_ORDER_SELECT =
  "*, assignee:installers!work_orders_assigned_to_fkey(id, name, email, active), decliner:installers!work_orders_last_declined_by_fkey(name)";

/** All work orders, kept live: an installer's click moves the card without a refresh. */
export function useWorkOrders() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from("work_orders")
      .select(WORK_ORDER_SELECT)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) setError(error.message);
    else {
      setError(null);
      setWorkOrders((data ?? []) as WorkOrder[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    // Debounce bursts (bulk import / bulk dispatch fire many change events).
    const soon = () => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(refresh, 300);
    };
    const channel = supabase
      .channel("work_orders_live")
      .on("postgres_changes", { event: "*", schema: "public", table: "work_orders" }, soon)
      .subscribe();
    // Fallback in case the realtime socket drops (e.g. laptop asleep).
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener("focus", onFocus);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [refresh]);

  return { workOrders, loading, error, refresh };
}

export function useInstallers() {
  const [installers, setInstallers] = useState<Installer[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data } = await supabase.from("installers").select("*").order("name");
    setInstallers((data ?? []) as Installer[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { installers, loading, refresh };
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from("app_settings")
      .select("company_name, office_phone, office_emails, app_url")
      .eq("id", true)
      .maybeSingle();
    if (data) setSettings(data as AppSettings);
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return { settings, refresh };
}

export function useEvents(workOrderId: string | null) {
  const [events, setEvents] = useState<WorkOrderEvent[]>([]);

  const refresh = useCallback(async () => {
    if (!workOrderId) return;
    const { data } = await supabase
      .from("work_order_events")
      .select("*")
      .eq("work_order_id", workOrderId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
    setEvents((data ?? []) as WorkOrderEvent[]);
  }, [workOrderId]);

  useEffect(() => {
    setEvents([]);
    if (!workOrderId) return;
    refresh();
    const channel = supabase
      .channel(`events_${workOrderId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "work_order_events", filter: `work_order_id=eq.${workOrderId}` },
        () => refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [workOrderId, refresh]);

  return { events, refresh };
}
