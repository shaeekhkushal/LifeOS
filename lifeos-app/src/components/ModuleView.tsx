"use client";

import { useState, type FormEvent } from "react";
import * as ds from "@/lib/data-service";
import type { TrackingEntry, TrackingModule } from "@/lib/types";
import { formatCurrency, formatDate, getEndOfMonth, getStartOfMonth, getToday } from "@/lib/utils";

const moduleCopy: Record<TrackingModule, {
  eyebrow: string;
  title: string;
  description: string;
  itemLabel: string;
  dateLabel: string;
  categoryLabel: string;
  statusLabel: string;
  statuses: string[];
  valueLabel?: string;
  unitLabel?: string;
  amountLabel?: string;
}> = {
  Health: { eyebrow: "YOUR WELLBEING", title: "Health overview", description: "Keep a useful record of health signals and routines over time.", itemLabel: "Metric or note", dateLabel: "Recorded on", categoryLabel: "Metric type", statusLabel: "Record", statuses: ["Logged", "Follow-up"], valueLabel: "Measurement", unitLabel: "Unit" },
  Learning: { eyebrow: "STAY CURIOUS", title: "Learning library", description: "Track the skills, courses, and ideas you are working through.", itemLabel: "Course or skill", dateLabel: "Target date", categoryLabel: "Topic", statusLabel: "Progress", statuses: ["Planned", "In progress", "Completed", "Paused"] },
  Career: { eyebrow: "WORK WITH INTENTION", title: "Career", description: "Keep milestones, applications, and professional development in view.", itemLabel: "Milestone", dateLabel: "Date", categoryLabel: "Career area", statusLabel: "Status", statuses: ["Planned", "In progress", "Completed", "Paused"] },
  Travel: { eyebrow: "PLACES TO GO", title: "Travel planner", description: "Keep trip plans, destinations, and spending in one local record.", itemLabel: "Trip or destination", dateLabel: "Start date", categoryLabel: "Trip type", statusLabel: "Status", statuses: ["Considering", "Planned", "Booked", "Completed", "Cancelled"], amountLabel: "Estimated or actual cost" },
  Shopping: { eyebrow: "BUY LESS, CHOOSE WELL", title: "Shopping list", description: "Keep planned purchases visible and compare them with what you actually spend.", itemLabel: "Item", dateLabel: "Added on", categoryLabel: "Category", statusLabel: "Status", statuses: ["Needed", "Purchased", "Skipped"], amountLabel: "Price" },
  Vehicle: { eyebrow: "KEEP MOVING", title: "Vehicle log", description: "Track maintenance, mileage, and the cost of keeping your vehicle moving.", itemLabel: "Service or note", dateLabel: "Service date", categoryLabel: "Vehicle / service type", statusLabel: "Status", statuses: ["Due", "Scheduled", "Completed"], valueLabel: "Odometer", unitLabel: "Unit", amountLabel: "Cost" },
  Home: { eyebrow: "YOUR BASECAMP", title: "Home management", description: "Record home tasks and costs, then keep the next useful action visible.", itemLabel: "Task or item", dateLabel: "Date", categoryLabel: "Area", statusLabel: "Status", statuses: ["Planned", "In progress", "Completed"], amountLabel: "Cost" },
  Entertainment: { eyebrow: "MAKE TIME FOR JOY", title: "Entertainment", description: "Remember what you watched, read, played, or experienced.", itemLabel: "Title or experience", dateLabel: "Date", categoryLabel: "Format", statusLabel: "Status", statuses: ["Planned", "Completed"], amountLabel: "Cost" },
  Calendar: { eyebrow: "THE SHAPE OF YOUR TIME", title: "Calendar", description: "Keep appointments and important dates alongside your everyday records.", itemLabel: "Event", dateLabel: "Event date", categoryLabel: "Event type", statusLabel: "Status", statuses: ["Planned", "Completed", "Cancelled"] },
};

type ModuleViewProps = { module: string; onNotify: (message: string) => void };

