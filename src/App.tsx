// src/App.tsx
/* ============================================================================
   App.tsx — Routes + Safety Error Boundary + Top Nav "More" menu
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-03-08-APP-ROUTES-07
   FILE: src/App.tsx

   Changes (APP-ROUTES-07)
   ✅ Add breadcrumb structure throughout file
   ✅ Replace top-nav Export / Help / Dev with single More menu
   ✅ Keep Start / Templates / Exercises / History / Progress in primary ribbon
   ✅ Group Export / Help / Dev under More
   ✅ Keep DEV Diagnostics route
   ✅ Keep single ErrorBoundary wrapping Routes
   ✅ Keep USE_NEW_GYM_PAGE switch
   ✅ Keep all existing routes intact
   ============================================================================ */

import React, { useEffect, useRef, useState } from "react";
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
import HelpPage from "./pages/HelpPage";
import LogsPage from "./pages/LogsPage";
import ProgressPage from "./pages/ProgressPage";
import MpsPage from "./pages/MpsPage";
import PasteWorkoutPage from "./pages/PasteWorkoutPage";
import PerformanceDashboardPage from "./pages/PerformanceDashboardPage";

/* ============================================================================
   Breadcrumb 1 — Runtime switches
   ============================================================================ */

// Flip this to false at any time to instantly restore baseline behavior.
const USE_NEW_GYM_PAGE = true;

/* ============================================================================
   Breadcrumb 2 — Error boundary
   ============================================================================ */

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

/* ============================================================================
   Breadcrumb 3 — Top nav with More menu
   ----------------------------------------------------------------------------
   Primary ribbon:
   - Start
   - Templates
   - Exercises
   - History
   - Progress
   - More

   More menu:
   - Export
   - Help
   - Dev (dev only)
   ============================================================================ */

function TopNav() {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!moreRef.current) return;
      if (!moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }

    function onDocKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMoreOpen(false);
    }

    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onDocKeyDown);

    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onDocKeyDown);
    };
  }, []);

  const closeMore = () => setMoreOpen(false);

  return (
    <div className="nav" style={{ position: "relative", zIndex: 2000, overflow: "visible" }}>
      <div
        className="nav-inner"
        style={{ position: "relative", overflow: "visible", zIndex: 2001 }}
      >
        <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
          Start
        </NavLink>

        <NavLink to="/exercises" className={({ isActive }) => (isActive ? "active" : "")}>
          Exercises
        </NavLink>

        <NavLink to="/history" className={({ isActive }) => (isActive ? "active" : "")}>
          History
        </NavLink>

        <NavLink to="/progress" className={({ isActive }) => (isActive ? "active" : "")}>
          Progress
        </NavLink>

        <div
          ref={moreRef}
          style={{
            position: "relative",
            display: "inline-flex",
            overflow: "visible",
            zIndex: 2002,
          }}
        >
          <button
            type="button"
            className={moreOpen ? "active" : ""}
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((v) => !v)}
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              font: "inherit",
              padding: "0",
              color: "inherit",
            }}
          >
            More ▾
          </button>

          {moreOpen ? (
            <div
              role="menu"
              aria-label="More"
              className="card"
              style={{
                position: "absolute",
                top: "calc(100% + 8px)",
                right: 0,
                minWidth: 200,
                zIndex: 9999,
                display: "grid",
                gap: 6,
                padding: 10,
                borderRadius: 14,
              }}
            >
              <NavLink
                to="/paste-workout"
                className={({ isActive }) => (isActive ? "active" : "")}
                onClick={closeMore}
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                }}
              >
                Paste Workout
              </NavLink>

	     <NavLink
                to="/export"
                className={({ isActive }) => (isActive ? "active" : "")}
                onClick={closeMore}
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                }}
              >
                Export
              </NavLink>

              <NavLink
                to="/help"
                className={({ isActive }) => (isActive ? "active" : "")}
                onClick={closeMore}
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                }}
              >
                Help
              </NavLink>

              {import.meta.env.DEV && (
                <NavLink
                  to="/Dev"
                  className={({ isActive }) => (isActive ? "active" : "")}
                  onClick={closeMore}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                  }}
                >
                  Dev
                </NavLink>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   Breadcrumb 4 — App shell
   ============================================================================ */

export default function App() {
  return (
    <>
      <TopNav />

      <div className="container">
        <AppErrorBoundary>
          <Routes>
            {/* =================================================================
                Breadcrumb 4A — Start
               ================================================================= */}
            <Route path="/" element={<StartPage />} />
            <Route path="/start" element={<Navigate to="/" replace />} />

            {/* =================================================================
                Breadcrumb 4B — Core pages
               ================================================================= */}
            <Route path="/templates" element={<TemplatesPage />} />
            <Route path="/exercises" element={<ExercisesPage />} />
            <Route path="/history" element={<HistoryPage />} />

            {/* =================================================================
                Breadcrumb 4C — Progress hub + detail pages
               ================================================================= */}
            <Route path="/progress" element={<ProgressPage />} />
            <Route path="/performance" element={<PerformanceDashboardPage />} />
            <Route path="/strength" element={<StrengthPage />} />
            <Route path="/body" element={<BodyPage />} />
            <Route path="/walks" element={<WalksPage />} />
            <Route path="/mps" element={<MpsPage />} />

            {/* =================================================================
                Breadcrumb 4D — Gym
               ================================================================= */}
            <Route
              path="/gym/:sessionId"
              element={USE_NEW_GYM_PAGE ? <GymPage /> : <GymPageLegacy />}
            />
            <Route path="/gym-legacy/:sessionId" element={<GymPageLegacy />} />

            {/* =================================================================
                Breadcrumb 4E — Utilities
               ================================================================= */}
            <Route path="/help" element={<HelpPage />} />
            <Route path="/logs" element={<LogsPage />} />
            <Route path="/import" element={<ImportCsvPage />} />
            <Route path="/export" element={<ExportPage />} />
            <Route path="/paste-workout" element={<PasteWorkoutPage />} />

            {/* =================================================================
                Breadcrumb 4F — Session pipeline
               ================================================================= */}
            <Route path="/complete/:sessionId" element={<SessionCompletePage />} />
            <Route path="/session/:sessionId" element={<SessionDetailPage />} />

            {/* =================================================================
                Breadcrumb 4G — DEV diagnostics
               ================================================================= */}
            <Route path="/dev" element={<DevDiagnosticsPage />} />

            {/* =================================================================
                Breadcrumb 4H — Safety net
               ================================================================= */}
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