import React from "react";

type CoachDashboardCardVariant = "hero" | "primary" | "secondary";

const cardStyles: Record<CoachDashboardCardVariant, React.CSSProperties> = {
  hero: {
    padding: 16,
    borderRadius: 14,
    borderColor: "color-mix(in srgb, var(--accent) 26%, var(--line))",
    boxShadow: "0 6px 18px rgba(16,24,40,0.08)",
  },
  primary: {
    padding: 14,
    borderRadius: 14,
  },
  secondary: {
    padding: 12,
    borderRadius: 14,
  },
};

export function CoachDashboardCard({
  children,
  testId,
  variant = "secondary",
}: {
  children: React.ReactNode;
  testId: string;
  variant?: CoachDashboardCardVariant;
}) {
  return (
    <section className="card" data-testid={testId} style={cardStyles[variant]}>
      {children}
    </section>
  );
}
