
export enum UserRole {
  STUDENT = 'STUDENT',
  VIEWER = 'VIEWER',
  MODERATOR = 'MODERATOR',
  CO_ADMIN = 'CO_ADMIN',
  ADMIN = 'ADMIN'
}

export enum TestType {
  LISTENING = 'Listening',
  READING = 'Reading',
  WRITING = 'Writing',
  SPEAKING = 'Speaking',
  MOCK = 'Mock'
}

export enum RegistrationStatus {
  PENDING = 'Pending',
  CONFIRMED = 'Confirmed',
  CANCELLED = 'Cancelled',
  COMPLETED = 'Completed'
}

export enum Gender {
  MALE = 'Male',
  FEMALE = 'Female',
  OTHERS = 'Others'
}

export interface RemainingTests {
  listening: number;
  reading: number;
  writing: number;
  speaking: number;
  mock: number;
}

export interface Student {
  user_id: string;
  name: string;
  phone: string;
  gender: Gender;
  avatar_url: string;
  batch_number: string;
  username: string;
  password: string;
  remaining_tests: RemainingTests;
  created_by: string;
  created_at: string;
  expiry_date: string; // Account validation date
}

export interface Admin {
  admin_id: string;
  username: string;
  password: string;
  role: UserRole;
  created_by: string;
  created_at: string;
}

export interface TestSchedule {
  test_id: string;
  test_type: TestType;
  test_day: string;
  test_date: string;
  test_time: string;
  room_number: string;
  max_capacity: number;
  current_registrations: number;
  created_by: string;
  is_closed: boolean; // Manual control for session status
  is_deleted?: boolean; // Soft delete flag for history persistence
}

export interface Registration {
  reg_id: string;
  user_id: string;
  test_id: string;
  module_type: TestType;
  registration_date: string;
  status: RegistrationStatus;
}

export interface Result {
  result_id: string;
  user_id: string;
  test_id: string;
  listening_score?: number;
  reading_score?: number;
  writing_score?: number;
  speaking_score?: number;
  overall_score?: number;
  published_date: string;
  published_by: string;
}