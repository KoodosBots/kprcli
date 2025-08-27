import { FormField, FormTemplate, DetectedField, DetectedForm, FormAnalysisResult } from './types';

/**
 * Form detection and analysis utilities for identifying and parsing web forms
 */

// Re-export types for external use
export type { DetectedField, DetectedForm, FormAnalysisResult };

export type FormType = 'registration' | 'login' | 'contact' | 'checkout' | 'profile' | 'survey' | 'unknown';

export const FormType = {
  REGISTRATION: 'registration' as const,
  LOGIN: 'login' as const,
  CONTACT: 'contact' as const,
  CHECKOUT: 'checkout' as const,
  PROFILE: 'profile' as const,
  SURVEY: 'survey' as const,
  UNKNOWN: 'unknown' as const
} as const;

/**
 * Main form detector class for analyzing web pages
 */
export class FormDetector {
  private readonly fieldTypePatterns: Map<string, RegExp[]>;
  private readonly formTypePatterns: Map<FormType, RegExp[]>;

  constructor() {
    this.fieldTypePatterns = this.initializeFieldTypePatterns();
    this.formTypePatterns = this.initializeFormTypePatterns();
  }

  /**
   * Analyzes the current page for forms and returns detailed analysis
   */
  public analyzePage(): FormAnalysisResult {
    const startTime = performance.now();
    const forms = this.detectForms();
    const totalFields = forms.reduce((sum, form) => sum + form.fields.length, 0);
    const confidence = this.calculateOverallConfidence(forms);
    const analysisTime = performance.now() - startTime;

    return {
      forms,
      totalFields,
      confidence,
      analysisTime
    };
  }

  /**
   * Detects all forms on the current page
   */
  public detectForms(): DetectedForm[] {
    const formElements = document.querySelectorAll('form');
    const detectedForms: DetectedForm[] = [];

    formElements.forEach(formElement => {
      const fields = this.analyzeFormFields(formElement);
      const submitButtons = this.findSubmitButtons(formElement);
      const formType = this.classifyFormType(formElement, fields);
      const confidence = this.calculateFormConfidence(formElement, fields);

      detectedForms.push({
        element: formElement,
        fields,
        submitButtons,
        formType,
        confidence
      });
    });

    // Also detect forms without <form> tags (common in SPAs)
    const implicitForms = this.detectImplicitForms();
    detectedForms.push(...implicitForms);

    return detectedForms.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Analyzes form fields within a form element
   */
  private analyzeFormFields(formElement: HTMLFormElement): DetectedField[] {
    const fieldSelectors = [
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"])',
      'select',
      'textarea'
    ];

    const fields: DetectedField[] = [];
    
    fieldSelectors.forEach(selector => {
      const elements = formElement.querySelectorAll(selector);
      elements.forEach(element => {
        const field = this.analyzeField(element as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement);
        if (field) {
          fields.push(field);
        }
      });
    });

    return fields;
  }

  /**
   * Analyzes a single form field
   */
  private analyzeField(element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): DetectedField | null {
    const type = this.determineFieldType(element);
    const name = this.extractFieldName(element);
    const label = this.extractFieldLabel(element);
    const selector = this.generateSelector(element);
    const required = this.isFieldRequired(element);
    const placeholder = this.extractPlaceholder(element);
    const validationPattern = this.extractValidationPattern(element);

    if (!name && !label) {
      return null; // Skip fields without identifiable names or labels
    }

    return {
      element,
      type,
      name,
      label,
      selector,
      required,
      placeholder,
      validationPattern
    };
  }

  /**
   * Determines the semantic type of a form field
   */
  private determineFieldType(element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): string {
    // Check HTML5 input type first
    if (element instanceof HTMLInputElement && element.type) {
      return element.type;
    }

    // Check element tag name
    if (element instanceof HTMLSelectElement) {
      return 'select';
    }
    if (element instanceof HTMLTextAreaElement) {
      return 'textarea';
    }

    // Fallback to text for input elements
    return 'text';
  }

  /**
   * Extracts field name from various attributes
   */
  private extractFieldName(element: HTMLElement): string {
    return element.getAttribute('name') || 
           element.getAttribute('id') || 
           element.getAttribute('data-name') ||
           element.getAttribute('data-field') ||
           '';
  }

  /**
   * Extracts field label by looking at associated labels and nearby text
   */
  private extractFieldLabel(element: HTMLElement): string {
    // Check for associated label element
    const id = element.getAttribute('id');
    if (id) {
      const label = document.querySelector(`label[for="${id}"]`);
      if (label) {
        return label.textContent?.trim() || '';
      }
    }

    // Check for parent label
    const parentLabel = element.closest('label');
    if (parentLabel) {
      return parentLabel.textContent?.replace(element.textContent || '', '').trim() || '';
    }

    // Check for placeholder
    const placeholder = element.getAttribute('placeholder');
    if (placeholder) {
      return placeholder;
    }

    // Check for nearby text (previous sibling, parent text, etc.)
    const nearbyText = this.findNearbyText(element);
    if (nearbyText) {
      return nearbyText;
    }

    return '';
  }

  /**
   * Finds nearby text that might serve as a label
   */
  private findNearbyText(element: HTMLElement): string {
    // Check previous sibling text
    let sibling = element.previousElementSibling;
    while (sibling) {
      const text = sibling.textContent?.trim();
      if (text && text.length < 100) {
        return text;
      }
      sibling = sibling.previousElementSibling;
    }

    // Check parent element text
    const parent = element.parentElement;
    if (parent) {
      const parentText = parent.textContent?.replace(element.textContent || '', '').trim();
      if (parentText && parentText.length < 100) {
        return parentText;
      }
    }

    return '';
  }

  /**
   * Generates a robust CSS selector for the element
   */
  private generateSelector(element: HTMLElement): string {
    // Try ID first (most reliable)
    const id = element.getAttribute('id');
    if (id) {
      return `#${id}`;
    }

    // Try name attribute
    const name = element.getAttribute('name');
    if (name) {
      return `[name="${name}"]`;
    }

    // Try data attributes
    const dataName = element.getAttribute('data-name');
    if (dataName) {
      return `[data-name="${dataName}"]`;
    }

    // Generate path-based selector as fallback
    return this.generatePathSelector(element);
  }

  /**
   * Generates a path-based CSS selector
   */
  private generatePathSelector(element: HTMLElement): string {
    const path: string[] = [];
    let current: HTMLElement | null = element;

    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      
      // Add class if available and not too generic
      const classes = Array.from(current.classList).filter(cls => 
        !cls.includes('ng-') && !cls.includes('v-') && cls.length < 20
      );
      if (classes.length > 0) {
        selector += '.' + classes.join('.');
      }

      // Add nth-child if needed for uniqueness
      const siblings = Array.from(current.parentElement?.children || [])
        .filter(sibling => sibling.tagName === current!.tagName);
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += `:nth-child(${index})`;
      }

      path.unshift(selector);
      current = current.parentElement;
    }

