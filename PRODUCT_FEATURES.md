# Trading Journal Product Features

## Product Goal

Create a free, local-first trading journal web app for Indian stock swing trading. The app should make trade entry low-friction, preserve screenshots and notes locally, track realized capital impact, and give actionable feedback through dashboards, reviews, and behavior metrics.

## User Profile

- Trades Indian stocks in the buy direction.
- Usually enters once and exits in multiple parts.
- May pyramid, but each pyramid entry is tracked as a separate trade.
- Uses predefined setups and a pre-entry checklist.
- Defines stop loss before entry.
- Moves stops during trade management, including moving remaining quantity to breakeven after favorable movement.
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
- Current open risk based on active stop loss and remaining quantity.
- Trade-level portfolio impact percentage:
  - `portfolioImpactPercentage = realizedPnl / riskCapitalBase * 100`
- Manual current price for open/partially exited trades.
- Trade-level unrealized metrics from manual current price:
  - Unrealized P&L in money.
  - Unrealized R.
  - Unrealized portfolio impact percentage.
- Capital history start date:
  - Stored as `capitalHistoryStartDate`.
  - Inferred from earliest trade/ledger date for existing data.
  - Editable in Settings.
  - Prevents dashboard periods before journal history from showing fake starting/ending capital.

Current behavior:

- Capital updates use realized P&L only.
- Unrealized values are shown for open trades but do not affect realized capital, capital ledger, booked P&L, win rate, expectancy, or dashboard period performance.
- Period capital cards show `-` when the selected period is before capital tracking started.

Future scope:

- Manual deposits and withdrawals.
- Net realized P&L after brokerage, STT, exchange charges, GST, stamp duty, and other fees.
- Gross vs net P&L comparison per exit, trade, period, setup, and dashboard.
- Contract-note or broker-file reconciliation for charges and taxes.
- Capital gains tax tracking for intraday and short-term holdings.
- No LTCG workflow needed for the primary use case because trades are intraday or held only for a few days.
- Live/automatic mark-to-market price updates.
- Dashboard-level unrealized P&L and total open portfolio valuation.
- Portfolio-level open position valuation.
- Capital allocation by setup, month, and financial year.

## Risk And Position Sizing

Implemented:

- Entry price.
- Initial stop-loss price.
- Active/current stop-loss price:
  - Defaults to the initial stop loss when a trade is created.
  - Can be updated after entry without changing original R calculations.
  - Can be moved to breakeven from the trade detail drawer.
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
- Current open risk:
  - `max(0, entryPrice - activeStopLoss) * remainingQuantity`
  - Uses active stop loss, not initial stop loss.
  - Breakeven or trailed-above-entry stops contribute zero open risk.
- Unrealized open-position metrics:
  - `unrealizedPnl = (currentPrice - entryPrice) * remainingQuantity`
  - `unrealizedR = unrealizedPnl / ((entryPrice - stopLoss) * originalQuantity)`
  - `unrealizedPortfolioImpactPercentage = unrealizedPnl / riskCapitalBase * 100`
  - Use remaining quantity only.
  - Use original stop loss for R denominator, not active stop loss.

Future scope:

- Planned target and planned reward-to-risk ratio.
- Position sizing simulator.
- Multi-scenario risk preview before saving a trade.
- Stop movement history with date, reason, and notes.
- Locked-profit display when active stop is above entry.
- Trailing-stop analytics.

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
- New Trade is treated as the primary journal action in the sidebar, visually separated from normal navigation destinations.
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
- Update active stop separately from the original stop loss.
- Move active stop to breakeven from the trade detail drawer.
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
- Historical audit trail for stop-loss movements.

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

- Multi-select screenshot upload for adding several timeframe screenshots in one action.
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
- Period-aware setup analytics on Dashboard:
  - Closed trade count.
  - Win rate.
  - R expectancy.
  - Average winning R.
  - Average losing R.
  - Median R.
  - Total closed-trade P&L.
  - Unassigned trade grouping.

Future scope:

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

- Dashboard is the quick command center, focused on monitoring what matters now instead of showing every diagnostic metric.
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
- Equity Curve:
  - Period-aware realized equity curve.
  - Uses booked realized exit ledger rows, including partial exits on their actual exit dates.
  - Groups multiple exits on the same date into one daily curve point.
  - Shows a flat curve for periods with capital history but no booked exits.
  - Shows an unavailable state for periods before capital history start.
  - Includes starting capital, ending capital, capital change, and max drawdown summary.
  - Shows a starting-capital baseline.
  - Uses green/red line tone based on whether ending capital is above or below starting capital.
  - Supports hover/focus inspection with selected date, capital, booked P&L, and change from period start.
  - Shows a crosshair, highlighted point, and in-chart tooltip for the selected curve point.
- Period Performance:
  - Booked P&L from all realized exits in the selected period.
  - Closed Trade P&L from fully closed trades only.
  - Open Realized P&L from exits booked on open or partially exited trades.
  - Closed trades count.
  - Win rate.
  - Max drawdown based on booked realized exits in exit-date order.
- Asymmetric Edge:
  - R Expectancy.
  - Average Winning R.
  - Average Losing R.
  - Median R.
  - Expectancy excluding largest winner.
  - Intentionally omits holding-day metrics so the dashboard stays focused on core edge.
- Setup Edge Preview:
  - Top three setups by R expectancy.
  - Shows setup name, closed trade count, R expectancy, and P&L.

## Analytics

Implemented:

