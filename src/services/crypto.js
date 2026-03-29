// Encrypt/decrypt localStorage cache using AES-GCM with a session-derived key.
// The key is derived from the user's Supabase session access token using PBKDF2.
// This ensures cache data is unreadable without a valid auth session.

const SALT = new TextEncoder().encode('salve-health-cache-v1');
const IV_LENGTH = 12;

let cachedKey = null;
let cachedToken = null;

async function deriveKey(token) {
  if (cachedKey && cachedToken === token) return cachedKey;

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(token),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  cachedKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: SALT, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  cachedToken = token;
  return cachedKey;
}

export async function encrypt(plaintext, token) {
  const key = await deriveKey(token);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );

  // Prefix IV to ciphertext, then base64 encode
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return btoa(String.fromCharCode(...combined));
}

export async function decrypt(b64, token) {
  const key = await deriveKey(token);
  const combined = Uint8Array.from(atob(b64), c => c.charCodeAt(0));

  const iv = combined.slice(0, IV_LENGTH);
  const ciphertext = combined.slice(IV_LENGTH);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}

// Clear cached key on sign-out
export function clearKeyCache() {
  cachedKey = null;
  cachedToken = null;
}
