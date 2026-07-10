// Rechtstreekse Microsoft Graph-aanroepen voor mail en agenda. Gebruikt het
// access-token van secretaryApi.js (dat de Worker op de achtergrond ververst).
import { getAccessToken } from "./secretaryApi.js";

const BASE = "https://graph.microsoft.com/v1.0";
const TZ = "W. Europe Standard Time";

async function graphFetch(path, options = {}) {
  const token = await getAccessToken();
  const res = await fetch(BASE + path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`Graph-fout ${res.status}: ${text.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function listInbox(top = 15) {
  const data = await graphFetch(
    `/me/mailFolders('inbox')/messages?$top=${top}&$select=id,subject,from,receivedDateTime,isRead,bodyPreview,webLink&$orderby=receivedDateTime desc`
  );
  return data.value || [];
}

export async function markRead(id, isRead = true) {
  await graphFetch(`/me/messages/${id}`, { method: "PATCH", body: JSON.stringify({ isRead }) });
}

export async function archiveMessage(id) {
  await graphFetch(`/me/messages/${id}/move`, { method: "POST", body: JSON.stringify({ destinationId: "archive" }) });
}

export async function deleteMessage(id) {
  await graphFetch(`/me/messages/${id}`, { method: "DELETE" });
}

export async function replyMessage(id, comment) {
  await graphFetch(`/me/messages/${id}/reply`, { method: "POST", body: JSON.stringify({ comment }) });
}

export async function listUpcomingEvents(days = 14, top = 20) {
  const start = new Date();
  const end = new Date(Date.now() + days * 86400000);
  const data = await graphFetch(
    `/me/calendarview?startDateTime=${start.toISOString()}&endDateTime=${end.toISOString()}&$top=${top}&$select=id,subject,start,end,location,isAllDay,webLink&$orderby=start/dateTime`,
    { headers: { Prefer: `outlook.timezone="${TZ}"` } }
  );
  return data.value || [];
}

export async function createEvent({ subject, start, end, location }) {
  return graphFetch("/me/events", {
    method: "POST",
    body: JSON.stringify({
      subject,
      start: { dateTime: start, timeZone: TZ },
      end: { dateTime: end, timeZone: TZ },
      ...(location ? { location: { displayName: location } } : {}),
    }),
  });
}

export async function updateEvent(id, patch) {
  await graphFetch(`/me/events/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export async function deleteEvent(id) {
  await graphFetch(`/me/events/${id}`, { method: "DELETE" });
}
