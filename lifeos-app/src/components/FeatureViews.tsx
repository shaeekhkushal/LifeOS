"use client";

import { Component, useEffect, useState, type FormEvent, type ReactNode } from "react";
import * as ds from "@/lib/data-service";
import type { Account, Category, Goal, Habit, HabitLog, Task, Transaction } from "@/lib/types";
import { formatCurrency, formatDate, getToday } from "@/lib/utils";

type ViewProps = { onNotify: (message: string) => void };
type DashboardProps = ViewProps & { onNavigate: (page: string) => void };

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="panel"><div className="panel-heading"><h2>{title}</h2></div>{children}</section>;
}

function Empty({ children = "No entries yet." }: { children?: string }) {
  return <p className="data-empty">{children}</p>;
}

function ErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

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

function HorizontalBarChart({ data, emptyText, color = "#e8754f", formatter }: {
  data: { label: string; value: number }[];
  emptyText: string;
  color?: string;
  formatter?: (value: number) => string;
}) {
  if (!data.length || data.every(item => item.value === 0)) {
    return <Empty>{emptyText}</Empty>;
  }

  const maxValue = Math.max(...data.map(item => item.value), 1);
  return <div className="bar-chart-list">{data.map(item => (
    <div className="bar-chart-row" key={item.label}>
      <div className="bar-chart-meta">
        <span>{item.label}</span>
        <strong>{formatter ? formatter(item.value) : item.value}</strong>
      </div>
      <div className="bar-chart-track">
        <div className="bar-chart-fill" style={{ width: `${(item.value / maxValue) * 100}%`, background: color }} />
      </div>
    </div>
  ))}</div>;
}

export class DataErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return <div className="panel data-error"><h2>Local data could not be loaded</h2><p>Check browser storage, then retry this section.</p><button className="secondary-button" onClick={() => this.setState({ failed: false })}>Retry</button></div>;
    }
    return this.props.children;
  }
}

function OverviewMonthlyComparison({ transactions, currency }: { transactions: Transaction[]; currency: string }) {
  const cutoff = new Date();
  cutoff.setDate(1);
  cutoff.setMonth(cutoff.getMonth() - 5);
  const cutoffKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}`;
  const currentKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const monthlyTotals = new Map<string, { income: number; expenses: number }>();

  for (const transaction of transactions) {
    const key = transaction.date.slice(0, 7);
    if (transaction.type === "transfer" || key < cutoffKey || key > currentKey) continue;
    const totals = monthlyTotals.get(key) || { income: 0, expenses: 0 };
    if (transaction.type === "income") totals.income += transaction.amount;
    else totals.expenses += transaction.amount;
    monthlyTotals.set(key, totals);
  }

  const months = [...monthlyTotals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, totals]) => ({
      key,
      label: new Date(`${key}-01T00:00:00`).toLocaleDateString("en-US", { month: "short" }),
      ...totals,
    }));

  if (!months.length) return <Empty>No financial history yet.</Empty>;

  const maxValue = Math.max(...months.flatMap(month => [month.income, month.expenses]), 1);
  return <>
    <p className="overview-chart-caption">Months with recorded transactions only</p>
    <div className="overview-month-chart" role="img" aria-label="Monthly income and expense comparison for months with recorded transactions">
      {months.map(month => (
        <div className="overview-month-column" key={month.key}>
          <div className="overview-month-bars">
            <span className="overview-month-bar income-bar" style={{ height: `${month.income ? Math.max(4, (month.income / maxValue) * 100) : 0}%` }} title={`${month.label} income: ${formatCurrency(month.income, currency)}`} />
            <span className="overview-month-bar expense-bar" style={{ height: `${month.expenses ? Math.max(4, (month.expenses / maxValue) * 100) : 0}%` }} title={`${month.label} expenses: ${formatCurrency(month.expenses, currency)}`} />
          </div>
          <span className="overview-month-label">{month.label}</span>
          <span className="sr-only">{month.label}: income {formatCurrency(month.income, currency)}, expenses {formatCurrency(month.expenses, currency)}</span>
        </div>
      ))}
    </div>
    <div className="overview-chart-legend"><span><i className="income-legend" />Income</span><span><i className="expense-legend" />Expenses</span></div>
  </>;
}

function OverviewHabitHeatmap({ habits, logs }: { habits: Habit[]; logs: HabitLog[] }) {
  if (!habits.length) return <Empty>No habit data available yet.</Empty>;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const currentWeekStart = new Date(today);
  currentWeekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  currentWeekStart.setDate(currentWeekStart.getDate() - 35);
  const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const activeHabitIds = new Set(habits.map(habit => habit.id));
  const firstDay = dateKey(currentWeekStart);
  const todayKey = dateKey(today);
  const recentLogs = logs.filter(log => log.completed && activeHabitIds.has(log.habitId) && log.date >= firstDay && log.date <= todayKey);

  if (!recentLogs.length) {
    return <Empty>{logs.some(log => log.completed && activeHabitIds.has(log.habitId)) ? "No habit check-ins in the last six weeks." : "No habit check-ins recorded yet."}</Empty>;
  }

  const completedByDate = new Map<string, Set<string>>();
  for (const log of recentLogs) {
    const completed = completedByDate.get(log.date) || new Set<string>();
    completed.add(log.habitId);
    completedByDate.set(log.date, completed);
  }
  const maxDailyCheckIns = Math.max(...Array.from(completedByDate.values(), completed => completed.size), 1);

  const weeks = Array.from({ length: 6 }, (_, weekIndex) =>
    Array.from({ length: 7 }, (_, dayIndex) => {
      const date = new Date(currentWeekStart);
      date.setDate(currentWeekStart.getDate() + weekIndex * 7 + dayIndex);
      const key = dateKey(date);
      const eligibleHabits = habits.filter(habit => habit.createdAt.slice(0, 10) <= key).length;
      const completed = completedByDate.get(key)?.size || 0;
      const level = eligibleHabits ? Math.min(4, Math.ceil((completed / maxDailyCheckIns) * 4)) : 0;
      return { key, label: date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }), eligibleHabits, completed, level, future: key > todayKey };
    }),
  );

  return <>
    <p className="overview-chart-caption">Daily habit check-ins · last six weeks</p>
    <div className="overview-heatmap-weekdays" aria-hidden="true">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(day => <span key={day}>{day}</span>)}</div>
    <div className="overview-heatmap">
      {weeks.flatMap(week => week.map(day => (
        <span
          className={`overview-heat-cell level-${day.level}${day.future || !day.eligibleHabits ? " heat-cell-muted" : ""}`}
          key={day.key}
          title={day.future ? `${day.label}: not yet` : `${day.label}: ${day.completed} habit check-ins`}
          aria-label={day.future ? `${day.label}, not yet` : `${day.label}, ${day.completed} habit check-ins`}
          role="img"
        />
      )))}
    </div>
    <div className="overview-heatmap-legend"><span>Less</span>{[0, 1, 2, 3, 4].map(level => <i className={`level-${level}`} key={level} />)}<span>More</span></div>
  </>;
}

function OverviewGoalProgress({ goals, onNavigate }: { goals: Goal[]; onNavigate: (page: string) => void }) {
  if (!goals.length) return <Empty>No active goals.</Empty>;

  return <>
    <div className="overview-goal-list">
      {goals.slice(0, 4).map(goal => {
        const progress = ds.getGoalProgress(goal);
        return <div className="overview-goal-item" key={goal.id}>
          <div className="overview-goal-label"><b>{goal.title}</b><span>{progress}%</span></div>
          <div className="overview-goal-track" role="progressbar" aria-label={`${goal.title} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><i style={{ width: `${progress}%` }} /></div>
          <small>Due {formatDate(goal.targetDate)}</small>
        </div>;
      })}
    </div>
    <button className="text-button" onClick={() => onNavigate("Goals")}>View goals <span>→</span></button>
  </>;
}

