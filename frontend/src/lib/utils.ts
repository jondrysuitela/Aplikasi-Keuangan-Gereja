import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(d);
}

export function formatShortDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

export function getMonthName(month: number): string {
  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];
  return months[month - 1] || '';
}

export function getLatestFilledMonth<T extends { tanggal: Date | string | number }>(
  rows: T[],
  year: number,
  hasValue: (row: T) => boolean = () => true,
): number | null {
  let latestMonth: number | null = null;

  rows.forEach((row) => {
    const date = new Date(row.tanggal);
    if (Number.isNaN(date.getTime())) return;
    if (date.getFullYear() !== year || !hasValue(row)) return;

    const month = date.getMonth() + 1;
    if (latestMonth === null || month > latestMonth) {
      latestMonth = month;
    }
  });

  return latestMonth;
}

export function getYearOptions(activeYear: number, dataYears: number[] = []): number[] {
  const currentYear = new Date().getFullYear();
  const startYear = currentYear - 5;
  const endYear = currentYear + 10;
  const years = new Set<number>([activeYear, ...dataYears]);

  for (let year = startYear; year <= endYear; year++) {
    years.add(year);
  }

  return Array.from(years).sort((a, b) => a - b);
}

export function generateId(): string {
  return Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 9);
}
