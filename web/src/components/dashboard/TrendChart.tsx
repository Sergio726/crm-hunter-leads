'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export type TrendPoint = { day: string; nuevos: number; contactos: number };

/**
 * Tendencia diaria del dashboard admin (WEB-6/UXR-6): dos series (clientes nuevos
 * y contactos) por día. Mismos tokens del tema que SellerChart.tsx.
 */
export function TrendChart({ data }: { data: TrendPoint[] }) {
  if (data.length === 0) return null;
  return (
    // La altura va por CSS y no fija en 260: en un teléfono ese alto se comía media
    // pantalla. El eje X no necesita ajuste — `minTickGap` está en píxeles, así que
    // la cantidad de fechas se acomoda sola al ancho disponible.
    <div className="h-52 md:h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="fillNuevos" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.35} />
              <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="fillContactos" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--chart-3)" stopOpacity={0.35} />
              <stop offset="95%" stopColor="var(--chart-3)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="day"
            tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
          />
          <YAxis
            tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            width={28}
          />
          <Tooltip
            cursor={{ stroke: 'var(--border)' }}
            contentStyle={{
              background: 'var(--popover)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              color: 'var(--popover-foreground)',
              fontSize: 12,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Area
            type="monotone"
            dataKey="nuevos"
            name="Clientes nuevos"
            stroke="var(--chart-1)"
            strokeWidth={2}
            fill="url(#fillNuevos)"
          />
          <Area
            type="monotone"
            dataKey="contactos"
            name="Contactos"
            stroke="var(--chart-3)"
            strokeWidth={2}
            fill="url(#fillContactos)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