function OverviewTaskStatus({ tasks, todaysTasks, onNavigate }: { tasks: Task[]; todaysTasks: Task[]; onNavigate: (page: string) => void }) {
  const labels: Record<Task["status"], string> = {
    not_started: "Not started",
    in_progress: "In progress",
    completed: "Completed",
    cancelled: "Cancelled",
  };
  const counts = (Object.keys(labels) as Task["status"][]).map(status => ({
    label: labels[status],
    value: tasks.filter(task => task.status === status).length,
  }));

  return <>
    <HorizontalBarChart data={counts} emptyText="No task data available yet." color="#527f73" />
    <div className="overview-today">
      <h3>Today</h3>
      {todaysTasks.length ? <div className="data-list">{todaysTasks.slice(0, 4).map(task => <div className="data-list-row" key={task.id}><span>{task.title}</span><small>{labels[task.status]}</small></div>)}</div> : <Empty>No tasks recorded for today.</Empty>}
    </div>
    <button className="text-button" onClick={() => onNavigate("Productivity")}>View tasks <span>→</span></button>
  </>;
}

type FinanceMonth = { key: string; label: string; income: number; expenses: number; savings: number };

function FinanceCashFlowChart({ transactions, currency, range }: { transactions: Transaction[]; currency: string; range: number }) {
  const cutoff = new Date();
  cutoff.setDate(1);
  cutoff.setMonth(cutoff.getMonth() - (range - 1));
  const cutoffKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}`;
  const current = new Date();
  const currentKey = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`;
  const totals = new Map<string, { income: number; expenses: number }>();

  transactions.forEach(transaction => {
    const key = transaction.date.slice(0, 7);
    if (transaction.type === "transfer" || key < cutoffKey || key > currentKey) return;
    const month = totals.get(key) || { income: 0, expenses: 0 };
    if (transaction.type === "income") month.income += transaction.amount;
    else month.expenses += transaction.amount;
    totals.set(key, month);
  });

  const months: FinanceMonth[] = [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, month]) => ({
      key,
      label: new Date(`${key}-01T00:00:00`).toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
      ...month,
      savings: month.income - month.expenses,
    }));

  if (!months.length) {
    return <Empty>No income or expense records in this period.</Empty>;
  }

  const width = 640;
  const height = 226;
  const padding = { left: 28, right: 24, top: 18, bottom: 28 };
  const maxValue = Math.max(...months.flatMap(month => [month.income, month.expenses, month.savings]), 1);
  const minValue = Math.min(...months.map(month => month.savings), 0);
  const plotHeight = height - padding.top - padding.bottom;
  const plotWidth = width - padding.left - padding.right;
  const yFor = (value: number) => padding.top + ((maxValue - value) / (maxValue - minValue || 1)) * plotHeight;
  const xFor = (index: number) => padding.left + (months.length === 1 ? plotWidth / 2 : (index / (months.length - 1)) * plotWidth);
  const incomePath = months.map((month, index) => `${index ? "L" : "M"} ${xFor(index)} ${yFor(month.income)}`).join(" ");
  const expensesPath = months.map((month, index) => `${index ? "L" : "M"} ${xFor(index)} ${yFor(month.expenses)}`).join(" ");
  const savingsPath = months.map((month, index) => `${index ? "L" : "M"} ${xFor(index)} ${yFor(month.savings)}`).join(" ");

  return <>
    <p className="finance-chart-caption">
      {months.length < 2 ? "One recorded month so far; keep logging transactions to reveal a trend." : "Recorded months only · hover points for exact totals"}
    </p>
    <div className="finance-cashflow-wrap">
      <svg className="finance-cashflow-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Monthly income, expense, and net savings over ${range} months`}>
        {[0, 0.25, 0.5, 0.75, 1].map(fraction => {
          const y = padding.top + plotHeight * fraction;
          return <path className="finance-grid-line" d={`M ${padding.left} ${y} H ${width - padding.right}`} key={fraction} />;
        })}
        <path className="finance-zero-line" d={`M ${padding.left} ${yFor(0)} H ${width - padding.right}`} />
        {months.length > 1 && <>
          <path className="finance-income-line" d={incomePath} />
          <path className="finance-expense-line" d={expensesPath} />
        </>}
        {months.map((month, index) => {
          const x = xFor(index);
          return <g key={month.key}>
            <circle className="finance-series-point income-series" cx={x} cy={yFor(month.income)} r="4">
              <title>{month.label} income: {formatCurrency(month.income, currency)}</title>
            </circle>
            <circle className="finance-series-point expense-series" cx={x} cy={yFor(month.expenses)} r="4">
              <title>{month.label} expenses: {formatCurrency(month.expenses, currency)}</title>
            </circle>
            <text className="finance-axis-label" x={x} y={height - 7} textAnchor="middle">{month.label}</text>
          </g>;
        })}
        {months.length > 1 && <path className="finance-savings-line" d={savingsPath} />}
        {months.map((month, index) => <circle className="finance-savings-point" cx={xFor(index)} cy={yFor(month.savings)} r="4" key={`${month.key}-savings`}>
          <title>{month.label} net savings: {formatCurrency(month.savings, currency)}</title>
        </circle>)}
      </svg>
    </div>
    <div className="finance-chart-legend">
      <span><i className="income-legend" />Income</span>
      <span><i className="expense-legend" />Expenses</span>
      <span><i className="savings-legend" />Net savings</span>
    </div>
    <div className="sr-only">{months.map(month => `${month.label}: income ${formatCurrency(month.income, currency)}, expenses ${formatCurrency(month.expenses, currency)}, net savings ${formatCurrency(month.savings, currency)}.`).join(" ")}</div>
  </>;
}

