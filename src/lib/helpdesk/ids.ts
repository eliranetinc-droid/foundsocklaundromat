// Unambiguous base32-ish alphabet: no 0/1/i/l/o.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

function randomChars(n: number): string {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

/** Internal ticket id (URL path segment in the admin). */
export const newTicketId = () => randomChars(12);
/** Customer-facing reference, e.g. FS-7K2QX. */
export const newPublicId = () => 'FS-' + randomChars(5).toUpperCase();
/** Plus-address token: support+<token>@... */
export const newReplyToken = () => 't' + randomChars(10);
