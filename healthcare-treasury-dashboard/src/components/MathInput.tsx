import React, { useState, useEffect } from "react";
import { evaluateEquation } from "../utils/math";

interface MathInputProps {
  value: number;
  onChange: (val: number) => void;
  className?: string;
  prefix?: string;
  disabled?: boolean;
}

export default function MathInput({ value, onChange, className, prefix, disabled }: MathInputProps) {
  const [displayValue, setDisplayValue] = useState(value.toString());
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (!isEditing) {
      // When not editing, show the formatted number or just the number
      // If the value is 0 and it was just initialized, maybe show empty or 0
      setDisplayValue(value === 0 ? "" : value.toString());
    }
  }, [value, isEditing]);

  const handleBlur = () => {
    const evaluated = evaluateEquation(displayValue);
    onChange(evaluated);
    setDisplayValue(evaluated === 0 ? "" : evaluated.toString());
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
    if (e.key === 'Escape') {
      setDisplayValue(value.toString());
      setIsEditing(false);
    }
  };

  return (
    <div className="relative w-full">
      {prefix && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 text-sm pointer-events-none">
          {prefix}
        </span>
      )}
      <input 
        type="text"
        disabled={disabled}
        value={displayValue}
        onChange={(e) => setDisplayValue(e.target.value)}
        onFocus={() => setIsEditing(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder="0"
        className={`${className} ${prefix ? 'pl-7' : ''}`}
      />
    </div>
  );
}
