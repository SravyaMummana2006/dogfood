import { forwardRef, type InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', ...props }, ref) => {
    return (
      <div className="w-full">
        <label className="block text-xs font-mono text-cyan-400 mb-2 uppercase tracking-widest">
          {label}
        </label>
        <input
          ref={ref}
          className={`w-full bg-navy-900/50 border ${
            error ? 'border-pink-500 focus:border-pink-500' : 'border-cyan-400/30 focus:border-cyan-400'
          } rounded-none px-4 py-3 text-white font-sans placeholder-gray-500 focus:outline-none focus:ring-1 ${
            error ? 'focus:ring-pink-500' : 'focus:ring-cyan-400'
          } transition-colors ${className}`}
          {...props}
        />
        {error && (
          <p className="mt-2 text-xs font-mono text-pink-500 tracking-wide">
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
