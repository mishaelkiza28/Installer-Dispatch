import { useState, type FormEvent } from "react";
import { supabase, configured } from "../lib/supabaseClient";
import { Button, Input } from "./ui";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function signIn(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setError(error.message === "Invalid login credentials" ? "Wrong email or password." : error.message);
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <form onSubmit={signIn} className="w-full max-w-sm bg-surface border border-border rounded-xl p-6 space-y-4">
        <div>
          <h1 className="font-display text-xl">Dispatch console</h1>
          <p className="text-xs text-muted mt-1">Sign in to receive, assign and email work orders.</p>
        </div>
        {!configured && (
          <p className="text-xs text-[#e7877e]">This build has no Supabase URL/key — see .env.example.</p>
        )}
        <Input placeholder="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input
          placeholder="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-xs text-[#e7877e]">{error}</p>}
        <Button type="submit" variant="primary" disabled={loading} className="w-full">
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
