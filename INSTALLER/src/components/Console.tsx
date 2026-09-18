import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { FileUp, LayoutGrid, LogOut, Plus, Settings, Users } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useInstallers, useSettings, useWorkOrders } from "../hooks/useData";
import { useActions } from "../hooks/useActions";
import { Board } from "./Board";
import { WorkOrderDrawer } from "./WorkOrderDrawer";
import { WorkOrderForm } from "./WorkOrderForm";
import { InstallersView } from "./InstallersView";
import { ImportView } from "./ImportView";
import { SettingsView } from "./SettingsView";
import { Button } from "./ui";

type View = "board" | "installers" | "import" | "settings";

const NAV: { key: View; label: string; icon: typeof LayoutGrid }[] = [
  { key: "board", label: "Board", icon: LayoutGrid },
  { key: "installers", label: "Installers", icon: Users },
  { key: "import", label: "Import", icon: FileUp },
  { key: "settings", label: "Settings", icon: Settings },
];

const TITLES: Record<View, string> = {
  board: "Work orders",
  installers: "Installers",
  import: "Import work orders",
  settings: "Settings",
};

function readView(): View {
  try {
    const v = localStorage.getItem("dispatch.view") as View | null;
    return v && v in TITLES ? v : "board";
  } catch {
    return "board";
  }
}

export function Console({ session }: { session: Session }) {
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.rpc("is_dispatcher").then(({ data, error }) => setAllowed(!error && data === true));
  }, [session.user.id]);

  if (allowed === null) return <div className="min-h-screen flex items-center justify-center text-sm text-muted">Loading…</div>;
  if (!allowed) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-sm bg-surface border border-border rounded-lg p-6 space-y-3 text-sm">
          <h1 className="font-display text-lg">Not on the dispatchers list</h1>
          <p className="text-muted">
            You're signed in as <b className="text-ink">{session.user.email}</b>, but this email hasn't been added as a dispatcher. Ask
            an existing dispatcher to add it under Settings.
          </p>
          <Button onClick={() => supabase.auth.signOut()}>Sign out</Button>
        </div>
      </div>
    );
  }
  return <ConsoleInner session={session} />;
}

function ConsoleInner({ session }: { session: Session }) {
  const { workOrders, loading, error, refresh } = useWorkOrders();
  const { installers, refresh: refreshInstallers } = useInstallers();
  const { settings, refresh: refreshSettings } = useSettings();
  const [view, setViewState] = useState<View>(readView);
  const [showNew, setShowNew] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const actions = useActions(refresh);
  const open = workOrders.find((w) => w.id === openId) ?? null;

  function setView(v: View) {
    setViewState(v);
    try {
      localStorage.setItem("dispatch.view", v);
    } catch {
      // private mode — fine
    }
  }

  return (
    <div className="min-h-screen md:flex">
      {/* Sidebar (desktop) / top bar (mobile) */}
      <aside className="md:w-52 md:shrink-0 bg-surface border-b md:border-b-0 md:border-r border-border md:min-h-screen md:sticky md:top-0 md:h-screen flex md:flex-col justify-between">
        <div className="flex md:flex-col md:space-y-6 w-full">
          <div className="hidden md:block px-4 pt-5">
            <p className="font-display text-base leading-tight">{settings?.company_name ?? "Dispatch"}</p>
            <p className="text-[11px] text-muted">Work order dispatch</p>
          </div>
          <nav className="flex md:flex-col gap-1 p-2 md:px-3 w-full overflow-x-auto">
            {NAV.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setView(key)}
                className={`flex items-center gap-2 text-sm rounded-md px-3 py-2 whitespace-nowrap ${
                  view === key ? "bg-raised text-ink" : "text-muted hover:text-ink"
                }`}
              >
                <Icon size={15} /> {label}
              </button>
            ))}
          </nav>
        </div>
        <div className="hidden md:block p-4 space-y-1">
          <p className="text-[11px] text-muted truncate" title={session.user.email}>
            {session.user.email}
          </p>
          <button onClick={() => supabase.auth.signOut()} className="text-xs text-muted hover:text-ink flex items-center gap-1.5">
            <LogOut size={12} /> Sign out
          </button>
        </div>
        <button
          onClick={() => supabase.auth.signOut()}
          className="md:hidden text-muted px-3"
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut size={16} />
        </button>
      </aside>

      <main className="flex-1 min-w-0 p-4 md:p-6 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-lg">{TITLES[view]}</h1>
          {view === "board" && (
            <Button variant="primary" onClick={() => setShowNew(true)}>
              <Plus size={15} /> New work order
            </Button>
          )}
        </div>

        {error && (
          <p className="text-sm text-[#e7877e] bg-status-cancelled/10 border border-status-cancelled/30 rounded-md px-3 py-2">
            Couldn't load work orders: {error}
          </p>
        )}

        {view === "board" &&
          (loading ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : (
            <>
              {installers.length === 0 && workOrders.length === 0 && (
                <div className="bg-surface border border-border rounded-lg p-4 text-sm space-y-2">
                  <p className="font-display">Getting started</p>
                  <ol className="list-decimal pl-5 text-muted space-y-1">
                    <li>
                      Add your installers on the{" "}
                      <button className="text-accent underline" onClick={() => setView("installers")}>
                        Installers
                      </button>{" "}
                      page — name and email is enough.
                    </li>
                    <li>
                      Create a work order here, or{" "}
                      <button className="text-accent underline" onClick={() => setView("import")}>
                        import a spreadsheet
                      </button>
                      .
                    </li>
                    <li>Assign an installer and click Email. They accept or decline from the email; this board updates by itself.</li>
                  </ol>
                </div>
              )}
              <Board workOrders={workOrders} installers={installers} actions={actions} onOpen={setOpenId} />
            </>
          ))}

        {view === "installers" && (
          <InstallersView
            installers={installers}
            workOrders={workOrders}
            onChanged={() => {
              refreshInstallers();
              refresh();
            }}
          />
        )}

        {view === "import" && (
          <ImportView installers={installers} actions={actions} onImported={refresh} goToBoard={() => setView("board")} />
        )}

        {view === "settings" && (
          <SettingsView settings={settings} myEmail={session.user.email ?? ""} onChanged={refreshSettings} />
        )}
      </main>

      {showNew && <WorkOrderForm installers={installers} onClose={() => setShowNew(false)} onSaved={refresh} />}
      {open && (
        <WorkOrderDrawer
          wo={open}
          installers={installers}
          actions={actions}
          onClose={() => setOpenId(null)}
          onChanged={refresh}
        />
      )}
      {actions.node}
    </div>
  );
}
