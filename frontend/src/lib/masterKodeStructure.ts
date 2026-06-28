import type { BatangTubuhDetailRow, BatangTubuhItem, KodeAnggaranItem, SubSeksi } from '@/types';

function isPendapatanKode(kode: string) {
  return kode === 'I' || kode.startsWith('I.');
}

function isPengeluaranKode(kode: string) {
  return kode === 'II' || kode.startsWith('II.');
}

function inferParentKode(kode: string, allCodes: Set<string>) {
  const parts = String(kode || '').split('.').filter(Boolean);
  for (let length = parts.length - 1; length > 0; length -= 1) {
    const candidate = parts.slice(0, length).join('.');
    if (allCodes.has(candidate)) return candidate;
  }
  return '';
}

function inferParentKodeFromMap(kode: string, masterByKode: Map<string, KodeAnggaranItem>) {
  return inferParentKode(kode, new Set(masterByKode.keys()));
}

function normalizeMasterItems(masterItems: KodeAnggaranItem[] = []) {
  return masterItems
    .map((item) => ({
      ...item,
      kodeAnggaran: String(item.kodeAnggaran || '').trim(),
      mataAnggaran: String(item.mataAnggaran || '').trim(),
    }))
    .filter((item) => item.kodeAnggaran && item.mataAnggaran && (isPendapatanKode(item.kodeAnggaran) || isPengeluaranKode(item.kodeAnggaran)));
}

function isSubSeksiJudul(item: KodeAnggaranItem) {
  return (item.jenisKode === 'judul' || item.aktifInput === false) && /\bsub\s*[- ]?\s*seksi\b/i.test(item.mataAnggaran);
}

function findClosestJudulKode(kode: string, masterByKode: Map<string, KodeAnggaranItem>) {
  let current = masterByKode.get(kode)?.parentKode || inferParentKodeFromMap(kode, masterByKode);
  while (current) {
    const item = masterByKode.get(current);
    if (item && (item.jenisKode === 'judul' || item.aktifInput === false)) return current;
    current = item?.parentKode || inferParentKodeFromMap(current, masterByKode);
  }
  return isPengeluaranKode(kode) ? 'II' : 'I';
}

function collectExistingDetailRows(items: BatangTubuhItem[] = []) {
  const map = new Map<string, BatangTubuhDetailRow>();
  items.forEach((group) => {
    (group.detailRows || []).forEach((row) => {
      if (row.kode) map.set(row.kode, row);
    });
    (group.batangTubuh || []).forEach((bt) => {
      (bt.detailRows || []).forEach((row) => {
        if (row.kode) map.set(row.kode, row);
      });
    });
  });
  return map;
}

export function buildBatangTubuhFromMasterKode(masterItems: KodeAnggaranItem[] = [], existingItems: BatangTubuhItem[] = []) {
  const normalized = normalizeMasterItems(masterItems);
  const masterByKode = new Map(normalized.map((item) => [item.kodeAnggaran, item]));
  const existingByKode = collectExistingDetailRows(existingItems);
  const groupMap = new Map<string, BatangTubuhItem>();

  const ensureGroup = (kode: string) => {
    const master = masterByKode.get(kode);
    const groupKode = master?.kodeAnggaran || kode;
    const group = groupMap.get(groupKode);
    if (group) return group;
    const parentKode = master?.parentKode || inferParentKodeFromMap(groupKode, masterByKode);
    const parent = parentKode ? masterByKode.get(parentKode) : undefined;
    const nextGroup: BatangTubuhItem = {
      kode: groupKode,
      nama: master?.mataAnggaran || (isPengeluaranKode(groupKode) ? 'Pengeluaran' : 'Pendapatan'),
      subSeksiKode: parent?.kodeAnggaran || (isPengeluaranKode(groupKode) ? 'II' : 'I'),
      subSeksiNama: parent?.mataAnggaran || (isPengeluaranKode(groupKode) ? 'Pengeluaran' : 'Pendapatan'),
      detailRows: [],
      batangTubuh: [],
    };
    groupMap.set(groupKode, nextGroup);
    return nextGroup;
  };

  normalized
    .filter((item) => item.jenisKode === 'judul' || item.aktifInput === false)
    .forEach((item) => ensureGroup(item.kodeAnggaran));

  normalized
    .filter((item) => (item.jenisKode || 'isi') === 'isi' && item.aktifInput !== false)
    .forEach((item) => {
      const groupKode = findClosestJudulKode(item.kodeAnggaran, masterByKode);
      const group = ensureGroup(groupKode);
      const existing = existingByKode.get(item.kodeAnggaran);
      group.detailRows = [
        ...(group.detailRows || []),
        {
          ...existing,
          kode: item.kodeAnggaran,
          nama: item.mataAnggaran,
          MataAnggaran: item.mataAnggaran,
          dianggarkan: Number(existing?.dianggarkan || 0),
          realisasi: Number(existing?.realisasi || 0),
        },
      ];
    });

  return Array.from(groupMap.values())
    .filter((group) => (group.detailRows || []).length > 0)
    .sort((a, b) => a.kode.localeCompare(b.kode, 'id', { numeric: true }))
    .map((group) => ({
      ...group,
      detailRows: [...(group.detailRows || [])].sort((a, b) => a.kode.localeCompare(b.kode, 'id', { numeric: true })),
    }));
}

export function buildSubSeksiFromMasterKode(masterItems: KodeAnggaranItem[] = []) {
  const normalized = normalizeMasterItems(masterItems);
  const subSeksiJudulItems = normalized.filter(isSubSeksiJudul);
  const masterByKode = new Map(normalized.map((item) => [item.kodeAnggaran, item]));
  const subSeksiKodeSet = new Set(subSeksiJudulItems.map((item) => item.kodeAnggaran));
  const isiBySubSeksiKode = new Map<string, KodeAnggaranItem[]>();

  normalized
    .filter((item) => (item.jenisKode || 'isi') === 'isi' && item.aktifInput !== false)
    .forEach((item) => {
      let parentKode = item.parentKode || inferParentKodeFromMap(item.kodeAnggaran, masterByKode);
      while (parentKode) {
        if (subSeksiKodeSet.has(parentKode)) {
          const children = isiBySubSeksiKode.get(parentKode) || [];
          children.push(item);
          isiBySubSeksiKode.set(parentKode, children);
          return;
        }
        const parent = masterByKode.get(parentKode);
        parentKode = parent?.parentKode || inferParentKodeFromMap(parentKode, masterByKode);
      }
  });

  return subSeksiJudulItems
    .map((item) => {
      const anak = (isiBySubSeksiKode.get(item.kodeAnggaran) || [])
        .map((child) => ({ kode: child.kodeAnggaran, nama: child.mataAnggaran }));
      return {
        nama: item.mataAnggaran,
        kode: item.kodeAnggaran,
        jenis: isPengeluaranKode(item.kodeAnggaran) ? 'pengeluaran' : 'pendapatan',
        anak,
      } as Omit<SubSeksi, 'id'>;
    })
    .filter((item) => item.anak && item.anak.length > 0)
    .sort((a, b) => a.kode.localeCompare(b.kode, 'id', { numeric: true }));
}
