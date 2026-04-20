// src/App.tsx
/* ============================================================================
   App.tsx — Routes + Safety Error Boundary + Top Nav "More" menu
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-03-15-APP-ROUTES-09
   FILE: src/App.tsx

   Changes (APP-ROUTES-08)
   ✅ Add BodyCompositionPage route
   ✅ Keep BodyPage as body entry / logging page
   ✅ Keep Progress as analytics hub
   ✅ Keep all existing routes intact
   ✅ Keep single ErrorBoundary wrapping Routes
   ✅ Keep USE_NEW_GYM_PAGE switch
   ============================================================================ */

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink, Route, Routes, Navigate, useLocation } from "react-router-dom";
import StartPage from "./pages/StartPage";
import TemplatesPage from "./pages/TemplatesPage";
import ExercisesPage from "./pages/ExercisesPage";
import BodyPage from "./pages/BodyPage";
import BodyCompositionPage from "./pages/BodyCompositionPage";
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
import ProfilePage from "./pages/ProfilePage";
import AboutPage from "./pages/AboutPage";
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
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const [moreMenuPos, setMoreMenuPos] = useState<{ top: number; left: number } | null>(null);
  const navInnerRef = useRef<HTMLDivElement | null>(null);
  const moreRef = useRef<HTMLDivElement | null>(null);
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);

  function updateMoreMenuPosition() {
    const button = moreButtonRef.current;
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const pad = 8;
    const menuWidth = 220;
    setMoreMenuPos({
      top: rect.bottom + pad,
      left: Math.min(window.innerWidth - menuWidth - pad, Math.max(pad, rect.right - menuWidth)),
    });
  }

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (!moreRef.current?.contains(target) && !moreMenuRef.current?.contains(target)) {
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

  useEffect(() => {
    if (!moreOpen) return;

    updateMoreMenuPosition();
    window.addEventListener("resize", updateMoreMenuPosition);
    window.addEventListener("scroll", updateMoreMenuPosition, true);

    return () => {
      window.removeEventListener("resize", updateMoreMenuPosition);
      window.removeEventListener("scroll", updateMoreMenuPosition, true);
    };
  }, [moreOpen]);

  useEffect(() => {
    const nav = navInnerRef.current;
    if (!nav || !window.matchMedia("(max-width: 520px)").matches) return;

    const raf = window.requestAnimationFrame(() => {
      const active = nav.querySelector<HTMLElement>("a.active");
      if (!active) return;

      const navRect = nav.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      const gutter = 16;

      if (activeRect.left < navRect.left + gutter) {
        nav.scrollBy({
          left: activeRect.left - navRect.left - gutter,
          behavior: "auto",
        });
      } else if (activeRect.right > navRect.right - gutter) {
        nav.scrollBy({
          left: activeRect.right - navRect.right + gutter,
          behavior: "auto",
        });
      }
    });

    return () => window.cancelAnimationFrame(raf);
  }, [location.pathname]);

  const closeMore = () => setMoreOpen(false);

  return (
    <div className="nav">
      <div className="nav-inner" ref={navInnerRef}>
        <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
          Start
        </NavLink>
        
        <NavLink
	  to="/templates"
	  className={({ isActive }) => (isActive ? "active" : "")}
	>
	  Templates
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
          className="nav-more"
          style={{
            position: "relative",
            display: "inline-flex",
          }}
        >
          <button
            ref={moreButtonRef}
            type="button"
            className={`nav-more-button ${moreOpen ? "active" : ""}`}
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((v) => !v)}
          >
            More ▾
          </button>

          {moreOpen && typeof document !== "undefined" ? createPortal(
            <div
              ref={moreMenuRef}
              role="menu"
              aria-label="More"
              className="card nav-more-menu"
              style={{
                top: moreMenuPos?.top ?? 48,
                left: moreMenuPos?.left ?? 8,
              }}
            >
              <NavLink
	        to="/profile"
	        className={({ isActive }) => (isActive ? "active" : "")}
	        onClick={closeMore}
	        style={{
	          padding: "8px 10px",
	          borderRadius: 8,
	        }}
	      >
	        Profile
             </NavLink>
              
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

		    <NavLink
		      to="/about"
		      className={({ isActive }) => (isActive ? "active" : "")}
		      onClick={closeMore}
		      style={{
			padding: "8px 10px",
			borderRadius: 8,
		      }}
		    >
		      About
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
            </div>,
            document.body
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
            <Route path="/body-composition" element={<BodyCompositionPage />} />
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
	    <Route path="/about" element={<AboutPage />} />
	    <Route path="/logs" element={<LogsPage />} />
	    <Route path="/import" element={<ImportCsvPage />} />
	    <Route path="/export" element={<ExportPage />} />
	    <Route path="/paste-workout" element={<PasteWorkoutPage />} />
            <Route path="/profile" element={<ProfilePage />} />

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
