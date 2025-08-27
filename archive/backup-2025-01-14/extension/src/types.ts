export interface Address {
  street?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
}

export interface PersonalData {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  dateOfBirth?: Date;
  address?: Address;
  customFields?: Record<string, any>;
}

export interface ClientProfile {
  id: string;
  name: string;
  personalData: PersonalData;
  preferences?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface FormField {
  name: string;
  type: string;
  selector: string;
  label: string;
  required: boolean;
  placeholder?: string;
}

export interface FormDetectionResult {
  selector: string;
  action?: string;
  method?: string;
  fields: FormField[];
}

export interface FillResult {
  filledFields: number;
  totalFields: number;
  successRate: number;
}

export interface TrainingResult {
  message: string;
  formsAnalyzed: number;
}