import { supabaseAdmin } from '../config/supabase.js';

function yearMonthRange({ year, month }: { year: number; month?: number }) {
  if (month === undefined) {
    const start = new Date(`${year}-01-01T00:00:00.000Z`);
    const end = new Date(`${year + 1}-01-01T00:00:00.000Z`);
    return { start, end };
  }
  const m = month; // 1-12
  const start = new Date(`${year}-${String(m).padStart(2, '0')}-01T00:00:00.000Z`);
  const end = new Date(`${year}-${String(m).padStart(2, '0')}-01T00:00:00.000Z`);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start, end };
}

export const financeService = {
  summary: async ({ year, month }: { year: number; month?: number }) => {
    const { start, end } = yearMonthRange({ year, month });

    // Only non-deleted and public
    const { data, error } = await supabaseAdmin
      .from('transactions')
      .select('penerimaan, pengeluaran', { count: 'exact' })
      .gte('tanggal', start.toISOString())
      .lt('tanggal', end.toISOString())
      .eq('is_public', true)
      .is('deleted_at', null);

    if (error) throw new Error(error.message);

    const totalPemasukan = (data || []).reduce((s: number, r: any) => s + Number(r.penerimaan || 0), 0);
    const totalPengeluaran = (data || []).reduce((s: number, r: any) => s + Number(r.pengeluaran || 0), 0);

    return {
      totalPemasukan,
      totalPengeluaran,
      saldoAkhir: totalPemasukan - totalPengeluaran,
    };
  },

  monthlyChart: async ({ year }: { year: number }) => {
    const monthRows: { bulan: string; penerimaan: number; pengeluaran: number }[] = [];
    const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

    for (let m = 1; m <= 12; m++) {
      const { start, end } = yearMonthRange({ year, month: m });

      const { data, error } = await supabaseAdmin
        .from('transactions')
        .select('penerimaan, pengeluaran')
        .gte('tanggal', start.toISOString())
        .lt('tanggal', end.toISOString())
        .eq('is_public', true)
        .is('deleted_at', null);

      if (error) throw new Error(error.message);

      const totalP = (data || []).reduce((s: number, r: any) => s + Number(r.penerimaan || 0), 0);
      const totalQ = (data || []).reduce((s: number, r: any) => s + Number(r.pengeluaran || 0), 0);

      monthRows.push({ bulan: MONTHS[m - 1], penerimaan: totalP, pengeluaran: totalQ });
    }

    return {
      pemasukan: monthRows.map((r) => ({ bulan: r.bulan, jumlah: r.penerimaan })),
      pengeluaran: monthRows.map((r) => ({ bulan: r.bulan, jumlah: r.pengeluaran })),
    };
  },

  categories: async ({ year, month }: { year: number; month?: number }) => {
    // Rekap by kode_anggaran (kategori/kode anggaran)
    const { start, end } = yearMonthRange({ year, month });

    const { data, error } = await supabaseAdmin
      .from('transactions')
      .select('kode_anggaran, mata_anggaran, penerimaan, pengeluaran')
      .gte('tanggal', start.toISOString())
      .lt('tanggal', end.toISOString())
      .eq('is_public', true)
      .is('deleted_at', null);

    if (error) throw new Error(error.message);

    const map = new Map<string, { kategori: string; pemasukan: number; pengeluaran: number }>();

    for (const r of data || []) {
      const key = String(r.kode_anggaran || '');
      if (!map.has(key)) {
        map.set(key, { kategori: String(r.mata_anggaran || r.kode_anggaran || key), pemasukan: 0, pengeluaran: 0 });
      }
      const cur = map.get(key)!;
      cur.pemasukan += Number(r.penerimaan || 0);
      cur.pengeluaran += Number(r.pengeluaran || 0);
    }

    return Array.from(map.values()).sort((a, b) => b.pemasukan - a.pemasukan);
  },

  recentTransactions: async ({ year, month }: { year: number; month?: number }) => {
    const { start, end } = yearMonthRange({ year, month });

    const { data, error } = await supabaseAdmin
      .from('transactions')
      .select('uuid, tanggal, no, uraian, kode_anggaran, mata_anggaran, penerimaan, pengeluaran, lembar_id')
      .gte('tanggal', start.toISOString())
      .lt('tanggal', end.toISOString())
      .eq('is_public', true)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(25);

    if (error) throw new Error(error.message);

    return (data || []).map((r: any) => ({
      uuid: r.uuid,
      tanggal: r.tanggal,
      no: r.no,
      uraian: r.uraian,
      kode_anggaran: r.kode_anggaran,
      mata_anggaran: r.mata_anggaran,
      penerimaan: Number(r.penerimaan || 0),
      pengeluaran: Number(r.pengeluaran || 0),
      lembar_id: r.lembar_id,
    }));
  },
};

