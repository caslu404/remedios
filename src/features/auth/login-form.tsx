"use client";

import { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSending(true);
    setMessage("");
    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          shouldCreateUser: false,
        },
      });
      setMessage(error ? "Não foi possível enviar o link. Confira o e-mail e tente novamente." : "Link enviado. Abra-o neste mesmo iPhone; depois disso, o app mantém sua sessão.");
    } catch {
      setMessage("Sem conexão com o login agora. Confira a internet e tente novamente.");
    } finally {
      setSending(false);
    }
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <label htmlFor="email">E-mail</label>
      <input id="email" type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="seu@email.com" />
      <button className="primary-button" type="submit" disabled={sending}>{sending ? "Enviando…" : "Receber link de acesso"}</button>
      {message && <p className="form-message" role="status">{message}</p>}
    </form>
  );
}
