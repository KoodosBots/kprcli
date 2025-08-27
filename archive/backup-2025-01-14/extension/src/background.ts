import { createCommand, createResponse, COMMAND_TYPES } from '@ai-form-filler/shared';

interface PendingRequest {
  id: string;
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timeout: number;
}

interface NativeMessage {
  id?: string;
  type: string;
  data?: any;
  error?: string;
  success?: boolean;
}

// Background script for Chrome extension with enhanced CLI communication
class BackgroundService {
  private nativePort: chrome.runtime.Port | null = null;
  private pendingRequests = new Map<string, PendingRequest>();
  private connectionRetryCount = 0;
  private maxRetries = 3;
  private isConnecting = false;

  constructor() {
    this.setupMessageListeners();
    this.setupNativeMessaging();
    this.setupStorageSync();
  }

  private setupMessageListeners() {
    // Listen for messages from content scripts and popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender)
        .then(response => sendResponse(response))
        .catch(error => sendResponse(createResponse(false, null, error.message)));
      
      return true; // Keep message channel open for async response
    });

    // Listen for tab updates to inject content scripts
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url && this.shouldInjectScript(tab.url)) {
        this.injectContentScript(tabId);
      }
    });

    // Handle extension startup
    chrome.runtime.onStartup.addListener(() => {
      this.setupNativeMessaging();
    });

    // Handle extension installation
    chrome.runtime.onInstalled.addListener(() => {
      this.setupNativeMessaging();
    });
  }

  private setupNativeMessaging() {
    if (this.isConnecting) return;
    
    this.isConnecting = true;
    
    try {
      // Connect to native CLI application
      this.nativePort = chrome.runtime.connectNative('com.ai_form_filler.cli');
      
      this.nativePort.onMessage.addListener((message: NativeMessage) => {
        this.handleNativeMessage(message);
      });

      this.nativePort.onDisconnect.addListener(() => {
        console.log('Native messaging disconnected:', chrome.runtime.lastError);
        this.handleNativeDisconnect();
      });

      // Send initial handshake
      this.sendToNative({
        type: 'HANDSHAKE',
        data: {
          extensionId: chrome.runtime.id,
          version: chrome.runtime.getManifest().version
        }
      });

      this.connectionRetryCount = 0;
      console.log('Native messaging connected successfully');
      
    } catch (error) {
      console.warn('Native messaging connection failed:', error instanceof Error ? error.message : String(error));
      this.handleNativeDisconnect();
    } finally {
      this.isConnecting = false;
    }
  }

  private handleNativeMessage(message: NativeMessage) {
    console.log('Received from native app:', message);

    // Handle response to pending request
    if (message.id && this.pendingRequests.has(message.id)) {
      const request = this.pendingRequests.get(message.id)!;
      clearTimeout(request.timeout);
      this.pendingRequests.delete(message.id);

      if (message.success) {
        request.resolve(message.data);
      } else {
        request.reject(new Error(message.error || 'Unknown error'));
      }
      return;
    }

    // Handle unsolicited messages from CLI
    switch (message.type) {
      case 'FORM_FILL_COMPLETE':
        this.notifyFormFillComplete(message.data);
        break;
      
      case 'TRAINING_COMPLETE':
        this.notifyTrainingComplete(message.data);
        break;
      
      case 'PROFILE_UPDATED':
        this.syncProfileData(message.data);
        break;
      
      case 'STATUS_UPDATE':
        this.broadcastStatusUpdate(message.data);
        break;
      
      case 'ERROR_NOTIFICATION':
        this.handleErrorNotification(message.data);
        break;
      
      default:
        console.log('Unhandled native message type:', message.type);
    }
  }

  private handleNativeDisconnect() {
    this.nativePort = null;
    
    // Reject all pending requests
    this.pendingRequests.forEach(request => {
      clearTimeout(request.timeout);
      request.reject(new Error('Native messaging disconnected'));
    });
    this.pendingRequests.clear();

    // Attempt to reconnect with exponential backoff
    if (this.connectionRetryCount < this.maxRetries) {
      const delay = Math.pow(2, this.connectionRetryCount) * 1000; // 1s, 2s, 4s
      this.connectionRetryCount++;
      
      console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.connectionRetryCount}/${this.maxRetries})`);
      setTimeout(() => this.setupNativeMessaging(), delay);
    } else {
      console.error('Max reconnection attempts reached. Native messaging unavailable.');
    }
  }

  private async sendToNative(message: NativeMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.nativePort) {
        reject(new Error('Native messaging not available'));
        return;
      }

      const id = this.generateRequestId();
      const messageWithId = { ...message, id };

      // Set up timeout for request
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error('Request timeout'));
      }, 30000); // 30 second timeout

      this.pendingRequests.set(id, { id, resolve, reject, timeout });
      
      try {
        this.nativePort.postMessage(messageWithId);
      } catch (error) {
        this.pendingRequests.delete(id);
        clearTimeout(timeout);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async handleMessage(message: any, sender: chrome.runtime.MessageSender) {
    switch (message.type) {
      case COMMAND_TYPES.FILL_FORM:
        return this.handleFillForm(message, sender);
      
      case COMMAND_TYPES.TRAIN_FORM:
        return this.handleTrainForm(message, sender);
      
      case COMMAND_TYPES.GET_PROFILES:
        return this.handleGetProfiles();
      
      case COMMAND_TYPES.CREATE_PROFILE:
        return this.handleCreateProfile(message.data);
      
      case COMMAND_TYPES.UPDATE_PROFILE:
        return this.handleUpdateProfile(message.data);
      
      case COMMAND_TYPES.DELETE_PROFILE:
        return this.handleDeleteProfile(message.profileId);
      
      case COMMAND_TYPES.GET_STATUS:
        return this.handleGetStatus();
      
      case 'OPEN_CLI':
        return this.handleOpenCLI();
      
      case 'FORMS_DETECTED':
        return this.handleFormsDetected(message, sender);
      
      case 'TRAINING_DATA':
        return this.handleTrainingData(message.data, sender);
      
      default:
        throw new Error(`Unknown command type: ${message.type}`);
    }
  }

  private async handleFillForm(message: any, sender: chrome.runtime.MessageSender) {
    try {
      if (!sender.tab?.id) {
        throw new Error('No tab information available');
      }

      const result = await this.sendToNative({
        type: 'FILL_FORM',
        data: {
          tabId: sender.tab.id,
          url: sender.tab.url,
          profileId: message.profileId,
          formData: message.formData
        }
      });

      return createResponse(true, result);
    } catch (error) {
      throw new Error(`Form filling failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleTrainForm(message: any, sender: chrome.runtime.MessageSender) {
    try {
      if (!sender.tab?.id) {
        throw new Error('No tab information available');
      }

      const result = await this.sendToNative({
        type: 'TRAIN_FORM',
        data: {
          tabId: sender.tab.id,
          url: sender.tab.url,
          profileId: message.profileId
        }
      });

      return createResponse(true, result);
    } catch (error) {
      throw new Error(`Training failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleGetProfiles() {
    try {
      // Try to get from native CLI first, fallback to local storage
      if (this.nativePort) {
        const result = await this.sendToNative({
          type: 'GET_PROFILES'
        });
        return createResponse(true, result);
      } else {
        const result = await chrome.storage.local.get(['profiles']);
        return createResponse(true, result.profiles || []);
      }
    } catch (error) {
      // Fallback to local storage
      const result = await chrome.storage.local.get(['profiles']);
      return createResponse(true, result.profiles || []);
    }
  }

  private async handleCreateProfile(profileData: any) {
    try {
      const result = await this.sendToNative({
        type: 'CREATE_PROFILE',
        data: profileData
      });

      // Also store locally for offline access
      await this.storeProfileLocally(result);
      
      return createResponse(true, result);
    } catch (error) {
      throw new Error(`Profile creation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleUpdateProfile(profileData: any) {
    try {
      const result = await this.sendToNative({
        type: 'UPDATE_PROFILE',
        data: profileData
      });

      // Update local storage
      await this.updateProfileLocally(result);
      
      return createResponse(true, result);
    } catch (error) {
      throw new Error(`Profile update failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleDeleteProfile(profileId: string) {
    try {
      const result = await this.sendToNative({
        type: 'DELETE_PROFILE',
        data: { profileId }
      });

      // Remove from local storage
      await this.removeProfileLocally(profileId);
      
      return createResponse(true, result);
    } catch (error) {
      throw new Error(`Profile deletion failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleGetStatus() {
    try {
      const result = await this.sendToNative({
        type: 'GET_STATUS'
      });
      return createResponse(true, result);
    } catch (error) {
      return createResponse(false, null, 'CLI not available');
    }
  }

  private async handleOpenCLI() {
    try {
      const result = await this.sendToNative({
        type: 'OPEN_CLI_DASHBOARD'
      });
      return createResponse(true, result);
    } catch (error) {
      throw new Error(`Failed to open CLI: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleFormsDetected(message: any, sender: chrome.runtime.MessageSender) {
    try {
      // Forward form detection data to CLI for analysis
      if (this.nativePort && sender.tab?.id) {
        await this.sendToNative({
          type: 'FORMS_DETECTED',
          data: {
            tabId: sender.tab.id,
            url: sender.tab.url,
            forms: message.forms,
            timestamp: message.timestamp
          }
        });
      }
      return createResponse(true, { status: 'forwarded' });
    } catch (error) {
      console.warn('Failed to forward form detection:', error);
      return createResponse(true, { status: 'local_only' });
    }
  }

  private async handleTrainingData(data: any, sender: chrome.runtime.MessageSender) {
    try {
      // Forward training data to CLI
      if (this.nativePort && sender.tab?.id) {
        await this.sendToNative({
          type: 'TRAINING_DATA',
          data: {
            ...data,
            tabId: sender.tab.id
          }
        });
      }
      return createResponse(true, { status: 'training_data_sent' });
    } catch (error) {
      console.warn('Failed to send training data:', error);
      return createResponse(false, null, 'Failed to send training data');
    }
  }

  private shouldInjectScript(url: string): boolean {
    // Don't inject on chrome:// pages, extension pages, file:// pages, etc.
    if (!url) return false;
    
    // Skip chrome://, chrome-extension://, moz-extension://, file:// URLs
    if (url.startsWith('chrome://') || 
        url.startsWith('chrome-extension://') || 
        url.startsWith('moz-extension://') ||
        url.startsWith('file://') ||
        url.startsWith('about:')) {
      return false;
    }
    
    return url.startsWith('http://') || url.startsWith('https://');
  }

  private async injectContentScript(tabId: number) {
    try {
      // Check if content script is already injected
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          return typeof (window as any).aiFormFillerInjected !== 'undefined';
        }
      });

      if (results[0]?.result) {
        return; // Already injected
      }

      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js']
      });
    } catch (error: any) {
      // Only log if it's not a common expected error
      if (!error.message.includes('Cannot access contents') && 
          !error.message.includes('Frame with ID 0 is showing error page')) {
        console.warn('Failed to inject content script:', error);
      }
    }
  }

  private async storeProfileLocally(profile: any) {
    const result = await chrome.storage.local.get(['profiles']);
    const profiles = result.profiles || [];
    
    const existingIndex = profiles.findIndex((p: any) => p.id === profile.id);
    if (existingIndex >= 0) {
      profiles[existingIndex] = profile;
    } else {
      profiles.push(profile);
    }
    
    await chrome.storage.local.set({ profiles });
  }

  private async updateProfileLocally(profile: any) {
    await this.storeProfileLocally(profile);
  }

  private async removeProfileLocally(profileId: string) {
    const result = await chrome.storage.local.get(['profiles']);
    const profiles = result.profiles || [];
    
    const filteredProfiles = profiles.filter((p: any) => p.id !== profileId);
    await chrome.storage.local.set({ profiles: filteredProfiles });
  }

  private setupStorageSync() {
    // Sync profiles between extension and CLI periodically
    setInterval(async () => {
      try {
        if (this.nativePort) {
          const profiles = await this.sendToNative({ type: 'GET_PROFILES' });
          await chrome.storage.local.set({ profiles });
        }
      } catch (error) {
        console.warn('Profile sync failed:', error);
      }
    }, 60000); // Sync every minute
  }

  private notifyFormFillComplete(data: any) {
    // Notify popup or content script about completion
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'FORM_FILL_COMPLETE',
          data: data
        });
      }
    });
  }

  private notifyTrainingComplete(data: any) {
    // Notify about training completion
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'TRAINING_COMPLETE',
          data: data
        });
      }
    });
  }

  private syncProfileData(profileData: any) {
    // Update local profile storage when CLI updates profiles
    this.storeProfileLocally(profileData);
  }

  private broadcastStatusUpdate(statusData: any) {
    // Broadcast status updates to all components
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'STATUS_UPDATE',
            data: statusData
          });
        }
      });
    });
  }

  private handleErrorNotification(errorData: any) {
    // Handle error notifications from CLI
    console.error('CLI Error:', errorData);
    
    // Show notification to user
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'AI Form Filler Error',
      message: errorData.message || 'An error occurred in the CLI'
    });
  }
}

// Initialize background service
new BackgroundService();