function FinanceSpendingDistribution({ categories, currency }: { categories: { categoryName: string; amount: number }[]; currency: string }) {
  const positiveCategories = categories.filter(category => category.amount > 0);
  if (!positiveCategories.length) return <Empty>No expense distribution available this month.</Empty>;

  const ranked = [...positiveCategories].sort((a, b) => b.amount - a.amount);
  const displayed = ranked.length > 6
    ? [...ranked.slice(0, 5), { categoryName: "Other categories", amount: ranked.slice(5).reduce((sum, category) => sum + category.amount, 0) }]
    : ranked;
  const total = displayed.reduce((sum, category) => sum + category.amount, 0);
  const colors = ["#e8754f", "#527f73", "#e9ad49", "#8b83b5", "#6d9bb0", "#c47a8b"];
  const radius = 43;
  const circumference = 2 * Math.PI * radius;
  const segments = displayed.reduce<Array<{ category: { categoryName: string; amount: number }; offset: number; segment: number; index: number }>>((result, category) => {
    const previousOffset = result.reduce((sum, item) => sum + item.segment, 0);
    const segment = (category.amount / total) * circumference;
    result.push({ category, offset: previousOffset, segment, index: result.length });
    return result;
  }, []);

  return <div className="finance-distribution">
    <div className="finance-donut-wrap">
      <svg className="finance-donut" viewBox="0 0 120 120" role="img" aria-label={`Expense category distribution, total ${formatCurrency(total, currency)}`}>
        <circle cx="60" cy="60" r={radius} fill="none" stroke="#edf1ed" strokeWidth="15" />
        {segments.map(segmentData => {
          const { category, offset, segment, index } = segmentData;
          return <circle
            key={category.categoryName}
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke={colors[index % colors.length]}
            strokeWidth="15"
            strokeDasharray={`${segment} ${circumference - segment}`}
            strokeDashoffset={-offset}
            transform="rotate(-90 60 60)"
          >
            <title>{category.categoryName}: {formatCurrency(category.amount, currency)} ({Math.round((category.amount / total) * 100)}%)</title>
          </circle>;
        })}
      </svg>
      <div className="finance-donut-center"><b>{formatCurrency(total, currency)}</b><span>This month</span></div>
    </div>
    <div className="finance-distribution-legend">
      {displayed.map((category, index) => <div className="finance-distribution-item" key={category.categoryName}>
        <i style={{ background: colors[index % colors.length] }} />
        <span>{category.categoryName}</span>
        <b>{Math.round((category.amount / total) * 100)}%</b>
      </div>)}
    </div>
  </div>;
}

function FinanceSpendingHeatmap({ transactions, currency }: { transactions: Transaction[]; currency: string }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(today.getDate() - ((today.getDay() + 6) % 7) - (11 * 7));
  const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const firstKey = dateKey(start);
  const todayKey = dateKey(today);
  const totals = new Map<string, { amount: number; count: number }>();

  transactions.forEach(transaction => {
    if (transaction.type !== "expense" || transaction.date < firstKey || transaction.date > todayKey) return;
    const day = totals.get(transaction.date) || { amount: 0, count: 0 };
    day.amount += transaction.amount;
    day.count++;
    totals.set(transaction.date, day);
  });

  if (!totals.size) return <Empty>No spending activity recorded in the last 12 weeks.</Empty>;

  const maxAmount = Math.max(...Array.from(totals.values(), day => day.amount), 1);
  const cells = Array.from({ length: 84 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const key = dateKey(date);
    const day = totals.get(key) || { amount: 0, count: 0 };
    const level = day.amount ? Math.min(4, Math.max(1, Math.ceil((day.amount / maxAmount) * 4))) : 0;
    return { key, date, ...day, level, future: key > todayKey };
  });

  return <>
    <p className="finance-chart-caption">Recorded daily expenses · blank days have no saved expense records</p>
    <div className="finance-heatmap-months" aria-hidden="true">
      {Array.from({ length: 12 }, (_, week) => {
        const date = new Date(start);
        date.setDate(start.getDate() + week * 7);
        return <span key={week}>{date.getDate() <= 7 ? date.toLocaleDateString("en-US", { month: "short" }) : ""}</span>;
      })}
    </div>
    <div className="finance-heatmap-layout">
      <div className="finance-heatmap-weekdays" aria-hidden="true">{["M", "W", "F"].map((day, index) => <span key={day} style={{ gridRow: index * 2 + 1 }}>{day}</span>)}</div>
      <div className="finance-heatmap" role="group" aria-label="Expense activity for the last 12 weeks">
        {cells.map(cell => <span
          className={`finance-heat-cell level-${cell.level}${cell.future ? " future-cell" : ""}`}
          key={cell.key}
          title={cell.future ? `${dateLabel(cell.date)}: future date` : `${dateLabel(cell.date)}: ${formatCurrency(cell.amount, currency)} · ${cell.count} expense${cell.count === 1 ? "" : "s"}`}
          aria-label={cell.future ? `${dateLabel(cell.date)}, future date` : `${dateLabel(cell.date)}, ${formatCurrency(cell.amount, currency)}, ${cell.count} expenses`}
          role="img"
        />)}
      </div>
    </div>
    <div className="finance-heatmap-legend"><span>Less</span>{[0, 1, 2, 3, 4].map(level => <i className={`level-${level}`} key={level} />)}<span>More</span></div>
  </>;
}

function dateLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function FinanceAccountOverview({ accounts, currency }: { accounts: Account[]; currency: string }) {
  if (!accounts.length) return <Empty>No active accounts available.</Empty>;

  const balances = accounts.map(account => ({ account, balance: ds.getAccountBalance(account.id) }));
  const maxBalance = Math.max(...balances.map(item => Math.abs(item.balance)), 0);
  return <div className="finance-account-overview">
    {balances.map(({ account, balance }) => <div className="finance-account-item" key={account.id}>
      <div className="finance-account-heading"><span><b>{account.name}</b><small>{account.type.replaceAll("_", " ")}</small></span><strong>{formatCurrency(balance, currency)}</strong></div>
      <div className="finance-account-track"><i className={balance < 0 ? "negative-balance" : ""} style={{ width: `${maxBalance > 0 ? (Math.abs(balance) / maxBalance) * 100 : 0}%` }} /></div>
    </div>)}
  </div>;
}