    return path.join(' > ');
  }

  /**
   * Checks if a field is required
   */
  private isFieldRequired(element: HTMLElement): boolean {
    return element.hasAttribute('required') ||
           element.getAttribute('aria-required') === 'true' ||
           element.classList.contains('required') ||
           this.hasRequiredIndicator(element);
  }

  /**
   * Checks for visual required indicators (asterisks, etc.)
   */
  private hasRequiredIndicator(element: HTMLElement): boolean {
    const parent = element.parentElement;
    if (!parent) return false;

    const text = parent.textContent || '';
    return text.includes('*') || text.includes('required');
  }

  /**
   * Extracts placeholder text
   */
  private extractPlaceholder(element: HTMLElement): string | undefined {
    return element.getAttribute('placeholder') || undefined;
  }

  /**
   * Extracts validation pattern from various sources
   */
  private extractValidationPattern(element: HTMLElement): string | undefined {
    // HTML5 pattern attribute
    const pattern = element.getAttribute('pattern');
    if (pattern) {
      return pattern;
    }

    // Common validation based on field type/name
    const name = this.extractFieldName(element).toLowerCase();
    const type = element.getAttribute('type')?.toLowerCase();

    if (type === 'email' || name.includes('email')) {
      return '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$';
    }

    if (type === 'tel' || name.includes('phone') || name.includes('tel')) {
      return '^[\\d\\s\\-\\(\\)\\+]+$';
    }

    return undefined;
  }

  /**
   * Finds submit buttons within a form
   */
  private findSubmitButtons(formElement: HTMLFormElement): HTMLElement[] {
    const submitSelectors = [
      'input[type="submit"]',
      'button[type="submit"]',
      'button:not([type])', // buttons default to submit
      'input[type="button"][value*="submit" i]',
      'button:has-text("submit")',
      'button:has-text("send")',
      'button:has-text("continue")',
      'button:has-text("next")',
      'button:has-text("register")',
      'button:has-text("sign up")',
      'button:has-text("login")',
      'button:has-text("sign in")'
    ];

    const buttons: HTMLElement[] = [];
    
    submitSelectors.forEach(selector => {
      try {
        const elements = formElement.querySelectorAll(selector);
        elements.forEach(element => {
          if (!buttons.includes(element as HTMLElement)) {
            buttons.push(element as HTMLElement);
          }
        });
      } catch (e) {
        // Skip invalid selectors
      }
    });

    return buttons;
  }

  /**
   * Classifies the type of form based on fields and context
   */
  private classifyFormType(formElement: HTMLFormElement, fields: DetectedField[]): FormType {
    const fieldNames = fields.map(f => f.name.toLowerCase());
    const fieldLabels = fields.map(f => f.label.toLowerCase()).join(' ');
    const formText = formElement.textContent?.toLowerCase() || '';

    // Registration form patterns
    if (this.matchesPatterns(fieldNames.concat([fieldLabels, formText]), this.formTypePatterns.get(FormType.REGISTRATION)!)) {
      return FormType.REGISTRATION;
    }

    // Login form patterns
    if (this.matchesPatterns(fieldNames.concat([fieldLabels, formText]), this.formTypePatterns.get(FormType.LOGIN)!)) {
      return FormType.LOGIN;
    }

    // Contact form patterns
    if (this.matchesPatterns(fieldNames.concat([fieldLabels, formText]), this.formTypePatterns.get(FormType.CONTACT)!)) {
      return FormType.CONTACT;
    }

    // Checkout form patterns
    if (this.matchesPatterns(fieldNames.concat([fieldLabels, formText]), this.formTypePatterns.get(FormType.CHECKOUT)!)) {
      return FormType.CHECKOUT;
    }

    // Profile form patterns
    if (this.matchesPatterns(fieldNames.concat([fieldLabels, formText]), this.formTypePatterns.get(FormType.PROFILE)!)) {
      return FormType.PROFILE;
    }

    return FormType.UNKNOWN;
  }

  /**
   * Checks if any of the patterns match the given strings
   */
  private matchesPatterns(strings: string[], patterns: RegExp[]): boolean {
    return patterns.some(pattern => 
      strings.some(str => pattern.test(str))
    );
  }

  /**
   * Calculates confidence score for a form
   */
  private calculateFormConfidence(formElement: HTMLFormElement, fields: DetectedField[]): number {
    let confidence = 0;

    // Base confidence for having fields
    confidence += Math.min(fields.length * 10, 50);

    // Bonus for having labels
    const fieldsWithLabels = fields.filter(f => f.label.length > 0);
    confidence += (fieldsWithLabels.length / fields.length) * 20;

    // Bonus for having names/IDs
    const fieldsWithNames = fields.filter(f => f.name.length > 0);
    confidence += (fieldsWithNames.length / fields.length) * 15;

    // Bonus for having submit buttons
    const submitButtons = this.findSubmitButtons(formElement);
    if (submitButtons.length > 0) {
      confidence += 15;
    }

    return Math.min(confidence, 100);
  }

  /**
   * Calculates overall confidence across all forms
   */
  private calculateOverallConfidence(forms: DetectedForm[]): number {
    if (forms.length === 0) return 0;
    
    const totalConfidence = forms.reduce((sum, form) => sum + form.confidence, 0);
    return totalConfidence / forms.length;
  }

  /**
   * Detects implicit forms (forms without <form> tags)
   */
  private detectImplicitForms(): DetectedForm[] {
    // This is a simplified implementation
    // In practice, you'd look for groups of input fields that aren't in <form> tags
    return [];
  }

  /**
   * Initialize field type patterns for classification
   */
  private initializeFieldTypePatterns(): Map<string, RegExp[]> {
    return new Map([
      ['email', [/email/i, /@/]],
      ['password', [/password/i, /pass/i, /pwd/i]],
      ['phone', [/phone/i, /tel/i, /mobile/i]],
      ['name', [/name/i, /fname/i, /lname/i]],
      ['address', [/address/i, /street/i, /city/i, /state/i, /zip/i]],
    ]);
  }

  /**
   * Initialize form type patterns for classification
   */
  private initializeFormTypePatterns(): Map<FormType, RegExp[]> {
    return new Map([
      [FormType.REGISTRATION, [
        /register/i, /signup/i, /sign.up/i, /create.account/i, /join/i
      ]],
      [FormType.LOGIN, [
        /login/i, /signin/i, /sign.in/i, /log.in/i, /authenticate/i
      ]],
      [FormType.CONTACT, [
        /contact/i, /message/i, /inquiry/i, /feedback/i, /support/i
      ]],
      [FormType.CHECKOUT, [
        /checkout/i, /payment/i, /billing/i, /order/i, /purchase/i
      ]],
      [FormType.PROFILE, [
        /profile/i, /account/i, /settings/i, /personal/i, /edit/i
      ]]
    ]);
  }
}

