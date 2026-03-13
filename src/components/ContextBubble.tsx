import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { MessageSquare, Send, ChevronDown, Globe, MapPin, Loader2, AlertCircle } from "lucide-react";
import { clsx } from "clsx";
import { format, parse, isWeekend } from "date-fns";
import { DailyData, DashboardStats, Entity, EXECUTIVE_ENTITY } from "../types";
import { formatCurrency as centralizedFormatCurrency } from "../utils/formatters";
import { calculateStats } from "../data/parser";
import { GoogleGenerativeAI } from "@google/generative-ai";

// ── Helpers ──────────────────────────────────────────────────────
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

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// ── Data-driven narrative generator ──────────────────────────────
function generateNarrative(
  data: DailyData[],
  stats: DashboardStats,
  entity: string,
  currency: string,
  allData?: Record<string, DailyData[]> | null,
  regions?: string[],
): string[] {
  const fmt = (v: number) => centralizedFormatCurrency(v, currency, true);
  const fmtFull = (v: number) => centralizedFormatCurrency(v, currency, false);
  const bd = filterBusinessDays(data);
  if (bd.length === 0) return ["No data available"];

  const currentBal = bd[0]?.endingBalance || 0;
  const net14 = bd.slice(0, 14).reduce((s, d) => s + d.netFlow, 0);
  const minBal14 = Math.min(...bd.slice(0, 14).map(d => d.endingBalance));
  const maxOutflow = bd.slice(0, 14).reduce((max, d) => d.cashOut > max.cashOut ? d : max, bd[0]);
  const negDay = bd.slice(0, 30).find(d => d.endingBalance < 0);
  const payrollDays = bd.slice(0, 14).filter(d => d.payroll > 0);
  const unfundedPayrolls = payrollDays.filter(d => d.endingBalance < d.payroll);
  const isExecutive = entity === EXECUTIVE_ENTITY;

  const bullets: string[] = [];

  // Liquidity
  bullets.push(`Liquidity: ${fmtFull(currentBal)}`);

  // Net flow
  bullets.push(`14D Net Flow: ${fmt(net14)} — ${net14 >= 0 ? "positive" : "outflows exceed inflows"}`);

  // Largest outflow
  if (maxOutflow.cashOut > 0) {
    bullets.push(`Peak outflow: ${fmt(maxOutflow.cashOut)} on ${maxOutflow.date}`);
  }

  // Payroll
  if (payrollDays.length > 0) {
    const totalPayroll = payrollDays.reduce((s, d) => s + d.payroll, 0);
    bullets.push(`Payroll: ${payrollDays.length}x totaling ${fmt(totalPayroll)}`);
    if (unfundedPayrolls.length > 0) {
      bullets.push(`${unfundedPayrolls.length} payroll date${unfundedPayrolls.length > 1 ? "s" : ""} may be underfunded`);
    } else {
      bullets.push("All payrolls funded");
    }
  }

  // Negative balance
  if (negDay) {
    bullets.push(`Negative balance projected ${negDay.date} (${fmtFull(negDay.endingBalance)})`);
  } else if (minBal14 > 0) {
    bullets.push(`Min balance (14D): ${fmt(minBal14)} — no deficit days`);
  }

  // Executive: regional highlights
  if (isExecutive && allData && regions && regions.length > 0) {
    const entityRegions = regions.filter(r => r !== EXECUTIVE_ENTITY);
    const regionSummaries = entityRegions.map(r => {
      const rd = filterBusinessDays(allData[r] || []);
      const bal = rd[0]?.endingBalance || 0;
      const net = rd.slice(0, 14).reduce((s, d) => s + d.netFlow, 0);
      return { region: r, bal, net };
    });
    const weakest = regionSummaries.reduce((w, r) => r.net < w.net ? r : w, regionSummaries[0]);
    const strongest = regionSummaries.reduce((s, r) => r.net > s.net ? r : s, regionSummaries[0]);
    if (weakest && strongest && weakest.region !== strongest.region) {
      bullets.push(`Strongest: ${strongest.region} (${fmt(strongest.net)})`);
      bullets.push(`Weakest: ${weakest.region} (${fmt(weakest.net)})`);
    }
  }

  return bullets;
}

