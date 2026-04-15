// Encrypt/decrypt localStorage cache using AES-GCM with a session-derived key.
// The key is derived from the user's Supabase session access token using PBKDF2.
// This ensures cache data is unreadable without a valid auth session.

const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const CHUNK = 8192; // Process base64 in 8KB chunks to avoid call-stack overflow

// Chunked base64 encode, btoa(String.fromCharCode(...bytes)) crashes or
// blocks the main thread for seconds when bytes.length > ~50KB.
function uint8ToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

// Chunked base64 decode
function base64ToUint8(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += CHUNK) {
    const end = Math.min(i + CHUNK, binary.length);
    for (let j = i; j < end; j++) {
      bytes[j] = binary.charCodeAt(j);
    }
  }
  return bytes;
}
// 10k iterations is secure for JWT-derived keys (high-entropy input, not a password).
// 100k was blocking the main thread for 200-500ms on every page load.
const ITERATIONS = 10_000;
const LEGACY_ITERATIONS = 100_000; // for decrypting old cached data

let cachedKey = null;
let cachedToken = null;
let cachedSalt = null;
let cachedIterations = null;

// Track any in-flight derivation so prewarm() and the first decrypt() call
// can race: the second caller reuses the same Promise instead of starting a
// redundant parallel PBKDF2 computation.
let pendingDerive = null;

async function deriveKey(token, salt, iterations = ITERATIONS) {
  // Reuse cached key only if token AND salt AND iterations match
  if (cachedKey && cachedToken === token && cachedIterations === iterations &&
      cachedSalt && salt.every((v, i) => v === cachedSalt[i])) {
    return cachedKey;
  }

  // Reuse any in-flight derivation for the same parameters
  if (pendingDerive &&
      pendingDerive.token === token &&
      pendingDerive.iterations === iterations &&
      pendingDerive.salt.length === salt.length &&
      pendingDerive.salt.every((v, i) => v === salt[i])) {
    return pendingDerive.promise;
  }

  const inflight = { token, salt, iterations, promise: null };

  inflight.promise = (async () => {
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(token),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    cachedKey = key;
    cachedToken = token;
    cachedSalt = salt;
    cachedIterations = iterations;
    if (pendingDerive === inflight) pendingDerive = null;
    return key;
  })();

  pendingDerive = inflight;
  return inflight.promise;
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

  return uint8ToBase64(combined);
}

export async function decrypt(b64, token) {
  const combined = base64ToUint8(b64);

  // Support legacy format (IV-only, no salt prefix) for existing cached data
  if (combined.length > SALT_LENGTH + IV_LENGTH) {
    // Try new format: salt (16) + IV (12) + ciphertext
    // First try current iterations, then legacy 100k if it fails
    const salt = combined.slice(0, SALT_LENGTH);
    const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const ciphertext = combined.slice(SALT_LENGTH + IV_LENGTH);

    // Try 10k iterations first (fast path for newly encrypted data)
    try {
      const key = await deriveKey(token, salt, ITERATIONS);
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv }, key, ciphertext
      );
      return new TextDecoder().decode(decrypted);
    } catch { /* not 10k, try legacy */ }

    // Try legacy 100k iterations (data encrypted before this change)
    try {
      const key = await deriveKey(token, salt, LEGACY_ITERATIONS);
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv }, key, ciphertext
      );
      return new TextDecoder().decode(decrypted);
    } catch { /* fall through to oldest format */ }
  }

  // Oldest legacy format: IV (12) + ciphertext (no per-entry salt)
  const legacySalt = new TextEncoder().encode('salve-health-cache-v1');
  const iv = combined.slice(0, IV_LENGTH);
  const ciphertext = combined.slice(IV_LENGTH);
  const key = await deriveKey(token, legacySalt, LEGACY_ITERATIONS);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv }, key, ciphertext
  );
  return new TextDecoder().decode(decrypted);
}

// Pre-derive the key using the salt from the existing cached data.
// This way cache.read() → decrypt() finds the key already cached and skips PBKDF2.
// IMPORTANT: only decode enough base64 to extract the salt (16 bytes).
// The full cache can be megabytes, decoding it all blocks the main thread.
export async function prewarmKey(token, cachedB64) {
  try {
    if (!cachedB64 || cachedB64.length < 40) return;
    // Base64: 4 chars → 3 bytes. For 28 bytes (salt + IV), need ceil(28/3)*4 = 40 chars.
    const prefix = cachedB64.slice(0, 40);
    const combined = Uint8Array.from(atob(prefix), c => c.charCodeAt(0));
    if (combined.length < SALT_LENGTH) return;
    const salt = combined.slice(0, SALT_LENGTH);
    // Derive with current iterations first (most likely match after first re-encrypt)
    await deriveKey(token, salt, ITERATIONS);
  } catch { /* ignore */ }
}

// Clear cached key on sign-out
export function clearKeyCache() {
  cachedKey = null;
  cachedToken = null;
  cachedSalt = null;
  cachedIterations = null;
}
