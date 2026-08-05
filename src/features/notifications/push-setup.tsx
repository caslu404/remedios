"use client";

import { useState } from "react";
import { BellRing, Send, Smartphone } from "lucide-react";

function base64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) output[index] = raw.charCodeAt(index);
  return output;
}

export function PushSetup({ demoMode }: { demoMode: boolean }) {
  const [standalone] = useState(() => typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true));
  const [status, setStatus] = useState<NotificationPermission | "unsupported">(() => typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported");
  const [message, setMessage] = useState("");

  async function enable() {
    if (demoMode) {
      setMessage("Configure Supabase e as chaves VAPID para ativar lembretes reais.");
      return;
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }
    const permission = await Notification.requestPermission();
    setStatus(permission);
    if (permission !== "granted") {
      setMessage("Permissão não concedida. Você ainda pode usar o cronograma no app.");
      return;
    }
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) {
      setMessage("Chave pública VAPID não configurada.");
      return;
    }
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ToUint8Array(publicKey) });
    const response = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription.toJSON()) });
    setMessage(response.ok ? "Lembretes ativados neste dispositivo." : "Não foi possível salvar este dispositivo.");
  }

  async function test() {
    const response = await fetch("/api/push/test", { method: "POST" });
    setMessage(response.ok ? "Notificação de teste enviada." : "O teste não pôde ser enviado.");
  }

  return (
    <div className="settings-card">
      <div className="card-title-row"><div><h2>Lembretes</h2><p>Web Push no iPhone exige instalação na Tela de Início.</p></div><span className={`status-dot ${status === "granted" ? "enabled" : ""}`}>{status === "granted" ? "Ativos" : "Inativos"}</span></div>
      {!standalone && <div className="install-tip"><Smartphone aria-hidden="true" /><div><strong>Instale primeiro no iPhone</strong><p>No Safari, toque em Compartilhar e depois em “Adicionar à Tela de Início”.</p></div></div>}
      <div className="button-row"><button className="primary-button button-with-icon" type="button" onClick={enable}><BellRing aria-hidden="true" /> Ativar lembretes</button>{status === "granted" && !demoMode && <button className="secondary-button button-with-icon" type="button" onClick={test}><Send aria-hidden="true" /> Enviar teste</button>}</div>
      {message && <p className="form-message" role="status">{message}</p>}
    </div>
  );
}
