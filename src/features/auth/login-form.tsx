"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle, RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const started = useRef(false);
  const [failed, setFailed] = useState(false);
  const [message, setMessage] = useState("Preparando seu app neste iPhone…");

  const openApp = useCallback(async () => {
    setFailed(false);
    setMessage("Preparando seu app neste iPhone…");

    try {
      const supabase = createBrowserSupabaseClient();
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      if (!sessionData.session) {
        const { error } = await supabase.auth.signInAnonymously({
          options: { data: { name: "Lucas" } },
        });
        if (error) throw error;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setFailed(true);
      setMessage("Não foi possível abrir o app agora. Confira a internet e tente novamente.");
    }
  }, [router]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void openApp();
  }, [openApp]);

  return (
    <div className="login-form" role="status" aria-live="polite">
      <p className="form-message button-with-icon">
        {!failed && <LoaderCircle className="loading-icon" aria-hidden="true" />}
        {message}
      </p>
      {failed && (
        <button className="primary-button button-with-icon" type="button" onClick={() => void openApp()}>
          <RotateCw aria-hidden="true" /> Tentar novamente
        </button>
      )}
    </div>
  );
}
