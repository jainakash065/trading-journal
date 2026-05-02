# Trading Journal Action Plan

## Purpose

Move the journal from outcome tracking toward process tracking, edge stability, and decision quality.

The current app already tracks a strong base of performance metrics. The next phase should focus on answering:

- Why did the result happen?
- Which setups deserve more capital?
- Which mistakes are repeatedly damaging expectancy?
- Is the edge stable across time, market conditions, and execution quality?

## Current Strengths

Already implemented or substantially covered:

- Dashboard/Analytics split:
  - Dashboard is now the quick command center.
  - Analytics is the deeper diagnosis area for setup, distribution, Last N, execution, and mistake analysis.
- R expectancy.
- Average winning R and average losing R.
- Winner vs loser holding days.
- R distribution and outlier sensitivity through expectancy excluding largest winner.
- Period-aware realized equity curve.
- Last N closed trade analytics.
- Setup selection on trades.
- Rule-following review fields.
- Mistake tagging.
- Planned risk, actual risk, risk used, position size percentage, and open risk.
- Manual current price and unrealized metrics for open trades.

This means the next roadmap should avoid rebuilding these basics and instead deepen them.

## Priority Roadmap

### Phase 1: Process And Edge Diagnostics

Goal: explain why expectancy changes and identify what to fix.

1. Expectancy Decomposition Trend
   - Track period-over-period changes in:
     - Win percentage.
     - Average winning R.
     - Average losing R.
     - R expectancy.
   - Add a dashboard or review section that shows which driver changed most.
   - Example insight: expectancy dropped because winners got smaller, not because win rate dropped.

2. Setup-Wise Expectancy
   - Expand setup analytics beyond best/worst setup.
   - Show per setup:
     - Closed trade count.
     - Win rate.
     - R expectancy.
     - Average winning R.
     - Average losing R.
     - Median R.
     - Total booked P&L.
   - Use this to decide which setups to scale, reduce, or remove.

3. Rule Adherence Analytics
   - Build a dashboard section comparing:
     - Trades where rules were followed.
     - Trades where rules were broken.
   - Compare:
     - R expectancy.
     - Win rate.
     - Average winning R.
     - Average losing R.
     - P&L.
   - This should make execution mistakes visible in risk-normalized terms.

4. Mistake Impact Analytics
   - Go beyond mistake frequency.
   - Show each mistake tag with:
     - Count.
     - Total P&L impact.
     - Average R.
     - R expectancy.
     - Most common setup association.
   - Primary goal: identify the most expensive repeated mistakes.

### Phase 2: Trade Quality And Exit Quality

Goal: understand whether entries, stops, and exits are efficient.

1. MFE / MAE Tracking
   - Add trade-level fields for:
     - Max favorable price.
     - Max adverse price.
   - Derive:
     - MFE in R.
     - MAE in R.
     - MFE capture percentage.
   - Use this to answer:
     - Am I cutting winners early?
     - Are stops too tight or too wide?
     - Are exits capturing enough of the move?

2. Exit Efficiency
   - For closed trades, compare:
     - Final realized R.
     - MFE R.
     - Difference between MFE and realized R.
   - Add setup-level exit efficiency later.
   - Example: average winner is 3R but average MFE is 5R, so exits may be too early.

3. R Per Day Held
   - Add time-efficiency metric:
     - `R per day = final trade R / holding days`
   - Show average R/day for:
     - Winners.
     - Losers.
     - Setups.
   - Use this to understand capital efficiency, not just profitability.

### Phase 3: Risk And Drawdown Quality

Goal: decide whether the system is emotionally and financially survivable.

1. R Equity Curve
   - Add cumulative R curve alongside the existing realized capital equity curve.
   - Use closed trades by final exit date for strategy R curve.
   - Consider a second booked-R curve later if partial exits should move the curve before trade close.

2. Drawdown In R
   - Add:
     - Max drawdown in R.
     - Average drawdown in R.
     - Recovery time after drawdown.
   - Keep rupee drawdown for account view, but use R drawdown for system-quality view.

3. Position Sizing Discipline
   - Expand current risk-used tracking into analytics:
     - Planned risk vs actual risk.
     - Over-risked trades.
     - Under-risked trades.
     - R expectancy when risk used is within plan vs outside plan.
   - This helps catch sizing drift.

### Phase 4: Context And Market Filters

Goal: learn when the system works and when it should be traded less.

1. Market Condition Tagging
   - Add a trade field for market condition:
     - Uptrend.
     - Sideways.
     - Downtrend.
   - Start as manual tagging.
   - Later, make it configurable or derive it from index trend.

2. Market-Condition Analytics
   - Show expectancy by market condition.
   - Compare setup performance across market regimes.
   - Example insight: breakout setup works in uptrend, fails in sideways market.

3. Trade Frequency And R Per Month
   - Add:
     - Trades per week.
     - Trades per month.
     - Closed R per month.
     - Booked R per month.
   - Use this to connect edge with opportunity frequency.

## Recommended Build Order

1. Setup-wise expectancy. Dashboard preview and Analytics-level setup table implemented; dedicated setup page remains future scope.
2. Rule adherence analytics.
3. Mistake impact analytics.
4. MFE / MAE tracking.
5. R equity curve and R drawdown.
6. R per day held.
7. Market condition tagging.
8. Trade frequency and R per month.

Reasoning:

- Setup, rule, and mistake analytics reuse data already being captured.
- MFE/MAE requires new inputs and user workflow, so it should come after the analytics foundation.
- R equity curve and R drawdown are valuable, but they become more actionable after setup/rule/mistake segmentation exists.
- Market condition tagging is powerful, but only after the core process metrics are stable.

## Product Principles For This Roadmap

- Keep Dashboard for monitoring and decision prompts; put deeper diagnostics in Analytics.
- Prioritize risk-normalized metrics over rupee-only metrics for strategy quality.
- Keep rupee metrics for capital/account tracking.
- Avoid adding fields unless they create a clear future dashboard insight.
- Every new tracking field should answer a review question.
- Do not overload the trade entry form; add advanced fields to review/detail flows where possible.
- Prefer manual inputs first, then automation later only if the metric proves useful.

## Future Scope

- Broker/import-assisted MFE and MAE.
- Automated market condition detection.
- Setup scoring and setup retirement recommendations.
- Mistake reduction goals.
- Monthly playbook review.
- Trade replay mode using screenshots and notes.
- Net expectancy after brokerage, taxes, and charges.
