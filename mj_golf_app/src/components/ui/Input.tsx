import { forwardRef, type InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  suffix?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, suffix, className = '', id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-text-medium">
            {label}
          </label>
        )}
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            className={`w-full rounded-lg border border-border bg-card px-3 py-2 text-text-dark placeholder-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary ${
              error ? 'border-coral' : ''
            } ${suffix ? 'pr-10' : ''} ${className}`}
            {...props}
          />
          {suffix && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-text-muted">
              {suffix}
            </span>
          )}
        </div>
        {error && <span className="text-xs text-coral">{error}</span>}
      </div>
    );
  }
);

Input.displayName = 'Input';