- Analytics sidebar view for deeper diagnosis while keeping Dashboard lightweight.
- Uses the same active period selector/date range as Dashboard.
- Full Setup Analytics:
  - Period-aware table showing setup quality from fully closed trades.
  - Sorts setups by R expectancy, then trade count, then setup name.
  - Groups trades without a setup as Unassigned.
  - Shows closed trade count, win rate, R expectancy, average winning R, average losing R, median R, and total closed-trade P&L.
- Period R Distribution:
  - Visual horizontal bar panel.
  - Shows R distribution for fully closed trades in the selected dashboard period.
  - Bars show count and percentage per bucket.
  - Bars scale relative to the largest bucket in the selected period.
  - Loss, neutral/small-win, and winner buckets use distinct tones.
  - `<= -1R`
  - `-1R to 0R`
  - `0R to 1R`
  - `1R to 3R`
  - `3R to 5R`
  - `> 5R`
- Holding Time:
  - Period-aware average winner hold days.
  - Period-aware average loser hold days.
  - Uses fully closed trades in the selected period.
- Last N Closed Trades:
  - Sample-based view of the most recent fully closed entry trades.
  - Supports Last 10, Last 20, and Last 50.
  - Defaults to Last 20.
  - Open and partially exited trades are excluded.
  - Multiple exits still count as one entry trade.
  - Ordered by final exit date descending, then trade ID descending for ties.
  - Shows P&L, win rate, R expectancy, average winning R, average losing R, expectancy excluding largest winner, average winner hold days, and average loser hold days.
  - Includes a separate Last N R Distribution panel.
  - Last N analytics are independent of the selected dashboard period.
  - Last N hold-day metrics are sample-based and separate from the period-based Holding Time section.
- Execution Quality:
  - Rules followed P&L.
  - Rules broken P&L.
  - Best setup.
  - Worst setup.
- Mistakes:
  - Mistake frequency for selected period.

Current dashboard and analytics rules:

- Closed-trade quality metrics are filtered by final exit date.
- R Expectancy is the primary risk-normalized strategy-quality metric.
- R expectancy, R distribution, and winner/loser holding-day averages are based only on fully closed trades.
- Period R Distribution belongs to the selected dashboard period.
- Last N R Distribution belongs only to the selected last-N closed trade sample.
- Winner/loser holding-day averages use inclusive calendar days from entry date to final exit date.
- Partial exits from still-open trades affect Booked P&L and Open Realized P&L, but not win rate, average R, expectancy, R distribution, or holding-day averages.
- Booked P&L and max drawdown use realized exit booking dates, including partial exits.
- Equity curve uses booked realized exit dates, not final trade close dates.
- Capital is realized-only.
- Open trade counts and open risk are current account snapshot values, not period-filtered values.
- Open risk uses active stop loss and remaining quantity.
- Deep diagnostics generally belong in Analytics, while Dashboard should stay short and action-oriented.

Future scope:

- Any FY selector.
- Custom date range picker.
- Save preferred dashboard period.
- Dashboard/analytics charts:
  - Monthly/weekly P&L bars.
  - Setup distribution.
  - Mistake trend.
  - Unrealized/mark-to-market equity curve.
- Drill-down from dashboard cards to filtered trades.
- Analytics tabs if the stacked Analytics page becomes too long.
- Dedicated setup analytics page.
- Expectancy trend by month, setup, and financial year.
- Average R and Profit Factor in deeper analytics or money-focused reports.
- Outlier sensitivity analysis beyond excluding the single largest winner.
- Expectancy including only reviewed trades or only rule-following trades.
- Revisit drawdown variants later if needed:
  - Booked realized drawdown.
  - Closed-trade drawdown.
  - Unrealized/mark-to-market drawdown.

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
- Unrealized P&L.
- Unrealized R.
- Unrealized impact percentage.
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
- Manual current price and current price updated timestamp.
- Unrealized P&L, unrealized R, and unrealized impact percentage.
- Planned risk, actual risk, risk used.
- Initial stop loss, active stop loss, and current open risk.
- Position value and position percentage.
- Checklist.
- Add exit form.
- Edit trade form.
- Edit exit form.
- Review form.
- Active stop quick edit.
- Move active stop to breakeven action.
- Current price quick edit.

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
- Stop movement timeline.

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
- Broker tradebook/contract-note import for validating trades and calculating charges.

Example backup name:

```text
trading-journal-backup-2026-05-01.zip
```

## Suggested Next Enhancements

Recently left out of current scope:

- Custom dashboard date range picker.
- Any FY selector beyond Current FY and Last FY.
- Save preferred Last N sample size.
- Last N trade drill-down list from the dashboard section.
- Compare selected period vs Last N sample side by side.
- Stop movement history and stop movement notes.
- Locked-profit display when active stop is above entry.
- Including partial/open trades in expectancy analytics.
- Dashboard-level unrealized/mark-to-market metrics.
- Brokerage, charges, and tax-adjusted net P&L calculations.
- Full backup/export/import workflow.
- CSV export.
- Advanced filters for trade tables.
- Monthly review page.
- Weekly review page.
- Calendar view.
- Live market price integration for unrealized P&L.
- Broker contract note import.
- Brokerage, taxes, charges, and net P&L tracking.
- Intraday/STCG tax estimate tracking, with LTCG out of scope for now.
- Chart annotations.
- Advanced expectancy analytics.
- R distribution drill-down.
- Expectancy by setup and rule-following behavior.
- Position sizing simulator.
- Streak analysis.
- Drawdown analysis variants.
- Setup quality scoring.
- Mobile-friendly quick entry.
