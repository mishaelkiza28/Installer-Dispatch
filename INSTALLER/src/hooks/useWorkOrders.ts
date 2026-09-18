import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { WorkOrder } from "../types";

export function useWorkOrders() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from("work_orders")
      .select("*, technicians(*)")
      .order("created_at", { ascending: false });
    if (!error && data) setWorkOrders(data as WorkOrder[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();

    // Live updates so a technician's SMS/WhatsApp reply moves their
    // card without anyone refreshing the page.
    const channel = supabase
      .channel("work_orders_live")
      .on("postgres_changes", { event: "*", schema: "public", table: "work_orders" }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "notification_log" }, () => refresh())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  return { workOrders, loading, refresh };
}