function escapeCsvValue(value: string | number | null | undefined): string {
  const normalized = String(value ?? "").replace(/\r?\n/g, " ").replace(/"/g, '""');
  return `"${normalized}"`;
}

function downloadCsv(name: string, rows: Array<Array<string | number | null | undefined>>) {
  const content = rows.map(row => row.map(value => escapeCsvValue(value)).join(",")).join("\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function RecordPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="panel"><div className="panel-heading"><h2>{title}</h2></div>{children}</section>;
}

function ReportsView({ onNotify }: { onNotify: (message: string) => void }) {
  const [revision, setRevision] = useState(0);
  const entries = ds.getTrackingEntries();
  const renderVersion = revision;

  const transactions = ds.getTransactions();
  const habitLogs = ds.getHabitLogs();
  const thisMonthEntries = entries.filter(entry => entry.date >= getStartOfMonth() && entry.date <= getEndOfMonth());
  const currentMonthEntries = [...thisMonthEntries, ...transactions.filter(transaction => transaction.date >= getStartOfMonth() && transaction.date <= getEndOfMonth())];
  const monthSeries = Array.from({ length: 6 }, (_, index) => {
    const monthDate = new Date();
    monthDate.setDate(1);
    monthDate.setMonth(monthDate.getMonth() - (5 - index));
    const key = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`;
    const count = entries.filter(entry => entry.date.startsWith(key)).length + transactions.filter(transaction => transaction.date.startsWith(key)).length;
    return { key, label: monthDate.toLocaleDateString("en-US", { month: "short" }), count };
  });
  const maxCount = Math.max(...monthSeries.map(month => month.count), 1);
  const graphPoints = monthSeries.map((month, index) => ({
    ...month,
    x: 36 + index * 112,
    y: 158 - month.count / maxCount * 112,
  }));
  const graphLine = graphPoints.map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`).join(" ");
  const graphArea = `${graphLine} L${graphPoints[graphPoints.length - 1].x},176 L${graphPoints[0].x},176 Z`;
  const moduleCounts = Object.keys(moduleCopy).map(module => ({ module, count: entries.filter(entry => entry.module === module).length }));
  const expenseTotal = transactions.filter(transaction => transaction.type === "expense").reduce((sum, transaction) => sum + transaction.amount, 0);
  const currency = ds.getProfile()?.currencySymbol || "৳";

  const exportReportCsv = () => {
    const rows: Array<Array<string | number | null | undefined>> = [
      ["Date", "Type", "Module", "Title", "Category", "Amount", "Status"],
      ...entries.map(entry => [entry.date, "Tracking", entry.module, entry.title, entry.category, entry.value ?? "", entry.status]),
      ...transactions.map(transaction => [transaction.date, transaction.type, "Finance", transaction.description, transaction.categoryName, formatCurrency(transaction.amount, currency), transaction.accountId]),
    ];
    downloadCsv("lifeos-report.csv", rows);
    onNotify("Reports CSV downloaded.");
  };

  return <div key={renderVersion}>
    <div className="welcome-row"><div><p className="eyebrow">SEE WHAT THE RECORDS SAY</p><h1>Reports<span>.</span></h1><p className="subheading">A live summary of saved entries, transactions, and habit logs.</p></div><div className="top-actions"><button className="secondary-button" type="button" onClick={exportReportCsv}>Export CSV</button><button className="secondary-button" type="button" onClick={() => window.print()}>Print / PDF</button><button className="secondary-button" type="button" onClick={() => setRevision(value => value + 1)}>Refresh report</button></div></div>
    <div className="metric-grid report-metrics">
      <div className="metric-card"><p>TRACKING RECORDS</p><strong className="metric-value">{entries.length}</strong><div className="metric-change">Across all tracking modules</div></div>
      <div className="metric-card"><p>THIS MONTH</p><strong className="metric-value">{currentMonthEntries.length}</strong><div className="metric-change">Entries and transactions</div></div>
      <div className="metric-card"><p>RECORDED EXPENSES</p><strong className="metric-value">{formatCurrency(expenseTotal, currency)}</strong><div className="metric-change orange">All saved expense transactions</div></div>
      <div className="metric-card"><p>HABIT CHECK-INS</p><strong className="metric-value">{habitLogs.length}</strong><div className="metric-change">Dated completion records</div></div>
    </div>
    <div className="dashboard-grid report-grid">
      <RecordPanel title="Activity over six months"><p className="chart-caption">Tracked records and finance transactions by date</p>{entries.length || transactions.length ? <div className="report-chart-wrap"><svg className="report-chart" viewBox="0 0 640 220" role="img" aria-label="Saved activity by month for the last six months" preserveAspectRatio="none"><defs><linearGradient id="activity-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#e8754f" stopOpacity=".28" /><stop offset="100%" stopColor="#e8754f" stopOpacity="0" /></linearGradient></defs><path className="report-chart-area" d={graphArea} /><path className="report-chart-line" d={graphLine} />{graphPoints.map(point => <g key={point.key}><circle className="report-chart-point" cx={point.x} cy={point.y} r="4"><title>{point.label}: {point.count} records</title></circle><text className="report-chart-value" x={point.x} y={point.y - 12} textAnchor="middle">{point.count}</text><text className="report-chart-label" x={point.x} y="202" textAnchor="middle">{point.label}</text></g>)}</svg></div> : <p className="data-empty">No records yet. Add tracked entries or transactions to build a history.</p>}</RecordPanel>
      <RecordPanel title="Records by module"><div className="report-module-list">{moduleCounts.map(item => <div className="report-module-row" key={item.module}><span>{item.module}</span><div className="report-bar-track"><i style={{ width: `${entries.length ? item.count / Math.max(...moduleCounts.map(row => row.count), 1) * 100 : 0}%` }} /></div><b>{item.count}</b></div>)}</div></RecordPanel>
    </div>
    <div className="data-panel-gap"><RecordPanel title="Current month tracking entries">{thisMonthEntries.length ? <div className="data-list">{thisMonthEntries.slice(0, 8).map(entry => <div className="data-list-row" key={entry.id}><span><b>{entry.title}</b><small>{entry.module} · {entry.category} · {formatDate(entry.date)}</small></span><strong>{entry.status}</strong></div>)}</div> : <p className="data-empty">No tracking entries for this month.</p>}</RecordPanel></div>
  </div>;
}

export default function ModuleView({ module, onNotify }: ModuleViewProps) {
  if (module === "Reports") return <ReportsView onNotify={onNotify} />;
  if (!(module in moduleCopy)) return <div className="panel data-error"><h2>Module unavailable</h2><p>This section does not have a local tracking model.</p></div>;
  return <TrackingModuleView module={module as TrackingModule} onNotify={onNotify} />;
}

function TrackingModuleView({ module, onNotify }: { module: TrackingModule; onNotify: (message: string) => void }) {
  const config = moduleCopy[module];
  const [revision, setRevision] = useState(0);
  const entries = ds.getTrackingEntries(module);
  const dataVersion = revision;
  const [editingId, setEditingId] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [date, setDate] = useState(getToday());
  const [status, setStatus] = useState(config.statuses[0]);
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState(module === "Health" ? "hours" : "km");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const month = new Date(getToday());
    month.setDate(1);
    return month;
  });

  const refresh = () => setRevision(current => current + 1);
  const completedCount = entries.filter(entry => ["completed", "purchased", "booked", "logged"].includes(entry.status.toLowerCase())).length;
  const totalAmount = entries.reduce((sum, entry) => sum + (entry.amount || 0), 0);
  const recentCount = entries.filter(entry => entry.date >= getStartOfMonth() && entry.date <= getEndOfMonth()).length;
  const currency = ds.getProfile()?.currencySymbol || "৳";
  const visibleEntries = entries.filter(entry => `${entry.title} ${entry.category} ${entry.notes} ${entry.status}`.toLowerCase().includes(search.toLowerCase()));
  const calendarEntries = module === "Calendar" ? entries : [];
  const calendarMonthStart = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
  const calendarMonthLabel = calendarMonthStart.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const monthDayCount = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate();
  const calendarStartOffset = calendarMonthStart.getDay();
  const calendarCells: Array<null | { date: string; day: number; matches: TrackingEntry[]; isToday: boolean }> = [
    ...Array.from({ length: calendarStartOffset }, () => null),
    ...Array.from({ length: monthDayCount }, (_, index) => {
      const day = index + 1;
      const date = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day);
      const formatted = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const matches = calendarEntries.filter(entry => entry.date === formatted).slice(0, 2);
      return { date: formatted, day, matches, isToday: formatted === getToday() };
    }),
  ];

  if (module === "Calendar") {
    visibleEntries.sort((first, second) => {
      const firstUpcoming = first.date >= getToday() && first.status !== "Cancelled";
      const secondUpcoming = second.date >= getToday() && second.status !== "Cancelled";
      if (firstUpcoming !== secondUpcoming) return firstUpcoming ? -1 : 1;
      return firstUpcoming ? first.date.localeCompare(second.date) : second.date.localeCompare(first.date);
    });
  }

  function resetForm() {
    setEditingId(""); setTitle(""); setCategory(""); setDate(getToday()); setStatus(config.statuses[0]); setValue(""); setAmount(""); setNotes("");
  }

  function editEntry(entry: TrackingEntry) {
    setEditingId(entry.id); setTitle(entry.title); setCategory(entry.category); setDate(entry.date); setStatus(entry.status);
    setValue(entry.value === null ? "" : String(entry.value)); setUnit(entry.unit); setAmount(entry.amount === null ? "" : String(entry.amount)); setNotes(entry.notes);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const numericValue = value.trim() ? Number(value) : null;
    const numericAmount = amount.trim() ? Number(amount) : null;
    if (!title.trim() || !category.trim() || !date || !config.statuses.includes(status)
      || (numericValue !== null && !Number.isFinite(numericValue))
      || (numericAmount !== null && (!Number.isFinite(numericAmount) || numericAmount < 0))) {
      onNotify("Complete the required fields and enter valid numeric values.");
      return;
    }
    const record = { module, title: title.trim(), category: category.trim(), date, status, value: numericValue, unit: unit.trim(), amount: numericAmount, notes: notes.trim() };
    try {
      if (editingId) {
        if (!await ds.updateTrackingEntry(editingId, record)) throw new Error("This record no longer exists.");
        onNotify("Record updated.");
      } else {
        await ds.addTrackingEntry(record);
        onNotify("Record saved.");
      }
      resetForm(); refresh();
    } catch (error) { onNotify(error instanceof Error ? error.message : "Unable to save this record."); }
  }

  async function deleteEntry(entry: TrackingEntry) {
    if (!window.confirm(`Delete “${entry.title}” from ${module}? This cannot be undone.`)) return;
    try {
      if (!await ds.deleteTrackingEntry(entry.id)) throw new Error("This record no longer exists.");
      if (editingId === entry.id) resetForm();
      refresh(); onNotify("Record deleted.");
    } catch (error) { onNotify(error instanceof Error ? error.message : "Unable to delete this record."); }
  }

  return <div className="module-view" key={dataVersion}>
    <div className="module-hero"><div><p className="eyebrow">{config.eyebrow}</p><h1>{config.title}<span className="module-period">.</span></h1><p className="subheading">{config.description}</p></div></div>
    <div className="metric-grid module-metric-grid">
      <div className="metric-card"><p>ALL RECORDS</p><strong className="metric-value">{entries.length}</strong><div className="metric-change">Saved to this LifeOS</div></div>
      <div className="metric-card"><p>THIS MONTH</p><strong className="metric-value">{recentCount}</strong><div className="metric-change">Based on record dates</div></div>
      <div className="metric-card"><p>COMPLETED / LOGGED</p><strong className="metric-value">{completedCount}</strong><div className="metric-change">Matching saved statuses</div></div>
      {config.amountLabel && <div className="metric-card"><p>RECORDED COST</p><strong className="metric-value">{formatCurrency(totalAmount, currency)}</strong><div className="metric-change">Sum of saved amounts</div></div>}
    </div>
    {module === "Calendar" && (
      <div className="panel calendar-shell">
        <div className="calendar-header">
          <h3>{calendarMonthLabel}</h3>
          <div className="calendar-nav">
            <button className="calendar-month-button" type="button" onClick={() => setCalendarMonth(current => new Date(current.getFullYear(), current.getMonth() - 1, 1))} aria-label="Previous month">←</button>
            <button className="calendar-month-button" type="button" onClick={() => setCalendarMonth(current => new Date(current.getFullYear(), current.getMonth() + 1, 1))} aria-label="Next month">→</button>
          </div>
        </div>
        <div className="calendar-grid" role="grid" aria-label={`Calendar for ${calendarMonthLabel}`}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(dayName => (
            <div key={dayName} className="calendar-weekday">{dayName}</div>
          ))}
          {calendarCells.map((cell, index) => {
            if (!cell) {
              return <div key={`empty-${index}`} className="calendar-day empty" aria-hidden="true" />;
            }
            const hasEvents = cell.matches.length > 0;
            return (
              <div key={cell.date} className={`calendar-day ${cell.isToday ? "is-today" : ""} ${hasEvents ? "has-events" : ""}`} role="gridcell" aria-label={`${cell.date}: ${cell.matches.length} event${cell.matches.length === 1 ? "" : "s"}`}>
                <span className="calendar-date">{cell.day}</span>
                {hasEvents && (
                  <div className="calendar-day-events">
                    {cell.matches.map((match: TrackingEntry) => <span key={`${cell.date}-${match.id}`}>{match.title}</span>)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    )}
    <div className="feature-grid module-form-grid">
      <RecordPanel title={editingId ? `Edit ${config.itemLabel.toLowerCase()}` : `Add ${config.itemLabel.toLowerCase()}`}>
        <form className="data-form" onSubmit={submit}>
          <label>{config.itemLabel}<input required maxLength={120} value={title} onChange={event => setTitle(event.target.value)} placeholder={`What do you want to track?`} /></label>
          <div className="form-row"><label>{config.categoryLabel}<input required maxLength={60} value={category} onChange={event => setCategory(event.target.value)} placeholder={config.categoryLabel} /></label><label>{config.dateLabel}<input type="date" required value={date} onChange={event => setDate(event.target.value)} /></label></div>
          <label>{config.statusLabel}<select value={status} onChange={event => setStatus(event.target.value)}>{config.statuses.map(option => <option value={option} key={option}>{option}</option>)}</select></label>
          {(config.valueLabel || config.amountLabel) && <div className="form-row">{config.valueLabel && <label>{config.valueLabel}<span className="module-value-input"><input type="number" step="any" value={value} onChange={event => setValue(event.target.value)} placeholder="Optional" /><input aria-label={config.unitLabel || "Measurement unit"} maxLength={12} value={unit} onChange={event => setUnit(event.target.value)} placeholder="Unit" /></span></label>}{config.amountLabel && <label>{config.amountLabel}<input type="number" min="0" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} placeholder="Optional" /></label>}</div>}
          <label>Notes<textarea rows={3} maxLength={500} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Optional details" /></label>
          <div className="data-form-actions"><button className="primary-button" type="submit">{editingId ? "Save changes" : "Save record"}</button>{editingId && <button className="secondary-button" type="button" onClick={resetForm}>Cancel</button>}</div>
        </form>
      </RecordPanel>
      <RecordPanel title="Latest activity"><div className="module-activity-head"><span>Past 7 days</span><strong>{entries.filter(entry => entry.date >= getRecentDate(7)).length} records</strong></div><div className="module-activity-bars">{getRecentDays().map(day => { const count = entries.filter(entry => entry.date === day.date).length; const max = Math.max(...getRecentDays().map(item => entries.filter(entry => entry.date === item.date).length), 1); return <div className="module-activity-day" key={day.date}><i style={{ height: `${Math.max(count ? 15 : 3, count / max * 100)}%` }} /><small>{day.label}</small></div>; })}</div><p className="chart-caption">No sample activity is shown; bars reflect saved records.</p></RecordPanel>
    </div>
    <div className="data-panel-gap"><RecordPanel title={`${config.title} records`}>
      <div className="module-record-tools"><span>{visibleEntries.length} of {entries.length} records</span><label className="module-search"><span className="sr-only">Filter records</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Filter records" /></label></div>
      {visibleEntries.length ? <div className="data-list">{visibleEntries.map(entry => <div className="data-list-row module-entry-row" key={entry.id}><span><b>{entry.title}</b><small>{entry.category} · {formatDate(entry.date)} · {entry.status}{entry.value !== null ? ` · ${entry.value} ${entry.unit}` : ""}{entry.amount !== null ? ` · ${formatCurrency(entry.amount, currency)}` : ""}</small>{entry.notes && <small>{entry.notes}</small>}</span><span className="data-row-actions"><button type="button" onClick={() => editEntry(entry)}>Edit</button><button type="button" onClick={() => deleteEntry(entry)}>Delete</button></span></div>)}</div> : <p className="data-empty">{entries.length ? "No records match this filter." : `No ${module.toLowerCase()} records yet. Add the first one above.`}</p>}
    </RecordPanel></div>
  </div>;
}

function getRecentDate(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - (days - 1));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getRecentDays(): { date: string; label: string }[] {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return { date: key, label: date.toLocaleDateString("en-US", { weekday: "short" }) };
  });
}