function TaskScheduleTrend({ tasks, range }: { tasks: Task[]; range: number }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const currentWeekStart = new Date(today);
  currentWeekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  currentWeekStart.setDate(currentWeekStart.getDate() - 7 * (range - 1));
  const buckets = Array.from({ length: range }, (_, index) => {
    const start = new Date(currentWeekStart);
    start.setDate(currentWeekStart.getDate() + index * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return {
      key: dateKey(start),
      label: start.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      endKey: dateKey(end),
      count: 0,
    };
  });
  const bucketByWeek = new Map(buckets.map((bucket, index) => [bucket.key, index]));

  tasks.filter(task => task.status !== "cancelled").forEach(task => {
    const date = new Date(`${task.date}T00:00:00`);
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    const index = bucketByWeek.get(dateKey(weekStart));
    if (index !== undefined) buckets[index].count++;
  });

  if (!tasks.some(task => task.status !== "cancelled" && task.date >= buckets[0].key && task.date <= buckets[buckets.length - 1].endKey)) {
    return <Empty>No scheduled task activity in this period.</Empty>;
  }

  const maxCount = Math.max(...buckets.map(bucket => bucket.count), 1);
  return <>
    <p className="productivity-chart-caption">Non-cancelled tasks by scheduled week · not completion history</p>
    <div className="productivity-week-chart" role="img" aria-label={`Scheduled tasks per week for the last ${range} weeks`}>
      {buckets.map(bucket => <div className="productivity-week-column" key={bucket.key}>
        <div className="productivity-week-bar-wrap">
          <i
            className={bucket.count ? "has-tasks" : ""}
            style={{ height: `${bucket.count ? Math.max(4, (bucket.count / maxCount) * 100) : 0}%` }}
            title={`${bucket.label} week: ${bucket.count} scheduled task${bucket.count === 1 ? "" : "s"}`}
          />
        </div>
        <span>{bucket.label}</span>
        <small>{bucket.count}</small>
      </div>)}
    </div>
  </>;
}

function TaskActivityHeatmap({ tasks }: { tasks: Task[] }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(today.getDate() - ((today.getDay() + 6) % 7) - 11 * 7);
  const keyForDate = dateKey;
  const firstKey = keyForDate(start);
  const todayKey = keyForDate(today);
  const byDate = new Map<string, number>();

  tasks.filter(task => task.status !== "cancelled" && task.date >= firstKey && task.date <= todayKey)
    .forEach(task => byDate.set(task.date, (byDate.get(task.date) || 0) + 1));

  if (!byDate.size) return <Empty>No scheduled tasks in the last 12 weeks.</Empty>;

  const maxCount = Math.max(...byDate.values(), 1);
  const cells = Array.from({ length: 84 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const key = keyForDate(date);
    const count = byDate.get(key) || 0;
    const level = count ? Math.min(4, Math.max(1, Math.ceil((count / maxCount) * 4))) : 0;
    return { key, date, count, level };
  });

  return <>
    <p className="productivity-chart-caption">Scheduled non-cancelled tasks per day · blank days have no scheduled tasks</p>
    <div className="productivity-heatmap-months" aria-hidden="true">
      {Array.from({ length: 12 }, (_, week) => {
        const date = new Date(start);
        date.setDate(start.getDate() + week * 7);
        return <span key={week}>{date.getDate() <= 7 ? date.toLocaleDateString("en-US", { month: "short" }) : ""}</span>;
      })}
    </div>
    <div className="productivity-heatmap-layout">
      <div className="productivity-heatmap-weekdays" aria-hidden="true">{["M", "W", "F"].map((day, index) => <span key={day} style={{ gridRow: index * 2 + 1 }}>{day}</span>)}</div>
      <div className="productivity-heatmap" role="group" aria-label="Scheduled task activity for the last 12 weeks">
        {cells.map(cell => <span
          className={`productivity-heat-cell level-${cell.level}`}
          key={cell.key}
          title={`${dateLabel(cell.date)}: ${cell.count} scheduled task${cell.count === 1 ? "" : "s"}`}
          aria-label={`${dateLabel(cell.date)}, ${cell.count} scheduled task${cell.count === 1 ? "" : "s"}`}
          role="img"
        />)}
      </div>
    </div>
    <div className="productivity-heatmap-legend"><span>Less</span>{[0, 1, 2, 3, 4].map(level => <i className={`level-${level}`} key={level} />)}<span>More</span></div>
  </>;
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const currency = ds.getProfile()?.currencySymbol || "৳";
  const transactions = ds.getTransactions();
  const habits = ds.getHabits();
  const habitLogs = ds.getHabitLogs();
  const tasks = ds.getTasks();
  const todaysTasks = ds.getTasks({ date: getToday() });
  const goals = ds.getGoals("active");
  const income = ds.getMonthlyIncome();
  const expenses = ds.getMonthlyExpenses();
  const savings = ds.getMonthlySavings();
  const currentHabitCompletion = habits.length ? ds.getOverallHabitCompletion() : 0;
  const transactionsByCategory = ds.getExpensesByCategory().slice(0, 5).map(item => ({
    label: item.categoryName,
    value: item.amount,
  }));
  const activeGoals = goals.length;
  const completedToday = habits.filter(habit => ds.isHabitCompletedToday(habit.id)).length;

  return (
    <div>
      <div className="welcome-row">
        <div><p className="eyebrow">YOUR LIFE, IN PERSPECTIVE</p><h1>Life overview<span>.</span></h1><p className="subheading">A current snapshot of your finances, habits, goals, and tasks.</p></div>
        <button className="primary-button" onClick={() => onNavigate("Finance")}>Add transaction <span>+</span></button>
      </div>
      <div className="metric-grid overview-metrics overview-metrics-financial">
        <div className="metric-card"><p>MONTHLY INCOME</p><strong className="metric-value">{formatCurrency(income, currency)}</strong><div className="metric-change">From recorded income</div></div>
        <div className="metric-card"><p>MONTHLY EXPENSES</p><strong className="metric-value">{formatCurrency(expenses, currency)}</strong><div className="metric-change orange">From recorded expenses</div></div>
        <div className="metric-card"><p>MONTHLY SAVINGS</p><strong className="metric-value">{formatCurrency(savings, currency)}</strong><div className="metric-change">Income minus expenses</div></div>
        <div className="metric-card"><p>ACCOUNT BALANCE</p><strong className="metric-value">{formatCurrency(ds.getTotalBalance(), currency)}</strong><div className="metric-change">Across active accounts</div></div>
      </div>
      <div className="metric-grid overview-metrics overview-metrics-life">
        <div className="metric-card"><p>HABITS COMPLETED TODAY</p><strong className="metric-value">{habits.length ? `${currentHabitCompletion}%` : "0%"}</strong><div className="metric-change">{habits.length ? `${completedToday} of ${habits.length} habits` : "No habits created"}</div></div>
        <div className="metric-card"><p>ACTIVE GOALS</p><strong className="metric-value">{activeGoals}</strong><div className="metric-change">Current goal targets</div></div>
      </div>
      <div className="dashboard-grid overview-grid">
        <Panel title="Income vs expenses">
          <OverviewMonthlyComparison transactions={transactions} currency={currency} />
        </Panel>
        <Panel title="Top expense categories">
          <p className="overview-chart-caption">This month · largest categories</p>
          <HorizontalBarChart data={transactionsByCategory} emptyText="No expense categories yet." color="#e8754f" formatter={value => formatCurrency(value, currency)} />
        </Panel>
      </div>
      <div className="dashboard-grid overview-grid">
        <Panel title="Habit consistency">
          <OverviewHabitHeatmap habits={habits} logs={habitLogs} />
        </Panel>
        <Panel title="Goal progress">
          <OverviewGoalProgress goals={goals} onNavigate={onNavigate} />
        </Panel>
      </div>
      <div className="dashboard-grid overview-grid">
        <Panel title="Recent transactions">
          {transactions.length ? <div className="data-list">{transactions.slice(0, 5).map(transaction => <div className="data-list-row" key={transaction.id}><span><b>{transaction.description}</b><small>{formatDate(transaction.date)} · {transaction.categoryName}</small></span><strong className={transaction.type === "expense" ? "amount-expense" : "amount-income"}>{transaction.type === "expense" ? "−" : "+"}{formatCurrency(transaction.amount, currency)}</strong></div>)}</div> : <Empty>No transactions recorded.</Empty>}
          <button className="text-button" onClick={() => onNavigate("Finance")}>Open finance <span>→</span></button>
        </Panel>
        <Panel title="Productivity snapshot">
          <OverviewTaskStatus tasks={tasks} todaysTasks={todaysTasks} onNavigate={onNavigate} />
        </Panel>
      </div>
      <button className="data-refresh" onClick={() => window.location.reload()} aria-label="Refresh overview">Refresh overview</button>
    </div>
  );
}

export function FinanceView({ onNotify }: ViewProps) {
  const [revision, setRevision] = useState(0);
  const [trendRange, setTrendRange] = useState(6);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [editingId, setEditingId] = useState("");
  const [date, setDate] = useState(getToday());
  const [type, setType] = useState<"expense" | "income">("expense");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountType, setNewAccountType] = useState<Account["type"]>("bank");
  const [newAccountBalance, setNewAccountBalance] = useState("0");

  useEffect(() => {
    async function loadFinance() {
      try {
        await ds.initializeDefaults();
        setTransactions(ds.getTransactions());
        setCategories(ds.getCategories());
        setAccounts(ds.getAccounts());
      } catch (error) { onNotify(ErrorMessage(error, "Unable to load finance records.")); }
    }
    void loadFinance();
  }, [onNotify, revision]);

  const currency = ds.getProfile()?.currencySymbol || "৳";
  const filteredCategories = categories.filter(category => category.type === type);
  const refresh = () => setRevision(value => value + 1);

  function editTransaction(transaction: Transaction) {
    if (transaction.type === "transfer") return;
    setEditingId(transaction.id);
    setDate(transaction.date);
    setType(transaction.type);
    setCategoryId(transaction.categoryId);
    setAccountId(transaction.accountId);
    setDescription(transaction.description);
    setAmount(String(transaction.amount));
  }

  function resetForm() {
    setEditingId(""); setDate(getToday()); setType("expense"); setCategoryId(""); setAccountId(""); setDescription(""); setAmount("");
  }

  async function submitAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const openingBalance = Number(newAccountBalance);
    if (!newAccountName.trim() || !Number.isFinite(openingBalance)) {
      onNotify("Enter an account name and a valid opening balance.");
      return;
    }
    try {
      await ds.addAccount({ name: newAccountName.trim(), type: newAccountType, openingBalance });
      setNewAccountName(""); setNewAccountBalance("0");
      refresh(); onNotify("Account added.");
    } catch (error) { onNotify(ErrorMessage(error, "Unable to add the account.")); }
  }

  async function removeAccount(account: Account) {
    if (!window.confirm(`Remove “${account.name}” from your active accounts? Existing transactions will remain.`)) return;
    try {
      if (!await ds.deleteAccount(account.id)) throw new Error("That account no longer exists.");
      refresh(); onNotify("Account removed.");
    } catch (error) { onNotify(ErrorMessage(error, "Unable to remove the account.")); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const numericAmount = Number(amount);
    const category = categories.find(item => item.id === categoryId);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0 || !category || !accountId || !date || !description.trim()) {
      onNotify("Enter a valid amount and complete every transaction field.");
      return;
    }
    try {
      const data = { date, type, categoryId, categoryName: category.name, description: description.trim(), amount: numericAmount, accountId };
      if (editingId) {
        if (!await ds.updateTransaction(editingId, data)) throw new Error("That transaction no longer exists.");
        onNotify("Transaction updated.");
      } else {
        await ds.addTransaction(data);
        onNotify("Transaction saved.");
      }
      resetForm(); refresh();
    } catch (error) { onNotify(ErrorMessage(error, "Unable to save the transaction.")); }
  }

  async function removeTransaction(id: string) {
    if (!window.confirm("Delete this transaction? This cannot be undone.")) return;
    try {
      if (!await ds.deleteTransaction(id)) throw new Error("That transaction no longer exists.");
      if (editingId === id) resetForm();
      refresh(); onNotify("Transaction deleted.");
    } catch (error) { onNotify(ErrorMessage(error, "Unable to delete the transaction.")); }
  }

  const income = ds.getMonthlyIncome();
  const expenses = ds.getMonthlyExpenses();
  const expenseCategories = ds.getExpensesByCategory();
  const topExpenseCategories = expenseCategories.slice(0, 6).map(item => ({ label: item.categoryName, value: item.amount }));

  const exportFinanceCsv = () => {
    const rows: Array<Array<string | number | null | undefined>> = [
      ["Date", "Type", "Category", "Description", "Amount", "Account", "Notes"],
      ...transactions.map(transaction => [
        transaction.date,
        transaction.type,
        transaction.categoryName,
        transaction.description,
        transaction.amount,
        accounts.find(account => account.id === transaction.accountId)?.name || transaction.accountId,
        transaction.notes || "",
      ]),
    ];
    downloadCsv(`lifeos-finance-${getToday()}.csv`, rows);
    onNotify("Finance CSV downloaded.");
  };

  return <div key={revision}>
    <div className="welcome-row"><div><p className="eyebrow">MONEY, MADE VISIBLE</p><h1>Finance<span>.</span></h1><p className="subheading">Every figure here comes from your saved transactions.</p></div><div className="top-actions"><button className="secondary-button" type="button" onClick={exportFinanceCsv}>Export CSV</button><button className="secondary-button" type="button" onClick={() => window.print()}>Print / PDF</button></div></div>
    <div className="metric-grid finance-metrics"><div className="metric-card"><p>THIS MONTH INCOME</p><strong className="metric-value">{formatCurrency(income, currency)}</strong><div className="metric-change">Recorded income</div></div><div className="metric-card"><p>THIS MONTH EXPENSES</p><strong className="metric-value">{formatCurrency(expenses, currency)}</strong><div className="metric-change orange">Recorded expenses</div></div><div className="metric-card"><p>THIS MONTH SAVINGS</p><strong className="metric-value">{formatCurrency(income - expenses, currency)}</strong><div className="metric-change">Income minus expenses</div></div><div className="metric-card"><p>ACCOUNT BALANCE</p><strong className="metric-value">{formatCurrency(ds.getTotalBalance(), currency)}</strong><div className="metric-change">Across active accounts</div></div></div>
    <div className="finance-period-row">
      <span>Cash flow period</span>
      <div className="finance-range-controls" role="group" aria-label="Cash flow chart period">
        {[3, 6, 12].map(months => <button className={trendRange === months ? "selected" : ""} type="button" key={months} onClick={() => setTrendRange(months)} aria-pressed={trendRange === months}>{months} months</button>)}
      </div>
    </div>
    <div className="dashboard-grid finance-grid">
      <Panel title="Cash flow trend">
        <FinanceCashFlowChart transactions={transactions} currency={currency} range={trendRange} />
      </Panel>
      <Panel title="Where spending goes">
        <p className="finance-chart-caption">Top categories this month, ranked by amount</p>
        <HorizontalBarChart data={topExpenseCategories} emptyText="No expense categories yet." color="#e8754f" formatter={value => formatCurrency(value, currency)} />
      </Panel>
    </div>
    <div className="dashboard-grid finance-grid">
      <Panel title="Spending distribution">
        <FinanceSpendingDistribution categories={expenseCategories} currency={currency} />
      </Panel>
      <Panel title={`Account balances (${accounts.length})`}>
        <FinanceAccountOverview accounts={accounts} currency={currency} />
      </Panel>
    </div>
    <div className="data-panel-gap">
      <Panel title="Spending activity">
        <FinanceSpendingHeatmap transactions={transactions} currency={currency} />
      </Panel>
    </div>
    <div className="data-panel-gap finance-entry-section">
      <Panel title={editingId ? "Edit transaction" : "Add transaction"}>
        {!accounts.length ? <Empty>No active account available. Review setup or reset local data from Settings.</Empty> : <form className="data-form" onSubmit={submit}>
          <label>Type<select value={type} onChange={event => { setType(event.target.value as "expense" | "income"); setCategoryId(""); }}><option value="expense">Expense</option><option value="income">Income</option></select></label>
          <label>Amount<input type="number" inputMode="decimal" min="0.01" step="0.01" required value={amount} onChange={event => setAmount(event.target.value)} placeholder="0.00" /></label>
          <label>Description<input required maxLength={100} value={description} onChange={event => setDescription(event.target.value)} placeholder="What was this for?" /></label>
          <label>Category<select required value={categoryId} onChange={event => setCategoryId(event.target.value)}><option value="">Choose a category</option>{filteredCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label>Account<select required value={accountId} onChange={event => setAccountId(event.target.value)}><option value="">Choose an account</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
          <label>Date<input required type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
          <div className="data-form-actions"><button className="primary-button" type="submit">{editingId ? "Save changes" : "Save transaction"}</button>{editingId && <button type="button" className="secondary-button" onClick={resetForm}>Cancel</button>}</div>
        </form>}
      </Panel>
    </div>
    <div className="data-panel-gap"><Panel title={`Your accounts (${accounts.length})`}>
      <form className="data-form account-form" onSubmit={submitAccount}>
        <div className="form-row"><label>Account name<input required maxLength={60} value={newAccountName} onChange={event => setNewAccountName(event.target.value)} placeholder="e.g. Main bank" /></label><label>Type<select value={newAccountType} onChange={event => setNewAccountType(event.target.value as Account["type"])}><option value="cash">Cash</option><option value="bank">Bank</option><option value="mobile_wallet">Mobile wallet</option><option value="credit_card">Credit card</option><option value="investment">Investment</option><option value="other">Other</option></select></label><label>Opening balance<input type="number" step="0.01" value={newAccountBalance} onChange={event => setNewAccountBalance(event.target.value)} /></label></div>
        <button className="primary-button" type="submit">Add account</button>
      </form>
      {accounts.length ? <div className="data-list">{accounts.map(account => <div className="data-list-row" key={account.id}><span><b>{account.name}</b><small>{account.type.replace("_", " ")} · {formatCurrency(ds.getAccountBalance(account.id), currency)} current balance</small></span><button type="button" className="danger-button" onClick={() => void removeAccount(account)}>Remove</button></div>)}</div> : <Empty>No finance accounts yet.</Empty>}
    </Panel></div>
    <div className="data-panel-gap"><Panel title={`Transactions (${transactions.length})`}>
      {transactions.length ? <div className="data-list">{transactions.map(transaction => <div className="data-list-row" key={transaction.id}><span><b>{transaction.description}</b><small>{formatDate(transaction.date)} · {transaction.categoryName} · {accounts.find(account => account.id === transaction.accountId)?.name || "Account removed"}</small></span><strong className={transaction.type === "expense" ? "amount-expense" : "amount-income"}>{transaction.type === "expense" ? "−" : "+"}{formatCurrency(transaction.amount, currency)}</strong><span className="data-row-actions"><button type="button" onClick={() => editTransaction(transaction)} disabled={transaction.type === "transfer"}>Edit</button><button type="button" onClick={() => removeTransaction(transaction.id)}>Delete</button></span></div>)}</div> : <Empty>No transactions yet. Add your first income or expense above.</Empty>}
    </Panel></div>
  </div>;
}

