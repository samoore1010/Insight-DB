import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { parse, differenceInDays, format, startOfToday, addDays, isWeekend, isBefore } from "date-fns";
import { DailyData, DashboardStats, Entity, DisbursementItem, EstimateCategory, Report, EXECUTIVE_ENTITY, DEFAULT_REGIONS } from "./types";
import { parseLiquidityData, calculateStats } from "./data/parser";
import SummaryCards from "./components/SummaryCards";
import LiquidityChart from "./components/LiquidityChart";
import ForecastTable from "./components/ForecastTable";
import ReconciliationTable from "./components/ReconciliationTable";
import DisbursementEstimates from "./components/DisbursementEstimates";
import CashCalendar from "./components/CashCalendar";
import ReportsView from "./components/ReportsView";
import MaximizeWrapper from "./components/MaximizeWrapper";
import SettingsView from "./components/SettingsView";
import ChangeHistory from "./components/ChangeHistory";
import LoginPage from "./components/LoginPage";
import { syncEstimates, syncDisbursements, syncBalances } from "./api/treasury";
import { LayoutDashboard, Building2, FileText, Settings, Bell, Search, Users, MapPin, Globe, Earth, Car, Building, Landmark, Play, Pause, RotateCcw, Menu, X, History, LogOut } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import type { User } from "./auth";

const BANK_HOLIDAYS_2026 = [
  "2026-01-01", // New Year's Day
  "2026-01-19", // MLK Day
  "2026-02-16", // Presidents' Day
  "2026-05-25", // Memorial Day
  "2026-06-19", // Juneteenth
  "2026-07-03", // Independence Day (Observed)
  "2026-09-07", // Labor Day
  "2026-10-12", // Columbus Day
  "2026-11-11", // Veterans Day
  "2026-11-26", // Thanksgiving
  "2026-12-25", // Christmas
];

const isBusinessDay = (date: Date) => {
  if (isWeekend(date)) return false;
  const dateStr = format(date, "yyyy-MM-dd");
  return !BANK_HOLIDAYS_2026.includes(dateStr);
};

