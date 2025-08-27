import { z } from 'zod';

// User and Profile Types
export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  subscriptionTier: z.enum(['solo', 'pair', 'squad']),
  deviceCount: z.number().default(0),
  dailyExecutions: z.number().default(0),
  apiKeys: z.record(z.string()).optional(),
  createdAt: z.date(),
  lastActive: z.date()
});

export const PersonalDataSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().email(),
  phone: z.string().optional(),
  address: z.object({
    street: z.string(),
    city: z.string(),
    state: z.string(),
    zipCode: z.string(),
    country: z.string()
  }).optional(),
  dateOfBirth: z.date().optional(),
  customFields: z.record(z.any()).optional()
});

export const ClientProfileSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  personalData: PersonalDataSchema,
  preferences: z.record(z.any()).optional(),
  createdAt: z.date(),
  updatedAt: z.date()
});

// Form and Template Types
export const FormFieldSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['text', 'email', 'password', 'number', 'tel', 'phone', 'url', 'textarea', 'select', 'checkbox', 'radio', 'date']),
  selector: z.string(),
  label: z.string(),
  required: z.boolean().default(false),
  validationPattern: z.string().optional(),
  defaultValue: z.string().optional()
});

export const FormTemplateSchema = z.object({
  id: z.string(),
  url: z.string(),
  domain: z.string(),
  formType: z.string(),
  fields: z.array(FormFieldSchema),
  selectors: z.record(z.string()),
  validationRules: z.array(z.record(z.any())).optional(),
  successRate: z.number().default(0),
  lastUpdated: z.date(),
  version: z.number().default(1)
});

// Execution Types
export const ExecutionResultSchema = z.object({
  url: z.string(),
  status: z.enum(['success', 'failure', 'partial']),
  filledFields: z.number(),
  totalFields: z.number(),
  executionTime: z.number(),
  errorMessage: z.string().optional(),
  screenshotPath: z.string().optional()
});

export const ExecutionSessionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  profileId: z.string(),
  urls: z.array(z.string()),
  status: z.enum(['pending', 'running', 'completed', 'failed']),
  startTime: z.date(),
  endTime: z.date().optional(),
  results: z.array(ExecutionResultSchema),
  errors: z.array(z.record(z.any()))
});

// Communication Types
export const CommandSchema = z.object({
  type: z.string(),
  payload: z.record(z.any()),
  timestamp: z.date(),
  requestId: z.string()
});

export const ResponseSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  error: z.string().optional(),
  requestId: z.string()
});

// Form Detection Types - Note: These use runtime types for DOM elements
export interface DetectedField {
  element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  type: string;
  name: string;
  label: string;
  selector: string;
  required: boolean;
  placeholder?: string;
  validationPattern?: string;
}

export interface DetectedForm {
  element: HTMLFormElement;
  fields: DetectedField[];
  submitButtons: HTMLElement[];
  formType: 'registration' | 'login' | 'contact' | 'checkout' | 'profile' | 'survey' | 'unknown';
  confidence: number;
}

export interface FormAnalysisResult {
  forms: DetectedForm[];
  totalFields: number;
  confidence: number;
  analysisTime: number;
}

export const SelectorValidationResultSchema = z.object({
  selector: z.string(),
  isValid: z.boolean(),
  isUnique: z.boolean(),
  elementCount: z.number(),
  confidence: z.number()
});

export const TemplateSearchCriteriaSchema = z.object({
  domain: z.string().optional(),
  url: z.string().optional(),
  formType: z.enum(['registration', 'login', 'contact', 'checkout', 'profile', 'survey', 'unknown']).optional(),
  minSuccess: z.number().optional(),
  maxAge: z.number().optional() // Duration in milliseconds
});

export const TemplateMetricsSchema = z.object({
  totalTemplates: z.number(),
  templatesByDomain: z.record(z.number()),
  templatesByType: z.record(z.number()),
  averageSuccess: z.number(),
  lastUpdated: z.date()
});

// Export inferred types
export type User = z.infer<typeof UserSchema>;
export type PersonalData = z.infer<typeof PersonalDataSchema>;
export type ClientProfile = z.infer<typeof ClientProfileSchema>;
export type FormField = z.infer<typeof FormFieldSchema>;
export type FormTemplate = z.infer<typeof FormTemplateSchema>;
export type ExecutionResult = z.infer<typeof ExecutionResultSchema>;
export type ExecutionSession = z.infer<typeof ExecutionSessionSchema>;
export type Command = z.infer<typeof CommandSchema>;
export type Response = z.infer<typeof ResponseSchema>;

// Form Detection Types are defined as interfaces above
export type SelectorValidationResult = z.infer<typeof SelectorValidationResultSchema>;
export type TemplateSearchCriteria = z.infer<typeof TemplateSearchCriteriaSchema>;
export type TemplateMetrics = z.infer<typeof TemplateMetricsSchema>;