import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { NotificationLogEntry } from "../types";

export function NotificationTimeline({ workOrderId, onClose }: { workOrderId: string; onClose: () => void }) {
  const [entries, setEntries] = useState<NotificationLogEntry[]>([]);

  useEffect(() => {
    supabase
      .from("notification_log")
      .select("*")
      .eq("work_order_id", workOrderId)
      .order("created_at", { ascending: true })
      .then(({ data }) => data && setEntries(data as NotificationLogEntry[]));
  }, [workOrderId]);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-end z-50" onClick={onClose}>
      <div
        className="h-full w-full max-w-sm bg-surface border-l border-border p-5 space-y-4 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm">Notification log</h2>
          <button onClick={onClose} className="text-muted text-xs">
            Close
          </button>
        </div>

        {entries.length === 0 && <p className="text-xs text-muted">No notifications yet.</p>}

        <div className="space-y-3">
          {entries.map((e) => (
            <div key={e.id} className="border-l-2 border-border pl-3 space-y-0.5">
              <div className="flex items-center gap-2 text-xs text-muted">
                <span className="font-mono">{new Date(e.created_at).toLocaleString()}</span>
                <span>{e.channel}</span>
                <span>{e.direction === "outbound" ? "sent" : "received"}</span>
              </div>
              <p className="text-sm whitespace-pre-wrap">{e.body}</p>
              <p className="text-[11px] text-muted">{e.status}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