export function HabitsView({ onNotify }: ViewProps) {
  const [revision, setRevision] = useState(0);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Personal");
  const [frequency, setFrequency] = useState<"daily" | "weekly">("daily");
  const [target, setTarget] = useState("7");
  const habits = ds.getHabits();
  const refresh = () => setRevision(value => value + 1);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const targetPerWeek = Number(target);
    if (!name.trim() || !Number.isInteger(targetPerWeek) || targetPerWeek < 1 || targetPerWeek > 7) { onNotify("Enter a habit name and a weekly target from 1 to 7."); return; }
    try { await ds.addHabit({ name: name.trim(), category, frequency, targetPerWeek }); setName(""); refresh(); onNotify("Habit added."); }
    catch (error) { onNotify(ErrorMessage(error, "Unable to add the habit.")); }
  }

  return <div key={revision}>
    <div className="welcome-row"><div><p className="eyebrow">SMALL PROMISES, KEPT</p><h1>Habits<span>.</span></h1><p className="subheading">Track consistency with dated completion records.</p></div></div>
    <div className="feature-grid"><Panel title="Create a habit"><form className="data-form" onSubmit={submit}><label>Habit name<input required maxLength={80} value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Walk outside" /></label><label>Category<input value={category} onChange={event => setCategory(event.target.value)} maxLength={40} /></label><label>Frequency<select value={frequency} onChange={event => setFrequency(event.target.value as "daily" | "weekly")}><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label><label>Target per week<input type="number" min="1" max="7" step="1" required value={target} onChange={event => setTarget(event.target.value)} /></label><button className="primary-button" type="submit">Add habit</button></form></Panel><Panel title="Today’s progress"><strong className="metric-value">{habits.length ? `${ds.getOverallHabitCompletion()}%` : "0%"}</strong><p className="subheading">{habits.filter(habit => ds.isHabitCompletedToday(habit.id)).length} of {habits.length} habits completed today</p></Panel></div>
    <div className="data-panel-gap"><Panel title={`Your habits (${habits.length})`}>{habits.length ? <div className="data-list">{habits.map(habit => { const completed = ds.isHabitCompletedToday(habit.id); return <div className="data-list-row" key={habit.id}><span><b>{habit.name}</b><small>{habit.category} · {habit.frequency} · {ds.getHabitStreak(habit.id)} day streak</small></span><button type="button" className={completed ? "secondary-button" : "primary-button"} onClick={async () => { try { await ds.toggleHabit(habit.id); refresh(); onNotify(completed ? "Completion removed." : "Habit marked complete."); } catch (error) { onNotify(ErrorMessage(error, "Unable to update habit.")); } }}>{completed ? "Undo today" : "Complete today"}</button><button type="button" className="danger-button" onClick={async () => { if (!window.confirm(`Delete ${habit.name} and its completion history?`)) return; try { if (!await ds.deleteHabit(habit.id)) throw new Error("That habit no longer exists."); refresh(); onNotify("Habit deleted."); } catch (error) { onNotify(ErrorMessage(error, "Unable to delete habit.")); } }}>Delete</button></div>; })}</div> : <Empty>No habits created yet.</Empty>}</Panel></div>
  </div>;
}

