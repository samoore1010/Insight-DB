import { DashboardStats, Entity, EXECUTIVE_ENTITY } from "../types";
import { TrendingUp, TrendingDown, Wallet, Calendar, ArrowUpRight, ArrowDownRight, ChevronDown, ChevronUp, Edit3, Flame, AlertCircle, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useState, useEffect } from "react";
import { clsx } from "clsx";
import { formatCurrency as centralizedFormatCurrency } from "../utils/formatters";

interface Props {
  stats: DashboardStats;
  currentEntity: Entity;
  onUpdateBalance: (key: string, balance: number) => void;
  onInternalTransfer?: (from: string, to: string, amount: number) => void;
  todaysCashOut: number;
  balances: Record<string, number>;
  manualBalances?: Record<string, Record<string, number>>;
  isMaximized?: boolean;
  currency?: string;
  regions?: string[];
  readOnly?: boolean;
}

export default function SummaryCards({ 
  stats, 
  currentEntity, 
  onUpdateBalance, 
  onInternalTransfer,
  todaysCashOut, 
  balances, 
  manualBalances,
  isMaximized = false,
  currency = 'USD',
  regions = [],
  readOnly = false
}: Props) {
  const [isNetFlowExpanded, setIsNetFlowExpanded] = useState(isMaximized);
  const [isLiquidityExpanded, setIsLiquidityExpanded] = useState(isMaximized);
  const [isPayrollExpanded, setIsPayrollExpanded] = useState(isMaximized);
  const [isBurnExpanded, setIsBurnExpanded] = useState(isMaximized);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [tempBalance, setTempBalance] = useState("");

  // Transfer Modal State
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferFrom, setTransferFrom] = useState<string>("");
  const [transferTo, setTransferTo] = useState<string>("");
  const [transferAmount, setTransferAmount] = useState("");

  useEffect(() => {
    if (isMaximized) {
      setIsNetFlowExpanded(true);
      setIsLiquidityExpanded(true);
      setIsPayrollExpanded(true);
      setIsBurnExpanded(true);
    }
  }, [isMaximized]);

  const formatCurrency = (val: number) => centralizedFormatCurrency(val, currency, true);

  const startEditing = (key: string, val: number) => {
    setEditingKey(key);
    setTempBalance(val.toString());
  };

  const handleBalanceSubmit = () => {
    if (editingKey) {
      const val = parseFloat(tempBalance) || 0;
      onUpdateBalance(editingKey, val);
      setEditingKey(null);
    }
  };

  const handleTransferSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (transferFrom && transferTo && transferAmount && onInternalTransfer) {
      const amount = parseFloat(transferAmount);
      if (amount > 0 && transferFrom !== transferTo) {
        onInternalTransfer(transferFrom, transferTo, amount);
        setIsTransferModalOpen(false);
        setTransferAmount("");
        setTransferFrom("");
        setTransferTo("");
      }
    }
  };

  const getLiquidityBreakdown = () => {
    if (currentEntity === EXECUTIVE_ENTITY) {
      return (stats.regionalLiquidityBreakdown || []).map(item => ({
        key: item.region.toLowerCase(),
        label: item.region,
        value: item.value,
        type: "neutral",
        editable: false
      }));
    }
    // For any regional entity, show its balance accounts
    return Object.entries(balances).map(([key, value]) => ({
      key,
      label: `${currentEntity} Account`,
      value: value || 0,
      type: "neutral",
      editable: !readOnly
    }));
  };

  const liquidityBreakdown = getLiquidityBreakdown();
  
  // The card value should be the actual current liquidity from stats
  const cardValue = formatCurrency(stats.currentLiquidity);

  const getNetFlowBreakdown = () => {
    const base = [
      { label: "Grants / Other Funding", value: stats.breakdown14Day.grants, type: "in" },
      { label: "Disbursements: Payroll & Benefits", value: -(stats.breakdown14Day.payroll + stats.breakdown14Day.benefits), type: "out" },
      { label: "Disbursements: Other Ops", value: -(stats.breakdown14Day.otherDisbursements + stats.breakdown14Day.apPayments), type: "out" },
    ];

    if (currentEntity === EXECUTIVE_ENTITY) {
      const receiptItems = Object.entries(stats.breakdown14Day.regionalReceipts).map(([region, value]) => ({
        label: `Receipts: ${region}`, value, type: "in"
      }));
      return [...receiptItems, ...base];
    } else {
      const regionalReceipts = stats.breakdown14Day.regionalReceipts[currentEntity] || 0;
      return [
        { label: `Receipts: ${currentEntity}`, value: regionalReceipts, type: "in" },
        ...base
      ];
    }
  };

  const netFlowBreakdown = getNetFlowBreakdown();

  const cards = [
    {
      id: "liquidity",
      title: "Current Liquidity",
      value: cardValue,
      icon: Wallet,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      trend: stats.projected14DayNet > 0 ? "Projected Increase" : "Projected Decrease",
      trendIcon: stats.projected14DayNet > 0 ? ArrowUpRight : ArrowDownRight,
      isExpandable: true,
      isExpanded: isLiquidityExpanded,
      toggle: () => setIsLiquidityExpanded(!isLiquidityExpanded)
    },
    {
      id: "net-flow",
      title: "14-Day Net Flow",
      value: formatCurrency(stats.projected14DayNet),
      icon: stats.projected14DayNet > 0 ? TrendingUp : TrendingDown,
      color: stats.projected14DayNet > 0 ? "text-emerald-600" : "text-rose-600",
      bg: stats.projected14DayNet > 0 ? "bg-emerald-50" : "bg-rose-50",
      trend: `${formatCurrency(stats.totalReceiptsNext14)} In / ${formatCurrency(stats.totalDisbursementsNext14)} Out`,
      trendIcon: null,
      isExpandable: true,
      isExpanded: isNetFlowExpanded,
      toggle: () => setIsNetFlowExpanded(!isNetFlowExpanded)
    },
    {
      id: "payroll",
      title: "Next Major Disbursements",
      value: currentEntity === "Executive" 
        ? (stats.upcomingPayrolls && stats.upcomingPayrolls.length > 0 ? formatCurrency(stats.nextPayrollNet) : "Stable Operations")
        : (stats.nextPayrollAmount > 0 ? formatCurrency(stats.nextPayrollNet) : "No Upcoming Payroll"),
      icon: Calendar,
      color: stats.nextPayrollIsFunded ? "text-emerald-600" : "text-rose-600",
      bg: stats.nextPayrollIsFunded ? "bg-emerald-50" : "bg-rose-50",
      trend: currentEntity === "Executive" 
        ? `Consolidated Net after Payroll` 
        : (stats.nextPayrollAmount > 0 ? `Net after Payroll on ${stats.nextPayrollDate}` : "Current Position Stable"),
      trendIcon: null,
      isExpandable: true,
      isExpanded: isPayrollExpanded,
      toggle: () => setIsPayrollExpanded(!isPayrollExpanded),
      extra: (stats.nextPayrollAmount > 0 || (currentEntity === "Executive" && stats.upcomingPayrolls && stats.upcomingPayrolls.length > 0)) ? (
        <div className="mt-2 pt-2 border-t border-slate-100 flex flex-col gap-1">
          {currentEntity === "Executive" ? (
            <>
              {stats.upcomingPayrolls?.map((p, i) => (
                <div key={i} className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{p.region} Payroll</span>
                  <span className="text-[10px] font-mono font-bold text-slate-600">
                    ({formatCurrency(p.amount)})
                  </span>
                </div>
              ))}
            </>
          ) : (
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Payroll Amount</span>
              <span className="text-[10px] font-mono font-bold text-slate-600">
                ({formatCurrency(stats.nextPayrollAmount)})
              </span>
            </div>
          )}
        </div>
      ) : null
    }
  ];

  if (currentEntity === "Executive" && stats.regionalBurnRates) {
    cards.push({
      id: "burn-rate",
      title: "Regional Cash Burn",
      value: formatCurrency(stats.regionalBurnRates.reduce((acc, r) => acc + r.dailyBurn, 0)),
      icon: Flame,
      color: "text-rose-600",
      bg: "bg-rose-50",
      trend: "Consolidated Daily Burn",
      trendIcon: null,
      isExpandable: true,
      isExpanded: isBurnExpanded,
      toggle: () => setIsBurnExpanded(!isBurnExpanded),
      extra: null
    } as any);
  }

  return (
    <div className={`grid grid-cols-1 ${currentEntity === "Executive" ? "md:grid-cols-2 lg:grid-cols-4" : "md:grid-cols-3"} gap-4 items-start ${isMaximized ? 'md:grid-cols-1 gap-12' : ''}`}>
      {cards.map((card, idx) => (
        <motion.div
          key={card.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.1 }}
          className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden ${card.isExpandable ? 'cursor-pointer hover:border-emerald-200 dark:hover:border-emerald-800 transition-colors' : ''} ${isMaximized ? 'border-none shadow-none' : ''}`}
          onClick={card.toggle}
        >
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className={`p-3 rounded-xl ${card.bg} dark:bg-opacity-10`}>
                <card.icon className={`w-6 h-6 ${card.color}`} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  {card.title}
                </span>
                {card.isExpandable && (
                  card.isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400 dark:text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                )}
              </div>
            </div>
            <div className="flex flex-col">
              <span className="text-3xl font-semibold text-slate-900 dark:text-white mb-1">
                {card.value}
              </span>
              <div className="flex items-center gap-1">
                {card.trendIcon && <card.trendIcon className={`w-4 h-4 ${card.color}`} />}
                <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                  {card.trend}
                </span>
              </div>
              {(card as any).extra}
            </div>
          </div>

          <AnimatePresence>
            {card.isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20"
              >
                <div className="p-6 space-y-3">
                  <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">
                    {card.id === "liquidity" ? "Account Breakdown" : card.id === "payroll" ? "Liquidity Risk Analysis" : card.id === "burn-rate" ? "Regional Heatmap" : "14-Day Composition"}
                  </h4>
                  
                  {card.id === "burn-rate" ? (
                    <div className="space-y-4">
                      {stats.regionalBurnRates?.map((rate, i) => {
                        const regionLiquidity = stats.regionalLiquidityBreakdown?.find(l => l.region === rate.region)?.value || 0;
                        const daysOfLiquidity = rate.dailyBurn > 0 ? Math.floor(regionLiquidity / rate.dailyBurn) : 999;
                        
                        return (
                          <div key={i} className="space-y-2">
                            <div className="flex justify-between items-center">
                              <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-bold text-slate-900 dark:text-white">{rate.region}</span>
                                  {rate.status === 'critical' ? <AlertCircle className="w-3 h-3 text-rose-500" /> :
                                   rate.status === 'warning' ? <TrendingDown className="w-3 h-3 text-amber-500" /> :
                                   <CheckCircle2 className="w-3 h-3 text-emerald-500" />}
                                </div>
                                <span className="text-[10px] text-slate-500 font-medium">{daysOfLiquidity} Days of Liquidity</span>
                              </div>
                              <div className="flex flex-col items-end">
                                <span className={`text-xs font-mono font-bold ${
                                  rate.status === 'critical' ? 'text-rose-600' :
                                  rate.status === 'warning' ? 'text-amber-600' :
                                  'text-emerald-600'
                                }`}>
                                  {formatCurrency(rate.dailyBurn)}/day
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono">Burn Rate</span>
                              </div>
                            </div>
                            <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                              <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.min((rate.dailyBurn / 150000) * 100, 100)}%` }}
                                className={`h-full rounded-full ${
                                  rate.status === 'critical' ? 'bg-rose-500' :
                                  rate.status === 'warning' ? 'bg-amber-500' :
                                  'bg-emerald-500'
                                }`}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : card.id === "payroll" ? (
                    <div className="space-y-3">
                      <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-4 border-b border-slate-100 dark:border-slate-800 pb-2">
                        {currentEntity === "Executive" ? "Regional Liquidity Risks" : "Next Liquidity Risk Event"}
                      </h4>
                      {currentEntity === "Executive" ? (
                        stats.regionalNegativeTransactions && stats.regionalNegativeTransactions.length > 0 ? (
                          stats.regionalNegativeTransactions.map((p, i) => (
                            <div key={i} className="flex justify-between items-center text-sm border-b border-slate-100 dark:border-slate-800 pb-2 last:border-0">
                              <div className="flex flex-col">
                                <span className="font-bold text-slate-900 dark:text-white">{p.region}</span>
                                <span className="text-[10px] text-slate-500 dark:text-slate-400">{p.date}</span>
                              </div>
                              <div className="flex flex-col items-end">
                                <span className="font-bold text-rose-600 dark:text-rose-400 text-xs text-right max-w-[120px] truncate">
                                  {p.label}
                                </span>
                                <div className="flex gap-2">
                                  <span className="text-[10px] font-mono text-rose-600 dark:text-rose-400">
                                    ({formatCurrency(p.amount)})
                                  </span>
                                  <span className="text-[10px] font-mono font-bold text-rose-600 dark:text-rose-400">
                                    {formatCurrency(p.netAmount)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-center py-4 text-emerald-600 dark:text-emerald-400 font-bold text-sm">
                            All Regions In the Black
                          </div>
                        )
                      ) : (
                        stats.nextNegativeTransaction ? (
                          <div className="space-y-3">
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Status</span>
                              <span className="px-2 py-0.5 bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 text-[10px] font-black uppercase rounded tracking-widest">
                                Negative Risk
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-y-3">
                              <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Date</span>
                                <span className="text-sm font-bold text-slate-900 dark:text-white">{stats.nextNegativeTransaction.date}</span>
                              </div>
                              <div className="flex flex-col items-end">
                                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Amount</span>
                                <span className="text-sm font-mono font-bold text-rose-600 dark:text-rose-400">({formatCurrency(stats.nextNegativeTransaction.amount)})</span>
                              </div>
                              <div className="col-span-2 flex flex-col">
                                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Description</span>
                                <span className="text-xs font-bold text-slate-900 dark:text-white line-clamp-1">{stats.nextNegativeTransaction.label}</span>
                              </div>
                              <div className="col-span-2 flex justify-between items-center pt-2 border-t border-slate-100 dark:border-slate-800">
                                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Net Position after Event</span>
                                <span className="text-sm font-mono font-bold text-rose-600 dark:text-rose-400">{formatCurrency(stats.nextNegativeTransaction.netAmount)}</span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-center py-4 text-emerald-600 dark:text-emerald-400 font-bold text-sm">
                            In the Black
                          </div>
                        )
                      )}
                    </div>
                  ) : (
                    (card.id === "liquidity" ? liquidityBreakdown : netFlowBreakdown).map((item, i) => (
                      <div key={i} className="flex justify-between items-center text-sm">
                        <span className="text-slate-600 dark:text-slate-400">{item.label}</span>
                        <div className="flex items-center gap-2">
                          {card.id === "liquidity" && (item as any).editable ? (
                            editingKey === (item as any).key ? (
                              <input 
                                type="number"
                                value={tempBalance}
                                onChange={(e) => setTempBalance(e.target.value)}
                                onBlur={handleBalanceSubmit}
                                onKeyDown={(e) => e.key === 'Enter' && handleBalanceSubmit()}
                                onClick={(e) => e.stopPropagation()}
                                autoFocus
                                className="w-24 px-2 py-1 bg-white dark:bg-slate-800 border border-emerald-500 rounded text-xs font-mono font-bold text-slate-900 dark:text-white outline-none"
                              />
                            ) : (
                              <div 
                                onClick={(e) => { e.stopPropagation(); startEditing((item as any).key, item.value); }}
                                className="flex items-center gap-1.5 cursor-pointer hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                              >
                                <span className="font-mono font-medium text-slate-700 dark:text-slate-300">{formatCurrency(item.value)}</span>
                                <Edit3 className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                              </div>
                            )
                          ) : (
                            <div className="flex items-center gap-3">
                              <span className={`font-mono font-medium ${
                                item.type === 'in' ? 'text-emerald-600 dark:text-emerald-400' : 
                                item.type === 'out' ? 'text-rose-600 dark:text-rose-400' : 
                                'text-slate-700 dark:text-slate-300'
                              }`}>
                                {formatCurrency(item.value)}
                              </span>
                              {!readOnly && currentEntity === "Executive" && card.id === "liquidity" && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setTransferFrom(item.label as Exclude<Entity, "Executive">);
                                    setIsTransferModalOpen(true);
                                  }}
                                  className="px-2 py-0.5 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold uppercase rounded hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors"
                                >
                                  Transfer
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}

                  {card.id === "liquidity" && currentEntity !== "Executive" && (
                    <div className="pt-4 mt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Account Balance</span>
                        <span className="text-sm font-mono font-bold text-slate-900 dark:text-white">
                          {formatCurrency(liquidityBreakdown.reduce((acc, item) => acc + item.value, 0))}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Today's Net Flow</span>
                        <span className={clsx(
                          "text-sm font-mono font-bold",
                          stats.projected14DayNet >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                        )}>
                          {formatCurrency(stats.currentLiquidity - liquidityBreakdown.reduce((acc, item) => acc + item.value, 0))}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center text-sm font-bold">
                    <span className="text-slate-900 dark:text-white">{card.id === "liquidity" ? "Total Book Balance" : "Net Position"}</span>
                    <span className={
                      card.id === "liquidity" 
                        ? 'text-slate-900 dark:text-white' 
                        : (stats.projected14DayNet >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400')
                    }>
                      {card.value}
                    </span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      ))}

      {/* Intercompany Transfer Modal */}
      <AnimatePresence>
        {isTransferModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 dark:bg-slate-950/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Intercompany Fund Transfer</h3>
                <button 
                  onClick={() => setIsTransferModalOpen(false)}
                  className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <ChevronDown className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                </button>
              </div>

              <form onSubmit={handleTransferSubmit} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">From Account</label>
                    <select
                      value={transferFrom}
                      onChange={(e) => setTransferFrom(e.target.value as any)}
                      required
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none dark:text-white"
                    >
                      <option value="">Select Region</option>
                      {regions.map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">To Account</label>
                    <select
                      value={transferTo}
                      onChange={(e) => setTransferTo(e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none dark:text-white"
                    >
                      <option value="">Select Region</option>
                      {regions.filter(r => r !== transferFrom).map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Transfer Amount</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 font-medium">$</span>
                    <input
                      type="number"
                      value={transferAmount}
                      onChange={(e) => setTransferAmount(e.target.value)}
                      placeholder="0.00"
                      required
                      className="w-full pl-8 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-lg font-mono font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                </div>

                <div className="pt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsTransferModalOpen(false)}
                    className="flex-1 px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-3 bg-emerald-500 text-white rounded-xl text-sm font-bold hover:bg-emerald-600 shadow-lg shadow-emerald-500/20 transition-all"
                  >
                    Confirm Transfer
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
