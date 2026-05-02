# Trading Journal Product Features

## Product Goal

Create a free, local-first trading journal web app for Indian stock swing trading. The app should make trade entry low-friction, preserve screenshots and notes locally, track realized capital impact, and give actionable feedback through dashboards, reviews, and behavior metrics.

## User Profile

- Trades Indian stocks in the buy direction.
- Usually enters once and exits in multiple parts.
- May pyramid, but each pyramid entry is tracked as a separate trade.
- Uses predefined setups and a pre-entry checklist.
- Defines stop loss before entry.
- Uses percentage-based risk per trade, where the percentage can vary by trade.
- Wants R-multiple tracking, emotional notes, screenshots, lessons learned, and dashboard analytics.

## Core Principles

- Local-first and free to run.
- Durable data storage using SQLite.
- Screenshots stored as local files, with file metadata tracked in SQLite.
- All durable local data kept under the project `data/` folder for backup portability.
- Every trade should connect planning, execution, exits, review, and realized capital impact.
- The UI should avoid duplicate entries and give clear feedback after save/delete actions.

## Technical Direction

- Vite + React + TypeScript frontend.
- Node/Express local API.
- SQLite-backed local database.
- Local screenshot storage folders:
  - `data/screenshots/entries`
  - `data/screenshots/exits`
- No cloud hosting or paid services required.

## Data Storage

SQLite stores:

- Settings
- Capital ledger entries
- Trades
- Trade exits
- Checklist responses
- Reviews
- Mistake tag associations
- Setups, checklist items, and mistake tags
- Screenshot metadata and local file paths

Screenshots are stored as files instead of binary database records to keep the database smaller and easier to back up.

## Capital Tracking

Implemented:

- Starting capital setting, initially around Rs. 5.5 lakhs.
- Current realized capital.
- Capital ledger rows from realized exits.
- Realized P&L impact on capital.
- Open risk exposure.
- Trade-level portfolio impact percentage:
  - `portfolioImpactPercentage = realizedPnl / riskCapitalBase * 100`
- Capital history start date:
  - Stored as `capitalHistoryStartDate`.
  - Inferred from earliest trade/ledger date for existing data.
  - Editable in Settings.
  - Prevents dashboard periods before journal history from showing fake starting/ending capital.

Current behavior:

- Capital updates use realized P&L only.
- Unrealized mark-to-market is not included yet.
- Period capital cards show `-` when the selected period is before capital tracking started.

Future scope:

- Manual deposits and withdrawals.
- Mark-to-market unrealized P&L.
- Portfolio-level open position valuation.
- Capital allocation by setup, month, and financial year.
- Capital curve chart in the UI.

## Risk And Position Sizing

Implemented:

- Entry price.
- Stop-loss price.
- Linked stop-loss percentage and stop-loss price inputs:
  - For buy trades: `stopLossPrice = entryPrice * (1 - stopLossPercent / 100)`
  - Editing either value updates the other.
- Risk percentage per trade.
- Risk capital base per trade.
- Planned risk amount derived from risk capital base and risk percentage:
  - `plannedRiskAmount = riskCapitalBase * riskPercentage / 100`
- Suggested quantity:
  - `floor(plannedRiskAmount / (entryPrice - stopLoss))`
- Actual risk:
  - `(entryPrice - stopLoss) * quantity`
- Risk used percentage.
- Position value:
  - `entryPrice * quantity`
- Position size percentage:
  - `positionValue / riskCapitalBase * 100`

Future scope:

- Planned target and planned reward-to-risk ratio.
- Position sizing simulator.
- Multi-scenario risk preview before saving a trade.

## Trade Entry

Implemented fields:

- Symbol.
- Market, defaulted to India.
- Direction, defaulted to Buy.
- Entry date.
- Entry price.
- Quantity.
- Stop-loss percentage and stop-loss price.
- Risk percentage.
- Risk capital base.
- Setup.
- Checklist responses.
- Entry reason.
- Emotional state before entry.
- Confidence level.
- Notes.
- Entry screenshot upload.

Implemented behaviors:

- Default date to today.
- Default risk percentage from settings.
- Default risk capital base to current realized capital.
- Save button disables while saving to avoid duplicate trade creation.
- Entry screenshots can be appended during edit.
- Planned risk is read-only/derived rather than manually typed.

Trade statuses:

- Open.
- Partially exited.
- Closed.

Future scope:

