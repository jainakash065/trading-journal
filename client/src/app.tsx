import { Activity, BarChart3, BookOpen, ClipboardCheck, IndianRupee, Pencil, Plus, Settings as SettingsIcon, Trash2, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { apiDelete, apiGet, apiSend, endpoints, type AppData, type ReferenceData, uploadScreenshot } from "./api";
import type { Dashboard, Settings, Trade, TradeExit } from "./types";

type View = "dashboard" | "new" | "open" | "closed" | "settings";

const today: string = new Date().toISOString().slice(0, 10);

type TradeFormState = {
  readonly symbol: string;
  readonly market: string;
  readonly direction: string;
  readonly entryDate: string;
  readonly entryPrice: string;
  readonly quantity: string;
  readonly stopLoss: string;
  readonly riskPercentage: string;
  readonly riskCapitalBase: string;
  readonly setupId: string;
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

type ReviewSaveStatus = "idle" | "saving" | "saved" | "error";

export function App(): JSX.Element {
  const [view, setView] = useState<View>("dashboard");
  const [data, setData] = useState<AppData | null>(null);
  const [selectedTradeId, setSelectedTradeId] = useState<number | null>(null);
  const [message, setMessage] = useState<string>("");
  const reload = async (): Promise<void> => {
    const [dashboard, settings, referenceData, openTrades, closedTrades] = await Promise.all([
      apiGet<Dashboard>(endpoints.dashboard),
      apiGet<Settings>(endpoints.settings),
      apiGet<ReferenceData>(endpoints.referenceData),
      apiGet<readonly Trade[]>(endpoints.openTrades),
      apiGet<readonly Trade[]>(endpoints.closedTrades)
    ]);
    setData({ dashboard, settings, referenceData, openTrades, closedTrades });
  };
  useEffect(() => {
    reload().catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Unable to load journal"));
  }, []);
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
        <nav>
          <NavButton active={view === "dashboard"} icon={<BarChart3 />} label="Dashboard" onClick={() => setView("dashboard")} />
          <NavButton active={view === "new"} icon={<Plus />} label="New Trade" onClick={() => setView("new")} />
          <NavButton active={view === "open"} icon={<Activity />} label="Open Trades" onClick={() => setView("open")} />
          <NavButton active={view === "closed"} icon={<BookOpen />} label="Closed Trades" onClick={() => setView("closed")} />
          <NavButton active={view === "settings"} icon={<SettingsIcon />} label="Settings" onClick={() => setView("settings")} />
        </nav>
      </aside>
      <section className="workspace">
        {message ? <div className="toast">{message}</div> : null}
        {view === "dashboard" ? <DashboardView dashboard={data.dashboard} /> : null}
        {view === "new" ? <NewTradeView data={data} onSaved={async () => { await reload(); setView("open"); setMessage("Trade saved"); }} /> : null}
        {view === "open" ? <TradesView title="Open Trades" trades={data.openTrades} onSelect={setSelectedTradeId} /> : null}
        {view === "closed" ? <TradesView title="Closed Trades" trades={data.closedTrades} onSelect={setSelectedTradeId} /> : null}
        {view === "settings" ? <SettingsView data={data} onSaved={reload} /> : null}
      </section>
      {selectedTradeId ? <TradeDetail tradeId={selectedTradeId} referenceData={data.referenceData} onClose={() => setSelectedTradeId(null)} onChanged={reload} onDeleted={async () => { setSelectedTradeId(null); await reload(); setMessage("Trade deleted"); }} /> : null}
    </main>
  );
}

function NavButton(props: { readonly active: boolean; readonly icon: JSX.Element; readonly label: string; readonly onClick: () => void }): JSX.Element {
  return <button className={props.active ? "nav-button active" : "nav-button"} onClick={props.onClick} type="button">{props.icon}<span>{props.label}</span></button>;
}

function DashboardView(props: { readonly dashboard: Dashboard }): JSX.Element {
  const d = props.dashboard;
  return (
    <>
      <Header eyebrow="Performance" title="Dashboard" />
      <div className="metric-grid">
        <Metric label="Current capital" value={money(d.currentCapital)} icon={<IndianRupee />} />
        <Metric label="Total realized P&L" value={money(d.totalRealizedPnl)} tone={d.totalRealizedPnl >= 0 ? "good" : "bad"} />
        <Metric label="Monthly P&L" value={money(d.monthlyPnl)} />
        <Metric label="Weekly P&L" value={money(d.weeklyPnl)} />
        <Metric label="Win rate" value={`${d.winRate}%`} />
        <Metric label="Profit factor" value={String(d.profitFactor)} />
        <Metric label="Average R" value={String(d.averageR)} />
        <Metric label="Max drawdown" value={money(d.maxDrawdown)} tone="bad" />
      </div>
      <div className="split">
        <section className="panel">
          <h2>Execution Quality</h2>
          <div className="two-col">
            <Metric label="Rules followed P&L" value={money(d.ruleFollowedPnl)} />
            <Metric label="Rules broken P&L" value={money(d.ruleBrokenPnl)} />
            <Metric label="Best setup" value={d.bestSetup} />
            <Metric label="Worst setup" value={d.worstSetup} />
            <Metric label="Open trades" value={String(d.openTrades)} />
            <Metric label="Open risk" value={money(d.openRiskExposure)} />
          </div>
        </section>
        <section className="panel">
          <h2>Mistakes</h2>
          {d.mistakeFrequency.length === 0 ? <p className="muted">No reviewed mistakes yet.</p> : d.mistakeFrequency.map((item) => (
            <div className="row" key={item.label}><span>{item.label}</span><strong>{item.count}</strong></div>
          ))}
        </section>
      </div>
    </>
  );
}

function NewTradeView(props: { readonly data: AppData; readonly onSaved: () => Promise<void> }): JSX.Element {
  const [form, setForm] = useState({
    symbol: "",
    entryDate: today,
    entryPrice: "",
    quantity: "",
    stopLoss: "",
    riskPercentage: props.data.settings.defaultRiskPercentage ?? "1",
    riskCapitalBase: String(props.data.settings.currentCapital),
    setupId: "",
    entryReason: "",
    emotionalState: "",
    confidence: "3",
    notes: ""
  });
  const [checks, setChecks] = useState<Record<number, boolean>>({});
  const [file, setFile] = useState<File | null>(null);
  const riskAmount = Number(form.riskCapitalBase) * (Number(form.riskPercentage) / 100);
  const riskPerShare = Math.max(Number(form.entryPrice) - Number(form.stopLoss), 0);
  const suggestedQuantity = riskPerShare > 0 ? Math.floor(riskAmount / riskPerShare) : 0;
  const actualRisk = riskPerShare * Number(form.quantity || suggestedQuantity || 0);
  const riskUsedPercentage = riskAmount > 0 ? (actualRisk / riskAmount) * 100 : 0;
  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
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
      entryReason: form.entryReason,
      emotionalState: form.emotionalState,
      confidence: Number(form.confidence),
      notes: form.notes,
      checklistResponses: props.data.referenceData.checklistItems.map((item) => ({ itemId: item.id, checked: Boolean(checks[item.id]), notes: "" }))
    });
    if (file) {
      await uploadScreenshot(`/api/trades/${response.id}/screenshots/entry`, file);
    }
    await props.onSaved();
  };
  return (
    <>
      <Header eyebrow="Plan" title="New Trade" />
      <form className="form-grid" onSubmit={submit}>
        <Input label="Symbol" value={form.symbol} onChange={(value) => setForm({ ...form, symbol: value })} required />
        <Input label="Entry date" type="date" value={form.entryDate} onChange={(value) => setForm({ ...form, entryDate: value })} required />
        <Input label="Entry price" type="number" value={form.entryPrice} onChange={(value) => setForm({ ...form, entryPrice: value })} required />
        <Input label="Stop loss" type="number" value={form.stopLoss} onChange={(value) => setForm({ ...form, stopLoss: value })} required />
        <Input label="Risk %" type="number" value={form.riskPercentage} onChange={(value) => setForm({ ...form, riskPercentage: value })} required />
        <Input label="Risk capital base" type="number" value={form.riskCapitalBase} onChange={(value) => setForm({ ...form, riskCapitalBase: value })} required />
        <Input label={`Quantity · suggested ${suggestedQuantity}`} type="number" value={form.quantity} onChange={(value) => setForm({ ...form, quantity: value })} />
        <div className="derived-metric"><span>Planned risk</span><strong>{money(riskAmount)}</strong></div>
        <div className="derived-metric"><span>Actual risk</span><strong>{money(actualRisk)}</strong></div>
        <div className="derived-metric"><span>Risk used</span><strong>{riskUsedPercentage.toFixed(2)}%</strong></div>
        <label><span>Setup</span><select value={form.setupId} onChange={(event) => setForm({ ...form, setupId: event.target.value })}><option value="">Select setup</option>{props.data.referenceData.setups.map((setup) => <option key={setup.id} value={setup.id}>{setup.name}</option>)}</select></label>
        <Input label="Confidence 1-5" type="number" value={form.confidence} onChange={(value) => setForm({ ...form, confidence: value })} />
        <label className="wide"><span>Entry reason</span><textarea value={form.entryReason} onChange={(event) => setForm({ ...form, entryReason: event.target.value })} /></label>
        <label className="wide"><span>Emotional state</span><textarea value={form.emotionalState} onChange={(event) => setForm({ ...form, emotionalState: event.target.value })} /></label>
        <label className="wide"><span>Notes</span><textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
        <label className="wide file-drop"><span>Entry screenshot</span><input type="file" accept="image/*" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
        <section className="wide checklist">
          <h2><ClipboardCheck size={18} /> Checklist</h2>
          {props.data.referenceData.checklistItems.map((item) => (
            <label className="check-row" key={item.id}><input checked={Boolean(checks[item.id])} type="checkbox" onChange={(event) => setChecks({ ...checks, [item.id]: event.target.checked })} />{item.label}</label>
          ))}
        </section>
        <button className="primary wide" type="submit">Save Trade</button>
      </form>
    </>
  );
}

