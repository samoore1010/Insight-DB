import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { motion, AnimatePresence, Reorder } from "motion/react";
import {
  Plus, X, GripVertical, Printer, Save, FolderOpen, Trash2,
  BarChart3, Table2, LayoutGrid, TrendingUp, Calendar, Shield,
  Users, Globe, ChevronDown, Clock, FileText, MessageSquare, BookOpen
} from "lucide-react";
import { clsx } from "clsx";
import { format, startOfToday, addDays, isWeekend, parse, isBefore, isAfter, isSameDay, endOfWeek } from "date-fns";
import {
  Entity, DailyData, DashboardStats, EstimateCategory,
  ReportBlock, ReportModuleType, SavedReport
} from "../types";
import { formatCurrency as centralizedFormatCurrency, formatDate as centralizedFormatDate } from "../utils/formatters";
import { calculateStats } from "../data/parser";
import { generateNarrative } from "./ContextBubble";

// ── Module catalog definition ─────────────────────────────────────
interface ModuleDef {
  type: ReportModuleType;
  label: string;
  description: string;
  icon: typeof BarChart3;
  category: "layout" | "charts" | "tables" | "summaries";
  timeframes: string[];
}

const MODULE_CATALOG: ModuleDef[] = [
  // Layout
  { type: "cover-page", label: "Cover Page", description: "Full-page title page with report name, author, date & logo", icon: BookOpen, category: "layout", timeframes: ["N/A"] },
  // Charts
  { type: "cash-flow-chart", label: "Cash Flow Chart", description: "Stacked bar + line chart of inflows, outflows & ending balance", icon: BarChart3, category: "charts", timeframes: ["14D", "13W"] },
  { type: "variance-chart", label: "Variance Chart", description: "Line chart comparing projected vs actual flows", icon: TrendingUp, category: "charts", timeframes: ["7D", "14D", "30D"] },
  { type: "liquidity-trend", label: "Liquidity Trend", description: "30-day sparkline of balance trend", icon: TrendingUp, category: "charts", timeframes: ["30D"] },
  // Tables
  { type: "forecast-table", label: "Forecast Table", description: "Daily projected in/out/net/balance", icon: Table2, category: "tables", timeframes: ["14D", "13W"] },
  { type: "reconciliation-table", label: "Reconciliation Table", description: "Projected vs actual variance analysis", icon: Table2, category: "tables", timeframes: ["7D", "14D", "30D"] },
  { type: "regional-matrix", label: "Regional Matrix", description: "Side-by-side regional flow comparison", icon: Globe, category: "tables", timeframes: ["14D", "30D"] },
  { type: "critical-obligations", label: "Critical Obligations", description: "Upcoming payroll & benefits breakdown", icon: Users, category: "tables", timeframes: ["14D", "30D"] },
  { type: "disbursement-estimates", label: "Disbursement Estimates", description: "Recurring estimates with amounts & periods", icon: LayoutGrid, category: "tables", timeframes: ["All"] },
  { type: "cash-calendar", label: "Cash Calendar", description: "Monthly calendar with disbursement items", icon: Calendar, category: "tables", timeframes: ["Month"] },
  // Summaries
  { type: "liquidity-summary", label: "Liquidity Summary Cards", description: "Current liquidity, 14-day net flow, next payroll", icon: Shield, category: "summaries", timeframes: ["14D"] },
  { type: "variance-risk", label: "Variance & Risk Analysis", description: "Risk exposure badges and high-risk indicators", icon: Shield, category: "summaries", timeframes: ["14D", "30D"] },
  { type: "context-analysis", label: "Context Analysis", description: "Plain-English narrative summarizing the data", icon: MessageSquare, category: "summaries", timeframes: ["14D", "30D"] },
];

const CATEGORY_LABELS: Record<string, string> = {
  layout: "Layout",
  charts: "Charts",
  tables: "Tables",
  summaries: "Summaries",
};

const BANK_HOLIDAYS_2026 = [
  "2026-01-01","2026-01-19","2026-02-16","2026-05-25","2026-06-19",
  "2026-07-03","2026-09-07","2026-10-12","2026-11-11","2026-11-26","2026-12-25",
];
const isBusinessDay = (date: Date) => {
  if (isWeekend(date)) return false;
  return !BANK_HOLIDAYS_2026.includes(format(date, "yyyy-MM-dd"));
};
const filterBusinessDays = (data: DailyData[]) =>
  data.filter(d => isBusinessDay(parse(d.date, "M/d/yyyy", new Date())));

// ── Saved reports localStorage helpers ────────────────────────────
const STORAGE_KEY = "insight-db-saved-reports";

