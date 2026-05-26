// UUID helper untuk sinkronisasi online.
// Tidak mengubah nama field lama; dipakai hanya jika id/uuid belum ada.

export function uuidv4(): string {
  // Browser-safe UUID v4 generation (tanpa dependensi tambahan)
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return (crypto as any).randomUUID();
  }

  // Fallback RFC4122-ish
  const bytes = new Uint8Array(16);
  const anyCrypto = crypto as any;
  if (typeof anyCrypto !== 'undefined' && typeof anyCrypto.getRandomValues === 'function') {
    anyCrypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }

  // Per RFC4122: set version to 4
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  // Per RFC4122: set variant to 10
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  const b = Array.from(bytes).map(toHex).join('');

  return `${b.slice(0, 8)}-${b.slice(8, 12)}-${b.slice(12, 16)}-${b.slice(16, 20)}-${b.slice(20)}`;
}

export function ensureTxId(input: { id?: string; uuid?: string } | null | undefined): string {
  if (!input) return uuidv4();
  return input.id || input.uuid || uuidv4();
}

