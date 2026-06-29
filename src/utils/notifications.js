import { supabase } from '../supabase';

const READ_KEY_PREFIX = 'sc-read-';

// ─── Local Storage Cache ───────────────────────────────────────────────────────

function readStore(studentId) {
  try {
    return JSON.parse(localStorage.getItem(`${READ_KEY_PREFIX}${studentId}`) || '{}');
  } catch {
    return {};
  }
}

function writeStore(studentId, store) {
  localStorage.setItem(`${READ_KEY_PREFIX}${studentId}`, JSON.stringify(store));
}

function ensureBatch(store, batchId) {
  if (!store[batchId]) store[batchId] = { announcements: [], notes: [] };
  return store[batchId];
}

// ─── Cross-Device Sync via students.read_markers (JSONB column) ────────────────
//
// REQUIRED SQL (run once in Supabase SQL Editor):
//   ALTER TABLE students ADD COLUMN IF NOT EXISTS read_markers JSONB DEFAULT '{}';
//
// This stores all read state directly in the student's own row — no new table needed,
// no extra RLS policies needed, and it works across all devices on the same account.

/** Push the full local read store to students.read_markers (fire-and-forget) */
function pushToServer(studentId, store) {
  if (!supabase || !studentId) return;
  supabase
    .from('students')
    .update({ read_markers: store })
    .eq('id', studentId)
    .catch(() => {}); // silently ignore if column doesn't exist yet
}

/** Pull server read state and merge it into localStorage. Call on login + periodically. */
export async function syncReadStateFromServer(studentId) {
  if (!supabase || !studentId) return;
  try {
    const { data, error } = await supabase
      .from('students')
      .select('read_markers')
      .eq('id', studentId)
      .maybeSingle();

    if (error || !data) return;

    const serverStore =
      data.read_markers && typeof data.read_markers === 'object'
        ? data.read_markers
        : {};

    const localStore = readStore(studentId);

    // Merge: union of all read IDs from both server and local
    const merged = { ...serverStore };
    Object.keys(localStore).forEach(batchId => {
      if (!merged[batchId]) {
        merged[batchId] = localStore[batchId];
      } else {
        merged[batchId].announcements = [
          ...new Set([
            ...(merged[batchId].announcements || []),
            ...(localStore[batchId].announcements || []),
          ]),
        ];
        merged[batchId].notes = [
          ...new Set([
            ...(merged[batchId].notes || []),
            ...(localStore[batchId].notes || []),
          ]),
        ];
      }
    });

    writeStore(studentId, merged);

    // If local had more data than server, push the merged result up
    if (Object.keys(localStore).length > Object.keys(serverStore).length) {
      pushToServer(studentId, merged);
    }
  } catch {
    // read_markers column may not exist yet — silently ignore
  }
}

// ─── Read State Helpers ────────────────────────────────────────────────────────

export function getUnreadCounts(studentId, batchId, announcements = [], notes = []) {
  if (!studentId || !batchId) return { announcements: 0, notes: 0, total: 0 };
  const store = readStore(studentId);
  const batchRead = store[batchId] || { announcements: [], notes: [] };
  const unreadAnn = announcements.filter(a => !batchRead.announcements.includes(a.id)).length;
  const unreadNote = notes.filter(n => !batchRead.notes.includes(n.id)).length;
  return { announcements: unreadAnn, notes: unreadNote, total: unreadAnn + unreadNote };
}

export function markAnnouncementRead(studentId, batchId, announcementId) {
  const store = readStore(studentId);
  const batch = ensureBatch(store, batchId);
  if (!batch.announcements.includes(announcementId)) {
    batch.announcements.push(announcementId);
    writeStore(studentId, store);
    pushToServer(studentId, store); // immediately sync to server for other devices
  }
}

export function markNoteRead(studentId, batchId, noteId) {
  const store = readStore(studentId);
  const batch = ensureBatch(store, batchId);
  if (!batch.notes.includes(noteId)) {
    batch.notes.push(noteId);
    writeStore(studentId, store);
    pushToServer(studentId, store); // immediately sync to server for other devices
  }
}

export function isAnnouncementRead(studentId, batchId, announcementId) {
  const store = readStore(studentId);
  return (store[batchId]?.announcements || []).includes(announcementId);
}

export function isNoteRead(studentId, batchId, noteId) {
  const store = readStore(studentId);
  return (store[batchId]?.notes || []).includes(noteId);
}

// ─── Device Notification Permission ───────────────────────────────────────────

let permissionRequested = false;

export async function ensureNotificationPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  if (permissionRequested) return false;
  permissionRequested = true;
  try {
    const result = await Notification.requestPermission();
    return result === 'granted';
  } catch {
    return false;
  }
}

/**
 * Show a device notification via Service Worker (persists even in background tabs)
 * or falls back to the legacy Notification API.
 */
export async function showDeviceNotification(title, body, tag) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const options = {
    body,
    tag: tag || title,
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    renotify: true,
    vibrate: [200, 100, 200],
    data: { url: '/', timestamp: Date.now() },
  };
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, options);
      return;
    } catch {}
  }
  try {
    new Notification(title, options);
  } catch {}
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
