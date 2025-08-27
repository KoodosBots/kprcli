// Injected script that runs in the page context
// This script has access to the page's JavaScript context

(function() {
  'use strict';

  // Avoid multiple injections
  if ((window as any).__AI_FORM_FILLER_INJECTED__) {
    return;
  }
  (window as any).__AI_FORM_FILLER_INJECTED__ = true;

  class PageScriptInjector {
    private observer!: MutationObserver;

    constructor() {
      this.setupFormDetection();
      this.setupDOMObserver();
      this.detectExistingForms();
    }

    private setupFormDetection() {
      // Listen for form submissions to learn patterns
      document.addEventListener('submit', (event) => {
        const form = event.target as HTMLFormElement;
        this.analyzeFormSubmission(form);
      }, true);

      // Listen for input changes to understand user behavior
      document.addEventListener('input', (event) => {
        const input = event.target as HTMLInputElement;
        if (input.form) {
          this.trackInputChange(input);
        }
      }, true);
    }

    private setupDOMObserver() {
      // Watch for dynamically added forms
      this.observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;
              
              // Check if the added node is a form or contains forms
              if (element.tagName === 'FORM') {
                this.analyzeNewForm(element as HTMLFormElement);
              } else {
                const forms = element.querySelectorAll('form');
                forms.forEach(form => this.analyzeNewForm(form));
              }
            }
          });
        });
      });

      this.observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }

    private detectExistingForms() {
      const forms = document.querySelectorAll('form');
      const formData = Array.from(forms).map(form => this.analyzeFormStructure(form));
      
      if (formData.length > 0) {
        this.sendToContentScript('FORM_DETECTED', { forms: formData });
      }
    }

    private analyzeFormStructure(form: HTMLFormElement) {
      const fields = this.extractFormFields(form);
      const validation = this.extractValidationRules(form);
      const submitButtons = this.findSubmitButtons(form);

      return {
        id: form.id || this.generateFormId(form),
        action: form.action,
        method: form.method,
        enctype: form.enctype,
        fields: fields,
        validation: validation,
        submitButtons: submitButtons,
        position: this.getElementPosition(form),
        isVisible: this.isElementVisible(form)
      };
    }

    private extractFormFields(form: HTMLFormElement) {
      const fields: any[] = [];
      const elements = form.elements;

      for (let i = 0; i < elements.length; i++) {
        const element = elements[i] as HTMLInputElement;
        
        if (element.type === 'submit' || element.type === 'button') {
          continue;
        }

        const fieldData = {
          name: element.name,
          id: element.id,
          type: element.type,
          tagName: element.tagName.toLowerCase(),
          label: this.getFieldLabel(element),
          placeholder: element.placeholder,
          required: element.required,
          pattern: element.pattern,
          minLength: element.minLength,
          maxLength: element.maxLength,
          min: element.min,
          max: element.max,
          step: element.step,
          autocomplete: element.autocomplete,
          className: element.className,
          selector: this.generateUniqueSelector(element),
          position: this.getElementPosition(element),
          isVisible: this.isElementVisible(element)
        };

        // Extract options for select elements
        if (element.tagName.toLowerCase() === 'select') {
          const select = element as unknown as HTMLSelectElement;
          (fieldData as any).options = Array.from(select.options).map(option => ({
            value: option.value,
            text: option.text,
            selected: option.selected
          }));
        }

        fields.push(fieldData);
      }

      return fields;
    }

    private extractValidationRules(form: HTMLFormElement) {
      const rules: any[] = [];

      // Look for client-side validation
      const script = document.querySelector('script');
      if (script && script.textContent) {
        // Basic pattern matching for common validation libraries
        const validationPatterns = [
          /validate\s*\(/,
          /validation\s*:/,
          /rules\s*:/,
          /required\s*:/
        ];

        validationPatterns.forEach(pattern => {
          if (pattern.test(script.textContent!)) {
            rules.push({
              type: 'client_side_validation',
              pattern: pattern.source
            });
          }
        });
      }

      return rules;
    }

    private findSubmitButtons(form: HTMLFormElement) {
      const buttons: any[] = [];
      
      // Find submit inputs
      const submitInputs = form.querySelectorAll('input[type="submit"]');
      submitInputs.forEach(input => {
        buttons.push({
          type: 'input',
          value: (input as HTMLInputElement).value,
          selector: this.generateUniqueSelector(input)
        });
      });

      // Find button elements
      const buttonElements = form.querySelectorAll('button');
      buttonElements.forEach(button => {
        if (button.type === 'submit' || !button.type) {
          buttons.push({
            type: 'button',
            text: button.textContent?.trim(),
            selector: this.generateUniqueSelector(button)
          });
        }
      });

      return buttons;
    }

    private getFieldLabel(element: HTMLInputElement): string {
      // Try multiple methods to find the label
      
      // Method 1: Associated label element
      if (element.id) {
        const label = document.querySelector(`label[for="${element.id}"]`);
        if (label) return label.textContent?.trim() || '';
      }

      // Method 2: Parent label
      const parentLabel = element.closest('label');
      if (parentLabel) {
        return parentLabel.textContent?.replace(element.value, '').trim() || '';
      }

      // Method 3: Previous sibling text
      let sibling = element.previousElementSibling;
      while (sibling) {
        if (sibling.textContent?.trim()) {
          return sibling.textContent.trim();
        }
        sibling = sibling.previousElementSibling;
      }

      // Method 4: Aria-label or title
      return element.getAttribute('aria-label') || element.title || '';
    }

    private generateUniqueSelector(element: Element): string {
      // Generate the most specific selector possible
      if (element.id) {
        return `#${element.id}`;
      }

      const path: string[] = [];
      let current: Element | null = element;

      while (current && current !== document.body) {
        let selector = current.tagName.toLowerCase();
        
        if (current.className) {
          const classes = current.className.split(' ').filter(c => c.trim());
          if (classes.length > 0) {
            selector += '.' + classes.join('.');
          }
        }

        // Add nth-child if there are siblings with the same tag
        const siblings = Array.from(current.parentElement?.children || [])
          .filter(el => el.tagName === current!.tagName);
        
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += `:nth-of-type(${index})`;
        }

        path.unshift(selector);
        current = current.parentElement;
      }

      return path.join(' > ');
    }

    private generateFormId(form: HTMLFormElement): string {
      // Generate a unique ID for forms without IDs
      const action = form.action || window.location.href;
      const fieldCount = form.elements.length;
      return `form_${btoa(action).slice(0, 8)}_${fieldCount}`;
    }

    private getElementPosition(element: Element) {
      const rect = element.getBoundingClientRect();
      return {
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
        height: rect.height
      };
    }

    private isElementVisible(element: Element): boolean {
      const style = window.getComputedStyle(element);
      return style.display !== 'none' && 
             style.visibility !== 'hidden' && 
             style.opacity !== '0';
    }

    private analyzeNewForm(form: HTMLFormElement) {
      const formData = this.analyzeFormStructure(form);
      this.sendToContentScript('NEW_FORM_DETECTED', { form: formData });
    }

    private analyzeFormSubmission(form: HTMLFormElement) {
      const formData = this.analyzeFormStructure(form);
      const submissionData = this.extractSubmissionData(form);
      
      this.sendToContentScript('FORM_SUBMITTED', {
        form: formData,
        submission: submissionData
      });
    }

    private extractSubmissionData(form: HTMLFormElement) {
      const data = new FormData(form);
      const submissionData: Record<string, any> = {};

      data.forEach((value, key) => {
        submissionData[key] = value;
      });

      return {
        data: submissionData,
        timestamp: new Date().toISOString(),
        url: window.location.href
      };
    }

    private trackInputChange(input: HTMLInputElement) {
      // Track user input patterns for learning
      this.sendToContentScript('INPUT_CHANGED', {
        field: {
          name: input.name,
          type: input.type,
          value: input.value.length, // Don't send actual value for privacy
          selector: this.generateUniqueSelector(input)
        },
        timestamp: new Date().toISOString()
      });
    }

    private sendToContentScript(type: string, data: any) {
      window.postMessage({
        type: type,
        data: data,
        source: 'ai-form-filler-injected'
      }, '*');
    }
  }

  // Initialize the page script injector
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new PageScriptInjector());
  } else {
    new PageScriptInjector();
  }

})();