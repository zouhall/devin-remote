/**
 * Devin-style mark: two hexagons joined at a vertex (the "bowtie").
 * Drawn with currentColor so it inherits text color in any theme.
 */
export function DevinMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={(size * 24) / 40}
      viewBox="0 0 40 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M1 12 L6.5 3.2 L14.5 3.2 L20 12 L14.5 20.8 L6.5 20.8 Z" />
      <path d="M20 12 L25.5 3.2 L33.5 3.2 L39 12 L33.5 20.8 L25.5 20.8 Z" />
    </svg>
  );
}

export function DevinLogo({
  size = 24,
  withWordmark = true,
  className,
  wordmarkClassName,
}: {
  size?: number;
  withWordmark?: boolean;
  className?: string;
  wordmarkClassName?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <DevinMark size={size} />
      {withWordmark && (
        <span className={`font-semibold tracking-[-0.02em] ${wordmarkClassName ?? ""}`}>
          Devin<span className="text-muted-foreground font-medium"> Remote</span>
        </span>
      )}
    </span>
  );
}
