import { VAPID_PUBLIC_KEY, VAPID_SUBJECT, type HelpdeskEnv } from './env';
import { listPushSubscriptions, disablePushSubscription } from './db';

// Minimal Web Push sender for Cloudflare Workers (WebCrypto only).
// Payload encryption: RFC 8291 (aes128gcm). Auth: RFC 8292 (VAPID, ES256).

export function b64uEncode(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function b64uDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 2 ? '==' : s.length % 4 === 3 ? '=' : '';
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};
const utf8 = (s: string) => new TextEncoder().encode(s);

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info: info as BufferSource }, key, len * 8);
  return new Uint8Array(bits);
}

/** Import an uncompressed P-256 public point (0x04||X||Y, 65 bytes) for ECDH. */
const importPub = (raw: Uint8Array) =>
  crypto.subtle.importKey('raw', raw as BufferSource, { name: 'ECDH', namedCurve: 'P-256' }, false, []);

/**
 * RFC 8291 aes128gcm encryption. `det` (deterministic app-server key + salt) is
 * for the RFC test vector ONLY — production omits it and gets fresh randomness.
 */
export async function encryptPayload(
  uaPublicB64u: string,
  authSecretB64u: string,
  plaintext: string,
  det?: { asPrivateB64u: string; asPublicB64u: string; saltB64u: string },
): Promise<Uint8Array> {
  const uaPubRaw = b64uDecode(uaPublicB64u);
  const authSecret = b64uDecode(authSecretB64u);
  const uaPub = await importPub(uaPubRaw);

  let asPriv: CryptoKey; let asPubRaw: Uint8Array; let salt: Uint8Array;
  if (det) {
    asPubRaw = b64uDecode(det.asPublicB64u);
    const x = b64uEncode(asPubRaw.slice(1, 33));
    const y = b64uEncode(asPubRaw.slice(33, 65));
    asPriv = await crypto.subtle.importKey('jwk',
      { kty: 'EC', crv: 'P-256', d: det.asPrivateB64u, x, y },
      { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
    salt = b64uDecode(det.saltB64u);
  } else {
    const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
    asPriv = pair.privateKey;
    asPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
    salt = crypto.getRandomValues(new Uint8Array(16));
  }

  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaPub }, asPriv, 256));
  // RFC 8291 §3.3–3.4
  const ikm = await hkdf(authSecret, shared, concat(utf8('WebPush: info\0'), uaPubRaw, asPubRaw), 32);
  const cek = await hkdf(salt, ikm, utf8('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, utf8('Content-Encoding: nonce\0'), 12);

  const record = concat(utf8(plaintext), new Uint8Array([2])); // 0x02 = final-record padding delimiter
  const aesKey = await crypto.subtle.importKey('raw', cek as BufferSource, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce as BufferSource }, aesKey, record as BufferSource));

  // aes128gcm content-coding header: salt(16) | rs(4, big-endian 4096) | idlen(1)=65 | keyid(as_public, 65)
  const header = concat(salt, new Uint8Array([0, 0, 16, 0]), new Uint8Array([asPubRaw.length]), asPubRaw);
  return concat(header, ct);
}

/** RFC 8292 VAPID Authorization header. Null when the private key secret is absent. */
export async function vapidAuthHeader(env: Pick<HelpdeskEnv, 'VAPID_PRIVATE_JWK'>, endpoint: string): Promise<string | null> {
  if (!env.VAPID_PRIVATE_JWK) return null;
  try {
    const jwk = JSON.parse(env.VAPID_PRIVATE_JWK);
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    const aud = new URL(endpoint).origin;
    const header = b64uEncode(utf8(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
    const payload = b64uEncode(utf8(JSON.stringify({
      aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: VAPID_SUBJECT,
    })));
    const sig = new Uint8Array(await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' }, key, utf8(`${header}.${payload}`)));
    return `vapid t=${header}.${payload}.${b64uEncode(sig)}, k=${VAPID_PUBLIC_KEY}`;
  } catch (e) {
    console.error('[push] vapid header failed:', e);
    return null;
  }
}

export interface PushTarget { endpoint: string; p256dh: string; auth: string; }

/** Send one push. Returns HTTP status (0 on network/crypto error). Never throws. */
export async function sendPush(env: Pick<HelpdeskEnv, 'VAPID_PRIVATE_JWK'>, sub: PushTarget, payload: object): Promise<number> {
  try {
    const auth = await vapidAuthHeader(env, sub.endpoint);
    if (!auth) return 0;
    const body = await encryptPayload(sub.p256dh, sub.auth, JSON.stringify(payload));
    const res = await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: '60',
        Urgency: 'high',
      },
      body: body as BodyInit,
    });
    return res.status;
  } catch (e) {
    console.error('[push] send failed:', e);
    return 0;
  }
}

/** Push to every enrolled device. Failure-tolerant; dead endpoints are disabled. */
export async function notifyPushAll(env: HelpdeskEnv, n: { title: string; body: string; url: string }): Promise<void> {
  try {
    if (!env.VAPID_PRIVATE_JWK) return;
    const subs = await listPushSubscriptions(env.DB);
    for (const sub of subs) {
      const status = await sendPush(env, sub, n);
      if (status === 404 || status === 410) await disablePushSubscription(env.DB, sub.endpoint);
      else if (status !== 201 && status !== 200) console.error('[push] non-ok status', status, 'for', sub.endpoint.slice(0, 40));
    }
  } catch (e) {
    console.error('[push] notify failed:', e);
  }
}
