import { ClientProfile, FormField, FormTemplate } from './types';
import { FormDetector, DetectedForm, DetectedField } from './form-detection';

/**
 * Profile-based form filler for intelligent form completion using client profiles
 */

export interface ProfileFormFillerConfig {
  autoDetectFields: boolean;
  useAIMapping: boolean;
  verifySubmission: boolean;
  maxRetries: number;
  retryDelay: number; // milliseconds
  submissionTimeout: number; // milliseconds
  fieldMappingTimeout: number; // milliseconds
}

export interface ProfileFillResult {
  success: boolean;
  profileId: string;
  templateUsed?: FormTemplate;
  fieldMappings: Record<string, string>;
  unmappedFields: string[];
  submissionResult?: SubmissionResult;
  confidence: number;
  filledFields: number;
  totalFields: number;
  executionTime: number;
  errors: string[];
}

export interface SubmissionResult {
  success: boolean;
  submissionTime: number;
  redirectUrl?: string;
  successIndicators: string[];
  errorMessages: string[];
  statusCode?: number;
}

export interface FieldMapping {
  fieldName: string;
  profileField: string;
  value: string;
  confidence: number;
}

export class ProfileFormFiller {
  private formDetector: FormDetector;
  private fieldMapper: FieldMapper;
  private config: ProfileFormFillerConfig;

  constructor(config?: Partial<ProfileFormFillerConfig>) {
    this.formDetector = new FormDetector();
    this.fieldMapper = new FieldMapper();
    this.config = {
      autoDetectFields: true,
      useAIMapping: false,
      verifySubmission: true,
      maxRetries: 3,
      retryDelay: 2000,
      submissionTimeout: 30000,
      fieldMappingTimeout: 10000,
      ...config
    };
  }

  /**
   * Fills a form using a client profile
   */
  public async fillFormWithProfile(
    profile: ClientProfile,
    template?: FormTemplate
  ): Promise<ProfileFillResult> {
    const startTime = performance.now();

    try {
      // If no template provided, detect forms on current page
      let formTemplate = template;
      if (!formTemplate && this.config.autoDetectFields) {
        const analysis = this.formDetector.analyzePage();
        if (analysis.forms.length === 0) {
          throw new Error('No forms detected on page');
        }

        // Use the form with highest confidence
        const bestForm = analysis.forms[0];
        formTemplate = this.generateTemplateFromDetectedForm(bestForm);
      }

      if (!formTemplate) {
        throw new Error('No template available and auto-detection disabled');
      }

      // Map profile data to form fields
      const { mappings, unmappedFields } = this.fieldMapper.mapProfileToFields(
        profile,
        formTemplate.fields
      );

      // Fill the form
      const fillResult = await this.fillFormFields(mappings, formTemplate);

      // Calculate confidence
      const confidence = this.calculateMappingConfidence(mappings, formTemplate.fields);

      const result: ProfileFillResult = {
        success: fillResult.success,
        profileId: profile.id,
        templateUsed: formTemplate,
        fieldMappings: mappings,
        unmappedFields,
        confidence,
        filledFields: fillResult.filledFields,
        totalFields: formTemplate.fields.length,
        executionTime: performance.now() - startTime,
        errors: fillResult.errors
      };

      // Submit form if configured to do so
      if (this.config.verifySubmission && fillResult.success) {
        try {
          const submissionResult = await this.submitAndVerify(formTemplate);
          result.submissionResult = submissionResult;
        } catch (error) {
          result.errors.push(`Submission failed: ${error}`);
        }
      }

      return result;
    } catch (error) {
      return {
        success: false,
        profileId: profile.id,
        fieldMappings: {},
        unmappedFields: [],
        confidence: 0,
        filledFields: 0,
        totalFields: 0,
        executionTime: performance.now() - startTime,
        errors: [error instanceof Error ? error.message : String(error)]
      };
    }
  }

