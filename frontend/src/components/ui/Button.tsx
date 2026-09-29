import type { ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
  variant?: 'primary' | 'secondary';
}

export function Button({ 
  children, 
  isLoading, 
  variant = 'primary', 
  className = '', 
  disabled, 
  ...props 
}: ButtonProps) {
  const baseClasses = "relative inline-flex items-center justify-center px-8 py-3 font-mono font-medium overflow-hidden transition-all uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed";
  
  const variants = {
    primary: "text-navy-900 bg-cyan-400 hover:bg-cyan-300 shadow-[0_0_15px_rgba(0,240,255,0.3)] hover:shadow-[0_0_25px_rgba(0,240,255,0.5)] border border-transparent",
    secondary: "bg-transparent text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10"
  };

  return (
    <button 
      className={`${baseClasses} ${variants[variant]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && (
        <Loader2 className="w-5 h-5 mr-3 animate-spin" />
      )}
      <span className="relative flex items-center">
        {children}
      </span>
    </button>
  );
}
