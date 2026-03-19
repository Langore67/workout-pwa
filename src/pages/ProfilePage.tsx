// src/pages/ProfilePage.tsx
/* ============================================================================
   ProfilePage.tsx
   ----------------------------------------------------------------------------
   BUILD_ID: 2026-03-18-PROFILE-01
   FILE: src/pages/ProfilePage.tsx

   Purpose
   - Provide a lightweight personal profile hub under More
   - Centralize core identity, goals, training defaults, and notes
   - Establish a future anchor for goal-aware coaching and personalization

   v1 scope
   - Read-friendly card layout
   - Simple inline editing
   - Local persistence via localStorage
   - No DB migration required yet
   ============================================================================ */

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Page, Section } from "../components/Page.tsx";

type Sex = "male" | "female" | "other" | "";
type ExperienceLevel = "beginner" | "intermediate" | "advanced" | "";
type Units = "lb/in" | "kg/cm";

type ProfileData = {
  name: string;
  age: string;
  sex: Sex;

  heightFeet: string;
  heightInches: string;

  primaryGoal: string;
  currentWeightLb: string;
  targetWeightLb: string;
  currentBodyFatPct: string;
  targetBodyFatPct: string;

  trainingDaysPerWeek: string;
  experienceLevel: ExperienceLevel;
  focus: string;

  preferredBodyCompSource: string;
  healthFlag: string;
  notes: string;

  units: Units;
};

const PROFILE_STORAGE_KEY = "workout_pwa_profile_v1";

const DEFAULT_PROFILE: ProfileData = {
  name: "Jeff Aven",
  age: "58",
  sex: "male",

  heightFeet: "5",
  heightInches: "11.75",

  primaryGoal: "Fat Loss + Strength",
  currentWeightLb: "200",
  targetWeightLb: "185",
  currentBodyFatPct: "23",
  targetBodyFatPct: "17",

  trainingDaysPerWeek: "4-5",
  experienceLevel: "beginner",
  focus: "Functional strength • fat loss",

  preferredBodyCompSource: "Hume / manual body metrics",
  healthFlag: "Left inner elbow pain from weight training",
  notes: "Hydration matters for body comp readings.",

  units: "lb/in",
};

function loadProfile(): ProfileData {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return DEFAULT_PROFILE;

    const parsed = JSON.parse(raw) as Partial<ProfileData>;
    return {
      ...DEFAULT_PROFILE,
      ...parsed,
    };
  } catch {
    return DEFAULT_PROFILE;
  }
}

function saveProfile(profile: ProfileData) {
  try {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // ignore localStorage failures
  }
}

function formatHeight(feet: string, inches: string) {
  if (!feet && !inches) return "—";
  return `${feet || "—"}'${inches || "—"}"`;
}

function formatWeight(v: string) {
  if (!v.trim()) return "—";
  return `${v} lb`;
}

function formatPct(v: string) {
  if (!v.trim()) return "—";
  return `${v}%`;
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="muted"
      style={{
        fontSize: 12,
        fontWeight: 700,
        marginBottom: 10,
        letterSpacing: 0.4,
      }}
    >
      {children}
    </div>
  );
}

function ReadRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(120px, 1fr) minmax(0, 1.2fr)",
        gap: 10,
        alignItems: "start",
        marginBottom: 10,
      }}
    >
      <div className="muted" style={{ fontSize: 13 }}>
        {label}
      </div>
      <div style={{ fontWeight: 700 }}>{value || "—"}</div>
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="input"
      style={{ width: "100%" }}
    />
  );
}

