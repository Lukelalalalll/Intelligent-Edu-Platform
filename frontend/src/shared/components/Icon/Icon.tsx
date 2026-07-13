interface IconProps {
  name: string;
  className?: string;
  ariaLabel?: string;
}

export function Icon({ name, className, ariaLabel }: IconProps) {
  return <i className={`${name} ${className ?? ''}`} aria-label={ariaLabel} />;
}
