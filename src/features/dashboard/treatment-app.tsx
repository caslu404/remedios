"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CircleAlert,
  Cloud,
  CloudOff,
  Download,
  History,
  House,
  Info,
  ListChecks,
  LogOut,
  Save,
  Settings,
  ShieldCheck,
  Sun,
  Trash2,
  Utensils,
  X,
  type LucideIcon,
} from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import {
  INITIAL_TREATMENT_PHASES,
  formatClock,
  generateDailySchedule,
  recalculateAfterDoseTaken,
  type DailySchedule,
  type DoseRecord,
} from "@/domain/scheduling";
import {
  flushOfflineEvents,
  getAllSchedules,
  getPreference,
  getSchedule,
  queueOfflineEvent,
  saveSchedule,
  setPreference,
  type OfflineEvent,
} from "@/lib/offline/db";
import { PushSetup } from "@/features/notifications/push-setup";

type Tab = "today" | "history" | "rules" | "settings";

interface Preferences {
  acceptedNotice: boolean;
  name: string;
  usualBedtime: string;
  breakfastStart: string;
  breakfastEnd: string;
  dinnerStart: string;
  dinnerEnd: string;
}

const DEFAULT_PREFERENCES: Preferences = {
  acceptedNotice: false,
  name: "Lucas",
  usualBedtime: "23:30",
  breakfastStart: "07:00",
  breakfastEnd: "08:30",
  dinnerStart: "18:30",
  dinnerEnd: "20:30",
};

function nowInSaoPaulo(): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return { date: `${value("year")}-${value("month")}-${value("day")}`, time: `${value("hour")}:${value("minute")}` };
}

function displayDate(date: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "long", day: "2-digit", month: "long" }).format(new Date(`${date}T12:00:00Z`));
}

function event(type: OfflineEvent["type"], payload: Record<string, unknown>): OfflineEvent {
  return { id: crypto.randomUUID(), type, payload, createdAt: new Date().toISOString() };
}

function phaseLabel(date: string): string {
  if (date < "2026-08-06") return "Tratamento ainda não iniciado";
  if (date <= "2026-08-19") return "Fase intensiva · dia em andamento";
  if (date === "2026-08-20") return "Transição · último dia da Fase 1";
  if (date <= "2026-09-04") return "Fase 2 · com óleo de orégano";
  if (date <= "2026-10-04") return "Fase 2 · manutenção";
  return "Uso contínuo";
}

function doseStateLabel(status: DoseRecord["status"]): string {
  const labels: Record<DoseRecord["status"], string> = {
    planned: "Planejada",
    notified: "Lembrete enviado",
    snoozed: "Lembrete adiado",
    taken_on_time: "Tomada no horário",
    taken_late: "Tomada com atraso",
    taken_early: "Tomada antecipada",
    skipped: "Não tomada",
    missed: "Pendente de revisão",
    cancelled_by_schedule_change: "Substituída pelo cronograma",
    requires_review: "Requer revisão",
  };
  return labels[status];
}

