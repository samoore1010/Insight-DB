import { useState, useEffect, useCallback } from "react";
import { ChangelogEntry, Entity } from "../types";
import { getChangelog, revertChange } from "../api/treasury";
import {
  Clock,
  Plus,
  Pencil,
  Trash2,
  ArrowRightLeft,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  Filter,
  RefreshCw,
  AlertCircle,
  History,
  DollarSign,
  Repeat,
  Wallet
} from "lucide-react";
import { clsx } from "clsx";
import { motion, AnimatePresence } from "motion/react";

interface Props {
  currentEntity: Entity;
  onDataReverted: () => void;
}

const ACTION_CONFIG: Record<string, { icon: typeof Plus; color: string; bgColor: string }> = {
  create: { icon: Plus, color: "text-emerald-600 dark:text-emerald-400", bgColor: "bg-emerald-100 dark:bg-emerald-900/30" },
  update: { icon: Pencil, color: "text-blue-600 dark:text-blue-400", bgColor: "bg-blue-100 dark:bg-blue-900/30" },
  delete: { icon: Trash2, color: "text-rose-600 dark:text-rose-400", bgColor: "bg-rose-100 dark:bg-rose-900/30" },
  move: { icon: ArrowRightLeft, color: "text-amber-600 dark:text-amber-400", bgColor: "bg-amber-100 dark:bg-amber-900/30" },
  revert: { icon: RotateCcw, color: "text-indigo-600 dark:text-indigo-400", bgColor: "bg-indigo-100 dark:bg-indigo-900/30" },
};

const TYPE_CONFIG: Record<string, { icon: typeof DollarSign; label: string }> = {
  disbursement: { icon: DollarSign, label: "Disbursement" },
  estimate: { icon: Repeat, label: "Recurring Estimate" },
  balance: { icon: Wallet, label: "Balance" },
};

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr + "Z"); // SQLite timestamps are UTC
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: diffDays > 365 ? "numeric" : undefined });
}

function groupByDate(entries: ChangelogEntry[]): { label: string; entries: ChangelogEntry[] }[] {
  const groups: Map<string, ChangelogEntry[]> = new Map();
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();

  for (const entry of entries) {
    const date = new Date(entry.createdAt + "Z");
    const dateStr = date.toDateString();
    let label: string;
    if (dateStr === today) label = "Today";
    else if (dateStr === yesterday) label = "Yesterday";
    else label = date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(entry);
  }

  return Array.from(groups.entries()).map(([label, entries]) => ({ label, entries }));
}

