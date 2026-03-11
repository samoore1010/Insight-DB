import React, { useState, useEffect } from "react";
import { Maximize2, Minimize2, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface Props {
  children: React.ReactNode;
  title: string;
  className?: string;
}

export default function MaximizeWrapper({ children, title, className = "" }: Props) {
  const [isMaximized, setIsMaximized] = useState(false);

  // Prevent scrolling when maximized
  useEffect(() => {
    if (isMaximized) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isMaximized]);

  return (
    <>
      <div className={`relative group ${className}`}>
        <div className="absolute top-3 right-3 z-20 opacity-0 group-hover:opacity-100 transition-all">
          <button
            onClick={() => setIsMaximized(true)}
            className="p-2 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm border border-slate-200 dark:border-slate-800 shadow-sm hover:bg-emerald-50 dark:hover:bg-emerald-900/40 hover:border-emerald-200 dark:hover:border-emerald-800 text-slate-400 dark:text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 rounded-xl transition-all"
            title="Maximize View"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>

      <AnimatePresence>
        {isMaximized && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-slate-900 w-full h-full max-w-[1600px] rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">{title}</h3>
                <button
                   onClick={() => setIsMaximized(false)}
                   className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 rounded-xl transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="flex-1 overflow-auto p-8 bg-slate-50/30 dark:bg-slate-950/30">
                <div className="h-full w-full">
                  {React.isValidElement(children) 
                    ? React.cloneElement(children as React.ReactElement<any>, { isMaximized: true })
                    : children}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
