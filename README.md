
# HA Mock & Partial Test Registration System

A modern, glassmorphic IELTS test management portal connected to Supabase.

## 🚀 Setup Instructions

### 1. Database Setup (Supabase)
Go to your [Supabase Dashboard](https://supabase.com), open the **SQL Editor**, and run the following script. **Note: This script uses CASCADE on student deletion to ensure all registration and result data is removed when a student's account is wiped (e.g., when expired).**

```sql
-- 1. Settings Table (For Maintenance Mode)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- 2. Admins Table
CREATE TABLE IF NOT EXISTS admins (
  admin_id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Students Table
CREATE TABLE IF NOT EXISTS students (
  user_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  gender TEXT,
  avatar_url TEXT,
  batch_number TEXT,
  username TEXT,
  password TEXT,
  remaining_tests JSONB NOT NULL DEFAULT '{"listening": 0, "reading": 0, "writing": 0, "speaking": 0, "mock": 0}'::jsonb,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expiry_date DATE
);

-- 4. Test Schedules Table
CREATE TABLE IF NOT EXISTS tests (
  test_id TEXT PRIMARY KEY,
  test_type TEXT NOT NULL,
  test_day TEXT,
  test_date DATE NOT NULL,
  test_time TEXT,
  room_number TEXT,
  max_capacity INT DEFAULT 30,
  current_registrations INT DEFAULT 0,
  created_by TEXT,
  is_closed BOOLEAN DEFAULT FALSE,
  is_deleted BOOLEAN DEFAULT FALSE 
);

-- 5. Registrations Table (With CASCADE DELETE)
CREATE TABLE IF NOT EXISTS registrations (
  reg_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  test_id TEXT REFERENCES tests(test_id) ON DELETE SET NULL, 
  module_type TEXT,
  registration_date DATE,
  status TEXT,
  speaking_date DATE,
  speaking_time TEXT,
  speaking_room TEXT,
  guest_name TEXT,
  guest_phone TEXT
);

-- 6. Results Table (With CASCADE DELETE)
CREATE TABLE IF NOT EXISTS results (
  result_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  test_id TEXT REFERENCES tests(test_id) ON DELETE SET NULL, 
  listening_score FLOAT,
  reading_score FLOAT,
  writing_score FLOAT,
  speaking_score FLOAT,
  overall_score FLOAT,
  published_date TIMESTAMPTZ DEFAULT NOW(),
  published_by TEXT
);

-- 7. Security & Access
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE results ENABLE ROW LEVEL SECURITY;

-- Public Access Policies
CREATE POLICY "Allow All" ON settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow All" ON admins FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow All" ON students FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow All" ON tests FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow All" ON registrations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow All" ON results FOR ALL USING (true) WITH CHECK (true);

-- 8. Default Admin
INSERT INTO admins (admin_id, username, password, role, created_by)
VALUES ('1', 'HA.admin01', 'HA@2007.app', 'ADMIN', 'System')
ON CONFLICT (admin_id) DO NOTHING;

-- 9. Initialize System Lock
INSERT INTO settings (key, value)
VALUES ('system_lock', 'false')
ON CONFLICT (key) DO NOTHING;
```

### 2. Deployment (GitHub & Vercel)
1.  **Push to GitHub**: Create a new repository on GitHub and push these files.
2.  **Connect to Vercel**: Vercel will automatically detect the Vite settings.

## 🛠 Features
- **Automatic Account Wiping**: When an admin logs in, the system automatically checks for expired students and permanently removes their accounts and all related data (registrations, scores).
- **Maintenance Lockdown**: Admins can block student access with a custom "Result Publishing Ongoing" message.
- **Paid Test receipts**: Confirmation receipts for guest students without portal accounts.