/**
 * Selector generator utility for creating robust CSS selectors
 */
export class SelectorGenerator {
  /**
   * Generates multiple selector strategies for an element
   */
  public generateSelectors(element: HTMLElement): string[] {
    const selectors: string[] = [];

    // ID selector (highest priority)
    const id = element.getAttribute('id');
    if (id) {
      selectors.push(`#${id}`);
    }

    // Name selector
    const name = element.getAttribute('name');
    if (name) {
      selectors.push(`[name="${name}"]`);
    }

    // Data attribute selectors
    const dataAttrs = ['data-name', 'data-field', 'data-testid', 'data-cy'];
    dataAttrs.forEach(attr => {
      const value = element.getAttribute(attr);
      if (value) {
        selectors.push(`[${attr}="${value}"]`);
      }
    });

    // Class-based selector
    const classes = Array.from(element.classList).filter(cls => 
      !cls.includes('ng-') && !cls.includes('v-') && cls.length < 20
    );
    if (classes.length > 0) {
      selectors.push(`.${classes.join('.')}`);
    }

    // XPath selector
    selectors.push(this.generateXPath(element));

    return selectors;
  }

  /**
   * Validates if a selector uniquely identifies an element
   */
  public validateSelector(selector: string, targetElement: HTMLElement): boolean {
    try {
      const elements = document.querySelectorAll(selector);
      return elements.length === 1 && elements[0] === targetElement;
    } catch (e) {
      return false;
    }
  }

