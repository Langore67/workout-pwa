import React from "react";
import InfoStubButton from "../information/InfoStubButton";

function capitalize(value: string) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export type StrengthSignalDetailsComposite = {
  movement: string;
  score: string;
  exerciseCount: number;
};

export type StrengthSignalDetailsExercise = {
  label: string;
  changePct: string;
  score: string;
};

type StrengthSignalDetailsCardProps = {
  showDebug: boolean;
  setShowDebug: React.Dispatch<React.SetStateAction<boolean>>;
  sourceUsed: string;
  dateWindowUsed: string;
  confidenceLevel: string;
  exercisesIncluded: string;
  currentStrengthSignal: string;
  strongestPattern: string;
  note: string;
  debugComposites: StrengthSignalDetailsComposite[];
  debugTopExercises: StrengthSignalDetailsExercise[];
};

export default function StrengthSignalDetailsCard({
  showDebug,
  setShowDebug,
  sourceUsed,
  dateWindowUsed,
  confidenceLevel,
  exercisesIncluded,
  currentStrengthSignal,
  strongestPattern,
  note,
  debugComposites,
  debugTopExercises,
}: StrengthSignalDetailsCardProps) {
  return (
    <div className="card">
      <div
        className="row"
        style={{
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <h3 style={{ margin: 0 }}>Strength Signal Details</h3>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <InfoStubButton pageKey="strength" infoKey="strengthSignal" />
          <button
            type="button"
            className="btn small"
            onClick={() => setShowDebug((v) => !v)}
          >
            {showDebug ? "Hide Details" : "Show Details"}
          </button>
        </div>
      </div>

      <div className="kv">
        <span>Source Used</span>
        <span style={{ color: "var(--text)", fontWeight: 700 }}>{sourceUsed}</span>
      </div>

      <div className="kv" style={{ marginTop: 8 }}>
        <span>Date Window Used</span>
        <span style={{ color: "var(--text)", fontWeight: 700 }}>{dateWindowUsed}</span>
      </div>

      <div className="kv">
        <span>Confidence Level</span>
        <span style={{ color: "var(--text)", fontWeight: 700 }}>{confidenceLevel}</span>
      </div>

      <div className="kv" style={{ marginTop: 8 }}>
        <span>Pattern Drivers Loaded</span>
        <span style={{ color: "var(--text)", fontWeight: 700 }}>{exercisesIncluded}</span>
      </div>

      <div className="kv" style={{ marginTop: 8 }}>
        <span>Current Strength Signal</span>
        <span style={{ color: "var(--text)", fontWeight: 700 }}>
          {currentStrengthSignal}
        </span>
      </div>

      <div className="kv">
        <span>Strongest Pattern</span>
        <span style={{ color: "var(--text)", fontWeight: 700 }}>{strongestPattern}</span>
      </div>

      <div
        className="muted"
        style={{ marginTop: 10, fontSize: 12, lineHeight: 1.45 }}
      >
        {note}
      </div>

      {showDebug ? (
        <div className="list" style={{ marginTop: 12 }}>
          <div className="card">
            <strong>Pattern Breakdown</strong>
            <div className="list" style={{ marginTop: 10 }}>
              {debugComposites.map((item) => (
                <div key={item.movement} className="kv">
                  <span>
                    {capitalize(item.movement)} ({item.exerciseCount})
                  </span>
                  <span style={{ color: "var(--text)", fontWeight: 700 }}>
                    {item.score}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <strong>Top Pattern Drivers</strong>
            <div className="list" style={{ marginTop: 10 }}>
              {debugTopExercises.map((item) => (
                <div key={item.label} className="kv">
                  <span>{item.label}</span>
                  <span style={{ color: "var(--text)", fontWeight: 700 }}>
                    {item.changePct} • {item.score}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