export default function App() {
  // === Auth State ===
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = sessionStorage.getItem("authUser");
    return saved ? JSON.parse(saved) : null;
  });
  const [allUsers, setAllUsers] = useState<User[]>([]);

  const refreshUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/users");
      if (res.ok) setAllUsers(await res.json());
    } catch {}
  }, []);

  const handleLogin = async (username: string, password: string, location?: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, location })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error || "Login failed" };
      const user = data.user;
      setCurrentUser(user);
      sessionStorage.setItem("authUser", JSON.stringify(user));
      return { success: true };
    } catch {
      return { success: false, error: "Connection failed" };
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    sessionStorage.removeItem("authUser");
  };

  const handleCreateUser = async (username: string, password: string, displayName: string, role: "admin" | "viewer", allowedRegions: string[], location?: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch("/api/auth/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, displayName, role, allowedRegions, location: location || "executive" })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      await refreshUsers();
      return { success: true };
    } catch {
      return { success: false, error: "Connection failed" };
    }
  };

  const handleUpdateUser = async (id: string, updates: { displayName?: string; role?: "admin" | "viewer"; allowedRegions?: string[]; password?: string }): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch(`/api/auth/users/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates)
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      await refreshUsers();
      return { success: true };
    } catch {
      return { success: false, error: "Connection failed" };
    }
  };

  const handleDeleteUser = async (id: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch(`/api/auth/users/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      await refreshUsers();
      return { success: true };
    } catch {
      return { success: false, error: "Connection failed" };
    }
  };

  // Load users list when authenticated as admin
  useEffect(() => {
    if (currentUser?.role === "admin") refreshUsers();
  }, [currentUser, refreshUsers]);

  // Determine department mode from current user's location
  const isDepartmentMode = currentUser ? currentUser.location !== "executive" : false;
  const deptName = currentUser?.location || "executive";
  const deptPrefix = isDepartmentMode ? `dept::${deptName}::` : "";
  const deptConsolidatedKey = isDepartmentMode ? `dept::${deptName}::_consolidated` : "";

  // Helper: get display name for a region (strips dept prefix)
  const regionDisplayName = useCallback((region: string) => {
    if (deptPrefix && region.startsWith(deptPrefix)) {
      return region.slice(deptPrefix.length);
    }
    return region;
  }, [deptPrefix]);

  // === Department State ===
  interface Department { id: string; name: string; regions: string[]; }
  const [departments, setDepartments] = useState<Department[]>([]);

  const fetchDepartments = useCallback(async () => {
    try {
      const res = await fetch("/api/departments");
      if (res.ok) setDepartments(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    if (currentUser) fetchDepartments();
  }, [currentUser, fetchDepartments]);

  // Load department regions when in department mode
  useEffect(() => {
    if (!isDepartmentMode || departments.length === 0) return;
    const dept = departments.find(d => d.name.toLowerCase() === deptName.toLowerCase());
    if (dept) {
      const namespacedRegions = dept.regions.map(r => `dept::${deptName}::${r}`);
      setRegions(namespacedRegions);

      // Initialize state maps for each department region
      const newEstimates: Record<string, any> = {};
      const newOverrides: Record<string, any> = {};
      const newBalances: Record<string, any> = {};
      const newSimOverrides: Record<string, any> = {};
      namespacedRegions.forEach(r => {
        newEstimates[r] = makeDefaultEstimates(r);
        newOverrides[r] = {};
        newBalances[r] = { main: 0 };
        newSimOverrides[r] = {};
      });
      setEntityEstimates(prev => ({ ...prev, ...newEstimates }));
      setManualOverrides(prev => ({ ...prev, ...newOverrides }));
      setManualBalances(prev => ({ ...prev, ...newBalances }));
      setSimulationOverrides(prev => ({ ...prev, ...newSimOverrides }));

      // Set the current entity to the department consolidated view
      if (namespacedRegions.length > 0) {
        setCurrentEntity(`dept::${deptName}::_consolidated` as Entity);
      }

      // Initialize parser data for department regions
      const parsed = parseLiquidityData(namespacedRegions);
      setMultiEntityData(parsed);
    }
  }, [isDepartmentMode, departments, deptName]);

  const handleCreateDepartment = async (name: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch("/api/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      await fetchDepartments();
      return { success: true };
    } catch {
      return { success: false, error: "Connection failed" };
    }
  };

  const handleDeleteDepartment = async (id: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch(`/api/departments/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      await fetchDepartments();
      return { success: true };
    } catch {
      return { success: false, error: "Connection failed" };
    }
  };

  const handleUpdateDepartmentRegions = async (deptId: string, newRegions: string[]): Promise<void> => {
    try {
      await fetch(`/api/departments/${deptId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regions: newRegions })
      });
      await fetchDepartments();
    } catch {}
  };

  // === Main App State ===
  const [multiEntityData, setMultiEntityData] = useState<Record<Entity, DailyData[]> | null>(null);
  const [currentEntity, setCurrentEntity] = useState<Entity>(EXECUTIVE_ENTITY);
  const [activeView, setActiveView] = useState<"dashboard" | "reports" | "settings" | "history">("dashboard");
  const mainContentRef = useRef<HTMLElement>(null);

  // Scroll content to top when switching views or entities
  useEffect(() => {
    mainContentRef.current?.scrollTo(0, 0);
  }, [activeView, currentEntity]);

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [forecastDays, setForecastDays] = useState(14);
  const [regions, setRegions] = useState<string[]>(() => {
    if (!isDepartmentMode) {
      const saved = localStorage.getItem('regions');
      return saved ? JSON.parse(saved) : DEFAULT_REGIONS;
    }
    // Department mode: will be loaded from department record
    return [];
  });
  const [isSimulationMode, setIsSimulationMode] = useState(false);

  // Helper to build region-keyed empty records
  const emptyRegionRecord = <T,>(factory: () => T): Record<string, T> => {
    const rec: Record<string, T> = {};
    regions.forEach(r => { rec[r] = factory(); });
    return rec;
  };

  const [simulationOverrides, setSimulationOverrides] = useState<Record<string, Record<string, Partial<DailyData>>>>(() => {
    const rec: Record<string, Record<string, Partial<DailyData>>> = {};
    DEFAULT_REGIONS.forEach(r => { rec[r] = {}; });
    return rec;
  });
  
  const todayStr = format(startOfToday(), "yyyy-MM-dd");

  const makeDefaultEstimates = (region: string): EstimateCategory[] => {
    const prefix = region.toLowerCase().replace(/\s+/g, '-').substring(0, 3);
    return [
      { id: `${prefix}-payroll`, label: "Payroll", baseAmount: 0, adjustment: 0, period: "Bi-Weekly", startDate: todayStr },
      { id: `${prefix}-ops`, label: "General AP Payments", baseAmount: 0, adjustment: 0, period: "Daily", startDate: todayStr }
    ];
  };

  const [entityEstimates, setEntityEstimates] = useState<Record<string, EstimateCategory[]>>(() => {
    const rec: Record<string, EstimateCategory[]> = {};
    DEFAULT_REGIONS.forEach(r => { rec[r] = makeDefaultEstimates(r); });
    return rec;
  });

  const [manualOverrides, setManualOverrides] = useState<Record<string, Record<string, Partial<DailyData>>>>(() => {
    const rec: Record<string, Record<string, Partial<DailyData>>> = {};
    DEFAULT_REGIONS.forEach(r => { rec[r] = {}; });
    return rec;
  });

  const [manualBalances, setManualBalances] = useState<Record<string, Record<string, number>>>(() => {
    const rec: Record<string, Record<string, number>> = {};
    DEFAULT_REGIONS.forEach(r => { rec[r] = { main: 0 }; });
    return rec;
  });
  const [reports, setReports] = useState<Report[]>([]);

  const [isLoaded, setIsLoaded] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('light');
  const [currency, setCurrency] = useState('USD');
  const [dateFormat, setDateFormat] = useState('MM/DD/YYYY');
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | 'system' || 'light';
    const savedCurrency = localStorage.getItem('currency') || 'USD';
    const savedDateFormat = localStorage.getItem('dateFormat') || 'MM/DD/YYYY';
    const savedLogo = localStorage.getItem('companyLogo');
    
    setTheme(savedTheme);
    setCurrency(savedCurrency);
    setDateFormat(savedDateFormat);
    if (savedLogo) setCompanyLogo(savedLogo);
  }, []);

  useEffect(() => {
    const applyTheme = (newTheme: 'light' | 'dark' | 'system') => {
      const root = window.document.documentElement;
      root.classList.remove('light', 'dark');

      if (newTheme === 'system') {
        const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        root.classList.add(systemTheme);
      } else {
        root.classList.add(newTheme);
      }
    };

    applyTheme(theme);

    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => applyTheme('system');
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [theme]);

  const handleThemeChange = (newTheme: 'light' | 'dark' | 'system') => {
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
  };

  const handleCurrencyChange = (newCurrency: string) => {
    setCurrency(newCurrency);
    localStorage.setItem('currency', newCurrency);
  };

  const handleDateFormatChange = (newFormat: string) => {
    setDateFormat(newFormat);
    localStorage.setItem('dateFormat', newFormat);
  };

  const handleCompanyLogoChange = (logo: string | null) => {
    setCompanyLogo(logo);
    if (logo) {
      localStorage.setItem('companyLogo', logo);
    } else {
      localStorage.removeItem('companyLogo');
    }
  };

  const handleExportData = () => {
    const dataToExport = {
      entityEstimates,
      manualOverrides,
      manualBalances,
      reports,
      settings: {
        theme,
        currency,
        dateFormat,
        companyLogo
      }
    };
    
    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `treasury-data-export-${format(new Date(), 'yyyy-MM-dd')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleResetData = async () => {
    if (window.confirm("Are you sure you want to reset all data? This will permanently delete all manual overrides, estimates, and settings.")) {
      try {
        await fetch("/api/reset", { method: "POST" });
        localStorage.clear();
        window.location.reload();
      } catch (error) {
        console.error("Failed to reset data:", error);
        alert("Failed to reset data. Please try again.");
      }
    }
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await fetch("/api/data");
        const data = await response.json();

        if (isDepartmentMode) {
          // Department mode: only load data for namespaced regions
          // The blob data might contain department-scoped keys, so filter accordingly
          if (data.entityEstimates) {
            const filtered: Record<string, any> = {};
            Object.entries(data.entityEstimates).forEach(([k, v]) => {
              if (k.startsWith(deptPrefix)) filtered[k] = v;
            });
            if (Object.keys(filtered).length > 0) setEntityEstimates(prev => ({ ...prev, ...filtered }));
          }
          if (data.manualOverrides) {
            const filtered: Record<string, any> = {};
            Object.entries(data.manualOverrides).forEach(([region, days]: [string, any]) => {
              if (!region.startsWith(deptPrefix)) return;
              filtered[region] = {};
              Object.entries(days).forEach(([date, values]: [string, any]) => {
                const { cashIn, ...rest } = values;
                if (Object.keys(rest).length > 0) filtered[region][date] = rest;
              });
            });
            if (Object.keys(filtered).length > 0) setManualOverrides(prev => ({ ...prev, ...filtered }));
          }
          if (data.manualBalances) {
            const filtered: Record<string, any> = {};
            Object.entries(data.manualBalances).forEach(([k, v]) => {
              if (k.startsWith(deptPrefix)) filtered[k] = v;
            });
            if (Object.keys(filtered).length > 0) setManualBalances(prev => ({ ...prev, ...filtered }));
          }
        } else {
          // Executive mode: load all non-department data
          if (data.entityEstimates) {
            const filtered: Record<string, any> = {};
            Object.entries(data.entityEstimates).forEach(([k, v]) => {
              if (!k.startsWith("dept::")) filtered[k] = v;
            });
            setEntityEstimates(prev => ({ ...prev, ...filtered }));
          }
          if (data.manualOverrides) {
            const cleanedOverrides: any = {};
            Object.entries(data.manualOverrides).forEach(([region, days]: [string, any]) => {
              if (region.startsWith("dept::")) return;
              cleanedOverrides[region] = {};
              Object.entries(days).forEach(([date, values]: [string, any]) => {
                const { cashIn, ...rest } = values;
                if (Object.keys(rest).length > 0) cleanedOverrides[region][date] = rest;
              });
            });
            setManualOverrides(prev => ({ ...prev, ...cleanedOverrides }));
          }
          if (data.manualBalances) {
            const filtered: Record<string, any> = {};
            Object.entries(data.manualBalances).forEach(([k, v]) => {
              if (!k.startsWith("dept::")) filtered[k] = v;
            });
            setManualBalances(prev => ({ ...prev, ...filtered }));
          }
        }

        if (data.reports) setReports(data.reports);
      } catch (error) {
        console.error("Failed to load data:", error);
      } finally {
        if (!isDepartmentMode) {
          const savedRegions = localStorage.getItem('regions');
          const loadedRegions: string[] = savedRegions ? JSON.parse(savedRegions) : DEFAULT_REGIONS;
          setRegions(loadedRegions);
          const parsed = parseLiquidityData(loadedRegions);
          setMultiEntityData(parsed);
        }
        // Department regions are loaded via the departments effect
        setIsLoaded(true);
      }
    };
    loadData();
  }, [isDepartmentMode, deptPrefix]);

  // Granular sync: save per-region changes to normalized tables + keep blob in sync
  useEffect(() => {
    if (!isLoaded) return;
    for (const region of regions) {
      if (entityEstimates[region]) syncEstimates(region, entityEstimates[region]).catch(err => console.error("Failed to sync estimates:", err));
    }
  }, [entityEstimates, isLoaded, regions]);

  useEffect(() => {
    if (!isLoaded) return;
    for (const region of regions) {
      if (manualOverrides[region]) syncDisbursements(region, manualOverrides[region]).catch(err => console.error("Failed to sync overrides:", err));
    }
  }, [manualOverrides, isLoaded, regions]);

  useEffect(() => {
    if (!isLoaded) return;
    for (const region of regions) {
      if (manualBalances[region]) syncBalances(region, manualBalances[region]).catch(err => console.error("Failed to sync balances:", err));
    }
  }, [manualBalances, isLoaded, regions]);

  useEffect(() => {
    if (!isLoaded) return;
    fetch("/api/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "reports", value: reports }),
    }).catch(err => console.error("Failed to save reports:", err));
  }, [reports, isLoaded]);

  const reportData = useMemo(() => {
    const projectionOverrides: Record<string, Record<string, Partial<DailyData>>> = {};
    const actualsOverrides: Record<string, Record<string, { actualCashIn?: number, actualCashOut?: number }>> = {};
    regions.forEach(r => { projectionOverrides[r] = {}; actualsOverrides[r] = {}; });

    regions.forEach(region => {
      // Projections: Only the most recent report
      const projectionReports = reports
        .filter(r => r.region === region && r.type === "Projection" && r.data)
        .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());

      if (projectionReports.length > 0) {
        const latest = projectionReports[0];
        const data = latest.data as Record<string, number>;
        Object.entries(data).forEach(([date, cashIn]) => {
          let normalizedDate = date;
          try {
            const parsedDate = parse(date, "M/d/yyyy", new Date());
            if (!isNaN(parsedDate.getTime())) normalizedDate = format(parsedDate, "M/d/yyyy");
            else {
              const altParsed = parse(date, "MM/dd/yyyy", new Date());
              if (!isNaN(altParsed.getTime())) normalizedDate = format(altParsed, "M/d/yyyy");
            }
          } catch (e) {}
          projectionOverrides[region][normalizedDate] = { cashIn };
        });
      }

      // Actuals: All reports, applied in order of upload
      const actualsReports = reports
        .filter(r => r.region === region && r.type === "Revenue Actuals" && r.data)
        .sort((a, b) => new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime());

      actualsReports.forEach(report => {
        const data = report.data as Record<string, { actualCashIn?: number, actualCashOut?: number }>;
        Object.entries(data).forEach(([date, values]) => {
          let normalizedDate = date;
          try {
            const parsedDate = parse(date, "M/d/yyyy", new Date());
            if (!isNaN(parsedDate.getTime())) normalizedDate = format(parsedDate, "M/d/yyyy");
            else {
              const altParsed = parse(date, "MM/dd/yyyy", new Date());
              if (!isNaN(altParsed.getTime())) normalizedDate = format(altParsed, "M/d/yyyy");
            }
          } catch (e) {}
          actualsOverrides[region][normalizedDate] = values;
        });
      });
    });

    return { projectionOverrides, actualsOverrides };
  }, [reports, regions]);

  const adjustData = (
    rawData: DailyData[],
    estimates: EstimateCategory[],
    overrides: Record<string, Partial<DailyData>> = {},
    region: string,
    initialBalanceOverride?: number,
    simOverrides: Record<string, Partial<DailyData>> = {},
    reportProjectionOverride: Record<string, Partial<DailyData>> = {},
    reportActualsOverride: Record<string, { actualCashIn?: number, actualCashOut?: number }> = {}
  ) => {
    if (rawData.length === 0) return [];

    // Calculate starting balance for the first day
    const firstDayRawNet = rawData[0].cashIn - rawData[0].cashOut;
    const firstDayStartingBalance = rawData[0].endingBalance - firstDayRawNet;

    let runningBalance = initialBalanceOverride !== undefined ? initialBalanceOverride : firstDayStartingBalance;

    return rawData.map((day, index) => {
      const baseOverride = overrides[day.date] || {};
      const reportOverride = reportProjectionOverride[day.date] || {};
      const simOverride = simOverrides[day.date] || {};
      
      // cashIn logic: Report > Manual > Default(0)
      // If reports exist for this region, we use the latest report's value or 0 if not in report.
      // If NO reports exist, we allow manual overrides or default to 0.
      const hasReports = Object.keys(reportProjectionOverride).length > 0;
      let adjCashIn = 0;
      
      if (hasReports) {
        adjCashIn = reportOverride.cashIn ?? 0;
      } else {
        adjCashIn = baseOverride.cashIn ?? day.cashIn ?? 0;
      }

      // Simulation overrides always win if present
      if (simOverride.cashIn !== undefined) adjCashIn = simOverride.cashIn;

      const override = { ...baseOverride, ...simOverride };
      let disbursements: DisbursementItem[] = [];

      if (override && override.disbursements !== undefined) {
        disbursements = override.disbursements;
        if (override.cashIn !== undefined) adjCashIn = override.cashIn;
      } else {
        if (override && override.cashIn !== undefined) adjCashIn = override.cashIn;
        
        // Generate disbursements from estimates
        estimates.forEach(cat => {
          const totalAmount = cat.baseAmount * (1 + cat.adjustment);
          let amount = 0;

          const dayDate = parse(day.date, "M/d/yyyy", new Date());
          const catStartDate = parse(cat.startDate, "yyyy-MM-dd", new Date());
          const diff = differenceInDays(dayDate, catStartDate);

          let isBeforeEnd = true;
          if (cat.endDate) {
            const catEndDate = parse(cat.endDate, "yyyy-MM-dd", new Date());
            isBeforeEnd = dayDate <= catEndDate;
          }

          if (diff >= 0 && isBeforeEnd) {
            switch (cat.period) {
              case "Daily":
                if (isBusinessDay(dayDate)) {
                  amount = totalAmount;
                }
                break;
              case "Weekly":
                if (diff % 7 === 0) amount = totalAmount;
                break;
              case "Bi-Weekly":
                if (diff % 14 === 0) amount = totalAmount;
                break;
              case "Monthly":
                if (diff % 30 === 0) amount = totalAmount;
                break;
              case "One-Time":
                if (diff === 0) amount = totalAmount;
                break;
            }
          }

          if (amount > 0) {
            disbursements.push({
              id: `${cat.id}-${day.date}`,
              label: `${cat.label} Estimate`,
              amount,
              status: "Unfunded",
              type: "estimate",
              comments: cat.comments,
              attachments: cat.attachments
            });
          }
        });
      }

      // For the current day (today), cash in is already factored into the manually entered starting balance
      // We force it to 0 here to ensure it's removed from all charts, tables, and calendars for today.
      if (index === 0) {
        adjCashIn = 0;
      }

      const adjCashOut = disbursements.filter(d => d.status !== "Paid").reduce((acc, d) => acc + d.amount, 0);
      const adjNetFlow = adjCashIn - adjCashOut;
      
      runningBalance += adjNetFlow;

      const payroll = disbursements.filter(d => d.status !== "Paid" && d.label.toLowerCase().includes("payroll")).reduce((acc, d) => acc + d.amount, 0);
      const benefits = disbursements.filter(d => d.status !== "Paid" && d.label.toLowerCase().includes("benefits")).reduce((acc, d) => acc + d.amount, 0);
      const apPayments = disbursements.filter(d => d.status !== "Paid" && d.label.toLowerCase().includes("general ap payments")).reduce((acc, d) => acc + d.amount, 0);
      
      const grants = index === 0 ? 0 : (override?.grants || day.grants || 0);
      const regionalReceipts = adjCashIn - grants;

      // Reconciliation logic
      const dayDate = parse(day.date, "M/d/yyyy", new Date());
      const isHistorical = isBefore(dayDate, startOfToday());
      let actualCashIn = undefined;
      let actualCashOut = undefined;

      // Check for uploaded actuals first
      const uploadedActuals = reportActualsOverride[day.date];
      
      if (uploadedActuals) {
        actualCashIn = uploadedActuals.actualCashIn !== undefined ? (index === 0 ? 0 : uploadedActuals.actualCashIn) : undefined;
        actualCashOut = uploadedActuals.actualCashOut !== undefined ? uploadedActuals.actualCashOut : undefined;
      } else if (isHistorical) {
        // Mock actuals with some variance ONLY if no real actuals were uploaded
        actualCashIn = adjCashIn * (0.95 + Math.random() * 0.1);
        actualCashOut = adjCashOut * (0.98 + Math.random() * 0.05);
      }

      return {
        ...day,
        cashIn: adjCashIn,
        cashOut: adjCashOut,
        netFlow: adjNetFlow,
        endingBalance: runningBalance,
        disbursements,
        payroll,
        benefits,
        apPayments,
        otherDisbursements: adjCashOut - payroll - benefits - apPayments,
        grants,
        regionalReceipts: Object.fromEntries(regions.map(r => [r, r === region ? regionalReceipts : 0])),
        actualCashIn,
        actualCashOut,
        isSimulated: Object.keys(simOverride).length > 0
      };
    });
  };

  const allAdjustedData = useMemo(() => {
    if (!multiEntityData) return null;

    const getSum = (obj: Record<string, number>) => Object.values(obj).reduce((a, b) => a + b, 0);

    // Adjust data for each region dynamically
    const regionAdjusted: Record<string, DailyData[]> = {};
    regions.forEach(region => {
      if (multiEntityData[region]) {
        regionAdjusted[region] = adjustData(
          multiEntityData[region],
          entityEstimates[region] || [],
          manualOverrides[region] || {},
          region,
          getSum(manualBalances[region] || {}),
          simulationOverrides[region] || {},
          reportData.projectionOverrides[region] || {},
          reportData.actualsOverrides[region] || {}
        );
      }
    });

    // In department mode, build a department-level consolidated view (siloed)
    if (isDepartmentMode) {
      const firstRegion = regions[0];
      const firstData = regionAdjusted[firstRegion];
      if (!firstData) return regionAdjusted;

      const deptConsolidatedKey = `dept::${deptName}::_consolidated`;
      const deptExecAdj: DailyData[] = firstData.map((_, i) => {
        const consolidatedDisbursements: DisbursementItem[] = [];
        const consolidatedReceipts: Record<string, number> = {};

        let cashIn = 0, cashOut = 0, netFlow = 0, endingBalance = 0;
        let payroll = 0, apPayments = 0, benefits = 0, otherDisbursements = 0, grants = 0;

        regions.forEach(region => {
          const rd = regionAdjusted[region]?.[i];
          if (!rd) return;
          cashIn += rd.cashIn;
          cashOut += rd.cashOut;
          netFlow += rd.netFlow;
          endingBalance += rd.endingBalance;
          payroll += rd.payroll;
          apPayments += rd.apPayments;
          benefits += rd.benefits;
          otherDisbursements += rd.otherDisbursements;
          grants += rd.grants;
          consolidatedReceipts[region] = rd.regionalReceipts[region] || 0;
          consolidatedDisbursements.push(
            ...rd.disbursements.map(d => ({ ...d, label: `${regionDisplayName(region)}: ${d.label}` }))
          );
        });

        return {
          date: firstData[i].date,
          cashIn,
          cashOut,
          netFlow,
          endingBalance,
          payroll,
          apPayments,
          benefits,
          otherDisbursements,
          regionalReceipts: consolidatedReceipts,
          grants,
          disbursements: consolidatedDisbursements
        };
      });

      return {
        ...regionAdjusted,
        [deptConsolidatedKey]: deptExecAdj
      };
    }

    // Build Executive consolidated view
    const firstRegion = regions[0];
    const firstData = regionAdjusted[firstRegion];
    if (!firstData) return null;

    const execAdj: DailyData[] = firstData.map((_, i) => {
      const consolidatedDisbursements: DisbursementItem[] = [];
      const consolidatedReceipts: Record<string, number> = {};

      let cashIn = 0, cashOut = 0, netFlow = 0, endingBalance = 0;
      let payroll = 0, apPayments = 0, benefits = 0, otherDisbursements = 0, grants = 0;

      regions.forEach(region => {
        const rd = regionAdjusted[region]?.[i];
        if (!rd) return;
        cashIn += rd.cashIn;
        cashOut += rd.cashOut;
        netFlow += rd.netFlow;
        endingBalance += rd.endingBalance;
        payroll += rd.payroll;
        apPayments += rd.apPayments;
        benefits += rd.benefits;
        otherDisbursements += rd.otherDisbursements;
        grants += rd.grants;
        consolidatedReceipts[region] = rd.regionalReceipts[region] || 0;
        consolidatedDisbursements.push(
          ...rd.disbursements.map(d => ({ ...d, label: `${region}: ${d.label}` }))
        );
      });

      return {
        date: firstData[i].date,
        cashIn,
        cashOut,
        netFlow,
        endingBalance,
        payroll,
        apPayments,
        benefits,
        otherDisbursements,
        regionalReceipts: consolidatedReceipts,
        grants,
        disbursements: consolidatedDisbursements
      };
    });

    return {
      ...regionAdjusted,
      [EXECUTIVE_ENTITY]: execAdj
    };
  }, [multiEntityData, entityEstimates, manualOverrides, manualBalances, simulationOverrides, reportData, regions, isDepartmentMode, deptName, regionDisplayName]);

  const currentData = useMemo(() => {
    if (!allAdjustedData) return [];
    return allAdjustedData[currentEntity] || [];
  }, [allAdjustedData, currentEntity]);

  const stats = useMemo(() => {
    if (!currentData || currentData.length === 0) return null;
    const baseStats = calculateStats(currentData);
    
    const isConsolidatedView = currentEntity === EXECUTIVE_ENTITY || (isDepartmentMode && currentEntity === deptConsolidatedKey);
    if (isConsolidatedView && allAdjustedData) {
      const regionalNegatives: any[] = [];
      const regionalBurnRates: any[] = [];

      regions.forEach(region => {
        const regionData = allAdjustedData[region];
        if (!regionData) return;
        const regionStats = calculateStats(regionData);

        const next30 = regionData.slice(0, 30);
        const totalOut = next30.reduce((acc, d) => acc + d.cashOut, 0);
        const dailyBurn = next30.length > 0 ? totalOut / next30.length : 0;
        const weeklyBurn = dailyBurn * 5;

        regionalBurnRates.push({
          region: isDepartmentMode ? regionDisplayName(region) : region,
          dailyBurn,
          weeklyBurn,
          status: dailyBurn > 100000 ? 'critical' : dailyBurn > 50000 ? 'warning' : 'stable'
        });

        if (regionStats.nextNegativeTransaction) {
          regionalNegatives.push({
            ...regionStats.nextNegativeTransaction,
            region: isDepartmentMode ? regionDisplayName(region) : region
          });
        }
      });
      baseStats.regionalNegativeTransactions = regionalNegatives;
      baseStats.regionalBurnRates = regionalBurnRates;

      baseStats.regionalLiquidityBreakdown = regions.map(region => ({
        region: isDepartmentMode ? regionDisplayName(region) : region,
        value: allAdjustedData[region]?.[0]?.endingBalance || 0
      }));
    }
    
    return baseStats;
  }, [currentData, currentEntity, allAdjustedData, isDepartmentMode, deptConsolidatedKey, regionDisplayName]);

  const handleEstimateChange = (entity: string, newCategories: EstimateCategory[]) => {
    setEntityEstimates(prev => ({
      ...prev,
      [entity]: newCategories
    }));

    // Clear estimate-type overrides to allow the new categories to take full effect
    // as requested: "It needs to override all previous estimates"
    setManualOverrides(prev => {
      const region = entity;
      const regionOverrides = prev[region];
      if (!regionOverrides) return prev;

      const updatedRegionOverrides: Record<string, Partial<DailyData>> = {};
      let hasChanges = false;

      Object.entries(regionOverrides).forEach(([date, dayOverride]) => {
        if (dayOverride.disbursements) {
          const filtered = dayOverride.disbursements.filter(d => d.type !== "estimate");
          if (filtered.length !== dayOverride.disbursements.length) {
            hasChanges = true;
            if (filtered.length > 0 || dayOverride.cashIn !== undefined || dayOverride.grants !== undefined) {
              updatedRegionOverrides[date] = {
                ...dayOverride,
                disbursements: filtered
              };
            }
          } else {
            updatedRegionOverrides[date] = dayOverride;
          }
        } else {
          updatedRegionOverrides[date] = dayOverride;
        }
      });

      if (!hasChanges) return prev;

      return {
        ...prev,
        [region]: updatedRegionOverrides
      };
    });
  };

  const handleUpdateDay = (date: string, updates: Partial<DailyData>) => {
    if (currentEntity === EXECUTIVE_ENTITY) return; // Cannot edit consolidated directly
    
    const targetSetter = isSimulationMode ? setSimulationOverrides : setManualOverrides;

    targetSetter(prev => ({
      ...prev,
      [currentEntity]: {
        ...prev[currentEntity],
        [date]: {
          ...prev[currentEntity][date],
          ...updates
        }
      }
    }));
  };

  const handleUpdateBalance = (key: string, balance: number) => {
    if (currentEntity === EXECUTIVE_ENTITY) return;
    setManualBalances(prev => ({
      ...prev,
      [currentEntity]: {
        ...prev[currentEntity],
        [key]: balance
      }
    }));
  };

  const handleInternalTransfer = (fromEntity: string, toEntity: string, amount: number) => {
    setManualBalances(prev => {
      // Use the first key in the region's balance record as the primary account
      const getAccountKey = (entity: string) => {
        const keys = Object.keys(prev[entity] || {});
        return keys[0] || "main";
      };

      const fromKey = getAccountKey(fromEntity);
      const toKey = getAccountKey(toEntity);

      return {
        ...prev,
        [fromEntity]: {
          ...prev[fromEntity],
          [fromKey]: ((prev[fromEntity] || {})[fromKey] || 0) - amount
        },
        [toEntity]: {
          ...prev[toEntity],
          [toKey]: ((prev[toEntity] || {})[toKey] || 0) + amount
        }
      };
    });
  };

  const handleMoveDisbursement = (fromDate: string, toDate: string, itemId: string) => {
    handleMoveMultipleDisbursements([{ fromDate, toDate, itemId }]);
  };

  const handleMoveMultipleDisbursements = (moves: { fromDate: string, toDate: string, itemId: string }[]) => {
    if (moves.length === 0) return;
    if (!allAdjustedData) return;

    const targetSetter = isSimulationMode ? setSimulationOverrides : setManualOverrides;

    targetSetter(prev => {
      const newState = { ...prev };

      moves.forEach(({ fromDate, toDate, itemId }) => {
        if (fromDate === toDate) return;

        // 1. Find the region and the original item
        let region: string | undefined;
        let itemToMove: DisbursementItem | undefined;
        let fromDayData: DailyData | undefined;

        if (currentEntity === EXECUTIVE_ENTITY) {
          for (const r of regions) {
            const day = allAdjustedData[r].find(d => d.date === fromDate);
            if (day) {
              const item = day.disbursements.find(i => i.id === itemId);
              if (item) {
                region = r;
                itemToMove = item;
                fromDayData = day;
                break;
              }
            }
          }
        } else {
          region = currentEntity;
          fromDayData = allAdjustedData[region].find(d => d.date === fromDate);
          if (fromDayData) {
            itemToMove = fromDayData.disbursements.find(i => i.id === itemId);
          }
        }

        if (!region || !itemToMove || !fromDayData) return;

        // 2. Normalize toDate format
        let normalizedToDate = toDate;
        try {
          const parsed = parse(toDate, "M/d/yyyy", new Date());
          if (!isNaN(parsed.getTime())) {
            normalizedToDate = format(parsed, "M/d/yyyy");
          } else {
            const parsed2 = parse(toDate, "MM/dd/yyyy", new Date());
            if (!isNaN(parsed2.getTime())) {
              normalizedToDate = format(parsed2, "M/d/yyyy");
            } else {
              return;
            }
          }
        } catch (e) {
          return;
        }

        if (fromDate === normalizedToDate) return;

        // 3. Update region overrides in our working state
        const regionOverrides = { ...(newState[region] || {}) };

        // Remove from source day
        const currentFromOverride = regionOverrides[fromDate] || {};
        const currentFromItems = currentFromOverride.disbursements || fromDayData.disbursements;
        const newFromItems = currentFromItems.filter(i => i.id !== itemId);
        
        regionOverrides[fromDate] = {
          ...currentFromOverride,
          disbursements: newFromItems
        };

        // Add to destination day
        const toDayData = allAdjustedData[region].find(d => d.date === normalizedToDate);
        const currentToOverride = regionOverrides[normalizedToDate] || {};
        const currentToItems = currentToOverride.disbursements || (toDayData ? toDayData.disbursements : []);
        
        const movedItem = { 
          ...itemToMove, 
          type: "manual" as const,
          label: itemToMove.label.replace(" Estimate", "")
        };
        
        regionOverrides[normalizedToDate] = {
          ...currentToOverride,
          disbursements: [movedItem, ...currentToItems]
        };

        newState[region] = regionOverrides;
      });

      return newState;
    });
  };


  const handleAddRegion = async (name: string) => {
    if (!name.trim() || name === EXECUTIVE_ENTITY) return;

    if (isDepartmentMode) {
      // Department mode: add namespaced region
      const namespacedName = `${deptPrefix}${name}`;
      if (regions.includes(namespacedName)) return;
      const newRegions = [...regions, namespacedName];
      setRegions(newRegions);

      // Update department record on server
      const dept = departments.find(d => d.name.toLowerCase() === deptName.toLowerCase());
      if (dept) {
        const displayRegions = [...dept.regions, name];
        await handleUpdateDepartmentRegions(dept.id, displayRegions);
      }

      // Initialize state for the new region
      setEntityEstimates(prev => ({ ...prev, [namespacedName]: makeDefaultEstimates(namespacedName) }));
      setManualOverrides(prev => ({ ...prev, [namespacedName]: {} }));
      setManualBalances(prev => ({ ...prev, [namespacedName]: { main: 0 } }));
      setSimulationOverrides(prev => ({ ...prev, [namespacedName]: {} }));

      // Regenerate parser data with new regions
      const parsed = parseLiquidityData(newRegions);
      setMultiEntityData(parsed);
    } else {
      // Executive mode: original behavior
      if (regions.includes(name)) return;
      const newRegions = [...regions, name];
      setRegions(newRegions);
      localStorage.setItem('regions', JSON.stringify(newRegions));

      setEntityEstimates(prev => ({ ...prev, [name]: makeDefaultEstimates(name) }));
      setManualOverrides(prev => ({ ...prev, [name]: {} }));
      setManualBalances(prev => ({ ...prev, [name]: { main: 0 } }));
      setSimulationOverrides(prev => ({ ...prev, [name]: {} }));

      const parsed = parseLiquidityData(newRegions);
      setMultiEntityData(parsed);
    }
  };

  const handleDeleteRegion = async (name: string) => {
    if (name === EXECUTIVE_ENTITY || !regions.includes(name)) return;
    const newRegions = regions.filter(r => r !== name);
    if (newRegions.length === 0 && !isDepartmentMode) return; // Executive must have at least one region
    setRegions(newRegions);

    if (isDepartmentMode) {
      // Update department record on server
      const dept = departments.find(d => d.name.toLowerCase() === deptName.toLowerCase());
      if (dept) {
        const displayName = regionDisplayName(name);
        const displayRegions = dept.regions.filter(r => r !== displayName);
        await handleUpdateDepartmentRegions(dept.id, displayRegions);
      }
    } else {
      localStorage.setItem('regions', JSON.stringify(newRegions));
    }

    // Clean up state for the removed region
    setEntityEstimates(prev => { const { [name]: _, ...rest } = prev; return rest; });
    setManualOverrides(prev => { const { [name]: _, ...rest } = prev; return rest; });
    setManualBalances(prev => { const { [name]: _, ...rest } = prev; return rest; });
    setSimulationOverrides(prev => { const { [name]: _, ...rest } = prev; return rest; });

    // If currently viewing the deleted region, switch
    if (currentEntity === name) {
      setCurrentEntity(isDepartmentMode ? (`dept::${deptName}::_consolidated` as Entity) : EXECUTIVE_ENTITY);
    }

    // Regenerate parser data without the removed region
    const parsed = parseLiquidityData(newRegions);
    setMultiEntityData(parsed);
  };

  // === Login Gate ===
  if (!currentUser) {
    return <LoginPage onLogin={handleLogin} />;
  }

  // Filter regions by user permissions
  const hasRegionRestriction = currentUser.allowedRegions && currentUser.allowedRegions.length > 0;
  const canSeeExecutive = !isDepartmentMode && (!hasRegionRestriction || currentUser.role === "admin");
  const isViewOnly = currentUser.role === "viewer";

  // Redirect if current entity is not accessible
  if (isDepartmentMode) {
    // Department mode: default to department consolidated view
    if (currentEntity === EXECUTIVE_ENTITY || (!regions.includes(currentEntity) && currentEntity !== deptConsolidatedKey)) {
      if (regions.length > 0 && currentEntity !== deptConsolidatedKey) {
        setCurrentEntity(deptConsolidatedKey as Entity);
      }
    }
  } else if (hasRegionRestriction && currentUser.role !== "admin") {
    if (currentEntity === EXECUTIVE_ENTITY || !currentUser.allowedRegions.includes(currentEntity)) {
      const firstAllowed = regions.find(r => currentUser.allowedRegions.includes(r));
      if (firstAllowed && currentEntity !== firstAllowed) {
        setCurrentEntity(firstAllowed);
      }
    }
  }

  const visibleRegions = isDepartmentMode
    ? regions
    : (hasRegionRestriction && currentUser.role !== "admin"
      ? regions.filter(r => currentUser.allowedRegions.includes(r))
      : regions);

  const navigation = [
    ...(canSeeExecutive ? [{ id: EXECUTIVE_ENTITY, label: "Executive View", icon: Earth }] : []),
    ...(isDepartmentMode && regions.length > 0 ? [{ id: deptConsolidatedKey, label: `${deptName} Overview`, icon: Earth }] : []),
    ...visibleRegions.map(r => ({ id: r, label: isDepartmentMode ? regionDisplayName(r) : r, icon: Building2 })),
  ];

  // Department mode with no regions yet: show empty state
  if (isDepartmentMode && regions.length === 0) {
    return (
      <div className="h-screen bg-slate-50 dark:bg-slate-950 flex overflow-hidden">
        <aside className="w-60 bg-slate-900 dark:bg-slate-950 text-slate-300 hidden lg:flex flex-col h-full border-r border-slate-800 dark:border-slate-800/50">
          <div className="p-6 flex items-center gap-3 border-b border-slate-800 dark:border-slate-800/50">
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
              <Building2 className="text-white w-5 h-5" />
            </div>
            <span className="font-bold text-white tracking-tight">{deptName}</span>
          </div>
          <nav className="flex-1 p-4 space-y-1">
            <div className="px-4 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Regions</div>
            <p className="px-4 py-2 text-xs text-slate-500 italic">No regions yet</p>
          </nav>
          <div className="p-4 border-t border-slate-800 dark:border-slate-800/50 space-y-1">
            <button onClick={() => setActiveView("settings")} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all bg-emerald-500/10 text-emerald-400">
              <Settings className="w-5 h-5" />
              Settings
            </button>
          </div>
        </aside>
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          {activeView === "settings" ? (
            <div className="w-full max-w-4xl overflow-y-auto max-h-full">
              <SettingsView
                theme={theme} onThemeChange={handleThemeChange} currency={currency} onCurrencyChange={handleCurrencyChange}
                dateFormat={dateFormat} onDateFormatChange={handleDateFormatChange} companyLogo={companyLogo}
                onCompanyLogoChange={handleCompanyLogoChange} onExportData={handleExportData} onResetData={handleResetData}
                regions={regions} onAddRegion={handleAddRegion} onDeleteRegion={handleDeleteRegion}
                currentUser={currentUser} allUsers={allUsers} onCreateUser={handleCreateUser}
                onUpdateUser={handleUpdateUser} onDeleteUser={handleDeleteUser} onLogout={handleLogout}
                departments={departments} onCreateDepartment={handleCreateDepartment}
                onDeleteDepartment={handleDeleteDepartment} isDepartmentMode={isDepartmentMode}
                regionDisplayName={regionDisplayName}
              />
            </div>
          ) : (
            <div className="text-center">
              <div className="w-16 h-16 bg-slate-200 dark:bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Building2 className="w-8 h-8 text-slate-400" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{deptName} Dashboard</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-md">
                This department doesn't have any regions yet. Go to Settings to add your first region and start building your dashboard.
              </p>
              <button
                onClick={() => setActiveView("settings")}
                className="px-6 py-3 bg-emerald-500 text-white font-bold rounded-xl text-sm hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20"
              >
                Go to Settings
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!stats || !allAdjustedData) {
    return (
      <div className="h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-slate-50 dark:bg-slate-950 flex overflow-hidden">
      {/* Sidebar */}
      <aside className="w-60 bg-slate-900 dark:bg-slate-950 text-slate-300 hidden lg:flex flex-col h-full border-r border-slate-800 dark:border-slate-800/50 overflow-y-auto">
        <div className="p-6 flex items-center gap-3 border-b border-slate-800 dark:border-slate-800/50">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
            <Building2 className="text-white w-5 h-5" />
          </div>
          <span className="font-bold text-white tracking-tight">{isDepartmentMode ? deptName : "Insight Treasury"}</span>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          <div className="px-4 py-2 text-[10px] font-bold text-slate-500 dark:text-slate-500 uppercase tracking-widest">Dashboards</div>
          {navigation.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setCurrentEntity(item.id as Entity);
                setActiveView("dashboard");
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${
                activeView === "dashboard" && currentEntity === item.id 
                  ? "bg-emerald-500/10 text-emerald-400" 
                  : "text-slate-400 hover:bg-slate-800 dark:hover:bg-slate-900 hover:text-white"
              }`}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </button>
          ))}
          
          <div className="pt-6 px-4 py-2 text-[10px] font-bold text-slate-500 dark:text-slate-500 uppercase tracking-widest">System</div>
          <button 
            onClick={() => setActiveView("reports")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${
              activeView === "reports" 
                ? "bg-emerald-500/10 text-emerald-400" 
                : "text-slate-400 hover:bg-slate-800 dark:hover:bg-slate-900 hover:text-white"
            }`}
          >
            <FileText className="w-5 h-5" />
            Reports
          </button>
          <a href="#" className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800 dark:hover:bg-slate-900 hover:text-white rounded-xl transition-colors">
            <Bell className="w-5 h-5" />
            Alerts
          </a>
        </nav>

        <div className="p-4 border-t border-slate-800 dark:border-slate-800/50 space-y-1">
          <button
            onClick={() => setActiveView("history")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${
              activeView === "history"
                ? "bg-emerald-500/10 text-emerald-400"
                : "text-slate-400 hover:bg-slate-800 dark:hover:bg-slate-900 hover:text-white"
            }`}
          >
            <History className="w-5 h-5" />
            Change History
          </button>
          <button
            onClick={() => setActiveView("settings")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${
              activeView === "settings"
                ? "bg-emerald-500/10 text-emerald-400"
                : "text-slate-400 hover:bg-slate-800 dark:hover:bg-slate-900 hover:text-white"
            }`}
          >
            <Settings className="w-5 h-5" />
            Settings
          </button>
        </div>
      </aside>

      {/* Mobile Nav Drawer */}
      <AnimatePresence>
        {mobileNavOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
              onClick={() => setMobileNavOpen(false)}
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed left-0 top-0 bottom-0 w-72 bg-slate-900 dark:bg-slate-950 text-slate-300 flex flex-col z-50 lg:hidden shadow-2xl overflow-y-auto"
            >
              <div className="p-6 flex items-center justify-between border-b border-slate-800 dark:border-slate-800/50">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
                    <Building2 className="text-white w-5 h-5" />
                  </div>
                  <span className="font-bold text-white tracking-tight">Insight Treasury</span>
                </div>
                <button onClick={() => setMobileNavOpen(false)} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <nav className="flex-1 p-4 space-y-1">
                <div className="px-4 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Dashboards</div>
                {navigation.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setCurrentEntity(item.id as Entity);
                      setActiveView("dashboard");
                      setMobileNavOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${
                      activeView === "dashboard" && currentEntity === item.id
                        ? "bg-emerald-500/10 text-emerald-400"
                        : "text-slate-400 hover:bg-slate-800 dark:hover:bg-slate-900 hover:text-white"
                    }`}
                  >
                    <item.icon className="w-5 h-5" />
                    {item.label}
                  </button>
                ))}

                <div className="pt-6 px-4 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">System</div>
                <button
                  onClick={() => { setActiveView("reports"); setMobileNavOpen(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${
                    activeView === "reports"
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "text-slate-400 hover:bg-slate-800 dark:hover:bg-slate-900 hover:text-white"
                  }`}
                >
                  <FileText className="w-5 h-5" />
                  Reports
                </button>
                <a href="#" className="flex items-center gap-3 px-4 py-3 hover:bg-slate-800 dark:hover:bg-slate-900 hover:text-white rounded-xl transition-colors">
                  <Bell className="w-5 h-5" />
                  Alerts
                </a>
              </nav>

              <div className="p-4 border-t border-slate-800 dark:border-slate-800/50 space-y-1">
                <button
                  onClick={() => { setActiveView("history"); setMobileNavOpen(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${
                    activeView === "history"
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "text-slate-400 hover:bg-slate-800 dark:hover:bg-slate-900 hover:text-white"
                  }`}
                >
                  <History className="w-5 h-5" />
                  Change History
                </button>
                <button
                  onClick={() => { setActiveView("settings"); setMobileNavOpen(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${
                    activeView === "settings"
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "text-slate-400 hover:bg-slate-800 dark:hover:bg-slate-900 hover:text-white"
                  }`}
                >
                  <Settings className="w-5 h-5" />
                  Settings
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header - Frozen at the top */}
        <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex-shrink-0 z-10">
          {/* Top row: hamburger, search, avatar */}
          <div className="h-16 flex items-center justify-between px-4 gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <button
                onClick={() => setMobileNavOpen(true)}
                className="lg:hidden p-2 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all flex-shrink-0"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="relative w-full max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search transactions, reports..."
                  className="w-full pl-10 pr-4 py-2 bg-slate-100 dark:bg-slate-800 border-none rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all dark:text-white dark:placeholder:text-slate-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 md:gap-6 flex-shrink-0">
              {!isViewOnly && <div className="hidden md:flex items-center gap-3 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                <button
                  onClick={() => setIsSimulationMode(!isSimulationMode)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    isSimulationMode
                      ? "bg-amber-500 text-white shadow-md"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-700"
                  }`}
                >
                  {isSimulationMode ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                  {isSimulationMode ? "Simulation Active" : "Start Simulation"}
                </button>
                {isSimulationMode && (
                  <button
                    onClick={() => setSimulationOverrides({
                      "Flint": {}, "ISH": {}, "Coldwater": {}, "Chicago": {}
                    })}
                    className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-all"
                    title="Reset Simulation"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                )}
              </div>}

              <div className="hidden md:flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Forecast:</span>
                <select
                  value={forecastDays}
                  onChange={(e) => setForecastDays(parseInt(e.target.value))}
                  className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-1.5 rounded-lg border-none focus:ring-2 focus:ring-emerald-500 outline-none cursor-pointer"
                >
                  {[14, 30, 60, 90, 180, 365].map(days => (
                    <option key={days} value={days}>{days} Days</option>
                  ))}
                </select>
              </div>

              <div className="hidden lg:flex items-center gap-4">
                <div className="flex flex-col items-end">
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">{currentUser.displayName}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{currentUser.role === "admin" ? "Admin" : "Viewer"} &middot; {isDepartmentMode ? `${deptName} / ${currentEntity === deptConsolidatedKey ? "Overview" : regionDisplayName(currentEntity)}` : currentEntity}</span>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="hidden lg:flex p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-all"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
              <div className="w-10 h-10 bg-slate-200 dark:bg-slate-800 rounded-full border-2 border-white dark:border-slate-700 shadow-sm overflow-hidden flex items-center justify-center flex-shrink-0">
                {companyLogo ? (
                  <img src={companyLogo} alt="Company Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-full h-full bg-emerald-500 flex items-center justify-center text-white font-bold text-xs">
                    {currentUser.displayName.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Mobile-only secondary controls bar */}
          <div className="md:hidden flex items-center justify-between px-4 py-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
            {!isViewOnly ? (
              <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                <button
                  onClick={() => setIsSimulationMode(!isSimulationMode)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-bold transition-all ${
                    isSimulationMode
                      ? "bg-amber-500 text-white shadow-md"
                      : "text-slate-500 dark:text-slate-400"
                  }`}
                >
                  {isSimulationMode ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                  {isSimulationMode ? "Sim On" : "Simulate"}
                </button>
                {isSimulationMode && (
                  <button
                    onClick={() => setSimulationOverrides({
                      "Flint": {}, "ISH": {}, "Coldwater": {}, "Chicago": {}
                    })}
                    className="p-1 text-slate-400 hover:text-rose-500 rounded transition-all"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                )}
              </div>
            ) : <div />}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Forecast:</span>
              <select
                value={forecastDays}
                onChange={(e) => setForecastDays(parseInt(e.target.value))}
                className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-1 rounded-md border-none outline-none cursor-pointer"
              >
                {[14, 30, 60, 90, 180, 365].map(days => (
                  <option key={days} value={days}>{days}d</option>
                ))}
              </select>
            </div>
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">{isDepartmentMode ? (currentEntity === deptConsolidatedKey ? "Overview" : regionDisplayName(currentEntity)) : currentEntity}</span>
          </div>
        </header>

        {/* Scrolling Content */}
        <main ref={mainContentRef} className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950">
          <div className="px-4 py-8 w-full max-w-[1600px] mx-auto">
            {activeView === "dashboard" ? (
              <div className="mb-8">
                <motion.div 
                  key={currentEntity}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="mb-6"
                >
                  <div className="flex items-center gap-3 mb-1">
                    <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold uppercase rounded tracking-wider">
                      {currentEntity === EXECUTIVE_ENTITY || currentEntity === deptConsolidatedKey ? "Consolidated" : (isDepartmentMode ? deptName : "Single Entity")}
                    </span>
                    <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                      {currentEntity === deptConsolidatedKey
                        ? `${deptName} Overview`
                        : isDepartmentMode
                          ? `${regionDisplayName(currentEntity)} Liquidity Dashboard`
                          : (currentEntity === EXECUTIVE_ENTITY ? "Executive Treasury Overview" : `${currentEntity} Liquidity Dashboard`)}
                    </h1>
                  </div>
                </motion.div>

                <MaximizeWrapper title="Pillar 1 & 3: Executive Core & Regional Burn">
                  <SummaryCards
                    stats={stats}
                    currentEntity={currentEntity}
                    onUpdateBalance={handleUpdateBalance}
                    onInternalTransfer={handleInternalTransfer}
                    todaysCashOut={currentData[0]?.cashOut || 0}
                    manualBalances={manualBalances}
                    balances={manualBalances[currentEntity] || {}}
                    currency={currency}
                    regions={regions}
                    readOnly={isViewOnly}
                  />
                </MaximizeWrapper>

                <div className="mt-8">
                  <MaximizeWrapper title="Pillar 2: Cash Flow Dynamics (13-Week Rolling)">
                    <LiquidityChart 
                      data={currentData} 
                      forecastDays={forecastDays} 
                      onForecastDaysChange={setForecastDays}
                      currency={currency} 
                    />
                  </MaximizeWrapper>
                </div>

                <div className="mt-8">
                  <MaximizeWrapper title="Operational Cash Calendar">
                    <CashCalendar
                      data={currentData}
                      onUpdateDay={handleUpdateDay}
                      onMoveDisbursement={handleMoveDisbursement}
                      onMoveMultipleDisbursements={handleMoveMultipleDisbursements}
                      isExecutive={currentEntity === EXECUTIVE_ENTITY || currentEntity === deptConsolidatedKey}
                      currency={currency}
                      dateFormat={dateFormat}
                      regions={regions}
                      readOnly={isViewOnly}
                    />
                  </MaximizeWrapper>
                </div>

                <div className="mt-8">
                  <MaximizeWrapper title="Historical Reconciliation">
                    <ReconciliationTable data={currentData} currency={currency} dateFormat={dateFormat} actualsOverrides={reportData.actualsOverrides[currentEntity] || {}} projectionOverrides={reportData.projectionOverrides[currentEntity] || {}} />
                  </MaximizeWrapper>
                </div>

                <div className="mt-8">
                  <MaximizeWrapper title="Operational Forecast">
                    <ForecastTable 
                      data={currentData} 
                      forecastDays={forecastDays} 
                      currency={currency}
                      dateFormat={dateFormat}
                    />
                  </MaximizeWrapper>
                </div>

                {currentEntity !== EXECUTIVE_ENTITY && currentEntity !== deptConsolidatedKey && (
                  <div className="mt-8">
                    <MaximizeWrapper title="Disbursement Adjustments">
                      <DisbursementEstimates
                        title={`${isDepartmentMode ? regionDisplayName(currentEntity) : currentEntity} Adjustments`}
                        categories={entityEstimates[currentEntity] || []}
                        onCategoriesChange={(cats) => handleEstimateChange(currentEntity, cats)}
                        currency={currency}
                        readOnly={isViewOnly}
                      />
                    </MaximizeWrapper>
                  </div>
                )}
              </div>
            ) : activeView === "reports" ? (
              <ReportsView
                regions={[...(canSeeExecutive ? [EXECUTIVE_ENTITY] : []), ...(isDepartmentMode && regions.length > 0 ? [deptConsolidatedKey] : []), ...visibleRegions]}
                allData={allAdjustedData}
                reports={reports}
                onReportsChange={setReports}
                currency={currency}
                dateFormat={dateFormat}
                companyLogo={companyLogo}
                readOnly={isViewOnly}
                estimates={entityEstimates}
                currentUserName={currentUser?.displayName || ''}
              />
            ) : activeView === "history" ? (
              <ChangeHistory
                currentEntity={currentEntity}
                regions={regions}
                onDataReverted={async () => {
                  // Reload all data from server after a revert
                  try {
                    const response = await fetch("/api/data");
                    const data = await response.json();
                    if (data.entityEstimates) setEntityEstimates(prev => ({ ...prev, ...data.entityEstimates }));
                    if (data.manualOverrides) setManualOverrides(prev => ({ ...prev, ...data.manualOverrides }));
                    if (data.manualBalances) setManualBalances(prev => ({ ...prev, ...data.manualBalances }));
                  } catch (error) {
                    console.error("Failed to reload data after revert:", error);
                  }
                }}
              />
            ) : (
              <SettingsView
                theme={theme}
                onThemeChange={handleThemeChange}
                currency={currency}
                onCurrencyChange={handleCurrencyChange}
                dateFormat={dateFormat}
                onDateFormatChange={handleDateFormatChange}
                companyLogo={companyLogo}
                onCompanyLogoChange={handleCompanyLogoChange}
                onExportData={handleExportData}
                onResetData={handleResetData}
                regions={regions}
                onAddRegion={handleAddRegion}
                onDeleteRegion={handleDeleteRegion}
                currentUser={currentUser}
                allUsers={allUsers}
                onCreateUser={handleCreateUser}
                onUpdateUser={handleUpdateUser}
                onDeleteUser={handleDeleteUser}
                onLogout={handleLogout}
                departments={departments}
                onCreateDepartment={handleCreateDepartment}
                onDeleteDepartment={handleDeleteDepartment}
                isDepartmentMode={isDepartmentMode}
                regionDisplayName={regionDisplayName}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
