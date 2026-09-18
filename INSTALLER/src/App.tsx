import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Plus, Radio, Users } from "lucide-react";
import { supabase } from "./lib/supabaseClient";
import { useWorkOrders } from "./hooks/useWorkOrders";
import { WorkOrderBoard } from "./components/WorkOrderBoard";
import { NewWorkOrderModal } from "./components/NewWorkOrderModal";
import { TechnicianManager } from "./components/TechnicianManager";
import { NotificationTimeline } from "./components/NotificationTimeline";
import { LoginForm } from "./components/LoginForm";
import type { Technician } from "./types";

type View = "board" | "technicians";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [view, setView] = useState<View>("board");
  const [showNew, setShowNew] = useState(false);
  const [openTimelineFor, setOpenTimelineFor] = useState<string | null>(null);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const { workOrders, refresh } = useWorkOrders();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setCheckingSession(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    supabase
      .from("technicians")
      .select("*")
      .eq("active", true)
      .order("name")
      .then(({ data }) => data && setTechnicians(data as Technician[]));
  }, [session, view]);

  if (checkingSession) return null;
  if (!session) return <LoginForm />;

  return (
    <div className="min-h-screen flex">
      <aside className="w-52 shrink-0 bg-surface border-r border-border p-4 flex flex-col justify-between">
        <div className="space-y-6">
          <h1 className="font-display text-base">Dispatch</h1>
          <nav className="space-y-1">
            <button
              onClick={() => setView("board")}
              className={`w-full flex items-center gap-2 text-sm rounded px-2 py-1.5 ${
                view === "board" ? "bg-raised text-ink" : "text-muted"
              }`}
            >
              <Radio size={15} /> Board
            </button>
            <button
              onClick={() => setView("technicians")}
              className={`w-full flex items-center gap-2 text-sm rounded px-2 py-1.5 ${
                view === "technicians" ? "bg-raised text-ink" : "text-muted"
              }`}
            >
              <Users size={15} /> Technicians
            </button>
          </nav>
        </div>
        <button onClick={() => supabase.auth.signOut()} className="text-xs text-muted text-left">
          Sign out
        </button>
      </aside>

      <main className="flex-1 p-6 space-y-6">
        {view === "board" && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg">Work orders</h2>
              <button
                onClick={() => setShowNew(true)}
                className="flex items-center gap-1.5 text-sm bg-accent text-accent-ink rounded px-3 py-1.5 font-medium"
              >
                <Plus size={15} /> New work order
              </button>
            </div>
            <WorkOrderBoard
              workOrders={workOrders}
              technicians={technicians}
              onOpenTimeline={setOpenTimelineFor}
              onChanged={refresh}
            />
          </>
        )}

        {view === "technicians" && <TechnicianManager />}
      </main>

      {showNew && <NewWorkOrderModal onClose={() => setShowNew(false)} onCreated={refresh} />}
      {openTimelineFor && (
        <NotificationTimeline workOrderId={openTimelineFor} onClose={() => setOpenTimelineFor(null)} />
      )}
    </div>
  );
}
