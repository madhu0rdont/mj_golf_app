import type { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

const VARIANTS = {
  primary: 'bg-green-700 text-white hover:bg-green-600 active:bg-green-800',
  secondary: 'bg-gray-800 text-white hover:bg-gray-700 active:bg-gray-900',
  danger: 'bg-red-700 text-white hover:bg-red-600 active:bg-red-800',
  ghost: 'bg-transparent text-gray-400 hover:text-white hover:bg-gray-800',
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
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      disabled={disabled}
      {...props}
    />
  );
}
