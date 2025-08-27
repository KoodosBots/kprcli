import { UserSchema, ClientProfileSchema, FormTemplateSchema } from './types';

describe('Shared Types', () => {
  describe('UserSchema', () => {
    it('should validate a valid user object', () => {
      const validUser = {
        id: 'user-123',
        email: 'test@example.com',
        subscriptionTier: 'solo' as const,
        deviceCount: 1,
        dailyExecutions: 5,
        createdAt: new Date(),
        lastActive: new Date()
      };

      const result = UserSchema.safeParse(validUser);
      expect(result.success).toBe(true);
    });

    it('should reject invalid email', () => {
      const invalidUser = {
        id: 'user-123',
        email: 'invalid-email',
        subscriptionTier: 'solo' as const,
        createdAt: new Date(),
        lastActive: new Date()
      };

      const result = UserSchema.safeParse(invalidUser);
      expect(result.success).toBe(false);
    });
  });

  describe('ClientProfileSchema', () => {
    it('should validate a valid profile object', () => {
      const validProfile = {
        id: 'profile-123',
        userId: 'user-123',
        name: 'Test Profile',
        personalData: {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com'
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = ClientProfileSchema.safeParse(validProfile);
      expect(result.success).toBe(true);
    });
  });

  describe('FormTemplateSchema', () => {
    it('should validate a valid form template', () => {
      const validTemplate = {
        id: 'template-123',
        url: 'https://example.com/form',
        domain: 'example.com',
        formType: 'registration',
        fields: [
          {
            id: 'field-1',
            name: 'email',
            type: 'email' as const,
            selector: '#email',
            label: 'Email Address',
            required: true
          }
        ],
        selectors: {
          form: '#registration-form'
        },
        successRate: 95.5,
        lastUpdated: new Date(),
        version: 1
      };

      const result = FormTemplateSchema.safeParse(validTemplate);
      expect(result.success).toBe(true);
    });
  });
});