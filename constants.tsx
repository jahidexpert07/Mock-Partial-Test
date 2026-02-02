
import { UserRole, TestType } from './types';

export const ADMIN_PRIMARY_COLOR = '#2c3e50';
export const ACCENT_GREEN = '#27ae60';

export const INITIAL_ADMINS = [
  {
    admin_id: '1',
    username: 'HA.admin01',
    password: 'HA@2007.app',
    role: UserRole.ADMIN,
    created_by: 'System',
    created_at: new Date().toISOString()
  }
];

// Production ready: Start with an empty test schedule
export const MOCK_TESTS = [];