export function GoalsView({ onNotify }: ViewProps) {
  const [revision, setRevision] = useState(0);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Personal");
  const [targetDate, setTargetDate] = useState("");
  const [targetValue, setTargetValue] = useState("1");
  const [unit, setUnit] = useState("complete");
  const [priority, setPriority] = useState<Goal["priority"]>("medium");
  const goals = ds.getGoals();
  const refresh = () => setRevision(value => value + 1);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const numericTarget = Number(targetValue);
    if (!title.trim() || !targetDate || !Number.isFinite(numericTarget) || numericTarget <= 0) { onNotify("Enter a title, target date, and positive target value."); return; }
    try { await ds.addGoal({ title: title.trim(), category, targetDate, startValue: 0, currentValue: 0, targetValue: numericTarget, unit: unit.trim() || "complete", priority }); setTitle(""); refresh(); onNotify("Goal created."); }
    catch (error) { onNotify(ErrorMessage(error, "Unable to create goal.")); }
  }

  return <div key={revision}>
    <div className="welcome-row"><div><p className="eyebrow">MAKE ROOM FOR WHAT MATTERS</p><h1>Goals<span>.</span></h1><p className="subheading">Record a target, then update progress as it changes.</p></div></div>
    <div className="feature-grid"><Panel title="New goal"><form className="data-form" onSubmit={submit}><label>Goal<input required maxLength={100} value={title} onChange={event => setTitle(event.target.value)} placeholder="What are you working toward?" /></label><label>Category<input value={category} onChange={event => setCategory(event.target.value)} maxLength={40} /></label><label>Target date<input type="date" required value={targetDate} onChange={event => setTargetDate(event.target.value)} /></label><div className="form-row"><label>Target value<input type="number" min="0.01" step="any" required value={targetValue} onChange={event => setTargetValue(event.target.value)} /></label><label>Unit<input required maxLength={20} value={unit} onChange={event => setUnit(event.target.value)} /></label></div><label>Priority<select value={priority} onChange={event => setPriority(event.target.value as Goal["priority"])}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label><button className="primary-button" type="submit">Create goal</button></form></Panel><Panel title="Progress overview">{goals.length ? <div className="data-list">{goals.filter(goal => goal.status === "active").slice(0, 4).map(goal => <div className="data-list-row" key={goal.id}><span><b>{goal.title}</b><small>{ds.getGoalProgress(goal)}% · due {formatDate(goal.targetDate)}</small></span></div>)}</div> : <Empty>No goals recorded.</Empty>}</Panel></div>
    <div className="data-panel-gap"><Panel title={`All goals (${goals.length})`}>{goals.length ? <div className="data-list">{goals.map(goal => <GoalRow key={goal.id} goal={goal} onNotify={onNotify} refresh={refresh} />)}</div> : <Empty>Create your first goal above.</Empty>}</Panel></div>
  </div>;
}

