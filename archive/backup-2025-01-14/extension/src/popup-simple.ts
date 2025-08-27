import { createCommand, createResponse, COMMAND_TYPES } from '@ai-form-filler/shared';

// Simple popup implementation without React
class PopupManager {
  private profiles: any[] = [];
  private selectedProfileId: string | null = null;
  private isLoading = false;

  constructor() {
    this.init();
  }

  private async init() {
    await this.loadProfiles();
    this.setupEventListeners();
    this.render();
  }

  private async loadProfiles() {
    try {
      this.setLoading(true);
      const response = await chrome.runtime.sendMessage({
        type: COMMAND_TYPES.GET_PROFILES
      });

      if (response.success) {
        this.profiles = response.data || [];
        if (this.profiles.length > 0 && !this.selectedProfileId) {
          this.selectedProfileId = this.profiles[0].id;
        }
      }
    } catch (error) {
      console.error('Failed to load profiles:', error);
      this.showStatus('Failed to load profiles', 'error');
    } finally {
      this.setLoading(false);
    }
  }

  private setupEventListeners() {
    // Fill Form button
    const fillButton = document.getElementById('fill-form-btn');
    fillButton?.addEventListener('click', () => this.fillForm());

    // Train Form button
    const trainButton = document.getElementById('train-form-btn');
    trainButton?.addEventListener('click', () => this.trainForm());

    // Create Profile button
    const createButton = document.getElementById('create-profile-btn');
    createButton?.addEventListener('click', () => this.showCreateProfile());

    // Profile selector
    const profileSelect = document.getElementById('profile-select') as HTMLSelectElement;
    profileSelect?.addEventListener('change', (e) => {
      this.selectedProfileId = (e.target as HTMLSelectElement).value;
    });

    // Detect Forms button
    const detectButton = document.getElementById('detect-forms-btn');
    detectButton?.addEventListener('click', () => this.detectForms());
  }

  private async fillForm() {
    if (!this.selectedProfileId) {
      this.showStatus('Please select a profile first', 'error');
      return;
    }

    try {
      this.setLoading(true);
      this.showStatus('Filling form...', 'info');

      const response = await chrome.runtime.sendMessage({
        type: COMMAND_TYPES.FILL_FORM,
        profileId: this.selectedProfileId
      });

      if (response.success) {
        this.showStatus('Form filled successfully!', 'success');
      } else {
        this.showStatus(`Fill failed: ${response.error}`, 'error');
      }
    } catch (error) {
      console.error('Fill form error:', error);
      this.showStatus('Fill form failed', 'error');
    } finally {
      this.setLoading(false);
    }
  }

  private async trainForm() {
    if (!this.selectedProfileId) {
      this.showStatus('Please select a profile first', 'error');
      return;
    }

    try {
      this.setLoading(true);
      this.showStatus('Training on current form...', 'info');

      const response = await chrome.runtime.sendMessage({
        type: COMMAND_TYPES.TRAIN_FORM,
        profileId: this.selectedProfileId
      });

      if (response.success) {
        this.showStatus('Training completed!', 'success');
      } else {
        this.showStatus(`Training failed: ${response.error}`, 'error');
      }
    } catch (error) {
      console.error('Train form error:', error);
      this.showStatus('Training failed', 'error');
    } finally {
      this.setLoading(false);
    }
  }

  private async detectForms() {
    try {
      this.setLoading(true);
      this.showStatus('Detecting forms...', 'info');

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) {
        throw new Error('No active tab found');
      }

      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'GET_FORMS'
      });

      if (response.success) {
        const forms = response.data;
        this.showStatus(`Found ${forms.length} forms on page`, 'success');
        this.displayFormInfo(forms);
      } else {
        this.showStatus('No forms detected', 'warning');
      }
    } catch (error) {
      console.error('Detect forms error:', error);
      this.showStatus('Form detection failed', 'error');
    } finally {
      this.setLoading(false);
    }
  }

  private showCreateProfile() {
    // Simple prompt-based profile creation
    const name = prompt('Enter profile name:');
    if (!name) return;

    const firstName = prompt('Enter first name:');
    const lastName = prompt('Enter last name:');
    const email = prompt('Enter email:');
    const phone = prompt('Enter phone (optional):') || '';

    if (!firstName || !lastName || !email) {
      this.showStatus('Please fill in required fields', 'error');
      return;
    }

    this.createProfile({
      name,
      personalData: {
        firstName,
        lastName,
        email,
        phone,
        address: {
          street: '',
          city: '',
          state: '',
          zipCode: '',
          country: ''
        }
      }
    });
  }

  private async createProfile(profileData: any) {
    try {
      this.setLoading(true);
      this.showStatus('Creating profile...', 'info');

      const response = await chrome.runtime.sendMessage({
        type: COMMAND_TYPES.CREATE_PROFILE,
        data: {
          ...profileData,
          id: `profile_${Date.now()}`,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });

      if (response.success) {
        this.showStatus('Profile created successfully!', 'success');
        await this.loadProfiles();
        this.render();
      } else {
        this.showStatus(`Profile creation failed: ${response.error}`, 'error');
      }
    } catch (error) {
      console.error('Create profile error:', error);
      this.showStatus('Profile creation failed', 'error');
    } finally {
      this.setLoading(false);
    }
  }

  private displayFormInfo(forms: any[]) {
    const formInfo = document.getElementById('form-info');
    if (!formInfo) return;

    if (forms.length === 0) {
      formInfo.innerHTML = '<p>No forms detected on this page.</p>';
      return;
    }

    let html = '<div class="form-list">';
    forms.forEach((form, index) => {
      html += `
        <div class="form-item">
          <h4>Form ${index + 1} (${form.formType})</h4>
          <p>Fields: ${form.fields.length}</p>
          <p>Confidence: ${Math.round(form.confidence * 100)}%</p>
        </div>
      `;
    });
    html += '</div>';

    formInfo.innerHTML = html;
  }

  private render() {
    this.renderProfileSelector();
    this.updateButtonStates();
  }

  private renderProfileSelector() {
    const select = document.getElementById('profile-select') as HTMLSelectElement;
    if (!select) return;

    select.innerHTML = '';

    if (this.profiles.length === 0) {
      select.innerHTML = '<option value="">No profiles available</option>';
      return;
    }

    this.profiles.forEach(profile => {
      const option = document.createElement('option');
      option.value = profile.id;
      option.textContent = profile.name;
      option.selected = profile.id === this.selectedProfileId;
      select.appendChild(option);
    });
  }

  private updateButtonStates() {
    const fillButton = document.getElementById('fill-form-btn') as HTMLButtonElement;
    const trainButton = document.getElementById('train-form-btn') as HTMLButtonElement;

    const hasProfile = this.selectedProfileId && this.profiles.length > 0;
    
    if (fillButton) fillButton.disabled = !hasProfile || this.isLoading;
    if (trainButton) trainButton.disabled = !hasProfile || this.isLoading;
  }

  private setLoading(loading: boolean) {
    this.isLoading = loading;
    this.updateButtonStates();

    // Update loading indicator
    const loadingEl = document.getElementById('loading');
    if (loadingEl) {
      loadingEl.style.display = loading ? 'block' : 'none';
    }
  }

  private showStatus(message: string, type: 'success' | 'error' | 'warning' | 'info') {
    const statusEl = document.getElementById('status');
    if (!statusEl) return;

    statusEl.textContent = message;
    statusEl.className = `status ${type}`;
    statusEl.style.display = 'block';

    // Auto-hide after 3 seconds
    setTimeout(() => {
      statusEl.style.display = 'none';
    }, 3000);
  }
}

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new PopupManager();
});