  /**
   * Generates a template from a detected form
   */
  private generateTemplateFromDetectedForm(detectedForm: DetectedForm): FormTemplate {
    const url = window.location.href;
    const domain = window.location.hostname;

    return {
      id: `template_${domain.replace(/\./g, '_')}_${detectedForm.formType}_${Date.now()}`,
      url,
      domain,
      formType: detectedForm.formType,
      fields: detectedForm.fields.map((field: DetectedField) => ({
        id: `field_${field.name}_${Date.now()}`,
        name: field.name,
        type: field.type as any,
        selector: field.selector,
        label: field.label,
        required: field.required,
        validationPattern: field.validationPattern,
        defaultValue: field.placeholder
      })),
      selectors: detectedForm.fields.reduce((acc: Record<string, string>, field: DetectedField) => {
        acc[field.name] = field.selector;
        return acc;
      }, {} as Record<string, string>),
      validationRules: [],
      successRate: 0,
      lastUpdated: new Date(),
      version: 1
    };
  }

  /**
   * Fills form fields with mapped values
   */
  private async fillFormFields(
    mappings: Record<string, string>,
    template: FormTemplate
  ): Promise<{ success: boolean; filledFields: number; errors: string[] }> {
    const errors: string[] = [];
    let filledFields = 0;

    for (const field of template.fields) {
      const value = mappings[field.name];
      if (!value) {
        continue;
      }

      try {
        const element = document.querySelector(field.selector);
        if (!element) {
          errors.push(`Element not found for selector: ${field.selector}`);
          continue;
        }

        await this.fillElement(element as HTMLElement, value, field.type);
        filledFields++;

        // Add small delay between field fills
        await this.delay(100);
      } catch (error) {
        errors.push(`Failed to fill field ${field.name}: ${error}`);
      }
    }

    return {
      success: filledFields > 0 && errors.length === 0,
      filledFields,
      errors
    };
  }

  /**
   * Fills a single form element
   */
  private async fillElement(element: HTMLElement, value: string, fieldType: string): Promise<void> {
    if (element instanceof HTMLInputElement) {
      switch (fieldType) {
        case 'checkbox':
          element.checked = value === 'true' || value === '1' || value.toLowerCase() === 'yes';
          break;
        case 'radio':
          if (element.value === value) {
            element.checked = true;
          }
          break;
        default:
          element.value = value;
          break;
      }
    } else if (element instanceof HTMLSelectElement) {
      // Try to select by value first, then by text
      const option = Array.from(element.options).find(
        opt => opt.value === value || opt.text === value
      );
      if (option) {
        element.selectedIndex = option.index;
      }
    } else if (element instanceof HTMLTextAreaElement) {
      element.value = value;
    }

    // Trigger events to notify the page of changes
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /**
   * Submits the form and verifies successful submission
   */
  private async submitAndVerify(template: FormTemplate): Promise<SubmissionResult> {
    const startTime = performance.now();
    const currentUrl = window.location.href;

    // Find and click submit button
    const submitButton = this.findSubmitButton();
    if (!submitButton) {
      throw new Error('No submit button found');
    }

    submitButton.click();

    // Wait for navigation or response
    await this.delay(2000);

    // Check for success/error indicators
    const { successIndicators, errorMessages } = this.checkSubmissionResult();

    const newUrl = window.location.href;
    const success = errorMessages.length === 0 && (newUrl !== currentUrl || successIndicators.length > 0);

    return {
      success,
      submissionTime: performance.now() - startTime,
      redirectUrl: newUrl !== currentUrl ? newUrl : undefined,
      successIndicators,
      errorMessages
    };
  }

  /**
   * Finds the submit button on the page
   */
  private findSubmitButton(): HTMLElement | null {
    const selectors = [
      'input[type="submit"]',
      'button[type="submit"]',
      'button:not([type])', // buttons default to submit
      'button:contains("Submit")',
      'button:contains("Send")',
      'button:contains("Continue")',
      'input[value*="Submit" i]'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        return element as HTMLElement;
      }
    }

    return null;
  }

