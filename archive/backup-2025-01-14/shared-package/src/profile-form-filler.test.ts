import { ProfileFormFiller, FieldMapper } from './profile-form-filler';
import { ClientProfile, FormField } from './types';

describe('ProfileFormFiller', () => {
  let profileFormFiller: ProfileFormFiller;
  let mockProfile: ClientProfile;

  beforeEach(() => {
    profileFormFiller = new ProfileFormFiller();
    
    mockProfile = {
      id: 'test-profile-123',
      userId: 'user-123',
      name: 'Test Profile',
      personalData: {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        phone: '+1234567890',
        address: {
          street: '123 Main St',
          city: 'Anytown',
          state: 'CA',
          zipCode: '12345',
          country: 'USA'
        },
        dateOfBirth: new Date('1990-01-01'),
        customFields: {
          company: 'Acme Corp',
          title: 'Developer'
        }
      },
      preferences: {},
      createdAt: new Date(),
      updatedAt: new Date()
    };
  });

  it('should create ProfileFormFiller instance', () => {
    expect(profileFormFiller).toBeDefined();
    expect(profileFormFiller).toBeInstanceOf(ProfileFormFiller);
  });

  it('should use default config when none provided', () => {
    const pff = new ProfileFormFiller();
    expect(pff).toBeDefined();
  });

  it('should merge custom config with defaults', () => {
    const customConfig = {
      autoDetectFields: false,
      maxRetries: 5
    };
    const pff = new ProfileFormFiller(customConfig);
    expect(pff).toBeDefined();
  });
});

