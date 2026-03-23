import React from "react";
import { BUILD_INFO } from "../buildInfo";


export function Page({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="page">
      <div className="page-header">
        <div style={{ minWidth: 0 }}>
          <h1 className="page-title">{title}</h1>
          {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
        </div>
        {right ? <div className="page-header-right">{right}</div> : null}
      </div>
  
      <div className="page-body">{children}</div>
    </div>
);
}

export function Section({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="card section">
      <div className="section-head">
        <div style={{ minWidth: 0 }}>
          <h2 className="section-title">{title}</h2>
          {subtitle ? <div className="section-subtitle">{subtitle}</div> : null}
        </div>
        {right ? <div className="section-right">{right}</div> : null}
      </div>

      <div className="section-body">{children}</div>
    </div>
  );
}
