import { Activity, BarChart3, BookOpen, ChartNoAxesCombined, ClipboardCheck, IndianRupee, Pencil, Plus, Settings as SettingsIcon, Trash2, X } from "lucide-react";
import { FormEvent, type PointerEvent, useEffect, useState } from "react";
import { apiDelete, apiGet, apiSend, endpoints, type AppData, type ClosedTradeFilters, type ClosedTradeOutcomeFilter, type ReferenceData, uploadScreenshots } from "./api";
import type { CapitalCurvePoint, Dashboard, DashboardPeriodKey, EntryMethodAnalyticsRow, LastNTradeCount, PagedTrades, RDistributionBucket, Settings, SetupAnalyticsRow, SetupEntryMethodAnalyticsRow, Trade, TradeExit } from "./types";

type View = "dashboard" | "analytics" | "new" | "open" | "closed" | "settings";

const today: string = new Date().toISOString().slice(0, 10);
const successToastDurationMs: number = 3000;
const defaultDashboardPeriod: DashboardPeriodKey = "this_month";
const dashboardPeriodOptions: readonly { readonly key: DashboardPeriodKey; readonly label: string }[] = [
  { key: "this_month", label: "This month" },
  { key: "this_week", label: "This week" },
  { key: "last_month", label: "Last month" },
  { key: "current_fy", label: "Current FY" },
  { key: "last_fy", label: "Last FY" },
  { key: "all_time", label: "All time" }
];
const defaultLastNTradeCount: LastNTradeCount = 20;
const closedTradePageSize: number = 50;
const lastNTradeOptions: readonly { readonly count: LastNTradeCount; readonly label: string }[] = [
  { count: 10, label: "Last 10" },
  { count: 20, label: "Last 20" },
  { count: 50, label: "Last 50" }
];
const defaultClosedTradeFilters: ClosedTradeFilters = { symbol: "", period: "all_time", setupId: "", entryMethodId: "", outcome: "all" };
const closedTradeOutcomeOptions: readonly { readonly key: ClosedTradeOutcomeFilter; readonly label: string }[] = [
  { key: "all", label: "All outcomes" },
  { key: "winners", label: "Winners" },
  { key: "losers", label: "Losers" },
  { key: "breakeven", label: "Breakeven" }
];

type StopLossEditedField = "percentage" | "price";
type ToastState = {
  readonly message: string;
  readonly tone: "success" | "error";
};
type ConfirmDialogState =
  | { readonly kind: "close"; readonly title: string; readonly message: string; readonly confirmLabel: string; readonly destructive: false }
  | { readonly kind: "delete-trade"; readonly title: string; readonly message: string; readonly confirmLabel: string; readonly destructive: true }
  | { readonly kind: "delete-exit"; readonly exitId: number; readonly title: string; readonly message: string; readonly confirmLabel: string; readonly destructive: true };

type TradeFormState = {
  readonly symbol: string;
  readonly market: string;
  readonly direction: string;
  readonly entryDate: string;
  readonly entryPrice: string;
  readonly quantity: string;
  readonly stopLossPercentage: string;
  readonly stopLoss: string;
  readonly stopLossLastEdited: StopLossEditedField;
  readonly activeStopLoss: string;
  readonly currentPrice: string;
  readonly riskPercentage: string;
  readonly riskCapitalBase: string;
  readonly setupId: string;
  readonly entryMethodId: string;
  readonly entryReason: string;
  readonly emotionalState: string;
  readonly confidence: string;
  readonly notes: string;
};

type ExitFormState = {
  readonly exitDate: string;
  readonly exitPrice: string;
  readonly quantity: string;
  readonly reason: string;
  readonly emotionalState: string;
  readonly notes: string;
};
type ScreenshotPreview = {
  readonly id: number;
  readonly url: string;
  readonly type: string;
};

type ReviewSaveStatus = "idle" | "saving" | "saved" | "error";

function createEmptyExitForm(): ExitFormState {
  return { exitDate: today, exitPrice: "", quantity: "", reason: "", emotionalState: "", notes: "" };
}

export function App(): JSX.Element {
  const [view, setView] = useState<View>("dashboard");
  const [dashboardPeriod, setDashboardPeriod] = useState<DashboardPeriodKey>(defaultDashboardPeriod);
  const [lastNTradeCount, setLastNTradeCount] = useState<LastNTradeCount>(defaultLastNTradeCount);
  const [data, setData] = useState<AppData | null>(null);
  const [selectedTradeId, setSelectedTradeId] = useState<number | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const reload = async (): Promise<void> => {
    const [dashboard, settings, referenceData, openTrades, closedTrades] = await Promise.all([
      apiGet<Dashboard>(endpoints.dashboard(dashboardPeriod, lastNTradeCount)),
      apiGet<Settings>(endpoints.settings),
      apiGet<ReferenceData>(endpoints.referenceData),
      apiGet<readonly Trade[]>(endpoints.openTrades),
      apiGet<PagedTrades>(endpoints.closedTrades({ ...defaultClosedTradeFilters, limit: closedTradePageSize, offset: 0 }))
    ]);
    setData({ dashboard, settings, referenceData, openTrades, closedTrades });
  };
  const clearToast = (): void => setToast(null);
  const showToast = (message: string, tone: ToastState["tone"] = "success"): void => setToast({ message, tone });
  const navigate = (nextView: View): void => {
    clearToast();
    setView(nextView);
  };
  const changeDashboardPeriod = async (period: DashboardPeriodKey): Promise<void> => {
    setDashboardPeriod(period);
    try {
      const dashboard: Dashboard = await apiGet<Dashboard>(endpoints.dashboard(period, lastNTradeCount));
      setData((current: AppData | null) => current ? { ...current, dashboard } : current);
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : "Unable to load dashboard", "error");
    }
  };
  const changeLastNTradeCount = async (count: LastNTradeCount): Promise<void> => {
    setLastNTradeCount(count);
    try {
      const dashboard: Dashboard = await apiGet<Dashboard>(endpoints.dashboard(dashboardPeriod, count));
      setData((current: AppData | null) => current ? { ...current, dashboard } : current);
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : "Unable to load last N trades", "error");
    }
  };
  useEffect(() => {
    reload().catch((error: unknown) => showToast(error instanceof Error ? error.message : "Unable to load journal", "error"));
  }, []);
  useEffect(() => {
    if (!toast || toast.tone !== "success") {
      return;
    }
    const timeoutId: number = window.setTimeout(clearToast, successToastDurationMs);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);
  if (!data) {
    return <main className="app-shell"><p className="loading">Loading trading journal...</p></main>;
  }
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Local journal</p>
          <h1>Trading Journal</h1>
        </div>
        <button className={view === "new" ? "sidebar-cta active" : "sidebar-cta"} onClick={() => navigate("new")} type="button">
          <Plus />
          <span>New Trade</span>
        </button>
        <nav>
          <NavButton active={view === "dashboard"} icon={<BarChart3 />} label="Dashboard" onClick={() => navigate("dashboard")} />
          <NavButton active={view === "analytics"} icon={<ChartNoAxesCombined />} label="Analytics" onClick={() => navigate("analytics")} />
          <NavButton active={view === "open"} icon={<Activity />} label="Open Trades" onClick={() => navigate("open")} />
          <NavButton active={view === "closed"} icon={<BookOpen />} label="Closed Trades" onClick={() => navigate("closed")} />
          <NavButton active={view === "settings"} icon={<SettingsIcon />} label="Settings" onClick={() => navigate("settings")} />
        </nav>
      </aside>
      <section className="workspace">
        {toast ? <Toast message={toast.message} tone={toast.tone} onDismiss={clearToast} /> : null}
        {view === "dashboard" ? <DashboardView dashboard={data.dashboard} period={dashboardPeriod} onPeriodChange={changeDashboardPeriod} /> : null}
        {view === "analytics" ? <AnalyticsView dashboard={data.dashboard} lastNTradeCount={lastNTradeCount} period={dashboardPeriod} onLastNTradeCountChange={changeLastNTradeCount} onPeriodChange={changeDashboardPeriod} /> : null}
        {view === "new" ? <NewTradeView data={data} onSaved={async () => { await reload(); setView("open"); showToast("Trade saved"); }} /> : null}
        {view === "open" ? <TradesView mode="open" title="Open Trades" trades={data.openTrades} onSelect={setSelectedTradeId} /> : null}
        {view === "closed" ? <ClosedTradesView initialPage={data.closedTrades} referenceData={data.referenceData} onSelect={setSelectedTradeId} /> : null}
        {view === "settings" ? <SettingsView data={data} onSaved={reload} /> : null}
      </section>
      {selectedTradeId ? <TradeDetail tradeId={selectedTradeId} referenceData={data.referenceData} onClose={() => setSelectedTradeId(null)} onChanged={reload} onDeleted={async () => { setSelectedTradeId(null); await reload(); showToast("Trade deleted"); }} /> : null}
    </main>
  );
}

function Toast(props: { readonly message: string; readonly tone: ToastState["tone"]; readonly onDismiss: () => void }): JSX.Element {
  return (
    <div className={`toast ${props.tone}`} role={props.tone === "error" ? "alert" : "status"}>
      <span>{props.message}</span>
      <button aria-label="Dismiss message" className="toast-dismiss" onClick={props.onDismiss} type="button"><X size={16} /></button>
    </div>
  );
}

function ConfirmDialog(props: {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel: string;
  readonly destructive: boolean;
  readonly saving: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}): JSX.Element {
  return (
    <div aria-modal="true" className="confirm-layer" role="dialog">
      <button aria-label="Cancel confirmation" className="confirm-backdrop" onClick={props.onCancel} type="button" />
      <section className="confirm-dialog">
        <header className="confirm-header">
          <h2>{props.title}</h2>
          <button aria-label="Cancel confirmation" className="icon-secondary" disabled={props.saving} onClick={props.onCancel} type="button"><X size={18} /></button>
        </header>
        <p>{props.message}</p>
        <div className="form-actions confirm-actions">
          <button className="ghost" disabled={props.saving} onClick={props.onCancel} type="button">Cancel</button>
          <button className={props.destructive ? "danger" : "primary"} disabled={props.saving} onClick={props.onConfirm} type="button">{props.saving ? "Working..." : props.confirmLabel}</button>
        </div>
      </section>
    </div>
  );
}

function NavButton(props: { readonly active: boolean; readonly icon: JSX.Element; readonly label: string; readonly onClick: () => void }): JSX.Element {
  return <button className={props.active ? "nav-button active" : "nav-button"} onClick={props.onClick} type="button">{props.icon}<span>{props.label}</span></button>;
}