// ── Build context string for Gemini ─────────────────────────────
function buildGeminiContext(
  data: DailyData[],
  stats: DashboardStats,
  entity: string,
  currency: string,
  allData?: Record<string, DailyData[]> | null,
  regions?: string[],
): string {
  const fmt = (v: number) => centralizedFormatCurrency(v, currency, false);
  const bd = filterBusinessDays(data);
  const next14 = bd.slice(0, 14);

  let ctx = `Treasury data for ${entity} (currency: ${currency}):\n`;
  ctx += `Current liquidity: ${fmt(bd[0]?.endingBalance || 0)}\n`;
  ctx += `14-day net flow: ${fmt(next14.reduce((s, d) => s + d.netFlow, 0))}\n`;
  ctx += `\nNext 14 business days:\n`;
  ctx += `Date | Cash In | Cash Out | Net Flow | End Balance | Payroll\n`;
  next14.forEach(d => {
    ctx += `${d.date} | ${fmt(d.cashIn)} | ${fmt(d.cashOut)} | ${fmt(d.netFlow)} | ${fmt(d.endingBalance)} | ${d.payroll > 0 ? fmt(d.payroll) : "-"}\n`;
  });

  // Disbursements detail
  const disbDays = next14.filter(d => d.disbursements.length > 0);
  if (disbDays.length > 0) {
    ctx += `\nScheduled disbursements:\n`;
    disbDays.forEach(d => {
      d.disbursements.forEach(item => {
        ctx += `${d.date}: ${item.label} - ${fmt(item.amount)} (${item.status || "Unknown"})\n`;
      });
    });
  }

  // Regional data for executive
  if (entity === EXECUTIVE_ENTITY && allData && regions) {
    const entityRegions = regions.filter(r => r !== EXECUTIVE_ENTITY);
    ctx += `\nRegional breakdown:\n`;
    entityRegions.forEach(r => {
      const rd = filterBusinessDays(allData[r] || []);
      const bal = rd[0]?.endingBalance || 0;
      const net = rd.slice(0, 14).reduce((s, d) => s + d.netFlow, 0);
      ctx += `${r}: Balance ${fmt(bal)}, 14D Net ${fmt(net)}\n`;
    });
  }

  return ctx;
}

// ── Props ────────────────────────────────────────────────────────
interface Props {
  currentEntity: Entity;
  currentData: DailyData[];
  stats: DashboardStats;
  allData?: Record<string, DailyData[]> | null;
  regions?: string[];
  currency?: string;
}

