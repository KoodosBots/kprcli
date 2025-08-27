import React from 'react';

interface StatusDisplayProps {
  message: string;
  type: 'success' | 'error' | 'info';
}

export const StatusDisplay: React.FC<StatusDisplayProps> = ({ message, type }) => {
  const getIcon = () => {
    switch (type) {
      case 'success':
        return '✅';
      case 'error':
        return '❌';
      case 'info':
        return 'ℹ️';
      default:
        return '';
    }
  };

  return (
    <div className={`status status-${type}`}>
      <span className="status-icon">{getIcon()}</span>
      <span className="status-message">{message}</span>
    </div>
  );
};