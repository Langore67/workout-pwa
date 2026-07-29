import React from "react";

export function CoachCardHeader({ title, level = 3 }: { title: string; level?: 2 | 3 }) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <Heading style={{ fontWeight: 850, margin: "0 0 10px 0", fontSize: level === 2 ? 20 : 16, lineHeight: 1.2 }}>
      {title}
    </Heading>
  );
}
