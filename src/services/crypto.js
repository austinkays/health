// Encrypt/decrypt localStorage cache using AES-GCM with a session-derived key.
// The key is derived from the user's Supabase session access token using PBKDF2.
// This ensures cache data is unreadable without a valid auth session.

const SALT_LENGTH = 16;
const IV_LENGTH = 12;

let cachedKey = null;
let cachedToken = null;
let cachedSalt = null;

async function deriveKey(token, salt) {
  // Reuse cached key only if token AND salt match (same encryption context)
  if (cachedKey && cachedToken === token && cachedSalt && salt.every((v, i) => v === cachedSalt[i])) {
    return cachedKey;
  }

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(token),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  cachedKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  cachedToken = token;
  cachedSalt = salt;
  return cachedKey;
}

export async function encrypt(plaintext, token) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const key = await deriveKey(token, salt);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );

  // Prefix salt + IV to ciphertext, then base64 encode
  const combined = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
  combined.set(salt);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(ciphertext), salt.length + iv.length);

  return btoa(String.fromCharCode(...combined));
}

export async function decrypt(b64, token) {
  const combined = Uint8Array.from(atob(b64), c => c.charCodeAt(0));

  // Support legacy format (IV-only, no salt prefix) for existing cached data
  if (combined.length > SALT_LENGTH + IV_LENGTH) {
    // Try new format first: salt (16) + IV (12) + ciphertext
    try {
      const salt = combined.slice(0, SALT_LENGTH);
      const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
      const ciphertext = combined.slice(SALT_LENGTH + IV_LENGTH);
      const key = await deriveKey(token, salt);
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        ciphertext
      );
      return new TextDecoder().decode(decrypted);
    } catch {
      // Fall through to legacy format
    }
  }

  // Legacy format: IV (12) + ciphertext (no per-entry salt)
  const legacySalt = new TextEncoder().encode('salve-health-cache-v1');
  const iv = combined.slice(0, IV_LENGTH);
  const ciphertext = combined.slice(IV_LENGTH);
  const key = await deriveKey(token, legacySalt);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  return new TextDecoder().decode(decrypted);
}

// Pre-derive the key for a given token so subsequent encrypt/decrypt calls are instant.
// Uses a fixed salt for prewarming since encrypt() will generate its own random salt.
export async function prewarmKey(token) {
  try {
    const warmupSalt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    await deriveKey(token, warmupSalt);
  } catch { /* ignore */ }
}

// Clear cached key on sign-out
export function clearKeyCache() {
  cachedKey = null;
  cachedToken = null;
  cachedSalt = null;
}
