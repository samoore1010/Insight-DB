import { useState } from "react";
import { DailyData } from "../types";
import { clsx } from "clsx";
import { ChevronDown, ChevronUp, TrendingDown, TrendingUp, History, FileText } from "lucide-react";
import { isBefore, startOfToday, parse } from "date-fns";
import { formatCurrency as centralizedFormatCurrency, formatDate as centralizedFormatDate } from "../utils/formatters";

interface Props {
  data: DailyData[];
  isMaximized?: boolean;
  currency?: string;
  dateFormat?: string;
  actualsOverrides?: Record<string, { actualCashIn?: number; actualCashOut?: number }>;
}

export default function ReconciliationTable({
  data,
  isMaximized = false,
  currency = 'USD',
  dateFormat = 'MM/DD/YYYY',
  actualsOverrides = {}
}: Props) {
  const [isCollapsed, setIsCollapsed] = useState(!isMaximized);

  const formatCurrency = (val: number) => centralizedFormatCurrency(val, currency, true);
  const formatDate = (date: string | Date) => centralizedFormatDate(date, dateFormat);

  // Only show historical data or days with actuals from the main dataset
  const historicalFromData = data.filter(row => {
    const dayDate = parse(row.date, "M/d/yyyy", new Date());
    return isBefore(dayDate, startOfToday()) || row.actualCashIn !== undefined || row.actualCashOut !== undefined;
  });

  // Build rows for actuals dates that fall BEFORE the generated data range
  // (e.g. uploaded bank feed for dates in the past that have no generated row)
  const existingDates = new Set(data.map(d => d.date));
  const extraRows: DailyData[] = Object.entries(actualsOverrides)
    .filter(([dateStr]) => {
      if (existingDates.has(dateStr)) return false;
      try {
        const d = parse(dateStr, "M/d/yyyy", new Date());
        return isBefore(d, startOfToday());
      } catch { return false; }
    })
    .map(([dateStr, vals]) => ({
      date: dateStr,
      cashIn: 0, cashOut: 0, netFlow: 0, endingBalance: 0,
      payroll: 0, apPayments: 0, benefits: 0, otherDisbursements: 0,
      regionalReceipts: {}, grants: 0, disbursements: [],
      actualCashIn: vals.actualCashIn,
      actualCashOut: vals.actualCashOut,
    }));

  const historicalData = [...historicalFromData, ...extraRows]
    .sort((a, b) => {
      const da = parse(a.date, "M/d/yyyy", new Date());
      const db = parse(b.date, "M/d/yyyy", new Date());
      return db.getTime() - da.getTime(); // most recent first
    });

  const hasAnyActualIn = historicalData.some(r => r.actualCashIn !== undefined);
  const hasAnyActualOut = historicalData.some(r => r.actualCashOut !== undefined);

  const totals = historicalData.reduce((acc, curr) => ({
    projIn: acc.projIn + curr.cashIn,
    actIn: acc.actIn + (curr.actualCashIn ?? 0),
    projOut: acc.projOut + curr.cashOut,
    actOut: acc.actOut + (curr.actualCashOut ?? 0),
  }), { projIn: 0, actIn: 0, projOut: 0, actOut: 0 });

  if (historicalData.length === 0) {
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
          {!isCollapsed && (
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {historicalData.map((row, idx) => {
                const inVariance = row.actualCashIn !== undefined ? row.actualCashIn - row.cashIn : 0;
                const outVariance = row.actualCashOut !== undefined ? row.actualCashOut - row.cashOut : 0;

                return (
                  <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-4 py-4 text-sm font-medium text-slate-700 dark:text-slate-300">{formatDate(row.date)}</td>
                    <td className="px-4 py-4 text-sm text-slate-500 dark:text-slate-400 text-right">{formatCurrency(row.cashIn)}</td>
                    <td className="px-4 py-4 text-sm text-emerald-600 dark:text-emerald-400 font-medium text-right">
                      {row.actualCashIn !== undefined ? formatCurrency(row.actualCashIn) : "\u2014"}
                    </td>
                    <td className={clsx(
                      "px-4 py-4 text-[10px] font-bold text-right",
                      inVariance > 0 ? "text-emerald-600 dark:text-emerald-400" : inVariance < 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-400 dark:text-slate-600"
                    )}>
                      {row.actualCashIn !== undefined && (
                        <div className="flex items-center justify-end gap-1">
                          {inVariance > 0 ? <TrendingUp className="w-3 h-3" /> : inVariance < 0 ? <TrendingDown className="w-3 h-3" /> : null}
                          {formatCurrency(inVariance)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-500 dark:text-slate-400 text-right">{formatCurrency(row.cashOut)}</td>
                    <td className="px-4 py-4 text-sm text-rose-600 dark:text-rose-400 font-medium text-right">
                      {row.actualCashOut !== undefined ? formatCurrency(row.actualCashOut) : "\u2014"}
                    </td>
                    <td className={clsx(
                      "px-4 py-4 text-[10px] font-bold text-right",
                      outVariance < 0 ? "text-emerald-600 dark:text-emerald-400" : outVariance > 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-400 dark:text-slate-600"
                    )}>
                      {row.actualCashOut !== undefined && (
                        <div className="flex items-center justify-end gap-1">
                          {outVariance < 0 ? <TrendingUp className="w-3 h-3" /> : outVariance > 0 ? <TrendingDown className="w-3 h-3" /> : null}
                          {formatCurrency(Math.abs(outVariance))}
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
              <td className="px-4 py-4 text-xs font-medium text-slate-500 dark:text-slate-400 text-right">{formatCurrency(totals.projIn)}</td>
              <td className="px-4 py-4 text-sm font-bold text-emerald-700 dark:text-emerald-400 text-right">{hasAnyActualIn ? formatCurrency(totals.actIn) : "—"}</td>
              <td className="px-4 py-4 text-right"></td>
              <td className="px-4 py-4 text-xs font-medium text-slate-500 dark:text-slate-400 text-right">{formatCurrency(totals.projOut)}</td>
              <td className="px-4 py-4 text-sm font-bold text-rose-700 dark:text-rose-400 text-right">{hasAnyActualOut ? formatCurrency(totals.actOut) : "—"}</td>
              <td className="px-4 py-4 text-right"></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Mobile card layout */}
      <div className="md:hidden">
        {!isCollapsed && (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {historicalData.map((row, idx) => {
              const inVariance = row.actualCashIn !== undefined ? row.actualCashIn - row.cashIn : 0;
              const outVariance = row.actualCashOut !== undefined ? row.actualCashOut - row.cashOut : 0;

              return (
                <div key={idx} className="px-4 py-4 space-y-3">
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">{formatDate(row.date)}</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Cash In</span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs text-slate-500">{formatCurrency(row.cashIn)}</span>
                        <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                          {row.actualCashIn !== undefined ? formatCurrency(row.actualCashIn) : "\u2014"}
                        </span>
                      </div>
                      {row.actualCashIn !== undefined && (
                        <div className={clsx(
                          "flex items-center gap-1 text-[10px] font-bold",
                          inVariance > 0 ? "text-emerald-600" : inVariance < 0 ? "text-rose-600" : "text-slate-400"
                        )}>
                          {inVariance > 0 ? <TrendingUp className="w-3 h-3" /> : inVariance < 0 ? <TrendingDown className="w-3 h-3" /> : null}
                          {formatCurrency(inVariance)}
                        </div>
                      )}
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Cash Out</span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs text-slate-500">{formatCurrency(row.cashOut)}</span>
                        <span className="text-xs text-rose-600 dark:text-rose-400 font-medium">
                          {row.actualCashOut !== undefined ? formatCurrency(row.actualCashOut) : "\u2014"}
                        </span>
                      </div>
                      {row.actualCashOut !== undefined && (
                        <div className={clsx(
                          "flex items-center gap-1 text-[10px] font-bold",
                          outVariance < 0 ? "text-emerald-600" : outVariance > 0 ? "text-rose-600" : "text-slate-400"
                        )}>
                          {outVariance < 0 ? <TrendingUp className="w-3 h-3" /> : outVariance > 0 ? <TrendingDown className="w-3 h-3" /> : null}
                          {formatCurrency(Math.abs(outVariance))}
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
              <span className="text-slate-500">{formatCurrency(totals.projIn)}</span> / <span className="font-bold text-emerald-700 dark:text-emerald-400">{hasAnyActualIn ? formatCurrency(totals.actIn) : "—"}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Total Out</span>
              <span className="text-slate-500">{formatCurrency(totals.projOut)}</span> / <span className="font-bold text-rose-700 dark:text-rose-400">{hasAnyActualOut ? formatCurrency(totals.actOut) : "—"}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
