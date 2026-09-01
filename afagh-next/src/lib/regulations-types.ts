// ════════════════════════════════════════════════════════════════════════════
// تایپ‌ها و الگوهای پیش‌فرض آیین‌نامه‌های آموزشی (Pure Types & Presets)
// ════════════════════════════════════════════════════════════════════════════

export interface RegulationConfig {
  regular_term_rules: {
    min_units: number;
    max_units: number;
    probation_max_units: number;
    honors_min_gpa: number;
    honors_max_units: number;
  };
  summer_term_rules: {
    default_max_units: number;
    graduating_max_units: number;
  };
  graduating_term_rules: {
    can_take_with_probation: boolean;
    max_units: number;
    auto_corequisite_allowed: boolean;
  };
  probation_and_tenure: {
    probation_gpa_threshold: number; // مرز مشروطی (۱۲ برای لیسانس، ۱۴ برای ارشد)
    max_consecutive_probations: number; // حداکثر مشروطی متوالی (۳)
    max_total_probations: number; // حداکثر مشروطی متناوب (۴)
    max_study_semesters: number; // سقف سنوات عادی (۸ لیسانس، ۴ ارشد)
  };
  grading_and_gpa: {
    failed_course_gpa_policy: 'EXCLUDE_IF_PASSED' | 'KEEP_ALWAYS'; // حذف نمره ردی پس از قبولی یا ابقا
    default_passing_grade: number; // کف قبولی عادی (۱۰ برای لیسانس، ۱۲ برای ارشد)
  };
  quota_overrides?: {
    [quotaName: string]: {
      summer_term_rules?: {
        default_max_units?: number;
      };
      probation_max_units?: number;
      extra_allowed_semesters?: number;
    };
  };
}

export const DEFAULT_BACHELOR_REGULATION_1403: RegulationConfig = {
  regular_term_rules: {
    min_units: 12,
    max_units: 20,
    probation_max_units: 14,
    honors_min_gpa: 17.0,
    honors_max_units: 24,
  },
  summer_term_rules: {
    default_max_units: 6,
    graduating_max_units: 8,
  },
  graduating_term_rules: {
    can_take_with_probation: true,
    max_units: 24,
    auto_corequisite_allowed: true,
  },
  probation_and_tenure: {
    probation_gpa_threshold: 12.0,
    max_consecutive_probations: 3,
    max_total_probations: 4,
    max_study_semesters: 8,
  },
  grading_and_gpa: {
    failed_course_gpa_policy: 'EXCLUDE_IF_PASSED', // آیین‌نامه مصوب ۱۳۹۷ به بعد
    default_passing_grade: 10.0,
  },
  quota_overrides: {
    SHAHED_ISARGAR: {
      summer_term_rules: {
        default_max_units: 8,
      },
      probation_max_units: 14,
      extra_allowed_semesters: 2,
    },
    ELITE: {
      summer_term_rules: {
        default_max_units: 8,
      },
    },
  },
};

export const DEFAULT_BACHELOR_REGULATION_1390: RegulationConfig = {
  regular_term_rules: {
    min_units: 12,
    max_units: 20,
    probation_max_units: 14,
    honors_min_gpa: 17.0,
    honors_max_units: 24,
  },
  summer_term_rules: {
    default_max_units: 6,
    graduating_max_units: 8,
  },
  graduating_term_rules: {
    can_take_with_probation: false,
    max_units: 20,
    auto_corequisite_allowed: false,
  },
  probation_and_tenure: {
    probation_gpa_threshold: 12.0,
    max_consecutive_probations: 3,
    max_total_probations: 4,
    max_study_semesters: 10,
  },
  grading_and_gpa: {
    failed_course_gpa_policy: 'KEEP_ALWAYS', // آیین‌نامه سال ۱۳۹۰: نمره ردی همیشه در معدل کل باقی می‌ماند
    default_passing_grade: 10.0,
  },
  quota_overrides: {
    SHAHED_ISARGAR: {
      summer_term_rules: {
        default_max_units: 8,
      },
    },
  },
};

export const DEFAULT_MASTER_REGULATION_1403: RegulationConfig = {
  regular_term_rules: {
    min_units: 8,
    max_units: 14,
    probation_max_units: 10,
    honors_min_gpa: 17.0,
    honors_max_units: 16,
  },
  summer_term_rules: {
    default_max_units: 4,
    graduating_max_units: 6,
  },
  graduating_term_rules: {
    can_take_with_probation: true,
    max_units: 14,
    auto_corequisite_allowed: true,
  },
  probation_and_tenure: {
    probation_gpa_threshold: 14.0, // مرز مشروطی ارشد
    max_consecutive_probations: 2,
    max_total_probations: 2,
    max_study_semesters: 4, // ۴ نیمسال عادی
  },
  grading_and_gpa: {
    failed_course_gpa_policy: 'EXCLUDE_IF_PASSED',
    default_passing_grade: 12.0, // کف قبولی ارشد
  },
};