function SelectInput({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (next: string) => void;
  options: Array<{ label: string; value: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="input"
      style={{ width: "100%" }}
    >
      {options.map((opt) => (
        <option key={opt.value || "__empty"} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

function TextAreaInput({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="input"
      style={{ width: "100%", resize: "vertical" }}
    />
  );
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [profile, setProfile] = useState<ProfileData>(() => loadProfile());

  useEffect(() => {
    saveProfile(profile);
  }, [profile]);

  const overviewLine = useMemo(() => {
    const age = profile.age?.trim() ? `${profile.age} years old` : null;
    const height = formatHeight(profile.heightFeet, profile.heightInches);
    const sex = profile.sex?.trim() || null;

    return [age, height !== "—" ? height : null, sex]
      .filter(Boolean)
      .join(" • ");
  }, [profile]);

  return (
    <Page title="Profile">
      <Section>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 6,
          }}
        >
          <h2 style={{ margin: 0 }}>Profile</h2>

          <div
            className="muted"
            style={{
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              padding: "4px 6px",
              borderRadius: 6,
            }}
            onClick={() => navigate("/more")}
          >
            ← More
          </div>
        </div>
      </Section>

      <Section>
        <div className="card" style={{ padding: 14, marginBottom: 12 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <CardTitle>PROFILE OVERVIEW</CardTitle>

            <button
              className={`btn small ${isEditing ? "primary" : ""}`}
              onClick={() => setIsEditing((v) => !v)}
            >
              {isEditing ? "Done" : "Edit"}
            </button>
          </div>

          {!isEditing ? (
            <>
              <div style={{ fontWeight: 900, fontSize: 24, marginBottom: 4 }}>
                {profile.name || "—"}
              </div>
              <div className="muted" style={{ marginBottom: 12 }}>
                {overviewLine || "—"}
              </div>

              <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>
                Primary Goal
              </div>
              <div style={{ fontWeight: 800, fontSize: 18 }}>
                {profile.primaryGoal || "—"}
              </div>
            </>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              <ReadRow
                label="Name"
                value={
                  <TextInput
                    value={profile.name}
                    onChange={(v) => setProfile((p) => ({ ...p, name: v }))}
                  />
                }
              />
              <ReadRow
                label="Age"
                value={
                  <TextInput
                    value={profile.age}
                    onChange={(v) => setProfile((p) => ({ ...p, age: v }))}
                  />
                }
              />
              <ReadRow
                label="Sex"
                value={
                  <SelectInput
                    value={profile.sex}
                    onChange={(v) => setProfile((p) => ({ ...p, sex: v as Sex }))}
                    options={[
                      { label: "Select…", value: "" },
                      { label: "Male", value: "male" },
                      { label: "Female", value: "female" },
                      { label: "Other", value: "other" },
                    ]}
                  />
                }
              />
              <ReadRow
                label="Height"
                value={
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <TextInput
                      value={profile.heightFeet}
                      onChange={(v) => setProfile((p) => ({ ...p, heightFeet: v }))}
                      placeholder="Feet"
                    />
                    <TextInput
                      value={profile.heightInches}
                      onChange={(v) => setProfile((p) => ({ ...p, heightInches: v }))}
                      placeholder="Inches"
                    />
                  </div>
                }
              />
              <ReadRow
                label="Primary Goal"
                value={
                  <TextInput
                    value={profile.primaryGoal}
                    onChange={(v) => setProfile((p) => ({ ...p, primaryGoal: v }))}
                  />
                }
              />
            </div>
          )}
        </div>
      </Section>

      <Section>
        <div className="card" style={{ padding: 14, marginBottom: 12 }}>
          <CardTitle>BODY TARGETS</CardTitle>

          {!isEditing ? (
            <>
              <ReadRow label="Current Weight" value={formatWeight(profile.currentWeightLb)} />
              <ReadRow label="Target Weight" value={formatWeight(profile.targetWeightLb)} />
              <ReadRow
                label="Current Body Fat"
                value={formatPct(profile.currentBodyFatPct)}
              />
              <ReadRow label="Target Body Fat" value={formatPct(profile.targetBodyFatPct)} />
            </>
          ) : (
            <>
              <ReadRow
                label="Current Weight"
                value={
                  <TextInput
                    value={profile.currentWeightLb}
                    onChange={(v) => setProfile((p) => ({ ...p, currentWeightLb: v }))}
                  />
                }
              />
              <ReadRow
                label="Target Weight"
                value={
                  <TextInput
                    value={profile.targetWeightLb}
                    onChange={(v) => setProfile((p) => ({ ...p, targetWeightLb: v }))}
                  />
                }
              />
              <ReadRow
                label="Current Body Fat"
                value={
                  <TextInput
                    value={profile.currentBodyFatPct}
                    onChange={(v) => setProfile((p) => ({ ...p, currentBodyFatPct: v }))}
                  />
                }
              />
              <ReadRow
                label="Target Body Fat"
                value={
                  <TextInput
                    value={profile.targetBodyFatPct}
                    onChange={(v) => setProfile((p) => ({ ...p, targetBodyFatPct: v }))}
                  />
                }
              />
            </>
          )}
        </div>
      </Section>

      <Section>
        <div className="card" style={{ padding: 14, marginBottom: 12 }}>
          <CardTitle>TRAINING PROFILE</CardTitle>

          {!isEditing ? (
            <>
              <ReadRow label="Training Days / Week" value={profile.trainingDaysPerWeek || "—"} />
              <ReadRow
                label="Experience Level"
                value={profile.experienceLevel || "—"}
              />
              <ReadRow label="Focus" value={profile.focus || "—"} />
            </>
          ) : (
            <>
              <ReadRow
                label="Training Days / Week"
                value={
                  <TextInput
                    value={profile.trainingDaysPerWeek}
                    onChange={(v) => setProfile((p) => ({ ...p, trainingDaysPerWeek: v }))}
                  />
                }
              />
              <ReadRow
                label="Experience Level"
                value={
                  <SelectInput
                    value={profile.experienceLevel}
                    onChange={(v) =>
                      setProfile((p) => ({ ...p, experienceLevel: v as ExperienceLevel }))
                    }
                    options={[
                      { label: "Select…", value: "" },
                      { label: "Beginner", value: "beginner" },
                      { label: "Intermediate", value: "intermediate" },
                      { label: "Advanced", value: "advanced" },
                    ]}
                  />
                }
              />
              <ReadRow
                label="Focus"
                value={
                  <TextInput
                    value={profile.focus}
                    onChange={(v) => setProfile((p) => ({ ...p, focus: v }))}
                  />
                }
              />
            </>
          )}
        </div>
      </Section>

      <Section>
        <div className="card" style={{ padding: 14, marginBottom: 12 }}>
          <CardTitle>BODY COMP SETTINGS</CardTitle>

          {!isEditing ? (
            <>
              <ReadRow
                label="Preferred Source"
                value={profile.preferredBodyCompSource || "—"}
              />
              <ReadRow
                label="Supports"
                value="Weight • Waist • BF% • ICW • ECW • Mineral"
              />
            </>
          ) : (
            <ReadRow
              label="Preferred Source"
              value={
                <TextInput
                  value={profile.preferredBodyCompSource}
                  onChange={(v) =>
                    setProfile((p) => ({ ...p, preferredBodyCompSource: v }))
                  }
                />
              }
            />
          )}
        </div>
      </Section>

      <Section>
        <div className="card" style={{ padding: 14, marginBottom: 12 }}>
          <CardTitle>HEALTH + NOTES</CardTitle>

          {!isEditing ? (
            <>
              <ReadRow label="Current Flag" value={profile.healthFlag || "—"} />
              <ReadRow label="Notes" value={profile.notes || "—"} />
            </>
          ) : (
            <>
              <ReadRow
                label="Current Flag"
                value={
                  <TextAreaInput
                    value={profile.healthFlag}
                    onChange={(v) => setProfile((p) => ({ ...p, healthFlag: v }))}
                    rows={2}
                  />
                }
              />
              <ReadRow
                label="Notes"
                value={
                  <TextAreaInput
                    value={profile.notes}
                    onChange={(v) => setProfile((p) => ({ ...p, notes: v }))}
                    rows={3}
                  />
                }
              />
            </>
          )}
        </div>
      </Section>

      <Section>
        <div className="card" style={{ padding: 14, marginBottom: 12 }}>
          <CardTitle>ACCOUNT + APP</CardTitle>

          {!isEditing ? (
            <ReadRow label="Units" value={profile.units} />
          ) : (
            <ReadRow
              label="Units"
              value={
                <SelectInput
                  value={profile.units}
                  onChange={(v) => setProfile((p) => ({ ...p, units: v as Units }))}
                  options={[
                    { label: "lb / in", value: "lb/in" },
                    { label: "kg / cm", value: "kg/cm" },
                  ]}
                />
              }
            />
          )}
        </div>
      </Section>
    </Page>
  );
}

/* ============================================================================
   End of file: src/pages/ProfilePage.tsx
   ============================================================================ */