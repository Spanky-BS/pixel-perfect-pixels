import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Anmelden – Haustechnik Nordwestschweiz" },
      { name: "description", content: "Anmeldung zur Baustellen-App von Haustechnik Nordwestschweiz." },
      { property: "og:title", content: "Anmelden – Haustechnik Nordwestschweiz" },
      { property: "og:description", content: "Anmeldung zur Baustellen-App von Haustechnik Nordwestschweiz." },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/uebersicht" });
  },
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/uebersicht" });
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("Bitte E-Mail bestätigen – Link wurde gesendet.");
        setMode("login");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler bei der Anmeldung");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (r.error) toast.error("Google-Anmeldung fehlgeschlagen");
    else if (!r.redirected) navigate({ to: "/uebersicht" });
  }

  return (
    <div className="flex min-h-screen flex-col bg-card px-6 pt-safe">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
        <div className="mb-10">
          <Brand large />
        </div>
        <h1 className="mb-1 text-xl font-bold">{mode === "login" ? "Anmelden" : "Konto erstellen"}</h1>
        <p className="mb-6 text-sm text-muted-foreground">Baustellenaufnahme & Materiallisten</p>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="field-label">E-Mail</label>
            <Input className="h-12 text-base" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="field-label">Passwort</label>
            <Input
              className="h-12 text-base"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={busy} className="h-12 w-full text-base font-semibold">
            {mode === "login" ? "Anmelden" : "Registrieren"}
          </Button>
        </form>
        <Button variant="outline" onClick={google} className="mt-3 h-12 w-full text-base">
          Weiter mit Google
        </Button>
        <button
          type="button"
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
          className="mt-6 h-11 text-sm font-medium text-primary"
        >
          {mode === "login" ? "Noch kein Konto? Registrieren" : "Bereits registriert? Anmelden"}
        </button>
      </div>
    </div>
  );
}