function loadSavedReports(): SavedReport[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function persistSavedReports(reports: SavedReport[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
}

// ── Props ─────────────────────────────────────────────────────────
interface Props {
  regions: Entity[];
  allData: Record<Entity, DailyData[]> | null;
  currency?: string;
  dateFormat?: string;
  companyLogo?: string | null;
  currentUserName?: string;
  estimates?: Record<string, EstimateCategory[]>;
  onClose: () => void;
  readOnly?: boolean;
}

export default function ReportBuilder({
  regions,
  allData,
  currency = "USD",
  dateFormat = "MM/DD/YYYY",
  companyLogo = null,
  currentUserName = "",
  estimates = {},
  onClose,
  readOnly = false,
}: Props) {
  // ── State ─────────────────────────────────────────────────────
  const [blocks, setBlocks] = useState<ReportBlock[]>([]);
  const [reportName, setReportName] = useState("Custom Report");
  const [createdBy, setCreatedBy] = useState(currentUserName);
  const [savedReports, setSavedReports] = useState<SavedReport[]>(loadSavedReports);
  const [showSavedPanel, setShowSavedPanel] = useState(false);
  const [addRegion, setAddRegion] = useState<string>(regions[0] || "Executive");
  const [addTimeframe, setAddTimeframe] = useState<string>("14D");
  const [catalogSearch, setCatalogSearch] = useState("");
  const printRef = useRef<HTMLDivElement>(null);

  const formatCurrency = (val: number, compact = false) => centralizedFormatCurrency(val, currency, compact);
  const formatDate = (date: string | Date) => centralizedFormatDate(date, dateFormat);

  // ── Add a block ───────────────────────────────────────────────
  const handleAddBlock = useCallback((moduleDef: ModuleDef) => {
    const tf = moduleDef.timeframes.includes(addTimeframe) ? addTimeframe : moduleDef.timeframes[0];
    const block: ReportBlock = {
      id: Math.random().toString(36).substr(2, 9),
      moduleType: moduleDef.type,
      label: moduleDef.label,
      timeframe: tf,
      region: addRegion,
    };
    setBlocks(prev => [...prev, block]);
  }, [addRegion, addTimeframe]);

  const handleRemoveBlock = useCallback((id: string) => {
    setBlocks(prev => prev.filter(b => b.id !== id));
  }, []);

  // ── Save / Load / Delete ──────────────────────────────────────
  const handleSave = useCallback(() => {
    if (blocks.length === 0) return;
    const report: SavedReport = {
      id: Math.random().toString(36).substr(2, 9),
      name: reportName,
      createdBy,
      createdAt: new Date().toISOString(),
      blocks: [...blocks],
    };
    const updated = [report, ...savedReports];
    setSavedReports(updated);
    persistSavedReports(updated);
  }, [blocks, reportName, createdBy, savedReports]);

  const handleLoad = useCallback((report: SavedReport) => {
    setBlocks([...report.blocks]);
    setReportName(report.name);
    setCreatedBy(report.createdBy);
    setShowSavedPanel(false);
  }, []);

  const handleDeleteSaved = useCallback((id: string) => {
    const updated = savedReports.filter(r => r.id !== id);
    setSavedReports(updated);
    persistSavedReports(updated);
  }, [savedReports]);

  // ── Print ─────────────────────────────────────────────────────
  const handlePrint = useCallback(() => {
    const element = printRef.current;
    if (!element) return;

    const printWrapper = document.createElement("div");
    printWrapper.className = "print-report-wrapper";
    const cloned = element.cloneNode(true) as HTMLElement;
    cloned.removeAttribute("id");

    // Force print-friendly styles
    const svgTags = new Set(["svg","path","line","rect","circle","g","defs","lineargradient","stop","clippath","text","tspan","use"]);
    cloned.querySelectorAll("*").forEach(el => {
      const htmlEl = el as HTMLElement;
      if (htmlEl.hasAttribute("data-print-clip")) return;
      if (svgTags.has(htmlEl.tagName.toLowerCase())) return;
      if (htmlEl.closest("[data-print-chart]")) return;
      htmlEl.style.overflow = "visible";
      htmlEl.style.maxHeight = "none";
      htmlEl.style.height = "auto";
      htmlEl.style.minHeight = "0";
      htmlEl.style.boxShadow = "none";
    });
    cloned.style.overflow = "visible";
    cloned.style.maxHeight = "none";
    cloned.style.height = "auto";
    cloned.style.backgroundColor = "white";
    cloned.style.padding = "1.5cm";
    cloned.style.width = "100%";
    cloned.style.boxShadow = "none";
    cloned.style.border = "none";
    cloned.style.borderRadius = "0";

    // Page break rules
    cloned.querySelectorAll("*").forEach(el => {
      const s = (el as HTMLElement).style;
      s.pageBreakBefore = "";
      s.pageBreakAfter = "";
      s.breakBefore = "";
      s.breakAfter = "";
      s.pageBreakInside = "";
      s.breakInside = "";
    });
    cloned.querySelectorAll(".report-block-container").forEach(el => {
      const s = (el as HTMLElement).style;
      s.breakInside = "avoid";
      s.pageBreakInside = "avoid";
      s.marginBottom = "1cm";
    });
    // Cover page gets a page break after it so content starts on a new page
    cloned.querySelectorAll("[data-cover-page]").forEach(el => {
      const s = (el as HTMLElement).style;
      s.breakAfter = "page";
      s.pageBreakAfter = "always";
      s.minHeight = "90vh";
    });
    cloned.querySelectorAll("table").forEach(el => {
      (el as HTMLElement).style.breakInside = "auto";
      (el as HTMLElement).style.pageBreakInside = "auto";
    });

    printWrapper.appendChild(cloned);
    document.body.appendChild(printWrapper);
    window.print();
    setTimeout(() => document.body.removeChild(printWrapper), 1000);
  }, []);

  // ── Data helpers for rendering modules ────────────────────────
  const getDataSlice = useCallback((region: string, timeframe: string): DailyData[] => {
    if (!allData || !allData[region]) return [];
    const bd = filterBusinessDays(allData[region]);
    switch (timeframe) {
      case "7D": return bd.slice(0, 7);
      case "14D": return bd.slice(0, 14);
      case "30D": return bd.slice(0, 30);
      case "13W": return bd.slice(0, 65);
      default: return bd;
    }
  }, [allData]);

  const entityRegions = useMemo(() => regions.filter(r => r !== "Executive"), [regions]);

  // ── Filtered catalog ──────────────────────────────────────────
  const filteredCatalog = useMemo(() => {
    if (!catalogSearch.trim()) return MODULE_CATALOG;
    const q = catalogSearch.toLowerCase();
    return MODULE_CATALOG.filter(m =>
      m.label.toLowerCase().includes(q) || m.description.toLowerCase().includes(q)
    );
  }, [catalogSearch]);

  // ── Render a single module block for print/preview ────────────
  const renderModule = useCallback((block: ReportBlock) => {
    const dataSlice = getDataSlice(block.region, block.timeframe);
    if (!allData) return <div className="p-8 text-center text-slate-400">No data available</div>;
    const isExec = block.region === "Executive";

    switch (block.moduleType) {
      case "cover-page": {
        return (
          <div className="flex flex-col items-center justify-center py-16 text-center" style={{ minHeight: 400 }}>
            {companyLogo ? (
              <img src={companyLogo} alt="Logo" className="w-24 h-24 object-contain mb-6" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-16 h-16 bg-amber-500 rounded-2xl flex items-center justify-center mb-6">
                <BarChart3 className="w-8 h-8 text-white" />
              </div>
            )}
            <h1 className="text-4xl font-black text-slate-900 mb-2">{reportName}</h1>
            <p className="text-sm text-slate-400 mb-10 tracking-widest uppercase">Insight Treasury</p>
            <div className="w-16 h-px bg-slate-300 mb-10" />
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Prepared By</p>
              <p className="text-lg font-bold text-slate-700">{createdBy}</p>
            </div>
            <div className="mt-4 space-y-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Date</p>
              <p className="text-lg font-bold text-slate-700">{formatDate(new Date())}</p>
            </div>
            {block.region !== "Executive" && block.region !== "N/A" && (
              <div className="mt-4 space-y-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Region</p>
                <p className="text-lg font-bold text-slate-700">{block.region}</p>
              </div>
            )}
          </div>
        );
      }

      case "liquidity-summary": {
        const stats = calculateStats(dataSlice);
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Total Liquidity</p>
                <p className="text-xl font-black text-slate-900">{formatCurrency(stats.currentLiquidity)}</p>
              </div>
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">14-Day Net Flow</p>
                <p className={clsx("text-xl font-black", stats.projected14DayNet >= 0 ? "text-emerald-600" : "text-rose-600")}>
                  {formatCurrency(stats.projected14DayNet)}
                </p>
              </div>
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Next Payroll</p>
                <p className="text-xl font-black text-slate-900">{formatCurrency(stats.nextPayrollAmount)}</p>
                <p className="text-[10px] text-slate-400 mt-1">{stats.nextPayrollDate || "N/A"}</p>
              </div>
            </div>
            {isExec && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-1.5 text-[10px] font-bold text-slate-400 uppercase">Region</th>
                      <th className="text-right py-1.5 text-[10px] font-bold text-slate-400 uppercase">Liquidity</th>
                      <th className="text-right py-1.5 text-[10px] font-bold text-slate-400 uppercase">14D Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entityRegions.map(r => {
                      const rd = getDataSlice(r, block.timeframe);
                      const rStats = calculateStats(rd);
                      return (
                        <tr key={r} className="border-b border-slate-50">
                          <td className="py-1 font-bold text-slate-700">{r}</td>
                          <td className="py-1 text-right font-mono text-slate-900">{formatCurrency(rStats.currentLiquidity)}</td>
                          <td className={clsx("py-1 text-right font-mono font-bold", rStats.projected14DayNet >= 0 ? "text-emerald-700" : "text-rose-700")}>
                            {formatCurrency(rStats.projected14DayNet)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      }

      case "cash-flow-chart": {
        // Render a simplified chart representation for print
        const maxVal = Math.max(...dataSlice.map(d => Math.max(d.cashIn, d.cashOut, Math.abs(d.endingBalance))), 1);
        return (
          <div data-print-chart>
            <div className="flex items-center gap-4 mb-4">
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-emerald-500" /><span className="text-[10px] font-bold text-slate-500">INFLOW</span></div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-rose-500" /><span className="text-[10px] font-bold text-slate-500">OUTFLOW</span></div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-blue-500" /><span className="text-[10px] font-bold text-slate-500">BALANCE</span></div>
            </div>
            <div className="flex items-end gap-[2px] h-48">
              {dataSlice.map((d, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-[1px] justify-end h-full">
                  <div className="w-full bg-emerald-500 rounded-t-sm" style={{ height: `${(d.cashIn / maxVal) * 100}%`, minHeight: d.cashIn > 0 ? 2 : 0 }} />
                  <div className="w-full bg-rose-500 rounded-t-sm" style={{ height: `${(d.cashOut / maxVal) * 100}%`, minHeight: d.cashOut > 0 ? 2 : 0 }} />
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-2">
              <span className="text-[9px] text-slate-400">{dataSlice[0]?.date}</span>
              <span className="text-[9px] text-slate-400">{dataSlice[dataSlice.length - 1]?.date}</span>
            </div>
          </div>
        );
      }

      case "liquidity-trend": {
        // SVG sparkline
        const points = dataSlice.map(d => d.endingBalance);
        const min = Math.min(...points);
        const max = Math.max(...points);
        const range = max - min || 1;
        const w = 600, h = 120;
        const pathD = points.map((p, i) => {
          const x = (i / (points.length - 1)) * w;
          const y = h - ((p - min) / range) * (h - 20) - 10;
          return `${i === 0 ? "M" : "L"}${x},${y}`;
        }).join(" ");
        return (
          <div data-print-chart>
            <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-32">
              <path d={pathD} fill="none" stroke="#10b981" strokeWidth="2" />
            </svg>
            <div className="flex justify-between mt-1">
              <span className="text-[9px] text-slate-400">{dataSlice[0]?.date}</span>
              <span className="text-[9px] text-slate-400">{dataSlice[dataSlice.length - 1]?.date}</span>
            </div>
          </div>
        );
      }

      case "forecast-table": {
        // For Executive: find top regional contributor per day
        const getTopRegion = (date: string): string | null => {
          if (!isExec) return null;
          let top = { region: "", out: 0 };
          entityRegions.forEach(r => {
            const rd = getDataSlice(r, block.timeframe);
            const match = rd.find(d2 => d2.date === date);
            if (match && match.cashOut > top.out) top = { region: r, out: match.cashOut };
          });
          return top.region || null;
        };
        return (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b-2 border-slate-900">
                  <th className="text-left py-2 font-black text-slate-900 uppercase tracking-wider text-[10px]">Date</th>
                  <th className="text-right py-2 font-black text-slate-900 uppercase tracking-wider text-[10px]">Projected In</th>
                  <th className="text-right py-2 font-black text-slate-900 uppercase tracking-wider text-[10px]">Projected Out</th>
                  <th className="text-right py-2 font-black text-slate-900 uppercase tracking-wider text-[10px]">Net Flow</th>
                  <th className="text-right py-2 font-black text-slate-900 uppercase tracking-wider text-[10px]">End Balance</th>
                  {isExec && <th className="text-right py-2 font-black text-slate-900 uppercase tracking-wider text-[10px]">Top Outflow</th>}
                </tr>
              </thead>
              <tbody>
                {dataSlice.map((d, i) => {
                  const topRegion = getTopRegion(d.date);
                  return (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="py-1.5 font-mono text-slate-700">{formatDate(d.date)}</td>
                      <td className="py-1.5 text-right font-mono text-emerald-700">{formatCurrency(d.cashIn)}</td>
                      <td className="py-1.5 text-right font-mono text-rose-700">{formatCurrency(d.cashOut)}</td>
                      <td className={clsx("py-1.5 text-right font-mono font-bold", d.netFlow >= 0 ? "text-emerald-700" : "text-rose-700")}>
                        {formatCurrency(d.netFlow)}
                      </td>
                      <td className="py-1.5 text-right font-mono font-bold text-slate-900">{formatCurrency(d.endingBalance)}</td>
                      {isExec && <td className="py-1.5 text-right text-[10px] font-bold text-slate-500">{topRegion || "—"}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      }

      case "reconciliation-table": {
        return (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b-2 border-slate-900">
                  <th className="text-left py-2 font-black text-slate-900 uppercase tracking-wider text-[10px]">Date</th>
                  <th className="text-right py-2 font-black text-slate-900 uppercase tracking-wider text-[10px]">Proj. In</th>
                  <th className="text-right py-2 font-black text-slate-900 uppercase tracking-wider text-[10px]">Actual In</th>
                  <th className="text-right py-2 font-black text-slate-900 uppercase tracking-wider text-[10px]">Proj. Out</th>
                  <th className="text-right py-2 font-black text-slate-900 uppercase tracking-wider text-[10px]">Actual Out</th>
                  <th className="text-right py-2 font-black text-slate-900 uppercase tracking-wider text-[10px]">Variance</th>
                </tr>
              </thead>
              <tbody>
                {dataSlice.map((d, i) => {
                  const variance = ((d.actualCashIn || 0) - d.cashIn) - ((d.actualCashOut || 0) - d.cashOut);
                  return (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="py-1.5 font-mono text-slate-700">{formatDate(d.date)}</td>
                      <td className="py-1.5 text-right font-mono text-slate-600">{formatCurrency(d.cashIn)}</td>
                      <td className="py-1.5 text-right font-mono text-emerald-700">{formatCurrency(d.actualCashIn || 0)}</td>
                      <td className="py-1.5 text-right font-mono text-slate-600">{formatCurrency(d.cashOut)}</td>
                      <td className="py-1.5 text-right font-mono text-rose-700">{formatCurrency(d.actualCashOut || 0)}</td>
                      <td className={clsx("py-1.5 text-right font-mono font-bold", variance >= 0 ? "text-emerald-700" : "text-rose-700")}>
                        {formatCurrency(variance)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      }

      case "variance-chart": {
        // Simple bar chart showing variance per day
        const variances = dataSlice.map(d => ((d.actualCashIn || 0) - d.cashIn) - ((d.actualCashOut || 0) - d.cashOut));
        const maxVar = Math.max(...variances.map(Math.abs), 1);
        return (
          <div data-print-chart>
            <div className="flex items-center justify-center gap-[2px] h-40">
              {variances.map((v, i) => (
                <div key={i} className="flex-1 flex flex-col items-center justify-center h-full relative">
                  <div className="absolute top-1/2 w-full border-t border-slate-200" />
                  <div
                    className={clsx("w-full rounded-sm relative", v >= 0 ? "bg-emerald-500" : "bg-rose-500")}
                    style={{
                      height: `${(Math.abs(v) / maxVar) * 45}%`,
                      alignSelf: v >= 0 ? "flex-end" : "flex-start",
                      marginTop: v >= 0 ? "auto" : "50%",
                      marginBottom: v < 0 ? "auto" : "50%",
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-2">
              <span className="text-[9px] text-slate-400">{dataSlice[0]?.date}</span>
              <span className="text-[9px] text-slate-400">{dataSlice[dataSlice.length - 1]?.date}</span>
            </div>
          </div>
        );
      }

      case "regional-matrix": {
        return (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b-2 border-slate-900">
                  <th className="text-left py-2 font-black text-slate-900 uppercase tracking-wider text-[10px]">Region</th>
                  <th className="text-right py-2 font-black text-slate-900 uppercase tracking-wider text-[10px]">Total In</th>
                  <th className="text-right py-2 font-black text-slate-900 uppercase tracking-wider text-[10px]">Total Out</th>
                  <th className="text-right py-2 font-black text-slate-900 uppercase tracking-wider text-[10px]">Net Flow</th>
                  <th className="text-right py-2 font-black text-slate-900 uppercase tracking-wider text-[10px]">End Balance</th>
                </tr>
              </thead>
              <tbody>
                {entityRegions.map((r) => {
                  const rd = getDataSlice(r, block.timeframe);
                  const totalIn = rd.reduce((s, d) => s + d.cashIn, 0);
                  const totalOut = rd.reduce((s, d) => s + d.cashOut, 0);
                  const endBal = rd[rd.length - 1]?.endingBalance || 0;
                  return (
                    <tr key={r} className="border-b border-slate-100">
                      <td className="py-1.5 font-bold text-slate-900">{r}</td>
                      <td className="py-1.5 text-right font-mono text-emerald-700">{formatCurrency(totalIn)}</td>
                      <td className="py-1.5 text-right font-mono text-rose-700">{formatCurrency(totalOut)}</td>
                      <td className={clsx("py-1.5 text-right font-mono font-bold", totalIn - totalOut >= 0 ? "text-emerald-700" : "text-rose-700")}>
                        {formatCurrency(totalIn - totalOut)}
                      </td>
                      <td className="py-1.5 text-right font-mono font-bold text-slate-900">{formatCurrency(endBal)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      }

      case "critical-obligations": {
        const payrollDays = dataSlice.filter(d => d.payroll > 0);
        if (payrollDays.length === 0) return <p className="text-sm text-slate-400 italic">No payroll obligations in this timeframe.</p>;
        return (
          <div className="space-y-3">
            {payrollDays.map((d, i) => {
              // For Executive: find which regions contribute to this date's payroll
              const regionalBreakdown: { region: string; payroll: number; benefits: number; funded: boolean }[] = [];
              if (isExec) {
                entityRegions.forEach(r => {
                  const rd = getDataSlice(r, block.timeframe);
                  const match = rd.find(rd2 => rd2.date === d.date);
                  if (match && match.payroll > 0) {
                    regionalBreakdown.push({
                      region: r,
                      payroll: match.payroll,
                      benefits: match.benefits,
                      funded: match.endingBalance >= 0,
                    });
                  }
                });
              }
              return (
                <div key={i} className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-slate-900">{formatDate(d.date)}</p>
                      <p className="text-[10px] text-slate-500">Payroll + Benefits</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black text-slate-900">{formatCurrency(d.payroll + d.benefits)}</p>
                      <p className={clsx("text-[10px] font-bold", d.endingBalance >= 0 ? "text-emerald-600" : "text-rose-600")}>
                        {d.endingBalance >= 0 ? "Funded" : "Unfunded"}
                      </p>
                    </div>
                  </div>
                  {isExec && regionalBreakdown.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-200 space-y-1">
                      {regionalBreakdown.map((rb) => (
                        <div key={rb.region} className="flex items-center justify-between text-[10px]">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-600">{rb.region}</span>
                            <span className={clsx("px-1.5 py-0.5 rounded text-[8px] font-bold", rb.funded ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700")}>
                              {rb.funded ? "Funded" : "Unfunded"}
                            </span>
                          </div>
                          <span className="font-mono font-bold text-slate-700">{formatCurrency(rb.payroll + rb.benefits)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      }

      case "disbursement-estimates": {
        // For Executive: show all regions' estimates grouped
        const regionsToShow = isExec ? entityRegions : [block.region];
        const allCats = regionsToShow.flatMap(r => (estimates[r] || []).map(c => ({ ...c, _region: r })));
        if (allCats.length === 0) return <p className="text-sm text-slate-400 italic">No estimates configured{isExec ? "" : ` for ${block.region}`}.</p>;
        return (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b-2 border-slate-900">
                  {isExec && <th className="text-left py-2 font-black text-slate-900 uppercase tracking-wider text-[10px]">Region</th>}
                  <th className="text-left py-2 font-black text-slate-900 uppercase tracking-wider text-[10px]">Label</th>
                  <th className="text-right py-2 font-black text-slate-900 uppercase tracking-wider text-[10px]">Base Amount</th>
                  <th className="text-center py-2 font-black text-slate-900 uppercase tracking-wider text-[10px]">Period</th>
                  <th className="text-right py-2 font-black text-slate-900 uppercase tracking-wider text-[10px]">Adjustment</th>
                </tr>
              </thead>
              <tbody>
                {allCats.map((c) => (
                  <tr key={`${c._region}-${c.id}`} className="border-b border-slate-100">
                    {isExec && <td className="py-1.5 font-bold text-blue-700">{c._region}</td>}
                    <td className="py-1.5 font-bold text-slate-900">{c.label}</td>
                    <td className="py-1.5 text-right font-mono text-slate-700">{formatCurrency(c.baseAmount)}</td>
                    <td className="py-1.5 text-center text-slate-500">{c.period}</td>
                    <td className="py-1.5 text-right font-mono text-slate-500">{(c.adjustment * 100).toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }

      case "variance-risk": {
        const stats = calculateStats(dataSlice);
        const minBal = Math.min(...dataSlice.map(d => d.endingBalance));
        const hasNegative = minBal < 0;
        const largeOutflows = dataSlice.filter(d => d.cashOut > stats.currentLiquidity * 0.2);
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className={clsx(
                "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider",
                hasNegative ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"
              )}>
                {hasNegative ? "High Risk" : "Low Risk"}
              </span>
              <span className="text-xs text-slate-500">Min balance: {formatCurrency(minBal)}</span>
            </div>
            {isExec && (
              <div className="flex flex-wrap gap-2">
                {entityRegions.map(r => {
                  const rd = getDataSlice(r, block.timeframe);
                  const rMin = Math.min(...rd.map(d => d.endingBalance));
                  const rNeg = rMin < 0;
                  return (
                    <div key={r} className={clsx(
                      "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold border",
                      rNeg ? "bg-rose-50 border-rose-200 text-rose-700" : "bg-emerald-50 border-emerald-200 text-emerald-700"
                    )}>
                      <span>{r}</span>
                      <span className="font-mono">{formatCurrency(rMin)}</span>
                    </div>
                  );
                })}
              </div>
            )}
            {largeOutflows.length > 0 && (
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
                <p className="text-[10px] font-bold text-amber-700 uppercase tracking-widest mb-2">Large Outflows ({largeOutflows.length})</p>
                {largeOutflows.slice(0, 5).map((d, i) => (
                  <div key={i} className="flex justify-between text-xs text-amber-800">
                    <span>{formatDate(d.date)}</span>
                    <span className="font-mono font-bold">{formatCurrency(d.cashOut)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      }

      case "cash-calendar": {
        // Simplified calendar for print — show days with activity
        // For Executive: merge all regions' disbursements with region labels
        let activeDays: { date: string; items: { label: string; amount: number; region?: string }[] }[] = [];
        if (isExec) {
          const dateMap: Record<string, { label: string; amount: number; region: string }[]> = {};
          entityRegions.forEach(r => {
            const rd = getDataSlice(r, block.timeframe);
            rd.forEach(d => {
              d.disbursements.forEach(item => {
                if (!dateMap[d.date]) dateMap[d.date] = [];
                dateMap[d.date].push({ label: item.label, amount: item.amount, region: r });
              });
            });
          });
          activeDays = Object.entries(dateMap)
            .filter(([, items]) => items.length > 0)
            .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
            .slice(0, 20)
            .map(([date, items]) => ({ date, items }));
        } else {
          activeDays = dataSlice
            .filter(d => d.disbursements.length > 0)
            .slice(0, 20)
            .map(d => ({ date: d.date, items: d.disbursements.map(item => ({ label: item.label, amount: item.amount })) }));
        }
        if (activeDays.length === 0) return <p className="text-sm text-slate-400 italic">No disbursements scheduled.</p>;
        return (
          <div className="space-y-2">
            {activeDays.map((d, i) => (
              <div key={i} className="flex items-start gap-4 p-2 border-b border-slate-100">
                <div className="text-xs font-mono font-bold text-slate-900 w-20 shrink-0">{formatDate(d.date)}</div>
                <div className="flex-1 space-y-1">
                  {d.items.map((item, j) => (
                    <div key={j} className="flex justify-between text-xs gap-2">
                      <span className="text-slate-700 truncate">
                        {item.region && <span className="text-blue-600 font-bold mr-1">{item.region}:</span>}
                        {item.label}
                      </span>
                      <span className="font-mono font-bold text-slate-900 shrink-0">{formatCurrency(item.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      }

      case "context-analysis": {
        const ctxStats = calculateStats(dataSlice);
        const bullets = generateNarrative(dataSlice, ctxStats, block.region, currency, allData || undefined, regions);
        return (
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
            <ul className="space-y-1.5">
              {bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-slate-700 leading-relaxed">
                  <span className="mt-1.5 w-1 h-1 rounded-full bg-emerald-500 shrink-0" />
                  {b}
                </li>
              ))}
            </ul>
          </div>
        );
      }

      default:
        return <div className="p-8 text-center text-slate-400">Unknown module type</div>;
    }
  }, [allData, getDataSlice, formatCurrency, formatDate, entityRegions, estimates, currency, regions]);

  // ── UI ────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all"
          >
            <X className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Build Report</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm">Select modules, configure timeframes, and arrange your report.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSavedPanel(!showSavedPanel)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
          >
            <FolderOpen className="w-4 h-4" />
            Saved ({savedReports.length})
          </button>
          <button
            onClick={handleSave}
            disabled={blocks.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" />
            Save
          </button>
          <button
            onClick={handlePrint}
            disabled={blocks.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 dark:bg-slate-700 text-white rounded-xl text-sm font-bold hover:bg-slate-800 dark:hover:bg-slate-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Printer className="w-4 h-4" />
            Print
          </button>
        </div>
      </div>

      {/* Report metadata */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1 block">Report Name</label>
            <input
              value={reportName}
              onChange={e => setReportName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1 block">Created By</label>
            <input
              value={createdBy}
              onChange={e => setCreatedBy(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1 block">Date</label>
            <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-bold text-slate-900 dark:text-white">
              {formatDate(new Date())}
            </div>
          </div>
        </div>
      </div>

      {/* Saved reports panel */}
      <AnimatePresence>
        {showSavedPanel && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
              <h3 className="font-bold text-slate-900 dark:text-white mb-4">Saved Reports</h3>
              {savedReports.length === 0 ? (
                <p className="text-sm text-slate-400 italic">No saved reports yet.</p>
              ) : (
                <div className="space-y-2">
                  {savedReports.map((sr) => (
                    <div key={sr.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{sr.name}</p>
                          <p className="text-[10px] text-slate-400">
                            {sr.createdBy} &middot; {format(new Date(sr.createdAt), "MMM d, yyyy")} &middot; {sr.blocks.length} modules
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleLoad(sr)}
                          className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition-all"
                        >
                          Load
                        </button>
                        <button
                          onClick={() => handleDeleteSaved(sr.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Module catalog */}
        <div className="lg:col-span-1 space-y-4">
          {/* Region + Timeframe selectors */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Configure Before Adding</p>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Region</label>
              <select
                value={addRegion}
                onChange={e => setAddRegion(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
              >
                {regions.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Timeframe</label>
              <div className="flex flex-wrap gap-1.5">
                {["7D", "14D", "30D", "13W", "Month", "All"].map(tf => (
                  <button
                    key={tf}
                    onClick={() => setAddTimeframe(tf)}
                    className={clsx(
                      "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                      addTimeframe === tf
                        ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                    )}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <input
              value={catalogSearch}
              onChange={e => setCatalogSearch(e.target.value)}
              placeholder="Search modules..."
              className="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>

          {/* Module list */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            {(["layout", "charts", "tables", "summaries"] as const).map(cat => {
              const items = filteredCatalog.filter(m => m.category === cat);
              if (items.length === 0) return null;
              return (
                <div key={cat}>
                  <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                    <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">{CATEGORY_LABELS[cat]}</p>
                  </div>
                  {items.map(mod => {
                    const tfMatch = mod.timeframes.includes(addTimeframe);
                    return (
                      <button
                        key={mod.type}
                        onClick={() => handleAddBlock(mod)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-emerald-50 dark:hover:bg-emerald-900/10 transition-colors border-b border-slate-50 dark:border-slate-800/50 group"
                      >
                        <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 group-hover:bg-emerald-100 dark:group-hover:bg-emerald-900/30 group-hover:text-emerald-600 transition-colors">
                          <mod.icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{mod.label}</p>
                          <p className="text-[10px] text-slate-400 truncate">{mod.description}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {!tfMatch && (
                            <span className="text-[9px] text-amber-500 font-bold">→{mod.timeframes[0]}</span>
                          )}
                          <Plus className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-emerald-500 transition-colors" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Added blocks (drag reorder) + preview */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-900 dark:text-white">
                Report Layout
                {blocks.length > 0 && <span className="text-slate-400 font-normal ml-2">({blocks.length} modules)</span>}
              </h3>
              {blocks.length > 0 && (
                <button
                  onClick={() => setBlocks([])}
                  className="text-xs font-bold text-rose-500 hover:text-rose-600 transition-colors"
                >
                  Clear All
                </button>
              )}
            </div>

            {blocks.length === 0 ? (
              <div className="py-16 flex flex-col items-center text-center space-y-3">
                <div className="w-14 h-14 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-300 dark:text-slate-600">
                  <Plus className="w-7 h-7" />
                </div>
                <div>
                  <p className="font-bold text-slate-900 dark:text-white">No modules added</p>
                  <p className="text-sm text-slate-400 mt-1">Select modules from the catalog to start building your report.</p>
                </div>
              </div>
            ) : (
              <Reorder.Group axis="y" values={blocks} onReorder={setBlocks} className="space-y-2">
                {blocks.map(block => (
                  <Reorder.Item key={block.id} value={block}>
                    <div className="group flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 hover:border-emerald-200 dark:hover:border-emerald-800 transition-colors cursor-grab active:cursor-grabbing">
                      <div className="pt-1 text-slate-300 dark:text-slate-600 group-hover:text-slate-400 cursor-grab">
                        <GripVertical className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-slate-900 dark:text-white">{block.label}</p>
                          <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded text-[10px] font-bold">{block.region}</span>
                          <span className="px-2 py-0.5 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded text-[10px] font-bold">{block.timeframe}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveBlock(block.id)}
                        className="p-1 text-slate-300 dark:text-slate-600 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-all shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </Reorder.Item>
                ))}
              </Reorder.Group>
            )}
          </div>

          {/* Live preview */}
          {blocks.length > 0 && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Preview</p>
                <button
                  onClick={handlePrint}
                  className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print
                </button>
              </div>
              <div className="p-5 bg-white rounded-b-2xl" ref={printRef}>
                {/* Print header — hidden when a cover page module is present */}
                {!blocks.some(b => b.moduleType === "cover-page") && (
                  <div className="mb-8 pb-6 border-b-2 border-slate-900">
                    <div className="flex items-start justify-between">
                      <div>
                        {companyLogo ? (
                          <img src={companyLogo} alt="Logo" className="w-16 h-16 object-contain mb-3" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-10 h-10 bg-amber-500 rounded-lg flex items-center justify-center mb-3">
                            <BarChart3 className="w-5 h-5 text-white" />
                          </div>
                        )}
                        <h1 className="text-2xl font-black text-slate-900">{reportName}</h1>
                        <p className="text-sm text-slate-500 mt-1">Insight Treasury</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Created By</p>
                        <p className="text-sm font-bold text-slate-900">{createdBy}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">Date</p>
                        <p className="text-sm font-bold text-slate-900">{formatDate(new Date())}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Render blocks in order */}
                {blocks.map((block, idx) => (
                  block.moduleType === "cover-page" ? (
                    <div key={block.id} className="report-block-container mb-8 border border-slate-200 rounded-xl overflow-hidden" data-cover-page>
                      {renderModule(block)}
                    </div>
                  ) : (
                    <div key={block.id} className="report-block-container mb-8">
                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-[10px] font-black text-slate-400">{String(idx + 1).padStart(2, "0")}</span>
                        <h2 className="text-lg font-black text-slate-900">{block.label}</h2>
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-[9px] font-bold">{block.region}</span>
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[9px] font-bold">{block.timeframe}</span>
                      </div>
                      <div className="border border-slate-100 rounded-xl p-4">
                        {renderModule(block)}
                      </div>
                    </div>
                  )
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
