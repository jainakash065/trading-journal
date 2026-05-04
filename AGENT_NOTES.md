# Agent Notes

## Git Workflow

- Bitbucket `origin` is the primary development remote.
- Never push directly to `origin/master`.
- For code or documentation changes, create a feature branch and push only to that Bitbucket feature branch.
- After the user merges the Bitbucket pull request into `origin/master`, update local `master` from Bitbucket.
- Push to GitHub `master` only after local `master` has been updated from merged Bitbucket `master`.
- GitHub is a personal mirror of accepted work, not the active feature-branch development remote.

## Data Safety

- Do not commit local journal data.
- Keep SQLite database files local:
  - `data/journal.db`
  - `data/journal.db-*`
- Keep screenshots local:
  - `data/screenshots/entries/*`
  - `data/screenshots/exits/*`
- Keep generated backups local:
  - `data/backups/*`
- Do not commit broker exports or personal CSV files unless the user explicitly asks for that exact file to be versioned.