describe('FieldMapper', () => {
  let fieldMapper: FieldMapper;
  let mockProfile: ClientProfile;

  beforeEach(() => {
    fieldMapper = new FieldMapper();
    
    mockProfile = {
      id: 'test-profile-123',
      userId: 'user-123',
      name: 'Test Profile',
      personalData: {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        phone: '+1234567890',
        address: {
          street: '123 Main St',
          city: 'Anytown',
          state: 'CA',
          zipCode: '12345',
          country: 'USA'
        },
        dateOfBirth: new Date('1990-01-01'),
        customFields: {
          company: 'Acme Corp'
        }
      },
      preferences: {},
      createdAt: new Date(),
      updatedAt: new Date()
    };
  });

  describe('mapProfileToFields', () => {
    it('should map basic profile fields correctly', () => {
      const fields: FormField[] = [
        {
          id: 'field1',
          name: 'firstName',
          type: 'text',
          selector: '#first-name',
          label: 'First Name',
          required: true
        },
        {
          id: 'field2',
          name: 'lastName',
          type: 'text',
          selector: '#last-name',
          label: 'Last Name',
          required: true
        },
        {
          id: 'field3',
          name: 'email',
          type: 'email',
          selector: '#email',
          label: 'Email Address',
          required: true
        }
      ];

      const { mappings, unmappedFields } = fieldMapper.mapProfileToFields(mockProfile, fields);

      expect(mappings['firstName']).toBe('John');
      expect(mappings['lastName']).toBe('Doe');
      expect(mappings['email']).toBe('john.doe@example.com');
      expect(unmappedFields).toHaveLength(0);
    });

    it('should handle field name variations', () => {
      const fields: FormField[] = [
        {
          id: 'field1',
          name: 'fname',
          type: 'text',
          selector: '#fname',
          label: 'First Name',
          required: true
        },
        {
          id: 'field2',
          name: 'lname',
          type: 'text',
          selector: '#lname',
          label: 'Last Name',
          required: true
        },
        {
          id: 'field3',
          name: 'e-mail',
          type: 'email',
          selector: '#email',
          label: 'Email',
          required: true
        }
      ];

      const { mappings, unmappedFields } = fieldMapper.mapProfileToFields(mockProfile, fields);

      expect(mappings['fname']).toBe('John');
      expect(mappings['lname']).toBe('Doe');
      expect(mappings['e-mail']).toBe('john.doe@example.com');
      expect(unmappedFields).toHaveLength(0);
    });

    it('should handle type-based matching', () => {
      const fields: FormField[] = [
        {
          id: 'field1',
          name: 'userEmail',
          type: 'email',
          selector: '#user-email',
          label: 'Your Email',
          required: true
        },
        {
          id: 'field2',
          name: 'phoneNumber',
          type: 'tel',
          selector: '#phone',
          label: 'Phone',
          required: false
        }
      ];

      const { mappings, unmappedFields } = fieldMapper.mapProfileToFields(mockProfile, fields);

      expect(mappings['userEmail']).toBe('john.doe@example.com');
      expect(mappings['phoneNumber']).toBe('+1234567890');
      expect(unmappedFields).toHaveLength(0);
    });

    it('should identify unmapped fields', () => {
      const fields: FormField[] = [
        {
          id: 'field1',
          name: 'firstName',
          type: 'text',
          selector: '#first-name',
          label: 'First Name',
          required: true
        },
        {
          id: 'field2',
          name: 'unknownField',
          type: 'text',
          selector: '#unknown',
          label: 'Unknown Field',
          required: false
        },
        {
          id: 'field3',
          name: 'anotherUnknown',
          type: 'text',
          selector: '#another',
          label: 'Another Unknown',
          required: false
        }
      ];

      const { mappings, unmappedFields } = fieldMapper.mapProfileToFields(mockProfile, fields);

      expect(mappings['firstName']).toBe('John');
      expect(unmappedFields).toContain('unknownField');
      expect(unmappedFields).toContain('anotherUnknown');
      expect(unmappedFields).toHaveLength(2);
    });

    it('should handle special fields', () => {
      const fields: FormField[] = [
        {
          id: 'field1',
          name: 'fullName',
          type: 'text',
          selector: '#full-name',
          label: 'Full Name',
          required: true
        },
        {
          id: 'field2',
          name: 'dateOfBirth',
          type: 'date',
          selector: '#dob',
          label: 'Date of Birth',
          required: false
        },
        {
          id: 'field3',
          name: 'company',
          type: 'text',
          selector: '#company',
          label: 'Company',
          required: false
        }
      ];

      const { mappings, unmappedFields } = fieldMapper.mapProfileToFields(mockProfile, fields);

      expect(mappings['fullName']).toBe('John Doe');
      expect(mappings['dateOfBirth']).toBe('1990-01-01');
      expect(mappings['company']).toBe('Acme Corp');
      expect(unmappedFields).toHaveLength(0);
    });

    it('should skip empty profile values', () => {
      const profileWithEmptyValues: ClientProfile = {
        ...mockProfile,
        personalData: {
          ...mockProfile.personalData,
          phone: '', // Empty phone
          address: {
            ...mockProfile.personalData.address!,
            city: '' // Empty city
          }
        }
      };

      const fields: FormField[] = [
        {
          id: 'field1',
          name: 'firstName',
          type: 'text',
          selector: '#first-name',
          label: 'First Name',
          required: true
        },
        {
          id: 'field2',
          name: 'phone',
          type: 'tel',
          selector: '#phone',
          label: 'Phone',
          required: false
        },
        {
          id: 'field3',
          name: 'city',
          type: 'text',
          selector: '#city',
          label: 'City',
          required: false
        }
      ];

      const { mappings, unmappedFields } = fieldMapper.mapProfileToFields(profileWithEmptyValues, fields);

      expect(mappings['firstName']).toBe('John');
      expect(mappings['phone']).toBeUndefined();
      expect(mappings['city']).toBeUndefined();
      expect(unmappedFields).toContain('phone');
      expect(unmappedFields).toContain('city');
    });
  });

  describe('validateFieldMapping', () => {
    it('should validate email format', () => {
      const fields: FormField[] = [
        {
          id: 'field1',
          name: 'email',
          type: 'email',
          selector: '#email',
          label: 'Email',
          required: true
        }
      ];

      const validMappings = { email: 'john@example.com' };
      const invalidMappings = { email: 'invalid-email' };

      const validWarnings = fieldMapper.validateFieldMapping(validMappings, fields);
      const invalidWarnings = fieldMapper.validateFieldMapping(invalidMappings, fields);

      expect(validWarnings).toHaveLength(0);
      expect(invalidWarnings).toHaveLength(1);
      expect(invalidWarnings[0]).toContain('Invalid email format');
    });

    it('should validate phone format', () => {
      const fields: FormField[] = [
        {
          id: 'field1',
          name: 'phone',
          type: 'tel',
          selector: '#phone',
          label: 'Phone',
          required: false
        }
      ];

      const validMappings = { phone: '+1234567890' };
      const invalidMappings = { phone: 'invalid-phone!@#' };

      const validWarnings = fieldMapper.validateFieldMapping(validMappings, fields);
      const invalidWarnings = fieldMapper.validateFieldMapping(invalidMappings, fields);

      expect(validWarnings).toHaveLength(0);
      expect(invalidWarnings).toHaveLength(1);
      expect(invalidWarnings[0]).toContain('Invalid phone format');
    });

    it('should check required fields', () => {
      const fields: FormField[] = [
        {
          id: 'field1',
          name: 'firstName',
          type: 'text',
          selector: '#first-name',
          label: 'First Name',
          required: true
        },
        {
          id: 'field2',
          name: 'lastName',
          type: 'text',
          selector: '#last-name',
          label: 'Last Name',
          required: true
        }
      ];

      const incompleteMappings = { firstName: 'John' }; // Missing required lastName
      const emptyMappings = { firstName: 'John', lastName: '' }; // Empty required field

      const incompleteWarnings = fieldMapper.validateFieldMapping(incompleteMappings, fields);
      const emptyWarnings = fieldMapper.validateFieldMapping(emptyMappings, fields);

      expect(incompleteWarnings).toHaveLength(1);
      expect(incompleteWarnings[0]).toContain('Required field lastName is not mapped');

      expect(emptyWarnings).toHaveLength(1);
      expect(emptyWarnings[0]).toContain('Required field lastName is empty');
    });

    it('should handle multiple validation errors', () => {
      const fields: FormField[] = [
        {
          id: 'field1',
          name: 'email',
          type: 'email',
          selector: '#email',
          label: 'Email',
          required: true
        },
        {
          id: 'field2',
          name: 'phone',
          type: 'tel',
          selector: '#phone',
          label: 'Phone',
          required: true
        },
        {
          id: 'field3',
          name: 'firstName',
          type: 'text',
          selector: '#first-name',
          label: 'First Name',
          required: true
        }
      ];

      const problematicMappings = {
        email: 'invalid-email',
        phone: 'invalid-phone!@#'
        // Missing required firstName
      };

      const warnings = fieldMapper.validateFieldMapping(problematicMappings, fields);

      expect(warnings).toHaveLength(3);
      expect(warnings.some(w => w.includes('Invalid email format'))).toBe(true);
      expect(warnings.some(w => w.includes('Invalid phone format'))).toBe(true);
      expect(warnings.some(w => w.includes('Required field firstName is not mapped'))).toBe(true);
    });
  });
});

