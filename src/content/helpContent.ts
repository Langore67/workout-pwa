export const DEFAULT_HELP_CONTENT = `# IronForge Help

## Import / Export Workflow

### Journal CSV import workflow
1. Backup DB first
2. If needed, use **Wipe Workout History Only**
3. Go to **Import**
4. Run **Dry Run** first
5. If the counts look right, uncheck Dry Run and import
6. Verify sessions on laptop
7. Create a new **Backup DB (JSON)**
8. Restore that JSON on iPhone

### Golden backup
After a clean import and verification, create a backup and name it clearly.
Example:
- ironforge_post_import_baseline.json

### Restore workflow
1. Make sure laptop and iPhone are on the same deployed build
2. On target device, use **Wipe DB (ALL)** if the DB is in a bad state
3. Use **Restore DB**
4. Verify History, session detail, and warmups

## Exercise Naming Rules

- Use one canonical exercise name
- Use aliases for alternate spellings
- Put side first for unilateral exercises
  - Left Eccentric Hammer Curl
  - Right Eccentric Hammer Curl
- Keep equipment explicit when it matters
  - Barbell Back Squat
  - Incline Barbell Bench Press
  - Glute Machine

## Alias Rules

Canonical names should stay stable.
Aliases are for:
- old spellings
- shorthand
- import variants

Examples:
- Back Squat -> Barbell Back Squat
- Incline Barbell Press -> Incline Barbell Bench Press
- Rear Pec Deck -> Reverse Pec Deck

## Recovery Notes

### If restore fails
- confirm latest Cloudflare deploy is live
- refresh browser
- remove/re-add PWA if needed
- retry restore

### If imported sessions look wrong
- Wipe Workout History Only
- fix the CSV/importer
- re-import
- verify before making a new backup
`;