- Save draft.
- Entry tags beyond setup/mistakes.
- Drag-and-drop screenshot upload.
- Keyboard-first quick entry.

## Exit Management

Implemented fields:

- Exit date.
- Exit price.
- Quantity exited.
- Exit reason.
- Exit screenshot.
- Exit notes.
- Emotional state during exit.
- P&L for that exit.
- R contribution for that exit.
- Capital impact.

Implemented behaviors:

- Multiple partial exits per entry trade.
- Add exit from trade detail drawer.
- Save Exit disables while saving.
- Successful Save Exit clears the exit form and screenshot input.
- Exit quantity is validated against remaining quantity.
- Exit edits recalculate P&L, R contribution, status, and capital ledger.
- Exit delete removes the exit, related screenshot metadata/files, and capital ledger impact.

R behavior:

- Full trade risk:
  - `(entryPrice - stopLoss) * originalQuantity`
- Exit R contribution:
  - `exitPnl / fullTradeRisk`
- Final trade R:
  - `totalRealizedPnl / fullTradeRisk`
- Sum of raw exit R contributions equals final trade R, subject to display rounding.

Parent trade summary:

- Total exited quantity.
- Remaining quantity.
- Average exit price.
- Realized P&L.
- Final R-multiple.
- Portfolio impact percentage.
- Status based on remaining quantity.
- Duration for closed trades.

## Trade Editing And Deletion

Implemented:

- Edit entry-level trade fields from the trade detail drawer.
- Edit individual exits.
- Editing entry price, stop loss, or quantity recalculates:
  - Exit P&L.
  - Exit R contribution.
  - Final trade R.
  - Capital ledger rows.
  - Trade status.
- Block reducing trade quantity below already-exited quantity.
- Delete full trade.
- Delete individual exit.
- Full trade delete removes:
  - Trade row.
  - Exits.
  - Checklist responses.
  - Review.
  - Mistake associations.
  - Capital ledger rows.
  - Screenshot metadata.
  - Screenshot files.
- Deletes use an in-app confirmation dialog instead of native browser confirm.

Future scope:

- Soft delete/archive mode.
- Undo delete through backup/history.
- Version history for edits.
- Delete individual screenshots without deleting the trade or exit.

## Screenshots

Implemented:

- Entry screenshot upload.
- Exit screenshot upload.
- Multiple screenshots per trade/exit through append behavior.
- Screenshots are associated by trade ID and optional exit ID, so screenshots for repeated trades in the same stock do not collide.
- Thumbnail preview inside trade detail.
- Click any screenshot thumbnail to open a large in-app preview modal.
- Preview modal supports close by X, Escape, and backdrop click.
- Screenshot files are deleted when their related trade/exit is deleted.

Future scope:

- Screenshot zoom/pan.
- Screenshot annotations.
- Screenshot replacement without deleting trade/exit.
- Full backup/export includes screenshots.

## Checklist Features

Implemented:

- Configurable pre-entry checklist items.
- Checklist toggles during trade entry and trade edit.
- Checklist responses stored per trade.

Future scope:

- Checklist notes per item in the UI.
- Checklist completion percentage.
- Checklist score.
- Analytics comparing checklist-followed vs checklist-broken outcomes.

## Setup Tracking

Implemented:

- User-defined setup list in Settings.
- Setup selection on trades.
- Best setup and worst setup on dashboard for the selected period.
- Setup shown in open/closed trade tables and trade detail.

Future scope:

- Setup-wise win rate.
- Setup-wise average R.
- Setup frequency.
- Setup quality scoring.
- Setup-specific review page.

## Mistake Tracking

Implemented:

- User-defined mistake tags in Settings.
- Mistake tags can be selected during trade review.
- Dashboard shows mistake frequency for the selected period.

Future scope:

- P&L impact by mistake.
- Mistake frequency over time.
- Mistakes by setup.
- Mistakes by month or financial year.

## Trade Review

Implemented:

- Followed plan.
- Rule score.
- Discipline score.
- Mistake tags.
- Lesson learned.
- Save review button states:
  - Save Review.
  - Saving...
  - Saved.
  - Error message on failure.
- Inline success message after saving review.

Planned fields already supported in data model or future UI:

- What went well.
- What went wrong.
- What should I repeat?
- What should I avoid?

Future scope:

- Dedicated closed-trade review workflow.
- Review status filters.
- Review completion checklist.

