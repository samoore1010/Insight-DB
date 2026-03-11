import { useState } from "react";
import { DailyData } from "../types";
import { clsx } from "clsx";
import { ChevronDown, ChevronUp, AlertCircle, CheckCircle2, TrendingDown, TrendingUp } from "lucide-react";
import { formatCurrency as centralizedFormatCurrency, formatDate as centralizedFormatDate } from "../utils/formatters";

interface Props {
  data: DailyData[];
  forecastDays: number;
  isMaximized?: boolean;
  currency?: string;
  dateFormat?: string;
}

export default function ForecastTable({ 
  data, 
  forecastDays, 
  isMaximized = false,
  currency = 'USD',
  dateFormat = 'MM/DD/YYYY'
}: Props) {
  const [isCollapsed, setIsCollapsed] = useState(!isMaximized);

  const formatCurrency = (val: number) => centralizedFormatCurrency(val, currency, true);
  const formatDate = (date: string | Date) => centralizedFormatDate(date, dateFormat);

  const displayData = data.slice(0, forecastDays);

  const totals = displayData.reduce((acc, curr) => ({
    cashIn: acc.cashIn + curr.cashIn,
    cashOut: acc.cashOut + curr.cashOut,
    netFlow: acc.netFlow + curr.netFlow,
  }), { cashIn: 0, cashOut: 0, netFlow: 0 });

  return (
    <div className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden ${isMaximized ? 'border-none shadow-none' : ''}`}>
      <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Operational Forecast</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">Forward-looking cash flow projections</p>
        </div>
        {!isMaximized && (
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-all"
          >
            {isCollapsed ? (
              <>
                <ChevronDown className="w-4 h-4" />
                Expand Details
              </>
            ) : (
              <>
                <ChevronUp className="w-4 h-4" />
                Collapse Details
              </>
            )}
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/50 border-y border-slate-200 dark:border-slate-800">
              <th className="px-4 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Date</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Projected In</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Projected Out</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Net Flow</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">End Balance</th>
            </tr>
          </thead>
          {!isCollapsed && (
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {displayData.map((row, idx) => {
                return (
                  <tr key={idx} className={clsx(
                    "hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors",
                    row.isSimulated && "bg-amber-50/20 dark:bg-amber-900/10"
                  )}>
                    <td className="px-4 py-4 text-sm font-medium text-slate-700 dark:text-slate-300">
                      <div className="flex items-center gap-2">
                        {formatDate(row.date)}
                        {row.isSimulated && <span className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[8px] font-bold rounded uppercase">Sim</span>}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-emerald-600 dark:text-emerald-400 font-medium text-right">{formatCurrency(row.cashIn)}</td>
                    <td className="px-4 py-4 text-sm text-rose-600 dark:text-rose-400 font-medium text-right">{formatCurrency(row.cashOut)}</td>
                    <td className={clsx(
                      "px-4 py-4 text-sm font-medium text-right",
                      row.netFlow >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                    )}>
                      {formatCurrency(row.netFlow)}
                    </td>
                    <td className={clsx(
                      "px-4 py-4 text-sm font-bold text-right",
                      row.endingBalance >= 0 ? "text-slate-900 dark:text-white" : "text-rose-900 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20"
                    )}>
                      {formatCurrency(row.endingBalance)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          )}
          <tfoot>
            <tr className="bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800">
              <td className="px-4 py-4 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Period Totals</td>
              <td className="px-4 py-4 text-sm font-bold text-emerald-700 dark:text-emerald-400 text-right">{formatCurrency(totals.cashIn)}</td>
              <td className="px-4 py-4 text-sm font-bold text-rose-700 dark:text-rose-400 text-right">{formatCurrency(totals.cashOut)}</td>
              <td className={clsx(
                "px-4 py-4 text-sm font-bold text-right",
                totals.netFlow >= 0 ? "text-emerald-800 dark:text-emerald-300" : "text-rose-800 dark:text-rose-300"
              )}>
                {formatCurrency(totals.netFlow)}
              </td>
              <td className="px-4 py-4 text-right"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