function GoalRow({ goal, onNotify, refresh }: { goal: Goal; onNotify: ViewProps["onNotify"]; refresh: () => void }) {
  const [value, setValue] = useState(String(goal.currentValue));
  async function updateProgress() {
    const currentValue = Number(value);
    if (!Number.isFinite(currentValue)) { onNotify("Progress must be a valid number."); return; }
    try { if (!await ds.updateGoal(goal.id, { currentValue, status: currentValue >= goal.targetValue ? "completed" : goal.status === "completed" ? "active" : goal.status })) throw new Error("That goal no longer exists."); refresh(); onNotify("Goal progress updated."); }
    catch (error) { onNotify(ErrorMessage(error, "Unable to update goal.")); }
  }
  return <div className="data-list-row goal-row"><span><b>{goal.title}</b><small>{goal.category} · due {formatDate(goal.targetDate)} · {goal.status} · {ds.getGoalProgress(goal)}%</small></span><label className="inline-field">Progress<input type="number" step="any" value={value} onChange={event => setValue(event.target.value)} /></label><button type="button" className="secondary-button" onClick={updateProgress}>Update</button><button type="button" className="danger-button" onClick={async () => { if (!window.confirm(`Delete goal “${goal.title}”?`)) return; try { if (!await ds.deleteGoal(goal.id)) throw new Error("That goal no longer exists."); refresh(); onNotify("Goal deleted."); } catch (error) { onNotify(ErrorMessage(error, "Unable to delete goal.")); } }}>Delete</button></div>;
}

