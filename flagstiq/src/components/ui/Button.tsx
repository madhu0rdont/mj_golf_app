import type { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

const VARIANTS = {
  primary: 'bg-forest text-linen hover:bg-turf active:bg-forest shadow-sm',
  secondary: 'border border-turf text-turf bg-transparent hover:bg-primary-pale active:bg-primary-pale',
  danger: 'bg-coral text-white hover:bg-coral/90 active:bg-coral',
  ghost: 'border border-card-border text-ink-light font-mono text-[10px] tracking-[0.15em] uppercase',
};

const SIZES = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-sm font-normal tracking-[0.05em] transition-colors disabled:opacity-50 disabled:pointer-events-none ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      disabled={disabled}
      {...props}
    />
  );
}
