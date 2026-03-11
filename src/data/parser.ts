import { csvParseRows } from "d3-dsv";
import { DailyData, DashboardStats, Entity } from "../types";
import { RAW_CSV } from "./rawCsv";
import { parse, format, addDays, isAfter, isBefore, startOfToday } from "date-fns";

export function parseLiquidityData(): Record<Entity, DailyData[]> {
  const startDate = startOfToday();
  const daysToGenerate = 365;
  
  const flintData: DailyData[] = [];
  const ishData: DailyData[] = [];
  const coldwaterData: DailyData[] = [];
  const chicagoData: DailyData[] = [];

  // Starting balances
  const initialBalances = {
    flint: 0,
    ish: 0,
    coldwater: 0,
    chicago: 0
  };

  for (let i = 0; i < daysToGenerate; i++) {
    const current = addDays(startDate, i);
    const dateStr = format(current, "M/d/yyyy");

    const base: DailyData = {
      date: dateStr,
      cashIn: 0,
      cashOut: 0,
      netFlow: 0,
      endingBalance: 0, // Will be calculated in App.tsx
      payroll: 0,
      apPayments: 0,
      benefits: 0,
      otherDisbursements: 0,
      receiptsFlint: 0,
      receiptsISH: 0,
      receiptsColdwater: 0,
      receiptsChicago: 0,
      grants: 0,
      disbursements: []
    };

    flintData.push({ ...base, endingBalance: i === 0 ? initialBalances.flint : 0 });
    ishData.push({ ...base, endingBalance: i === 0 ? initialBalances.ish : 0 });
    coldwaterData.push({ ...base, endingBalance: i === 0 ? initialBalances.coldwater : 0 });
    chicagoData.push({ ...base, endingBalance: i === 0 ? initialBalances.chicago : 0 });
  }

  const executiveData: DailyData[] = flintData.map((f, i) => {
    const ish = ishData[i];
    const cw = coldwaterData[i];
    const ch = chicagoData[i];
    return {
      date: f.date,
      cashIn: 0,
      cashOut: 0,
      netFlow: 0,
      endingBalance: f.endingBalance + ish.endingBalance + cw.endingBalance + ch.endingBalance,
      payroll: 0,
      apPayments: 0,
      benefits: 0,
      otherDisbursements: 0,
      receiptsFlint: 0,
      receiptsISH: 0,
      receiptsColdwater: 0,
      receiptsChicago: 0,
      grants: 0,
      disbursements: []
    };
  });

  return {
    "Flint": flintData,
    "ISH": ishData,
    "Coldwater": coldwaterData,
    "Chicago": chicagoData,
    "Executive": executiveData
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
    // Find the largest disbursement on this day
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
        // Extract region if it exists (for Executive view)
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
      receiptsFlint: next14Days.reduce((acc, d) => acc + d.receiptsFlint, 0),
      receiptsISH: next14Days.reduce((acc, d) => acc + d.receiptsISH, 0),
      receiptsColdwater: next14Days.reduce((acc, d) => acc + d.receiptsColdwater, 0),
      receiptsChicago: next14Days.reduce((acc, d) => acc + d.receiptsChicago, 0),
      grants: next14Days.reduce((acc, d) => acc + d.grants, 0),
      payroll: next14Days.reduce((acc, d) => acc + d.payroll, 0),
      benefits: next14Days.reduce((acc, d) => acc + d.benefits, 0),
      apPayments: next14Days.reduce((acc, d) => acc + d.apPayments, 0),
      otherDisbursements: next14Days.reduce((acc, d) => acc + d.otherDisbursements, 0),
    }
  };
}
