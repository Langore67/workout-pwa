// src/App.tsx
/* ============================================================================
   App.tsx — Routes + Safety Error Boundary
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-02-25-APP-ROUTES-05

   Changes (APP-ROUTES-05)
   ✅ Add StrengthPage route (/strength) + nav link
   ✅ Keep BodyPage route (/body)
   ✅ Keep single ErrorBoundary wrapping Routes (prevents blank screens)
   ✅ Keep USE_NEW_GYM_PAGE switch
   ============================================================================ */

import React from "react";
import { NavLink, Route, Routes, Navigate } from "react-router-dom";
import StartPage from "./pages/StartPage";
import TemplatesPage from "./pages/TemplatesPage";
import ExercisesPage from "./pages/ExercisesPage";
import BodyPage from "./pages/BodyPage";
import StrengthPage from "./pages/StrengthPage";
import GymPage from "./pages/GymPage";
import GymPageLegacy from "./pages/GymPageLegacy";
import WalksPage from "./pages/WalksPage";
import HistoryPage from "./pages/HistoryPage";
import ExportPage from "./pages/ExportPage";
import SessionCompletePage from "./pages/SessionCompletePage";
import SessionDetailPage from "./pages/SessionDetailPage";
import DevDiagnosticsPage from "./pages/DevDiagnosticsPage";
import ImportCsvPage from "./pages/ImportCsvPage";

// Flip this to false at any time to instantly restore baseline behavior.
const USE_NEW_GYM_PAGE = true;

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message?: string }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, message: undefined };
  }

  static getDerivedStateFromError(err: any) {
    return { hasError: true, message: String(err?.message ?? err) };
  }

  componentDidCatch(err: any, info: any) {
    // Keep console signal for dev
    // eslint-disable-next-line no-console
    console.error("AppErrorBoundary caught:", err, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="card" style={{ maxWidth: 820, margin: "0 auto" }}>
        <h2 style={{ marginTop: 0 }}>Something went wrong</h2>
        <p className="muted" style={{ marginTop: 6 }}>
          The app hit an unexpected error and couldn’t render this screen.
        </p>

        {this.state.message && (
          <div className="input" style={{ marginTop: 10, whiteSpace: "pre-wrap" }}>
            {this.state.message}
          </div>
        )}

        <div className="row" style={{ gap: 10, marginTop: 14, flexWrap: "wrap" }}>
          <button className="btn" onClick={() => (window.location.href = "/history")}>
            Back to history
          </button>
          <button className="btn" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    );
  }
}

export default function App() {
  return (
    <>
      <div className="nav">
        <div className="nav-inner">
          <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
            Start
          </NavLink>

          <NavLink to="/templates" className={({ isActive }) => (isActive ? "active" : "")}>
            Templates
          </NavLink>

          <NavLink to="/exercises" className={({ isActive }) => (isActive ? "active" : "")}>
            Exercises
          </NavLink>

          <NavLink to="/strength" className={({ isActive }) => (isActive ? "active" : "")}>
            Strength
          </NavLink>

          <NavLink to="/body" className={({ isActive }) => (isActive ? "active" : "")}>
            Body
          </NavLink>

          <NavLink to="/walks" className={({ isActive }) => (isActive ? "active" : "")}>
            Walks
          </NavLink>

          <NavLink to="/history" className={({ isActive }) => (isActive ? "active" : "")}>
            History
          </NavLink>
          
          {import.meta.env.DEV && (
	              <NavLink to="/dev" className={({ isActive }) => (isActive ? "active" : "")}>
	                Dev
	              </NavLink>
          )}       

          <NavLink to="/export" className={({ isActive }) => (isActive ? "active" : "")}>
            Export
          </NavLink>
        </div>
      </div>

      <div className="container">
        <AppErrorBoundary>
          <Routes>
            {/* Start (canonical) */}
            <Route path="/" element={<StartPage />} />

            {/* Alias: /start -> / */}
            <Route path="/start" element={<Navigate to="/" replace />} />

            <Route path="/templates" element={<TemplatesPage />} />
            <Route path="/exercises" element={<ExercisesPage />} />

            {/* NEW: Strength */}
            <Route path="/strength" element={<StrengthPage />} />

            {/* Body */}
            <Route path="/body" element={<BodyPage />} />

            {/* Gym */}
            <Route path="/gym/:sessionId" element={USE_NEW_GYM_PAGE ? <GymPage /> : <GymPageLegacy />} />
            <Route path="/gym-legacy/:sessionId" element={<GymPageLegacy />} />

            <Route path="/walks" element={<WalksPage />} />
	    <Route path="/history" element={<HistoryPage />} />
	    <Route path="/import" element={<ImportCsvPage />} />
            <Route path="/export" element={<ExportPage />} />

            {/* Session pipeline */}
            <Route path="/complete/:sessionId" element={<SessionCompletePage />} />
            <Route path="/session/:sessionId" element={<SessionDetailPage />} />

	   {/* DEV Diagnostics (dev-only; page redirects to / in prod) */}
           <Route path="/dev" element={<DevDiagnosticsPage />} />

            {/* Safety net */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppErrorBoundary>
      </div>
    </>
  );
}

/* ============================================================================
   End of file: src/App.tsx
   ============================================================================ */