describe('ProfileFormFiller Integration', () => {
  it('should handle profile with minimal data', () => {
    const minimalProfile: ClientProfile = {
      id: 'minimal-profile',
      userId: 'user-123',
      name: 'Minimal Profile',
      personalData: {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com'
      },
      preferences: {},
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const fieldMapper = new FieldMapper();
    const fields: FormField[] = [
      {
        id: 'field1',
        name: 'firstName',
        type: 'text',
        selector: '#first-name',
        label: 'First Name',
        required: true
      },
      {
        id: 'field2',
        name: 'phone',
        type: 'tel',
        selector: '#phone',
        label: 'Phone',
        required: false
      }
    ];

    const { mappings, unmappedFields } = fieldMapper.mapProfileToFields(minimalProfile, fields);

    expect(mappings['firstName']).toBe('Jane');
    expect(mappings['phone']).toBeUndefined();
    expect(unmappedFields).toContain('phone');
  });

  it('should handle profile with custom fields', () => {
    const profileWithCustomFields: ClientProfile = {
      id: 'custom-profile',
      userId: 'user-123',
      name: 'Custom Profile',
      personalData: {
        firstName: 'Bob',
        lastName: 'Johnson',
        email: 'bob@example.com',
        customFields: {
          jobTitle: 'Software Engineer',
          department: 'Engineering',
          employeeId: 'EMP001'
        }
      },
      preferences: {},
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const fieldMapper = new FieldMapper();
    const fields: FormField[] = [
      {
        id: 'field1',
        name: 'firstName',
        type: 'text',
        selector: '#first-name',
        label: 'First Name',
        required: true
      },
      {
        id: 'field2',
        name: 'jobTitle',
        type: 'text',
        selector: '#job-title',
        label: 'Job Title',
        required: false
      },
      {
        id: 'field3',
        name: 'department',
        type: 'text',
        selector: '#dept',
        label: 'Department',
        required: false
      }
    ];

    const { mappings, unmappedFields } = fieldMapper.mapProfileToFields(profileWithCustomFields, fields);

    expect(mappings['firstName']).toBe('Bob');
    expect(mappings['jobTitle']).toBe('Software Engineer');
    expect(mappings['department']).toBe('Engineering');
    expect(unmappedFields).toHaveLength(0);
  });
});