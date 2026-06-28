import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import { AppStateMessage } from '@/components/AppStateMessage';

type MonthlyDataItem = {
  bulan: string;
  pemasukan: number;
  pengeluaran: number;
};

type PieDatum = {
  name: string;
  value: number;
};

type DashboardChartsProps = {
  monthlyData: MonthlyDataItem[];
  kategoriData: PieDatum[];
  isDark: boolean;
};

const PIE_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#F97316', '#6366F1', '#14B8A6',
];

export function DashboardCharts({ monthlyData, kategoriData, isDark }: DashboardChartsProps) {
  const chartGridColor = isDark ? '#334155' : '#e5e7eb';
  const chartTooltipBg = isDark ? '#1e293b' : '#ffffff';
  const chartTooltipBorder = isDark ? '#334155' : '#e5e7eb';
  const chartTextColor = isDark ? '#94a3b8' : '#64748b';
  const tooltipTextColor = isDark ? '#e2e8f0' : '#334155';

  return (
    <div className='grid gap-6 xl:grid-cols-[1.2fr_0.8fr]'>
      <Card>
        <CardHeader>
          <CardTitle>Grafik Arus Kas Bulanan</CardTitle>
        </CardHeader>
        <CardContent>
          <div className='h-[300px]'>
            <ResponsiveContainer width='100%' height='100%' minWidth={0} initialDimension={{ width: 640, height: 300 }}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray='3 3' stroke={chartGridColor} />
                <XAxis dataKey='bulan' tick={{ fontSize: 12, fill: chartTextColor }} />
                <YAxis tick={{ fontSize: 12, fill: chartTextColor }} tickFormatter={(v) => `Rp ${(Number(v) / 1000000).toFixed(0)}jt`} />
                <Tooltip
                  formatter={(value) => formatCurrency(Number(value))}
                  contentStyle={{ borderRadius: '8px', border: `1px solid ${chartTooltipBorder}`, backgroundColor: chartTooltipBg, color: tooltipTextColor }}
                />
                <Bar dataKey='pemasukan' name='Pemasukan' fill='#10B981' radius={[4, 4, 0, 0]} />
                <Bar dataKey='pengeluaran' name='Pengeluaran' fill='#EF4444' radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Distribusi Pengeluaran per Kategori</CardTitle>
        </CardHeader>
        <CardContent>
          <div className='h-[400px]'>
            {kategoriData.length > 0 ? (
              <ResponsiveContainer width='100%' height='100%' minWidth={0} initialDimension={{ width: 420, height: 400 }}>
                <PieChart>
                  <Pie
                    data={kategoriData}
                    cx='50%'
                    cy='50%'
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey='value'
                    label={({ percent }) => `${((percent || 0) * 100).toFixed(0)}%`}
                  >
                    {kategoriData.map((_, index) => (
                      <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: unknown) => [
                      value ? formatCurrency(Number(value)) : 'Rp 0',
                    ]}
                    contentStyle={{ borderRadius: '8px', border: `1px solid ${chartTooltipBorder}`, backgroundColor: chartTooltipBg, color: tooltipTextColor }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: '11px', overflow: 'hidden', color: chartTextColor }}
                    iconSize={10}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <AppStateMessage className='h-full' title='Belum ada data pengeluaran' detail='Distribusi kategori akan muncul setelah transaksi pengeluaran diinput.' />
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
