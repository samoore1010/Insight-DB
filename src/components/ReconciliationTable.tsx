import { useState, useMemo } from "react";
import { DailyData } from "../types";
import { clsx } from "clsx";
import { ChevronDown, ChevronUp, TrendingDown, TrendingUp, History, FileText, Calendar } from "lucide-react";
import { isBefore, startOfToday, parse, subDays } from "date-fns";
import { formatCurrency as centralizedFormatCurrency, formatDate as centralizedFormatDate } from "../utils/formatters";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from "recharts";

type ReconciliationTimeframe = "7D" | "14D" | "30D" | "All";

interface Props {
  data: DailyData[];
  isMaximized?: boolean;
  currency?: string;
  dateFormat?: string;
  actualsOverrides?: Record<string, { actualCashIn?: number; actualCashOut?: number }>;
  projectionOverrides?: Record<string, Partial<DailyData>>;
}

export default function ReconciliationTable({
  data,
  isMaximized = false,
  currency = 'USD',
  dateFormat = 'MM/DD/YYYY',
  actualsOverrides = {},
  projectionOverrides = {}
}: Props) {
  const [isCollapsed, setIsCollapsed] = useState(!isMaximized);
  const [timeframe, setTimeframe] = useState<ReconciliationTimeframe>("30D");

  const formatCurrencyVal = (val: number) => centralizedFormatCurrency(val, currency, true);
  const formatDate = (date: string | Date) => centralizedFormatDate(date, dateFormat);

  // Build the full unfiltered historical dataset
  const allHistoricalData = useMemo(() => {
    // From main dataset
    const historicalFromData = data.filter(row => {
      const dayDate = parse(row.date, "M/d/yyyy", new Date());
      return isBefore(dayDate, startOfToday()) || row.actualCashIn !== undefined || row.actualCashOut !== undefined;
    });

    // Extra rows for dates before the generated range
    const existingDates = new Set(data.map(d => d.date));
    const historicalExtraDates = new Set<string>();
    for (const dateStr of Object.keys(actualsOverrides)) {
      if (!existingDates.has(dateStr)) {
        try { if (isBefore(parse(dateStr, "M/d/yyyy", new Date()), startOfToday())) historicalExtraDates.add(dateStr); } catch {}
      }
    }
    for (const dateStr of Object.keys(projectionOverrides)) {
      if (!existingDates.has(dateStr)) {
        try { if (isBefore(parse(dateStr, "M/d/yyyy", new Date()), startOfToday())) historicalExtraDates.add(dateStr); } catch {}
      }
    }
    const extraRows: DailyData[] = Array.from(historicalExtraDates).map(dateStr => {
      const actuals = actualsOverrides[dateStr];
      const proj = projectionOverrides[dateStr];
      const projCashIn = proj?.cashIn ?? 0;
      return {
        date: dateStr,
        cashIn: projCashIn, cashOut: 0, netFlow: projCashIn, endingBalance: 0,
        payroll: 0, apPayments: 0, benefits: 0, otherDisbursements: 0,
        regionalReceipts: {}, grants: 0, disbursements: [],
        actualCashIn: actuals?.actualCashIn,
        actualCashOut: actuals?.actualCashOut,
      };
    });

    return [...historicalFromData, ...extraRows]
      .sort((a, b) => {
        const da = parse(a.date, "M/d/yyyy", new Date());
        const db = parse(b.date, "M/d/yyyy", new Date());
        return db.getTime() - da.getTime(); // most recent first
      });
  }, [data, actualsOverrides, projectionOverrides]);

  // Apply timeframe filter
  const historicalData = useMemo(() => {
    if (timeframe === "All") return allHistoricalData;
    const days = timeframe === "7D" ? 7 : timeframe === "14D" ? 14 : 30;
    const cutoff = subDays(startOfToday(), days);
    return allHistoricalData.filter(row => {
      const dayDate = parse(row.date, "M/d/yyyy", new Date());
      return !isBefore(dayDate, cutoff);
    });
  }, [allHistoricalData, timeframe]);

  const hasAnyActualIn = historicalData.some(r => r.actualCashIn !== undefined);
  const hasAnyActualOut = historicalData.some(r => r.actualCashOut !== undefined);

  const totals = historicalData.reduce((acc, curr) => ({
    projIn: acc.projIn + curr.cashIn,
    actIn: acc.actIn + (curr.actualCashIn ?? 0),
    projOut: acc.projOut + curr.cashOut,
    actOut: acc.actOut + (curr.actualCashOut ?? 0),
  }), { projIn: 0, actIn: 0, projOut: 0, actOut: 0 });

  // Chart data for maximized view (chronological order)
  const chartData = useMemo(() => {
    return [...historicalData]
      .filter(r => r.actualCashIn !== undefined || r.actualCashOut !== undefined)
      .reverse() // oldest first for chart
      .map(row => {
        const inVariance = row.actualCashIn !== undefined ? row.actualCashIn - row.cashIn : undefined;
        const outVariance = row.actualCashOut !== undefined ? row.actualCashOut - row.cashOut : undefined;
        const dateLabel = formatDate(row.date);
        return {
          date: dateLabel,
          "Projected In": row.cashIn,
          "Actual In": row.actualCashIn,
          "Projected Out": row.cashOut,
          "Actual Out": row.actualCashOut,
          "In Variance": inVariance,
          "Out Variance": outVariance,
        };
      });
  }, [historicalData]);

  const timeframeSelector = (
    <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
      {(["7D", "14D", "30D", "All"] as ReconciliationTimeframe[]).map((tf) => (
        <button
          key={tf}
          onClick={() => setTimeframe(tf)}
          className={`px-2 sm:px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all ${
            timeframe === tf
              ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          }`}
        >
          {tf}
        </button>
      ))}
    </div>
  );

  if (allHistoricalData.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-12 text-center">
        <div className="max-w-xs mx-auto">
          <div className="w-12 h-12 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText className="w-6 h-6 text-slate-400 dark:text-slate-500" />
          </div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">No Actuals Found</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
            Upload your bank feed data in the Reports tab to see historical reconciliation and variance analysis.
          </p>
        </div>
      </div>
    );
  }

  const chartTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg p-3 text-xs">
        <p className="font-bold text-slate-900 dark:text-white mb-2">{label}</p>
        {payload.map((entry: any, i: number) => (
          <div key={i} className="flex items-center justify-between gap-4 py-0.5">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
              <span className="text-slate-600 dark:text-slate-300">{entry.name}</span>
            </div>
            <span className="font-bold text-slate-900 dark:text-white">
              {centralizedFormatCurrency(entry.value ?? 0, currency, true)}
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden ${isMaximized ? 'border-none shadow-none' : ''}`}>
      <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/20">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg text-indigo-600 dark:text-indigo-400">
            <History className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Historical Reconciliation</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Actual bank activity vs. original projections</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {timeframeSelector}
          {!isMaximized && (
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-all"
            >
              {isCollapsed ? (
                <>
                  <ChevronDown className="w-4 h-4" />
                  View History
                </>
              ) : (
                <>
                  <ChevronUp className="w-4 h-4" />
                  Hide History
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Variance chart — maximized view only */}
      {isMaximized && chartData.length > 0 && (
        <div className="p-6 border-b border-slate-100 dark:border-slate-800">
          <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-500" />
            Projected vs. Actual Variance
          </h4>
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-slate-200 dark:text-slate-700" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "currentColor" }}
                  className="text-slate-500 dark:text-slate-400"
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "currentColor" }}
                  className="text-slate-500 dark:text-slate-400"
                  tickFormatter={(v: number) => centralizedFormatCurrency(v, currency, true)}
                />
                <Tooltip content={chartTooltip} />
                <Legend
                  wrapperStyle={{ fontSize: "11px", fontWeight: 600 }}
                />
                <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
                <Line type="monotone" dataKey="Projected In" stroke="#94a3b8" strokeWidth={2} strokeDasharray="6 3" dot={{ r: 3 }} />
                <Line type="monotone" dataKey="Actual In" stroke="#10b981" strokeWidth={2.5} dot={{ r: 4, fill: "#10b981" }} />
                <Line type="monotone" dataKey="Projected Out" stroke="#cbd5e1" strokeWidth={2} strokeDasharray="6 3" dot={{ r: 3 }} />
                <Line type="monotone" dataKey="Actual Out" stroke="#f43f5e" strokeWidth={2.5} dot={{ r: 4, fill: "#f43f5e" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/50 border-y border-slate-200 dark:border-slate-800">
              <th className="px-4 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Date</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Projected In</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Actual In</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Variance</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Projected Out</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Actual Out</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Variance</th>
            </tr>
          </thead>
          {(!isCollapsed || isMaximized) && (
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {historicalData.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-400 dark:text-slate-500">
                    No data in selected timeframe
                  </td>
                </tr>
              ) : historicalData.map((row, idx) => {
                const inVariance = row.actualCashIn !== undefined ? row.actualCashIn - row.cashIn : 0;
                const outVariance = row.actualCashOut !== undefined ? row.actualCashOut - row.cashOut : 0;

                return (
                  <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-4 py-4 text-sm font-medium text-slate-700 dark:text-slate-300">{formatDate(row.date)}</td>
                    <td className="px-4 py-4 text-sm text-slate-500 dark:text-slate-400 text-right">{formatCurrencyVal(row.cashIn)}</td>
                    <td className="px-4 py-4 text-sm text-emerald-600 dark:text-emerald-400 font-medium text-right">
                      {row.actualCashIn !== undefined ? formatCurrencyVal(row.actualCashIn) : "\u2014"}
                    </td>
                    <td className={clsx(
                      "px-4 py-4 text-[10px] font-bold text-right",
                      inVariance > 0 ? "text-emerald-600 dark:text-emerald-400" : inVariance < 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-400 dark:text-slate-600"
                    )}>
                      {row.actualCashIn !== undefined && (
                        <div className="flex items-center justify-end gap-1">
                          {inVariance > 0 ? <TrendingUp className="w-3 h-3" /> : inVariance < 0 ? <TrendingDown className="w-3 h-3" /> : null}
                          {formatCurrencyVal(inVariance)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-500 dark:text-slate-400 text-right">{formatCurrencyVal(row.cashOut)}</td>
                    <td className="px-4 py-4 text-sm text-rose-600 dark:text-rose-400 font-medium text-right">
                      {row.actualCashOut !== undefined ? formatCurrencyVal(row.actualCashOut) : "\u2014"}
                    </td>
                    <td className={clsx(
                      "px-4 py-4 text-[10px] font-bold text-right",
                      outVariance < 0 ? "text-emerald-600 dark:text-emerald-400" : outVariance > 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-400 dark:text-slate-600"
                    )}>
                      {row.actualCashOut !== undefined && (
                        <div className="flex items-center justify-end gap-1">
                          {outVariance < 0 ? <TrendingUp className="w-3 h-3" /> : outVariance > 0 ? <TrendingDown className="w-3 h-3" /> : null}
                          {formatCurrencyVal(Math.abs(outVariance))}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          )}
          <tfoot className="bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800">
            <tr>
              <td className="px-4 py-4 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Historical Totals</td>
              <td className="px-4 py-4 text-xs font-medium text-slate-500 dark:text-slate-400 text-right">{formatCurrencyVal(totals.projIn)}</td>
              <td className="px-4 py-4 text-sm font-bold text-emerald-700 dark:text-emerald-400 text-right">{hasAnyActualIn ? formatCurrencyVal(totals.actIn) : "—"}</td>
              <td className="px-4 py-4 text-right"></td>
              <td className="px-4 py-4 text-xs font-medium text-slate-500 dark:text-slate-400 text-right">{formatCurrencyVal(totals.projOut)}</td>
              <td className="px-4 py-4 text-sm font-bold text-rose-700 dark:text-rose-400 text-right">{hasAnyActualOut ? formatCurrencyVal(totals.actOut) : "—"}</td>
              <td className="px-4 py-4 text-right"></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Mobile card layout */}
      <div className="md:hidden">
        {(!isCollapsed || isMaximized) && (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {historicalData.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-400 dark:text-slate-500">
                No data in selected timeframe
              </div>
            ) : historicalData.map((row, idx) => {
              const inVariance = row.actualCashIn !== undefined ? row.actualCashIn - row.cashIn : 0;
              const outVariance = row.actualCashOut !== undefined ? row.actualCashOut - row.cashOut : 0;

              return (
                <div key={idx} className="px-4 py-4 space-y-3">
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">{formatDate(row.date)}</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Cash In</span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs text-slate-500">{formatCurrencyVal(row.cashIn)}</span>
                        <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                          {row.actualCashIn !== undefined ? formatCurrencyVal(row.actualCashIn) : "\u2014"}
                        </span>
                      </div>
                      {row.actualCashIn !== undefined && (
                        <div className={clsx(
                          "flex items-center gap-1 text-[10px] font-bold",
                          inVariance > 0 ? "text-emerald-600" : inVariance < 0 ? "text-rose-600" : "text-slate-400"
                        )}>
                          {inVariance > 0 ? <TrendingUp className="w-3 h-3" /> : inVariance < 0 ? <TrendingDown className="w-3 h-3" /> : null}
                          {formatCurrencyVal(inVariance)}
                        </div>
                      )}
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Cash Out</span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs text-slate-500">{formatCurrencyVal(row.cashOut)}</span>
                        <span className="text-xs text-rose-600 dark:text-rose-400 font-medium">
                          {row.actualCashOut !== undefined ? formatCurrencyVal(row.actualCashOut) : "\u2014"}
                        </span>
                      </div>
                      {row.actualCashOut !== undefined && (
                        <div className={clsx(
                          "flex items-center gap-1 text-[10px] font-bold",
                          outVariance < 0 ? "text-emerald-600" : outVariance > 0 ? "text-rose-600" : "text-slate-400"
                        )}>
                          {outVariance < 0 ? <TrendingUp className="w-3 h-3" /> : outVariance > 0 ? <TrendingDown className="w-3 h-3" /> : null}
                          {formatCurrencyVal(Math.abs(outVariance))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Total In</span>
              <span className="text-slate-500">{formatCurrencyVal(totals.projIn)}</span> / <span className="font-bold text-emerald-700 dark:text-emerald-400">{hasAnyActualIn ? formatCurrencyVal(totals.actIn) : "—"}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Total Out</span>
              <span className="text-slate-500">{formatCurrencyVal(totals.projOut)}</span> / <span className="font-bold text-rose-700 dark:text-rose-400">{hasAnyActualOut ? formatCurrencyVal(totals.actOut) : "—"}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