function TradesView(props: { readonly title: string; readonly trades: readonly Trade[]; readonly onSelect: (id: number) => void }): JSX.Element {
  return (
    <>
      <Header eyebrow="Journal" title={props.title} />
      <div className="table">
        <div className="table-head"><span>Symbol</span><span>Entry</span><span>Qty</span><span>P&L</span><span>R</span><span>Status</span></div>
        {props.trades.map((trade) => (
          <button className="table-row" key={trade.id} onClick={() => props.onSelect(trade.id)} type="button">
            <span><strong>{trade.symbol}</strong><small>{trade.setupName ?? "No setup"}</small></span>
            <span>{money(trade.entryPrice)}<small>{trade.entryDate}</small></span>
            <span>{trade.summary.remainingQuantity}/{trade.quantity}</span>
            <span>{money(trade.summary.realizedPnl)}</span>
            <span>{trade.summary.finalRMultiple}</span>
            <span>{trade.summary.status.replace("_", " ")}</span>
          </button>
        ))}
      </div>
    </>
  );
}

function TradeDetail(props: { readonly tradeId: number; readonly referenceData: ReferenceData; readonly onClose: () => void; readonly onChanged: () => Promise<void>; readonly onDeleted: () => Promise<void> }): JSX.Element {
  const [detail, setDetail] = useState<{ readonly trade: Trade; readonly exits: readonly TradeExit[]; readonly summary: Trade["summary"]; readonly screenshots: readonly { readonly id: number; readonly type: string; readonly url: string; readonly exitId: number | null }[]; readonly checklistResponses: readonly { readonly itemId: number; readonly checked: boolean; readonly notes: string }[]; readonly review?: Record<string, string | number> } | null>(null);
  const [exitFile, setExitFile] = useState<File | null>(null);
  const [exitForm, setExitForm] = useState({ exitDate: today, exitPrice: "", quantity: "", reason: "", emotionalState: "", notes: "" });
  const [editTradeOpen, setEditTradeOpen] = useState(false);
  const [editTradeFile, setEditTradeFile] = useState<File | null>(null);
  const [editTradeForm, setEditTradeForm] = useState<TradeFormState | null>(null);
  const [editTradeChecks, setEditTradeChecks] = useState<Record<number, boolean>>({});
  const [editingExitId, setEditingExitId] = useState<number | null>(null);
  const [editExitFile, setEditExitFile] = useState<File | null>(null);
  const [editExitForm, setEditExitForm] = useState<ExitFormState | null>(null);
  const [review, setReview] = useState({ followedPlan: "1", ruleScore: "5", disciplineScore: "5", wentWell: "", wentWrong: "", lesson: "", repeatNextTime: "", avoidNextTime: "", mistakeIds: [] as number[] });
  const [reviewSaveStatus, setReviewSaveStatus] = useState<ReviewSaveStatus>("idle");
  const [reviewSaveMessage, setReviewSaveMessage] = useState("");
  const hasActiveEdit = editTradeOpen || editingExitId !== null;
  const load = async (): Promise<void> => {
    const loaded = await apiGet<typeof detail>(`/api/trades/${props.tradeId}`);
    setDetail(loaded);
  };
  useEffect(() => {
    load().catch(console.error);
  }, [props.tradeId]);
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") {
        return;
      }
      requestClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hasActiveEdit]);
  const requestClose = (): void => {
    if (hasActiveEdit && !window.confirm("Close the trade panel? Unsaved edit changes will be lost.")) {
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
    const response = await apiSend<{ readonly id: number }>(`/api/trades/${props.tradeId}/exits`, "POST", { ...exitForm, exitPrice: Number(exitForm.exitPrice), quantity: Number(exitForm.quantity) });
    if (exitFile) {
      await uploadScreenshot(`/api/trades/${props.tradeId}/exits/${response.id}/screenshots`, exitFile);
    }
    await load();
    await props.onChanged();
  };
  const openTradeEditor = (): void => {
    setEditTradeForm({
      symbol: detail.trade.symbol,
      market: detail.trade.market,
      direction: detail.trade.direction,
      entryDate: detail.trade.entryDate,
      entryPrice: String(detail.trade.entryPrice),
      quantity: String(detail.trade.quantity),
      stopLoss: String(detail.trade.stopLoss),
      riskPercentage: String(detail.trade.riskPercentage),
      riskCapitalBase: String(detail.trade.riskCapitalBase),
      setupId: detail.trade.setupId ? String(detail.trade.setupId) : "",
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
    if (!editTradeForm) {
      return;
    }
    await apiSend(`/api/trades/${props.tradeId}`, "PUT", {
      symbol: editTradeForm.symbol,
      market: editTradeForm.market,
      direction: editTradeForm.direction,
      entryDate: editTradeForm.entryDate,
      entryPrice: Number(editTradeForm.entryPrice),
      quantity: Number(editTradeForm.quantity),
      stopLoss: Number(editTradeForm.stopLoss),
      riskPercentage: Number(editTradeForm.riskPercentage),
      riskCapitalBase: Number(editTradeForm.riskCapitalBase),
      setupId: editTradeForm.setupId ? Number(editTradeForm.setupId) : null,
      entryReason: editTradeForm.entryReason,
      emotionalState: editTradeForm.emotionalState,
      confidence: Number(editTradeForm.confidence),
      notes: editTradeForm.notes,
      checklistResponses: props.referenceData.checklistItems.map((item) => ({ itemId: item.id, checked: Boolean(editTradeChecks[item.id]), notes: "" }))
    });
    if (editTradeFile) {
      await uploadScreenshot(`/api/trades/${props.tradeId}/screenshots/entry`, editTradeFile);
    }
    setEditTradeOpen(false);
    setEditTradeFile(null);
    await load();
    await props.onChanged();
  };
  const openExitEditor = (exit: TradeExit): void => {
    setEditingExitId(exit.id);
    setEditExitFile(null);
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
    if (!editExitForm || editingExitId === null) {
      return;
    }
    await apiSend(`/api/trades/${props.tradeId}/exits/${editingExitId}`, "PUT", { ...editExitForm, exitPrice: Number(editExitForm.exitPrice), quantity: Number(editExitForm.quantity) });
    if (editExitFile) {
      await uploadScreenshot(`/api/trades/${props.tradeId}/exits/${editingExitId}/screenshots`, editExitFile);
    }
    setEditingExitId(null);
    setEditExitFile(null);
    await load();
    await props.onChanged();
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
    if (!window.confirm(`Delete ${detail.trade.symbol} and all of its exits, screenshots, and review data?`)) {
      return;
    }
    await apiDelete(`/api/trades/${props.tradeId}`);
    await props.onDeleted();
  };
  const deleteExit = async (exitId: number): Promise<void> => {
    if (!window.confirm("Delete this exit and its screenshot/capital impact?")) {
      return;
    }
    await apiDelete(`/api/trades/${props.tradeId}/exits/${exitId}`);
    await load();
    await props.onChanged();
  };
  return (
    <div className="drawer-layer">
      <button aria-label="Close trade panel" className="drawer-backdrop" onClick={requestClose} type="button" />
      <aside className="drawer">
      <header className="drawer-header">
        <div className="drawer-title">
          <h2>{detail.trade.symbol}</h2>
          <p className="muted">{detail.trade.entryDate} · {detail.trade.setupName ?? "No setup"} · {detail.summary.status.replace("_", " ")}</p>
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
        <Metric label="Final R" value={String(detail.summary.finalRMultiple)} />
        <Metric label="Planned risk" value={money(detail.trade.plannedRiskAmount)} />
        <Metric label="Actual risk" value={money(detail.trade.actualRisk)} />
        <Metric label="Risk used" value={`${detail.trade.riskUsedPercentage}%`} />
      </div>
      <ImageStrip screenshots={detail.screenshots} />
      {editTradeOpen && editTradeForm ? (
        <form className="compact-form" onSubmit={editTradeSubmit}>
          <h3>Edit Trade</h3>
          <Input label="Symbol" value={editTradeForm.symbol} onChange={(value) => setEditTradeForm({ ...editTradeForm, symbol: value })} required />
          <Input label="Entry date" type="date" value={editTradeForm.entryDate} onChange={(value) => setEditTradeForm({ ...editTradeForm, entryDate: value })} required />
          <Input label="Entry price" type="number" value={editTradeForm.entryPrice} onChange={(value) => setEditTradeForm({ ...editTradeForm, entryPrice: value })} required />
          <Input label="Quantity" type="number" value={editTradeForm.quantity} onChange={(value) => setEditTradeForm({ ...editTradeForm, quantity: value })} required />
          <Input label="Stop loss" type="number" value={editTradeForm.stopLoss} onChange={(value) => setEditTradeForm({ ...editTradeForm, stopLoss: value })} required />
          <Input label="Risk %" type="number" value={editTradeForm.riskPercentage} onChange={(value) => setEditTradeForm({ ...editTradeForm, riskPercentage: value })} required />
          <Input label="Risk capital base" type="number" value={editTradeForm.riskCapitalBase} onChange={(value) => setEditTradeForm({ ...editTradeForm, riskCapitalBase: value })} required />
          <div className="derived-metric"><span>Planned risk</span><strong>{money(Number(editTradeForm.riskCapitalBase) * (Number(editTradeForm.riskPercentage) / 100))}</strong></div>
          <div className="derived-metric"><span>Actual risk</span><strong>{money(Math.max(Number(editTradeForm.entryPrice) - Number(editTradeForm.stopLoss), 0) * Number(editTradeForm.quantity || 0))}</strong></div>
          <div className="derived-metric"><span>Risk used</span><strong>{formatRiskUsed(editTradeForm)}%</strong></div>
          <label><span>Setup</span><select value={editTradeForm.setupId} onChange={(event) => setEditTradeForm({ ...editTradeForm, setupId: event.target.value })}><option value="">Select setup</option>{props.referenceData.setups.map((setup) => <option key={setup.id} value={setup.id}>{setup.name}</option>)}</select></label>
          <Input label="Confidence 1-5" type="number" value={editTradeForm.confidence} onChange={(value) => setEditTradeForm({ ...editTradeForm, confidence: value })} />
          <label><span>Entry reason</span><textarea value={editTradeForm.entryReason} onChange={(event) => setEditTradeForm({ ...editTradeForm, entryReason: event.target.value })} /></label>
          <label><span>Emotional state</span><textarea value={editTradeForm.emotionalState} onChange={(event) => setEditTradeForm({ ...editTradeForm, emotionalState: event.target.value })} /></label>
          <label><span>Notes</span><textarea value={editTradeForm.notes} onChange={(event) => setEditTradeForm({ ...editTradeForm, notes: event.target.value })} /></label>
          <label><span>Append entry screenshot</span><input type="file" accept="image/*" onChange={(event) => setEditTradeFile(event.target.files?.[0] ?? null)} /></label>
          <div className="checklist">{props.referenceData.checklistItems.map((item) => <label className="check-row" key={item.id}><input checked={Boolean(editTradeChecks[item.id])} type="checkbox" onChange={(event) => setEditTradeChecks({ ...editTradeChecks, [item.id]: event.target.checked })} />{item.label}</label>)}</div>
          <div className="form-actions"><button className="primary" type="submit">Save Trade Changes</button><button className="ghost" type="button" onClick={() => setEditTradeOpen(false)}>Cancel</button></div>
        </form>
      ) : null}
      <form className="compact-form" onSubmit={addExitSubmit}>
        <h3>Add Exit</h3>
        <Input label="Exit date" type="date" value={exitForm.exitDate} onChange={(value) => setExitForm({ ...exitForm, exitDate: value })} />
        <Input label="Exit price" type="number" value={exitForm.exitPrice} onChange={(value) => setExitForm({ ...exitForm, exitPrice: value })} />
        <Input label="Quantity" type="number" value={exitForm.quantity} onChange={(value) => setExitForm({ ...exitForm, quantity: value })} />
        <Input label="Reason" value={exitForm.reason} onChange={(value) => setExitForm({ ...exitForm, reason: value })} />
        <label><span>Exit screenshot</span><input type="file" accept="image/*" onChange={(event) => setExitFile(event.target.files?.[0] ?? null)} /></label>
        <button className="primary" type="submit">Save Exit</button>
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
          <label><span>Append exit screenshot</span><input type="file" accept="image/*" onChange={(event) => setEditExitFile(event.target.files?.[0] ?? null)} /></label>
          <div className="form-actions"><button className="primary" type="submit">Save Exit Changes</button><button className="ghost" type="button" onClick={() => setEditingExitId(null)}>Cancel</button></div>
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
    </div>
  );
}

function SettingsView(props: { readonly data: AppData; readonly onSaved: () => Promise<void> }): JSX.Element {
  const [settings, setSettings] = useState({ startingCapital: props.data.settings.startingCapital, defaultRiskPercentage: props.data.settings.defaultRiskPercentage });
  const [newSetup, setNewSetup] = useState("");
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
          <Input label="Default risk %" type="number" value={settings.defaultRiskPercentage} onChange={(value) => setSettings({ ...settings, defaultRiskPercentage: value })} />
          <button className="primary" type="button" onClick={saveSettings}>Save Settings</button>
        </div>
      </section>
      <div className="split">
        <ReferenceEditor title="Setups" items={props.data.referenceData.setups.map((item) => item.name ?? "")} value={newSetup} onChange={setNewSetup} onAdd={() => addReference("setups", newSetup)} />
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

function Input(props: { readonly label: string; readonly value: string; readonly onChange: (value: string) => void; readonly type?: string; readonly required?: boolean }): JSX.Element {
  return <label><span>{props.label}</span><input required={props.required} type={props.type ?? "text"} value={props.value} onChange={(event) => props.onChange(event.target.value)} /></label>;
}

function ImageStrip(props: { readonly screenshots: readonly { readonly id: number; readonly url: string; readonly type: string }[] }): JSX.Element {
  if (props.screenshots.length === 0) {
    return <p className="muted">No screenshots attached.</p>;
  }
  return <div className="image-strip">{props.screenshots.map((screenshot) => <img alt={`${screenshot.type} screenshot`} key={screenshot.id} src={screenshot.url} />)}</div>;
}

function money(value: number): string {
  return new Intl.NumberFormat("en-IN", { currency: "INR", maximumFractionDigits: 0, style: "currency" }).format(value);
}

function formatRiskUsed(form: TradeFormState): string {
  const plannedRisk = Number(form.riskCapitalBase) * (Number(form.riskPercentage) / 100);
  const actualRisk = Math.max(Number(form.entryPrice) - Number(form.stopLoss), 0) * Number(form.quantity || 0);
  if (plannedRisk <= 0) {
    return "0.00";
  }
  return ((actualRisk / plannedRisk) * 100).toFixed(2);
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
