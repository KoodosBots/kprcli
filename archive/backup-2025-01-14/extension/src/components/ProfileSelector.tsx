import React from 'react';
import { ClientProfile } from '../types';

interface ProfileSelectorProps {
  profiles: ClientProfile[];
  selectedProfileId: string;
  onProfileSelect: (profileId: string) => void;
  onCreateProfile: () => void;
  onEditProfile: (profile: ClientProfile) => void;
}

export const ProfileSelector: React.FC<ProfileSelectorProps> = ({
  profiles,
  selectedProfileId,
  onProfileSelect,
  onCreateProfile,
  onEditProfile
}) => {
  const selectedProfile = profiles.find(p => p.id === selectedProfileId);

  return (
    <div className="section">
      <div className="section-title">Profile Selection</div>
      
      <select 
        value={selectedProfileId} 
        onChange={(e) => onProfileSelect(e.target.value)}
        className="profile-select"
      >
        <option value="">Select a profile...</option>
        {profiles.map(profile => (
          <option key={profile.id} value={profile.id}>
            {profile.name}
          </option>
        ))}
      </select>

      <div className="profile-actions">
        <button 
          onClick={onCreateProfile}
          className="btn btn-primary"
        >
          Create New Profile
        </button>
        
        {selectedProfile && (
          <button 
            onClick={() => onEditProfile(selectedProfile)}
            className="btn btn-secondary"
          >
            Edit Profile
          </button>
        )}
      </div>

      {selectedProfile && (
        <div className="profile-preview">
          <div className="profile-info">
            <strong>{selectedProfile.name}</strong>
            <div className="profile-details">
              {selectedProfile.personalData.email && (
                <div>📧 {selectedProfile.personalData.email}</div>
              )}
              {selectedProfile.personalData.phone && (
                <div>📞 {selectedProfile.personalData.phone}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};