export function TasksView({ onNotify }: ViewProps) {
  const [revision, setRevision] = useState(0);
  const [scheduleRange, setScheduleRange] = useState(8);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(getToday());
  const [deadline, setDeadline] = useState("");
  const [priority, setPriority] = useState<Task["priority"]>("medium");
  const tasks = ds.getTasks();
  const taskStats = ds.getTaskStats();
  const completionRate = taskStats.total ? Math.round((taskStats.completed / taskStats.total) * 100) : 0;
  const statusLabels: Record<Task["status"], string> = {
    not_started: "Not started",
    in_progress: "In progress",
    completed: "Completed",
    cancelled: "Cancelled",
  };
  const statusBreakdown = (Object.keys(statusLabels) as Task["status"][]).map(status => ({
    label: statusLabels[status],
    value: tasks.filter(task => task.status === status).length,
  }));
  const priorityBreakdown = (["high", "medium", "low"] as const).map(level => ({
    label: `${level[0].toUpperCase()}${level.slice(1)} priority`,
    value: tasks.filter(task => task.status !== "cancelled" && task.priority === level).length,
  }));
  const refresh = () => setRevision(value => value + 1);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || !date || (deadline && deadline < date)) { onNotify("Enter a task title and a valid date or deadline."); return; }
    try { await ds.addTask({ title: title.trim(), date, deadline, priority }); setTitle(""); setDate(getToday()); setDeadline(""); refresh(); onNotify("Task added."); }
    catch (error) { onNotify(ErrorMessage(error, "Unable to add task.")); }
  }

  return <div key={revision}>
    <div className="welcome-row"><div><p className="eyebrow">PUT THE NEXT THING IN VIEW</p><h1>Productivity<span>.</span></h1><p className="subheading">A task list grounded in the dates and priorities you set.</p></div></div>
    <div className="metric-grid productivity-metrics">
      <div className="metric-card"><p>OPEN TASKS</p><strong className="metric-value">{Math.max(taskStats.total - taskStats.completed, 0)}</strong><div className="metric-change">Not completed · excludes cancelled</div></div>
      <div className="metric-card"><p>COMPLETION RATE</p><strong className="metric-value">{completionRate}%</strong><div className="metric-change">{taskStats.completed} of {taskStats.total} active tasks</div></div>
      <div className="metric-card"><p>IN PROGRESS</p><strong className="metric-value">{taskStats.inProgress}</strong><div className="metric-change">Currently underway</div></div>
      <div className="metric-card"><p>OVERDUE</p><strong className="metric-value">{taskStats.overdue}</strong><div className="metric-change orange">Past deadline · still open</div></div>
    </div>
    <div className="productivity-period-row">
      <span>Scheduled workload</span>
      <div className="productivity-range-controls" role="group" aria-label="Scheduled task chart period">
        {[4, 8, 12].map(weeks => <button className={scheduleRange === weeks ? "selected" : ""} type="button" key={weeks} onClick={() => setScheduleRange(weeks)} aria-pressed={scheduleRange === weeks}>{weeks} weeks</button>)}
      </div>
    </div>
    <div className="dashboard-grid productivity-grid">
      <Panel title="Tasks scheduled over time">
        <TaskScheduleTrend tasks={tasks} range={scheduleRange} />
      </Panel>
      <Panel title="Task status">
        <p className="productivity-chart-caption">Current saved status across all tasks</p>
        <HorizontalBarChart data={statusBreakdown} emptyText="No task data available yet." color="#527f73" />
      </Panel>
    </div>
    <div className="dashboard-grid productivity-grid">
      <Panel title="Task activity">
        <TaskActivityHeatmap tasks={tasks} />
      </Panel>
      <Panel title="Priority distribution">
        <p className="productivity-chart-caption">Open and completed tasks by assigned priority</p>
        <HorizontalBarChart data={priorityBreakdown} emptyText="No task data available yet." color="#e8754f" />
      </Panel>
    </div>
    <div className="data-panel-gap productivity-entry-section">
      <Panel title="Add a task">
        <form className="data-form" onSubmit={submit}>
          <label>Task<input required maxLength={120} value={title} onChange={event => setTitle(event.target.value)} placeholder="What needs doing?" /></label>
          <div className="form-row"><label>Scheduled date<input type="date" required value={date} onChange={event => setDate(event.target.value)} /></label><label>Deadline<input type="date" min={date} value={deadline} onChange={event => setDeadline(event.target.value)} /></label></div>
          <label>Priority<select value={priority} onChange={event => setPriority(event.target.value as Task["priority"])}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
          <button className="primary-button" type="submit">Add task</button>
        </form>
      </Panel>
    </div>
    <div className="data-panel-gap"><Panel title={`Tasks (${tasks.length})`}>{tasks.length ? <div className="data-list">{tasks.map(task => <div className="data-list-row task-row" key={task.id}><span><b>{task.title}</b><small>{formatDate(task.date)}{task.deadline ? ` · due ${formatDate(task.deadline)}` : ""} · {task.priority} priority</small></span><div className="task-row-controls"><select aria-label={`Status for ${task.title}`} value={task.status} onChange={async event => { try { if (!await ds.updateTask(task.id, { status: event.target.value as Task["status"] })) throw new Error("That task no longer exists."); refresh(); onNotify("Task status updated."); } catch (error) { onNotify(ErrorMessage(error, "Unable to update task.")); } }}><option value="not_started">Not started</option><option value="in_progress">In progress</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select><button type="button" className="danger-button" onClick={async () => { if (!window.confirm(`Delete task “${task.title}”?`)) return; try { if (!await ds.deleteTask(task.id)) throw new Error("That task no longer exists."); refresh(); onNotify("Task deleted."); } catch (error) { onNotify(ErrorMessage(error, "Unable to delete task.")); } }}>Delete</button></div></div>)}</div> : <Empty>No tasks recorded yet.</Empty>}</Panel></div>
  </div>;
}

export function SettingsView({ onNotify }: ViewProps) {
  const profile = ds.getProfile();
  const [name, setName] = useState(profile?.name || "");
  const [currencySymbol, setCurrencySymbol] = useState(profile?.currencySymbol || "৳");
  const [summary, setSummary] = useState(() => ds.getDataSummary());
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || !currencySymbol.trim()) { onNotify("Name and currency symbol are required."); return; }
    try { await ds.saveProfile({ name: name.trim(), currencySymbol: currencySymbol.trim(), isSetupComplete: true }); onNotify("Settings saved."); }
    catch (error) { onNotify(ErrorMessage(error, "Unable to save settings.")); }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword.length < 6 || newPassword !== confirmPassword) {
      onNotify(newPassword.length < 6 ? "New password must be at least 6 characters." : "New passwords do not match.");
      return;
    }
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "change-password", password: currentPassword, newPassword }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to change password.");
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      onNotify("Password updated.");
    } catch (error) { onNotify(ErrorMessage(error, "Unable to change password.")); }
  }

  async function resetData() {
    if (!window.confirm("Permanently delete all local LifeOS data, including your profile? This cannot be undone.")) return;
    try { await ds.clearAllData(); window.location.reload(); }
    catch (error) { onNotify(ErrorMessage(error, "Unable to clear local data.")); }
  }

  return <div>
    <div className="welcome-row"><div><p className="eyebrow">YOUR LOCAL WORKSPACE</p><h1>Settings<span>.</span></h1><p className="subheading">Your account and records are saved by this LifeOS installation.</p></div></div>
    <div className="feature-grid"><Panel title="Personal profile"><form className="data-form" onSubmit={save}><label>Your name<input required maxLength={80} value={name} onChange={event => setName(event.target.value)} /></label><label>Currency symbol<input required maxLength={8} value={currencySymbol} onChange={event => setCurrencySymbol(event.target.value)} /></label><button className="primary-button" type="submit">Save settings</button></form></Panel><Panel title="Stored records"><div className="data-list">{Object.entries(summary).map(([key, count]) => <div className="data-list-row" key={key}><span>{key[0].toUpperCase() + key.slice(1)}</span><strong>{count}</strong></div>)}</div></Panel></div>
    <div className="data-panel-gap"><Panel title="Change password"><form className="data-form" onSubmit={changePassword}><label>Current password<input required type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} /></label><div className="form-row"><label>New password<input required type="password" minLength={6} autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} /></label><label>Confirm new password<input required type="password" minLength={6} autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} /></label></div><button className="primary-button" type="submit">Update password</button></form></Panel></div>
    <div className="data-panel-gap"><Panel title="Local data"><p className="subheading">Reset removes this account’s saved records and restores its default categories and Cash account. This cannot be undone.</p><button className="danger-button" type="button" onClick={resetData}>Delete this account’s data</button><button type="button" className="secondary-button settings-refresh" onClick={() => setSummary(ds.getDataSummary())}>Refresh record counts</button></Panel></div>
  </div>;
}
