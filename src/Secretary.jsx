import React, { useState, useEffect, useCallback } from "react";
import {
  Mail, MailOpen, Archive, Trash2, Reply, CalendarPlus, CalendarClock,
  RefreshCw, LogIn, LogOut, Bell, BellOff, MapPin, Loader2,
} from "lucide-react";
import { getClientId, setClientId, beginSignIn, completeSignInIfRedirected } from "./msAuth.js";
import * as api from "./secretaryApi.js";
import * as graph from "./graph.js";

function urlBase64ToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64safe);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function fmtDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleString("nl-NL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function fmtEventWhen(ev) {
  if (ev.isAllDay) return "hele dag";
  const start = ev.start && ev.start.dateTime ? new Date(ev.start.dateTime) : null;
  const end = ev.end && ev.end.dateTime ? new Date(ev.end.dateTime) : null;
  if (!start) return "";
  const day = start.toLocaleString("nl-NL", { day: "2-digit", month: "2-digit" });
  const t1 = start.toLocaleString("nl-NL", { hour: "2-digit", minute: "2-digit" });
  const t2 = end ? end.toLocaleString("nl-NL", { hour: "2-digit", minute: "2-digit" }) : "";
  return `${day} · ${t1}${t2 ? "–" + t2 : ""}`;
}

function emptyNewEvent() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  return { subject: "", date, startTime: "09:00", endTime: "09:30", location: "" };
}