export function TreatmentApp({ demoMode }: { demoMode: boolean }) {
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [schedule, setSchedule] = useState<DailySchedule | null>(null);
  const [history, setHistory] = useState<DailySchedule[]>([]);
  const [tab, setTab] = useState<Tab>("today");
  const [loading, setLoading] = useState(true);
  const [manualWake, setManualWake] = useState(nowInSaoPaulo().time);
  const [online, setOnline] = useState(true);
  const [notice, setNotice] = useState("");
  const [selectedDose, setSelectedDose] = useState<string | null>(null);
  const [clockTick, setClockTick] = useState(0);
  const today = nowInSaoPaulo().date;

  const reloadHistory = useCallback(async () => {
    const rows = await getAllSchedules();
    setHistory(rows.sort((a, b) => b.date.localeCompare(a.date)));
  }, []);

  useEffect(() => {
    async function boot() {
      const storedPreferences = await getPreference<Preferences>("preferences");
      if (storedPreferences) setPreferences(storedPreferences);
      let localSchedule = (await getSchedule(today)) ?? null;
      setSchedule(localSchedule);
      await reloadHistory();
      setOnline(navigator.onLine);
      if (!demoMode && navigator.onLine) {
        await flushOfflineEvents();
        const [todayResponse, historyResponse] = await Promise.all([fetch("/api/schedules/today"), fetch("/api/history?limit=90")]);
        if (todayResponse.ok) {
          const remote = await todayResponse.json() as { schedule: DailySchedule | null };
          if (remote.schedule && (!localSchedule || remote.schedule.version >= localSchedule.version)) {
            localSchedule = remote.schedule;
            setSchedule(remote.schedule);
            await saveSchedule(remote.schedule);
          }
        }
        if (historyResponse.ok) {
          const remote = await historyResponse.json() as { schedules: Array<{ snapshot_json: DailySchedule }> };
          for (const item of [...remote.schedules].reverse()) await saveSchedule(item.snapshot_json);
          await reloadHistory();
        }
      }
      setLoading(false);
    }
    void boot();
  }, [demoMode, reloadHistory, today]);

  useEffect(() => {
    const interval = window.setInterval(() => setClockTick(Date.now()), 30_000);
    const handleOnline = () => {
      setOnline(true);
      if (!demoMode) void flushOfflineEvents().then((count) => count && setNotice(`${count} registro(s) sincronizado(s).`));
    };
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [demoMode]);

  async function persistEvent(item: OfflineEvent) {
    if (demoMode) return;
    await queueOfflineEvent(item);
    if (navigator.onLine) await flushOfflineEvents();
  }

  async function acceptNotice() {
    const updated = { ...preferences, acceptedNotice: true };
    setPreferences(updated);
    await setPreference("preferences", updated);
  }

  async function startDay(wakeTime: string) {
    const generated = generateDailySchedule({
      date: today,
      timezone: "America/Sao_Paulo",
      wakeTime,
      plannedBedtime: preferences.usualBedtime,
      breakfastWindow: { start: preferences.breakfastStart, end: preferences.breakfastEnd },
      dinnerWindow: { start: preferences.dinnerStart, end: preferences.dinnerEnd },
      phases: INITIAL_TREATMENT_PHASES,
    });
    setSchedule(generated);
    await saveSchedule(generated);
    await reloadHistory();
    await persistEvent(event("day_started", { date: today, wakeTime, preferences }));
    setNotice("Seu cronograma de hoje está pronto. Revise os conflitos antes de confirmar.");
  }

  async function confirmDay() {
    if (!schedule) return;
    const confirmed = { ...schedule, status: schedule.status === "requires_review" ? "requires_review" as const : "confirmed" as const };
    setSchedule(confirmed);
    await saveSchedule(confirmed);
    await persistEvent(event("schedule_confirmed", { date: schedule.date }));
    setNotice(schedule.status === "requires_review" ? "Dia salvo com itens que ainda exigem revisão." : "Dia confirmado. Os lembretes foram preparados.");
  }

  async function takeDose(dose: DoseRecord, takenTime: string) {
    if (!schedule) return;
    const updated = recalculateAfterDoseTaken({ doseId: dose.id, takenTime }, schedule, INITIAL_TREATMENT_PHASES);
    setSchedule(updated);
    setSelectedDose(null);
    await saveSchedule(updated);
    await reloadHistory();
    await persistEvent(event("dose_taken", { date: schedule.date, doseClientId: dose.id, takenTime }));
    const moved = updated.doses.some((item, index) => item.scheduledMinute !== schedule.doses[index]?.scheduledMinute);
    setNotice(moved ? "Dose registrada e horários futuros atualizados dentro das regras confirmadas." : "Dose registrada. Nenhum horário futuro foi alterado automaticamente.");
  }

  async function skipDose(dose: DoseRecord) {
    if (!schedule) return;
    const updated: DailySchedule = {
      ...schedule,
      version: schedule.version + 1,
      doses: schedule.doses.map((item) => item.id === dose.id ? { ...item, status: "skipped" as const } : item),
    };
    setSchedule(updated);
    setSelectedDose(null);
    await saveSchedule(updated);
    await reloadHistory();
    await persistEvent(event("dose_skipped", { date: schedule.date, doseClientId: dose.id }));
    setNotice("Registrado como não tomado. Nenhuma compensação foi criada.");
  }

  async function snoozeDose(dose: DoseRecord) {
    if (!schedule) return;
    const updated = { ...schedule, doses: schedule.doses.map((item) => item.id === dose.id ? { ...item, status: "snoozed" as const } : item) };
    setSchedule(updated);
    setSelectedDose(null);
    await saveSchedule(updated);
    await persistEvent(event("dose_snoozed", { date: schedule.date, doseClientId: dose.id, minutes: 10 }));
    setNotice("Lembrete adiado por 10 minutos. O horário prescrito não foi alterado.");
  }

  async function savePreferences(updated: Preferences) {
    setPreferences(updated);
    await setPreference("preferences", updated);
    setNotice("Preferências salvas. O cronograma atual não foi alterado.");
  }

  function exportData() {
    if (!demoMode) {
      const link = document.createElement("a");
      link.href = "/api/export";
      link.download = `tratamento-adaptativo-${today}.json`;
      link.click();
      return;
    }
    const content = JSON.stringify({ exportedAt: new Date().toISOString(), preferences, schedules: history }, null, 2);
    const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `tratamento-adaptativo-${today}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const nextDose = useMemo(() => {
    if (!schedule) return null;
    void clockTick;
    const current = nowInSaoPaulo().time.split(":").map(Number);
    const minute = current[0]! * 60 + current[1]!;
    return schedule.doses.find((dose) => dose.scheduledMinute !== null && dose.scheduledMinute >= minute && ["planned", "notified", "snoozed"].includes(dose.status))
      ?? schedule.doses.find((dose) => ["planned", "notified", "snoozed", "requires_review"].includes(dose.status))
      ?? null;
  }, [schedule, clockTick]);

  if (loading) {
    return <main className="app-loading"><BrandMark /><p>Preparando seu dia…</p></main>;
  }

  if (!preferences.acceptedNotice) {
    return (
      <main className="onboarding-shell">
        <section className="onboarding-card">
          <BrandMark />
          <p className="eyebrow">Antes de começar</p>
          <h1>Organização, nunca prescrição.</h1>
          <p className="lead">Este app organiza os horários cadastrados e registra o que aconteceu. Ele não altera doses, não recomenda compensações e não substitui seu médico ou farmacêutico.</p>
          <div className="principle-grid">
            <article><span>01</span><h2>Preserva a receita</h2><p>Nenhuma dose é criada, removida ou duplicada para “compensar”.</p></article>
            <article><span>02</span><h2>Assume limites</h2><p>Quando falta validação profissional, o app para e pede revisão.</p></article>
            <article><span>03</span><h2>Mantém histórico</h2><p>Horários planejados e reais continuam registrados.</p></article>
          </div>
          <button className="primary-button large" onClick={acceptNotice}>Entendi e quero continuar</button>
        </section>
      </main>
    );
  }

  return (
    <div className="app-frame">
      <header className="app-header">
        <div className="brand-lockup" aria-label="Tratamento adaptativo"><BrandMark small /><div><strong>Tratamento</strong><span>adaptativo</span></div></div>
        <div className={`connection-pill ${online ? "online" : "offline"}`}>
          {online ? <Cloud aria-hidden="true" /> : <CloudOff aria-hidden="true" />}
          {online ? (demoMode ? "Neste aparelho" : "Sincronizado") : "Modo offline"}
        </div>
      </header>

      <main className="app-main">
        {notice && <div className="toast" role="status"><span>{notice}</span><button aria-label="Fechar aviso" onClick={() => setNotice("")}><X aria-hidden="true" /></button></div>}
        {today >= "2026-08-06" && today <= "2026-08-22" && <div className="alcohol-warning"><strong>Sem álcool</strong><span>Durante o metronidazol e por pelo menos 3 dias após a última dose.</span></div>}
        {tab === "today" && (
          <TodayView
            name={preferences.name}
            date={today}
            schedule={schedule}
            manualWake={manualWake}
            setManualWake={setManualWake}
            startDay={startDay}
            confirmDay={confirmDay}
            nextDose={nextDose}
            selectedDose={selectedDose}
            setSelectedDose={setSelectedDose}
            takeDose={takeDose}
            skipDose={skipDose}
            snoozeDose={snoozeDose}
            adjust={() => setTab("settings")}
          />
        )}
        {tab === "history" && <HistoryView history={history} exportData={exportData} />}
        {tab === "rules" && <RulesView />}
        {tab === "settings" && <SettingsView preferences={preferences} save={savePreferences} demoMode={demoMode} />}
      </main>

      <nav className="bottom-nav" aria-label="Navegação principal">
        <NavButton active={tab === "today"} label="Hoje" icon={House} onClick={() => setTab("today")} />
        <NavButton active={tab === "history"} label="Histórico" icon={History} onClick={() => setTab("history")} />
        <NavButton active={tab === "rules"} label="Regras" icon={ListChecks} onClick={() => setTab("rules")} />
        <NavButton active={tab === "settings"} label="Ajustes" icon={Settings} onClick={() => setTab("settings")} />
      </nav>
    </div>
  );
}

function NavButton({ active, label, icon: Icon, onClick }: { active: boolean; label: string; icon: LucideIcon; onClick: () => void }) {
  return <button className={active ? "active" : ""} onClick={onClick} aria-current={active ? "page" : undefined}><Icon aria-hidden="true" /><span>{label}</span></button>;
}

interface TodayProps {
  name: string;
  date: string;
  schedule: DailySchedule | null;
  manualWake: string;
  setManualWake: (value: string) => void;
  startDay: (time: string) => void;
  confirmDay: () => void;
  nextDose: DoseRecord | null;
  selectedDose: string | null;
  setSelectedDose: (id: string | null) => void;
  takeDose: (dose: DoseRecord, time: string) => void;
  skipDose: (dose: DoseRecord) => void;
  snoozeDose: (dose: DoseRecord) => void;
  adjust: () => void;
}

function TodayView(props: TodayProps) {
  if (!props.schedule) {
    return (
      <section className="wake-view">
        <p className="eyebrow">{displayDate(props.date)}</p>
        <h1>Bom dia, {props.name}.<br /><span>Que horas você acordou?</span></h1>
        <p className="lead">O horário real de despertar organiza os alvos do dia. Você poderá revisar tudo antes de confirmar.</p>
        <div className="wake-actions">
          <button className="wake-button" onClick={() => props.startDay(nowInSaoPaulo().time)}><span className="sun-symbol" aria-hidden="true"><Sun /></span><span><strong>Acordei agora</strong><small>Usar {nowInSaoPaulo().time}</small></span><ArrowRight aria-hidden="true" /></button>
          <div className="manual-time"><label htmlFor="wake-time">Informar outro horário</label><div><input id="wake-time" type="time" value={props.manualWake} onChange={(event) => props.setManualWake(event.target.value)} /><button onClick={() => props.startDay(props.manualWake)}>Montar cronograma</button></div></div>
          <button className="quiet-button">Ainda não quero iniciar o dia</button>
        </div>
        <p className="safety-line"><ShieldCheck aria-hidden="true" /> Nenhuma tolerância clínica será presumida.</p>
      </section>
    );
  }

  const schedule = props.schedule;
  const taken = schedule.doses.filter((dose) => dose.status.startsWith("taken_")).length;
  const actionable = schedule.doses.filter((dose) => dose.scheduledMinute !== null).length;
  const grouped = groupTimeline(schedule);
  return (
    <section className="day-view">
      <div className="day-heading">
        <div><p className="eyebrow">{displayDate(schedule.date)}</p><h1>Seu dia, em ordem.</h1><p>{phaseLabel(schedule.date)}</p></div>
        <div className="progress-ring" style={{ "--progress": `${Math.round((taken / Math.max(actionable, 1)) * 100)}%` } as React.CSSProperties}><strong>{taken}</strong><span>de {actionable}</span></div>
      </div>

      {props.nextDose && (
        <article className="next-card">
          <div className="next-label"><span>Próxima ação</span><b>{props.nextDose.scheduledMinute === null ? "Revisar" : formatClock(props.nextDose.scheduledMinute)}</b></div>
          <h2>{props.nextDose.medicationName}</h2>
          <p>{props.nextDose.quantity} {props.nextDose.doseUnit} · {props.nextDose.instruction}</p>
          <button className="button-with-icon" onClick={() => props.setSelectedDose(props.nextDose!.id)}>Abrir registro <ArrowRight aria-hidden="true" /></button>
        </article>
      )}

      {schedule.conflicts.length > 0 && (
        <details className="conflict-panel" open={schedule.status === "requires_review"}>
          <summary><span><CircleAlert aria-hidden="true" /></span><div><strong>{schedule.conflicts.length} ponto(s) para revisar</strong><small>O cronograma não assumiu limites ausentes.</small></div></summary>
          <ul>{schedule.conflicts.map((item) => <li key={`${item.code}-${item.doseIds.join("-")}`}><strong>{item.severity === "blocking" ? "Revisão necessária" : "Atenção"}</strong>{item.message}</li>)}</ul>
        </details>
      )}

      <div className="timeline-heading"><h2>Linha do tempo</h2><span>Horário local · 24 h</span></div>
      <div className="timeline">
        {grouped.map((group) => (
          <div className="timeline-row" key={group.key}>
            <time>{group.minute === null ? "—" : formatClock(group.minute)}</time>
            <span className={`timeline-dot ${group.items.some((item) => item.type === "dose" && item.dose.status.startsWith("taken_")) ? "done" : ""}`} />
            <div className="timeline-content">
              {group.items.map((item) => item.type === "meal" ? <div className="meal-item" key={item.id}><Utensils aria-hidden="true" /><strong>{item.label}</strong></div> : (
                <button className={`dose-item ${item.dose.status}`} key={item.dose.id} onClick={() => props.setSelectedDose(item.dose.id)}>
                  <span><strong>{item.dose.medicationName}</strong><small>{item.dose.quantity} {item.dose.doseUnit}</small></span><em>{doseStateLabel(item.dose.status)}</em>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {schedule.status !== "confirmed" && <div className="confirmation-bar"><button className="primary-button" onClick={props.confirmDay}>Confirmar meu dia</button><button className="secondary-button" onClick={props.adjust}>Ajustar refeições ou sono</button></div>}

      {props.selectedDose && (
        <DoseSheet
          dose={schedule.doses.find((dose) => dose.id === props.selectedDose)!}
          close={() => props.setSelectedDose(null)}
          take={props.takeDose}
          skip={props.skipDose}
          snooze={props.snoozeDose}
        />
      )}
    </section>
  );
}

type TimelineItem = { type: "dose"; dose: DoseRecord } | { type: "meal"; id: string; label: string };
function groupTimeline(schedule: DailySchedule): Array<{ key: string; minute: number | null; items: TimelineItem[] }> {
  const map = new Map<string, { key: string; minute: number | null; items: TimelineItem[] }>();
  for (const dose of schedule.doses) {
    const key = dose.scheduledMinute === null ? "review" : String(dose.scheduledMinute);
    if (!map.has(key)) map.set(key, { key, minute: dose.scheduledMinute, items: [] });
    map.get(key)!.items.push({ type: "dose", dose });
  }
  for (const meal of schedule.meals) {
    const key = String(meal.scheduledMinute);
    if (!map.has(key)) map.set(key, { key, minute: meal.scheduledMinute, items: [] });
    map.get(key)!.items.push({ type: "meal", id: meal.id, label: meal.label });
  }
  return [...map.values()].sort((a, b) => (a.minute ?? Number.MAX_SAFE_INTEGER) - (b.minute ?? Number.MAX_SAFE_INTEGER));
}

function DoseSheet({ dose, close, take, skip, snooze }: { dose: DoseRecord; close: () => void; take: (dose: DoseRecord, time: string) => void; skip: (dose: DoseRecord) => void; snooze: (dose: DoseRecord) => void }) {
  const [otherTime, setOtherTime] = useState(nowInSaoPaulo().time);
  const alreadyRecorded = dose.status.startsWith("taken_") || dose.status === "skipped";
  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section className="dose-sheet" role="dialog" aria-modal="true" aria-labelledby="dose-title">
        <button className="sheet-close" onClick={close} aria-label="Fechar"><X aria-hidden="true" /></button>
        <p className="eyebrow">{dose.scheduledMinute === null ? "Horário a revisar" : `Planejado para ${formatClock(dose.scheduledMinute)}`}</p>
        <h2 id="dose-title">{dose.medicationName}</h2>
        <p className="dose-quantity">{dose.quantity} {dose.doseUnit}</p>
        <div className="instruction-box"><span><Info aria-hidden="true" /></span><p>{dose.instruction}</p></div>
        {alreadyRecorded ? <p className="recorded-state">{doseStateLabel(dose.status)}{dose.takenMinute !== null ? ` às ${formatClock(dose.takenMinute)}` : ""}.</p> : (
          <div className="dose-actions">
            <button className="primary-button large" onClick={() => take(dose, nowInSaoPaulo().time)}>Tomei agora <small>{nowInSaoPaulo().time}</small></button>
            {dose.scheduledMinute !== null && <button className="secondary-button" onClick={() => take(dose, formatClock(dose.scheduledMinute!))}>Tomei no horário planejado</button>}
            <label>Informar outro horário<div><input type="time" value={otherTime} onChange={(event) => setOtherTime(event.target.value)} /><button onClick={() => take(dose, otherTime)}>Registrar</button></div></label>
            <div className="split-actions"><button onClick={() => snooze(dose)}>Adiar lembrete 10 min</button><button className="danger-text" onClick={() => skip(dose)}>Não tomei</button></div>
          </div>
        )}
      </section>
    </div>
  );
}

function HistoryView({ history, exportData }: { history: DailySchedule[]; exportData: () => void }) {
  return (
    <section className="section-view">
      <div className="section-heading"><div><p className="eyebrow">Registro permanente</p><h1>Histórico</h1><p>Horários planejados e reais, sem apagar eventos anteriores.</p></div><button className="secondary-button button-with-icon" onClick={exportData}><Download aria-hidden="true" /> Exportar JSON</button></div>
      {history.length === 0 ? <div className="empty-state"><History aria-hidden="true" /><h2>Nenhum dia registrado</h2><p>Seu histórico aparecerá depois do primeiro check-in.</p></div> : (
        <div className="history-list">{history.map((day) => {
          const taken = day.doses.filter((dose) => dose.status.startsWith("taken_")).length;
          return <article key={day.date}><div className="history-date"><strong>{new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", day: "2-digit" }).format(new Date(`${day.date}T12:00:00Z`))}</strong><span>{new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", month: "short" }).format(new Date(`${day.date}T12:00:00Z`))}</span></div><div><h2>{phaseLabel(day.date)}</h2><p>Acordou às {formatClock(day.wakeMinute)} · {taken} de {day.doses.length} tomadas</p></div><span className={`history-status ${day.conflicts.length ? "review" : "ok"}`}>{day.conflicts.length ? `${day.conflicts.length} alerta(s)` : "Sem conflitos"}</span></article>;
        })}</div>
      )}
    </section>
  );
}

function RulesView() {
  return (
    <section className="section-view">
      <div className="section-heading"><div><p className="eyebrow">Transparência clínica</p><h1>Regras cadastradas</h1><p>Campos vazios não são completados pelo sistema.</p></div></div>
      <div className="rules-warning"><strong>Modo conservador ativo</strong><p>Tolerâncias e políticas de atraso ainda aguardam validação profissional.</p></div>
      <div className="rules-list">{INITIAL_TREATMENT_PHASES.map((phase) => (
        <article key={phase.id}>
          <div><span className="rigidity">Rigidez {phase.rigidity === "high" ? "alta" : phase.rigidity}</span><h2>{phase.medicationName}</h2><p>{phase.phaseName} · {phase.dosesPerDay}× ao dia · {phase.doseQuantity} {phase.doseUnit}</p></div>
          <dl>
            <div><dt>Intervalo-alvo</dt><dd>{phase.interval.targetMinutes === null ? "Não definido" : `${phase.interval.targetMinutes / 60} h`}</dd></div>
            <div><dt>Mínimo validado</dt><dd className={phase.interval.minimumMinutes === null ? "pending" : ""}>{phase.interval.minimumMinutes === null ? "Aguardando" : `${phase.interval.minimumMinutes} min`}</dd></div>
            <div><dt>Máximo validado</dt><dd className={phase.interval.maximumMinutes === null ? "pending" : ""}>{phase.interval.maximumMinutes === null ? "Aguardando" : `${phase.interval.maximumMinutes} min`}</dd></div>
            <div><dt>Reagendar atrasos</dt><dd className="pending">Não confirmado</dd></div>
          </dl>
        </article>
      ))}</div>
    </section>
  );
}

function SettingsView({ preferences, save, demoMode }: { preferences: Preferences; save: (value: Preferences) => void; demoMode: boolean }) {
  const [draft, setDraft] = useState(preferences);
  const router = useRouter();
  return (
    <section className="section-view settings-view">
      <div className="section-heading"><div><p className="eyebrow">Rotina e dispositivo</p><h1>Ajustes</h1><p>Alterações valem para cronogramas futuros.</p></div></div>
      <form onSubmit={(event) => { event.preventDefault(); void save(draft); }}>
        <div className="settings-card">
          <h2>Sua rotina</h2>
          <label>Nome<input autoComplete="name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
          <label>Hora provável de dormir<input type="time" value={draft.usualBedtime} onChange={(event) => setDraft({ ...draft, usualBedtime: event.target.value })} /></label>
          <TimeWindow
            label="Janela do café da manhã"
            start={draft.breakfastStart}
            end={draft.breakfastEnd}
            onStartChange={(breakfastStart) => setDraft({ ...draft, breakfastStart })}
            onEndChange={(breakfastEnd) => setDraft({ ...draft, breakfastEnd })}
          />
          <TimeWindow
            label="Janela do jantar"
            start={draft.dinnerStart}
            end={draft.dinnerEnd}
            onStartChange={(dinnerStart) => setDraft({ ...draft, dinnerStart })}
            onEndChange={(dinnerEnd) => setDraft({ ...draft, dinnerEnd })}
          />
          <button className="primary-button button-with-icon settings-save" type="submit"><Save aria-hidden="true" /> Salvar preferências</button>
        </div>
      </form>
      <PushSetup demoMode={demoMode} />
      <div className="settings-card"><h2>Conta e dados</h2><p>{demoMode ? "Modo demonstração: os dados ficam apenas neste aparelho." : "Conta conectada ao Supabase com políticas de acesso por usuário."}</p>{!demoMode && <div className="button-row"><button className="secondary-button button-with-icon" onClick={async () => { const { createBrowserSupabaseClient } = await import("@/lib/supabase/client"); await createBrowserSupabaseClient().auth.signOut(); router.push("/login"); router.refresh(); }}><LogOut aria-hidden="true" /> Sair da conta</button><button className="secondary-button button-with-icon danger-text" onClick={async () => { if (!window.confirm("Apagar permanentemente sua conta e todo o histórico? Esta ação não pode ser desfeita.")) return; const response = await fetch("/api/account", { method: "DELETE" }); if (response.ok) { router.push("/login"); router.refresh(); } }}><Trash2 aria-hidden="true" /> Apagar conta</button></div>}</div>
    </section>
  );
}

function TimeWindow({ label, start, end, onStartChange, onEndChange }: { label: string; start: string; end: string; onStartChange: (value: string) => void; onEndChange: (value: string) => void }) {
  return (
    <fieldset className="time-window">
      <legend>{label}</legend>
      <div className="time-window-grid">
        <label><span>De</span><input aria-label={`${label}: início`} type="time" value={start} onChange={(event) => onStartChange(event.target.value)} /></label>
        <label><span>Até</span><input aria-label={`${label}: fim`} type="time" value={end} onChange={(event) => onEndChange(event.target.value)} /></label>
      </div>
    </fieldset>
  );
}
