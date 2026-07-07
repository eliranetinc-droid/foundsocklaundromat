import { test, expect, describe } from 'vitest';
import { b64uDecode, b64uEncode, encryptPayload, vapidAuthHeader } from './webpush';

// RFC 8291 Appendix A test vector (fetched verbatim from rfc-editor.org).
const V = {
  plaintextB64u: 'V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  authSecret: 'BTBZMqHH6r4Tts7J_aSIgg',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  fullMessage: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

describe('b64u helpers', () => {
  test('roundtrip', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252]);
    expect(b64uDecode(b64uEncode(bytes))).toEqual(bytes);
  });
  test('decodes the RFC plaintext to the watermelon sentence', () => {
    expect(new TextDecoder().decode(b64uDecode(V.plaintextB64u))).toBe('When I grow up, I want to be a watermelon');
  });
});

describe('encryptPayload (RFC 8291 A)', () => {
  test('reproduces the full encrypted message byte-for-byte', async () => {
    const plaintext = new TextDecoder().decode(b64uDecode(V.plaintextB64u));
    const body = await encryptPayload(V.uaPublic, V.authSecret, plaintext, {
      asPrivateB64u: V.asPrivate,
      asPublicB64u: V.asPublic,
      saltB64u: V.salt,
    });
    expect(b64uEncode(body)).toBe(V.fullMessage);
  });
  test('header layout: salt(16) | rs=4096 | idlen=65 | as_public(65)', async () => {
    const body = await encryptPayload(V.uaPublic, V.authSecret, 'x', {
      asPrivateB64u: V.asPrivate, asPublicB64u: V.asPublic, saltB64u: V.salt,
    });
    expect(b64uEncode(body.slice(0, 16))).toBe(V.salt);
    expect(Array.from(body.slice(16, 20))).toEqual([0, 0, 16, 0]); // 4096 big-endian
    expect(body[20]).toBe(65);
    expect(b64uEncode(body.slice(21, 86))).toBe(V.asPublic);
  });
  test('random path produces a different, well-formed message', async () => {
    const a = await encryptPayload(V.uaPublic, V.authSecret, 'hello');
    const b = await encryptPayload(V.uaPublic, V.authSecret, 'hello');
    expect(a.length).toBeGreaterThan(86 + 16);
    expect(b64uEncode(a)).not.toBe(b64uEncode(b)); // fresh salt/keys each send
  });
});

describe('vapidAuthHeader', () => {
  // A locally generated throwaway P-256 private JWK used ONLY by this test.
  const TEST_JWK = JSON.stringify({
    kty: 'EC', crv: 'P-256',
    d: 'qUPS1D7t5-X2Xdnt_Mabbl-b_b0uRvrGd0hPCSHirv0',
    x: 'bOYamQki_EjqAmn-hwXC9mW82ab8Py6KvDazrVWj4P8',
    y: '2QK_bZB2QBlT6xo8Wb9bWH9Sa9uZVbdQoD6BmlSTPUA',
  });
  test('produces a vapid header with a verifiable ES256 JWT', async () => {
    const header = await vapidAuthHeader({ VAPID_PRIVATE_JWK: TEST_JWK } as any, 'https://web.push.apple.com/x/y');
    expect(header).toMatch(/^vapid t=.+\..+\..+, k=.+$/);
    const jwt = header.slice('vapid t='.length, header.indexOf(', k='));
    const [h, p, s] = jwt.split('.');
    const hdr = JSON.parse(new TextDecoder().decode(b64uDecode(h)));
    const pay = JSON.parse(new TextDecoder().decode(b64uDecode(p)));
    expect(hdr).toEqual({ typ: 'JWT', alg: 'ES256' });
    expect(pay.aud).toBe('https://web.push.apple.com');
    expect(pay.sub).toBe('mailto:support@foundsocklaundromat.com');
    expect(pay.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(b64uDecode(s).length).toBe(64); // raw r||s ES256 signature
    // Verify the signature with the JWK's own public part.
    const jwk = JSON.parse(TEST_JWK);
    const pub = await crypto.subtle.importKey('jwk', { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y },
      { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub,
      b64uDecode(s), new TextEncoder().encode(`${h}.${p}`));
    expect(ok).toBe(true);
  });
  test('returns null without a private key', async () => {
    expect(await vapidAuthHeader({} as any, 'https://x.example/e')).toBeNull();
  });
});
