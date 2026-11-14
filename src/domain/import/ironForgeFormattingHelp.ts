import { IF_WORKOUT_FORMAT_VERSION } from "./ifWorkoutContract";

export const IRONFORGE_COMPLETED_WORKOUT_EXAMPLE = `IF Workout
Format Version: ${IF_WORKOUT_FORMAT_VERSION}
Session: Upper A
Date: 2026-10-24
Start: 07:45
End: 08:45

Barbell Bench Press
warmup 95x10
work 135x8 @2

Session Notes:
- Optional factual notes`;

export const IRONFORGE_HANDOFF_RETURN_INSTRUCTIONS = `IronForge import format represents completed work, not a planned workout.
Do not return planned work as if it were completed. Only confirmed session results belong in the final IF Workout block.
If the workout was already logged directly in IronForge Gym, do not import it again.

When asked for IF format, return only one parser-compatible completed workout in a plain-text code block using Format Version: ${IF_WORKOUT_FORMAT_VERSION}. Omit unknown values instead of inventing them.

${IRONFORGE_COMPLETED_WORKOUT_EXAMPLE}

Use one exercise name per line and one confirmed set per line beneath it. Supported set types are warmup, work, technique, mobility, corrective, and conditioning. Use BW for body-weight movements and @RIR only when known. Keep observations under Session Notes.`;

export const IRONFORGE_MINIMAL_WALK_EXAMPLE = `IF Workout
Format Version: 1
Session: MapMyWalk Walk
Activity Type: Walk
Intent: Fitness
Cardio Format: Continuous
Distance: 3.42 mi
Active Duration: 1:00:00
Average HR: 118 bpm
Maximum HR: 136 bpm
Source: MapMyWalk
Date: 2026-10-24`;

export const IRONFORGE_EXPANDED_WALK_EXAMPLE = `IF Workout
Format Version: 1
Session: Peachtree Ridge Park Walk
Activity Type: Walk
Intent: Fitness
Cardio Format: Continuous

Distance: 3.42 mi
Active Duration: 1:00:00
Elapsed Duration: 1:03:14
Average HR: 118 bpm
Maximum HR: 136 bpm
Elevation Gain: 185 ft

Route Name: Peachtree Ridge Park
Provider: MapMyWalk
Provider Workout ID: 987654321
Source: MapMyWalk Screenshot

Steps: 7214
Steps Source: Recorded
Energy: 401 kcal

HR Zone 1: 18:00
HR Zone 2: 09:00
HR Zone 3: 27:00
HR Zone 4: 06:00
HR Zone Source: MapMyWalk display

Date: 2026-10-24`;

export const IRONFORGE_FORMATTING_HELP_PROMPT = `Convert the completed workout notes below into parser-compatible IronForge Format Version 1.

Use the exact IronForge labels shown. Do not rename labels or invent synonyms. Output only facts visible in the source or safely calculable from it. Omit unknown fields instead of guessing. Never invent a Route ID, Provider Workout ID, HR-zone value, step provenance, timestamp, set, or observation.

Minimal strength example:

${IRONFORGE_COMPLETED_WORKOUT_EXAMPLE}

Minimal walk/cardio example:

${IRONFORGE_MINIMAL_WALK_EXAMPLE}

Expanded walk/cardio example (all additional measurements are optional):

${IRONFORGE_EXPANDED_WALK_EXAMPLE}

Canonical cardio labels and values:
- Activity Type: Walk|Hike|Run|Bike|Row|Other
- Intent: Fitness|Recovery|Adventure
- Cardio Format: Continuous|Intervals
- Distance: <positive value> mi|km
- Active Duration: MM:SS|HH:MM:SS
- Elapsed Duration: MM:SS|HH:MM:SS
- Average HR: <integer 1-300> bpm
- Maximum HR: <integer 1-300> bpm
- Elevation Gain: <non-negative value> ft|m
- Route ID: <explicit stable identifier>
- Route Name: <explicit route name>
- Source: <human-readable source>
- Provider: <provider identity>
- Provider Workout ID: <opaque provider workout ID>
- Steps: <positive whole number>
- Steps Source: Recorded|Estimated (only when Steps is present and provenance is known)
- Energy: <non-negative value> kcal
- HR Zone <positive integer>: MM:SS|HH:MM:SS
- HR Zone Source: <explicit source>

Duration rules:
- Active Duration is actual moving/active workout time when explicitly supplied and is preferred for pace.
- Elapsed Duration is total clock time including stops when explicitly supplied.
- Duration is the legacy/general compatibility label. Do not reinterpret it as active or elapsed time.
- For new MapMyWalk formatting, prefer Active Duration when active/moving time is available.

HR-zone screenshot rules:
- If exact zone durations are visible, use HR Zone N duration rows and HR Zone Source: MapMyWalk display.
- If only percentages are visible, calculate approximate durations only when a trustworthy active/total duration is also visible. Round conservatively to whole seconds, retain HR Zone Source: MapMyWalk display, and state in Session Notes that the zone durations were calculated approximately from displayed percentages.
- If no trustworthy duration exists, omit HR Zone rows. Never output percentages as HR Zone values.

General rules:
- Structured cardio labels belong after Session and before Date.
- Prefer structured cardio fields over prose notes when a metric is known.
- Include only confirmed completed work. Never invent loads, reps, RIR, warm-ups, or timestamps.
- Supported set types: warmup, work, technique, mobility, corrective, conditioning.
- Use BW for body-weight movements and @RIR only when RIR is known.
- Keep qualitative observations under Session Notes.
- Return only one IronForge-formatted workout in a plain-text code block.

Accepted compatibility inputs not preferred in new output:
- Duration: MM:SS|HH:MM:SS
- Avg HR: <integer> bpm
- Max HR: <integer> bpm
- Calories: <non-negative value> kcal

Workout notes:
<paste notes here>`;