function DashboardView(props: {
  readonly dashboard: Dashboard;
  readonly period: DashboardPeriodKey;
  readonly onPeriodChange: (period: DashboardPeriodKey) => Promise<void>;
}): JSX.Element {
  const d = props.dashboard;
  return (
    <>
      <DashboardHeader dashboard={d} eyebrow="Performance" period={props.period} title="Dashboard" onPeriodChange={props.onPeriodChange} />
      <section className="dashboard-section">
        <h3>Account Snapshot</h3>
        <div className="metric-grid snapshot-grid">
          <Metric label="Current capital" value={money(d.currentCapital)} icon={<IndianRupee />} />
          <Metric label="Open trades" value={String(d.openTrades)} />
          <Metric label="Open risk" value={money(d.openRiskExposure)} />
        </div>
      </section>
      <section className="dashboard-section">
        <h3>Period Capital</h3>
        {!d.periodCapitalAvailable ? (
          <p className="info-note">No capital history for this period. Capital tracking starts on {formatDisplayDate(d.capitalHistoryStartDate)}.</p>
        ) : null}
        <div className="metric-grid snapshot-grid">
          <Metric label="Starting capital" value={formatOptionalMoney(d.periodStartingCapital)} />
          <Metric label="Ending capital" value={formatOptionalMoney(d.periodEndingCapital)} />
          <Metric
            label="Capital change"
            tone={getNullableTone(d.periodCapitalChange)}
            value={formatCapitalChange(d.periodCapitalChange, d.periodCapitalChangePercentage)}
          />
        </div>
      </section>
      <section className="dashboard-section">
        <h3>Equity Curve</h3>
        <EquityCurvePanel dashboard={d} />
      </section>
      <section className="dashboard-section">
        <h3>Period Performance</h3>
        <div className="metric-grid">
          <Metric label="Booked P&L" value={money(d.periodBookedPnl)} tone={getNumberTone(d.periodBookedPnl)} />
          <Metric label="Closed Trade P&L" value={money(d.periodClosedTradePnl)} tone={getNumberTone(d.periodClosedTradePnl)} />
          <Metric label="Open Realized P&L" value={money(d.periodOpenRealizedPnl)} tone={getNumberTone(d.periodOpenRealizedPnl)} />
          <Metric label="Closed trades" value={String(d.periodClosedTrades)} />
          <Metric label="Win rate" value={`${d.winRate}%`} />
          <Metric label="Max drawdown" value={money(d.maxDrawdown)} tone="bad" />
        </div>
      </section>
      <section className="dashboard-section">
        <h3>Asymmetric Edge</h3>
        <div className="metric-grid">
          <Metric label="R Expectancy" value={formatR(d.rExpectancy)} tone={getNumberTone(d.rExpectancy)} />
          <Metric label="Avg Winning R" value={formatR(d.averageWinningR)} tone="good" />
          <Metric label="Avg Losing R" value={formatR(d.averageLosingR)} tone="bad" />
          <Metric label="Median R" value={formatR(d.medianR)} tone={getNumberTone(d.medianR)} />
          <Metric label="Expectancy Ex-Largest" value={formatR(d.expectancyWithoutLargestWinner)} tone={getNumberTone(d.expectancyWithoutLargestWinner)} />
        </div>
      </section>
      <section className="dashboard-section">
        <h3>Setup Edge Preview</h3>
        <SetupPreviewPanel rows={d.setupAnalytics} />
      </section>
    </>
  );
}

function AnalyticsView(props: {
  readonly dashboard: Dashboard;
  readonly lastNTradeCount: LastNTradeCount;
  readonly period: DashboardPeriodKey;
  readonly onLastNTradeCountChange: (count: LastNTradeCount) => Promise<void>;
  readonly onPeriodChange: (period: DashboardPeriodKey) => Promise<void>;
}): JSX.Element {
  const d = props.dashboard;
  return (
    <>
      <DashboardHeader dashboard={d} eyebrow="Deep diagnosis" period={props.period} title="Analytics" onPeriodChange={props.onPeriodChange} />
      <section className="dashboard-section">
        <h3>Setup Analytics</h3>
        <SetupAnalyticsPanel rows={d.setupAnalytics} />
      </section>
      <section className="dashboard-section">
        <h3>Entry Method Analytics</h3>
        <EntryMethodAnalyticsPanel rows={d.entryMethodAnalytics} />
      </section>
      <section className="dashboard-section">
        <h3>Setup + Entry Method Analytics</h3>
        <SetupEntryMethodAnalyticsPanel rows={d.setupEntryMethodAnalytics} />
      </section>
      <section className="dashboard-section">
        <h3>R Distribution</h3>
        <RDistributionPanel buckets={d.rDistribution} subtitle={`${getDistributionTotal(d.rDistribution)} closed trades in this period`} title="Period R Distribution" />
      </section>
      <HoldingTimePanel dashboard={d} />
      <LastNClosedTradesSection dashboard={d} lastNTradeCount={props.lastNTradeCount} onLastNTradeCountChange={props.onLastNTradeCountChange} />
      <div className="split">
        <ExecutionQualityPanel dashboard={d} />
        <MistakesPanel dashboard={d} />
      </div>
    </>
  );
}

function HoldingTimePanel(props: { readonly dashboard: Dashboard }): JSX.Element {
  const d = props.dashboard;
  return (
    <section className="dashboard-section">
      <h3>Holding Time</h3>
      <div className="metric-grid snapshot-grid">
        <Metric label="Avg Winner Hold" value={formatHoldDays(d.averageWinningHoldDays)} tone="good" />
        <Metric label="Avg Loser Hold" value={formatHoldDays(d.averageLosingHoldDays)} tone="bad" />
      </div>
    </section>
  );
}