## Dashboard

Implemented:

- Dashboard period selector:
  - This month.
  - This week.
  - Last month.
  - Current FY.
  - Last FY.
  - All time.
- Indian financial year support:
  - FY starts April 1.
  - FY ends March 31.
- Account Snapshot:
  - Current capital.
  - Open trades.
  - Open risk.
- Period Capital:
  - Starting capital.
  - Ending capital.
  - Capital change.
  - Capital change percentage.
  - Capital unavailable state for periods before capital history start.
- Period Performance:
  - Period P&L.
  - Closed trades count.
  - Win rate.
  - Average R.
  - Profit factor.
  - Average winner.
  - Average loser.
  - Max drawdown.
- Execution Quality:
  - Rules followed P&L.
  - Rules broken P&L.
  - Best setup.
  - Worst setup.
- Mistakes:
  - Mistake frequency for selected period.

Current dashboard rules:

- Performance metrics are filtered by final exit date.
- Capital is realized-only.
- Open trade counts and open risk are current account snapshot values, not period-filtered values.

Future scope:

- Any FY selector.
- Custom date range picker.
- Save preferred dashboard period.
- Dashboard charts:
  - Capital curve.
  - Monthly/weekly P&L bars.
  - Setup distribution.
  - Mistake trend.
- Drill-down from dashboard cards to filtered trades.

## Journal Views

### Open Trades

Implemented columns:

- Symbol.
- Entry price/date.
- Quantity as remaining/original.
- Position percentage.
- Portfolio impact percentage from realized exits.
- Realized P&L.
- Final R.
- Status.

### Closed Trades

Implemented columns:

- Symbol.
- Entry price/date.
- Quantity as original quantity only.
- Position percentage.
- Portfolio impact percentage.
- Realized P&L.
- Final R.
- Duration.

Duration behavior:

- Closed trade duration is inclusive calendar days:
  - `final exit date - entry date + 1`

### Trade Detail Drawer

Implemented:

- Full trade summary.
- Entry screenshots.
- All exits.
- Exit screenshots.
- P&L summary.
- R summary.
- Capital and portfolio impact.
- Planned risk, actual risk, risk used.
- Position value and position percentage.
- Checklist.
- Add exit form.
- Edit trade form.
- Edit exit form.
- Review form.

Drawer usability:

- Sticky header with symbol, status, edit/delete actions, and X close.
- Close by X.
- Close by Escape.
- Close by backdrop click.
- In-app confirmation when closing with an active edit form.

Future scope:

- Wider detail layout for larger screens.
- Dedicated full-page trade detail route.
- Inline chart/screenshot comparison.

## User Feedback And Safety

Implemented:

- Auto-dismiss success toasts.
- Manual dismiss button on toasts.
- Error toasts stay visible until dismissed.
- In-app confirmation dialogs for destructive actions.
- Save buttons disable while saving for high-risk duplicate actions:
  - New trade.
  - Add exit.
  - Edit trade.
  - Edit exit.
  - Save review.

Future scope:

- Global notification center.
- Undo for destructive actions.
- Stronger backend idempotency for duplicate submits.

## Settings

Implemented:

- Starting capital.
- Capital history start date.
- Default risk percentage.
- Setup list.
- Checklist item list.
- Mistake tag list.

Future scope:

- Screenshot storage location.
- Backup/export location.
- Default dashboard period.
- Display preferences.

## Backup, Export, And Portability

Current structure:

- Durable app data is kept in `data/`.
- SQLite database and screenshots are local and copyable.

Future scope:

- Export full journal backup as a zip file.
- Include SQLite database.
- Include screenshots.
- Include settings.
- Include capital ledger.
- Include trades, exits, reviews, setups, checklist data, and mistakes.
- Import backup on another computer.
- Restore app state exactly from backup.
- CSV export for trades and exits.

Example backup name:

```text
trading-journal-backup-2026-05-01.zip
```

## Suggested Next Enhancements

- Any FY selector.
- Custom date range picker.
- Manual deposits and withdrawals.
- Full zip export/import.
- CSV export.
- Advanced filters for trade tables.
- Monthly review page.
- Weekly review page.
- Calendar view.
- Unrealized P&L tracking.
- Broker contract note import.
- Chart annotations.
- Advanced expectancy analytics.
- Position sizing simulator.
- Streak analysis.
- Setup quality scoring.
- Mobile-friendly quick entry.