export default function ChangeHistory({ currentEntity, onDataReverted }: Props) {
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [regionFilter, setRegionFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [revertingId, setRevertingId] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 30;

  const fetchEntries = useCallback(async (append = false) => {
    setLoading(true);
    try {
      const offset = append ? entries.length : 0;
      const result = await getChangelog({
        region: regionFilter !== "all" ? regionFilter : undefined,
        entityType: typeFilter !== "all" ? typeFilter : undefined,
        limit: PAGE_SIZE,
        offset,
      });
      setEntries(prev => append ? [...prev, ...result.entries] : result.entries);
      setTotal(result.total);
    } catch (error) {
      console.error("Failed to fetch changelog:", error);
    } finally {
      setLoading(false);
    }
  }, [regionFilter, typeFilter]);

  useEffect(() => {
    setPage(0);
    fetchEntries();
  }, [regionFilter, typeFilter, fetchEntries]);

  const handleRevert = async (entry: ChangelogEntry) => {
    if (!entry.snapshot && entry.action !== "create") {
      alert("This change cannot be reverted — no snapshot available.");
      return;
    }

    const confirmed = window.confirm(
      `Revert this change?\n\n${entry.summary}\n\nThis will undo this specific change and add a revert entry to the changelog.`
    );
    if (!confirmed) return;

    setRevertingId(entry.id);
    try {
      await revertChange(entry.id);
      await fetchEntries();
      onDataReverted();
    } catch (error: any) {
      alert(`Failed to revert: ${error.message || "Unknown error"}`);
    } finally {
      setRevertingId(null);
    }
  };

  const toggleExpanded = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const grouped = groupByDate(entries);
  const hasMore = entries.length < total;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl text-indigo-600 dark:text-indigo-400">
            <History className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Change History</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Track and revert changes to disbursements, estimates, and balances
            </p>
          </div>
        </div>
        <button
          onClick={() => fetchEntries()}
          className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all"
        >
          <RefreshCw className={clsx("w-4 h-4", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Filters</span>
        </div>
        <select
          value={regionFilter}
          onChange={e => setRegionFilter(e.target.value)}
          className="px-3 py-1.5 text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        >
          <option value="all">All Regions</option>
          <option value="Flint">Flint</option>
          <option value="ISH">ISH</option>
          <option value="Coldwater">Coldwater</option>
          <option value="Chicago">Chicago</option>
        </select>
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="px-3 py-1.5 text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        >
          <option value="all">All Types</option>
          <option value="disbursement">Disbursements</option>
          <option value="estimate">Recurring Estimates</option>
          <option value="balance">Balances</option>
        </select>
        {total > 0 && (
          <span className="text-xs text-slate-400 dark:text-slate-500">
            {total} {total === 1 ? "change" : "changes"} found
          </span>
        )}
      </div>

      {/* Empty State */}
      {!loading && entries.length === 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-12 text-center">
          <div className="max-w-xs mx-auto">
            <div className="w-14 h-14 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <Clock className="w-7 h-7 text-slate-400 dark:text-slate-500" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">No Changes Yet</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Changes to disbursements, recurring estimates, and balances will appear here as you make edits across regional dashboards.
            </p>
          </div>
        </div>
      )}

      {/* Timeline */}
      {grouped.map(group => (
        <div key={group.label}>
          <div className="flex items-center gap-3 mb-3">
            <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">{group.label}</h3>
            <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
          </div>

          <div className="space-y-2">
            {group.entries.map(entry => {
              const actionCfg = ACTION_CONFIG[entry.action] || ACTION_CONFIG.update;
              const typeCfg = TYPE_CONFIG[entry.entityType] || TYPE_CONFIG.disbursement;
              const Icon = actionCfg.icon;
              const isExpanded = expandedIds.has(entry.id);
              const isReverting = revertingId === entry.id;
              const canRevert = entry.action !== "revert" && (entry.snapshot || entry.action === "create");

              return (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden"
                >
                  <div
                    className="flex items-start gap-3 p-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    onClick={() => entry.diff && toggleExpanded(entry.id)}
                  >
                    {/* Action icon */}
                    <div className={clsx("p-2 rounded-lg flex-shrink-0 mt-0.5", actionCfg.bgColor)}>
                      <Icon className={clsx("w-4 h-4", actionCfg.color)} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-white leading-snug">
                        {entry.summary}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 mt-1.5">
                        <span className={clsx(
                          "px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md",
                          entry.region === "Flint" ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400" :
                          entry.region === "ISH" ? "bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400" :
                          entry.region === "Coldwater" ? "bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 dark:text-cyan-400" :
                          "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400"
                        )}>
                          {entry.region}
                        </span>
                        <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 flex items-center gap-1">
                          <typeCfg.icon className="w-3 h-3" />
                          {typeCfg.label}
                        </span>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500">
                          {formatRelativeTime(entry.createdAt)}
                        </span>
                      </div>
                    </div>

                    {/* Right side: expand + revert */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {canRevert && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRevert(entry); }}
                          disabled={isReverting}
                          className={clsx(
                            "px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all",
                            isReverting
                              ? "bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed"
                              : "text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                          )}
                        >
                          {isReverting ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <span className="flex items-center gap-1">
                              <RotateCcw className="w-3 h-3" />
                              Revert
                            </span>
                          )}
                        </button>
                      )}
                      {entry.diff && (
                        <ChevronRight className={clsx(
                          "w-4 h-4 text-slate-400 transition-transform",
                          isExpanded && "rotate-90"
                        )} />
                      )}
                    </div>
                  </div>

                  {/* Expanded diff view */}
                  <AnimatePresence>
                    {isExpanded && entry.diff && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-4 pt-0">
                          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 space-y-2">
                            <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">
                              Field Changes
                            </div>
                            {Object.entries(entry.diff).map(([field, vals]) => (
                              <div key={field} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-xs">
                                <span className="font-medium text-slate-500 dark:text-slate-400 min-w-[100px] capitalize">
                                  {field.replace(/([A-Z])/g, " $1").replace(/_/g, " ").trim()}
                                </span>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="px-2 py-0.5 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 rounded font-mono text-[11px] line-through">
                                    {formatDiffValue(field, vals.old)}
                                  </span>
                                  <span className="text-slate-400">→</span>
                                  <span className="px-2 py-0.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded font-mono text-[11px]">
                                    {formatDiffValue(field, vals.new)}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Load More */}
      {hasMore && (
        <div className="text-center pt-2">
          <button
            onClick={() => { setPage(p => p + 1); fetchEntries(true); }}
            disabled={loading}
            className="px-6 py-2.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-all"
          >
            {loading ? "Loading..." : `Load More (${total - entries.length} remaining)`}
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && entries.length === 0 && (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 animate-pulse">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-slate-200 dark:bg-slate-700 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
                  <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-1/3" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatDiffValue(field: string, value: any): string {
  if (value === null || value === undefined) return "—";
  if (field === "amount" || field === "baseAmount" || field === "base_amount") {
    return `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (field === "adjustment") {
    return `${(Number(value) * 100).toFixed(0)}%`;
  }
  return String(value);
}
