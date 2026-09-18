import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabaseClient";
import { Console } from "./components/Console";
import { LoginForm } from "./components/LoginForm";
import { InstallerJobPage } from "./pages/InstallerJobPage";
import { ToastProvider } from "./components/ui";

/** "#/job/<token>?a=accept" → { token, action } */
function parseJobHash(hash: string): { token: string; action: string | null } | null {
  const m = hash.match(/^#\/job\/([A-Za-z0-9_-]+)(?:\?(.*))?$/);
  if (!m) return null;
  const params = new URLSearchParams(m[2] ?? "");
  return { token: m[1], action: params.get("a") };
}

export default function App() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const job = parseJobHash(hash);
  if (job) return <InstallerJobPage token={job.token} initialAction={job.action} />;

  return (
    <ToastProvider>
      <DispatcherApp />
    </ToastProvider>
  );
}

function DispatcherApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecking(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (checking) return null;
  if (!session) return <LoginForm />;
  return <Console session={session} />;
}
