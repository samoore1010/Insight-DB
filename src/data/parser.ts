import { DailyData, DashboardStats, Entity, EXECUTIVE_ENTITY, DEFAULT_REGIONS } from "../types";
import { parse, format, addDays, isAfter, isBefore, startOfToday } from "date-fns";

export function parseLiquidityData(regions: string[] = DEFAULT_REGIONS): Record<string, DailyData[]> {
  const startDate = startOfToday();
  const daysToGenerate = 365;

  const regionDataMap: Record<string, DailyData[]> = {};

  // Initialize data arrays for each region
  regions.forEach(region => {
    regionDataMap[region] = [];
  });

  for (let i = 0; i < daysToGenerate; i++) {
    const current = addDays(startDate, i);
    const dateStr = format(current, "M/d/yyyy");

    const emptyReceipts: Record<string, number> = {};
    regions.forEach(r => { emptyReceipts[r] = 0; });

    const base: DailyData = {
      date: dateStr,
      cashIn: 0,
      cashOut: 0,
      netFlow: 0,
      endingBalance: 0,
      payroll: 0,
      apPayments: 0,
      benefits: 0,
      otherDisbursements: 0,
      regionalReceipts: { ...emptyReceipts },
      grants: 0,
      disbursements: []
    };

    regions.forEach(region => {
      regionDataMap[region].push({ ...base, regionalReceipts: { ...emptyReceipts } });
    });
  }

  // Build Executive consolidated view
  const executiveData: DailyData[] = regionDataMap[regions[0]]?.map((first, i) => {
    const emptyReceipts: Record<string, number> = {};
    regions.forEach(r => { emptyReceipts[r] = 0; });

    let totalBalance = 0;
    regions.forEach(region => {
      totalBalance += regionDataMap[region][i].endingBalance;
    });

    return {
      date: first.date,
      cashIn: 0,
      cashOut: 0,
      netFlow: 0,
      endingBalance: totalBalance,
      payroll: 0,
      apPayments: 0,
      benefits: 0,
      otherDisbursements: 0,
      regionalReceipts: { ...emptyReceipts },
      grants: 0,
      disbursements: []
    };
  }) || [];

  return {
    ...regionDataMap,
    [EXECUTIVE_ENTITY]: executiveData
  };
}

export function calculateStats(data: DailyData[]): DashboardStats {
  const today = startOfToday();
  const fourteenDaysLater = addDays(today, 14);

  const next14Days = data.filter(d => {
    const dDate = parse(d.date, "M/d/yyyy", new Date());
    return (isAfter(dDate, today) || dDate.getTime() === today.getTime()) && isBefore(dDate, fourteenDaysLater);
  });

  const nextPayroll = data.find(d => d.payroll > 0);

  // Find next negative transaction
  let nextNegativeTransaction: any = null;
  const firstNegativeDay = data.find(d => d.endingBalance < 0);
  if (firstNegativeDay) {
    const largestDisb = [...firstNegativeDay.disbursements].sort((a, b) => b.amount - a.amount)[0];
    if (largestDisb) {
      let region = "Current";
      let label = largestDisb.label;
      if (largestDisb.label.includes(":")) {
        const parts = largestDisb.label.split(":");
        region = parts[0].trim();
        label = parts[1].trim();
      }
      nextNegativeTransaction = {
        date: firstNegativeDay.date,
        label,
        amount: largestDisb.amount,
        netAmount: firstNegativeDay.endingBalance,
        region,
        isNegative: true
      };
    }
  }

  const upcomingPayrolls: any[] = [];
  next14Days.forEach(day => {
    day.disbursements.forEach(disb => {
      if (disb.label.toLowerCase().includes("payroll")) {
        let region = "Current";
        let label = disb.label;
        if (disb.label.includes(":")) {
          const parts = disb.label.split(":");
          region = parts[0].trim();
          label = parts[1].trim();
        }

        upcomingPayrolls.push({
          region,
          amount: disb.amount,
          date: day.date,
          isFunded: day.endingBalance >= 0,
          netAtDate: day.endingBalance
        });
      }
    });
  });

  // Aggregate regional receipts across 14-day window
  const regionalReceipts: Record<string, number> = {};
  next14Days.forEach(d => {
    Object.entries(d.regionalReceipts).forEach(([region, value]) => {
      regionalReceipts[region] = (regionalReceipts[region] || 0) + value;
    });
  });

  return {
    currentLiquidity: data[0]?.endingBalance || 0,
    projected14DayNet: next14Days.reduce((acc, d) => acc + d.netFlow, 0),
    nextPayrollAmount: nextPayroll?.payroll || 0,
    nextPayrollDate: nextPayroll?.date || "N/A",
    nextPayrollIsFunded: (nextPayroll?.endingBalance || 0) >= 0,
    nextPayrollNet: nextPayroll?.endingBalance || 0,
    totalReceiptsNext14: next14Days.reduce((acc, d) => acc + d.cashIn, 0),
    totalDisbursementsNext14: next14Days.reduce((acc, d) => acc + d.cashOut, 0),
    upcomingPayrolls,
    nextNegativeTransaction,
    breakdown14Day: {
      regionalReceipts,
      grants: next14Days.reduce((acc, d) => acc + d.grants, 0),
      payroll: next14Days.reduce((acc, d) => acc + d.payroll, 0),
      benefits: next14Days.reduce((acc, d) => acc + d.benefits, 0),
      apPayments: next14Days.reduce((acc, d) => acc + d.apPayments, 0),
      otherDisbursements: next14Days.reduce((acc, d) => acc + d.otherDisbursements, 0),
    }
  };
}