  /**
   * Checks the page for success or error indicators
   */
  private checkSubmissionResult(): { successIndicators: string[]; errorMessages: string[] } {
    const successIndicators: string[] = [];
    const errorMessages: string[] = [];

    // Success selectors
    const successSelectors = [
      '.success', '.alert-success', '.message-success',
      '[class*="success"]', '[id*="success"]',
      '.confirmation', '.thank-you', '.complete'
    ];

    // Error selectors
    const errorSelectors = [
      '.error', '.alert-error', '.message-error',
      '[class*="error"]', '[id*="error"]',
      '.warning', '.alert-warning', '.invalid'
    ];

    // Check for success indicators
    successSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        const text = element.textContent?.trim();
        if (text) {
          successIndicators.push(text);
        }
      });
    });

    // Check for error indicators
    errorSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        const text = element.textContent?.trim();
        if (text) {
          errorMessages.push(text);
        }
      });
    });

    // Check page title
    const title = document.title.toLowerCase();
    if (title.includes('success') || title.includes('thank') || title.includes('complete')) {
      successIndicators.push(`Title: ${document.title}`);
    }
    if (title.includes('error') || title.includes('failed')) {
      errorMessages.push(`Title: ${document.title}`);
    }

    return { successIndicators, errorMessages };
  }

  /**
   * Calculates confidence based on mapping success
   */
  private calculateMappingConfidence(mappings: Record<string, string>, fields: FormField[]): number {
    if (fields.length === 0) return 0;

    const mappedCount = fields.filter(field => mappings[field.name]).length;
    return (mappedCount / fields.length) * 100;
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Field mapper for mapping profile data to form fields
 */
export class FieldMapper {
  private fieldPatterns: Record<string, RegExp[]>;

  constructor() {
    this.fieldPatterns = this.initializePatterns();
  }

  /**
   * Maps profile data to form fields
   */
  public mapProfileToFields(
    profile: ClientProfile,
    fields: FormField[]
  ): { mappings: Record<string, string>; unmappedFields: string[] } {
    const mappings: Record<string, string> = {};
    const unmappedFields: string[] = [];

    const profileData = this.extractProfileData(profile);

    for (const field of fields) {
      let mapped = false;

      // Try to map based on field name and label
      for (const [profileField, value] of Object.entries(profileData)) {
        if (!value) continue; // Skip empty values

        if (this.matchesField(field, profileField)) {
          mappings[field.name] = value;
          mapped = true;
          break;
        }
      }

      // Handle special cases
      if (!mapped) {
        const specialValue = this.handleSpecialField(field, profile);
        if (specialValue) {
          mappings[field.name] = specialValue;
          mapped = true;
        }
      }

      if (!mapped) {
        unmappedFields.push(field.name);
      }
    }

    return { mappings, unmappedFields };
  }

  /**
   * Extracts profile data into a flat structure
   */
  private extractProfileData(profile: ClientProfile): Record<string, string> {
    return {
      firstName: profile.personalData.firstName,
      lastName: profile.personalData.lastName,
      email: profile.personalData.email,
      phone: profile.personalData.phone || '',
      address: profile.personalData.address?.street || '',
      city: profile.personalData.address?.city || '',
      state: profile.personalData.address?.state || '',
      zipCode: profile.personalData.address?.zipCode || '',
      country: profile.personalData.address?.country || ''
    };
  }

  /**
   * Checks if a form field matches a profile field type
   */
  private matchesField(field: FormField, profileFieldType: string): boolean {
    const patterns = this.fieldPatterns[profileFieldType];
    if (!patterns) return false;

    // Check field name
    for (const pattern of patterns) {
      if (pattern.test(field.name)) return true;
    }

    // Check field label
    for (const pattern of patterns) {
      if (pattern.test(field.label)) return true;
    }

    // Check field type for email and tel
    if (profileFieldType === 'email' && field.type === 'email') return true;
    if (profileFieldType === 'phone' && (field.type === 'tel' || field.type === 'phone')) return true;

    return false;
  }

  /**
   * Handles special field types that need custom logic
   */
  private handleSpecialField(field: FormField, profile: ClientProfile): string {
    const fieldName = field.name.toLowerCase();
    const fieldLabel = field.label.toLowerCase();

    // Handle full name fields
    if (fieldName.includes('fullname') || fieldLabel.includes('full name')) {
      return `${profile.personalData.firstName} ${profile.personalData.lastName}`;
    }

    // Handle generic name fields
    if (fieldName === 'name' || fieldLabel === 'name') {
      return `${profile.personalData.firstName} ${profile.personalData.lastName}`;
    }

    // Handle date of birth
    if (fieldName.includes('birth') || fieldLabel.includes('birth') ||
        fieldName.includes('dob') || fieldLabel.includes('date of birth')) {
      return profile.personalData.dateOfBirth?.toISOString().split('T')[0] || '';
    }

    // Handle custom fields
    if (profile.personalData.customFields) {
      for (const [key, value] of Object.entries(profile.personalData.customFields)) {
        if (fieldName.includes(key.toLowerCase()) || fieldLabel.includes(key.toLowerCase())) {
          return String(value);
        }
      }
    }

    return '';
  }

  /**
   * Initializes field mapping patterns
   */
  private initializePatterns(): Record<string, RegExp[]> {
    const patterns: Record<string, string[]> = {
      firstName: [
        '^first.*name$', '^fname$', '^given.*name$',
        '^forename$', '^prenom$', '^nombre$'
      ],
      lastName: [
        '^last.*name$', '^lname$', '^surname$',
        '^family.*name$', '^apellido$', '^nom$'
      ],
      email: [
        'email', 'e.mail', 'mail',
        'correo', 'courriel'
      ],
      phone: [
        'phone', 'tel', 'mobile', 'cell',
        'telefono', 'telephone', 'numero'
      ],
      address: [
        'address', 'street', 'addr',
        'direccion', 'adresse', 'rue'
      ],
      city: [
        'city', 'town', 'ciudad',
        'ville', 'locality'
      ],
      state: [
        'state', 'province', 'region',
        'estado', 'provincia', 'departement'
      ],
      zipCode: [
        'zip', 'postal', 'postcode',
        'codigo.*postal', 'code.*postal'
      ],
      country: [
        'country', 'nation', 'pais',
        'pays', 'nationality'
      ]
    };

    const regexPatterns: Record<string, RegExp[]> = {};
    for (const [fieldType, patternStrings] of Object.entries(patterns)) {
      regexPatterns[fieldType] = patternStrings.map(pattern => new RegExp(pattern, 'i'));
    }

    return regexPatterns;
  }

  /**
   * Validates field mappings
   */
  public validateFieldMapping(mappings: Record<string, string>, fields: FormField[]): string[] {
    const warnings: string[] = [];

    for (const field of fields) {
      const value = mappings[field.name];
      if (value === undefined) {
        if (field.required) {
          warnings.push(`Required field ${field.name} is not mapped`);
        }
        continue;
      }

      // Check required fields for empty values
      if (field.required && value.trim() === '') {
        warnings.push(`Required field ${field.name} is empty`);
        continue;
      }

      // Validate email format
      if (field.type === 'email' && value.trim() !== '') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
          warnings.push(`Invalid email format for field ${field.name}: ${value}`);
        }
      }

      // Validate phone format
      if ((field.type === 'tel' || field.type === 'phone') && value.trim() !== '') {
        const phoneRegex = /^[\d\s\-\(\)\+]+$/;
        if (!phoneRegex.test(value)) {
          warnings.push(`Invalid phone format for field ${field.name}: ${value}`);
        }
      }
    }

    return warnings;
  }
}