function DashboardHeader(props: {
  readonly dashboard: Dashboard;
  readonly eyebrow: string;
  readonly period: DashboardPeriodKey;
  readonly title: string;
  readonly onPeriodChange: (period: DashboardPeriodKey) => Promise<void>;
}): JSX.Element {
  return (
    <header className="page-header dashboard-header">
      <div>
        <p className="eyebrow">{props.eyebrow}</p>
        <h2>{props.title}</h2>
        <p className="period-range">{formatPeriodRange(props.dashboard.period.startDate ?? props.dashboard.capitalHistoryStartDate, props.dashboard.period.endDate)}</p>
      </div>
      <label className="period-selector">
        <span>Period</span>
        <select value={props.period} onChange={(event) => props.onPeriodChange(event.target.value as DashboardPeriodKey)}>
          {dashboardPeriodOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
        </select>
      </label>
    </header>
  );
}

function SetupPreviewPanel(props: { readonly rows: readonly SetupAnalyticsRow[] }): JSX.Element {
  const previewRows: readonly SetupAnalyticsRow[] = props.rows.slice(0, 3);
  if (previewRows.length === 0) {
    return <section className="panel"><p className="muted">No closed setup data in this period.</p></section>;
  }
  return (
    <section className="panel setup-preview-panel">
      <div className="setup-preview-table">
        <div className="setup-preview-head"><span>Setup</span><span>Trades</span><span>R Expectancy</span><span>P&L</span></div>
        {previewRows.map((row: SetupAnalyticsRow) => (
          <div className="setup-preview-row" key={row.setupName}>
            <span><strong>{row.setupName}</strong></span>
            <span>{row.closedTrades}</span>
            <span className={getToneClass(row.rExpectancy)}>{formatR(row.rExpectancy)}</span>
            <span className={getToneClass(row.pnl)}>{money(row.pnl)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function LastNClosedTradesSection(props: {
  readonly dashboard: Dashboard;
  readonly lastNTradeCount: LastNTradeCount;
  readonly onLastNTradeCountChange: (count: LastNTradeCount) => Promise<void>;
}): JSX.Element {
  const d = props.dashboard;
  return (
    <section className="dashboard-section">
      <div className="dashboard-section-header">
        <div>
          <h3>Last N Closed Trades</h3>
          <p className="muted">Most recent {d.lastNTrades.actualCount} fully closed entry trades</p>
        </div>
        <label className="period-selector">
          <span>Sample</span>
          <select value={props.lastNTradeCount} onChange={(event) => props.onLastNTradeCountChange(Number(event.target.value) as LastNTradeCount)}>
            {lastNTradeOptions.map((option) => <option key={option.count} value={option.count}>{option.label}</option>)}
          </select>
        </label>
      </div>
      <div className="analytics-with-distribution">
        <div className="analytics-main metric-grid">
          <Metric label="P&L" value={money(d.lastNTrades.pnl)} tone={getNumberTone(d.lastNTrades.pnl)} />
          <Metric label="Win rate" value={`${d.lastNTrades.winRate}%`} />
          <Metric label="R Expectancy" value={formatR(d.lastNTrades.rExpectancy)} tone={getNumberTone(d.lastNTrades.rExpectancy)} />
          <Metric label="Avg Winning R" value={formatR(d.lastNTrades.averageWinningR)} tone="good" />
          <Metric label="Avg Losing R" value={formatR(d.lastNTrades.averageLosingR)} tone="bad" />
          <Metric label="Expectancy Ex-Largest" value={formatR(d.lastNTrades.expectancyWithoutLargestWinner)} tone={getNumberTone(d.lastNTrades.expectancyWithoutLargestWinner)} />
          <Metric label="Avg Winner Hold" value={formatHoldDays(d.lastNTrades.averageWinningHoldDays)} tone="good" />
          <Metric label="Avg Loser Hold" value={formatHoldDays(d.lastNTrades.averageLosingHoldDays)} tone="bad" />
        </div>
        <div className="analytics-side">
          <RDistributionPanel buckets={d.lastNTrades.rDistribution} subtitle={`${d.lastNTrades.actualCount} closed trades in this sample`} title="Last N R Distribution" />
        </div>
      </div>
    </section>
  );
}

function ExecutionQualityPanel(props: { readonly dashboard: Dashboard }): JSX.Element {
  const d = props.dashboard;
  return (
    <section className="panel">
      <h2>Execution Quality</h2>
      <div className="two-col">
        <Metric label="Rules followed P&L" value={money(d.ruleFollowedPnl)} />
        <Metric label="Rules broken P&L" value={money(d.ruleBrokenPnl)} />
        <Metric label="Best setup" value={d.bestSetup} />
        <Metric label="Worst setup" value={d.worstSetup} />
      </div>
    </section>
  );
}

function MistakesPanel(props: { readonly dashboard: Dashboard }): JSX.Element {
  const d = props.dashboard;
  return (
    <section className="panel">
      <h2>Mistakes</h2>
      {d.mistakeFrequency.length === 0 ? <p className="muted">No reviewed mistakes in this period.</p> : d.mistakeFrequency.map((item) => (
        <div className="row" key={item.label}><span>{item.label}</span><strong>{item.count}</strong></div>
      ))}
    </section>
  );
}

function RDistributionPanel(props: { readonly buckets: readonly RDistributionBucket[]; readonly subtitle: string; readonly title: string }): JSX.Element {
  const totalCount: number = getDistributionTotal(props.buckets);
  const maxCount: number = getDistributionMax(props.buckets);
  return (
    <section className="panel">
      <h2>{props.title}</h2>
      <p className="muted">{props.subtitle}</p>
      <div className="distribution-list">
        {props.buckets.map((bucket: RDistributionBucket) => (
          <div className="distribution-row" key={bucket.label}>
            <span className="distribution-label">{bucket.label}</span>
            <span className="distribution-track" aria-label={`${bucket.label}: ${bucket.count} trades, ${formatDistributionPercentage(bucket.count, totalCount)}`}>
              <span className={`distribution-bar ${getDistributionToneClass(bucket.label)}`} style={{ width: `${getDistributionWidth(bucket.count, maxCount)}%` }} />
            </span>
            <strong>{bucket.count} · {formatDistributionPercentage(bucket.count, totalCount)}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function SetupAnalyticsPanel(props: { readonly rows: readonly SetupAnalyticsRow[] }): JSX.Element {
  if (props.rows.length === 0) {
    return <section className="panel"><p className="muted">No closed trades with setups in this period.</p></section>;
  }
  return (
    <section className="panel setup-analytics-panel">
      <div className="setup-analytics-table">
        <div className="setup-analytics-head">
          <span>Setup</span><span>Trades</span><span>Win %</span><span>R Expectancy</span><span>Avg Win R</span><span>Avg Loss R</span><span>Median R</span><span>P&L</span>
        </div>
        {props.rows.map((row: SetupAnalyticsRow) => (
          <div className="setup-analytics-row" key={row.setupName}>
            <span><strong>{row.setupName}</strong></span>
            <span>{row.closedTrades}</span>
            <span>{row.winRate}%</span>
            <span className={getToneClass(row.rExpectancy)}>{formatR(row.rExpectancy)}</span>
            <span className="good-text">{formatR(row.averageWinningR)}</span>
            <span className="bad-text">{formatR(row.averageLosingR)}</span>
            <span className={getToneClass(row.medianR)}>{formatR(row.medianR)}</span>
            <span className={getToneClass(row.pnl)}>{money(row.pnl)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function EntryMethodAnalyticsPanel(props: { readonly rows: readonly EntryMethodAnalyticsRow[] }): JSX.Element {
  if (props.rows.length === 0) {
    return <section className="panel"><p className="muted">No closed trades with entry methods in this period.</p></section>;
  }
  return (
    <section className="panel setup-analytics-panel">
      <div className="setup-analytics-table">
        <div className="setup-analytics-head">
          <span>Entry Method</span><span>Trades</span><span>Win %</span><span>R Expectancy</span><span>Avg Win R</span><span>Avg Loss R</span><span>Median R</span><span>P&L</span>
        </div>
        {props.rows.map((row: EntryMethodAnalyticsRow) => (
          <div className="setup-analytics-row" key={row.entryMethodName}>
            <span><strong>{row.entryMethodName}</strong></span>
            <span>{row.closedTrades}</span>
            <span>{row.winRate}%</span>
            <span className={getToneClass(row.rExpectancy)}>{formatR(row.rExpectancy)}</span>
            <span className="good-text">{formatR(row.averageWinningR)}</span>
            <span className="bad-text">{formatR(row.averageLosingR)}</span>
            <span className={getToneClass(row.medianR)}>{formatR(row.medianR)}</span>
            <span className={getToneClass(row.pnl)}>{money(row.pnl)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function SetupEntryMethodAnalyticsPanel(props: { readonly rows: readonly SetupEntryMethodAnalyticsRow[] }): JSX.Element {
  if (props.rows.length === 0) {
    return <section className="panel"><p className="muted">No closed setup and entry method combinations in this period.</p></section>;
  }
  return (
    <section className="panel setup-entry-method-panel">
      <div className="setup-entry-method-table">
        <div className="setup-entry-method-head">
          <span>Setup</span><span>Entry Method</span><span>Trades</span><span>Win %</span><span>R Expectancy</span><span>Avg Win R</span><span>Avg Loss R</span><span>Median R</span><span>P&L</span>
        </div>
        {props.rows.map((row: SetupEntryMethodAnalyticsRow) => (
          <div className="setup-entry-method-row" key={`${row.setupName}-${row.entryMethodName}`}>
            <span><strong>{row.setupName}</strong></span>
            <span>{row.entryMethodName}</span>
            <span>{row.closedTrades}</span>
            <span>{row.winRate}%</span>
            <span className={getToneClass(row.rExpectancy)}>{formatR(row.rExpectancy)}</span>
            <span className="good-text">{formatR(row.averageWinningR)}</span>
            <span className="bad-text">{formatR(row.averageLosingR)}</span>
            <span className={getToneClass(row.medianR)}>{formatR(row.medianR)}</span>
            <span className={getToneClass(row.pnl)}>{money(row.pnl)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function EquityCurvePanel(props: { readonly dashboard: Dashboard }): JSX.Element {
  const d = props.dashboard;
  const latestPointIndex: number = Math.max(d.capitalCurve.length - 1, 0);
  const [selectedPointIndex, setSelectedPointIndex] = useState<number>(latestPointIndex);
  useEffect(() => {
    setSelectedPointIndex(latestPointIndex);
  }, [latestPointIndex, d.period.key, d.period.startDate, d.period.endDate]);
  if (!d.periodCapitalAvailable || d.capitalCurve.length === 0 || d.periodStartingCapital === null || d.periodEndingCapital === null) {
    return <section className="panel"><p className="muted">No capital history for this period.</p></section>;
  }
  const selectedPoint: CapitalCurvePoint = d.capitalCurve[Math.min(selectedPointIndex, latestPointIndex)] ?? d.capitalCurve[latestPointIndex];
  const selectedChangeFromStart: number = selectedPoint.capital - d.periodStartingCapital;
  const lineTone: string = d.periodEndingCapital >= d.periodStartingCapital ? "good" : "bad";
  return (
    <section className="panel equity-panel">
      <div className="equity-summary">
        <Metric label="Starting capital" value={money(d.periodStartingCapital)} />
        <Metric label="Ending capital" value={money(d.periodEndingCapital)} />
        <Metric label="Change" value={formatCapitalChange(d.periodCapitalChange, d.periodCapitalChangePercentage)} tone={getNullableTone(d.periodCapitalChange)} />
        <Metric label="Max drawdown" value={money(d.maxDrawdown)} tone="bad" />
      </div>
      <div className="equity-selected-summary" aria-live="polite">
        <Metric label="Selected date" value={formatDisplayDate(selectedPoint.date)} />
        <Metric label="Capital" value={money(selectedPoint.capital)} />
        <Metric label="Booked P&L" value={money(selectedPoint.dailyPnl)} tone={getNumberTone(selectedPoint.dailyPnl)} />
        <Metric label="From period start" value={money(selectedChangeFromStart)} tone={getNumberTone(selectedChangeFromStart)} />
      </div>
      <EquityCurveSvg
        baseline={d.periodStartingCapital}
        onPointSelect={setSelectedPointIndex}
        onPointerExit={() => setSelectedPointIndex(latestPointIndex)}
        points={d.capitalCurve}
        selectedIndex={Math.min(selectedPointIndex, latestPointIndex)}
        tone={lineTone}
      />
    </section>
  );
}

function EquityCurveSvg(props: {
  readonly baseline: number;
  readonly onPointSelect: (index: number) => void;
  readonly onPointerExit: () => void;
  readonly points: readonly CapitalCurvePoint[];
  readonly selectedIndex: number;
  readonly tone: string;
}): JSX.Element {
  const dimensions = { width: 720, height: 240, paddingX: 34, paddingY: 22 };
  const capitals: readonly number[] = props.points.map((point: CapitalCurvePoint) => point.capital);
  const minCapital: number = Math.min(props.baseline, ...capitals);
  const maxCapital: number = Math.max(props.baseline, ...capitals);
  const range: number = Math.max(maxCapital - minCapital, 1);
  const xForIndex = (index: number): number => dimensions.paddingX + (index / Math.max(props.points.length - 1, 1)) * (dimensions.width - dimensions.paddingX * 2);
  const yForCapital = (capital: number): number => dimensions.height - dimensions.paddingY - ((capital - minCapital) / range) * (dimensions.height - dimensions.paddingY * 2);
  const path: string = props.points.map((point: CapitalCurvePoint, index: number) => `${index === 0 ? "M" : "L"} ${xForIndex(index).toFixed(2)} ${yForCapital(point.capital).toFixed(2)}`).join(" ");
  const baselineY: number = yForCapital(props.baseline);
  const selectedPoint: CapitalCurvePoint = props.points[props.selectedIndex];
  const selectedX: number = xForIndex(props.selectedIndex);
  const selectedY: number = yForCapital(selectedPoint.capital);
  const handlePointerMove = (event: PointerEvent<SVGSVGElement>): void => {
    const svgRect: DOMRect = event.currentTarget.getBoundingClientRect();
    const pointerX: number = ((event.clientX - svgRect.left) / svgRect.width) * dimensions.width;
    props.onPointSelect(getNearestCurvePointIndex({ pointerX, points: props.points, xForIndex }));
  };
  return (
    <svg aria-label="Realized equity curve" className="equity-chart" onPointerLeave={props.onPointerExit} onPointerMove={handlePointerMove} role="img" viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}>
      <line className="equity-baseline" x1={dimensions.paddingX} x2={dimensions.width - dimensions.paddingX} y1={baselineY} y2={baselineY} />
      <path className={`equity-line ${props.tone}`} d={path} />
      <line className="equity-crosshair" x1={selectedX} x2={selectedX} y1={dimensions.paddingY} y2={dimensions.height - dimensions.paddingY} />
      {props.points.map((point: CapitalCurvePoint, index: number) => (
        <circle
          aria-label={`${point.date}, capital ${money(point.capital)}, booked P&L ${money(point.dailyPnl)}`}
          className={index === props.selectedIndex ? "equity-point equity-point-selected" : "equity-point"}
          cx={xForIndex(index)}
          cy={yForCapital(point.capital)}
          key={`${point.date}-${index}`}
          onFocus={() => props.onPointSelect(index)}
          r={index === props.selectedIndex ? 6 : 4}
          tabIndex={0}
        >
          <title>{point.date} · Capital {money(point.capital)} · Booked P&L {money(point.dailyPnl)}</title>
        </circle>
      ))}
      <g className="equity-tooltip" transform={`translate(${Math.min(selectedX + 12, dimensions.width - 180)} ${Math.max(selectedY - 46, 12)})`}>
        <rect height="42" rx="6" width="168" />
        <text x="10" y="17">{formatDisplayDate(selectedPoint.date)}</text>
        <text x="10" y="33">{money(selectedPoint.capital)} · {money(selectedPoint.dailyPnl)}</text>
      </g>
      <text className="equity-axis-label" x={dimensions.paddingX} y={dimensions.height - 4}>{props.points[0]?.date}</text>
      <text className="equity-axis-label" textAnchor="end" x={dimensions.width - dimensions.paddingX} y={dimensions.height - 4}>{props.points[props.points.length - 1]?.date}</text>
    </svg>
  );
}

function getNearestCurvePointIndex(params: {
  readonly pointerX: number;
  readonly points: readonly CapitalCurvePoint[];
  readonly xForIndex: (index: number) => number;
}): number {
  return params.points.reduce((nearestIndex: number, _point: CapitalCurvePoint, index: number) => {
    const currentDistance: number = Math.abs(params.xForIndex(index) - params.pointerX);
    const nearestDistance: number = Math.abs(params.xForIndex(nearestIndex) - params.pointerX);
    return currentDistance < nearestDistance ? index : nearestIndex;
  }, 0);
}

function NewTradeView(props: { readonly data: AppData; readonly onSaved: () => Promise<void> }): JSX.Element {
  const [form, setForm] = useState({
    symbol: "",
    market: "India",
    direction: "Buy",
    entryDate: today,
    entryPrice: "",
    quantity: "",
    stopLossPercentage: "",
    stopLoss: "",
    stopLossLastEdited: "price" as StopLossEditedField,
    activeStopLoss: "",
    currentPrice: "",
    riskPercentage: props.data.settings.defaultRiskPercentage ?? "1",
    riskCapitalBase: String(props.data.settings.currentCapital),
    setupId: "",
    entryMethodId: "",
    entryReason: "",
    emotionalState: "",
    confidence: "3",
    notes: ""
  });
  const [checks, setChecks] = useState<Record<number, boolean>>({});
  const [files, setFiles] = useState<readonly File[]>([]);
  const [saving, setSaving] = useState(false);
  const riskAmount = Number(form.riskCapitalBase) * (Number(form.riskPercentage) / 100);
  const riskPerShare = Math.max(Number(form.entryPrice) - Number(form.stopLoss), 0);
  const suggestedQuantity = riskPerShare > 0 ? Math.floor(riskAmount / riskPerShare) : 0;
  const actualRisk = riskPerShare * Number(form.quantity || suggestedQuantity || 0);
  const riskUsedPercentage = riskAmount > 0 ? (actualRisk / riskAmount) * 100 : 0;
  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (saving) {
      return;
    }
    setSaving(true);
    try {
      const response = await apiSend<{ readonly id: number }>("/api/trades", "POST", {
        symbol: form.symbol,
        market: "India",
        direction: "Buy",
        entryDate: form.entryDate,
        entryPrice: Number(form.entryPrice),
        quantity: Number(form.quantity || suggestedQuantity),
        stopLoss: Number(form.stopLoss),
        riskPercentage: Number(form.riskPercentage),
        riskCapitalBase: Number(form.riskCapitalBase),
        setupId: form.setupId ? Number(form.setupId) : null,
        entryMethodId: form.entryMethodId ? Number(form.entryMethodId) : null,
        entryReason: form.entryReason,
        emotionalState: form.emotionalState,
        confidence: Number(form.confidence),
        notes: form.notes,
        checklistResponses: props.data.referenceData.checklistItems.map((item) => ({ itemId: item.id, checked: Boolean(checks[item.id]), notes: "" }))
      });
      await uploadScreenshots(`/api/trades/${response.id}/screenshots/entry`, files);
      await props.onSaved();
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <Header eyebrow="Plan" title="New Trade" />
      <form className="form-grid" onSubmit={submit}>
        <Input label="Symbol" value={form.symbol} onChange={(value) => setForm({ ...form, symbol: value })} required />
        <Input label="Entry date" type="date" value={form.entryDate} onChange={(value) => setForm({ ...form, entryDate: value })} required />
        <Input label="Entry price" type="number" value={form.entryPrice} onChange={(value) => setForm(updateEntryPrice(form, value))} required />
        <StopLossControl
          percentage={form.stopLossPercentage}
          price={form.stopLoss}
          onPercentageChange={(value) => setForm(updateStopLossPercentage(form, value))}
          onPriceChange={(value) => setForm(updateStopLossPrice(form, value))}
        />
        <Input label="Risk %" type="number" value={form.riskPercentage} onChange={(value) => setForm({ ...form, riskPercentage: value })} required />
        <Input label="Risk capital base" type="number" value={form.riskCapitalBase} onChange={(value) => setForm({ ...form, riskCapitalBase: value })} required />
        <Input label={`Quantity · suggested ${suggestedQuantity}`} type="number" value={form.quantity} onChange={(value) => setForm({ ...form, quantity: value })} />
        <div className="derived-metric"><span>Planned risk</span><strong>{money(riskAmount)}</strong></div>
        <div className="derived-metric"><span>Actual risk</span><strong>{money(actualRisk)}</strong></div>
        <div className="derived-metric"><span>Risk used</span><strong>{riskUsedPercentage.toFixed(2)}%</strong></div>
        <label><span>Setup</span><select value={form.setupId} onChange={(event) => setForm({ ...form, setupId: event.target.value })}><option value="">Select setup</option>{props.data.referenceData.setups.map((setup) => <option key={setup.id} value={setup.id}>{setup.name}</option>)}</select></label>
        <label><span>Entry Method</span><select value={form.entryMethodId} onChange={(event) => setForm({ ...form, entryMethodId: event.target.value })}><option value="">Select entry method</option>{props.data.referenceData.entryMethods.map((entryMethod) => <option key={entryMethod.id} value={entryMethod.id}>{entryMethod.name}</option>)}</select></label>
        <Input label="Confidence 1-5" type="number" value={form.confidence} onChange={(value) => setForm({ ...form, confidence: value })} />
        <label className="wide"><span>Entry reason</span><textarea value={form.entryReason} onChange={(event) => setForm({ ...form, entryReason: event.target.value })} /></label>
        <label className="wide"><span>Emotional state</span><textarea value={form.emotionalState} onChange={(event) => setForm({ ...form, emotionalState: event.target.value })} /></label>
        <label className="wide"><span>Notes</span><textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
        <label className="wide file-drop"><span>Entry screenshots</span><input type="file" accept="image/*" multiple onChange={(event) => setFiles(filesFromInput(event.target.files))} /><small>{formatSelectedFileCount(files)}</small></label>
        <section className="wide checklist">
          <h2><ClipboardCheck size={18} /> Checklist</h2>
          {props.data.referenceData.checklistItems.map((item) => (
            <label className="check-row" key={item.id}><input checked={Boolean(checks[item.id])} type="checkbox" onChange={(event) => setChecks({ ...checks, [item.id]: event.target.checked })} />{item.label}</label>
          ))}
        </section>
        <button className="primary wide" disabled={saving} type="submit">{saving ? "Saving..." : "Save Trade"}</button>
      </form>
    </>
  );
}

function TradesView(props: { readonly mode: "open" | "closed"; readonly title: string; readonly trades: readonly Trade[]; readonly onSelect: (id: number) => void }): JSX.Element {
  const finalColumnLabel: string = props.mode === "closed" ? "Duration" : "Status";
  return (
    <>
      <Header eyebrow="Journal" title={props.title} />
      <div className={`table ${props.mode === "open" ? "open-trades-table" : "closed-trades-table"}`}>
        <div className="table-head">
          <span>Symbol</span><span>Entry</span><span>Qty</span><span>Position %</span><span>Impact %</span><span>P&L</span><span>R</span>
          {props.mode === "open" ? <><span>Unrealized P&L</span><span>Unrealized R</span><span>Unrealized Impact %</span></> : null}
          <span>{finalColumnLabel}</span>
        </div>
        {props.trades.map((trade) => (
          <button className="table-row" key={trade.id} onClick={() => props.onSelect(trade.id)} type="button">
            <span><strong>{trade.symbol}</strong><small>{formatTradeClassification(trade)}</small></span>
            <span>{money(trade.entryPrice)}<small>{trade.entryDate}</small></span>
            <span>{formatTableQuantity(props.mode, trade)}</span>
            <span>{formatPercent(trade.positionSizePercentage)}</span>
            <span>{formatSignedPercent(trade.summary.portfolioImpactPercentage)}</span>
            <span>{money(trade.summary.realizedPnl)}</span>
            <span>{trade.summary.finalRMultiple}</span>
            {props.mode === "open" ? <><span>{money(trade.unrealizedPnl)}</span><span>{formatR(trade.unrealizedR)}</span><span>{formatSignedPercent(trade.unrealizedPortfolioImpactPercentage)}</span></> : null}
            <span>{props.mode === "closed" ? formatDuration(trade.summary.durationDays) : trade.summary.status.replace("_", " ")}</span>
          </button>
        ))}
      </div>
    </>
  );
}

function ClosedTradesView(props: { readonly initialPage: PagedTrades; readonly referenceData: ReferenceData; readonly onSelect: (id: number) => void }): JSX.Element {
  const [filters, setFilters] = useState<ClosedTradeFilters>(defaultClosedTradeFilters);
  const [page, setPage] = useState<PagedTrades>(props.initialPage);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fetchClosedTrades = async (nextFilters: ClosedTradeFilters, offset: number, append: boolean): Promise<void> => {
    setLoading(true);
    setError("");
    try {
      const nextPage: PagedTrades = await apiGet<PagedTrades>(endpoints.closedTrades({ ...nextFilters, limit: closedTradePageSize, offset }));
      setPage((currentPage) => append ? { ...nextPage, items: [...currentPage.items, ...nextPage.items] } : nextPage);
    } catch (unknownError: unknown) {
      setError(unknownError instanceof Error ? unknownError.message : "Unable to load closed trades");
    } finally {
      setLoading(false);
    }
  };
  const updateFilters = (nextFilters: ClosedTradeFilters): void => {
    setFilters(nextFilters);
    void fetchClosedTrades(nextFilters, 0, false);
  };
  const loadMore = (): void => {
    void fetchClosedTrades(filters, page.items.length, true);
  };
  return (
    <>
      <Header eyebrow="Journal" title="Closed Trades" />
      <section className="panel trade-filters">
        <Input label="Symbol" value={filters.symbol} onChange={(value) => updateFilters({ ...filters, symbol: value })} />
        <label><span>Period</span><select value={filters.period} onChange={(event) => updateFilters({ ...filters, period: event.target.value as DashboardPeriodKey })}>{dashboardPeriodOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select></label>
        <label><span>Setup</span><select value={filters.setupId} onChange={(event) => updateFilters({ ...filters, setupId: event.target.value })}><option value="">All setups</option>{props.referenceData.setups.map((setup) => <option key={setup.id} value={setup.id}>{setup.name}</option>)}</select></label>
        <label><span>Entry Method</span><select value={filters.entryMethodId} onChange={(event) => updateFilters({ ...filters, entryMethodId: event.target.value })}><option value="">All entry methods</option>{props.referenceData.entryMethods.map((entryMethod) => <option key={entryMethod.id} value={entryMethod.id}>{entryMethod.name}</option>)}</select></label>
        <label><span>Outcome</span><select value={filters.outcome} onChange={(event) => updateFilters({ ...filters, outcome: event.target.value as ClosedTradeOutcomeFilter })}>{closedTradeOutcomeOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select></label>
      </section>
      {error ? <p className="info-note">{error}</p> : null}
      <TradesTable mode="closed" trades={page.items} onSelect={props.onSelect} />
      <div className="load-more-row">
        <span className="muted">Showing {page.items.length} of {page.total} closed trades</span>
        {page.hasMore ? <button className="secondary" disabled={loading} onClick={loadMore} type="button">{loading ? "Loading..." : "Load more"}</button> : null}
      </div>
    </>
  );
}

function TradesTable(props: { readonly mode: "open" | "closed"; readonly trades: readonly Trade[]; readonly onSelect: (id: number) => void }): JSX.Element {
  const finalColumnLabel: string = props.mode === "closed" ? "Duration" : "Status";
  return (
    <div className={`table ${props.mode === "open" ? "open-trades-table" : "closed-trades-table"}`}>
      <div className="table-head">
        <span>Symbol</span><span>Entry</span><span>Qty</span><span>Position %</span><span>Impact %</span><span>P&L</span><span>R</span>
        {props.mode === "open" ? <><span>Unrealized P&L</span><span>Unrealized R</span><span>Unrealized Impact %</span></> : null}
        <span>{finalColumnLabel}</span>
      </div>
      {props.trades.map((trade) => (
        <button className="table-row" key={trade.id} onClick={() => props.onSelect(trade.id)} type="button">
          <span><strong>{trade.symbol}</strong><small>{formatTradeClassification(trade)}</small></span>
          <span>{money(trade.entryPrice)}<small>{trade.entryDate}</small></span>
          <span>{formatTableQuantity(props.mode, trade)}</span>
          <span>{formatPercent(trade.positionSizePercentage)}</span>
          <span>{formatSignedPercent(trade.summary.portfolioImpactPercentage)}</span>
          <span>{money(trade.summary.realizedPnl)}</span>
          <span>{trade.summary.finalRMultiple}</span>
          {props.mode === "open" ? <><span>{money(trade.unrealizedPnl)}</span><span>{formatR(trade.unrealizedR)}</span><span>{formatSignedPercent(trade.unrealizedPortfolioImpactPercentage)}</span></> : null}
          <span>{props.mode === "closed" ? formatDuration(trade.summary.durationDays) : trade.summary.status.replace("_", " ")}</span>
        </button>
      ))}
    </div>
  );
}

function TradeDetail(props: { readonly tradeId: number; readonly referenceData: ReferenceData; readonly onClose: () => void; readonly onChanged: () => Promise<void>; readonly onDeleted: () => Promise<void> }): JSX.Element {
  const [detail, setDetail] = useState<{ readonly trade: Trade; readonly exits: readonly TradeExit[]; readonly summary: Trade["summary"]; readonly screenshots: readonly { readonly id: number; readonly type: string; readonly url: string; readonly exitId: number | null }[]; readonly checklistResponses: readonly { readonly itemId: number; readonly checked: boolean; readonly notes: string }[]; readonly review?: Record<string, string | number> } | null>(null);
  const [exitFiles, setExitFiles] = useState<readonly File[]>([]);
  const [exitFileInputKey, setExitFileInputKey] = useState(0);
  const [exitForm, setExitForm] = useState<ExitFormState>(createEmptyExitForm);
  const [addExitSaving, setAddExitSaving] = useState(false);
  const [activeStopLoss, setActiveStopLoss] = useState("");
  const [activeStopSaving, setActiveStopSaving] = useState(false);
  const [currentPrice, setCurrentPrice] = useState("");
  const [currentPriceSaving, setCurrentPriceSaving] = useState(false);
  const [editTradeOpen, setEditTradeOpen] = useState(false);
  const [editTradeFiles, setEditTradeFiles] = useState<readonly File[]>([]);
  const [editTradeForm, setEditTradeForm] = useState<TradeFormState | null>(null);
  const [editTradeSaving, setEditTradeSaving] = useState(false);
  const [editTradeChecks, setEditTradeChecks] = useState<Record<number, boolean>>({});
  const [editingExitId, setEditingExitId] = useState<number | null>(null);
  const [editExitFiles, setEditExitFiles] = useState<readonly File[]>([]);
  const [editExitForm, setEditExitForm] = useState<ExitFormState | null>(null);
  const [editExitSaving, setEditExitSaving] = useState(false);
  const [review, setReview] = useState({ followedPlan: "1", ruleScore: "5", disciplineScore: "5", wentWell: "", wentWrong: "", lesson: "", repeatNextTime: "", avoidNextTime: "", mistakeIds: [] as number[] });
  const [reviewSaveStatus, setReviewSaveStatus] = useState<ReviewSaveStatus>("idle");
  const [reviewSaveMessage, setReviewSaveMessage] = useState("");
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [confirmSaving, setConfirmSaving] = useState(false);
  const [screenshotPreview, setScreenshotPreview] = useState<ScreenshotPreview | null>(null);
  const hasActiveEdit = editTradeOpen || editingExitId !== null;
  const load = async (): Promise<void> => {
    const loaded = await apiGet<typeof detail>(`/api/trades/${props.tradeId}`);
    setDetail(loaded);
    if (loaded?.trade) {
      setActiveStopLoss(String(loaded.trade.activeStopLoss));
      setCurrentPrice(loaded.trade.currentPrice === null ? "" : String(loaded.trade.currentPrice));
    }
  };
  useEffect(() => {
    load().catch(console.error);
  }, [props.tradeId]);
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") {
        return;
      }
      if (screenshotPreview) {
        setScreenshotPreview(null);
        return;
      }
      if (confirmDialog) {
        closeConfirmDialog();
        return;
      }
      requestClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [confirmDialog, hasActiveEdit, screenshotPreview]);
  const closeConfirmDialog = (): void => {
    if (confirmSaving) {
      return;
    }
    setConfirmDialog(null);
  };
  const requestClose = (): void => {
    if (hasActiveEdit) {
      setConfirmDialog({
        kind: "close",
        title: "Close trade panel?",
        message: "Unsaved edit changes will be lost.",
        confirmLabel: "Close Panel",
        destructive: false
      });
      return;
    }
    props.onClose();
  };
  if (!detail) {
    return (
      <div className="drawer-layer">
        <button aria-label="Close trade panel" className="drawer-backdrop" onClick={props.onClose} type="button" />
        <aside className="drawer">
          <header className="drawer-header">
            <div className="drawer-title"><h2>Loading trade</h2><p className="muted">Fetching journal details</p></div>
            <button aria-label="Close trade panel" className="icon-secondary" onClick={props.onClose} type="button"><X size={18} /></button>
          </header>
          <div className="drawer-content"><p>Loading trade...</p></div>
        </aside>
      </div>
    );
  }
  const addExitSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (addExitSaving) {
      return;
    }
    setAddExitSaving(true);
    try {
      const response = await apiSend<{ readonly id: number }>(`/api/trades/${props.tradeId}/exits`, "POST", { ...exitForm, exitPrice: Number(exitForm.exitPrice), quantity: Number(exitForm.quantity) });
      await uploadScreenshots(`/api/trades/${props.tradeId}/exits/${response.id}/screenshots`, exitFiles);
      setExitForm(createEmptyExitForm());
      setExitFiles([]);
      setExitFileInputKey((key: number) => key + 1);
      await load();
      await props.onChanged();
    } finally {
      setAddExitSaving(false);
    }
  };
  const activeStopSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (activeStopSaving) {
      return;
    }
    setActiveStopSaving(true);
    try {
      await apiSend(`/api/trades/${props.tradeId}/active-stop`, "PATCH", { activeStopLoss: Number(activeStopLoss) });
      await load();
      await props.onChanged();
    } finally {
      setActiveStopSaving(false);
    }
  };
  const moveActiveStopToBreakeven = (): void => {
    setActiveStopLoss(String(detail.trade.entryPrice));
  };
  const currentPriceSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (currentPriceSaving) {
      return;
    }
    setCurrentPriceSaving(true);
    try {
      await apiSend(`/api/trades/${props.tradeId}/current-price`, "PATCH", { currentPrice: Number(currentPrice) });
      await load();
      await props.onChanged();
    } finally {
      setCurrentPriceSaving(false);
    }
  };
  const openTradeEditor = (): void => {
    setEditTradeForm({
      symbol: detail.trade.symbol,
      market: detail.trade.market,
      direction: detail.trade.direction,
      entryDate: detail.trade.entryDate,
      entryPrice: String(detail.trade.entryPrice),
      quantity: String(detail.trade.quantity),
      stopLossPercentage: calculateStopLossPercentageText(String(detail.trade.entryPrice), String(detail.trade.stopLoss)),
      stopLoss: String(detail.trade.stopLoss),
      stopLossLastEdited: "price",
      activeStopLoss: String(detail.trade.activeStopLoss),
      currentPrice: detail.trade.currentPrice === null ? "" : String(detail.trade.currentPrice),
      riskPercentage: String(detail.trade.riskPercentage),
      riskCapitalBase: String(detail.trade.riskCapitalBase),
      setupId: detail.trade.setupId ? String(detail.trade.setupId) : "",
      entryMethodId: detail.trade.entryMethodId ? String(detail.trade.entryMethodId) : "",
      entryReason: detail.trade.entryReason,
      emotionalState: detail.trade.emotionalState,
      confidence: String(detail.trade.confidence),
      notes: detail.trade.notes
    });
    setEditTradeChecks(Object.fromEntries(detail.checklistResponses.map((response) => [response.itemId, response.checked])));
    setEditTradeOpen(true);
  };
  const editTradeSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!editTradeForm || editTradeSaving) {
      return;
    }
    setEditTradeSaving(true);
    try {
      await apiSend(`/api/trades/${props.tradeId}`, "PUT", {
        symbol: editTradeForm.symbol,
        market: editTradeForm.market,
        direction: editTradeForm.direction,
        entryDate: editTradeForm.entryDate,
        entryPrice: Number(editTradeForm.entryPrice),
        quantity: Number(editTradeForm.quantity),
        stopLoss: Number(editTradeForm.stopLoss),
        activeStopLoss: Number(editTradeForm.activeStopLoss),
        ...(detail.trade.status !== "closed" ? { currentPrice: editTradeForm.currentPrice === "" ? null : Number(editTradeForm.currentPrice) } : {}),
        riskPercentage: Number(editTradeForm.riskPercentage),
        riskCapitalBase: Number(editTradeForm.riskCapitalBase),
        setupId: editTradeForm.setupId ? Number(editTradeForm.setupId) : null,
        entryMethodId: editTradeForm.entryMethodId ? Number(editTradeForm.entryMethodId) : null,
        entryReason: editTradeForm.entryReason,
        emotionalState: editTradeForm.emotionalState,
        confidence: Number(editTradeForm.confidence),
        notes: editTradeForm.notes,
        checklistResponses: props.referenceData.checklistItems.map((item) => ({ itemId: item.id, checked: Boolean(editTradeChecks[item.id]), notes: "" }))
      });
      await uploadScreenshots(`/api/trades/${props.tradeId}/screenshots/entry`, editTradeFiles);
      setEditTradeOpen(false);
      setEditTradeFiles([]);
      await load();
      await props.onChanged();
    } finally {
      setEditTradeSaving(false);
    }
  };
  const openExitEditor = (exit: TradeExit): void => {
    setEditingExitId(exit.id);
    setEditExitFiles([]);
    setEditExitForm({
      exitDate: exit.exitDate,
      exitPrice: String(exit.exitPrice),
      quantity: String(exit.quantity),
      reason: exit.reason,
      emotionalState: exit.emotionalState,
      notes: exit.notes
    });
  };
  const editExitSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!editExitForm || editingExitId === null || editExitSaving) {
      return;
    }
    setEditExitSaving(true);
    try {
      await apiSend(`/api/trades/${props.tradeId}/exits/${editingExitId}`, "PUT", { ...editExitForm, exitPrice: Number(editExitForm.exitPrice), quantity: Number(editExitForm.quantity) });
      await uploadScreenshots(`/api/trades/${props.tradeId}/exits/${editingExitId}/screenshots`, editExitFiles);
      setEditingExitId(null);
      setEditExitFiles([]);
      await load();
      await props.onChanged();
    } finally {
      setEditExitSaving(false);
    }
  };
  const reviewSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setReviewSaveStatus("saving");
    setReviewSaveMessage("");
    try {
      await apiSend(`/api/trades/${props.tradeId}/review`, "PUT", { ...review, followedPlan: Number(review.followedPlan), ruleScore: Number(review.ruleScore), disciplineScore: Number(review.disciplineScore) });
      await load();
      await props.onChanged();
      setReviewSaveStatus("saved");
      setReviewSaveMessage("Review saved just now");
      window.setTimeout(() => setReviewSaveStatus("idle"), 1800);
    } catch (error: unknown) {
      setReviewSaveStatus("error");
      setReviewSaveMessage(error instanceof Error ? error.message : "Unable to save review");
    }
  };
  const updateReviewField = (changes: Partial<typeof review>): void => {
    setReview({ ...review, ...changes });
    setReviewSaveStatus("idle");
    setReviewSaveMessage("");
  };
  const deleteTrade = async (): Promise<void> => {
    setConfirmDialog({
      kind: "delete-trade",
      title: "Delete trade?",
      message: "This will delete the trade, exits, screenshots, review, and capital impact.",
      confirmLabel: "Delete Trade",
      destructive: true
    });
  };
  const deleteExit = (exitId: number): void => {
    setConfirmDialog({
      kind: "delete-exit",
      exitId,
      title: "Delete exit?",
      message: "This will delete this exit, its screenshots, and its capital impact.",
      confirmLabel: "Delete Exit",
      destructive: true
    });
  };
  const confirmAction = async (): Promise<void> => {
    if (!confirmDialog || confirmSaving) {
      return;
    }
    if (confirmDialog.kind === "close") {
      setConfirmDialog(null);
      props.onClose();
      return;
    }
    setConfirmSaving(true);
    try {
      if (confirmDialog.kind === "delete-trade") {
        await apiDelete(`/api/trades/${props.tradeId}`);
        setConfirmDialog(null);
        await props.onDeleted();
        return;
      }
      await apiDelete(`/api/trades/${props.tradeId}/exits/${confirmDialog.exitId}`);
      setConfirmDialog(null);
      await load();
      await props.onChanged();
    } finally {
      setConfirmSaving(false);
    }
  };
  return (
    <div className="drawer-layer">
      <button aria-label="Close trade panel" className="drawer-backdrop" onClick={requestClose} type="button" />
      <aside className="drawer">
      <header className="drawer-header">
        <div className="drawer-title">
          <h2>{detail.trade.symbol}</h2>
          <p className="muted">{detail.trade.entryDate} · {formatTradeClassification(detail.trade)} · {detail.summary.status.replace("_", " ")}</p>
        </div>
        <div className="drawer-actions">
          <button className="secondary inline-action" onClick={openTradeEditor} type="button"><Pencil size={16} /> Edit Trade</button>
          <button className="danger" onClick={deleteTrade} type="button"><Trash2 size={16} /> Delete Trade</button>
          <button aria-label="Close trade panel" className="icon-secondary" onClick={requestClose} type="button"><X size={18} /></button>
        </div>
      </header>
      <div className="drawer-content">
      <div className="two-col">
        <Metric label="Entry" value={money(detail.trade.entryPrice)} />
        <Metric label="Remaining" value={`${detail.summary.remainingQuantity}/${detail.trade.quantity}`} />
        <Metric label="Realized P&L" value={money(detail.summary.realizedPnl)} />
        <Metric label="Impact %" value={formatSignedPercent(detail.summary.portfolioImpactPercentage)} tone={detail.summary.portfolioImpactPercentage >= 0 ? "good" : "bad"} />
        <Metric label="Final R" value={String(detail.summary.finalRMultiple)} />
        <Metric label="Planned risk" value={money(detail.trade.plannedRiskAmount)} />
        <Metric label="Actual risk" value={money(detail.trade.actualRisk)} />
        <Metric label="Risk used" value={`${detail.trade.riskUsedPercentage}%`} />
        <Metric label="Initial SL" value={money(detail.trade.stopLoss)} />
        <Metric label="Active SL" value={money(detail.trade.activeStopLoss)} />
        <Metric label="Current open risk" value={money(calculateCurrentOpenRisk(detail.trade, detail.summary.remainingQuantity))} />
        <Metric label="Current price" value={detail.trade.currentPrice === null ? "-" : money(detail.trade.currentPrice)} />
        <Metric label="Unrealized P&L" value={money(detail.trade.unrealizedPnl)} tone={getNumberTone(detail.trade.unrealizedPnl)} />
        <Metric label="Unrealized R" value={formatR(detail.trade.unrealizedR)} tone={getNumberTone(detail.trade.unrealizedR)} />
        <Metric label="Unrealized Impact %" value={formatSignedPercent(detail.trade.unrealizedPortfolioImpactPercentage)} tone={getNumberTone(detail.trade.unrealizedPortfolioImpactPercentage)} />
        <Metric label="Current price updated" value={detail.trade.currentPriceUpdatedAt ? formatTimestamp(detail.trade.currentPriceUpdatedAt) : "-"} />
        <Metric label="Position value" value={money(detail.trade.positionValue)} />
        <Metric label="Position %" value={formatPercent(detail.trade.positionSizePercentage)} />
      </div>
      <ImageStrip screenshots={detail.screenshots} onPreview={setScreenshotPreview} />
      {detail.trade.status !== "closed" ? (
        <form className="compact-form" onSubmit={currentPriceSubmit}>
          <h3>Current Price</h3>
          <Input label="Current price" type="number" value={currentPrice} onChange={setCurrentPrice} required />
          <div className="two-col">
            <div className="derived-metric"><span>Unrealized P&L</span><strong>{money(calculateUnrealizedPnlFromValue(detail.trade.entryPrice, Number(currentPrice), detail.summary.remainingQuantity))}</strong></div>
            <div className="derived-metric"><span>Unrealized R</span><strong>{formatR(calculateUnrealizedRFromValue(detail.trade, Number(currentPrice), detail.summary.remainingQuantity))}</strong></div>
          </div>
          <button className="primary" disabled={currentPriceSaving} type="submit">{currentPriceSaving ? "Saving..." : "Save Current Price"}</button>
        </form>
      ) : null}
      {detail.trade.status !== "closed" ? (
        <form className="compact-form" onSubmit={activeStopSubmit}>
          <h3>Active Stop</h3>
          <Input label="Active stop" type="number" value={activeStopLoss} onChange={setActiveStopLoss} required />
          <div className="derived-metric"><span>Current open risk</span><strong>{money(calculateCurrentOpenRiskFromValue(detail.trade.entryPrice, Number(activeStopLoss), detail.summary.remainingQuantity))}</strong></div>
          <div className="form-actions">
            <button className="primary" disabled={activeStopSaving} type="submit">{activeStopSaving ? "Saving..." : "Save Active Stop"}</button>
            <button className="secondary" onClick={moveActiveStopToBreakeven} type="button">Move to Breakeven</button>
          </div>
        </form>
      ) : null}
      {editTradeOpen && editTradeForm ? (
        <form className="compact-form" onSubmit={editTradeSubmit}>
          <h3>Edit Trade</h3>
          <Input label="Symbol" value={editTradeForm.symbol} onChange={(value) => setEditTradeForm({ ...editTradeForm, symbol: value })} required />
          <Input label="Entry date" type="date" value={editTradeForm.entryDate} onChange={(value) => setEditTradeForm({ ...editTradeForm, entryDate: value })} required />
          <Input label="Entry price" type="number" value={editTradeForm.entryPrice} onChange={(value) => setEditTradeForm(updateEntryPrice(editTradeForm, value))} required />
          <Input label="Quantity" type="number" value={editTradeForm.quantity} onChange={(value) => setEditTradeForm({ ...editTradeForm, quantity: value })} required />
          <StopLossControl
            percentage={editTradeForm.stopLossPercentage}
            price={editTradeForm.stopLoss}
            onPercentageChange={(value) => setEditTradeForm(updateStopLossPercentage(editTradeForm, value))}
            onPriceChange={(value) => setEditTradeForm(updateStopLossPrice(editTradeForm, value))}
          />
          {detail.trade.status !== "closed" ? <Input label="Current price" type="number" value={editTradeForm.currentPrice} onChange={(value) => setEditTradeForm({ ...editTradeForm, currentPrice: value })} /> : null}
          <Input label="Active stop" type="number" value={editTradeForm.activeStopLoss} onChange={(value) => setEditTradeForm({ ...editTradeForm, activeStopLoss: value })} required />
          <Input label="Risk %" type="number" value={editTradeForm.riskPercentage} onChange={(value) => setEditTradeForm({ ...editTradeForm, riskPercentage: value })} required />
          <Input label="Risk capital base" type="number" value={editTradeForm.riskCapitalBase} onChange={(value) => setEditTradeForm({ ...editTradeForm, riskCapitalBase: value })} required />
          <div className="derived-metric"><span>Planned risk</span><strong>{money(Number(editTradeForm.riskCapitalBase) * (Number(editTradeForm.riskPercentage) / 100))}</strong></div>
          <div className="derived-metric"><span>Actual risk</span><strong>{money(Math.max(Number(editTradeForm.entryPrice) - Number(editTradeForm.stopLoss), 0) * Number(editTradeForm.quantity || 0))}</strong></div>
          <div className="derived-metric"><span>Risk used</span><strong>{formatRiskUsed(editTradeForm)}%</strong></div>
          <label><span>Setup</span><select value={editTradeForm.setupId} onChange={(event) => setEditTradeForm({ ...editTradeForm, setupId: event.target.value })}><option value="">Select setup</option>{props.referenceData.setups.map((setup) => <option key={setup.id} value={setup.id}>{setup.name}</option>)}</select></label>
          <label><span>Entry Method</span><select value={editTradeForm.entryMethodId} onChange={(event) => setEditTradeForm({ ...editTradeForm, entryMethodId: event.target.value })}><option value="">Select entry method</option>{props.referenceData.entryMethods.map((entryMethod) => <option key={entryMethod.id} value={entryMethod.id}>{entryMethod.name}</option>)}</select></label>
          <Input label="Confidence 1-5" type="number" value={editTradeForm.confidence} onChange={(value) => setEditTradeForm({ ...editTradeForm, confidence: value })} />
          <label><span>Entry reason</span><textarea value={editTradeForm.entryReason} onChange={(event) => setEditTradeForm({ ...editTradeForm, entryReason: event.target.value })} /></label>
          <label><span>Emotional state</span><textarea value={editTradeForm.emotionalState} onChange={(event) => setEditTradeForm({ ...editTradeForm, emotionalState: event.target.value })} /></label>
          <label><span>Notes</span><textarea value={editTradeForm.notes} onChange={(event) => setEditTradeForm({ ...editTradeForm, notes: event.target.value })} /></label>
          <label><span>Append entry screenshots</span><input type="file" accept="image/*" multiple onChange={(event) => setEditTradeFiles(filesFromInput(event.target.files))} /><small>{formatSelectedFileCount(editTradeFiles)}</small></label>
          <div className="checklist">{props.referenceData.checklistItems.map((item) => <label className="check-row" key={item.id}><input checked={Boolean(editTradeChecks[item.id])} type="checkbox" onChange={(event) => setEditTradeChecks({ ...editTradeChecks, [item.id]: event.target.checked })} />{item.label}</label>)}</div>
          <div className="form-actions"><button className="primary" disabled={editTradeSaving} type="submit">{editTradeSaving ? "Saving..." : "Save Trade Changes"}</button><button className="ghost" type="button" onClick={() => setEditTradeOpen(false)}>Cancel</button></div>
        </form>
      ) : null}
      <form className="compact-form" onSubmit={addExitSubmit}>
        <h3>Add Exit</h3>
        <Input label="Exit date" type="date" value={exitForm.exitDate} onChange={(value) => setExitForm({ ...exitForm, exitDate: value })} />
        <Input label="Exit price" type="number" value={exitForm.exitPrice} onChange={(value) => setExitForm({ ...exitForm, exitPrice: value })} />
        <Input label="Quantity" type="number" value={exitForm.quantity} onChange={(value) => setExitForm({ ...exitForm, quantity: value })} />
        <Input label="Reason" value={exitForm.reason} onChange={(value) => setExitForm({ ...exitForm, reason: value })} />
        <label><span>Exit screenshots</span><input key={exitFileInputKey} type="file" accept="image/*" multiple onChange={(event) => setExitFiles(filesFromInput(event.target.files))} /><small>{formatSelectedFileCount(exitFiles)}</small></label>
        <button className="primary" disabled={addExitSaving} type="submit">{addExitSaving ? "Saving..." : "Save Exit"}</button>
      </form>
      <section>
        <h3>Exits</h3>
        {detail.exits.map((exit) => (
          <div className="row exit-row" key={exit.id}>
            <span>{exit.exitDate} · {exit.quantity} @ {money(exit.exitPrice)}</span>
            <strong>{money(exit.pnl)} · {exit.rMultiple}R</strong>
            <button aria-label={`Edit exit ${exit.exitDate}`} className="icon-secondary" onClick={() => openExitEditor(exit)} type="button"><Pencil size={16} /></button>
            <button aria-label={`Delete exit ${exit.exitDate}`} className="icon-danger" onClick={() => deleteExit(exit.id)} type="button"><Trash2 size={16} /></button>
          </div>
        ))}
      </section>
      {editingExitId !== null && editExitForm ? (
        <form className="compact-form" onSubmit={editExitSubmit}>
          <h3>Edit Exit</h3>
          <Input label="Exit date" type="date" value={editExitForm.exitDate} onChange={(value) => setEditExitForm({ ...editExitForm, exitDate: value })} />
          <Input label="Exit price" type="number" value={editExitForm.exitPrice} onChange={(value) => setEditExitForm({ ...editExitForm, exitPrice: value })} />
          <Input label="Quantity" type="number" value={editExitForm.quantity} onChange={(value) => setEditExitForm({ ...editExitForm, quantity: value })} />
          <Input label="Reason" value={editExitForm.reason} onChange={(value) => setEditExitForm({ ...editExitForm, reason: value })} />
          <label><span>Emotional state</span><textarea value={editExitForm.emotionalState} onChange={(event) => setEditExitForm({ ...editExitForm, emotionalState: event.target.value })} /></label>
          <label><span>Notes</span><textarea value={editExitForm.notes} onChange={(event) => setEditExitForm({ ...editExitForm, notes: event.target.value })} /></label>
          <label><span>Append exit screenshots</span><input type="file" accept="image/*" multiple onChange={(event) => setEditExitFiles(filesFromInput(event.target.files))} /><small>{formatSelectedFileCount(editExitFiles)}</small></label>
          <div className="form-actions"><button className="primary" disabled={editExitSaving} type="submit">{editExitSaving ? "Saving..." : "Save Exit Changes"}</button><button className="ghost" type="button" onClick={() => setEditingExitId(null)}>Cancel</button></div>
        </form>
      ) : null}
      <form className="compact-form" onSubmit={reviewSubmit}>
        <h3>Review</h3>
        {reviewSaveMessage ? <p className={reviewSaveStatus === "error" ? "form-message error" : "form-message success"}>{reviewSaveMessage}</p> : null}
        <label><span>Followed plan</span><select value={review.followedPlan} onChange={(event) => updateReviewField({ followedPlan: event.target.value })}><option value="1">Yes</option><option value="0">No</option></select></label>
        <Input label="Rule score 1-10" type="number" value={review.ruleScore} onChange={(value) => updateReviewField({ ruleScore: value })} />
        <Input label="Discipline score 1-10" type="number" value={review.disciplineScore} onChange={(value) => updateReviewField({ disciplineScore: value })} />
        <label><span>Lesson</span><textarea value={review.lesson} onChange={(event) => updateReviewField({ lesson: event.target.value })} /></label>
        <div className="checklist">{props.referenceData.mistakeTags.map((tag) => <label className="check-row" key={tag.id}><input type="checkbox" onChange={(event) => updateReviewField({ mistakeIds: event.target.checked ? [...review.mistakeIds, tag.id] : review.mistakeIds.filter((id) => id !== tag.id) })} />{tag.label}</label>)}</div>
        <button className="primary" disabled={reviewSaveStatus === "saving"} type="submit">{getReviewSaveButtonLabel(reviewSaveStatus)}</button>
      </form>
      </div>
      </aside>
      {confirmDialog ? (
        <ConfirmDialog
          confirmLabel={confirmDialog.confirmLabel}
          destructive={confirmDialog.destructive}
          message={confirmDialog.message}
          onCancel={closeConfirmDialog}
          onConfirm={confirmAction}
          saving={confirmSaving}
          title={confirmDialog.title}
        />
      ) : null}
      {screenshotPreview ? <ImagePreviewModal screenshot={screenshotPreview} onClose={() => setScreenshotPreview(null)} /> : null}
    </div>
  );
}

function SettingsView(props: { readonly data: AppData; readonly onSaved: () => Promise<void> }): JSX.Element {
  const [settings, setSettings] = useState({
    startingCapital: props.data.settings.startingCapital,
    capitalHistoryStartDate: props.data.settings.capitalHistoryStartDate,
    defaultRiskPercentage: props.data.settings.defaultRiskPercentage
  });
  const [newSetup, setNewSetup] = useState("");
  const [newEntryMethod, setNewEntryMethod] = useState("");
  const [newChecklist, setNewChecklist] = useState("");
  const [newMistake, setNewMistake] = useState("");
  const saveSettings = async (): Promise<void> => {
    await apiSend("/api/settings", "PUT", settings);
    await props.onSaved();
  };
  const addReference = async (type: string, value: string): Promise<void> => {
    if (!value.trim()) {
      return;
    }
    await apiSend(`/api/reference-data/${type}`, "POST", { value });
    await props.onSaved();
  };
  return (
    <>
      <Header eyebrow="Controls" title="Settings" />
      <section className="panel">
        <div className="form-grid">
          <Input label="Starting capital" type="number" value={settings.startingCapital} onChange={(value) => setSettings({ ...settings, startingCapital: value })} />
          <Input label="Capital history start date" type="date" value={settings.capitalHistoryStartDate} onChange={(value) => setSettings({ ...settings, capitalHistoryStartDate: value })} />
          <Input label="Default risk %" type="number" value={settings.defaultRiskPercentage} onChange={(value) => setSettings({ ...settings, defaultRiskPercentage: value })} />
          <button className="primary" type="button" onClick={saveSettings}>Save Settings</button>
        </div>
      </section>
      <div className="split">
        <ReferenceEditor title="Setups" items={props.data.referenceData.setups.map((item) => item.name ?? "")} value={newSetup} onChange={setNewSetup} onAdd={() => addReference("setups", newSetup)} />
        <ReferenceEditor title="Entry Methods" items={props.data.referenceData.entryMethods.map((item) => item.name ?? "")} value={newEntryMethod} onChange={setNewEntryMethod} onAdd={() => addReference("entry-methods", newEntryMethod)} />
        <ReferenceEditor title="Checklist" items={props.data.referenceData.checklistItems.map((item) => item.label ?? "")} value={newChecklist} onChange={setNewChecklist} onAdd={() => addReference("checklist", newChecklist)} />
        <ReferenceEditor title="Mistakes" items={props.data.referenceData.mistakeTags.map((item) => item.label ?? "")} value={newMistake} onChange={setNewMistake} onAdd={() => addReference("mistakes", newMistake)} />
      </div>
    </>
  );
}

function ReferenceEditor(props: { readonly title: string; readonly items: readonly string[]; readonly value: string; readonly onChange: (value: string) => void; readonly onAdd: () => void }): JSX.Element {
  return <section className="panel"><h2>{props.title}</h2>{props.items.map((item) => <p className="chip" key={item}>{item}</p>)}<Input label="Add new" value={props.value} onChange={props.onChange} /><button className="secondary" type="button" onClick={props.onAdd}>Add</button></section>;
}

function Header(props: { readonly eyebrow: string; readonly title: string }): JSX.Element {
  return <header className="page-header"><p className="eyebrow">{props.eyebrow}</p><h2>{props.title}</h2></header>;
}

function Metric(props: { readonly label: string; readonly value: string; readonly icon?: JSX.Element; readonly tone?: "good" | "bad" }): JSX.Element {
  return <div className={`metric ${props.tone ?? ""}`}>{props.icon}<span>{props.label}</span><strong>{props.value}</strong></div>;
}

function Input(props: { readonly label: string; readonly value: string; readonly onChange: (value: string) => void; readonly type?: string; readonly required?: boolean; readonly step?: string }): JSX.Element {
  const step: string | undefined = props.step ?? (props.type === "number" ? "any" : undefined);
  return <label><span>{props.label}</span><input required={props.required} step={step} type={props.type ?? "text"} value={props.value} onChange={(event) => props.onChange(event.target.value)} /></label>;
}

function StopLossControl(props: {
  readonly percentage: string;
  readonly price: string;
  readonly onPercentageChange: (value: string) => void;
  readonly onPriceChange: (value: string) => void;
}): JSX.Element {
  return (
    <fieldset className="paired-field">
      <legend>Stop loss</legend>
      <div className="paired-inputs">
        <label><span>Stop loss %</span><input step="any" type="number" value={props.percentage} onChange={(event) => props.onPercentageChange(event.target.value)} /></label>
        <label><span>Stop loss</span><input required step="any" type="number" value={props.price} onChange={(event) => props.onPriceChange(event.target.value)} /></label>
      </div>
    </fieldset>
  );
}

function ImageStrip(props: { readonly screenshots: readonly ScreenshotPreview[]; readonly onPreview: (screenshot: ScreenshotPreview) => void }): JSX.Element {
  if (props.screenshots.length === 0) {
    return <p className="muted">No screenshots attached.</p>;
  }
  return (
    <div className="image-strip">
      {props.screenshots.map((screenshot: ScreenshotPreview) => (
        <button aria-label={`Preview ${screenshot.type} screenshot`} className="image-thumb" key={screenshot.id} onClick={() => props.onPreview(screenshot)} type="button">
          <img alt={`${screenshot.type} screenshot`} src={screenshot.url} />
        </button>
      ))}
    </div>
  );
}

function ImagePreviewModal(props: { readonly screenshot: ScreenshotPreview; readonly onClose: () => void }): JSX.Element {
  return (
    <div aria-modal="true" className="image-preview-layer" role="dialog">
      <button aria-label="Close screenshot preview" className="confirm-backdrop" onClick={props.onClose} type="button" />
      <section className="image-preview-dialog">
        <header className="confirm-header">
          <h2>{props.screenshot.type} screenshot</h2>
          <button aria-label="Close screenshot preview" className="icon-secondary" onClick={props.onClose} type="button"><X size={18} /></button>
        </header>
        <img alt={`${props.screenshot.type} screenshot preview`} src={props.screenshot.url} />
      </section>
    </div>
  );
}

function money(value: number): string {
  return new Intl.NumberFormat("en-IN", { currency: "INR", maximumFractionDigits: 0, style: "currency" }).format(value);
}

function formatOptionalMoney(value: number | null): string {
  return value === null ? "-" : money(value);
}

function formatCapitalChange(change: number | null, changePercentage: number | null): string {
  if (change === null || changePercentage === null) {
    return "-";
  }
  return `${money(change)} · ${formatSignedPercent(changePercentage)}`;
}

function getNullableTone(value: number | null): "good" | "bad" | undefined {
  if (value === null) {
    return undefined;
  }
  return getNumberTone(value);
}

function getNumberTone(value: number): "good" | "bad" {
  return value >= 0 ? "good" : "bad";
}

function getToneClass(value: number): string {
  return value >= 0 ? "good-text" : "bad-text";
}

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

function formatSignedPercent(value: number): string {
  if (value > 0) {
    return `+${formatPercent(value)}`;
  }
  return formatPercent(value);
}

function formatR(value: number): string {
  return `${value.toFixed(2)}R`;
}

function getDistributionTotal(buckets: readonly RDistributionBucket[]): number {
  return buckets.reduce((total: number, bucket: RDistributionBucket) => total + bucket.count, 0);
}

function getDistributionMax(buckets: readonly RDistributionBucket[]): number {
  return buckets.reduce((max: number, bucket: RDistributionBucket) => Math.max(max, bucket.count), 0);
}

function getDistributionWidth(count: number, maxCount: number): number {
  if (maxCount <= 0) {
    return 0;
  }
  return (count / maxCount) * 100;
}

function formatDistributionPercentage(count: number, totalCount: number): string {
  if (totalCount <= 0) {
    return "0.0%";
  }
  return `${((count / totalCount) * 100).toFixed(1)}%`;
}

function getDistributionToneClass(label: string): string {
  if (label === "<= -1R" || label === "-1R to 0R") {
    return "distribution-bar-loss";
  }
  if (label === "> 5R") {
    return "distribution-bar-outlier";
  }
  if (label === "0R to 1R") {
    return "distribution-bar-neutral";
  }
  return "distribution-bar-win";
}

function formatHoldDays(value: number): string {
  return `${value.toFixed(2)}d`;
}

function formatDuration(durationDays: number): string {
  if (durationDays <= 0) {
    return "-";
  }
  return `${durationDays}d`;
}

function formatPeriodRange(startDate: string | null, endDate: string): string {
  if (!startDate) {
    return `Through ${formatDisplayDate(endDate)}`;
  }
  return `${formatDisplayDate(startDate)} - ${formatDisplayDate(endDate)}`;
}

function formatDisplayDate(value: string): string {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatTableQuantity(mode: "open" | "closed", trade: Trade): string {
  if (mode === "closed") {
    return String(trade.quantity);
  }
  return `${trade.summary.remainingQuantity}/${trade.quantity}`;
}

function formatTradeClassification(trade: Trade): string {
  return `${trade.setupName ?? "No setup"} · ${trade.entryMethodName ?? "No entry method"}`;
}

function filesFromInput(files: FileList | null): readonly File[] {
  return files ? Array.from(files) : [];
}

function formatSelectedFileCount(files: readonly File[]): string {
  if (files.length === 0) {
    return "No files selected";
  }
  return files.length === 1 ? "1 file selected" : `${files.length} files selected`;
}

function updateEntryPrice(form: TradeFormState, entryPrice: string): TradeFormState {
  if (form.stopLossLastEdited === "percentage") {
    const stopLoss: string = calculateStopLossPriceText(entryPrice, form.stopLossPercentage);
    return { ...form, entryPrice, stopLoss: stopLoss || form.stopLoss };
  }
  const stopLossPercentage: string = calculateStopLossPercentageText(entryPrice, form.stopLoss);
  return { ...form, entryPrice, stopLossPercentage: stopLossPercentage || form.stopLossPercentage };
}

function updateStopLossPercentage(form: TradeFormState, stopLossPercentage: string): TradeFormState {
  const stopLoss: string = calculateStopLossPriceText(form.entryPrice, stopLossPercentage);
  return {
    ...form,
    stopLossPercentage,
    stopLoss: stopLoss || form.stopLoss,
    stopLossLastEdited: "percentage"
  };
}

function updateStopLossPrice(form: TradeFormState, stopLoss: string): TradeFormState {
  const stopLossPercentage: string = calculateStopLossPercentageText(form.entryPrice, stopLoss);
  return {
    ...form,
    stopLoss,
    stopLossPercentage: stopLossPercentage || form.stopLossPercentage,
    stopLossLastEdited: "price"
  };
}

function calculateStopLossPriceText(entryPriceValue: string, percentageValue: string): string {
  const entryPrice: number = Number(entryPriceValue);
  const percentage: number = Number(percentageValue);
  if (!Number.isFinite(entryPrice) || !Number.isFinite(percentage) || entryPrice <= 0 || percentageValue === "") {
    return "";
  }
  return formatFormNumber(entryPrice * (1 - percentage / 100));
}

function calculateStopLossPercentageText(entryPriceValue: string, stopLossValue: string): string {
  const entryPrice: number = Number(entryPriceValue);
  const stopLoss: number = Number(stopLossValue);
  if (!Number.isFinite(entryPrice) || !Number.isFinite(stopLoss) || entryPrice <= 0 || stopLossValue === "") {
    return "";
  }
  return formatFormNumber(((entryPrice - stopLoss) / entryPrice) * 100);
}

function formatFormNumber(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function formatRiskUsed(form: TradeFormState): string {
  const plannedRisk = Number(form.riskCapitalBase) * (Number(form.riskPercentage) / 100);
  const actualRisk = Math.max(Number(form.entryPrice) - Number(form.stopLoss), 0) * Number(form.quantity || 0);
  if (plannedRisk <= 0) {
    return "0.00";
  }
  return ((actualRisk / plannedRisk) * 100).toFixed(2);
}

function calculateCurrentOpenRisk(trade: Trade, remainingQuantity: number): number {
  return calculateCurrentOpenRiskFromValue(trade.entryPrice, trade.activeStopLoss, remainingQuantity);
}

function calculateCurrentOpenRiskFromValue(entryPrice: number, activeStopLoss: number, remainingQuantity: number): number {
  if (!Number.isFinite(activeStopLoss)) {
    return 0;
  }
  return Math.max(entryPrice - activeStopLoss, 0) * remainingQuantity;
}

function calculateUnrealizedPnlFromValue(entryPrice: number, currentPrice: number, remainingQuantity: number): number {
  if (!Number.isFinite(currentPrice)) {
    return 0;
  }
  return (currentPrice - entryPrice) * remainingQuantity;
}

function calculateUnrealizedRFromValue(trade: Trade, currentPrice: number, remainingQuantity: number): number {
  const tradeRisk: number = Math.max(trade.entryPrice - trade.stopLoss, 0) * trade.quantity;
  if (tradeRisk <= 0) {
    return 0;
  }
  return calculateUnrealizedPnlFromValue(trade.entryPrice, currentPrice, remainingQuantity) / tradeRisk;
}

function getReviewSaveButtonLabel(status: ReviewSaveStatus): string {
  if (status === "saving") {
    return "Saving...";
  }
  if (status === "saved") {
    return "Saved";
  }
  return "Save Review";
}
