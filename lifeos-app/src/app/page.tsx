"use client";

import { useMemo, useState, useEffect } from "react";
import * as ds from "@/lib/data-service";
import AuthView, { type AuthUser } from "@/components/AuthView";
import { Dashboard, DataErrorBoundary, FinanceView, HabitsView, GoalsView, SettingsView, TasksView } from "@/components/FeatureViews";
import ModuleView from "@/components/ModuleView";
import { resetClientCache } from "@/lib/storage";

const navigation: [string, string][] = [
  ["Overview", "O"], ["Finance", "$"], ["Health", "+"], ["Habits", "✓"],
  ["Productivity", "▤"], ["Goals", "◎"], ["Learning", "L"], ["Career", "↗"],
  ["Travel", "✈"], ["Shopping", "□"], ["Vehicle", "V"], ["Home", "⌂"],
  ["Entertainment", "▶"], ["Calendar", "▦"], ["Reports", "▥"],
];

const IMPLEMENTED_MODULES = [
  "Overview", "Finance", "Health", "Habits", "Productivity", "Goals",
  "Learning", "Career", "Travel", "Shopping", "Vehicle", "Home",
  "Entertainment", "Calendar", "Reports", "Settings",
];
const DEDICATED_MODULES = ["Overview", "Finance", "Habits", "Goals", "Productivity", "Settings"];
const ROUTABLE_PAGES = [...navigation.map(([label]) => label), "Settings"];

function normalizePage(page: string): string {
  return ROUTABLE_PAGES.includes(page) ? page : "Overview";
}

