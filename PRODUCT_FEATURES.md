# Trading Journal Product Features

## Product Goal

Create a local-first trading journal web app for Indian stock swing trading. The app should reduce friction while recording trades, track capital impact, and provide feedback through dashboards, reviews, and behavior metrics.

## User Profile

- Trades Indian stocks only
- Takes buy-side trades
- Usually enters once
- May exit in multiple parts
- May pyramid, but each pyramid entry is tracked as a separate trade
- Uses predefined setups
- Follows a pre-entry checklist
- Defines stop loss before entry
- Uses percentage-based risk per trade, where the percentage can vary by trade
- Wants emotional notes, lessons learned, screenshots, and detailed performance analytics

## Core Principles

- Local-first and free to use
- Durable data storage using SQLite
- Screenshots stored as local files, with file paths tracked in the database
- Low-friction trade entry
- Every trade should connect planning, execution, exit, review, and capital impact
- Export and restore should be supported so the journal can be moved to another computer

## Recommended Technical Direction

- Local web app
- React + TypeScript frontend
- SQLite-backed local database
- Local screenshot storage folder
- No cloud hosting required
- No paid services required

## Data Storage Structure

The app should eventually maintain a local data folder similar to:

```text
trading-journal-data/
  journal.db
  screenshots/
    entries/
    exits/
  backups/
```

SQLite should store trade data, exits, settings, capital ledger entries, reviews, and screenshot file references.

Screenshots should be stored as files instead of binary database records to keep the database smaller and easier to back up.

## Capital Tracking

### Starting Capital

- Initial capital: approximately Rs. 5.5 lakhs

### Capital Features

- Track starting capital
- Track current realized capital
- Track deposits
- Track withdrawals
- Track realized P&L from exits
- Track capital curve over time
- Track impact of every closed exit on capital
- Track open risk exposure
- Use realized P&L for capital updates in the first version

### Future Capital Features

- Optional mark-to-market tracking for unrealized P&L
- Portfolio-level open position valuation
- Capital allocation by trade/setup/month

## Risk Management

### Trade-Level Risk

Each trade should support:

- Entry price
- Stop loss
- Risk per share
- Risk percentage
- Risk amount
- Suggested quantity
- Actual quantity
- Position value
- Planned reward or target
- Planned risk-reward ratio

### Risk Calculation

Example:

```text
Current capital: Rs. 5,50,000
Risk: 1%
Risk amount: Rs. 5,500
Entry price: Rs. 500
Stop loss: Rs. 475
Risk per share: Rs. 25
Suggested quantity: 220
```

The user should be able to override quantity and risk percentage per trade.

## Trade Entry Features

Each trade entry should capture:

- Symbol
- Market, defaulted to India
- Direction, defaulted to Buy
- Entry date
- Entry price
- Quantity
- Stop loss
- Risk percentage
- Risk amount
- Setup
- Checklist responses
- Entry reason
- Emotional state before entry
- Confidence level
- Tags
- Entry screenshot
- Notes
- Trade status

Trade statuses:

- Open
- Partially exited
- Closed

## Exit Features

Each trade can have multiple exits.

Each exit should capture:

- Exit date
- Exit price
- Quantity exited
- Exit reason
- Exit screenshot
- Exit notes
- Emotional state during exit
- P&L for that exit
- R-multiple for that exit
- Capital impact

The parent trade should calculate:

- Total exited quantity
- Remaining quantity
- Average exit price
- Realized P&L
- Final R-multiple
- Whether the trade is open, partially exited, or closed

## Screenshots

The app should support:

- Entry screenshot upload
- Exit screenshot upload
- Multiple screenshots per trade if needed later
- Local file storage
- Preview inside the trade detail page
- Included screenshots in full backup/export

## Checklist Features

The app should support configurable pre-entry checklist items.

Checklist examples can be added later by the user. The system should support:

- Yes/no checklist items
- Optional notes per checklist item
- Checklist completion percentage
- Checklist score
- Ability to compare performance when checklist was followed vs not followed

## Setup Tracking

The app should support user-defined setups.

Each setup should be usable in analytics:

- Setup-wise P&L
- Setup-wise win rate
- Setup-wise average R
- Best setup
- Worst setup
- Setup frequency

## Mistake Tracking

The app should support mistake tags during trade review.

Analytics should include:

- Most frequent mistakes
- P&L impact by mistake
- Mistake frequency over time
- Mistakes by setup
- Mistakes by month

## Trade Review Features

After a trade is closed, the user should be able to review:

- Did I follow the plan?
- Did I follow the checklist?
- Rule-following score
- Emotional discipline score
- Mistake tags
- What went well?
- What went wrong?
- Lesson learned
- What should I repeat?
- What should I avoid?

## Dashboard Features

The dashboard should include:

- Current capital
- Starting capital
- Total realized P&L
- Monthly P&L
- Weekly P&L
- Win rate
- Average winner
- Average loser
- Profit factor
- Average R
- Expectancy
- Max drawdown
- Capital curve
- Open trades count
- Open risk exposure
- Best setup
- Worst setup
- Mistake frequency
- Rule-following score
- P&L when rules were followed vs broken

## Journal Views

### Open Trades

Should show:

- Symbol
- Entry date
- Entry price
- Quantity
- Remaining quantity
- Stop loss
- Risk amount
- Current status
- Setup
- Add exit action

### Closed Trades

Should show:

- Symbol
- Entry date
- Final exit date
- Total P&L
- Final R-multiple
- Setup
- Rule-following score
- Mistake tags
- Review status

### Trade Detail

Should show:

- Full trade plan
- Entry screenshot
- All partial exits
- Exit screenshots
- P&L summary
- R-multiple summary
- Capital impact
- Checklist
- Review and lessons

## Low-Friction Entry Experience

The trade entry flow should be fast and practical.

Important usability features:

- Default market to India
- Default direction to Buy
- Default date to today
- Default risk percentage from settings
- Auto-calculate suggested quantity
- Allow manual override
- Drag-and-drop screenshots
- Save draft or save trade
- Setup dropdown
- Checklist quick toggles
- Notes optional
- Add exit directly from open trades page

## Settings

The app should support:

- Starting capital
- Default risk percentage
- Setup list
- Checklist items
- Mistake tags
- Screenshot storage location
- Backup/export location

## Backup And Export

The app should eventually support:

- Export full journal backup as a zip file
- Include SQLite database
- Include screenshots
- Include settings
- Include capital ledger
- Include trades, exits, reviews, setups, checklist data, and mistakes
- Import backup on another computer
- Restore the app state exactly from backup

Example backup name:

```text
trading-journal-backup-2026-05-01.zip
```

## Suggested MVP Scope

Version 1 should include:

- Local app structure
- SQLite database
- Starting capital setting
- Trade creation
- Risk calculation
- Open trades page
- Add partial exits
- Closed trades page
- Trade detail page
- Basic dashboard
- Entry and exit screenshot upload
- Basic setup management
- Basic checklist management
- Basic mistake tags
- Trade review

## Later Enhancements

Possible future features:

- Full backup/export/import
- CSV export
- Advanced filters
- Monthly review page
- Weekly review page
- Calendar view
- Unrealized P&L tracking
- Broker contract note import
- Chart annotations
- More advanced expectancy analytics
- Position sizing simulator
- Streak analysis
- Setup quality scoring
- Mobile-friendly quick entry