export default function Secretary() {
  const [hasWorker, setHasWorker] = useState(api.hasWorkerConfigured());
  const [clientIdInput, setClientIdInput] = useState(getClientId());
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");

  const [status, setStatus] = useState(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);

  const [mail, setMail] = useState([]);
  const [mailLoading, setMailLoading] = useState(false);
  const [mailError, setMailError] = useState("");
  const [replyingId, setReplyingId] = useState(null);
  const [replyText, setReplyText] = useState("");

  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState("");
  const [showNewEvent, setShowNewEvent] = useState(false);
  const [newEvent, setNewEvent] = useState(emptyNewEvent);

  const refreshStatus = useCallback(async () => {
    if (!api.hasWorkerConfigured()) return;
    setStatusLoading(true);
    try {
      const s = await api.fetchStatus();
      setStatus(s);
    } catch {
      /* Worker (nog) niet bereikbaar — status blijft zoals hij was */
    } finally {
      setStatusLoading(false);
    }
  }, []);

  const loadMail = useCallback(async () => {
    setMailLoading(true);
    setMailError("");
    try {
      setMail(await graph.listInbox());
    } catch (e) {
      setMailError(e.noWorker ? e.message : "Kon mail niet ophalen.");
    } finally {
      setMailLoading(false);
    }
  }, []);

  const loadEvents = useCallback(async () => {
    setEventsLoading(true);
    setEventsError("");
    try {
      setEvents(await graph.listUpcomingEvents());
    } catch (e) {
      setEventsError(e.noWorker ? e.message : "Kon agenda niet ophalen.");
    } finally {
      setEventsLoading(false);
    }
  }, []);

  // Verwerk een eventuele redirect terug van Microsoft, en laad daarna alles.
  useEffect(() => {
    (async () => {
      const result = await completeSignInIfRedirected();
      if (result && result.error) {
        setAuthError(result.error);
      } else if (result && result.ok) {
        try {
          await api.connectAccount(result);
        } catch {
          setAuthError("Ingelogd bij Microsoft, maar koppelen met je Worker is mislukt. Controleer je Worker-instellingen.");
        }
      }
      setHasWorker(api.hasWorkerConfigured());
      await refreshStatus();
    })();
  }, [refreshStatus]);

  useEffect(() => {
    if (status && status.connected) {
      loadMail();
      loadEvents();
    }
  }, [status && status.connected, loadMail, loadEvents]);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setPushEnabled(!!sub))
      .catch(() => {});
  }, [status]);

  const saveClientId = () => {
    setClientId(clientIdInput.trim());
  };

  const signIn = async () => {
    setAuthError("");
    saveClientId();
    setAuthBusy(true);
    try {
      await beginSignIn();
    } catch (e) {
      setAuthError(e.message);
      setAuthBusy(false);
    }
  };

  const signOut = async () => {
    try {
      await api.disconnectAccount();
    } catch {
      /* best effort */
    }
    await refreshStatus();
  };

  const togglePush = async () => {
    setPushBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      if (pushEnabled) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await api.unregisterPushSubscription(sub.endpoint).catch(() => {});
          await sub.unsubscribe();
        }
        setPushEnabled(false);
      } else {
        if (Notification.permission !== "granted") {
          const perm = await Notification.requestPermission();
          if (perm !== "granted") throw new Error("Geen toestemming voor meldingen gegeven.");
        }
        const publicKey = await api.fetchVapidPublicKey();
        if (!publicKey) throw new Error("De Worker heeft nog geen VAPID-sleutel ingesteld (zie worker/DEPLOY.md).");
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
        await api.registerPushSubscription(sub.toJSON());
        setPushEnabled(true);
      }
      await refreshStatus();
    } catch (e) {
      setAuthError(e.message || "Meldingen inschakelen is mislukt.");
    } finally {
      setPushBusy(false);
    }
  };

  const updateSetting = async (partial) => {
    setStatus((s) => (s ? { ...s, settings: { ...s.settings, ...partial } } : s));
    try {
      await api.saveSettings(partial);
    } catch {
      /* volgende refreshStatus() corrigeert het weer */
    }
  };

  // -- Mail-acties ---------------------------------------------------------
  const onToggleRead = async (m) => {
    setMail((list) => list.map((x) => (x.id === m.id ? { ...x, isRead: !m.isRead } : x)));
    try {
      await graph.markRead(m.id, !m.isRead);
    } catch {
      loadMail();
    }
  };
  const onArchive = async (m) => {
    setMail((list) => list.filter((x) => x.id !== m.id));
    try {
      await graph.archiveMessage(m.id);
    } catch {
      loadMail();
    }
  };
  const onDeleteMail = async (m) => {
    setMail((list) => list.filter((x) => x.id !== m.id));
    try {
      await graph.deleteMessage(m.id);
    } catch {
      loadMail();
    }
  };
  const sendReply = async (m) => {
    if (!replyText.trim()) return;
    try {
      await graph.replyMessage(m.id, replyText.trim());
      setReplyingId(null);
      setReplyText("");
    } catch {
      setMailError("Versturen van je reactie is mislukt.");
    }
  };

  // -- Agenda-acties --------------------------------------------------------
  const onDeleteEvent = async (ev) => {
    setEvents((list) => list.filter((x) => x.id !== ev.id));
    try {
      await graph.deleteEvent(ev.id);
    } catch {
      loadEvents();
    }
  };
  const createNewEvent = async () => {
    if (!newEvent.subject.trim()) return;
    try {
      await graph.createEvent({
        subject: newEvent.subject.trim(),
        start: `${newEvent.date}T${newEvent.startTime}:00`,
        end: `${newEvent.date}T${newEvent.endTime}:00`,
        location: newEvent.location.trim() || undefined,
      });
      setShowNewEvent(false);
      setNewEvent(emptyNewEvent());
      loadEvents();
    } catch {
      setEventsError("Aanmaken van de afspraak is mislukt.");
    }
  };

  if (!hasWorker) {
    return (
      <div className="max-w-xl mx-auto px-5 pb-16">
        <div className="dl-card p-4 text-sm">
          Stel eerst je Worker-koppeling in via het tandwiel ⚙️ op de <strong>Daglog</strong>-tab —
          dezelfde koppeling wordt hier gebruikt om je Microsoft-account veilig te beheren en
          achtergrondmeldingen te sturen.
        </div>
      </div>
    );
  }

  const connected = status && status.connected;

  return (
    <div className="max-w-xl mx-auto px-5 pb-16">
      {authError && (
        <div className="dl-card p-3 mb-3 text-sm" style={{ color: "#8a3b1f" }}>
          {authError}
        </div>
      )}

      {!connected && (
        <div className="dl-card p-4 mb-4">
          <div className="text-sm font-semibold mb-2">Verbind met Outlook / Microsoft 365</div>
          <p className="text-sm opacity-70 mb-3">
            Vul de Client-ID van je eigen Azure-app-registratie in (zie{" "}
            <span className="dl-mono">worker/DEPLOY.md</span> voor de stappen) en log in met je
            Microsoft-account.
          </p>
          <input
            className="dl-input w-full px-3 py-2 text-sm mb-2"
            placeholder="Microsoft Client-ID"
            value={clientIdInput}
            onChange={(e) => setClientIdInput(e.target.value)}
          />
          <button className="dl-btn-primary text-sm px-4 py-2 flex items-center gap-2" onClick={signIn} disabled={authBusy || !clientIdInput.trim()}>
            {authBusy ? <Loader2 size={14} className="dl-spin" /> : <LogIn size={14} />}
            Inloggen bij Microsoft
          </button>
        </div>
      )}

      {connected && (
        <>
          <div className="dl-card p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm">
                Verbonden als <strong>{status.name || status.email}</strong>
                {status.name && status.email ? <span className="opacity-60"> ({status.email})</span> : null}
              </div>
              <button className="dl-btn-ghost text-xs px-3 py-1.5 flex items-center gap-1.5" onClick={signOut}>
                <LogOut size={13} /> Loskoppelen
              </button>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                className="dl-btn-ghost text-xs px-3 py-1.5 flex items-center gap-1.5"
                onClick={togglePush}
                disabled={pushBusy}
              >
                {pushBusy ? <Loader2 size={13} className="dl-spin" /> : pushEnabled ? <Bell size={13} /> : <BellOff size={13} />}
                {pushEnabled ? "Meldingen aan" : "Meldingen inschakelen"}
              </button>
              <select
                className="dl-input text-xs px-2 py-1.5"
                value={status.settings.eventReminderMinutes}
                onChange={(e) => updateSetting({ eventReminderMinutes: Number(e.target.value) })}
              >
                <option value={5}>Herinner 5 min vooraf</option>
                <option value={10}>Herinner 10 min vooraf</option>
                <option value={15}>Herinner 15 min vooraf</option>
                <option value={30}>Herinner 30 min vooraf</option>
              </select>
              <label className="text-xs opacity-70 flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={status.settings.notifyAllMail}
                  onChange={(e) => updateSetting({ notifyAllMail: e.target.checked })}
                />
                Meld nieuwe mail
              </label>
            </div>
            {statusLoading && <div className="text-xs opacity-50 mt-2">Status verversen…</div>}
          </div>

          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold uppercase tracking-wide opacity-60 flex items-center gap-1.5">
              <Mail size={13} /> Postvak in
            </div>
            <button className="dl-btn-ghost text-xs px-2.5 py-1 flex items-center gap-1" onClick={loadMail} disabled={mailLoading}>
              <RefreshCw size={12} className={mailLoading ? "dl-spin" : ""} />
            </button>
          </div>
          {mailError && <div className="text-xs mb-2" style={{ color: "#e0a27a" }}>{mailError}</div>}
          <div className="flex flex-col gap-2 mb-6">
            {!mailLoading && mail.length === 0 && <div className="dl-card p-3 text-sm opacity-70">Geen mail.</div>}
            {mail.map((m) => (
              <div key={m.id} className="dl-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className={`text-sm truncate ${m.isRead ? "" : "font-semibold"}`}>
                      {m.from && m.from.emailAddress ? m.from.emailAddress.name || m.from.emailAddress.address : "onbekend"}
                    </div>
                    <div className="text-sm truncate">{m.subject || "(geen onderwerp)"}</div>
                    <div className="text-xs opacity-60 truncate">{m.bodyPreview}</div>
                  </div>
                  <div className="text-xs opacity-50 flex-shrink-0 dl-mono">{fmtDateTime(m.receivedDateTime)}</div>
                </div>
                <div className="flex items-center gap-1.5 mt-2">
                  <button className="dl-btn-ghost text-xs px-2 py-1 flex items-center gap-1" onClick={() => onToggleRead(m)}>
                    {m.isRead ? <Mail size={12} /> : <MailOpen size={12} />}
                    {m.isRead ? "Ongelezen" : "Gelezen"}
                  </button>
                  <button className="dl-btn-ghost text-xs px-2 py-1 flex items-center gap-1" onClick={() => { setReplyingId(replyingId === m.id ? null : m.id); setReplyText(""); }}>
                    <Reply size={12} /> Reageer
                  </button>
                  <button className="dl-btn-ghost text-xs px-2 py-1 flex items-center gap-1" onClick={() => onArchive(m)}>
                    <Archive size={12} /> Archiveer
                  </button>
                  <button className="opacity-60 hover:opacity-100 ml-auto" onClick={() => onDeleteMail(m)}>
                    <Trash2 size={14} />
                  </button>
                </div>
                {replyingId === m.id && (
                  <div className="mt-2 flex flex-col gap-1.5">
                    <textarea
                      className="dl-input w-full px-2 py-1.5 text-sm"
                      rows={2}
                      placeholder="Je reactie…"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                    />
                    <button className="dl-btn-primary text-xs px-3 py-1.5 self-start" onClick={() => sendReply(m)}>
                      Versturen
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold uppercase tracking-wide opacity-60 flex items-center gap-1.5">
              <CalendarClock size={13} /> Agenda
            </div>
            <div className="flex items-center gap-1.5">
              <button className="dl-btn-ghost text-xs px-2.5 py-1 flex items-center gap-1" onClick={() => setShowNewEvent((v) => !v)}>
                <CalendarPlus size={13} /> Nieuw
              </button>
              <button className="dl-btn-ghost text-xs px-2.5 py-1 flex items-center gap-1" onClick={loadEvents} disabled={eventsLoading}>
                <RefreshCw size={12} className={eventsLoading ? "dl-spin" : ""} />
              </button>
            </div>
          </div>
          {eventsError && <div className="text-xs mb-2" style={{ color: "#e0a27a" }}>{eventsError}</div>}
          {showNewEvent && (
            <div className="dl-card p-3 mb-2 flex flex-col gap-2">
              <input className="dl-input px-2 py-1.5 text-sm" placeholder="Titel" value={newEvent.subject} onChange={(e) => setNewEvent({ ...newEvent, subject: e.target.value })} />
              <div className="flex gap-2">
                <input type="date" className="dl-input px-2 py-1.5 text-sm flex-1" value={newEvent.date} onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })} />
                <input type="time" className="dl-input px-2 py-1.5 text-sm" value={newEvent.startTime} onChange={(e) => setNewEvent({ ...newEvent, startTime: e.target.value })} />
                <input type="time" className="dl-input px-2 py-1.5 text-sm" value={newEvent.endTime} onChange={(e) => setNewEvent({ ...newEvent, endTime: e.target.value })} />
              </div>
              <input className="dl-input px-2 py-1.5 text-sm" placeholder="Locatie (optioneel)" value={newEvent.location} onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })} />
              <button className="dl-btn-primary text-xs px-3 py-1.5 self-start" onClick={createNewEvent}>
                Toevoegen
              </button>
            </div>
          )}
          <div className="flex flex-col gap-2">
            {!eventsLoading && events.length === 0 && <div className="dl-card p-3 text-sm opacity-70">Geen afspraken de komende twee weken.</div>}
            {events.map((ev) => (
              <div key={ev.id} className="dl-card p-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{ev.subject || "(geen titel)"}</div>
                  <div className="text-xs opacity-70 dl-mono">{fmtEventWhen(ev)}</div>
                  {ev.location && ev.location.displayName && (
                    <div className="text-xs opacity-60 flex items-center gap-1 mt-0.5">
                      <MapPin size={11} /> {ev.location.displayName}
                    </div>
                  )}
                </div>
                <button className="opacity-60 hover:opacity-100 flex-shrink-0" onClick={() => onDeleteEvent(ev)}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
