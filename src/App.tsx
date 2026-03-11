import { useEffect, useState, useMemo } from "react";
import { parse, differenceInDays, format, startOfToday, addDays, isWeekend, isBefore } from "date-fns";
import { DailyData, DashboardStats, Entity, DisbursementItem, EstimateCategory, Report } from "./types";
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
import { LayoutDashboard, Building2, FileText, Settings, Bell, Search, Users, MapPin, Globe, Earth, Car, Building, Landmark, Play, Pause, RotateCcw } from "lucide-react";
import { motion } from "motion/react";

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
  const [multiEntityData, setMultiEntityData] = useState<Record<Entity, DailyData[]> | null>(null);
  const [currentEntity, setCurrentEntity] = useState<Entity>("Executive");
  const [activeView, setActiveView] = useState<"dashboard" | "reports" | "settings">("dashboard");
  const [forecastDays, setForecastDays] = useState(14);
  const [isSimulationMode, setIsSimulationMode] = useState(false);
  const [simulationOverrides, setSimulationOverrides] = useState<Record<Exclude<Entity, "Executive">, Record<string, Partial<DailyData>>>>({
    "Flint": {},
    "ISH": {},
    "Coldwater": {},
    "Chicago": {},
  });
  
  const todayStr = format(startOfToday(), "yyyy-MM-dd");

  const [entityEstimates, setEntityEstimates] = useState<Record<Exclude<Entity, "Executive">, EstimateCategory[]>>({
    "Flint": [
      { id: "flint-payroll", label: "Payroll", baseAmount: 0, adjustment: 0, period: "Bi-Weekly", startDate: todayStr },
      { id: "flint-ops", label: "General AP Payments", baseAmount: 0, adjustment: 0, period: "Daily", startDate: todayStr }
    ],
    "ISH": [
      { id: "ish-payroll", label: "Payroll", baseAmount: 0, adjustment: 0, period: "Bi-Weekly", startDate: todayStr },
      { id: "ish-ops", label: "General AP Payments", baseAmount: 0, adjustment: 0, period: "Daily", startDate: todayStr }
    ],
    "Coldwater": [
      { id: "cw-payroll", label: "Payroll", baseAmount: 0, adjustment: 0, period: "Bi-Weekly", startDate: format(addDays(startOfToday(), 7), "yyyy-MM-dd") },
      { id: "cw-ops", label: "General AP Payments", baseAmount: 0, adjustment: 0, period: "Daily", startDate: todayStr }
    ],
    "Chicago": [
      { id: "chi-payroll", label: "Payroll", baseAmount: 0, adjustment: 0, period: "Bi-Weekly", startDate: todayStr },
      { id: "chi-ops", label: "General AP Payments", baseAmount: 0, adjustment: 0, period: "Daily", startDate: todayStr }
    ],
  });

  const [manualOverrides, setManualOverrides] = useState<Record<Exclude<Entity, "Executive">, Record<string, Partial<DailyData>>>>({
    "Flint": {},
    "ISH": {},
    "Coldwater": {},
    "Chicago": {},
  });

  const [manualBalances, setManualBalances] = useState<Record<Exclude<Entity, "Executive">, Record<string, number>>>({
    "Flint": { flint: 0 },
    "ISH": { ish: 0 },
    "Coldwater": { main: 0 },
    "Chicago": { main: 0 },
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
        if (data.entityEstimates) setEntityEstimates(prev => ({ ...prev, ...data.entityEstimates }));
        
        // Cleanup manualOverrides: Remove cashIn if it exists (legacy from old report system)
        if (data.manualOverrides) {
          const cleanedOverrides: any = {};
          Object.entries(data.manualOverrides).forEach(([region, days]: [string, any]) => {
            cleanedOverrides[region] = {};
            Object.entries(days).forEach(([date, values]: [string, any]) => {
              const { cashIn, ...rest } = values;
              if (Object.keys(rest).length > 0) {
                cleanedOverrides[region][date] = rest;
              }
            });
          });
          setManualOverrides(prev => ({ ...prev, ...cleanedOverrides }));
        }
        
        if (data.manualBalances) setManualBalances(prev => ({ ...prev, ...data.manualBalances }));
        if (data.reports) setReports(data.reports);
      } catch (error) {
        console.error("Failed to load data:", error);
      } finally {
        const parsed = parseLiquidityData();
        setMultiEntityData(parsed);
        setIsLoaded(true);
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    fetch("/api/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "entityEstimates", value: entityEstimates }),
    }).catch(err => console.error("Failed to save estimates:", err));
  }, [entityEstimates, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    fetch("/api/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "manualOverrides", value: manualOverrides }),
    }).catch(err => console.error("Failed to save overrides:", err));
  }, [manualOverrides, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    fetch("/api/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "manualBalances", value: manualBalances }),
    }).catch(err => console.error("Failed to save balances:", err));
  }, [manualBalances, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    fetch("/api/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "reports", value: reports }),
    }).catch(err => console.error("Failed to save reports:", err));
  }, [reports, isLoaded]);

  const reportData = useMemo(() => {
    const projectionOverrides: Record<Exclude<Entity, "Executive">, Record<string, Partial<DailyData>>> = {
      "Flint": {}, "ISH": {}, "Coldwater": {}, "Chicago": {},
    };
    const actualsOverrides: Record<Exclude<Entity, "Executive">, Record<string, { actualCashIn: number, actualCashOut: number }>> = {
      "Flint": {}, "ISH": {}, "Coldwater": {}, "Chicago": {},
    };

    const regions: Exclude<Entity, "Executive">[] = ["Flint", "ISH", "Coldwater", "Chicago"];

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
        const data = report.data as Record<string, { actualCashIn: number, actualCashOut: number }>;
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
  }, [reports]);

  const adjustData = (
    rawData: DailyData[], 
    estimates: EstimateCategory[], 
    overrides: Record<string, Partial<DailyData>> = {},
    region: Exclude<Entity, "Executive">,
    initialBalanceOverride?: number,
    simOverrides: Record<string, Partial<DailyData>> = {},
    reportProjectionOverride: Record<string, Partial<DailyData>> = {},
    reportActualsOverride: Record<string, { actualCashIn: number, actualCashOut: number }> = {}
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

      // For the current day (index 0), cash in is already factored into the manually entered starting balance
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
        actualCashIn = index === 0 ? 0 : uploadedActuals.actualCashIn;
        actualCashOut = uploadedActuals.actualCashOut;
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
        receiptsFlint: region === "Flint" ? regionalReceipts : 0,
        receiptsISH: region === "ISH" ? regionalReceipts : 0,
        receiptsColdwater: region === "Coldwater" ? regionalReceipts : 0,
        receiptsChicago: region === "Chicago" ? regionalReceipts : 0,
        actualCashIn,
        actualCashOut,
        isSimulated: Object.keys(simOverride).length > 0
      };
    });
  };

  const allAdjustedData = useMemo(() => {
    if (!multiEntityData) return null;

    const getSum = (obj: Record<string, number>) => Object.values(obj).reduce((a, b) => a + b, 0);

    const flintAdj = adjustData(multiEntityData["Flint"], entityEstimates["Flint"], manualOverrides["Flint"], "Flint", getSum(manualBalances["Flint"]), simulationOverrides["Flint"], reportData.projectionOverrides["Flint"], reportData.actualsOverrides["Flint"]);
    const ishAdj = adjustData(multiEntityData["ISH"], entityEstimates["ISH"], manualOverrides["ISH"], "ISH", getSum(manualBalances["ISH"]), simulationOverrides["ISH"], reportData.projectionOverrides["ISH"], reportData.actualsOverrides["ISH"]);
    const cwAdj = adjustData(multiEntityData["Coldwater"], entityEstimates["Coldwater"], manualOverrides["Coldwater"], "Coldwater", getSum(manualBalances["Coldwater"]), simulationOverrides["Coldwater"], reportData.projectionOverrides["Coldwater"], reportData.actualsOverrides["Coldwater"]);
    const chAdj = adjustData(multiEntityData["Chicago"], entityEstimates["Chicago"], manualOverrides["Chicago"], "Chicago", getSum(manualBalances["Chicago"]), simulationOverrides["Chicago"], reportData.projectionOverrides["Chicago"], reportData.actualsOverrides["Chicago"]);

    const execAdj: DailyData[] = flintAdj.map((f, i) => {
      const ish = ishAdj[i];
      const cw = cwAdj[i];
      const ch = chAdj[i];
      
      // Consolidate disbursements for executive view
      const consolidatedDisbursements: DisbursementItem[] = [
        ...f.disbursements.map(d => ({ ...d, label: `Flint: ${d.label}` })),
        ...ish.disbursements.map(d => ({ ...d, label: `ISH: ${d.label}` })),
        ...cw.disbursements.map(d => ({ ...d, label: `CW: ${d.label}` })),
        ...ch.disbursements.map(d => ({ ...d, label: `Chi: ${d.label}` }))
      ];

      return {
        date: f.date,
        cashIn: f.cashIn + ish.cashIn + cw.cashIn + ch.cashIn,
        cashOut: f.cashOut + ish.cashOut + cw.cashOut + ch.cashOut,
        netFlow: f.netFlow + ish.netFlow + cw.netFlow + ch.netFlow,
        endingBalance: f.endingBalance + ish.endingBalance + cw.endingBalance + ch.endingBalance,
        payroll: f.payroll + ish.payroll + cw.payroll + ch.payroll,
        apPayments: f.apPayments + ish.apPayments + cw.apPayments + ch.apPayments,
        benefits: f.benefits + ish.benefits + cw.benefits + ch.benefits,
        otherDisbursements: f.otherDisbursements + ish.otherDisbursements + cw.otherDisbursements + ch.otherDisbursements,
        receiptsFlint: f.receiptsFlint,
        receiptsISH: ish.receiptsISH,
        receiptsColdwater: cw.receiptsColdwater,
        receiptsChicago: ch.receiptsChicago,
        grants: f.grants + ish.grants + cw.grants + ch.grants,
        disbursements: consolidatedDisbursements
      };
    });

    return {
      "Flint": flintAdj,
      "ISH": ishAdj,
      "Coldwater": cwAdj,
      "Chicago": chAdj,
      "Executive": execAdj
    };
  }, [multiEntityData, entityEstimates, manualOverrides, manualBalances, simulationOverrides, reportData]);

  const currentData = useMemo(() => {
    if (!allAdjustedData) return [];
    return allAdjustedData[currentEntity];
  }, [allAdjustedData, currentEntity]);

  const stats = useMemo(() => {
    if (currentData.length === 0) return null;
    const baseStats = calculateStats(currentData);
    
    if (currentEntity === "Executive" && allAdjustedData) {
      const regionalNegatives: any[] = [];
      const regionalBurnRates: any[] = [];

      (["Flint", "ISH", "Coldwater", "Chicago"] as const).forEach(region => {
        const regionData = allAdjustedData[region];
        const regionStats = calculateStats(regionData);
        
        // Calculate Burn Rates (last 30 days of projections)
        const next30 = regionData.slice(0, 30);
        const totalOut = next30.reduce((acc, d) => acc + d.cashOut, 0);
        const dailyBurn = totalOut / 30;
        const weeklyBurn = dailyBurn * 7;
        
        regionalBurnRates.push({
          region,
          dailyBurn,
          weeklyBurn,
          status: dailyBurn > 100000 ? 'critical' : dailyBurn > 50000 ? 'warning' : 'stable'
        });

        if (regionStats.nextNegativeTransaction) {
          regionalNegatives.push({
            ...regionStats.nextNegativeTransaction,
            region
          });
        }
      });
      baseStats.regionalNegativeTransactions = regionalNegatives;
      baseStats.regionalBurnRates = regionalBurnRates;
      
      baseStats.regionalLiquidityBreakdown = (["Flint", "ISH", "Coldwater", "Chicago"] as const).map(region => ({
        region,
        value: allAdjustedData[region][0]?.endingBalance || 0
      }));
    }
    
    return baseStats;
  }, [currentData, currentEntity, allAdjustedData]);

  const navigation = [
    { id: "Executive", label: "Executive View", icon: Earth },
    { id: "Flint", label: "Flint", icon: Car },
    { id: "ISH", label: "ISH", icon: Building },
    { id: "Coldwater", label: "Coldwater", icon: Landmark },
    { id: "Chicago", label: "Chicago", icon: Building2 },
  ];

  const handleEstimateChange = (entity: Exclude<Entity, "Executive">, newCategories: EstimateCategory[]) => {
    setEntityEstimates(prev => ({
      ...prev,
      [entity]: newCategories
    }));

    // Clear estimate-type overrides to allow the new categories to take full effect
    // as requested: "It needs to override all previous estimates"
    setManualOverrides(prev => {
      const region = entity as Exclude<Entity, "Executive">;
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
    if (currentEntity === "Executive") return; // Cannot edit consolidated directly
    
    const targetSetter = isSimulationMode ? setSimulationOverrides : setManualOverrides;

    targetSetter(prev => ({
      ...prev,
      [currentEntity]: {
        ...prev[currentEntity as Exclude<Entity, "Executive">],
        [date]: {
          ...prev[currentEntity as Exclude<Entity, "Executive">][date],
          ...updates
        }
      }
    }));
  };

  const handleUpdateBalance = (key: string, balance: number) => {
    if (currentEntity === "Executive") return;
    setManualBalances(prev => ({
      ...prev,
      [currentEntity]: {
        ...prev[currentEntity as Exclude<Entity, "Executive">],
        [key]: balance
      }
    }));
  };

  const handleInternalTransfer = (fromEntity: Exclude<Entity, "Executive">, toEntity: Exclude<Entity, "Executive">, amount: number) => {
    setManualBalances(prev => {
      const newBalances = { ...prev };
      
      // Helper to get the primary account key for a region
      const getAccountKey = (entity: Exclude<Entity, "Executive">) => {
        if (entity === "Flint") return "flint";
        if (entity === "ISH") return "ish";
        return "main";
      };

      const fromKey = getAccountKey(fromEntity);
      const toKey = getAccountKey(toEntity);

      return {
        ...prev,
        [fromEntity]: {
          ...prev[fromEntity],
          [fromKey]: (prev[fromEntity][fromKey] || 0) - amount
        },
        [toEntity]: {
          ...prev[toEntity],
          [toKey]: (prev[toEntity][toKey] || 0) + amount
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
        let region: Exclude<Entity, "Executive"> | undefined;
        let itemToMove: DisbursementItem | undefined;
        let fromDayData: DailyData | undefined;

        if (currentEntity === "Executive") {
          for (const r of ["Flint", "ISH", "Coldwater", "Chicago"] as const) {
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
          region = currentEntity as Exclude<Entity, "Executive">;
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


  if (!stats || !allAdjustedData) return null;

  return (
    <div className="h-screen bg-slate-50 dark:bg-slate-950 flex overflow-hidden">
      {/* Sidebar */}
      <aside className="w-60 bg-slate-900 dark:bg-slate-950 text-slate-300 hidden lg:flex flex-col h-full border-r border-slate-800 dark:border-slate-800/50 overflow-y-auto">
        <div className="p-6 flex items-center gap-3 border-b border-slate-800 dark:border-slate-800/50">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
            <Building2 className="text-white w-5 h-5" />
          </div>
          <span className="font-bold text-white tracking-tight">Insight Treasury</span>
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

        <div className="p-4 border-t border-slate-800 dark:border-slate-800/50">
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

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header - Frozen at the top */}
        <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 h-16 flex items-center justify-between px-4 flex-shrink-0 z-10">
          <div className="flex items-center gap-4 flex-1">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search transactions, reports..." 
                className="w-full pl-10 pr-4 py-2 bg-slate-100 dark:bg-slate-800 border-none rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all dark:text-white dark:placeholder:text-slate-500"
              />
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
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
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Forecast Window:</span>
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

            <div className="flex items-center gap-4">
              <div className="flex flex-col items-end">
                <span className="text-sm font-semibold text-slate-900 dark:text-white">Treasury Manager</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">{currentEntity} Operations</span>
              </div>
              <div className="w-10 h-10 bg-slate-200 dark:bg-slate-800 rounded-full border-2 border-white dark:border-slate-700 shadow-sm overflow-hidden flex items-center justify-center">
                {companyLogo ? (
                  <img src={companyLogo} alt="Company Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-full h-full bg-emerald-500 flex items-center justify-center text-white font-bold text-xs">
                    TM
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Scrolling Content */}
        <main className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950">
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
                      {currentEntity === "Executive" ? "Consolidated" : "Single Entity"}
                    </span>
                    <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                      {currentEntity === "Executive" ? "Executive Treasury Overview" : `${currentEntity} Liquidity Dashboard`}
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
                    balances={manualBalances[currentEntity as Exclude<Entity, "Executive">] || {}}
                    currency={currency}
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
                      isExecutive={currentEntity === "Executive"}
                      currency={currency}
                      dateFormat={dateFormat}
                    />
                  </MaximizeWrapper>
                </div>

                <div className="mt-8">
                  <MaximizeWrapper title="Historical Reconciliation">
                    <ReconciliationTable data={currentData} currency={currency} dateFormat={dateFormat} />
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

                {currentEntity !== "Executive" && (
                  <div className="mt-8">
                    <MaximizeWrapper title="Disbursement Adjustments">
                      <DisbursementEstimates 
                        title={`${currentEntity} Adjustments`}
                        categories={entityEstimates[currentEntity as Exclude<Entity, "Executive">]} 
                        onCategoriesChange={(cats) => handleEstimateChange(currentEntity as Exclude<Entity, "Executive">, cats)} 
                        currency={currency}
                      />
                    </MaximizeWrapper>
                  </div>
                )}
              </div>
            ) : activeView === "reports" ? (
              <ReportsView 
                regions={["Executive", "Flint", "ISH", "Coldwater", "Chicago"]} 
                allData={allAdjustedData}
                reports={reports}
                onReportsChange={setReports}
                currency={currency}
                dateFormat={dateFormat}
                companyLogo={companyLogo}
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
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
