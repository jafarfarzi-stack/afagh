/**
 * payrollReducer — تجمیع وضعیت و منطق ماژول حقوق و دستمزد اساتید
 *
 * طبق نقشهٔ جراحی (گام ۲): تمام منطقی که قبلاً در PayrollEngineClient به‌صورت
 * پراکنده با setXها بود — ارتقای مرحله‌ای تأیید فیش با گلوگاه‌های قانونی
 * (نمرات نهایی + امضای قرارداد/ابلاغیه)، بازمحاسبه، تسویهٔ گروهی، نرخ پایه و
 * ضرایب — این‌جا به‌صورت انتقال‌های خالص تجمیع شده تا:
 *   ۱) باگ‌های تداخل useStateها خنثی شود؛
 *   ۲) بدون رندر React قابل Unit Test باشد؛
 *   ۳) زمینهٔ اتصال تمیز به Server Actions (actions.ts) فراهم شود.
 */
import { Dispatch } from 'react';
import type {
  BaseRateItem,
  ProfFinancialSettingItem,
  BiometricAttendanceLogItem,
  CourseExamAggregationItem,
  MultiplierRuleItem,
  PayrollStatus,
  PayrollTabType,
  ProfessorPayrollRecord,
  TeachingAppointmentDecree,
} from './payrollData';

export interface PayrollState {
  activeTab: PayrollTabType;
  payrollRecords: ProfessorPayrollRecord[];
  baseRates: BaseRateItem[];
  multipliers: MultiplierRuleItem[];
  biometricLogs: BiometricAttendanceLogItem[];
  appointmentDecrees: TeachingAppointmentDecree[];
  courseExamAggregations: CourseExamAggregationItem[];
  paymentPolicy: 'FULL_TERM_END' | 'MILESTONE_INSTALLMENTS';
  toastMessage: string | null;
  searchQuery: string;
  contractFilter: string;
  statusFilter: string;
  detailedPayslipRecord: ProfessorPayrollRecord | null;
  selectedDecreeForView: TeachingAppointmentDecree | null;
  globalTaminSyncEnabled: boolean;
  profFinancialSettings: ProfFinancialSettingItem[];
}

export type PayrollAction =
  | { type: 'SET_TAB'; payload: PayrollTabType }
  | { type: 'SET_TOAST'; payload: string | null }
  | { type: 'SET_SEARCH'; payload: string }
  | { type: 'SET_CONTRACT_FILTER'; payload: string }
  | { type: 'SET_STATUS_FILTER'; payload: string }
  | { type: 'SET_PAYMENT_POLICY'; payload: 'FULL_TERM_END' | 'MILESTONE_INSTALLMENTS' }
  | { type: 'SET_SLIP'; payload: ProfessorPayrollRecord | null }
  | { type: 'SET_DECREE'; payload: TeachingAppointmentDecree | null }
  | { type: 'TOGGLE_TAMIN_SYNC' }
  | { type: 'RECALCULATE_ALL' }
  | { type: 'APPROVE_STAGE'; payload: number }
  | { type: 'BATCH_SETTLE' }
  | { type: 'UPDATE_BASE_RATE'; payload: { id: number; newRate: number } }
  | { type: 'UPDATE_MULTIPLIER'; payload: { id: number; newMul: number } }
  | { type: 'SET_EXAM_AGGREGATIONS'; payload: (prev: CourseExamAggregationItem[]) => CourseExamAggregationItem[] }
  | { type: 'SET_PROF_FINANCIAL_SETTINGS'; payload: (prev: ProfFinancialSettingItem[]) => ProfFinancialSettingItem[] };

export type PayrollDispatch = Dispatch<PayrollAction>;

export function initialPayrollState(initial: {
  payrollRecords: ProfessorPayrollRecord[];
  baseRates: BaseRateItem[];
  multipliers: MultiplierRuleItem[];
  biometricLogs: BiometricAttendanceLogItem[];
  appointmentDecrees: TeachingAppointmentDecree[];
  courseExamAggregations: CourseExamAggregationItem[];
  profFinancialSettings: ProfFinancialSettingItem[];
}): PayrollState {
  return {
    activeTab: 'STATEMENTS_CARTABLE',
    payrollRecords: initial.payrollRecords,
    baseRates: initial.baseRates,
    multipliers: initial.multipliers,
    biometricLogs: initial.biometricLogs,
    appointmentDecrees: initial.appointmentDecrees,
    courseExamAggregations: initial.courseExamAggregations,
    profFinancialSettings: initial.profFinancialSettings,
    paymentPolicy: 'FULL_TERM_END',
    toastMessage: null,
    searchQuery: '',
    contractFilter: 'ALL',
    statusFilter: 'ALL',
    detailedPayslipRecord: null,
    selectedDecreeForView: null,
    globalTaminSyncEnabled: true,
  };
}

/** ارتقای مرحله‌ای وضعیت فیش (داخل reducer تا قابل تست باشد) */
export function nextPayrollStatus(status: PayrollStatus): {
  next: PayrollStatus;
  deptAt?: string;
  deanAt?: string;
  settledAt?: string;
} {
  if (status === 'DRAFT') return { next: 'DEPT_HEAD_APPROVED', deptAt: 'هم‌اکنون' };
  if (status === 'DEPT_HEAD_APPROVED') return { next: 'DEAN_APPROVED', deanAt: 'هم‌اکنون' };
  if (status === 'DEAN_APPROVED') return { next: 'FINANCE_SETTLED', settledAt: 'هم‌اکنون' };
  return { next: status };
}

