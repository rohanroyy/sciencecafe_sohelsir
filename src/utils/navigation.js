/**
 * Subdomain-based portal detection and hash routing for refresh-safe navigation.
 */

export function getPortalFromHostname() {
  const hostname = window.location.hostname.toLowerCase();
  const parts = hostname.split('.');

  if (parts.length >= 2 && parts[0] !== 'www' && parts[0] !== 'localhost' && !/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    const sub = parts[0];
    if (sub === 'teacher' || sub === 'teachers') return 'teacher';
    if (sub === 'exam' || sub === 'exams' || sub === 'exam-setup') return 'exam-setup';
  }

  return 'student';
}

export function parseHashRoute() {
  const raw = window.location.hash.replace(/^#\/?/, '');
  if (!raw) return null;

  const [pathPart, queryPart] = raw.split('?');
  const segments = pathPart.split('/').filter(Boolean);
  const params = new URLSearchParams(queryPart || '');

  if (segments.length === 0) return null;

  const root = segments[0];

  if (root === 'student') {
    return { view: 'student', tab: segments[1] || params.get('tab') || 'batches' };
  }
  if (root === 'teacher') {
    return { view: 'teacher', tab: segments[1] || params.get('tab') || 'batches' };
  }
  if (root === 'exam-setup') {
    return { view: 'exam-setup' };
  }
  if (root === 'batch' && segments[1]) {
    return { view: 'batch-detail', batchId: segments[1], tab: segments[2] || params.get('tab') || 'notes' };
  }
  if (root === 'exam' && segments[1]) {
    return { view: 'exam-session', examId: segments[1], batchId: segments[2] || params.get('batch') || null };
  }

  return null;
}

export function buildHashRoute(state) {
  const { view, batchId, examId, tab } = state;

  switch (view) {
    case 'student':
      return tab && tab !== 'batches' ? `#/student/${tab}` : '#/student';
    case 'teacher':
      return tab && tab !== 'batches' ? `#/teacher/${tab}` : '#/teacher';
    case 'exam-setup':
      return '#/exam-setup';
    case 'batch-detail':
      if (!batchId) return '#/student';
      return tab && tab !== 'notes' ? `#/batch/${batchId}/${tab}` : `#/batch/${batchId}`;
    case 'exam-session':
      if (!examId) return '#/student';
      return batchId ? `#/exam/${examId}/${batchId}` : `#/exam/${examId}`;
    default:
      return '#/student';
  }
}

export function syncHashRoute(state, replace = false) {
  const next = buildHashRoute(state);
  if (window.location.hash === next) return;
  if (replace) {
    window.history.replaceState(null, '', next);
  } else {
    window.location.hash = next.slice(1);
  }
}
