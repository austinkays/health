// Shared platform detection helpers.
// Used by InstallPrompt (PWA install gating) and Settings (push notification guidance).

export function isStandalone() {
  try {
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
    if (window.navigator.standalone === true) return true;
  } catch { /* */ }
  return false;
}

export function isIOS() {
  try {
    const ua = window.navigator.userAgent || '';
    const isIDevice = /iPad|iPhone|iPod/.test(ua);
    const isIPadOS = ua.includes('Mac') && navigator.maxTouchPoints > 1;
    return isIDevice || isIPadOS;
  } catch { return false; }
}

export function isAndroid() {
  try { return /Android/i.test(window.navigator.userAgent || ''); }
  catch { return false; }
}

export function isSafari() {
  try {
    const ua = window.navigator.userAgent || '';
    return /Safari/i.test(ua) && !/Chrome|Chromium|Edg|CriOS|FxiOS/i.test(ua);
  } catch { return false; }
}
