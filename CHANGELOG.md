# Change log

## 2026-08-18 — Portal navigation and backup safety redesign

### User interface

- Replaced category and multi-tag tabs with a disease/work group navigation and grouped cards.
- Added instant English and Japanese partial-match search; Enter is not required.
- Added AND search for space-separated terms, such as `enu dia`.
- Simplified audiences to doctor (all active links) and staff (`staffVisible` links).
- Removed nurse and read-only administrator profiles; the administrator role now belongs only to the editing screen.

### Data migration

- Migrated the current 25 production links to `group`, `purpose`, `staffVisible`, and `keywords`.
- Updated `apps.json` from the stale 10-link fallback to the complete 25-link fallback.
- Kept `?profile=reception` as an alias for the new staff page so existing shared URLs continue to work.

### Save and recovery safety

- Require a successful read from the revision-aware GAS backend before enabling production saves.
- Added save diff confirmation and an extra typed confirmation for large reductions.
- Changed deletion to a recoverable trash operation.
- Added server-side locking and revision checks to prevent stale or concurrent overwrites.
- Added up to 100 pre-save snapshots in the hidden `_portal_backups` sheet.
- Added `restoreBackup(rowNumber)` and optional daily Google Drive copy support.
- Added JSON download/import recovery in the administration screen.

### Verification

- Automated data/search tests: 5 passed.
- JavaScript, Apps Script, JSON, and whitespace checks passed.
- Browser checks: doctor 25 links; staff 10 links; `enu` 4 results; `enu dia` 1 result; Japanese `夜尿` 4 results.

### Release state

- Apps Script source pushed with `clasp push --force` on 2026-08-18.
- Existing Web app deployment remains at version 10; no redeploy was performed in this change.
