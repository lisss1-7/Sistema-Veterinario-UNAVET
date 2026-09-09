import type { ReactNode } from 'react';

type InformationCardTone =
  | 'primary'
  | 'secondary'
  | 'accent'
  | 'earth'
  | 'destructive';

const toneStyles: Record<
  InformationCardTone,
  { card: string; icon: string }
> = {
  primary: {
    card: 'border-primary/35 bg-primary/10',
    icon: 'bg-primary text-primary-foreground shadow-sm',
  },
  secondary: {
    card: 'border-secondary/50 bg-secondary/20',
    icon: 'bg-secondary text-secondary-foreground shadow-sm',
  },
  accent: {
    card: 'border-accent/40 bg-accent/10',
    icon: 'bg-accent text-accent-foreground shadow-sm',
  },
  earth: {
    card: 'border-chart-4/35 bg-chart-4/10',
    icon: 'bg-chart-4 text-white shadow-sm',
  },
  destructive: {
    card: 'border-destructive/35 bg-destructive/10',
    icon: 'bg-destructive text-destructive-foreground shadow-sm',
  },
};

export default function InformationCard({
  label,
  value,
  icon,
  tone,
  compact = false,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  tone: InformationCardTone;
  compact?: boolean;
}) {
  const styles = toneStyles[tone];

  return (
    <article
      className={`flex items-center rounded-2xl border shadow-md transition-colors ${compact ? 'gap-[0.6875rem] px-[0.825rem] py-[0.6875rem]' : 'gap-4 p-4'} ${styles.card}`}
    >
      <div
        className={`flex shrink-0 items-center justify-center rounded-xl ${compact ? 'h-[2.475rem] w-[2.475rem] [&>svg]:h-[1.1rem] [&>svg]:w-[1.1rem]' : 'h-12 w-12'} ${styles.icon}`}
      >
        {icon}
      </div>

      <div className="min-w-0">
        <p className={`${compact ? 'text-[0.825rem] leading-snug' : 'text-sm'} text-muted-foreground`}>{label}</p>
        <p className={`${compact ? 'text-[1.2375rem] leading-tight' : 'text-2xl'} font-bold text-foreground`}>{value}</p>
      </div>
    </article>
  );
}
