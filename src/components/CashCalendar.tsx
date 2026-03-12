import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { DailyData, DisbursementItem, DisbursementStatus, DisbursementType, Attachment } from "../types";
import { format, parse, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, addDays, setMonth, getMonth, getYear, setYear, isWithinInterval, startOfToday } from "date-fns";
import { ArrowUpRight, ArrowDownRight, Calculator, Plus, Trash2, ChevronLeft, ChevronRight, X, Maximize2, CheckCircle2, AlertCircle, Clock, MessageSquare, Paperclip, Sparkles, Wand2, ArrowRight, RotateCcw } from "lucide-react";
import { AnimatePresence } from "motion/react";
import CommentsAttachments from "./CommentsAttachments";
import MathInput from "./MathInput";
import { evaluateEquation } from "../utils/math";
import { formatCurrency as centralizedFormatCurrency, formatDate as centralizedFormatDate } from "../utils/formatters";

import { DndContext, DragEndEvent, useDraggable, useDroppable, MouseSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

interface Props {
  data: DailyData[];
  onUpdateDay: (date: string, updates: Partial<DailyData>) => void;
  onMoveDisbursement: (fromDate: string, toDate: string, itemId: string) => void;
  onMoveMultipleDisbursements?: (moves: { fromDate: string, toDate: string, itemId: string }[]) => void;
  isExecutive: boolean;
  isMaximized?: boolean;
  currency?: string;
  dateFormat?: string;
  regions?: string[];
}

type Timeframe = "1 Day" | "1 Week" | "1 Month";

const STATUS_OPTIONS: DisbursementStatus[] = ["Unfunded", "Funded", "Paid"];

const getStatusColor = (status?: DisbursementStatus) => {
  switch (status) {
    case "Paid": return "text-emerald-600 bg-emerald-50 border-emerald-100";
    case "Funded": return "text-blue-600 bg-blue-50 border-blue-100";
    case "Unfunded": return "text-rose-600 bg-rose-50 border-rose-100";
    default: return "text-slate-500 bg-slate-50 border-slate-100";
  }
};

const getStatusIcon = (status?: DisbursementStatus) => {
  switch (status) {
    case "Paid": return <CheckCircle2 className="w-3 h-3" />;
    case "Funded": return <Clock className="w-3 h-3" />;
    case "Unfunded": return <AlertCircle className="w-3 h-3" />;
    default: return null;
  }
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

function DroppableDay({ date, children, isSelected, onClick, className }: { date: string, children: React.ReactNode, isSelected: boolean, onClick: () => void, className: string }) {
  const { isOver, setNodeRef } = useDroppable({
    id: `drop-${date}`,
    data: { date }
  });

  return (
    <div 
      ref={setNodeRef}
      onClick={onClick}
      className={`${className} ${isOver ? "ring-4 ring-emerald-400 bg-emerald-100/50 z-10 scale-[1.02]" : ""}`}
    >
      {children}
    </div>
  );
}

function DraggableItem({ id, date, children, disabled }: { id: string, date: string, children: React.ReactNode, disabled?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `drag-${id}`,
    data: { id, date },
    disabled
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    cursor: disabled ? "default" : (isDragging ? "grabbing" : "grab"),
    zIndex: isDragging ? 100 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
}

function DateInput({ initialDate, onCommit, disabled }: { initialDate: string, onCommit: (newDate: string) => void, disabled?: boolean }) {
  const [value, setValue] = useState(initialDate);

  useEffect(() => {
    setValue(initialDate);
  }, [initialDate]);

  const handleBlur = () => {
    if (value !== initialDate) {
      onCommit(value);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      (e.target as HTMLInputElement).blur();
    }
    if (e.key === "Escape") {
      setValue(initialDate);
    }
  };

  return (
    <input 
      type="text"
      disabled={disabled}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className="flex-1 px-2 py-0.5 bg-slate-50 border border-slate-100 rounded text-[10px] font-mono text-slate-500 focus:ring-1 focus:ring-emerald-500 outline-none disabled:opacity-50"
      placeholder="M/d/yyyy"
    />
  );
}

export default function CashCalendar({ 
  data, 
  onUpdateDay, 
  onMoveDisbursement, 
  onMoveMultipleDisbursements,
  isExecutive, 
  isMaximized = false,
  currency = 'USD',
  dateFormat = 'MM/DD/YYYY',
  regions = []
}: Props) {
  const today = startOfToday();
  const todayStr = format(today, "M/d/yyyy");
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [viewDate, setViewDate] = useState(today);
  const [showModal, setShowModal] = useState(false);
  const [timeframe, setTimeframe] = useState<Timeframe>("1 Day");
  const [isCustomRange, setIsCustomRange] = useState(false);
  const [filterType, setFilterType] = useState<DisbursementType | "all">("all");
  const [optimizing, setOptimizing] = useState(false);
  const [suggestions, setSuggestions] = useState<{ fromDate: string, toDate: string, itemId: string, label: string, amount: number, selected: boolean }[]>([]);
  const [history, setHistory] = useState<{ fromDate: string, toDate: string, itemId: string, label: string, amount: number }[][]>([]);
  const [noSuggestionsFound, setNoSuggestionsFound] = useState(false);

  const formatCurrency = (val: number, compact = true) => centralizedFormatCurrency(val, currency, compact);
  const formatDate = (date: string | Date) => centralizedFormatDate(date, dateFormat);

  const handleSuggestFixes = () => {
    setOptimizing(true);
    setNoSuggestionsFound(false);
    const newSuggestions: typeof suggestions = [];
    
    // Heuristic: Find days where balance is below 10% of the average balance or below 100k
    const avgBalance = data.reduce((acc, d) => acc + d.endingBalance, 0) / data.length;
    const threshold = Math.max(100000, avgBalance * 0.1);

    data.forEach((day, idx) => {
      if (day.endingBalance < threshold) {
        // Find non-critical disbursements
        const flexibleItems = day.disbursements.filter(d => 
          !d.label.toLowerCase().includes("payroll") && 
          !d.label.toLowerCase().includes("benefits") &&
          d.status !== "Paid"
        );

        if (flexibleItems.length > 0) {
          // Find a better day (next 14 days)
          for (let i = 1; i <= 14; i++) {
            const futureDay = data[idx + i];
            if (futureDay && futureDay.endingBalance > threshold * 1.5) {
              flexibleItems.forEach(item => {
                newSuggestions.push({
                  fromDate: day.date,
                  toDate: futureDay.date,
                  itemId: item.id,
                  label: item.label,
                  amount: item.amount,
                  selected: true
                });
              });
              break;
            }
          }
        }
      }
    });

    setTimeout(() => {
      if (newSuggestions.length === 0) {
        setNoSuggestionsFound(true);
      } else {
        setSuggestions(newSuggestions);
      }
      setOptimizing(false);
    }, 1500);
  };

  const toggleSuggestion = (index: number) => {
    setSuggestions(prev => prev.map((s, i) => i === index ? { ...s, selected: !s.selected } : s));
  };

  const toggleAllSuggestions = (selected: boolean) => {
    setSuggestions(prev => prev.map(s => ({ ...s, selected })));
  };

  const applySuggestions = () => {
    const selectedSuggestions = suggestions.filter(s => s.selected);
    if (selectedSuggestions.length === 0) return;

    if (onMoveMultipleDisbursements) {
      onMoveMultipleDisbursements(selectedSuggestions.map(s => ({
        fromDate: s.fromDate,
        toDate: s.toDate,
        itemId: s.itemId
      })));
    } else {
      // Fallback to sequential if batch not provided (though we just added it)
      selectedSuggestions.forEach(s => {
        onMoveDisbursement(s.fromDate, s.toDate, s.itemId);
      });
    }

    setHistory(prev => [selectedSuggestions, ...prev]);
    setSuggestions([]);
  };

  const undoLastAction = () => {
    const lastAction = history[0];
    if (!lastAction) return;

    if (onMoveMultipleDisbursements) {
      onMoveMultipleDisbursements(lastAction.map(s => ({
        fromDate: s.toDate,
        toDate: s.fromDate,
        itemId: s.itemId
      })));
    } else {
      lastAction.forEach(s => {
        onMoveDisbursement(s.toDate, s.fromDate, s.itemId);
      });
    }

    setHistory(prev => prev.slice(1));
  };

  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: {
      delay: 250, // 250ms press required to start drag
      tolerance: 5, // 5px movement allowed during delay
    },
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: {
      delay: 250, // 250ms press required to start drag
      tolerance: 5,
    },
  });
  const sensors = useSensors(mouseSensor, touchSensor);

  useEffect(() => {
    if (showModal) {
      setTimeframe("1 Day");
      setFilterType("all");
    }
  }, [showModal]);

  if (data.length === 0) return null;

  const monthStart = startOfMonth(viewDate);
  const monthEnd = endOfMonth(viewDate);

  const viewStart = startOfWeek(monthStart);
  const viewEnd = endOfWeek(monthEnd);
  const days = eachDayOfInterval({ start: viewStart, end: viewEnd });

  // Filter data for the itemized notes based on timeframe
  const getSelectedData = () => {
    const selected = parse(selectedDate, "M/d/yyyy", new Date());
    const today = startOfToday();

    if (isCustomRange) {
      const start = today < selected ? today : selected;
      const end = today < selected ? selected : today;
      return data.filter(d => {
        const dDate = parse(d.date, "M/d/yyyy", new Date());
        return isWithinInterval(dDate, { start, end });
      });
    }
    
    if (timeframe === "1 Day") {
      return data.filter(d => d.date === selectedDate);
    }
    
    if (timeframe === "1 Week") {
      const start = startOfWeek(selected);
      const end = endOfWeek(selected);
      return data.filter(d => {
        const dDate = parse(d.date, "M/d/yyyy", new Date());
        return isWithinInterval(dDate, { start, end });
      });
    }
    
    if (timeframe === "1 Month") {
      const start = startOfMonth(selected);
      const end = endOfMonth(selected);
      return data.filter(d => {
        const dDate = parse(d.date, "M/d/yyyy", new Date());
        return isWithinInterval(dDate, { start, end });
      });
    }
    
    return [];
  };

  const selectedPeriodData = React.useMemo(() => getSelectedData(), [selectedDate, timeframe, isCustomRange, data]);
  
  const summary = React.useMemo(() => {
    if (selectedPeriodData.length === 0) return null;
    const startDay = selectedPeriodData[0];
    const endDay = selectedPeriodData[selectedPeriodData.length - 1];
    
    // Starting balance is the balance before any activity on the first day
    const startBalance = startDay.endingBalance - startDay.netFlow;
    const totalOutflows = selectedPeriodData.reduce((sum, d) => sum + d.cashOut, 0);
    const endBalance = endDay.endingBalance;
    
    return { startBalance, totalOutflows, endBalance };
  }, [selectedPeriodData]);
  const selectedDayData = data.find(d => d.date === selectedDate);

  useEffect(() => {
    if (selectedDate) {
      const element = document.getElementById(`note-${selectedDate}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [selectedDate]);

  const handleUpdateDisbursement = (date: string, items: DisbursementItem[]) => {
    onUpdateDay(date, { disbursements: items });
  };

  const handleAddItem = (date: string, currentItems: DisbursementItem[]) => {
    const newItem: DisbursementItem = {
      id: Math.random().toString(36).substr(2, 9),
      label: "New Item",
      amount: 0,
      status: "Unfunded",
      type: "manual"
    };
    handleUpdateDisbursement(date, [newItem, ...currentItems]);
  };

  const handleRemoveItem = (date: string, currentItems: DisbursementItem[], id: string) => {
    handleUpdateDisbursement(date, currentItems.filter(item => item.id !== id));
  };

  const handleItemChange = (date: string, currentItems: DisbursementItem[], id: string, updates: any) => {
    const updated = currentItems.map(item => {
      if (item.id === id) {
        const newItem = { ...item, ...updates };
        if (updates.amount !== undefined) {
          const value = updates.amount;
          const num = typeof value === 'string' ? evaluateEquation(value) : value;
          newItem.amount = num;
        }
        return newItem;
      }
      return item;
    });
    handleUpdateDisbursement(date, updated);
  };

  const handlePrevMonth = () => setViewDate(prev => addDays(startOfMonth(prev), -1));
  const handleNextMonth = () => setViewDate(prev => addDays(endOfMonth(prev), 1));

  const handleMonthChange = (monthIdx: number) => {
    setViewDate(prev => setMonth(prev, monthIdx));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.data.current && over.data.current) {
      const fromDate = active.data.current.date;
      const itemId = active.data.current.id;
      const toDate = over.data.current.date;
      onMoveDisbursement(fromDate, toDate, itemId);
    }
  };

  return (
    <DndContext onDragEnd={handleDragEnd} sensors={sensors}>
      <div className={`grid grid-cols-1 ${isMaximized ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-4 mb-8`}>
      {/* Calendar View */}
      <div className={`${isMaximized ? 'lg:col-span-3' : 'lg:col-span-2'} bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col ${isMaximized ? 'border-none shadow-none' : ''}`}>
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex flex-col">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{format(viewDate, "MMMM yyyy")} Cash Flow</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Daily inflows and outflows at a glance</p>
              </div>
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                <button onClick={handlePrevMonth} className="p-1.5 hover:bg-white dark:hover:bg-slate-700 hover:shadow-sm rounded-lg transition-all text-slate-500">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <select 
                  value={getMonth(viewDate)}
                  onChange={(e) => handleMonthChange(parseInt(e.target.value))}
                  className="text-xs font-bold text-slate-600 dark:text-slate-300 bg-transparent border-none focus:ring-0 outline-none cursor-pointer px-2"
                >
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i}>{m}</option>
                  ))}
                </select>
                <button onClick={handleNextMonth} className="p-1.5 hover:bg-white dark:hover:bg-slate-700 hover:shadow-sm rounded-lg transition-all text-slate-500">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 sm:gap-6">
              <button
                onClick={handleSuggestFixes}
                disabled={optimizing}
                className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  optimizing
                    ? "bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed"
                    : "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm hover:shadow-md"
                }`}
              >
                {optimizing ? (
                  <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Sparkles className="w-3 h-3" />
                )}
                {optimizing ? "Analyzing..." : "Suggest Fixes"}
              </button>
              <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                {(["1 Day", "1 Week", "1 Month"] as Timeframe[]).map((tf) => (
                  <button
                    key={tf}
                    onClick={() => {
                      setTimeframe(tf);
                      setIsCustomRange(false);
                    }}
                    className={`px-2 sm:px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all ${
                      timeframe === tf && !isCustomRange
                        ? "bg-white dark:bg-slate-700 text-emerald-600 shadow-sm"
                        : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
              <div className="hidden sm:flex items-center gap-4 text-[10px] font-bold uppercase tracking-wider">
                <div className="flex items-center gap-1.5 text-emerald-600">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  Inflow
                </div>
                <div className="flex items-center gap-1.5 text-rose-600">
                  <div className="w-2 h-2 rounded-full bg-rose-500" />
                  Outflow
                </div>
                <div className="flex items-center gap-1.5 text-amber-600">
                  <div className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]" />
                  Thin Liquidity
                </div>
              </div>
            </div>
          </div>

          {summary && (
            <div className="p-4 bg-slate-900 dark:bg-slate-900/50 rounded-2xl text-white shadow-lg border border-slate-800 dark:border-slate-800/50 flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-emerald-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Calculator className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 block">Balance Summary</span>
                    <span className="text-[8px] text-slate-500 dark:text-slate-600">{isCustomRange ? "Today \u2192 Selected" : timeframe}</span>
                  </div>
                </div>

                <div className="hidden sm:flex items-center gap-4 sm:gap-8">
                  <div className="flex flex-col items-end min-w-0">
                    <span className="text-[9px] text-slate-500 uppercase tracking-tight">Starting</span>
                    <span className="text-xs sm:text-sm font-mono font-bold whitespace-nowrap">{formatCurrency(summary.startBalance, false)}</span>
                  </div>
                  <div className="text-slate-700 font-bold flex-shrink-0">-</div>
                  <div className="flex flex-col items-end min-w-0">
                    <span className="text-[9px] text-slate-500 uppercase tracking-tight">Outflows</span>
                    <span className="text-xs sm:text-sm font-mono font-bold text-rose-400 whitespace-nowrap">{formatCurrency(summary.totalOutflows, false)}</span>
                  </div>
                  <div className="text-slate-700 font-bold flex-shrink-0">=</div>
                  <div className="flex flex-col items-end min-w-0">
                    <span className="text-[9px] text-slate-500 uppercase tracking-tight">Current</span>
                    <span className={`text-xs sm:text-sm font-mono font-bold whitespace-nowrap ${summary.endBalance >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {formatCurrency(summary.endBalance, false)}
                    </span>
                  </div>
                </div>

                {/* Mobile: stacked grid for balance summary values */}
                <div className="sm:hidden grid grid-cols-3 gap-2 text-center">
                  <div>
                    <span className="text-[9px] text-slate-500 uppercase tracking-tight block">Starting</span>
                    <span className="text-[11px] font-mono font-bold whitespace-nowrap">{formatCurrency(summary.startBalance)}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-500 uppercase tracking-tight block">Outflows</span>
                    <span className="text-[11px] font-mono font-bold text-rose-400 whitespace-nowrap">{formatCurrency(summary.totalOutflows)}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-500 uppercase tracking-tight block">Current</span>
                    <span className={`text-[11px] font-mono font-bold whitespace-nowrap ${summary.endBalance >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {formatCurrency(summary.endBalance)}
                    </span>
                  </div>
                </div>
              </div>

              {noSuggestionsFound && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-slate-800/50 border border-slate-700 rounded-xl p-3 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-medium text-slate-300">No optimizations found for current liquidity levels.</span>
                  </div>
                  <button 
                    onClick={() => setNoSuggestionsFound(false)}
                    className="text-[10px] font-bold text-slate-500 hover:text-white transition-colors"
                  >
                    Dismiss
                  </button>
                </motion.div>
              )}

              {suggestions.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Wand2 className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs font-bold text-emerald-400">AI Optimization Suggestions</span>
                      <span className="text-[10px] text-slate-500 font-medium ml-2">{suggestions.filter(s => s.selected).length} selected</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => toggleAllSuggestions(suggestions.some(s => !s.selected))}
                        className="text-[10px] font-bold text-slate-400 hover:text-white transition-colors px-2 py-1 hover:bg-white/5 rounded"
                      >
                        {suggestions.every(s => s.selected) ? "Deselect All" : "Select All"}
                      </button>
                      <button 
                        onClick={() => setSuggestions([])}
                        className="text-[10px] font-bold text-slate-400 hover:text-white transition-colors px-2 py-1 hover:bg-white/5 rounded"
                      >
                        Dismiss
                      </button>
                      <button 
                        onClick={applySuggestions}
                        disabled={suggestions.filter(s => s.selected).length === 0}
                        className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500 text-white text-[10px] font-bold rounded-lg hover:bg-emerald-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        Apply Selected Fixes
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5 max-h-[120px] overflow-y-auto pr-1 custom-scrollbar">
                    {suggestions.map((s, i) => (
                      <div 
                        key={i} 
                        onClick={() => toggleSuggestion(i)}
                        className={`flex items-center justify-between text-[10px] p-1.5 rounded-lg transition-all cursor-pointer ${
                          s.selected ? "bg-emerald-500/20 text-white" : "bg-slate-800/50 text-slate-400 hover:bg-slate-800"
                        }`}
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className={`w-3 h-3 rounded border flex items-center justify-center transition-colors ${
                            s.selected ? "bg-emerald-500 border-emerald-500" : "border-slate-600"
                          }`}>
                            {s.selected && <CheckCircle2 className="w-2 h-2 text-white" />}
                          </div>
                          <span className="truncate">{s.label}</span>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          <span className="font-mono text-emerald-400">{formatCurrency(s.amount)}</span>
                          <div className="flex items-center gap-1 text-slate-500">
                            <span>{s.fromDate}</span>
                            <ArrowRight className="w-2 h-2" />
                            <span className="text-slate-300">{s.toDate}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {history.length > 0 && suggestions.length === 0 && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-slate-800/50 border border-slate-700 rounded-xl p-3 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-medium text-slate-300">Applied {history[0].length} optimizations</span>
                  </div>
                  <button 
                    onClick={undoLastAction}
                    className="flex items-center gap-1.5 px-3 py-1 bg-slate-700 text-white text-[10px] font-bold rounded-lg hover:bg-slate-600 transition-all"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Undo Changes
                  </button>
                </motion.div>
              )}
            </div>
          )}
        </div>

        <div className="p-4 flex-1">
          <div className="grid grid-cols-7 gap-px bg-slate-200 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <div key={day} className="bg-slate-50 dark:bg-slate-800/50 py-2 text-center text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                {day}
              </div>
            ))}
            
            {days.map((day, idx) => {
              const dateStr = format(day, "M/d/yyyy");
              const dayData = data.find(d => d.date === dateStr);
              const isCurrentMonth = isSameMonth(day, viewDate);
              const isToday = isSameDay(day, new Date());
              const isSelected = selectedDate === dateStr;

              return (
                <DroppableDay 
                  key={idx} 
                  date={dateStr}
                  onClick={() => {
                    if (dayData) {
                      setSelectedDate(dateStr);
                      setIsCustomRange(true);
                      if (!isMaximized) setShowModal(true);
                    }
                  }}
                  isSelected={isSelected}
                  className={`min-h-[60px] sm:min-h-[110px] bg-white dark:bg-slate-900 p-1 sm:p-2 flex flex-col gap-0.5 sm:gap-1 transition-all cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 ${
                    !isCurrentMonth ? "bg-slate-50/50 dark:bg-slate-800/20 opacity-40" : ""
                  } ${isSelected ? "ring-2 ring-inset ring-emerald-500 bg-emerald-50/30 dark:bg-emerald-500/10" : ""}`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className={`text-[11px] font-bold ${
                      isToday ? "bg-emerald-500 text-white w-5 h-5 flex items-center justify-center rounded-full" : "text-slate-400 dark:text-slate-500"
                    }`}>
                      {format(day, "d")}
                    </span>
                    {dayData && dayData.endingBalance < 100000 && (
                      <div className="flex items-center gap-1">
                        <span className="text-[7px] font-bold text-rose-500 uppercase tracking-tighter">Low Liquidity</span>
                        <div className="w-1.5 h-1.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]" />
                      </div>
                    )}
                  </div>

                  {dayData ? (
                    <div className="flex-1 flex flex-col gap-0.5 justify-end overflow-hidden">
                      {/* Inflows */}
                      {Object.entries(dayData.regionalReceipts).map(([region, value]) => (
                        value > 0 ? (
                          <div key={region} className="flex items-center justify-between bg-emerald-50/50 dark:bg-emerald-500/10 px-1 rounded border border-emerald-100/30 dark:border-emerald-500/20">
                            <span className="text-[8px] font-bold text-emerald-600 dark:text-emerald-400 truncate mr-1">{region}</span>
                            <span className="text-[9px] font-mono font-bold text-emerald-700 dark:text-emerald-300">
                              {formatCurrency(value)}
                            </span>
                          </div>
                        ) : null
                      ))}
                      {dayData.grants > 0 && (
                        <div className="flex items-center justify-between bg-emerald-50/50 dark:bg-emerald-500/10 px-1 rounded border border-emerald-100/30 dark:border-emerald-500/20">
                          <span className="text-[8px] font-bold text-emerald-600 dark:text-emerald-400 truncate mr-1">Grants</span>
                          <span className="text-[9px] font-mono font-bold text-emerald-700 dark:text-emerald-300">
                            {formatCurrency(dayData.grants)}
                          </span>
                        </div>
                      )}

                      {/* Outflows - Itemized */}
                      {dayData.disbursements.filter(item => item.amount > 0).map((item) => (
                        <DraggableItem key={item.id} id={item.id} date={dayData.date} disabled={isExecutive}>
                          <div className={`flex items-center justify-between px-1 rounded border ${
                            item.status === 'Paid' ? 'bg-emerald-50/50 dark:bg-emerald-500/10 border-emerald-100/30 dark:border-emerald-500/20' :
                            item.status === 'Funded' ? 'bg-blue-50/50 dark:bg-blue-500/10 border-blue-100/30 dark:border-blue-500/20' :
                            'bg-rose-50/50 dark:bg-rose-500/10 border-rose-100/30 dark:border-rose-500/20'
                          }`}>
                            <span className={`text-[8px] font-bold truncate mr-1 ${
                              item.status === 'Paid' ? 'text-emerald-600 dark:text-emerald-400' :
                              item.status === 'Funded' ? 'text-blue-600 dark:text-blue-400' :
                              'text-rose-600 dark:text-rose-400'
                            }`}>{item.label}</span>
                            <span className={`text-[9px] font-mono font-bold ${
                              item.status === 'Paid' ? 'text-emerald-700 dark:text-emerald-300' :
                              item.status === 'Funded' ? 'text-blue-700 dark:text-blue-300' :
                              'text-rose-700 dark:text-rose-300'
                            }`}>
                              {formatCurrency(item.amount)}
                            </span>
                          </div>
                        </DraggableItem>
                      ))}

                      {/* Ending Balance Indicator */}
                      <div className={`mt-auto pt-1.5 border-t dark:border-slate-800 flex flex-col items-end ${
                        dayData.endingBalance < 100000 
                          ? "border-amber-100 dark:border-amber-900/30 bg-amber-50/50 dark:bg-amber-900/20 -mx-2 -mb-2 px-2 pb-2 pt-1 rounded-b-xl" 
                          : "border-slate-50 dark:border-slate-800"
                      }`}>
                        <span className={`text-[7px] font-bold uppercase tracking-widest mb-0.5 ${
                          dayData.endingBalance < 100000 ? "text-amber-600" : "text-slate-400 dark:text-slate-500"
                        }`}>
                          {dayData.endingBalance < 100000 ? "Available Liquidity" : "Ending Balance"}
                        </span>
                        <span className={`font-mono font-bold transition-all ${
                          dayData.endingBalance < 100000 
                            ? "text-[11px] text-amber-700 scale-110 origin-right" 
                            : "text-[9px] text-slate-600 dark:text-slate-400"
                        }`}>
                          {formatCurrency(dayData.endingBalance, false)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center">
                      {isCurrentMonth && <div className="w-1 h-1 rounded-full bg-slate-100" />}
                    </div>
                  )}
                </DroppableDay>
              );
            })}
          </div>
        </div>
      </div>

      {/* Notes / Edit Table */}
      <div className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col ${isMaximized ? 'h-full border-none shadow-none' : 'h-[600px]'}`}>
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 space-y-4">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Itemized Notes</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Review and manage disbursements</p>
            </div>
          </div>

          {isExecutive && (
            <div className="p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/30 rounded-lg flex items-center gap-2">
              <Calculator className="w-3.5 h-3.5 text-amber-600" />
              <span className="text-[10px] font-medium text-amber-700">Consolidated view is read-only.</span>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {selectedPeriodData.length > 0 ? (
            selectedPeriodData.map((dayData) => (
              <div 
                key={dayData.date} 
                id={`note-${dayData.date}`}
                className={`p-4 rounded-xl border transition-all ${
                  dayData.date === selectedDate 
                    ? "border-emerald-500 bg-emerald-50/30 dark:bg-emerald-500/10 shadow-sm" 
                    : "border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900"
                }`}
              >
                <div className="flex justify-between items-center mb-3">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">{formatDate(dayData.date)}</span>
                  <span className="text-[10px] font-mono font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Balance: {formatCurrency(dayData.endingBalance, false)}</span>
                </div>

                <div className="space-y-2">
                  {dayData.disbursements.map((item) => (
                    <DraggableItem key={item.id} id={item.id} date={dayData.date} disabled={isExecutive}>
                      <div className="space-y-2 p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm">
                        <div className="flex items-center gap-2">
                          <input 
                            type="text"
                            disabled={isExecutive}
                            value={item.label}
                            onChange={(e) => handleItemChange(dayData.date, dayData.disbursements, item.id, { label: e.target.value })}
                            className="flex-1 px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-[11px] font-medium text-slate-700 dark:text-slate-200 focus:ring-1 focus:ring-emerald-500 outline-none disabled:opacity-50"
                          />
                          {!isExecutive && (
                            <button 
                              onClick={() => handleRemoveItem(dayData.date, dayData.disbursements, item.id)}
                              className="p-1 text-slate-300 dark:text-slate-600 hover:text-rose-500 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <select
                            disabled={isExecutive}
                            value={item.status || "Unfunded"}
                            onChange={(e) => handleItemChange(dayData.date, dayData.disbursements, item.id, { status: e.target.value as DisbursementStatus })}
                            className={`text-[10px] font-bold px-2 py-1 rounded-lg border dark:border-slate-700 outline-none cursor-pointer ${getStatusColor(item.status)}`}
                          >
                            {STATUS_OPTIONS.map(opt => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                          <MathInput 
                            disabled={isExecutive}
                            value={item.amount}
                            onChange={(val) => handleItemChange(dayData.date, dayData.disbursements, item.id, { amount: val })}
                            className={`w-24 px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-[11px] font-mono font-bold focus:ring-1 focus:ring-emerald-500 outline-none disabled:opacity-50 text-right ${item.status === 'Paid' ? 'text-slate-400 dark:text-slate-500 line-through' : 'text-rose-600 dark:text-rose-400'}`}
                          />
                        </div>
                        <div className="flex items-center gap-2 pt-1">
                          <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Date:</span>
                          <DateInput 
                            disabled={isExecutive}
                            initialDate={dayData.date}
                            onCommit={(newDate) => onMoveDisbursement(dayData.date, newDate, item.id)}
                          />
                        </div>
                        
                        <CommentsAttachments 
                          disabled={isExecutive}
                          comments={item.comments}
                          attachments={item.attachments}
                          onUpdate={(updates) => handleItemChange(dayData.date, dayData.disbursements, item.id, updates)}
                        />
                      </div>
                    </DraggableItem>
                  ))}
                  
                  {!isExecutive && (
                    <button 
                      onClick={() => handleAddItem(dayData.date, dayData.disbursements)}
                      className="w-full py-1.5 border border-dashed border-slate-200 dark:border-slate-700 rounded-lg text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 transition-all flex items-center justify-center gap-1.5"
                    >
                      <Plus className="w-3 h-3" />
                      Add Disbursement
                    </button>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <div className="w-12 h-12 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                <Calculator className="w-6 h-6 text-slate-300 dark:text-slate-600" />
              </div>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">No data for this date</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Select a date from the calendar to view or edit itemized notes.</p>
            </div>
          )}
        </div>

        <div className="bg-slate-50 dark:bg-slate-800/50 px-6 py-3 border-t border-slate-100 dark:border-slate-800">
          <p className="text-[10px] text-slate-400 dark:text-slate-500 italic">
            * Changes here override regional estimates and update the consolidated view.
          </p>
        </div>
      </div>
      {/* Magnified Centered Modal */}
      <AnimatePresence>
        {showModal && selectedDayData && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative w-full max-w-3xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-4 sm:p-8 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                <div className="flex justify-between items-start mb-4 sm:mb-6">
                  <div className="min-w-0 flex-1 mr-3">
                    <h3 className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-white truncate">
                      {timeframe === "1 Day" 
                        ? format(parse(selectedDayData.date, "M/d/yyyy", new Date()), "EEEE, MMMM do")
                        : timeframe === "1 Week"
                          ? `Week of ${format(startOfWeek(parse(selectedDayData.date, "M/d/yyyy", new Date())), "MMM d, yyyy")}`
                          : format(parse(selectedDayData.date, "M/d/yyyy", new Date()), "MMMM yyyy")
                      }
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Itemized Disbursements & Adjustments</p>
                  </div>
                  <button 
                    onClick={() => setShowModal(false)}
                    className="p-2 hover:bg-white dark:hover:bg-slate-800 hover:shadow-md rounded-xl text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-200 transition-all"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-6">
                  <div className="flex p-1 bg-slate-200/50 dark:bg-slate-800 rounded-xl w-full max-w-[280px]">
                    {(["1 Day", "1 Week", "1 Month"] as Timeframe[]).map((tf) => (
                      <button
                        key={tf}
                        onClick={() => {
                          setTimeframe(tf);
                          setIsCustomRange(false);
                        }}
                        className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all ${
                          timeframe === tf && !isCustomRange
                            ? "bg-white dark:bg-slate-700 text-emerald-600 shadow-sm" 
                            : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                        }`}
                      >
                        {tf}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Filter:</span>
                    <div className="flex p-0.5 bg-slate-200/50 dark:bg-slate-800 rounded-lg">
                      {(["all", "manual", "estimate"] as const).map((type) => (
                        <button
                          key={type}
                          onClick={() => setFilterType(type)}
                          className={`px-3 py-1 text-[9px] font-bold uppercase tracking-wider rounded-md transition-all ${
                            filterType === type 
                              ? "bg-white dark:bg-slate-700 text-emerald-600 shadow-sm" 
                              : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                          }`}
                        >
                          {type === "all" ? "All" : type === "manual" ? "Notes" : "Estimates"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 sm:p-8 pt-4 sm:pt-6 space-y-6 sm:space-y-8">
                {summary && (
                  <div className="p-4 sm:p-6 bg-slate-900 dark:bg-slate-950 rounded-2xl sm:rounded-3xl text-white shadow-xl border border-slate-800">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center">
                          <Calculator className="w-5 h-5 text-emerald-400" />
                        </div>
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block">Balance Summary</span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">Projected impact of disbursements</span>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold px-3 py-1 bg-white/10 rounded-full uppercase text-slate-300">
                        {isCustomRange ? "Today → Selected" : timeframe}
                      </span>
                    </div>
                    
                    <div className="hidden sm:flex items-center justify-between gap-4">
                      <div className="flex-1">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block mb-1 uppercase tracking-widest">Starting Balance</span>
                        <span className="text-2xl font-mono font-bold">{formatCurrency(summary.startBalance, false)}</span>
                      </div>
                      <div className="text-slate-700 dark:text-slate-600 text-2xl font-bold">-</div>
                      <div className="flex-1 text-center">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block mb-1 uppercase tracking-widest">Total Outflows</span>
                        <span className="text-2xl font-mono font-bold text-rose-400">{formatCurrency(summary.totalOutflows, false)}</span>
                      </div>
                      <div className="text-slate-700 dark:text-slate-600 text-2xl font-bold">=</div>
                      <div className="flex-1 text-right">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block mb-1 uppercase tracking-widest">Current Balance</span>
                        <span className="text-2xl font-mono font-bold text-emerald-400">{formatCurrency(summary.endBalance, false)}</span>
                      </div>
                    </div>
                    <div className="sm:hidden grid grid-cols-3 gap-3 text-center">
                      <div>
                        <span className="text-[9px] text-slate-500 uppercase tracking-tight block mb-1">Starting</span>
                        <span className="text-sm font-mono font-bold">{formatCurrency(summary.startBalance)}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-500 uppercase tracking-tight block mb-1">Outflows</span>
                        <span className="text-sm font-mono font-bold text-rose-400">{formatCurrency(summary.totalOutflows)}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-500 uppercase tracking-tight block mb-1">Current</span>
                        <span className={`text-sm font-mono font-bold ${summary.endBalance >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {formatCurrency(summary.endBalance)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-6">
                  {selectedPeriodData.map((dayData) => (
                    <div key={dayData.date} className="space-y-4">
                      <div className="flex justify-between items-center px-2">
                        <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                          {format(parse(dayData.date, "M/d/yyyy", new Date()), "EEEE, MMM d")}
                        </h4>
                        <div className="flex items-center gap-4">
                          <span className="text-[10px] font-mono font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                            Net: {formatCurrency(dayData.netFlow, false)}
                          </span>
                          {!isExecutive && (
                            <button 
                              onClick={() => handleAddItem(dayData.date, dayData.disbursements)}
                              className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors"
                            >
                              <Plus className="w-4 h-4" />
                              Add
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="space-y-3">
                        {dayData.disbursements.filter(d => filterType === "all" || (d.type || "manual") === filterType).length > 0 ? (
                          dayData.disbursements
                            .filter(d => filterType === "all" || (d.type || "manual") === filterType)
                            .map((item) => (
                            <DraggableItem key={item.id} id={item.id} date={dayData.date} disabled={isExecutive}>
                              <motion.div
                                layout
                                className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-3 sm:p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 group"
                              >
                                <div className="flex-1 space-y-2 min-w-0">
                                  <input 
                                    type="text"
                                    disabled={isExecutive}
                                    value={item.label}
                                    onChange={(e) => handleItemChange(dayData.date, dayData.disbursements, item.id, { label: e.target.value })}
                                    placeholder="Transaction label..."
                                    className="w-full bg-transparent border-none p-0 text-sm font-semibold text-slate-700 dark:text-slate-200 focus:ring-0 outline-none disabled:opacity-50"
                                  />
                                  <div className="flex items-center gap-2">
                                    {STATUS_OPTIONS.map(opt => (
                                      <button
                                        key={opt}
                                        disabled={isExecutive}
                                        onClick={() => handleItemChange(dayData.date, dayData.disbursements, item.id, { status: opt })}
                                        className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-bold transition-all ${
                                          (item.status || "Unfunded") === opt 
                                            ? getStatusColor(opt)
                                            : "bg-white dark:bg-slate-800 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                                        }`}
                                      >
                                        {getStatusIcon(opt)}
                                        {opt}
                                      </button>
                                    ))}
                                  </div>
                                  <div className="flex items-center gap-2 pt-1">
                                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Date:</span>
                                    <DateInput 
                                      disabled={isExecutive}
                                      initialDate={dayData.date}
                                      onCommit={(newDate) => onMoveDisbursement(dayData.date, newDate, item.id)}
                                    />
                                  </div>

                                  <CommentsAttachments 
                                    disabled={isExecutive}
                                    comments={item.comments}
                                    attachments={item.attachments}
                                    onUpdate={(updates) => handleItemChange(dayData.date, dayData.disbursements, item.id, updates)}
                                  />
                                </div>
                                <div className="flex items-center gap-3 flex-shrink-0">
                                  <MathInput
                                    disabled={isExecutive}
                                    value={item.amount}
                                    onChange={(val) => handleItemChange(dayData.date, dayData.disbursements, item.id, { amount: val })}
                                    prefix="$"
                                    className={`w-full sm:w-32 pr-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-mono font-bold focus:ring-2 focus:ring-emerald-500 outline-none disabled:opacity-50 text-right shadow-sm ${item.status === 'Paid' ? 'text-slate-400 dark:text-slate-500 line-through' : 'text-rose-600 dark:text-rose-400'}`}
                                  />
                                  {!isExecutive && (
                                    <button
                                      onClick={() => handleRemoveItem(dayData.date, dayData.disbursements, item.id)}
                                      className="p-2 text-slate-300 dark:text-slate-600 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-all sm:opacity-0 sm:group-hover:opacity-100"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              </motion.div>
                            </DraggableItem>
                          ))
                        ) : (
                          <div className="text-center py-6 bg-slate-50/50 dark:bg-slate-800/50 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">No disbursements</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 sm:p-8 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
                <div className="hidden sm:flex items-center gap-2 text-slate-500 dark:text-slate-400">
                  <Calculator className="w-4 h-4" />
                  <span className="text-xs font-medium">
                    {isExecutive ? "View-only Mode" : "Real-time Balance Adjustment"}
                  </span>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="px-6 sm:px-8 py-3 bg-slate-900 dark:bg-slate-800 text-white rounded-2xl font-bold text-sm hover:bg-slate-800 dark:hover:bg-slate-700 transition-all shadow-lg shadow-slate-200 dark:shadow-none w-full sm:w-auto"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  </DndContext>
  );
}
