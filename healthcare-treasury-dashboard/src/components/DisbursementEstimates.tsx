import { motion } from "motion/react";
import { TrendingDown, Plus, Trash2, Calendar, Save, MessageSquare, Paperclip } from "lucide-react";
import { EstimateCategory, CyclePeriod, Attachment } from "../types";
import { useState, useEffect } from "react";
import CommentsAttachments from "./CommentsAttachments";
import MathInput from "./MathInput";
import { formatCurrency as centralizedFormatCurrency } from "../utils/formatters";

interface DisbursementEstimatesProps {
  title?: string;
  categories: EstimateCategory[];
  onCategoriesChange: (categories: EstimateCategory[]) => void;
  isMaximized?: boolean;
  currency?: string;
}

const PERIODS: CyclePeriod[] = ["Daily", "Weekly", "Bi-Weekly", "Monthly", "One-Time"];

export default function DisbursementEstimates({ 
  title, 
  categories, 
  onCategoriesChange, 
  isMaximized = false,
  currency = 'USD'
}: DisbursementEstimatesProps) {
  const [localCategories, setLocalCategories] = useState<EstimateCategory[]>(categories);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setLocalCategories(categories);
    setHasChanges(false);
  }, [categories]);

  const formatCurrency = (val: number) => centralizedFormatCurrency(val, currency, true);

  const handleUpdate = (id: string, updates: Partial<EstimateCategory>) => {
    setLocalCategories(prev => prev.map(cat => cat.id === id ? { ...cat, ...updates } : cat));
    setHasChanges(true);
  };

  const handleAdd = () => {
    const newCat: EstimateCategory = {
      id: `cat-${Date.now()}`,
      label: "New Expense",
      baseAmount: 0,
      adjustment: 0,
      period: "Monthly",
      startDate: new Date().toISOString().split('T')[0]
    };
    setLocalCategories([...localCategories, newCat]);
    setHasChanges(true);
  };

  const handleDelete = (id: string) => {
    setLocalCategories(localCategories.filter(cat => cat.id !== id));
    setHasChanges(true);
  };

  const handleApply = () => {
    onCategoriesChange(localCategories);
    setHasChanges(false);
  };

  return (
    <div className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden ${isMaximized ? 'border-none shadow-none' : ''}`}>
      <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-rose-50 dark:bg-rose-900/30 rounded-lg">
            <TrendingDown className="w-5 h-5 text-rose-600 dark:text-rose-400" />
          </div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">{title || "Forecast Adjustments"}</h3>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <button 
              onClick={handleApply}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition-colors shadow-sm"
            >
              <Save className="w-3.5 h-3.5" />
              Update Estimates
            </button>
          )}
          <button 
            onClick={handleAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 rounded-lg text-xs font-bold hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Item
          </button>
        </div>
      </div>
      
      <div className={`p-6 ${isMaximized ? 'grid grid-cols-2 gap-x-12 gap-y-10 space-y-0' : 'space-y-10'}`}>
        {localCategories.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-slate-400 dark:text-slate-500 italic">No adjustment items defined.</p>
          </div>
        ) : (
          localCategories.map((cat) => (
            <div key={cat.id} className="space-y-4 group relative">
              <div className="flex justify-between items-start gap-4">
                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-2">
                    <input 
                      type="text"
                      value={cat.label}
                      onChange={(e) => handleUpdate(cat.id, { label: e.target.value })}
                      className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest bg-transparent border-b border-transparent hover:border-slate-200 dark:hover:border-slate-700 focus:border-emerald-500 focus:outline-none transition-all w-full"
                    />
                    <button 
                      onClick={() => handleDelete(cat.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 dark:text-slate-600 hover:text-rose-500 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Base Amount</span>
                      <MathInput 
                        value={cat.baseAmount}
                        onChange={(val) => handleUpdate(cat.id, { baseAmount: val })}
                        prefix="$"
                        className="w-full pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-mono font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Cycle Period</span>
                      <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 w-3.5 h-3.5" />
                        <select 
                          value={cat.period}
                          onChange={(e) => handleUpdate(cat.id, { period: e.target.value as CyclePeriod })}
                          className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-bold text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-emerald-500 outline-none transition-all appearance-none cursor-pointer"
                        >
                          {PERIODS.map(p => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Start Date</span>
                      <div className="relative">
                        <input 
                          type="date"
                          value={cat.startDate}
                          onChange={(e) => handleUpdate(cat.id, { startDate: e.target.value })}
                          className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-[11px] font-bold text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-emerald-500 outline-none transition-all cursor-pointer"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">End Date</span>
                      <div className="relative">
                        <select 
                          value={cat.endDate || ""}
                          onChange={(e) => handleUpdate(cat.id, { endDate: e.target.value || undefined })}
                          className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-[11px] font-bold text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-emerald-500 outline-none transition-all cursor-pointer appearance-none"
                        >
                          <option value="">Indefinite</option>
                          <option value="custom" disabled>Choose Date...</option>
                        </select>
                        <input 
                          type="date"
                          value={cat.endDate || ""}
                          onChange={(e) => handleUpdate(cat.id, { endDate: e.target.value })}
                          className="absolute inset-0 opacity-0 cursor-pointer"
                        />
                        {!cat.endDate && (
                          <div className="absolute inset-0 flex items-center px-3 pointer-events-none text-[11px] font-bold text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
                            Indefinite
                          </div>
                        )}
                        {cat.endDate && (
                          <div className="absolute inset-0 flex items-center px-3 pointer-events-none text-[11px] font-bold text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
                            {cat.endDate}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="text-right pt-6">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1">Total Projected</span>
                  <span className="text-sm font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(cat.baseAmount * (1 + cat.adjustment))}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Adjustment Buffer</span>
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-1.5 py-0.5 rounded">
                    +{(cat.adjustment * 100).toFixed(0)}%
                  </span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="0.25" 
                  step="0.01" 
                  value={cat.adjustment}
                  onChange={(e) => handleUpdate(cat.id, { adjustment: parseFloat(e.target.value) })}
                  className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
              </div>

              <CommentsAttachments 
                comments={cat.comments}
                attachments={cat.attachments}
                onUpdate={(updates) => handleUpdate(cat.id, updates)}
              />
            </div>
          ))
        )}
      </div>
      
      <div className="bg-slate-50 dark:bg-slate-800/50 px-6 py-3 border-t border-slate-100 dark:border-slate-800">
        <p className="text-[10px] text-slate-400 dark:text-slate-500 italic leading-tight">
          * Base amount is per occurrence. Daily items only apply on business days (Mon-Fri, excluding bank holidays).
        </p>
      </div>
    </div>
  );
}
