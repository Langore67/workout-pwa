export const IRONFORGE_IMPORT_CONTRACT_VERSION = 1;

export const ironForgeImportContractV1 = `IRONFORGE WORKOUT IMPORT CONTRACT
Format Version: 1

When I request "IF format", "IronForge format", or "Export workout", return only the confirmed completed workout in one copyable plain-text code block. Do not add commentary outside it.

Required structure:

IF Workout
Format Version: 1
Session: <name>
Date: YYYY-MM-DD
Start: HH:mm
End: HH:mm

Exercise Name
warmup 95x10
work 135x8 @2

Session Notes:
- Optional notes

Supported Version 1 set types: warmup, work, technique, mobility, corrective, conditioning.

Rules:
- This imports completed work; it does not schedule planned work.
- Use one exercise name per line and one set per line beneath it.
- Use BW for body-weight movements and @RIR when RIR is known.
- Include confirmed completed work only. Never invent loads, reps, RIR, warm-ups, timestamps, or observations.
- Preserve left/right performance accurately and use canonical IronForge exercise names when known.
- Do not silently convert load units.
- Keep explanatory observations under Session Notes; do not place exercise notes among set lines.
- If Start or End is unknown, omit that unsupported field rather than inventing it. Preserve the remaining field order.

For cardio, these optional metadata fields may appear after Session and before Date, only when known:
Activity Type: Walk|Hike|Run|Bike|Row|Other
Intent: Fitness|Recovery|Adventure
Cardio Format: Continuous|Intervals
Distance: <positive value> mi|km
Duration: MM:SS|HH:MM:SS
Average HR: <integer> bpm
Maximum HR: <integer> bpm
Elevation Gain: <non-negative value> ft|m
Route ID: <explicit stable identifier>
Route Name: <explicit route name>
Source: <explicit source>

Activity Type is what was performed, Intent is why, and Cardio Format is how. Never infer an unknown field.
Distance, duration, heart rate, elevation, route, and source must also be explicit; omit unknown fields.

Supported conditioning notation includes:
conditioning BWx3.12mi
conditioning BWx5.39km
conditioning BWx42min
conditioning BWx2520s

Session Notes may factually record PRs, failed attempts, holds, technical modifications, substitutions, equipment limits, reported pain, skipped-work reasons, and significant fatigue. Do not invent observations.

Final requirement: when IF format is requested, output only one parser-compatible completed-workout code block.`;
