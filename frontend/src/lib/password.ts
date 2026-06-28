export async function hashPassword(password: string) {
  const value = String(password || '');

  if (globalThis.crypto?.subtle) {
    const bytes = new TextEncoder().encode(value);
    const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hash))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  }
  return `legacy-${Math.abs(hash).toString(16)}`;
}

export async function verifyPassword(password: string, passwordHash: string) {
  return (await hashPassword(password)) === passwordHash;
}

export function generateRecoveryCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(12);
  globalThis.crypto?.getRandomValues?.(bytes);
  const fallbackSeed = `${Date.now()}-${Math.random()}`;
  const raw = Array.from(bytes).map((byte, index) => {
    const value = byte || fallbackSeed.charCodeAt(index % fallbackSeed.length);
    return chars[value % chars.length];
  }).join('');
  return raw.match(/.{1,4}/g)?.join('-') || raw;
}
