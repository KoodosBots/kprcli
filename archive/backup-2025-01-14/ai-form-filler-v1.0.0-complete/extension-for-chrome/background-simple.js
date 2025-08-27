// AI Form Filler - Simplified Background Script (No Native Messaging Required)

class AIFormFillerBackground {
    constructor() {
        this.profiles = [];
        this.templates = new Map();
        this.init();
    }

    async init() {
        // Load saved data from browser storage
        await this.loadStoredData();
        
        // Set up message listeners
        this.setupListeners();
        
        console.log('AI Form Filler initialized (simplified mode)');
    }

    async loadStoredData() {
        try {
            const stored = await chrome.storage.local.get(['profiles', 'templates']);
            
            if (stored.profiles) {
                this.profiles = stored.profiles;
            } else {
                // Create default profile
                this.profiles = [{
                    id: 'default',
                    name: 'Default Profile',
                    data: {
                        firstName: '',
                        lastName: '',
                        email: '',
                        phone: '',
                        address: '',
                        city: '',
                        state: '',
                        zipCode: '',
                        country: ''
                    }
                }];
                await this.saveProfiles();
            }
            
            if (stored.templates) {
                this.templates = new Map(stored.templates);
            }
        } catch (error) {
            console.error('Error loading stored data:', error);
        }
    }

    async saveProfiles() {
        await chrome.storage.local.set({ profiles: this.profiles });
    }

    async saveTemplates() {
        await chrome.storage.local.set({ 
            templates: Array.from(this.templates.entries()) 
        });
    }

    setupListeners() {
        // Listen for messages from popup and content scripts
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            this.handleMessage(request, sender, sendResponse);
            return true; // Keep the message channel open for async responses
        });

        // Listen for tab updates to inject content script if needed
        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            if (changeInfo.status === 'complete' && tab.url) {
                // Check if we should auto-fill this page
                this.checkAutoFill(tabId, tab.url);
            }
        });
    }

    async handleMessage(request, sender, sendResponse) {
        try {
            switch (request.type) {
                case 'GET_PROFILES':
                    sendResponse({ success: true, data: this.profiles });
                    break;

                case 'SAVE_PROFILE':
                    await this.saveProfile(request.profile);
                    sendResponse({ success: true });
                    break;

                case 'DELETE_PROFILE':
                    await this.deleteProfile(request.profileId);
                    sendResponse({ success: true });
                    break;

                case 'FILL_FORM':
                    await this.fillForm(request.profileId, sender.tab);
                    sendResponse({ success: true });
                    break;

                case 'DETECT_FORMS':
                    // Content script will handle this
                    sendResponse({ success: true });
                    break;

                case 'SAVE_TEMPLATE':
                    await this.saveTemplate(request.template);
                    sendResponse({ success: true });
                    break;

                case 'GET_SETTINGS':
                    const settings = await this.getSettings();
                    sendResponse({ success: true, data: settings });
                    break;

                case 'SAVE_SETTINGS':
                    await this.saveSettings(request.settings);
                    sendResponse({ success: true });
                    break;

                default:
                    sendResponse({ success: false, error: 'Unknown request type' });
            }
        } catch (error) {
            console.error('Error handling message:', error);
            sendResponse({ success: false, error: error.message });
        }
    }

    async saveProfile(profile) {
        const existing = this.profiles.findIndex(p => p.id === profile.id);
        if (existing >= 0) {
            this.profiles[existing] = profile;
        } else {
            profile.id = profile.id || `profile_${Date.now()}`;
            this.profiles.push(profile);
        }
        await this.saveProfiles();
    }

    async deleteProfile(profileId) {
        this.profiles = this.profiles.filter(p => p.id !== profileId);
        await this.saveProfiles();
    }

    async fillForm(profileId, tab) {
        const profile = this.profiles.find(p => p.id === profileId);
        if (!profile) {
            throw new Error('Profile not found');
        }

        // Send profile data to content script
        await chrome.tabs.sendMessage(tab.id, {
            type: 'FILL_FORM_DATA',
            profile: profile
        });
    }

    async saveTemplate(template) {
        const domain = new URL(template.url).hostname;
        this.templates.set(domain, template);
        await this.saveTemplates();
    }

    async checkAutoFill(tabId, url) {
        try {
            const settings = await this.getSettings();
            if (!settings.autoFill) return;

            const domain = new URL(url).hostname;
            const template = this.templates.get(domain);
            
            if (template && settings.defaultProfileId) {
                const profile = this.profiles.find(p => p.id === settings.defaultProfileId);
                if (profile) {
                    // Wait a bit for page to load
                    setTimeout(() => {
                        chrome.tabs.sendMessage(tabId, {
                            type: 'AUTO_FILL',
                            profile: profile,
                            template: template
                        }).catch(() => {
                            // Page might not have content script yet
                        });
                    }, 1000);
                }
            }
        } catch (error) {
            console.error('Error in auto-fill check:', error);
        }
    }

    async getSettings() {
        const stored = await chrome.storage.local.get('settings');
        return stored.settings || {
            autoFill: false,
            defaultProfileId: 'default',
            fillDelay: 100,
            highlightFields: true
        };
    }

    async saveSettings(settings) {
        await chrome.storage.local.set({ settings });
    }
}

// Initialize the background script
const formFiller = new AIFormFillerBackground();

// Export for use in popup if needed
if (typeof window !== 'undefined') {
    window.formFiller = formFiller;
}
