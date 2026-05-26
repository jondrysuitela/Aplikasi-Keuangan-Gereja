export type SummaryData = {
  totalPemasukan: number;
  totalPengeluaran: number;
  saldoAkhir: number;
};

export type MonthlyChartItem = {
  bulan: string;
  jumlah: number;
};

export type MonthlyChartResponse = {
  pemasukan: MonthlyChartItem[];
  pengeluaran: MonthlyChartItem[];
};

export type CategoryRow = {
  kategori: string;
  pemasukan: number;
  pengeluaran: number;
};

export type RecentTransaction = {
  uuid: string;
  tanggal: string;
  no: string;
  uraian: string;
  kode_anggaran: string;
  mata_anggaran: string;
  penerimaan: number;
  pengeluaran: number;
  lembar_id?: string | null;
};

function getFinanceBaseUrl() {
  return (import.meta as any).env.VITE_FINANCE_BASE_URL || 'https://jemaat-gpm-suli.vercel.app/';
}

async function requestJson<T>(path: string): Promise<T> {
  const url = new URL(path, getFinanceBaseUrl()).toString();
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Request failed ${res.status}: ${body}`);
  }

  const payload = await res.json().catch(() => null);
  if (!payload) {
    throw new Error('Invalid JSON response from finance API');
  }

  if (typeof payload === 'object' && payload !== null && 'error' in payload) {
    const errorMessage = (payload as any).message || (payload as any).error || 'Finance API returned error';
    throw new Error(String(errorMessage));
  }

  return payload as T;
}

export async function getFinanceSummary(year: number): Promise<SummaryData> {
  return await requestJson<{ ok: boolean; data: SummaryData }>(`/api/finance/summary?year=${year}`).then((result) => {
    if (!result.ok) throw new Error('Finance summary request failed');
    return result.data;
  });
}

export async function getMonthlyChart(year: number): Promise<MonthlyChartResponse> {
  return await requestJson<{ ok: boolean; data: MonthlyChartResponse }>(`/api/finance/monthly-chart?year=${year}`).then((result) => {
    if (!result.ok) throw new Error('Monthly chart request failed');
    return result.data;
  });
}

export async function getFinanceCategories(year: number): Promise<CategoryRow[]> {
  return await requestJson<{ ok: boolean; data: CategoryRow[] }>(`/api/finance/categories?year=${year}`).then((result) => {
    if (!result.ok) throw new Error('Finance categories request failed');
    return result.data;
  });
}

export async function getRecentTransactions(year: number): Promise<RecentTransaction[]> {
  return await requestJson<{ ok: boolean; data: RecentTransaction[] }>(`/api/finance/recent-transactions?year=${year}`).then((result) => {
    if (!result.ok) throw new Error('Recent transactions request failed');
    return result.data;
  });
}
