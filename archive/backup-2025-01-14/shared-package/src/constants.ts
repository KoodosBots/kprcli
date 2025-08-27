// Subscription tier limits
export const SUBSCRIPTION_LIMITS = {
  solo: {
    maxDevices: 1,
    dailyExecutions: 10,
    features: ['basic_filling']
  },
  pair: {
    maxDevices: 2,
    dailyExecutions: 30,
    features: ['basic_filling', 'cloud_sync', 'unlimited_profiles']
  },
  squad: {
    maxDevices: 3,
    dailyExecutions: 60,
    features: ['basic_filling', 'cloud_sync', 'unlimited_profiles', 'javascript_rules', 'ai_training', 'telegram_bot']
  }
} as const;

// Error types
export const ERROR_TYPES = {
  NETWORK_ERROR: 'network_error',
  FORM_NOT_FOUND: 'form_not_found',
  FIELD_NOT_FOUND: 'field_not_found',
  VALIDATION_FAILED: 'validation_failed',
  CAPTCHA_FAILED: 'captcha_failed',
  TIMEOUT_ERROR: 'timeout_error',
  RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded',
  AUTHENTICATION_FAILED: 'authentication_failed',
  SYSTEM_RESOURCE_ERROR: 'system_resource_error'
} as const;

// Command types for inter-component communication
export const COMMAND_TYPES = {
  FILL_FORM: 'fill_form',
  TRAIN_FORM: 'train_form',
  GET_PROFILES: 'get_profiles',
  CREATE_PROFILE: 'create_profile',
  UPDATE_PROFILE: 'update_profile',
  DELETE_PROFILE: 'delete_profile',
  START_EXECUTION: 'start_execution',
  STOP_EXECUTION: 'stop_execution',
  GET_STATUS: 'get_status'
} as const;

// Default timeouts (in milliseconds)
export const TIMEOUTS = {
  PAGE_LOAD: 30000,
  ELEMENT_WAIT: 10000,
  FORM_FILL: 5000,
  CAPTCHA_SOLVE: 60000
} as const;

// Browser automation settings
export const BROWSER_CONFIG = {
  headless: true,
  defaultViewport: {
    width: 1920,
    height: 1080
  },
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
} as const;