import { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'outline-secondary' | 'outline-danger' | 'outline-primary';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface LoadingButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  loadingText?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function LoadingButton({
  loading = false,
  loadingText,
  variant = 'primary',
  size,
  children,
  disabled,
  className = '',
  ...props
}: LoadingButtonProps) {
  const sizeClass = size ? `btn-${size}` : '';
  const variantClass = `btn-${variant}`;
  const classes = ['btn', variantClass, sizeClass, className].filter(Boolean).join(' ');

  return (
    <button
      className={classes}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <>
          <span className="spinner-border spinner-border-sm me-2"></span>
          {loadingText || children}
        </>
      ) : (
        children
      )}
    </button>
  );
}
