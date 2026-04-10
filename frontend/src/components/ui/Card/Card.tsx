import React from 'react';
import styles from './Card.module.css';

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  glass?: boolean;
};

function joinClassNames(parts: Array<string | undefined | false | null>): string {
  return parts.filter(Boolean).join(' ');
}

export default function Card({ className, glass = false, ...props }: CardProps) {
  return <div {...props} className={joinClassNames([styles.card, glass ? styles.glass : '', className])} />;
}
