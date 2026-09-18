import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabaseClient";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function signIn(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <form onSubmit={signIn} className="w-full max-w-sm bg-surface border border-border rounded-lg p-6 space-y-4">
        <div>
          <h1 className="font-display text-xl">Dispatch console</h1>
          <p className="text-xs text-muted mt-1">Sign in to assign and dispatch work orders.</p>
        </div>
        <input
          className="w-full bg-raised border border-border rounded px-3 py-2 text-sm"
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="w-full bg-raised border border-border rounded px-3 py-2 text-sm"
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-xs text-status-cancelled">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-accent text-accent-ink rounded px-3 py-2 text-sm font-medium disabled:opacity-50"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