  /**
   * Generates XPath for an element
   */
  private generateXPath(element: HTMLElement): string {
    const path: string[] = [];
    let current: HTMLElement | null = element;

    while (current && current !== document.documentElement) {
      const tagName = current.tagName.toLowerCase();
      const siblings = Array.from(current.parentElement?.children || [])
        .filter(sibling => sibling.tagName.toLowerCase() === tagName);
      
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        path.unshift(`${tagName}[${index}]`);
      } else {
        path.unshift(tagName);
      }

      current = current.parentElement;
    }

    return '//' + path.join('/');
  }
}

/**
 * Template generator for creating reusable form templates
 */
export class TemplateGenerator {
  /**
   * Generates a form template from detected form data
   */
  public generateTemplate(detectedForm: DetectedForm, url: string): FormTemplate {
    const domain = new URL(url).hostname;
    
    const fields: FormField[] = detectedForm.fields.map(field => ({
      id: this.generateFieldId(field),
      name: field.name,
      type: field.type as 'text' | 'email' | 'password' | 'number' | 'tel' | 'url' | 'textarea' | 'select' | 'checkbox' | 'radio',
      selector: field.selector,
      label: field.label,
      required: field.required,
      validationPattern: field.validationPattern,
      defaultValue: field.placeholder
    }));

    const selectors: Record<string, string> = {};
    fields.forEach(field => {
      selectors[field.name] = field.selector;
    });

    return {
      id: this.generateTemplateId(url, detectedForm.formType),
      url,
      domain,
      formType: detectedForm.formType,
      fields,
      selectors,
      validationRules: [],
      successRate: 0,
      lastUpdated: new Date(),
      version: 1
    };
  }

  /**
   * Generates a unique field ID
   */
  private generateFieldId(field: DetectedField): string {
    return `field_${field.name}_${Date.now()}`;
  }

  /**
   * Generates a unique template ID
   */
  private generateTemplateId(url: string, formType: FormType): string {
    const domain = new URL(url).hostname.replace(/\./g, '_');
    return `template_${domain}_${formType}_${Date.now()}`;
  }
}