export default function ContextBubble({
  currentEntity,
  currentData,
  stats,
  allData,
  regions = [],
  currency = "USD",
}: Props) {
  const [viewMode, setViewMode] = useState<"consolidated" | "regional">("consolidated");
  const [selectedRegion, setSelectedRegion] = useState<string>(regions.filter(r => r !== EXECUTIVE_ENTITY)[0] || "");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const entityRegions = useMemo(() => regions.filter(r => r !== EXECUTIVE_ENTITY), [regions]);
  const isExecutive = currentEntity === EXECUTIVE_ENTITY;

  // Reset view when entity changes
  useEffect(() => {
    if (!isExecutive) {
      setViewMode("consolidated");
    }
    setChatMessages([]);
    setShowChat(false);
  }, [currentEntity, isExecutive]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Generate narrative based on view mode
  const narrative = useMemo(() => {
    if (viewMode === "regional" && selectedRegion && allData && allData[selectedRegion]) {
      const regionData = allData[selectedRegion];
      const regionStats = calculateStats(filterBusinessDays(regionData));
      return generateNarrative(regionData, regionStats, selectedRegion, currency, allData, regions);
    }
    return generateNarrative(currentData, stats, currentEntity, currency, allData, regions);
  }, [viewMode, selectedRegion, currentData, stats, currentEntity, currency, allData, regions]);

  // Gemini follow-up
  const handleAskFollowUp = useCallback(async () => {
    const question = chatInput.trim();
    if (!question || isLoading) return;

    const apiKey = (typeof process !== "undefined" && process.env?.GEMINI_API_KEY) || "";
    if (!apiKey) {
      setChatMessages(prev => [...prev,
        { role: "user", content: question },
        { role: "assistant", content: "Gemini API key not configured. Please add GEMINI_API_KEY to your environment." },
      ]);
      setChatInput("");
      return;
    }

    setChatMessages(prev => [...prev, { role: "user", content: question }]);
    setChatInput("");
    setIsLoading(true);

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

      // Build the data context
      const dataForContext = viewMode === "regional" && selectedRegion && allData?.[selectedRegion]
        ? allData[selectedRegion]
        : currentData;
      const entityForContext = viewMode === "regional" && selectedRegion ? selectedRegion : currentEntity;
      const statsForContext = viewMode === "regional" && selectedRegion && allData?.[selectedRegion]
        ? calculateStats(filterBusinessDays(allData[selectedRegion]))
        : stats;

      const systemContext = buildGeminiContext(dataForContext, statsForContext, entityForContext, currency, allData, regions);

      // Build chat history for multi-turn
      const chatHistory = chatMessages.map(m => ({
        role: m.role === "user" ? "user" as const : "model" as const,
        parts: [{ text: m.content }],
      }));

      const chat = model.startChat({
        history: [
          { role: "user", parts: [{ text: `You are a treasury analyst assistant. Here is the current treasury data:\n\n${systemContext}\n\nKey findings:\n${narrative.map(b => `- ${b}`).join("\n")}\n\nAnswer questions about this data concisely and specifically. Reference actual numbers and dates. Keep responses to 2-4 sentences unless more detail is requested.` }] },
          { role: "model", parts: [{ text: "I understand the treasury data. I'm ready to answer questions about the cash positions, flows, disbursements, and regional breakdowns. What would you like to know?" }] },
          ...chatHistory,
        ],
      });

      const result = await chat.sendMessage(question);
      const response = result.response.text();

      setChatMessages(prev => [...prev, { role: "assistant", content: response }]);
    } catch (err: any) {
      setChatMessages(prev => [...prev, { role: "assistant", content: `Error: ${err.message || "Failed to get response. Please try again."}` }]);
    } finally {
      setIsLoading(false);
    }
  }, [chatInput, isLoading, chatMessages, currentData, stats, currentEntity, currency, allData, regions, viewMode, selectedRegion, narrative]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAskFollowUp();
    }
  };

  return (
    <div className="bg-gradient-to-r from-slate-900 to-slate-800 dark:from-slate-800 dark:to-slate-900 rounded-2xl border border-slate-700 shadow-lg overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 flex items-center justify-between border-b border-slate-700/50">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
            <MessageSquare className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Context Analysis</h3>
            <p className="text-[10px] text-slate-400">
              {viewMode === "consolidated"
                ? (isExecutive ? "Consolidated view" : `${currentEntity} analysis`)
                : `${selectedRegion} analysis`}
            </p>
          </div>
        </div>

        {/* Toggle: consolidated vs regional (only for Executive) */}
        {isExecutive && entityRegions.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex bg-slate-700/50 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode("consolidated")}
                className={clsx(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold transition-all",
                  viewMode === "consolidated"
                    ? "bg-emerald-500/20 text-emerald-400"
                    : "text-slate-400 hover:text-slate-300"
                )}
              >
                <Globe className="w-3 h-3" />
                Consolidated
              </button>
              <button
                onClick={() => { setViewMode("regional"); if (!selectedRegion && entityRegions.length > 0) setSelectedRegion(entityRegions[0]); }}
                className={clsx(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold transition-all",
                  viewMode === "regional"
                    ? "bg-blue-500/20 text-blue-400"
                    : "text-slate-400 hover:text-slate-300"
                )}
              >
                <MapPin className="w-3 h-3" />
                Regional
              </button>
            </div>

            {/* Region dropdown */}
            <AnimatePresence>
              {viewMode === "regional" && (
                <motion.select
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  exit={{ opacity: 0, width: 0 }}
                  value={selectedRegion}
                  onChange={e => setSelectedRegion(e.target.value)}
                  className="bg-slate-700 border border-slate-600 text-white text-xs font-bold rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-blue-500 outline-none"
                >
                  {entityRegions.map(r => <option key={r} value={r}>{r}</option>)}
                </motion.select>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Narrative bullets */}
      <div className="px-5 py-3">
        <ul className="space-y-1.5">
          {narrative.map((bullet, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-slate-300 leading-relaxed">
              <span className="mt-1.5 w-1 h-1 rounded-full bg-emerald-400 shrink-0" />
              {bullet}
            </li>
          ))}
        </ul>
      </div>

      {/* Follow-up chat */}
      <div className="border-t border-slate-700/50">
        <button
          onClick={() => { setShowChat(!showChat); setTimeout(() => inputRef.current?.focus(), 100); }}
          className="w-full px-5 py-2.5 flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:text-slate-300 transition-colors"
        >
          Ask a follow-up
          <ChevronDown className={clsx("w-3.5 h-3.5 transition-transform", showChat && "rotate-180")} />
        </button>

        <AnimatePresence>
          {showChat && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              {/* Chat messages */}
              {chatMessages.length > 0 && (
                <div className="px-5 pb-3 max-h-60 overflow-y-auto space-y-3">
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={clsx("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                      <div className={clsx(
                        "max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed",
                        msg.role === "user"
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "bg-slate-700/50 text-slate-300"
                      )}>
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="bg-slate-700/50 px-3 py-2 rounded-xl">
                        <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
              )}

              {/* Input */}
              <div className="px-5 pb-4">
                <div className="flex items-center gap-2 bg-slate-700/30 rounded-xl border border-slate-600/50 focus-within:border-emerald-500/50 transition-colors">
                  <input
                    ref={inputRef}
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="e.g., What's driving the negative net flow?"
                    className="flex-1 bg-transparent px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none"
                    disabled={isLoading}
                  />
                  <button
                    onClick={handleAskFollowUp}
                    disabled={!chatInput.trim() || isLoading}
                    className="p-2 mr-1 text-slate-400 hover:text-emerald-400 disabled:text-slate-600 disabled:cursor-not-allowed transition-colors"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
                {!process.env.GEMINI_API_KEY && (
                  <div className="flex items-center gap-1.5 mt-2 text-[10px] text-amber-500/70">
                    <AlertCircle className="w-3 h-3" />
                    <span>Gemini API key not detected — follow-ups require GEMINI_API_KEY in environment.</span>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Export narrative generator for Report Builder ─────────────────
export { generateNarrative, filterBusinessDays as filterBizDays };
