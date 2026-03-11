import { useState, useRef, useMemo, useEffect } from "react";
import { Entity, Report, DailyData, ReportSelection } from "../types";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { 
  Upload, 
  FileUp, 
  Download, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  FileText, 
  Plus,
  Trash2,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  X,
  Printer,
  FileBarChart,
  Users,
  Eye,
  FileDown,
  CheckSquare,
  Square,
  Landmark,
  TrendingUp
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { clsx } from "clsx";
import { format, isWeekend, parse, startOfToday, addDays, endOfWeek, isBefore, isAfter, isSameDay } from "date-fns";
import { exportLiquidityExcel } from "../services/excelExport";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from "recharts";
import { formatCurrency as centralizedFormatCurrency, formatDate as centralizedFormatDate } from "../utils/formatters";

const BANK_HOLIDAYS_2026 = [
  "2026-01-01", // New Year's Day
  "2026-01-19", // MLK Day
  "2026-02-16", // Presidents' Day
  "2026-05-25", // Memorial Day
  "2026-06-19", // Juneteenth
  "2026-07-03", // Independence Day (Observed)
  "2026-09-07", // Labor Day
  "2026-10-12", // Columbus Day
  "2026-11-11", // Veterans Day
  "2026-11-26", // Thanksgiving
  "2026-12-25", // Christmas
];

const isBusinessDay = (date: Date) => {
  if (isWeekend(date)) return false;
  const dateStr = format(date, "yyyy-MM-dd");
  return !BANK_HOLIDAYS_2026.includes(dateStr);
};

const InsightsLogo = ({ className = "w-20 h-20" }: { className?: string }) => (
  <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="50" r="50" fill="#F59E0B" />
    <rect x="18" y="18" width="64" height="64" rx="8" fill="white" />
    <path 
      d="M35 30C35 30 32 45 45 50C58 55 65 40 65 40M40 70C40 70 50 60 45 50M45 50C45 50 60 55 70 45M30 60C30 60 40 55 45 50M45 50C45 50 55 35 50 25" 
      stroke="#F59E0B" 
      strokeWidth="3" 
      strokeLinecap="round" 
    />
    <circle cx="45" cy="50" r="4" fill="#F59E0B" />
    <path d="M35 35L40 42M65 65L58 58M35 65L42 58M65 35L58 42" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

function ReportContent({ 
  reportType, 
  activeRegion, 
  allData, 
  metrics, 
  businessDaysToShow,
  currency = 'USD',
  dateFormat = 'MM/DD/YYYY',
  companyLogo = null
}: { 
  reportType: string, 
  activeRegion: Entity, 
  allData: any, 
  metrics: any, 
  businessDaysToShow: any[],
  selectedReports?: ReportSelection,
  currency?: string,
  dateFormat?: string,
  companyLogo?: string | null
}) {
  const isComprehensive = reportType === "comprehensive";
  const showSummary = isComprehensive;

  const formatCurrency = (val: number, compact = false) => centralizedFormatCurrency(val, currency, compact);
  const formatDate = (date: string | Date) => centralizedFormatDate(date, dateFormat);

  return (
    <div className="max-w-3xl mx-auto space-y-10">
      {/* Cover Page (Only for Comprehensive) */}
      {isComprehensive && (
        <div className="report-section cover-page min-h-[800px] flex flex-col justify-between py-20">
          <div className="space-y-12">
            <div className="flex items-center">
              {companyLogo ? (
                <img src={companyLogo} alt="Company Logo" className="w-32 h-32 object-contain drop-shadow-md" referrerPolicy="no-referrer" />
              ) : (
                <InsightsLogo className="w-24 h-24 drop-shadow-md" />
              )}
            </div>
            
            <div className="space-y-4">
              <div className="h-1 w-32 bg-slate-900 dark:bg-white" />
              <p className="text-2xl font-bold text-slate-600 dark:text-slate-400">
                {activeRegion === "Executive" ? "Consolidated Enterprise Analysis" : `${activeRegion} Regional Analysis`}
              </p>
              <p className="text-lg text-slate-400 font-mono">FY2026 Q1 • Liquidity & Risk Assessment</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-20">
            <div className="space-y-6">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.3em]">Table of Contents</h3>
              <ul className="space-y-4">
                {[
                  "I. Executive Liquidity Summary",
                  "II. Liquidity Trend Analysis",
                  "III. Critical Obligations (Payroll & Benefits)",
                  "IV. Detailed Cash Flow Forecast",
                  "V. Regional Matrix Breakdown",
                  "VI. Variance & Risk Analysis",
                  "VII. Supporting Documentation"
                ].map((item, i) => (
                  <li key={i} className="flex items-center justify-between group">
                    <span className="text-sm font-bold text-slate-900 dark:text-white">{item}</span>
                    <div className="flex-1 border-b border-dotted border-slate-200 dark:border-slate-800 mx-4" />
                    <span className="text-xs font-mono text-slate-400">0{i + 1}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col justify-end text-right space-y-4">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Report Date</p>
                <p className="text-xl font-black text-slate-900 dark:text-white">{formatDate(new Date())}</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Classification</p>
                <div className="mt-1 inline-block px-3 py-1 bg-rose-600 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded">
                  Strictly Confidential
                </div>
              </div>
            </div>
          </div>
          <div className="page-break" />
        </div>
      )}

      {/* Report Header (Not for Cover Page) */}
      {!isComprehensive && (
        <div className="report-section mb-10">
          <div className="flex justify-between items-start border-b-2 border-slate-900 dark:border-white pb-8">
            <div>
              <h1 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">
                Comprehensive Treasury Report
              </h1>
              <p className="text-slate-500 dark:text-slate-400 font-medium mt-1">Insight Treasury {activeRegion === "Executive" ? "Consolidated" : activeRegion} Analysis</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Report Date</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white">{formatDate(new Date())}</p>
              <div className="mt-2 inline-block px-2 py-1 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[8px] font-bold uppercase tracking-[0.2em] rounded">
                Confidential
              </div>
            </div>
          </div>
        </div>
      )}

      {showSummary && (
        <>
          <div className="report-section">
            {isComprehensive && (
              <div className="border-b-2 border-slate-900 dark:border-white pb-2 mb-8">
                <h2 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">
                  I. Executive Liquidity Summary
                </h2>
              </div>
            )}
            {/* Executive Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-10">
              <div className="p-6 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">Total Available Liquidity</p>
                <p className="text-3xl font-black text-slate-900 dark:text-white">
                  {formatCurrency(allData?.[activeRegion][0]?.endingBalance || 0)}
                </p>
                <div className="mt-2 flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Verified Balance</span>
                </div>
              </div>
              <div className="p-6 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">14-Day Projected Net Flow</p>
                <p className={clsx(
                  "text-3xl font-black",
                  (allData?.[activeRegion].slice(0, 14).reduce((acc: number, d: any) => acc + d.netFlow, 0) || 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                )}>
                  {formatCurrency(allData?.[activeRegion].slice(0, 14).reduce((acc: number, d: any) => acc + d.netFlow, 0) || 0)}
                </p>
                <div className="mt-2 flex items-center gap-1">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Forecasted Trend</span>
                </div>
              </div>
              <div className="p-6 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">Treasury Health Status</p>
                <div className="flex items-center gap-3 mt-1">
                  {metrics?.isHealthy ? (
                    <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
                      <CheckCircle2 className="w-5 h-5 text-white" />
                    </div>
                  ) : (
                    <div className="w-8 h-8 bg-rose-500 rounded-lg flex items-center justify-center">
                      <AlertCircle className="w-5 h-5 text-white" />
                    </div>
                  )}
                  <span className={clsx(
                    "text-lg font-black uppercase tracking-tighter",
                    metrics?.isHealthy ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                  )}>
                    {metrics?.isHealthy ? "Optimal" : "Action Required"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Liquidity Trend Chart Section */}
          <div className="report-section">
            {isComprehensive && (
              <div className="border-b-2 border-slate-900 dark:border-white pb-2 mb-8">
                <h2 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">
                  II. Liquidity Trend Analysis
                </h2>
              </div>
            )}
            
            {isComprehensive && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-8">
                <div className="p-4 sm:p-6 bg-slate-900 text-white rounded-2xl">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Projected Month-End Balance</p>
                  <p className="text-3xl font-black text-white">
                    {formatCurrency(allData?.[activeRegion][29]?.endingBalance || 0)}
                  </p>
                </div>
                <div className="p-4 sm:p-6 bg-slate-900 text-white rounded-2xl">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Total Monthly Net Flow</p>
                  <p className={clsx(
                    "text-3xl font-black",
                    (allData?.[activeRegion].slice(0, 30).reduce((acc: number, d: any) => acc + d.netFlow, 0) || 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                  )}>
                    {formatCurrency(allData?.[activeRegion].slice(0, 30).reduce((acc: number, d: any) => acc + d.netFlow, 0) || 0)}
                  </p>
                </div>
              </div>
            )}

            <div className="h-64 w-full mt-4 mb-12">
              <h4 className="font-black text-slate-900 uppercase tracking-widest text-[10px] mb-4">Liquidity Trend (30-Day Business Forecast)</h4>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={allData?.[activeRegion].slice(0, 30).filter((d: any) => isBusinessDay(parse(d.date, "M/d/yyyy", new Date())))}>
                  <defs>
                    <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0f172a" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#0f172a" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="date" 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }}
                    dy={10}
                    tickFormatter={(val) => formatDate(val)}
                  />
                  <YAxis 
                    hide
                    domain={['auto', 'auto']}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="endingBalance" 
                    stroke="#0f172a" 
                    strokeWidth={3}
                    fillOpacity={1} 
                    fill="url(#colorBalance)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Critical Obligations Section */}
          <div className="report-section">
            {isComprehensive && (
              <div className="border-b-2 border-slate-900 dark:border-white pb-2 mb-8">
                <h2 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">
                  III. Critical Obligations (Payroll & Benefits)
                </h2>
              </div>
            )}
            {metrics?.payrolls && metrics.payrolls.length > 0 && (
              <div className="space-y-3 mb-10">
                <h4 className="font-black text-slate-900 dark:text-white uppercase tracking-widest text-[10px] border-b border-slate-100 dark:border-slate-800 pb-2">Upcoming Payroll Obligations (14-Day)</h4>
                <div className="grid grid-cols-1 gap-4">
                  {metrics.payrolls.map((payroll: any, idx: number) => (
                    <div key={idx} className={clsx(
                      "p-5 rounded-2xl border flex flex-col gap-4",
                      payroll.isFunded ? "bg-emerald-50/30 dark:bg-emerald-900/10 border-emerald-100 dark:border-emerald-900/30" : "bg-rose-50/30 dark:bg-rose-900/10 border-rose-100 dark:border-rose-900/30"
                    )}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className={clsx(
                            "w-10 h-10 rounded-xl flex items-center justify-center",
                            payroll.isFunded ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"
                          )}>
                            <Users className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-0.5">Payroll Date</p>
                            <h4 className="text-base font-black text-slate-900 dark:text-white">
                              {formatDate(payroll.date)} — {formatCurrency(payroll.totalAmount)}
                            </h4>
                          </div>
                        </div>
                        <div className={clsx(
                          "px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest",
                          payroll.isFunded ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"
                        )}>
                          {payroll.isFunded ? "Fully Funded" : "Unfunded Gap"}
                        </div>
                      </div>
                      
                      {activeRegion === "Executive" && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                          {payroll.breakdown.map((b: any) => (
                            <div key={b.name} className="flex flex-col gap-1">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{b.name}</span>
                                <div className={clsx(
                                  "w-2 h-2 rounded-full",
                                  b.isFunded ? "bg-emerald-500" : "bg-rose-500"
                                )} />
                              </div>
                              <span className="text-xs font-mono font-bold text-slate-900 dark:text-white">{formatCurrency(b.amount)}</span>
                              <span className={clsx(
                                "text-[9px] font-bold uppercase tracking-widest",
                                b.isFunded ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                              )}>
                                {b.isFunded ? "Funded" : "At Risk"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Detailed Cash Flow Forecast Section */}
          <div className="report-section">
            {isComprehensive && (
              <div className="border-b-2 border-slate-900 dark:border-white pb-2 mb-8">
                <h2 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">
                  IV. Detailed Cash Flow Forecast
                </h2>
              </div>
            )}
            <div className="space-y-4 mb-12">
              <h4 className="font-black text-slate-900 uppercase tracking-widest text-xs border-b border-slate-100 pb-2">
                Corporate Liquidity Forecast (Current & Next Week)
              </h4>
              <div className="overflow-x-auto -mx-2 px-2">
              <table className="w-full text-left border-collapse min-w-[500px]">
                <thead>
                  <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">
                    <th className="py-3">Date</th>
                    <th className="py-3 text-right">Cash In</th>
                    <th className="py-3 text-right">Cash Out</th>
                    <th className="py-3 text-right">Net Flow</th>
                    <th className="py-3 text-right">Ending Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {businessDaysToShow.map((day: any) => (
                    <tr key={day.date} className="text-sm">
                      <td className="py-4 font-bold text-slate-900">{formatDate(day.date)}</td>
                      <td className="py-4 text-right font-mono text-emerald-600">{formatCurrency(day.cashIn)}</td>
                      <td className="py-4 text-right font-mono text-rose-600">({formatCurrency(day.cashOut)})</td>
                      <td className={clsx("py-4 text-right font-mono", day.netFlow >= 0 ? "text-emerald-600" : "text-rose-600")}>
                        {day.netFlow >= 0 ? "+" : ""}{formatCurrency(day.netFlow)}
                      </td>
                      <td className="py-4 text-right font-mono font-bold text-slate-900">{formatCurrency(day.endingBalance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          </div>

          {/* Regional Matrix Section */}
          {activeRegion === "Executive" && (
            <div className="report-section">
              {isComprehensive && (
                <div className="border-b-2 border-slate-900 dark:border-white pb-2 mb-8">
                  <h2 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">
                    V. Regional Matrix Breakdown
                  </h2>
                </div>
              )}
              <div className="space-y-4 mb-10">
                <h4 className="font-black text-slate-900 dark:text-white uppercase tracking-widest text-xs border-b border-slate-100 dark:border-slate-800 pb-2">Regional Liquidity Matrix</h4>
                <div className="overflow-x-auto -mx-2 px-2">
                <table className="w-full text-left border-collapse min-w-[420px]">
                  <thead>
                    <tr className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800">
                      <th className="py-3">Region</th>
                      <th className="py-3 text-right">Current Balance</th>
                      <th className="py-3 text-right">7-Day Forecast</th>
                      <th className="py-3 text-right">14-Day Forecast</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                    {["Flint", "ISH", "Coldwater", "Chicago"].map((region) => {
                      const data = allData?.[region as Entity] || [];
                      const balance = data[0]?.endingBalance || 0;
                      const flow7 = data.slice(0, 7).reduce((acc: number, d: any) => acc + d.netFlow, 0);
                      const flow14 = data.slice(0, 14).reduce((acc: number, d: any) => acc + d.netFlow, 0);
                      return (
                        <tr key={region} className="text-sm">
                          <td className="py-4 font-bold text-slate-900 dark:text-white">{region}</td>
                          <td className="py-4 text-right font-mono text-slate-600 dark:text-slate-400">{formatCurrency(balance)}</td>
                          <td className={clsx("py-4 text-right font-mono", flow7 >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                            {flow7 >= 0 ? "+" : ""}{formatCurrency(flow7)}
                          </td>
                          <td className={clsx("py-4 text-right font-mono", flow14 >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                            {flow14 >= 0 ? "+" : ""}{formatCurrency(flow14)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="text-sm border-t-2 border-slate-900 dark:border-white bg-slate-50/50 dark:bg-slate-800/30">
                      <td className="py-4 font-black text-slate-900 dark:text-white uppercase tracking-tight">Total Consolidated</td>
                      <td className="py-4 text-right font-mono font-black text-slate-900 dark:text-white">
                        {formatCurrency(["Flint", "ISH", "Coldwater", "Chicago"].reduce((sum, r) => sum + (allData?.[r as Entity]?.[0]?.endingBalance || 0), 0))}
                      </td>
                      <td className={clsx(
                        "py-4 text-right font-mono font-black",
                        ["Flint", "ISH", "Coldwater", "Chicago"].reduce((sum, r) => sum + (allData?.[r as Entity]?.slice(0, 7).reduce((acc: number, d: any) => acc + d.netFlow, 0) || 0), 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                      )}>
                        {["Flint", "ISH", "Coldwater", "Chicago"].reduce((sum, r) => sum + (allData?.[r as Entity]?.slice(0, 7).reduce((acc: number, d: any) => acc + d.netFlow, 0) || 0), 0) >= 0 ? "+" : ""}
                        {formatCurrency(["Flint", "ISH", "Coldwater", "Chicago"].reduce((sum, r) => sum + (allData?.[r as Entity]?.slice(0, 7).reduce((acc: number, d: any) => acc + d.netFlow, 0) || 0), 0))}
                      </td>
                      <td className={clsx(
                        "py-4 text-right font-mono font-black",
                        ["Flint", "ISH", "Coldwater", "Chicago"].reduce((sum, r) => sum + (allData?.[r as Entity]?.slice(0, 14).reduce((acc: number, d: any) => acc + d.netFlow, 0) || 0), 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                      )}>
                        {["Flint", "ISH", "Coldwater", "Chicago"].reduce((sum, r) => sum + (allData?.[r as Entity]?.slice(0, 14).reduce((acc: number, d: any) => acc + d.netFlow, 0) || 0), 0) >= 0 ? "+" : ""}
                        {formatCurrency(["Flint", "ISH", "Coldwater", "Chicago"].reduce((sum, r) => sum + (allData?.[r as Entity]?.slice(0, 14).reduce((acc: number, d: any) => acc + d.netFlow, 0) || 0), 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
                </div>
              </div>
            </div>
          )}

          {/* Variance & Risk Analysis Section */}
          <div className="report-section">
            {isComprehensive && (
              <div className="border-b-2 border-slate-900 dark:border-white pb-2 mb-8">
                <h2 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">
                  VI. Variance & Risk Analysis
                </h2>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-8">
              <div className="p-4 sm:p-6 border border-slate-200 rounded-2xl">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Liquidity Distribution</h4>
                <div className="space-y-4">
                  {activeRegion === "Executive" ? (
                    ["Flint", "ISH", "Coldwater", "Chicago"].map(region => {
                      const total = allData?.Executive[0]?.endingBalance || 1;
                      const regionBal = allData?.[region as Entity][0]?.endingBalance || 0;
                      const pct = (regionBal / total) * 100;
                      return (
                        <div key={region}>
                          <div className="flex justify-between text-xs font-bold mb-1">
                            <span>{region}</span>
                            <span>{pct.toFixed(1)}%</span>
                          </div>
                          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-slate-900 rounded-full" 
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div>
                      <div className="flex justify-between text-xs font-bold mb-1">
                        <span>{activeRegion}</span>
                        <span>100.0%</span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-slate-900 rounded-full" 
                          style={{ width: `100%` }}
                        />
                      </div>
                      <p className="text-[10px] text-slate-400 mt-2 italic">Focused regional view</p>
                    </div>
                  )}
                </div>
              </div>
              <div className="p-4 sm:p-6 border border-slate-200 rounded-2xl">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Risk Exposure (14-Day)</h4>
                <div className="space-y-4">
                  {(activeRegion === "Executive" ? ["Flint", "ISH", "Coldwater", "Chicago"] : [activeRegion]).map(region => {
                    const data = allData?.[region as Entity] || [];
                    const minBal = Math.min(...data.slice(0, 14).map(d => d.endingBalance));
                    const isAtRisk = minBal < 50000;
                    return (
                      <div key={region} className="flex items-center justify-between">
                        <span className="text-xs font-bold">{region}</span>
                        <div className={clsx(
                          "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                          isAtRisk ? "bg-rose-100 text-rose-600" : "bg-emerald-100 text-emerald-600"
                        )}>
                          {isAtRisk ? "High Risk" : "Stable"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {isComprehensive && (
              <div className="space-y-4 mb-12">
                <h4 className="font-black text-slate-900 dark:text-white uppercase tracking-widest text-[10px] border-b border-slate-100 dark:border-slate-800 pb-2">
                  {activeRegion === "Executive" ? "Regional Flow Comparison" : `${activeRegion} Flow Analysis`}
                </h4>
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800">
                      <th className="py-3">{activeRegion === "Executive" ? "Region" : "Metric"}</th>
                      <th className="py-3 text-right">Daily Avg In</th>
                      <th className="py-3 text-right">Daily Avg Out</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                    {(activeRegion === "Executive" ? ["Flint", "ISH", "Coldwater", "Chicago"] : [activeRegion]).map((region) => {
                      const data = allData?.[region as Entity].slice(0, 14) || [];
                      const avgIn = data.reduce((acc: number, d: any) => acc + d.cashIn, 0) / 14;
                      const avgOut = data.reduce((acc: number, d: any) => acc + d.cashOut, 0) / 14;
                      return (
                        <tr key={region} className="text-sm">
                          <td className="py-4 font-bold text-slate-900 dark:text-white">{activeRegion === "Executive" ? region : "14-Day Average"}</td>
                          <td className="py-4 text-right font-mono text-emerald-600 dark:text-emerald-400">{formatCurrency(avgIn)}</td>
                          <td className="py-4 text-right font-mono text-rose-600 dark:text-rose-400">({formatCurrency(avgOut)})</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Supporting Documentation Section */}
          <div className="report-section">
            {isComprehensive && (
              <div className="border-b-2 border-slate-900 dark:border-white pb-2 mb-8">
                <h2 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">
                  VII. Supporting Documentation
                </h2>
              </div>
            )}
            <div className="p-8 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-800">
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed italic">
                "This report is generated based on real-time bank ledger data and conservative revenue projections. All figures are subject to final reconciliation. Confidentiality is required for all recipients."
              </p>
              <div className="mt-6 flex items-center gap-4">
                <div className="w-12 h-12 border border-slate-200 dark:border-slate-700 rounded-full flex items-center justify-center text-[10px] font-black text-slate-300 uppercase tracking-widest">
                  Seal
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900 dark:text-white">Treasury Department Approval</p>
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest">Insight Treasury Systems</p>
                </div>
              </div>
            </div>
            
            {/* Footer integrated into last section */}
            <div className="mt-12 pt-8 border-t border-slate-100 dark:border-slate-800 flex justify-between items-end">
              <div>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Report Generated By</p>
                <p className="text-sm font-bold text-slate-900 dark:text-white">Insight Treasury Automated System</p>
              </div>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest text-right">
                Confidential - Internal Use Only<br/>
                Generated: {formatDate(new Date())}
              </p>
            </div>

          </div>
        </>
      )}

    </div>
  );
}

interface Props {
  regions: Entity[];
  allData?: Record<Entity, DailyData[]> | null;
  reports: Report[];
  onReportsChange: (reports: Report[]) => void;
  currency?: string;
  dateFormat?: string;
  companyLogo?: string | null;
  theme?: 'light' | 'dark' | 'system';
}

export default function ReportsView({ 
  regions, 
  allData, 
  reports, 
  onReportsChange,
  currency = 'USD',
  dateFormat = 'MM/DD/YYYY',
  companyLogo = null,
  theme = 'light'
}: Props) {
  const [activeRegion, setActiveRegion] = useState<Entity>(regions[0]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadType, setUploadType] = useState<"projection" | "ap" | "pr" | "revenue">("projection");
  const [showReportPreview, setShowReportPreview] = useState(false);
  const [viewMode, setViewMode] = useState<"files" | "report">("files");
  const [reportType, setReportType] = useState<"comprehensive" | "summary" | "daily" | "projection" | "variance" | "all">("comprehensive");
  const [selectedReports, setSelectedReports] = useState<ReportSelection>({
    comprehensive: true
  });
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePrint = (elementId: string) => {
    const element = document.getElementById(elementId);
    if (!element) return;

    // Clone the full element into a print wrapper appended to <body>
    const printWrapper = document.createElement('div');
    printWrapper.className = 'print-report-wrapper';
    const cloned = element.cloneNode(true) as HTMLElement;
    cloned.removeAttribute('id'); // avoid duplicate IDs

    // Force all nested elements to be fully visible (no scroll clipping)
    const allElements = cloned.querySelectorAll('*');
    allElements.forEach(el => {
      const htmlEl = el as HTMLElement;
      htmlEl.style.overflow = 'visible';
      htmlEl.style.maxHeight = 'none';
      htmlEl.style.height = 'auto';
      htmlEl.style.minHeight = '0';
      htmlEl.style.boxShadow = 'none';
    });
    cloned.style.overflow = 'visible';
    cloned.style.maxHeight = 'none';
    cloned.style.height = 'auto';
    cloned.style.minHeight = '0';
    cloned.style.backgroundColor = 'white';
    cloned.style.padding = '1.5cm';
    cloned.style.width = '100%';
    // Strip box-shadow and border from the outer report container —
    // the shadow renders as vertical lines on page edges and the
    // min-height forces a full-page-tall box that creates a blank page
    cloned.style.boxShadow = 'none';
    cloned.style.border = 'none';
    cloned.style.borderRadius = '0';

    // Fix blank page issue: instead of page-break-after on cover page,
    // use page-break-before on the first section AFTER the cover page.
    // This is the standard fix — break-after creates a trailing blank page
    // in many browsers, while break-before on the next element does not.
    // Remove all .page-break divs — they are empty divs with
    // page-break-before:always that create blank pages when combined
    // with any other break mechanism. The cover page had one inside it
    // at the bottom (line 162 of ReportContent) which was the source
    // of the persistent blank page 2.
    cloned.querySelectorAll('.page-break').forEach(el => el.remove());

    const coverPage = cloned.querySelector('.cover-page') as HTMLElement | null;
    if (coverPage) {
      // Let the cover page use break-after to push content to next page
      coverPage.style.pageBreakAfter = 'always';
      coverPage.style.breakAfter = 'page';
      // Remove report-section class to avoid the !important margin-bottom: 2cm
      coverPage.classList.remove('report-section');
      coverPage.style.marginBottom = '0';

      // Strip space-y so siblings have no auto margins
      const parent = coverPage.parentElement;
      if (parent) {
        parent.className = parent.className.replace(/space-y-\S+/g, '');
        const nextSection = coverPage.nextElementSibling as HTMLElement | null;
        if (nextSection) {
          nextSection.style.marginTop = '0';
        }
      }
    }

    printWrapper.appendChild(cloned);
    document.body.appendChild(printWrapper);

    window.print();

    // Cleanup after print dialog closes
    setTimeout(() => {
      document.body.removeChild(printWrapper);
    }, 1000);
  };

  const handleDownloadPDF = async (elementId: string, fileName: string) => {
    const element = document.getElementById(elementId);
    if (!element) {
      console.error(`Element with ID ${elementId} not found`);
      return;
    }

    setIsGeneratingPDF(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 200));

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        // Expand cloned element to full width so nothing is clipped
        scrollX: 0,
        scrollY: -window.scrollY,
        onclone: (clonedDoc) => {
          // Remove dark mode from the document root
          clonedDoc.documentElement.classList.remove('dark');

          const clonedElement = clonedDoc.getElementById(elementId);
          if (!clonedElement) return;

          // Ensure light background
          clonedElement.style.backgroundColor = '#ffffff';
          clonedElement.style.color = '#0f172a';

          // Make sure all content is visible (no overflow hidden clipping)
          clonedElement.style.overflow = 'visible';
          clonedElement.style.maxHeight = 'none';
          clonedElement.style.height = 'auto';

          // Hide no-print elements
          clonedElement.querySelectorAll('.no-print').forEach(el => {
            (el as HTMLElement).style.display = 'none';
          });

          // Force all dark: variant styles off by removing dark class everywhere
          clonedDoc.querySelectorAll('.dark').forEach(el => {
            el.classList.remove('dark');
          });

          // Ensure scrollable containers show all content
          clonedElement.querySelectorAll('[class*="overflow"]').forEach(el => {
            (el as HTMLElement).style.overflow = 'visible';
            (el as HTMLElement).style.maxHeight = 'none';
          });
        }
      });

      const imgData = canvas.toDataURL('image/png');
      const imgProps = pdf.getImageProperties(imgData);
      const margin = 10;
      const contentWidth = pdfWidth - (2 * margin);
      const imgHeight = (imgProps.height * contentWidth) / imgProps.width;
      const contentHeight = pdfHeight - (2 * margin);

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', margin, margin, contentWidth, imgHeight);
      heightLeft -= contentHeight;

      while (heightLeft > 0) {
        position -= contentHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', margin, margin + position, contentWidth, imgHeight);
        heightLeft -= contentHeight;
      }

      pdf.save(`${fileName.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd')}.pdf`);
    } catch (error) {
      console.error("PDF Generation Error:", error);
      alert("There was an error generating your PDF. Please try using your browser's Print > Save as PDF option instead.");
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const parseCSV = (text: string): Record<string, number> => {
    const lines = text.split('\n');
    const projections: Record<string, number> = {};
    
    // Skip header
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // Handle the format: Date,Conservative Projection,
      // e.g. 3/9/2026," $195,273.13 ",
      const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
      if (parts.length >= 2) {
        const dateStr = parts[0].trim();
        let amountStr = parts[1].trim().replace(/[ "$%,]/g, '');
        
        // Handle $- or empty
        if (amountStr === '-' || !amountStr) {
          projections[dateStr] = 0;
        } else {
          const amount = parseFloat(amountStr);
          if (!isNaN(amount)) {
            projections[dateStr] = amount;
          }
        }
      }
    }
    return projections;
  };

  const parseActualsCSV = (text: string): Record<string, { actualCashIn: number, actualCashOut: number }> => {
    const lines = text.split('\n');
    const actuals: Record<string, { actualCashIn: number, actualCashOut: number }> = {};
    
    // Header: Details,Posting Date,Amount
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const parts = line.split(',');
      if (parts.length >= 3) {
        const type = parts[0].trim().toUpperCase();
        const dateStr = parts[1].trim();
        const amount = Math.abs(parseFloat(parts[2].trim().replace(/[ "$%,]/g, '')));
        
        if (!actuals[dateStr]) {
          actuals[dateStr] = { actualCashIn: 0, actualCashOut: 0 };
        }
        
        if (type === 'DEBIT') {
          actuals[dateStr].actualCashOut += amount;
        } else if (type === 'CREDIT' || type === 'INFLOW') {
          actuals[dateStr].actualCashIn += amount;
        }
      }
    }
    return actuals;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      
      let parsedData: any = null;
      if (uploadType === "projection") {
        parsedData = parseCSV(text);
      } else {
        parsedData = parseActualsCSV(text);
      }

      const newReport: Report = {
        id: Math.random().toString(36).substr(2, 9),
        name: file.name,
        type: uploadType === "projection" ? "Projection" : uploadType === "ap" ? "AP Report" : uploadType === "pr" ? "PR Report" : "Revenue Actuals",
        uploadedAt: new Date().toISOString(),
        region: activeRegion,
        status: "Processed",
        size: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
        data: parsedData
      };

      onReportsChange([newReport, ...reports]);
      setIsUploading(false);
      alert(`Successfully processed ${file.name}. ${newReport.type} has been applied to the ${activeRegion} dashboard.`);
    };
    reader.readAsText(file);
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleDeleteReport = (id: string) => {
    onReportsChange(reports.filter(r => r.id !== id));
  };

  const filteredReports = activeRegion === "Executive" 
    ? reports 
    : reports.filter(r => r.region === activeRegion);

  // Calculate report metrics
  const getReportMetrics = () => {
    if (!allData) return null;
    const regionData = allData[activeRegion];
    const netFlow14 = regionData.slice(0, 14).reduce((acc, d) => acc + d.netFlow, 0);
    const minBalance14 = Math.min(...regionData.slice(0, 14).map(d => d.endingBalance));
    
    // Find all payrolls in next 14 days
    const payrolls: { 
      date: string, 
      totalAmount: number, 
      isFunded: boolean, 
      breakdown: { name: string, amount: number, isFunded: boolean }[] 
    }[] = [];
    
    for (let i = 0; i < 14; i++) {
      const day = regionData[i];
      if (day.payroll > 0) {
        const breakdown: { name: string, amount: number, isFunded: boolean }[] = [];
        
        if (activeRegion === "Executive") {
          (["Flint", "ISH", "Coldwater", "Chicago"] as const).forEach(r => {
            const rDay = allData[r][i];
            if (rDay.payroll > 0) {
              breakdown.push({
                name: r,
                amount: rDay.payroll,
                isFunded: rDay.endingBalance >= 0
              });
            }
          });
        } else {
          breakdown.push({
            name: activeRegion,
            amount: day.payroll,
            isFunded: day.endingBalance >= 0
          });
        }

        if (breakdown.length > 0) {
          payrolls.push({
            date: day.date,
            totalAmount: day.payroll,
            isFunded: day.endingBalance >= 0,
            breakdown
          });
        }
      }
    }

    const isHealthy = netFlow14 >= 0 && minBalance14 >= 0 && payrolls.every(p => p.isFunded);

    return {
      netFlow14,
      minBalance14,
      isHealthy,
      payrolls
    };
  };

  const metrics = getReportMetrics();

  const businessDaysToShow = useMemo(() => {
    if (!allData) return [];
    const regionData = allData[activeRegion];
    const today = startOfToday();
    
    // Find the end of the current week (Saturday)
    const endOfCurrentWeek = endOfWeek(today);
    
    // Find the end of the next week (following Saturday)
    const endOfNextWeek = addDays(endOfCurrentWeek, 7);

    return regionData.filter(day => {
      const dayDate = parse(day.date, "M/d/yyyy", new Date());
      // Must be today or later
      if (isBefore(dayDate, today) && !isSameDay(dayDate, today)) return false;
      // Must be before or on the end of next week
      if (isAfter(dayDate, endOfNextWeek)) return false;
      // Must be a business day
      return isBusinessDay(dayDate);
    });
  }, [allData]);

  useEffect(() => {
    if (showReportPreview) {
      document.body.classList.add('report-open');
    } else {
      document.body.classList.remove('report-open');
    }
    return () => document.body.classList.remove('report-open');
  }, [showReportPreview]);

  const StatusIcon = ({ status }: { status: Report["status"] }) => {
    switch (status) {
      case "Processed": return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
      case "Pending": return <Clock className="w-4 h-4 text-amber-500" />;
      case "Error": return <AlertCircle className="w-4 h-4 text-rose-500" />;
    }
  };

  return (
    <div className="space-y-8">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Regional Reporting & Documentation</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Upload revenue projections and export professional regional reports.</p>
        </div>
        <div className="relative">
          <button 
            className="flex items-center gap-2 bg-slate-900 dark:bg-slate-800 text-white px-6 py-3 rounded-xl font-semibold hover:bg-slate-800 dark:hover:bg-slate-700 transition-all shadow-lg shadow-slate-900/10"
            onClick={() => setShowExportDropdown(!showExportDropdown)}
          >
            <Download className="w-5 h-5" />
            Export
            <ChevronDown className={clsx("w-4 h-4 transition-transform", showExportDropdown && "rotate-180")} />
          </button>

          <AnimatePresence>
            {showExportDropdown && (
              <>
                <div 
                  className="fixed inset-0 z-10" 
                  onClick={() => setShowExportDropdown(false)} 
                />
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 py-2 z-20"
                >
                  <button 
                    onClick={() => {
                      setReportType("comprehensive");
                      setViewMode("report");
                      setShowExportDropdown(false);
                    }}
                    className="w-full flex items-center justify-between px-4 py-3 text-left text-sm font-bold text-slate-900 dark:text-white bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="w-4 h-4 text-emerald-600" />
                      Comprehensive Treasury Report
                    </div>
                  </button>

                  <div className="h-px bg-slate-100 dark:bg-slate-800 my-1" />

                  <button 
                    onClick={() => {
                      // If we are already in report mode, download that content
                      if (viewMode === "report") {
                        handleDownloadPDF('in-dashboard-report-content', `${activeRegion}_${reportType}_Report`);
                      } else {
                        // Otherwise, we need to temporarily render it or just open the preview modal
                        setReportType("comprehensive");
                        setShowReportPreview(true);
                        // We'll let the user click download from the modal for better UX 
                        // or we could trigger it automatically after a short delay
                      }
                      setShowExportDropdown(false);
                    }}
                    disabled={isGeneratingPDF}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors disabled:opacity-50"
                  >
                    <FileDown className="w-4 h-4" />
                    {isGeneratingPDF ? "Generating PDF..." : "Download PDF Report"}
                  </button>

                  <div className="h-px bg-slate-100 dark:bg-slate-800 my-1" />
                  
                  <button 
                    onClick={() => {
                      if (allData) exportLiquidityExcel(allData, activeRegion, 'daily');
                      setShowExportDropdown(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <Download className="w-4 h-4 text-emerald-600" />
                    Daily Liquidity (Excel)
                  </button>
                  <button 
                    onClick={() => {
                      if (allData) exportLiquidityExcel(allData, activeRegion, 'weekly');
                      setShowExportDropdown(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <Download className="w-4 h-4 text-blue-600" />
                    Weekly Liquidity (Excel)
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {showReportPreview && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto report-modal-container">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Modal Header */}
              <div className="px-4 sm:px-8 py-4 sm:py-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center flex-shrink-0">
                    <FileText className="text-white w-6 h-6" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-slate-900 truncate">Professional Report Preview</h3>
                    <p className="text-xs text-slate-500 truncate">
                      Comprehensive Enterprise Treasury & Liquidity Analysis
                    </p>
                  </div>
                </div>

                  <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                    <button
                      onClick={() => handleDownloadPDF('printable-report-content', `${activeRegion}_${reportType}_Report`)}
                      disabled={isGeneratingPDF}
                      className="flex items-center gap-2 bg-slate-900 text-white px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/10 no-print disabled:opacity-50"
                    >
                      <FileDown className="w-4 h-4" />
                      {isGeneratingPDF ? "Generating..." : "Download PDF"}
                    </button>
                    <button
                      onClick={() => handlePrint('printable-report-content')}
                      className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-50 transition-all no-print"
                    >
                      <Printer className="w-4 h-4" />
                      Print
                    </button>
                    <button 
                      onClick={() => setShowReportPreview(false)}
                      className="p-2 text-slate-400 hover:text-slate-900 hover:bg-white rounded-xl transition-all no-print"
                    >
                      <X className="w-6 h-6" />
                    </button>
                  </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 sm:p-12 bg-slate-100/50 print:bg-white print:p-0">
                <div className="max-w-3xl mx-auto bg-white shadow-2xl p-4 sm:p-12 min-h-[600px] sm:min-h-[1123px] relative" id="printable-report-content">
                  <ReportContent 
                    reportType={reportType} 
                    activeRegion={activeRegion} 
                    allData={allData} 
                    metrics={metrics} 
                    businessDaysToShow={businessDaysToShow} 
                    selectedReports={selectedReports}
                    currency={currency}
                    dateFormat={dateFormat}
                    companyLogo={companyLogo}
                  />
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Regional Tabs */}
      <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
        <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl w-fit">
          {regions.map((region) => (
            <button
              key={region}
              onClick={() => setActiveRegion(region)}
              className={clsx(
                "px-4 sm:px-6 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap",
                activeRegion === region
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              )}
            >
              {region}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Upload Section */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
            <h3 className="font-bold text-slate-900 dark:text-white px-2">Upload Regional Reports</h3>
            
            <div className="space-y-4">
              {[
                { id: "projection", label: "Revenue Projections", icon: FileUp, color: "emerald", desc: "Forecasted inflows" },
                { id: "revenue", label: "Revenue Actuals", icon: TrendingUp, color: "emerald", desc: "Actual bank inflows" },
                { id: "ap", label: "AP Aging Report", icon: Landmark, color: "rose", desc: "Actual disbursements" },
                { id: "pr", label: "Payroll Detail", icon: Users, color: "blue", desc: "Actual payroll costs" }
              ].map((type) => (
                <button
                  key={type.id}
                  onClick={() => {
                    setUploadType(type.id as any);
                    triggerFileInput();
                  }}
                  className={clsx(
                    "w-full p-4 rounded-2xl border-2 border-dashed transition-all text-left group",
                    uploadType === type.id 
                      ? `border-${type.color}-500 bg-${type.color}-50/50 dark:bg-${type.color}-900/10` 
                      : "border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 bg-slate-50/30 dark:bg-slate-800/30"
                  )}
                >
                  <div className="flex items-center gap-4">
                    <div className={clsx(
                      "w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110",
                      `bg-${type.color}-100 dark:bg-${type.color}-900/30 text-${type.color}-600 dark:text-${type.color}-400`
                    )}>
                      <type.icon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{type.label}</p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">{type.desc}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Accepted Format</p>
              <p className="text-[10px] text-slate-600 dark:text-slate-400 font-mono leading-relaxed">
                Details, Posting Date, Amount<br/>
                DEBIT, 3/2/2026, -18.90
              </p>
            </div>

            <input 
              type="file" 
              ref={fileInputRef}
              className="hidden" 
              accept=".csv"
              onChange={handleFileChange}
            />
          </div>

          <div className="bg-slate-900 rounded-3xl p-6 text-white overflow-hidden relative">
            <div className="relative z-10">
              <h4 className="font-bold mb-2">Reporting Tip</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Uploading revenue projections here will automatically update the "Cash In" forecasts for the {activeRegion} region in your main dashboard.
              </p>
            </div>
            <div className="absolute -right-4 -bottom-4 opacity-10">
              <FileText size={120} />
            </div>
          </div>
        </div>

        {/* Reports List or In-Dashboard Report */}
        <div className="lg:col-span-2">
          {viewMode === "files" ? (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <h3 className="font-bold text-slate-900 dark:text-white">Recent Documents - {activeRegion}</h3>
                <div className="flex items-center gap-4">
                  <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{filteredReports.length} Files</span>
                  {filteredReports.length > 0 && (
                    <button 
                      onClick={() => {
                        onReportsChange(activeRegion === "Executive" ? [] : reports.filter(r => r.region !== activeRegion));
                      }}
                      className="text-xs font-bold text-rose-500 hover:text-rose-600 transition-colors"
                    >
                      Clear All
                    </button>
                  )}
                </div>
              </div>
              
              <div className="divide-y divide-slate-50 dark:divide-slate-800">
                <AnimatePresence mode="popLayout">
                  {filteredReports.length > 0 ? (
                    filteredReports.map((report) => (
                      <motion.div 
                        key={report.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="px-8 py-5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 group-hover:bg-white dark:group-hover:bg-slate-700 group-hover:shadow-sm transition-all">
                            <FileText className="w-6 h-6" />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                              {report.name}
                              <StatusIcon status={report.status} />
                            </h4>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{report.type}</span>
                              <span className="w-1 h-1 bg-slate-300 dark:bg-slate-700 rounded-full" />
                              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{report.size}</span>
                              <span className="w-1 h-1 bg-slate-300 dark:bg-slate-700 rounded-full" />
                              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{report.uploadedAt}</span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button className="p-2 text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-700 rounded-lg shadow-sm transition-all">
                            <Download className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleDeleteReport(report.id)}
                            className="p-2 text-slate-400 dark:text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </motion.div>
                    ))
                  ) : (
                    <div className="px-8 py-20 flex flex-col items-center text-center space-y-4">
                      <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-300 dark:text-slate-600">
                        <FileText className="w-8 h-8" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 dark:text-white">No documents found</h4>
                        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-[240px] mt-1">Upload your first revenue projection to start tracking regional performance.</p>
                      </div>
                    </div>
                  )}
                </AnimatePresence>
              </div>

              {filteredReports.length > 0 && (
                <div className="px-8 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800">
                  <button className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 flex items-center gap-1 transition-colors">
                    View all documents
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col h-full min-h-[600px]">
              <div className="px-4 sm:px-8 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/20">
                <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                  <button
                    onClick={() => setViewMode("files")}
                    className="p-2 hover:bg-white dark:hover:bg-slate-800 rounded-xl text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white transition-all flex-shrink-0"
                  >
                    <X className="w-5 h-5" />
                  </button>
                  <h3 className="font-bold text-slate-900 dark:text-white truncate">
                    {reportType === "summary" && "Weekly Summary"}
                    {reportType === "daily" && "Daily Detail"}
                    {reportType === "projection" && "Monthly Projection"}
                    {reportType === "variance" && "Variance Analysis"}
                    {reportType === "all" && "Full Package"}
                    {reportType === "comprehensive" && "Comprehensive Report"}
                  </h3>

                  {reportType === "all" && (
                    <div className="flex items-center gap-3 ml-4 px-4 py-1.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                      {[
                        { id: 'summary', label: 'Summary' },
                        { id: 'daily', label: 'Daily' },
                        { id: 'projection', label: 'Projection' },
                        { id: 'variance', label: 'Variance' }
                      ].map((report) => (
                        <button
                          key={report.id}
                          onClick={() => setSelectedReports(prev => ({
                            ...prev,
                            [report.id]: !prev[report.id as keyof ReportSelection]
                          }))}
                          className="flex items-center gap-1.5 group"
                        >
                          {selectedReports[report.id as keyof ReportSelection] ? (
                            <CheckSquare className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <Square className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 group-hover:text-slate-400 dark:group-hover:text-slate-500" />
                          )}
                          <span className={clsx(
                            "text-[9px] font-bold uppercase tracking-wider transition-colors",
                            selectedReports[report.id as keyof ReportSelection] ? "text-slate-900 dark:text-white" : "text-slate-400 dark:text-slate-500"
                          )}>
                            {report.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => handleDownloadPDF('in-dashboard-report-content', `${activeRegion}_${reportType}_Report`)}
                    disabled={isGeneratingPDF}
                    className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition-all disabled:opacity-50 shadow-sm"
                  >
                    <FileDown className="w-4 h-4 text-emerald-600" />
                    {isGeneratingPDF ? "..." : "PDF"}
                  </button>
                  <button
                    onClick={() => handlePrint('in-dashboard-report-content')}
                    className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white transition-all"
                  >
                    <Printer className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-3 sm:p-8 bg-slate-50/50 dark:bg-slate-950/20">
                <div className="max-w-3xl mx-auto bg-white dark:bg-slate-900 shadow-sm border border-slate-100 dark:border-slate-800 p-4 sm:p-10 min-h-full" id="in-dashboard-report-content">
                  <ReportContent 
                    reportType={reportType} 
                    activeRegion={activeRegion} 
                    allData={allData} 
                    metrics={metrics} 
                    businessDaysToShow={businessDaysToShow} 
                    selectedReports={selectedReports}
                    currency={currency}
                    dateFormat={dateFormat}
                    companyLogo={companyLogo}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