function resolvePageFromHash(): string {
  if (typeof window === "undefined") return "Overview";
  const hash = window.location.hash.replace(/^#\/?/, "").trim().toLowerCase();
  if (!hash) return "Overview";
  return ROUTABLE_PAGES.find(label => label.toLowerCase() === hash) || "Overview";
}

export default function Home() {
  const [active, setActive] = useState("Overview");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [toast, setToast] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [userName, setUserName] = useState("");
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    async function restoreSession() {
      try {
        const response = await fetch("/api/auth", { cache: "no-store", credentials: "same-origin" });
        const result = await response.json() as { user?: AuthUser | null };
        if (response.ok && result.user) {
          await ds.loadUserData();
          setAuthUser(result.user);
          setUserName(ds.getProfile()?.name || result.user.displayName);
          const savedTheme = ds.getProfile()?.theme === "dark" ? "dark" : "light";
          setTheme(savedTheme);
          document.documentElement.setAttribute("data-theme", savedTheme);
        }
      } catch {
        notify("Unable to connect to the local LifeOS data file.");
      } finally {
        setLoaded(true);
      }
    }
    void restoreSession();
  }, []);

  useEffect(() => {
    if (!authUser) return;
    function syncFromHash() {
      const nextPage = resolvePageFromHash();
      setActive(normalizePage(nextPage));
    }
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, [authUser]);

  useEffect(() => {
    if (!authUser) return;
    const hash = active === "Overview" ? "" : `#${active.toLowerCase()}`;
    if (window.location.hash !== hash) {
      const target = `${window.location.pathname}${hash}`;
      window.history.pushState(null, "", target);
    }
  }, [active, authUser]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  }

  async function handleAuthenticated(user: AuthUser) {
    try {
      await ds.loadUserData();
      setAuthUser(user);
      const profileName = ds.getProfile()?.name || user.displayName;
      setUserName(profileName);
      const savedTheme = ds.getProfile()?.theme === "dark" ? "dark" : "light";
      setTheme(savedTheme);
      document.documentElement.setAttribute("data-theme", savedTheme);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to load your saved records.");
    }
  }

  async function handleLogout() {
    try {
      await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) });
      resetClientCache();
      setAuthUser(null);
      setUserName("");
      setSearchOpen(false);
      document.documentElement.setAttribute("data-theme", "light");
    } catch {
      notify("Unable to sign out. Try again.");
    }
  }

  async function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
    try {
      await ds.saveProfile({ theme: nextTheme });
    } catch {
      notify("Unable to save your theme selection.");
    }
  }

  function handleNavigate(page: string) {
    const nextPage = normalizePage(page);
    setActive(nextPage);
    setMenuOpen(false);
    setSearchOpen(false);
    const nextHash = nextPage === "Overview" ? "" : `#${nextPage.toLowerCase()}`;
    const target = `${window.location.pathname}${nextHash}`;
    if (window.location.pathname + window.location.hash !== target) {
      window.history.pushState(null, "", target);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    }
  }

  const searchResults = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const results: Array<{ label: string; icon: string; page: string; description: string }> = [];

    const addModuleMatch = (label: string, icon: string) => {
      if (label === "Overview") return;
      const match = !normalizedQuery || label.toLowerCase().includes(normalizedQuery);
      if (match) {
        results.push({ label, icon, page: label, description: "Workspace module" });
      }
    };

    navigation.forEach(([label, icon]) => addModuleMatch(label, icon));

    if (!normalizedQuery) {
      return results.slice(0, 8);
    }

    const matches = (value: string | null | undefined) => value ? value.toLowerCase().includes(normalizedQuery) : false;

    ds.getTasks().forEach(task => {
      if (matches(task.title) || matches(task.category) || matches(task.priority)) {
        results.push({ label: task.title, icon: "✓", page: "Productivity", description: "Task" });
      }
    });

    ds.getGoals().forEach(goal => {
      if (matches(goal.title) || matches(goal.category) || matches(goal.notes)) {
        results.push({ label: goal.title, icon: "◎", page: "Goals", description: "Goal" });
      }
    });

    ds.getTransactions().forEach(transaction => {
      if (matches(transaction.description) || matches(transaction.categoryName) || matches(transaction.notes)) {
        results.push({ label: transaction.description, icon: "$", page: "Finance", description: "Transaction" });
      }
    });

    ds.getTrackingEntries().forEach(entry => {
      if (matches(entry.title) || matches(entry.category) || matches(entry.notes)) {
        results.push({ label: entry.title, icon: "▤", page: entry.module, description: `${entry.module} record` });
      }
    });

    const unique = new Map<string, { label: string; icon: string; page: string; description: string }>();
    results.forEach(result => {
      const key = `${result.page}:${result.label}:${result.description}`;
      if (!unique.has(key)) unique.set(key, result);
    });

    return Array.from(unique.values()).slice(0, 12);
  }, [searchQuery]);

  const initials = userName
    ? userName.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)
    : "U";

  if (!loaded) return <main className="auth-loading">Opening LifeOS...</main>;
  if (!authUser) return <AuthView onAuthenticated={handleAuthenticated} />;

  return (
    <main className="lifeos-shell" data-theme={theme}>
      <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <span className="brand-mark">L</span>
          <span>LIFE<span>OS</span></span>
        </div>
        <div className="workspace">
          <span className="avatar avatar-small">{initials}</span>
          <span>
            <b>{userName || "User"}&apos;s space</b>
            <small>Personal workspace</small>
          </span>
          <span className="chevron">⌄</span>
        </div>
        <p className="nav-label">WORKSPACE</p>
        <nav>
          {navigation.map(([label, icon]) => (
            <button
              key={label}
              className={`nav-item ${active === label ? "active" : ""}`}
              onClick={() => handleNavigate(label)}
            >
              <span className="nav-icon">{icon}</span>
              {label}
              {IMPLEMENTED_MODULES.includes(label) ? null : <span className="nav-soon">soon</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button
            className={`nav-item ${active === "Settings" ? "active" : ""}`}
            onClick={() => handleNavigate("Settings")}
          >
            <span className="nav-icon">⚙</span>Settings
          </button>
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle navigation">☰</button>
          <div className="breadcrumb">
            <span>Workspace</span>
            <b>/</b>
            <strong>{active}</strong>
          </div>
          <div className="top-actions">
            <button className="icon-button" type="button" onClick={() => setSearchOpen(true)} aria-label="Open global search">⌕</button>
            <button className="icon-button" type="button" onClick={toggleTheme} aria-label="Toggle theme">{theme === "dark" ? "☀" : "☾"}</button>
            <button className="profile" type="button">
              <span className="avatar">{initials}</span>
              <span className="profile-name">{userName || "User"}</span>
            </button>
            <button className="secondary-button sign-out-button" onClick={handleLogout}>Sign out</button>
          </div>
        </header>

        <div className="page-body">
          <DataErrorBoundary key={active}>
          {active === "Overview" && (
            <Dashboard onNavigate={handleNavigate} onNotify={notify} />
          )}
          {active === "Finance" && (
            <FinanceView onNotify={notify} />
          )}
          {active === "Habits" && (
            <HabitsView onNotify={notify} />
          )}
          {active === "Goals" && (
            <GoalsView onNotify={notify} />
          )}
          {active === "Productivity" && (
            <TasksView onNotify={notify} />
          )}
          {active === "Settings" && (
            <SettingsView onNotify={notify} />
          )}
          {!DEDICATED_MODULES.includes(active) && (
            <ModuleView key={active} module={active} onNotify={notify} />
          )}
          </DataErrorBoundary>
        </div>
      </section>

      {searchOpen && (
        <div className="search-backdrop" onClick={() => setSearchOpen(false)}>
          <div className="search-panel" onClick={event => event.stopPropagation()}>
            <div className="search-input-row">
              <span className="search-key">⌕</span>
              <input
                autoFocus
                value={searchQuery}
                onChange={event => setSearchQuery(event.target.value)}
                placeholder="Search modules..."
                aria-label="Search modules"
              />
            </div>
            <div className="search-results">
              {searchResults.length ? searchResults.map((result) => (
                <button
                  key={`${result.page}:${result.label}`}
                  type="button"
                  className="search-result"
                  onClick={() => {
                    setSearchQuery("");
                    handleNavigate(result.page);
                  }}
                >
                  <span className="search-result-icon">{result.icon}</span>
                  <span>
                    <strong>{result.label}</strong>
                    <small>{result.description}</small>
                  </span>
                </button>
              )) : <div className="search-empty">No modules or records match your search.</div>}
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">✓ {toast}</div>}
    </main>
  );
}
