import * as XLSX from 'xlsx';
import { DailyData, Entity } from '../types';
import { format, parse, startOfToday, addDays, isBefore, isSameDay, endOfYear, startOfWeek, endOfWeek, addWeeks, isAfter } from 'date-fns';

const BANK_HOLIDAYS_2026 = [
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-05-25", "2026-06-19",
  "2026-07-03", "2026-09-07", "2026-10-12", "2026-11-11", "2026-11-26", "2026-12-25",
];

const isBusinessDay = (date: Date) => {
  const day = date.getDay();
  if (day === 0 || day === 6) return false;
  const dateStr = format(date, "yyyy-MM-dd");
  return !BANK_HOLIDAYS_2026.includes(dateStr);
};

export const exportLiquidityExcel = (allData: Record<Entity, DailyData[]>, entityName: Entity, type: 'daily' | 'weekly') => {
  const data = allData[entityName];
  const today = startOfToday();
  let filteredData: DailyData[] = [];

  if (type === 'daily') {
    const yearEnd = endOfYear(today);
    filteredData = data.filter(d => {
      const dDate = parse(d.date, "M/d/yyyy", new Date());
      return (isSameDay(dDate, today) || isAfter(dDate, today)) && (isBefore(dDate, yearEnd) || isSameDay(dDate, yearEnd)) && isBusinessDay(dDate);
    });
  } else {
    // Weekly for 13 weeks
    const thirteenWeeksLater = addWeeks(today, 13);
    const weeks: Record<string, DailyData[]> = {};
    
    data.forEach(d => {
      const dDate = parse(d.date, "M/d/yyyy", new Date());
      if ((isSameDay(dDate, today) || isAfter(dDate, today)) && isBefore(dDate, thirteenWeeksLater)) {
        const weekStart = format(startOfWeek(dDate, { weekStartsOn: 1 }), "M/d/yyyy");
        if (!weeks[weekStart]) weeks[weekStart] = [];
        weeks[weekStart].push(d);
      }
    });

    filteredData = Object.entries(weeks).map(([date, days]) => {
      return {
        date,
        cashIn: days.reduce((acc, d) => acc + d.cashIn, 0),
        cashOut: days.reduce((acc, d) => acc + d.cashOut, 0),
        netFlow: days.reduce((acc, d) => acc + d.netFlow, 0),
        endingBalance: days[days.length - 1].endingBalance,
        payroll: days.reduce((acc, d) => acc + d.payroll, 0),
        apPayments: days.reduce((acc, d) => acc + d.apPayments, 0),
        benefits: days.reduce((acc, d) => acc + d.benefits, 0),
        otherDisbursements: days.reduce((acc, d) => acc + d.otherDisbursements, 0),
        receiptsFlint: days.reduce((acc, d) => acc + d.receiptsFlint, 0),
        receiptsISH: days.reduce((acc, d) => acc + d.receiptsISH, 0),
        receiptsColdwater: days.reduce((acc, d) => acc + d.receiptsColdwater, 0),
        receiptsChicago: days.reduce((acc, d) => acc + d.receiptsChicago, 0),
        grants: days.reduce((acc, d) => acc + d.grants, 0),
        disbursements: days.flatMap(d => d.disbursements)
      };
    }).sort((a, b) => parse(a.date, "M/d/yyyy", new Date()).getTime() - parse(b.date, "M/d/yyyy", new Date()).getTime());
  }

  const getDisbursementAmount = (day: DailyData, search: string) => {
    return day.disbursements
      .filter(d => d.label.toLowerCase().includes(search.toLowerCase()))
      .reduce((acc, d) => acc + d.amount, 0);
  };

  // Prepare rows
  const rows: any[] = [];
  
  // Header row
  const header = ['', '', '', ...filteredData.map(d => d.date)];
  rows.push(header);

  // Cash Receipts Section
  rows.push(['1', 'Cash Receipts', '', ...filteredData.map(() => '')]);
  
  if (entityName === 'Executive') {
    const regions: Entity[] = ['Flint', 'ISH', 'Coldwater', 'Chicago'];
    regions.forEach((region, index) => {
      rows.push([`${index + 2}`, region, '', ...filteredData.map((_, i) => {
        const d = filteredData[i];
        if (type === 'daily') {
          const originalIndex = data.findIndex(day => day.date === d.date);
          return allData[region][originalIndex].cashIn;
        } else {
          const weekStart = parse(d.date, "M/d/yyyy", new Date());
          const weekEnd = addDays(weekStart, 6);
          return allData[region].filter(day => {
            const dayDate = parse(day.date, "M/d/yyyy", new Date());
            return (isSameDay(dayDate, weekStart) || isAfter(dayDate, weekStart)) && (isBefore(dayDate, weekEnd) || isSameDay(dayDate, weekEnd));
          }).reduce((acc, day) => acc + day.cashIn, 0);
        }
      })]);
    });
    rows.push([`${regions.length + 2}`, 'Total Cash Receipts', '', ...filteredData.map(d => d.cashIn)]);
  } else if (entityName === 'Flint') {
    rows.push(['2', 'Flint', '', ...filteredData.map(d => d.receiptsFlint)]);
    rows.push(['3', 'Total Cash Receipts', '', ...filteredData.map(d => d.cashIn)]);
  } else if (entityName === 'ISH') {
    rows.push(['2', 'ISH', '', ...filteredData.map(d => d.receiptsISH)]);
    rows.push(['3', 'Total Cash Receipts', '', ...filteredData.map(d => d.cashIn)]);
  } else {
    rows.push(['2', entityName, '', ...filteredData.map(d => d.cashIn)]);
    rows.push(['3', '', '', ...filteredData.map(() => '')]);
    rows.push(['4', 'Total Cash Receipts', '', ...filteredData.map(d => d.cashIn)]);
  }

  rows.push(['', '', '', ...filteredData.map(() => '')]);

  // Grants Section
  rows.push(['5', 'Grants / Other Funding', '', ...filteredData.map(() => '')]);
  rows.push(['6', 'Management Income', '', ...filteredData.map(d => getDisbursementAmount(d, 'Management Income'))]);
  rows.push(['7', 'QAAP', '', ...filteredData.map(d => getDisbursementAmount(d, 'QAAP'))]);
  rows.push(['8', 'IGT', '', ...filteredData.map(d => getDisbursementAmount(d, 'IGT'))]);
  rows.push(['9', 'Owed to Gain Servicing', '', ...filteredData.map(d => getDisbursementAmount(d, 'Owed to Gain'))]);
  rows.push(['10', 'Funds Holding', '', ...filteredData.map(d => getDisbursementAmount(d, 'Funds Holding'))]);
  rows.push(['11', 'Total Grant / Other Funding', '', ...filteredData.map(d => d.grants)]);
  rows.push(['12', 'Total Receipts', '', ...filteredData.map(d => d.cashIn)]);
  rows.push(['', '', '', ...filteredData.map(() => '')]);

  // Operating Disbursements Section
  rows.push(['13', 'Operating Disbursements', '', ...filteredData.map(() => '')]);
  rows.push(['14', 'Payroll', '', ...filteredData.map(d => -d.payroll)]);
  rows.push(['15', 'Benefits', '', ...filteredData.map(d => -d.benefits)]);
  rows.push(['16', 'General AP Payments', '', ...filteredData.map(d => -d.apPayments)]);
  rows.push(['17', 'Practice Funding', '', ...filteredData.map(d => -getDisbursementAmount(d, 'Practice Funding'))]);
  rows.push(['18', 'Facilities / Operating Leases', '', ...filteredData.map(d => -getDisbursementAmount(d, 'Facilities / Operating Leases'))]);
  rows.push(['19', 'Credit Cards', '', ...filteredData.map(d => -getDisbursementAmount(d, 'Credit Cards'))]);
  rows.push(['20', 'Insurance', '', ...filteredData.map(d => -getDisbursementAmount(d, 'Insurance'))]);
  rows.push(['21', 'Utilities', '', ...filteredData.map(d => -getDisbursementAmount(d, 'Utilities'))]);
  
  // Calculate Itemized Disbursement (Remainder)
  rows.push(['22', 'Itemized Disbursement', '', ...filteredData.map(d => {
    const mapped = d.payroll + d.benefits + d.apPayments + 
      getDisbursementAmount(d, 'Practice Funding') + 
      getDisbursementAmount(d, 'Facilities / Operating Leases') + 
      getDisbursementAmount(d, 'Credit Cards') + 
      getDisbursementAmount(d, 'Insurance') + 
      getDisbursementAmount(d, 'Utilities');
    return -(d.cashOut - mapped);
  })]);

  rows.push(['23', 'Total Operating Disbursements', '', ...filteredData.map(d => -d.cashOut)]);
  rows.push(['', '', '', ...filteredData.map(() => '')]);

  // Bottom Section
  rows.push(['23', 'Beginning Book Cash Balance', '', ...filteredData.map((d, i) => i === 0 ? d.endingBalance - d.netFlow : filteredData[i-1].endingBalance)]);
  rows.push(['24', 'Net Cash Flow', '', ...filteredData.map(d => d.netFlow)]);
  rows.push(['25', 'Ending Book Cash Balance', '', ...filteredData.map(d => d.endingBalance)]);

  // Create workbook
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Liquidity Report");

  // Export
  const fileName = `Liquidity_Report_${type}_${format(new Date(), 'yyyyMMdd')}.xlsx`;
  XLSX.writeFile(wb, fileName);
};
