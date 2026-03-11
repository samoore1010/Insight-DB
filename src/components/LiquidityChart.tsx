import { DailyData } from "../types";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar, Line, ComposedChart, ReferenceLine } from "recharts";
import { useState, useEffect, useMemo } from "react";
import { formatCurrency as centralizedFormatCurrency } from "../utils/formatters";
import { clsx } from "clsx";

interface Props {
  data: DailyData[];
  forecastDays: number;
  onForecastDaysChange?: (days: number) => void;
  isMaximized?: boolean;
  currency?: string;
}

export default function LiquidityChart({ 
  data, 
  forecastDays, 
  onForecastDaysChange,
  isMaximized = false, 
  currency = 'USD' 
}: Props) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    setIsDark(document.documentElement.classList.contains('dark'));
    return () => observer.disconnect();
  }, []);

  const chartData = useMemo(() => {
    return data.slice(0, forecastDays).map(d => ({
      ...d,
      // Pre-calculate display values for stacking and tooltips
      displayReceipts: d.cashIn - d.grants,
      displayGrants: d.grants,
      displayPayroll: -d.payroll,
      displayBenefits: -d.benefits,
      displayAP: -d.apPayments,
      displayOther: -d.otherDisbursements,
    }));
  }, [data, forecastDays]);

  const formatCurrency = (val: number) => centralizedFormatCurrency(val, currency, true);

  const chartHeight = isMaximized ? "h-[600px]" : "h-[300px] sm:h-[450px]";

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      // Sort payload to show balance at top, then inflows, then outflows
      const sortedPayload = [...payload].sort((a, b) => {
        if (a.dataKey === 'endingBalance') return -1;
        if (b.dataKey === 'endingBalance') return 1;
        return 0;
      });

      return (
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl min-w-[240px]">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-3 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800 pb-2">{label}</p>
          <div className="space-y-2">
            {sortedPayload.map((entry: any, index: number) => {
              const isBalance = entry.dataKey === 'endingBalance';
              return (
                <div key={index} className={clsx(
                  "flex justify-between items-center gap-4",
                  isBalance && "pt-2 border-t border-slate-100 dark:border-slate-800 mt-2"
                )}>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                    <span className={clsx(
                      "text-xs font-medium",
                      isBalance ? "text-slate-900 dark:text-white font-bold" : "text-slate-600 dark:text-slate-300"
                    )}>{entry.name}</span>
                  </div>
                  <span className={clsx(
                    "text-xs font-mono font-bold",
                    isBalance ? "text-blue-600 dark:text-blue-400" : 
                    entry.value < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
                  )}>
                    {formatCurrency(entry.value)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6 mb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white tracking-tight">Cash Flow Dynamics</h2>
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
            <button
              onClick={() => onForecastDaysChange?.(14)}
              className={clsx(
                "px-3 py-1 text-xs font-bold rounded-md transition-all",
                forecastDays === 14 ? "bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              )}
            >
              14 Days
            </button>
            <button
              onClick={() => onForecastDaysChange?.(91)}
              className={clsx(
                "px-3 py-1 text-xs font-bold rounded-md transition-all",
                forecastDays === 91 ? "bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              )}
            >
              13 Weeks
            </button>
          </div>
        </div>
      </div>

      <div className={`grid grid-cols-1 ${isMaximized ? 'lg:grid-cols-1 gap-12' : 'lg:grid-cols-1 gap-6'}`}>
        <div className={`bg-white dark:bg-slate-900 p-3 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm ${isMaximized ? 'border-none shadow-none' : ''}`}>
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Rolling Liquidity Forecast</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Proportionate view of cash position vs. daily operational flows</p>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Inflows</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-rose-500" />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Outflows</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-1 bg-blue-500 rounded-full" />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Cash Position</span>
              </div>
            </div>
          </div>
          
          <div className={`${chartHeight} w-full`}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? "#1e293b" : "#f1f5f9"} />
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: isDark ? '#64748b' : '#94a3b8', fontSize: 10 }}
                  minTickGap={forecastDays <= 14 ? 10 : 40}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: isDark ? '#64748b' : '#94a3b8', fontSize: 10 }}
                  tickFormatter={formatCurrency}
                  domain={['auto', 'auto']} // Zoom into the relevant range for better proportion
                />
                <Tooltip content={<CustomTooltip />} />
                
                {/* Zero line for clarity on negative liquidity */}
                <ReferenceLine 
                  y={0} 
                  stroke={isDark ? "#f43f5e" : "#e11d48"} 
                  strokeWidth={2} 
                  strokeDasharray="3 3"
                  label={{ 
                    value: 'ZERO', 
                    position: 'right', 
                    fill: isDark ? "#f43f5e" : "#e11d48",
                    fontSize: 10,
                    fontWeight: 'bold'
                  }}
                />
                
                {/* Inflows Stack */}
                <Bar dataKey="displayReceipts" name="Regional Receipts" stackId="flow" fill="#10b981" />
                <Bar dataKey="displayGrants" name="Grants/Other" stackId="flow" fill="#34d399" />
                
                {/* Outflows Stack */}
                <Bar dataKey="displayPayroll" name="Payroll" stackId="flow" fill="#f43f5e" />
                <Bar dataKey="displayBenefits" name="Benefits" stackId="flow" fill="#fb7185" />
                <Bar dataKey="displayAP" name="AP Payments" stackId="flow" fill="#fda4af" />
                <Bar dataKey="displayOther" name="Other Ops" stackId="flow" fill="#fff1f2" />

                {/* Cash Position Overlay - Shared Axis for Proportion */}
                <Line 
                  type="monotone" 
                  dataKey="endingBalance" 
                  name="Ending Balance"
                  stroke="#3b82f6" 
                  strokeWidth={3}
                  dot={false}
                  activeDot={{ r: 6, strokeWidth: 0 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
