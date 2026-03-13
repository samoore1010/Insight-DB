export type CyclePeriod = "Daily" | "Weekly" | "Bi-Weekly" | "Monthly" | "One-Time";

export interface Attachment {
  id: string;
  name: string;
  url: string;
  type: string;
  size: string;
}

export interface EstimateCategory {
  id: string;
  label: string;
  baseAmount: number;
  adjustment: number;
  period: CyclePeriod;
  startDate: string;
  endDate?: string;
  comments?: string;
  attachments?: Attachment[];
}

export type Entity = string;

export const EXECUTIVE_ENTITY = "Executive";

export const DEFAULT_REGIONS: string[] = ["Flint", "ISH", "Coldwater", "Chicago"];

export type DisbursementStatus = "Unfunded" | "Funded" | "Paid";
export type DisbursementType = "manual" | "estimate";

export interface DisbursementItem {
  id: string;
  label: string;
  amount: number;
  status?: DisbursementStatus;
  type?: DisbursementType;
  comments?: string;
  attachments?: Attachment[];
}

export interface DailyData {
  date: string;
  cashIn: number;
  cashOut: number;
  netFlow: number;
  endingBalance: number;
  payroll: number;
  apPayments: number;
  benefits: number;
  otherDisbursements: number;
  regionalReceipts: Record<string, number>;
  grants: number;
  disbursements: DisbursementItem[];
  // Reconciliation fields
  actualCashIn?: number;
  actualCashOut?: number;
  isSimulated?: boolean;
}

export interface PayrollInfo {
  region: string;
  amount: number;
  date: string;
  isFunded: boolean;
  netAtDate: number;
}

export interface NegativeTransaction {
  date: string;
  label: string;
  amount: number;
  netAmount: number;
  region?: string;
  isNegative?: boolean;
}

export interface DashboardStats {
  currentLiquidity: number;
  projected14DayNet: number;
  nextPayrollAmount: number;
  nextPayrollDate: string;
  nextPayrollIsFunded: boolean;
  nextPayrollNet: number;
  totalReceiptsNext14: number;
  totalDisbursementsNext14: number;
  upcomingPayrolls?: PayrollInfo[];
  nextNegativeTransaction?: NegativeTransaction;
  regionalNegativeTransactions?: NegativeTransaction[];
  regionalLiquidityBreakdown?: { region: string, value: number }[];
  regionalBurnRates?: { region: string, dailyBurn: number, weeklyBurn: number, status: 'stable' | 'warning' | 'critical' }[];
  breakdown14Day: {
    regionalReceipts: Record<string, number>;
    grants: number;
    payroll: number;
    benefits: number;
    apPayments: number;
    otherDisbursements: number;
  };
}

export interface ReportSelection {
  comprehensive: boolean;
  summary: boolean;
  trend: boolean;
  obligations: boolean;
  forecast: boolean;
  matrix: boolean;
  variance: boolean;
  documentation: boolean;
}

export interface Report {
  id: string;
  name: string;
  type: string;
  uploadedAt: string;
  region: Entity;
  status: "Processed" | "Pending" | "Error";
  size: string;
  data?: any;
}

// ── Report Builder Types ──────────────────────────────────────────
export type ReportModuleType =
  | "liquidity-summary"
  | "cash-flow-chart"
  | "cash-calendar"
  | "reconciliation-table"
  | "variance-chart"
  | "forecast-table"
  | "disbursement-estimates"
  | "regional-matrix"
  | "variance-risk"
  | "critical-obligations"
  | "liquidity-trend";

export interface ReportBlock {
  id: string;
  moduleType: ReportModuleType;
  label: string;
  timeframe: string;
  region: string;
}

export interface SavedReport {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
  blocks: ReportBlock[];
}

export type ChangeAction = "create" | "update" | "delete" | "move" | "revert" | "migrate";

export interface ChangelogEntry {
  id: number;
  entityType: "estimate" | "disbursement" | "balance";
  entityId: string;
  region: string;
  action: ChangeAction;
  summary: string;
  diff?: Record<string, { old: any; new: any }>;
  snapshot?: any;
  batchId?: string;
  createdAt: string;
}
