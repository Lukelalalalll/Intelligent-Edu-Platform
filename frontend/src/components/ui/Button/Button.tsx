import React from 'react';
import styles from './Button.module.css';

type ButtonVariant = 'primary' | 'outline' | 'ghost';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

function joinClassNames(parts: Array<string | undefined | false | null>): string {
  return parts.filter(Boolean).join(' ');
}

export default function Button({ variant = 'primary', className, ...props }: ButtonProps) {
  return <button {...props} className={joinClassNames([styles.btn, styles[variant], className])} />;
}
