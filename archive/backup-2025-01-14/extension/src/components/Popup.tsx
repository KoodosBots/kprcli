import React, { useState, useEffect } from 'react';
import { ProfileSelector } from './ProfileSelector';
import { ProfileForm } from './ProfileForm';
import { ActionPanel } from './ActionPanel';
import { StatusDisplay } from './StatusDisplay';
import { ClientProfile, FormDetectionResult } from '../types';
import { COMMAND_TYPES } from '@ai-form-filler/shared';

interface PopupState {
  profiles: ClientProfile[];
  selectedProfileId: string;
  showProfileForm: boolean;
  editingProfile: ClientProfile | null;
  formsDetected: FormDetectionResult[];
  status: { message: string; type: 'success' | 'error' | 'info' } | null;
  isLoading: boolean;
}

export const Popup: React.FC = () => {
  const [state, setState] = useState<PopupState>({
    profiles: [],
    selectedProfileId: '',
    showProfileForm: false,
    editingProfile: null,
    formsDetected: [],
    status: null,
    isLoading: true
  });

  useEffect(() => {
    loadProfiles();
    checkCurrentPage();
  }, []);

  const loadProfiles = async () => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: COMMAND_TYPES.GET_PROFILES
      });

      if (response.success && response.data) {
        setState(prev => ({
          ...prev,
          profiles: response.data,
          isLoading: false
        }));
      }
    } catch (error) {
      showStatus(`Failed to load profiles: ${error instanceof Error ? error.message : String(error)}`, 'error');
      setState(prev => ({ ...prev, isLoading: false }));
    }
  };

  const checkCurrentPage = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) return;

      const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_FORMS' });
      
      if (response.success && response.data) {
        setState(prev => ({
          ...prev,
          formsDetected: response.data
        }));
      }
    } catch (error) {
      console.log('Unable to scan page for forms');
    }
  };

  const showStatus = (message: string, type: 'success' | 'error' | 'info') => {
    setState(prev => ({ ...prev, status: { message, type } }));
    
    // Auto-hide after 3 seconds
    setTimeout(() => {
      setState(prev => ({ ...prev, status: null }));
    }, 3000);
  };

  const handleProfileSelect = (profileId: string) => {
    setState(prev => ({ ...prev, selectedProfileId: profileId }));
  };

  const handleCreateProfile = () => {
    setState(prev => ({
      ...prev,
      showProfileForm: true,
      editingProfile: null
    }));
  };

  const handleEditProfile = (profile: ClientProfile) => {
    setState(prev => ({
      ...prev,
      showProfileForm: true,
      editingProfile: profile
    }));
  };

  const handleProfileSave = async (profileData: Partial<ClientProfile>) => {
    try {
      const command = state.editingProfile 
        ? COMMAND_TYPES.UPDATE_PROFILE 
        : COMMAND_TYPES.CREATE_PROFILE;

      const response = await chrome.runtime.sendMessage({
        type: command,
        data: state.editingProfile 
          ? { ...state.editingProfile, ...profileData }
          : profileData
      });

      if (response.success) {
        showStatus(
          state.editingProfile ? 'Profile updated successfully' : 'Profile created successfully',
          'success'
        );
        setState(prev => ({
          ...prev,
          showProfileForm: false,
          editingProfile: null
        }));
        await loadProfiles();
      } else {
        throw new Error(response.error || 'Failed to save profile');
      }
    } catch (error) {
      showStatus(`Failed to save profile: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  };

  const handleProfileCancel = () => {
    setState(prev => ({
      ...prev,
      showProfileForm: false,
      editingProfile: null
    }));
  };

  const handleTrainForm = async () => {
    if (!state.selectedProfileId) {
      showStatus('Please select a profile first', 'error');
      return;
    }

    try {
      showStatus('Starting form training...', 'info');
      
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) throw new Error('No active tab');

      const response = await chrome.tabs.sendMessage(tab.id, {
        type: COMMAND_TYPES.TRAIN_FORM,
        profileId: state.selectedProfileId
      });

      if (response.success) {
        showStatus('Form training started successfully', 'success');
      } else {
        throw new Error(response.error || 'Training failed');
      }
    } catch (error) {
      showStatus(`Training failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  };

  const handleFillForm = async () => {
    if (!state.selectedProfileId) {
      showStatus('Please select a profile first', 'error');
      return;
    }

    try {
      showStatus('Filling form...', 'info');
      
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) throw new Error('No active tab');

      const response = await chrome.tabs.sendMessage(tab.id, {
        type: COMMAND_TYPES.FILL_FORM,
        profileId: state.selectedProfileId
      });

      if (response.success) {
        const { filledFields, totalFields, successRate } = response.data;
        showStatus(
          `Form filled: ${filledFields}/${totalFields} fields (${successRate.toFixed(1)}%)`,
          'success'
        );
      } else {
        throw new Error(response.error || 'Form filling failed');
      }
    } catch (error) {
      showStatus(`Form filling failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  };

  if (state.isLoading) {
    return (
      <div className="popup-container">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  if (state.showProfileForm) {
    return (
      <div className="popup-container">
        <ProfileForm
          profile={state.editingProfile}
          onSave={handleProfileSave}
          onCancel={handleProfileCancel}
        />
      </div>
    );
  }

  return (
    <div className="popup-container">
      <div className="header">
        <div className="logo">AI</div>
        <h1>AI Form Filler</h1>
      </div>

      <ProfileSelector
        profiles={state.profiles}
        selectedProfileId={state.selectedProfileId}
        onProfileSelect={handleProfileSelect}
        onCreateProfile={handleCreateProfile}
        onEditProfile={handleEditProfile}
      />

      <ActionPanel
        hasSelectedProfile={!!state.selectedProfileId}
        formsDetected={state.formsDetected}
        onTrainForm={handleTrainForm}
        onFillForm={handleFillForm}
      />

      {state.status && (
        <StatusDisplay
          message={state.status.message}
          type={state.status.type}
        />
      )}
    </div>
  );
};