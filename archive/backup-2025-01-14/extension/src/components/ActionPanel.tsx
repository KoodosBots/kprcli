import React from 'react';
import { FormDetectionResult } from '../types';

interface ActionPanelProps {
  hasSelectedProfile: boolean;
  formsDetected: FormDetectionResult[];
  onTrainForm: () => void;
  onFillForm: () => void;
}

export const ActionPanel: React.FC<ActionPanelProps> = ({
  hasSelectedProfile,
  formsDetected,
  onTrainForm,
  onFillForm
}) => {
  const formCount = formsDetected.length;

  const handleOpenCLI = () => {
    chrome.runtime.sendMessage({ type: 'OPEN_CLI' });
  };

  const handleOpenSettings = () => {
    chrome.runtime.openOptionsPage();
  };

  const handleOpenHelp = () => {
    chrome.tabs.create({
      url: 'https://ai-form-filler.com/help'
    });
  };

  const handleCheckStatus = async () => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_STATUS'
      });

      if (response.success) {
        console.log('System is running normally');
      } else {
        console.log('System status unknown');
      }
    } catch (error) {
      console.log('Unable to check system status');
    }
  };

  return (
    <>
      <div className="section">
        <div className="section-title">Actions</div>
        
        <button 
          onClick={onTrainForm}
          disabled={!hasSelectedProfile}
          className="btn btn-primary action-btn"
        >
          🎓 Train Current Form
        </button>
        
        <button 
          onClick={onFillForm}
          disabled={!hasSelectedProfile}
          className="btn btn-primary action-btn"
        >
          ✏️ Fill Current Form
        </button>
        
        <div className="forms-detected">
          {formCount > 0 
            ? `${formCount} form${formCount > 1 ? 's' : ''} detected`
            : 'No forms detected'
          }
        </div>

        {formCount > 0 && (
          <div className="form-details">
            {formsDetected.map((form, index) => (
              <div key={index} className="form-item">
                <div className="form-info">
                  <span className="form-method">{form.method?.toUpperCase() || 'GET'}</span>
                  <span className="form-fields">{form.fields.length} fields</span>
                </div>
                {form.action && (
                  <div className="form-action" title={form.action}>
                    → {new URL(form.action, window.location.href).pathname}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="section">
        <div className="section-title">Quick Actions</div>
        <div className="quick-actions">
          <button 
            onClick={handleOpenCLI}
            className="btn btn-secondary quick-btn"
          >
            🖥️ Open CLI
          </button>
          <button 
            onClick={handleOpenSettings}
            className="btn btn-secondary quick-btn"
          >
            ⚙️ Settings
          </button>
          <button 
            onClick={handleOpenHelp}
            className="btn btn-secondary quick-btn"
          >
            ❓ Help
          </button>
          <button 
            onClick={handleCheckStatus}
            className="btn btn-secondary quick-btn"
          >
            📊 Status
          </button>
        </div>
      </div>
    </>
  );
};