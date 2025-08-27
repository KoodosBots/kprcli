import { createCommand, createResponse, COMMAND_TYPES } from '@ai-form-filler/shared';

interface FormField {
  name: string;
  type: string;
  selector: string;
  label: string;
  required: boolean;
  placeholder?: string;
  value?: string;
  options?: string[]; // For select elements
  pattern?: string; // For validation
}

interface FormAnalysis {
  selector: string;
  action?: string;
  method?: string;
  fields: FormField[];
  submitButton?: string;
  formType: string;
  confidence: number;
}

interface FieldMapping {
  fieldName: string;
  profileKey: string;
  confidence: number;
  transformFunction?: (value: any) => string;
}

// Content script for advanced form detection and interaction
class ContentScript {
  private isInjected = false;
  private formCache = new Map<string, FormAnalysis>();
  private fieldMappings = new Map<string, FieldMapping[]>();
  private mutationObserver?: MutationObserver;

  constructor() {
    // Mark as injected to prevent duplicate injection
    (window as any).aiFormFillerInjected = true;
    
    this.setupMessageListeners();
    this.injectPageScript();
    this.detectForms();
    this.setupDynamicFormDetection();
    this.initializeFieldMappings();
  }

  private setupMessageListeners() {
    // Listen for messages from popup/background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message)
        .then(response => sendResponse(response))
        .catch(error => sendResponse(createResponse(false, null, error.message)));
      
      return true; // Keep message channel open for async response
    });

    // Listen for messages from injected script
    window.addEventListener('message', (event) => {
      if (event.source !== window || !event.data.type) return;
      
      if (event.data.type === 'FORM_DETECTED') {
        this.handleFormDetection(event.data.forms);
      } else if (event.data.type === 'DYNAMIC_CONTENT_CHANGE') {
        this.detectForms();
      }
    });
  }

  private injectPageScript() {
    if (this.isInjected) return;

    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('injected.js');
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
    
    this.isInjected = true;
  }

  private setupDynamicFormDetection() {
    // Watch for dynamically added forms
    this.mutationObserver = new MutationObserver((mutations) => {
      let shouldRedetect = false;
      
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;
              if (element.tagName === 'FORM' || element.querySelector('form')) {
                shouldRedetect = true;
              }
            }
          });
        }
      });

      if (shouldRedetect) {
        setTimeout(() => this.detectForms(), 100);
      }
    });

    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  private initializeFieldMappings() {
    // Initialize common field mappings with confidence scores
    const commonMappings: Record<string, FieldMapping[]> = {
      'email': [
        { fieldName: 'email', profileKey: 'personalData.email', confidence: 1.0 },
        { fieldName: 'e-mail', profileKey: 'personalData.email', confidence: 0.9 },
        { fieldName: 'mail', profileKey: 'personalData.email', confidence: 0.8 },
        { fieldName: 'username', profileKey: 'personalData.email', confidence: 0.6 }
      ],
      'name': [
        { fieldName: 'first_name', profileKey: 'personalData.firstName', confidence: 1.0 },
        { fieldName: 'firstname', profileKey: 'personalData.firstName', confidence: 1.0 },
        { fieldName: 'fname', profileKey: 'personalData.firstName', confidence: 0.9 },
        { fieldName: 'last_name', profileKey: 'personalData.lastName', confidence: 1.0 },
        { fieldName: 'lastname', profileKey: 'personalData.lastName', confidence: 1.0 },
        { fieldName: 'lname', profileKey: 'personalData.lastName', confidence: 0.9 },
        { fieldName: 'full_name', profileKey: 'personalData.firstName', confidence: 0.8, 
          transformFunction: (profile) => `${profile.personalData.firstName} ${profile.personalData.lastName}` }
      ],
      'phone': [
        { fieldName: 'phone', profileKey: 'personalData.phone', confidence: 1.0 },
        { fieldName: 'telephone', profileKey: 'personalData.phone', confidence: 0.9 },
        { fieldName: 'mobile', profileKey: 'personalData.phone', confidence: 0.9 },
        { fieldName: 'cell', profileKey: 'personalData.phone', confidence: 0.8 }
      ],
      'address': [
        { fieldName: 'address', profileKey: 'personalData.address.street', confidence: 1.0 },
        { fieldName: 'street', profileKey: 'personalData.address.street', confidence: 1.0 },
        { fieldName: 'city', profileKey: 'personalData.address.city', confidence: 1.0 },
        { fieldName: 'state', profileKey: 'personalData.address.state', confidence: 1.0 },
        { fieldName: 'zip', profileKey: 'personalData.address.zipCode', confidence: 1.0 },
        { fieldName: 'zipcode', profileKey: 'personalData.address.zipCode', confidence: 1.0 },
        { fieldName: 'postal', profileKey: 'personalData.address.zipCode', confidence: 0.9 },
        { fieldName: 'country', profileKey: 'personalData.address.country', confidence: 1.0 }
      ]
    };

    Object.entries(commonMappings).forEach(([category, mappings]) => {
      this.fieldMappings.set(category, mappings);
    });
  }

  private async handleMessage(message: any) {
    switch (message.type) {
      case COMMAND_TYPES.FILL_FORM:
        return this.fillForm(message.profileId);
      
      case COMMAND_TYPES.TRAIN_FORM:
        return this.trainForm(message.profileId);
      
      case 'GET_FORMS':
        return this.getForms();
      
      case 'ANALYZE_FORM':
        return this.analyzeSpecificForm(message.formSelector);
      
      default:
        throw new Error(`Unknown message type: ${message.type}`);
    }
  }

  private detectForms() {
    const forms = document.querySelectorAll('form');
    const formAnalyses: FormAnalysis[] = [];
    
    forms.forEach((form, index) => {
      const analysis = this.analyzeForm(form, index);
      const cacheKey = this.generateFormCacheKey(form);
      
      this.formCache.set(cacheKey, analysis);
      formAnalyses.push(analysis);
    });
    
    if (formAnalyses.length > 0) {
      console.log(`Detected ${formAnalyses.length} forms on page`);
      // Send form data to background script
      chrome.runtime.sendMessage({
        type: 'FORMS_DETECTED',
        forms: formAnalyses,
        url: window.location.href,
        timestamp: Date.now()
      });
    }
  }

  private analyzeForm(form: HTMLFormElement, index: number): FormAnalysis {
    const fields = this.extractFormFields(form);
    const formType = this.classifyFormType(fields);
    const confidence = this.calculateFormConfidence(fields, formType);

    return {
      selector: this.generateSelector(form) || `form:nth-of-type(${index + 1})`,
      action: form.action || window.location.href,
      method: form.method || 'GET',
      fields: fields,
      submitButton: this.findSubmitButton(form),
      formType: formType,
      confidence: confidence
    };
  }

  private extractFormFields(form: HTMLFormElement): FormField[] {
    const fields: FormField[] = [];
    const elements = form.elements;

    for (let i = 0; i < elements.length; i++) {
      const element = elements[i] as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
      
      // Skip buttons and submit elements
      if (element.type === 'submit' || element.type === 'button' || element.type === 'reset') {
        continue;
      }

      const field: FormField = {
        name: element.name || element.id || `field_${i}`,
        type: this.getElementType(element),
        selector: this.generateSelector(element) || `[name="${element.name}"]`,
        label: this.getFieldLabel(element),
        required: element.hasAttribute('required'),
        placeholder: (element as HTMLInputElement).placeholder,
        value: element.value
      };

      // Add options for select elements
      if (element.tagName === 'SELECT') {
        const select = element as HTMLSelectElement;
        field.options = Array.from(select.options).map(option => option.value);
      }

      // Add pattern for validation
      if ((element as HTMLInputElement).pattern) {
        field.pattern = (element as HTMLInputElement).pattern;
      }

      fields.push(field);
    }

    return fields;
  }

  private getElementType(element: HTMLElement): string {
    if (element.tagName === 'SELECT') return 'select';
    if (element.tagName === 'TEXTAREA') return 'textarea';
    
    const input = element as HTMLInputElement;
    return input.type || 'text';
  }

  private classifyFormType(fields: FormField[]): string {
    const fieldNames = fields.map(f => f.name.toLowerCase() + ' ' + f.label.toLowerCase());
    const fieldText = fieldNames.join(' ');

    // Classification based on field patterns
    if (fieldText.includes('email') && fieldText.includes('password')) {
      if (fieldText.includes('confirm') || fieldText.includes('repeat')) {
        return 'registration';
      }
      return 'login';
    }

    if (fieldText.includes('first') && fieldText.includes('last') && fieldText.includes('email')) {
      return 'contact';
    }

    if (fieldText.includes('address') && fieldText.includes('city') && fieldText.includes('zip')) {
      return 'address';
    }

    if (fieldText.includes('card') || fieldText.includes('payment') || fieldText.includes('billing')) {
      return 'payment';
    }

    if (fieldText.includes('search') || fieldText.includes('query')) {
      return 'search';
    }

    return 'general';
  }

  private calculateFormConfidence(fields: FormField[], formType: string): number {
    let confidence = 0.5; // Base confidence

    // Increase confidence based on field quality
    fields.forEach(field => {
      if (field.name && field.name !== field.selector) confidence += 0.1;
      if (field.label && field.label.length > 0) confidence += 0.1;
      if (field.type !== 'text') confidence += 0.05;
      if (field.required) confidence += 0.05;
    });

    // Adjust based on form type classification
    if (formType !== 'general') confidence += 0.2;

    return Math.min(confidence, 1.0);
  }

  private generateSelector(element: Element): string {
    // Priority order: ID > name > class > data attributes > position
    if (element.id) {
      return `#${CSS.escape(element.id)}`;
    }

    const name = (element as HTMLInputElement).name;
    if (name) {
      return `[name="${CSS.escape(name)}"]`;
    }

    if (element.className) {
      const classes = element.className.split(' ').filter(c => c.trim() && !c.match(/^\d/));
      if (classes.length > 0) {
        return `.${classes.map(c => CSS.escape(c)).join('.')}`;
      }
    }

    // Check for data attributes
    const dataAttrs = Array.from(element.attributes)
      .filter(attr => attr.name.startsWith('data-'))
      .slice(0, 2); // Limit to first 2 data attributes
    
    if (dataAttrs.length > 0) {
      return dataAttrs.map(attr => `[${attr.name}="${CSS.escape(attr.value)}"]`).join('');
    }

    // Fallback to position-based selector
    const tagName = element.tagName.toLowerCase();
    const parent = element.parentElement;
    
    if (parent) {
      const siblings = Array.from(parent.children).filter(el => el.tagName.toLowerCase() === tagName);
      if (siblings.length > 1) {
        const index = siblings.indexOf(element) + 1;
        return `${tagName}:nth-of-type(${index})`;
      }
    }

    return tagName;
  }

  private getFieldLabel(element: HTMLElement): string {
    const input = element as HTMLInputElement;
    
    // Try to find associated label by 'for' attribute
    if (input.id) {
      const label = document.querySelector(`label[for="${input.id}"]`);
      if (label) return this.cleanLabelText(label.textContent || '');
    }

    // Check for parent label
    const parentLabel = input.closest('label');
    if (parentLabel) {
      return this.cleanLabelText(parentLabel.textContent || '');
    }

    // Look for nearby text elements
    const nearbyLabels = [
      input.previousElementSibling,
      input.nextElementSibling,
      input.parentElement?.previousElementSibling,
      input.parentElement?.querySelector('label')
    ].filter(Boolean);

    for (const nearby of nearbyLabels) {
      if (nearby && nearby.textContent) {
        const text = this.cleanLabelText(nearby.textContent);
        if (text.length > 0 && text.length < 100) {
          return text;
        }
      }
    }

    // Fallback to placeholder or aria-label
    return input.placeholder || input.getAttribute('aria-label') || input.name || '';
  }

  private cleanLabelText(text: string): string {
    return text
      .replace(/[*:]/g, '') // Remove asterisks and colons
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  private findSubmitButton(form: HTMLFormElement): string | undefined {
    // Look for submit buttons
    const submitInputs = form.querySelectorAll('input[type="submit"], button[type="submit"], button:not([type])');
    
    if (submitInputs.length > 0) {
      return this.generateSelector(submitInputs[0]);
    }

    // Look for buttons with submit-like text
    const buttons = form.querySelectorAll('button, input[type="button"]');
    for (let i = 0; i < buttons.length; i++) {
      const button = buttons[i];
      const text = (button.textContent || (button as HTMLInputElement).value || '').toLowerCase();
      if (text.includes('submit') || text.includes('send') || text.includes('save') || text.includes('continue')) {
        return this.generateSelector(button);
      }
    }

    return undefined;
  }

  private generateFormCacheKey(form: HTMLFormElement): string {
    const action = form.action || window.location.href;
    const fieldCount = form.elements.length;
    const formId = form.id || form.className || 'anonymous';
    return `${action}_${formId}_${fieldCount}`;
  }

  private async fillForm(profileId: string) {
    try {
      // Get profile data from background script
      const profileResponse = await chrome.runtime.sendMessage({
        type: COMMAND_TYPES.GET_PROFILES,
        profileId: profileId
      });

      if (!profileResponse.success) {
        throw new Error('Failed to get profile data');
      }

      const profileData = profileResponse.data;
      const forms = Array.from(document.querySelectorAll('form'));
      
      if (forms.length === 0) {
        throw new Error('No forms found on page');
      }

      // Fill the most suitable form (highest confidence)
      let bestForm: HTMLFormElement | null = null;
      let bestAnalysis: FormAnalysis | null = null;
      let highestConfidence = 0;

      for (const form of forms) {
        const cacheKey = this.generateFormCacheKey(form);
        const analysis = this.formCache.get(cacheKey) || this.analyzeForm(form, 0);
        
        if (analysis.confidence > highestConfidence) {
          highestConfidence = analysis.confidence;
          bestForm = form;
          bestAnalysis = analysis;
        }
      }

      if (!bestForm || !bestAnalysis) {
        throw new Error('No suitable form found for filling');
      }

      const result = await this.fillSpecificForm(bestForm, bestAnalysis, profileData);
      return createResponse(true, result);

    } catch (error) {
      throw new Error(`Form filling failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async fillSpecificForm(form: HTMLFormElement, analysis: FormAnalysis, profileData: any) {
    let filledFields = 0;
    const totalFields = analysis.fields.length;
    const errors: string[] = [];

    for (const field of analysis.fields) {
      try {
        const element = form.querySelector(field.selector) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
        if (!element) {
          errors.push(`Field not found: ${field.name}`);
          continue;
        }

        const value = this.getProfileValueForField(field, profileData);
        if (value !== null && value !== undefined && value !== '') {
          await this.setFieldValue(element, value, field.type);
          filledFields++;
        }
      } catch (error) {
        errors.push(`Error filling ${field.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return {
      filledFields,
      totalFields,
      successRate: (filledFields / totalFields) * 100,
      errors: errors,
      formType: analysis.formType
    };
  }

  private getProfileValueForField(field: FormField, profileData: any): string | null {
    const fieldKey = (field.name + ' ' + field.label).toLowerCase();
    
    // Try all field mapping categories
    for (const [category, mappings] of this.fieldMappings.entries()) {
      for (const mapping of mappings) {
        if (fieldKey.includes(mapping.fieldName.toLowerCase())) {
          const value = this.getNestedValue(profileData, mapping.profileKey);
          
          if (value !== null && value !== undefined) {
            if (mapping.transformFunction) {
              return mapping.transformFunction(profileData);
            }
            return String(value);
          }
        }
      }
    }

    return null;
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : null;
    }, obj);
  }

  private async setFieldValue(element: HTMLElement, value: string, fieldType: string) {
    const input = element as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    
    // Handle different field types
    switch (fieldType) {
      case 'select':
        const select = input as HTMLSelectElement;
        // Try to find matching option
        const option = Array.from(select.options).find(opt => 
          opt.value === value || opt.text.toLowerCase() === value.toLowerCase()
        );
        if (option) {
          select.value = option.value;
        }
        break;
        
      case 'checkbox':
        const checkbox = input as HTMLInputElement;
        checkbox.checked = ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
        break;
        
      case 'radio':
        const radio = input as HTMLInputElement;
        if (radio.value === value) {
          radio.checked = true;
        }
        break;
        
      default:
        input.value = value;
    }

    // Trigger events to notify the page of changes
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    
    // Some sites need focus/blur events
    input.dispatchEvent(new Event('focus', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
    input.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  private async trainForm(profileId: string) {
    const forms = Array.from(document.querySelectorAll('form'));
    const analyses = forms.map((form, index) => this.analyzeForm(form, index));
    
    // Send comprehensive training data to background script
    chrome.runtime.sendMessage({
      type: 'TRAINING_DATA',
      data: {
        url: window.location.href,
        title: document.title,
        forms: analyses,
        html: document.documentElement.outerHTML,
        profileId: profileId,
        timestamp: Date.now(),
        userAgent: navigator.userAgent,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        }
      }
    });

    return createResponse(true, { 
      message: 'Training data collected',
      formsAnalyzed: analyses.length,
      totalFields: analyses.reduce((sum, analysis) => sum + analysis.fields.length, 0)
    });
  }

  private getForms() {
    const forms = Array.from(document.querySelectorAll('form'));
    const analyses = forms.map((form, index) => {
      const cacheKey = this.generateFormCacheKey(form);
      return this.formCache.get(cacheKey) || this.analyzeForm(form, index);
    });

    return createResponse(true, analyses);
  }

  private async analyzeSpecificForm(formSelector: string) {
    const form = document.querySelector(formSelector) as HTMLFormElement;
    if (!form) {
      throw new Error('Form not found');
    }

    const analysis = this.analyzeForm(form, 0);
    return createResponse(true, analysis);
  }

  private handleFormDetection(forms: any[]) {
    console.log('Forms detected by injected script:', forms);
    // Process additional form detection data from injected script
  }
}

// Initialize content script
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new ContentScript());
} else {
  new ContentScript();
}