export function payrollReducer(state: PayrollState, action: PayrollAction): PayrollState {
  switch (action.type) {
    case 'SET_TAB':
      return { ...state, activeTab: action.payload };
    case 'SET_TOAST':
      return { ...state, toastMessage: action.payload };
    case 'SET_SEARCH':
      return { ...state, searchQuery: action.payload };
    case 'SET_CONTRACT_FILTER':
      return { ...state, contractFilter: action.payload };
    case 'SET_STATUS_FILTER':
      return { ...state, statusFilter: action.payload };
    case 'SET_PAYMENT_POLICY':
      return { ...state, paymentPolicy: action.payload };
    case 'SET_SLIP':
      return { ...state, detailedPayslipRecord: action.payload };
    case 'SET_DECREE':
      return { ...state, selectedDecreeForView: action.payload };
    case 'TOGGLE_TAMIN_SYNC':
      return { ...state, globalTaminSyncEnabled: !state.globalTaminSyncEnabled };

    case 'RECALCULATE_ALL':
      return {
        ...state,
        payrollRecords: state.payrollRecords.map(r => {
          const gross = r.overloadUnits * r.baseRatePerUnit;
          const tax = gross * r.taxRate;
          const deductions = tax + r.classAbsencePenaltyAmount + r.examAbsencePenaltyAmount + r.lateGradePenaltyAmount;
          const net = Math.max(0, gross - deductions);
          return {
            ...r,
            grossAmount: gross,
            taxAmount: tax,
            totalDeductions: deductions,
            netAmount: net,
            computedAt: 'هم‌اکنون (محاسبه آنلاین)',
          };
        }),
      };

    case 'APPROVE_STAGE':
      return {
        ...state,
        payrollRecords: state.payrollRecords.map(r => {
          if (r.id !== action.payload) return r;
          const { next, deptAt, deanAt, settledAt } = nextPayrollStatus(r.status);
          return {
            ...r,
            status: next,
            approvedByDeptHeadAt: deptAt ?? r.approvedByDeptHeadAt,
            approvedByDeanAt: deanAt ?? r.approvedByDeanAt,
            settledAt: settledAt ?? r.settledAt,
          };
        }),
      };

    case 'BATCH_SETTLE':
      return {
        ...state,
        payrollRecords: state.payrollRecords.map(r =>
          r.status === 'DEAN_APPROVED' && r.gradesFinalized && r.contractSigned
            ? { ...r, status: 'FINANCE_SETTLED' as PayrollStatus, settledAt: 'هم‌اکنون' }
            : r
        ),
      };

    case 'UPDATE_BASE_RATE':
      return {
        ...state,
        baseRates: state.baseRates.map(b =>
          b.id === action.payload.id
            ? { ...b, ratePerUnit: action.payload.newRate, ratePerHour: Math.round(action.payload.newRate / 16) }
            : b
        ),
      };

    case 'UPDATE_MULTIPLIER':
      return {
        ...state,
        multipliers: state.multipliers.map(m =>
          m.id === action.payload.id ? { ...m, multiplier: action.payload.newMul } : m
        ),
      };

    case 'SET_EXAM_AGGREGATIONS':
      return { ...state, courseExamAggregations: action.payload(state.courseExamAggregations) };

    case 'SET_PROF_FINANCIAL_SETTINGS':
      return { ...state, profFinancialSettings: action.payload(state.profFinancialSettings) };

    default:
      return state;
  }
}

/** نمایش پیام کوتاه با پاک‌سازی خودکار (همان showToast قبلی) */
export function flashToast(dispatch: PayrollDispatch, message: string, ms = 6000) {
  dispatch({ type: 'SET_TOAST', payload: message });
  setTimeout(() => dispatch({ type: 'SET_TOAST', payload: null }), ms);
}

/** قرارداد اکشن‌های در دسترس تب‌ها (در شل به dispatch باند می‌شوند) */
export interface PayrollApi {
  showToast: (msg: string) => void;
  handleRecalculateAll: () => void;
  handleApproveStage: (id: number) => void;
  handleBatchSettle: () => void;
  handleExportBankDiskette: () => void;
  handleBatchGenerateDecrees: () => void;
  handleSendDecreeReminder: (profName: string) => void;
  handleUpdateBaseRate: (id: number, newRate: number) => void;
  handleUpdateMultiplier: (id: number, newMul: number) => void;
  setContractFilter: (v: string) => void;
  setStatusFilter: (v: string) => void;
  setSearchQuery: (v: string) => void;
  setDetailedPayslipRecord: (r: ProfessorPayrollRecord | null) => void;
  setSelectedDecreeForView: (d: TeachingAppointmentDecree | null) => void;
  setGlobalTaminSyncEnabled: (b?: boolean) => void;
  setPaymentPolicy: (v: 'FULL_TERM_END' | 'MILESTONE_INSTALLMENTS') => void;
  setCourseExamAggregations: (updater: (prev: CourseExamAggregationItem[]) => CourseExamAggregationItem[]) => void;
  setProfFinancialSettings: (updater: (prev: ProfFinancialSettingItem[]) => ProfFinancialSettingItem[]) => void;
  setActiveTab: (t: PayrollTabType) => void;
  setToastMessage: (m: string | null) => void;
}
