import React, { useState } from "react";
import { MessageSquare, Paperclip, FileText, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { Attachment } from "../types";
import { motion, AnimatePresence } from "motion/react";

interface Props {
  comments?: string;
  attachments?: Attachment[];
  onUpdate: (updates: { comments?: string; attachments?: Attachment[] }) => void;
  disabled?: boolean;
}

export default function CommentsAttachments({ comments = "", attachments = [], onUpdate, disabled }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleAddAttachment = () => {
    const newAttachment: Attachment = {
      id: `att-${Date.now()}`,
      name: `Document_${attachments.length + 1}.pdf`,
      url: "#",
      type: "application/pdf",
      size: "1.2 MB"
    };
    onUpdate({ attachments: [...attachments, newAttachment] });
    setIsExpanded(true);
  };

  const handleRemoveAttachment = (id: string) => {
    onUpdate({ attachments: attachments.filter(a => a.id !== id) });
  };

  const hasContent = comments || attachments.length > 0;

  return (
    <div className="mt-2 pt-2 border-t border-slate-100/50 dark:border-slate-800/50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className={`flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.1em] transition-colors ${
              isExpanded || hasContent ? "text-emerald-600" : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
            }`}
          >
            <MessageSquare className="w-3 h-3" />
            {comments ? "View Notes" : "Add Note"}
            {hasContent && (
              <span className="ml-1 px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 rounded-full text-[8px]">
                {attachments.length + (comments ? 1 : 0)}
              </span>
            )}
            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {!isExpanded && !disabled && (
            <button
              type="button"
              onClick={handleAddAttachment}
              className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.1em] text-slate-400 dark:text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
            >
              <Paperclip className="w-3 h-3" />
              Attach
            </button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-3 pt-3 pb-1">
              <div className="space-y-1">
                <label className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Internal Comments</label>
                <textarea
                  disabled={disabled}
                  value={comments}
                  onChange={(e) => onUpdate({ comments: e.target.value })}
                  placeholder="Add internal notes or justifications..."
                  className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-[11px] text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all min-h-[60px] resize-none"
                />
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Attachments</label>
                  {!disabled && (
                    <button
                      type="button"
                      onClick={handleAddAttachment}
                      className="text-[8px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest hover:text-emerald-700 dark:hover:text-emerald-300"
                    >
                      + Add File
                    </button>
                  )}
                </div>
                {attachments.length > 0 ? (
                  <div className="grid grid-cols-1 gap-1.5">
                    {attachments.map((att) => (
                      <div key={att.id} className="flex items-center justify-between p-2 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-lg group shadow-sm">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <div className="w-6 h-6 bg-slate-50 dark:bg-slate-900 rounded flex items-center justify-center flex-shrink-0">
                            <FileText className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                          </div>
                          <div className="flex flex-col overflow-hidden">
                            <span className="text-[10px] font-bold text-slate-700 dark:text-slate-200 truncate">{att.name}</span>
                            <span className="text-[8px] text-slate-400 dark:text-slate-500 font-mono">{att.size}</span>
                          </div>
                        </div>
                        {!disabled && (
                          <button
                            type="button"
                            onClick={() => handleRemoveAttachment(att.id)}
                            className="p-1 text-slate-300 hover:text-rose-500 transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[9px] text-slate-400 dark:text-slate-500 italic">No documents attached.</p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
