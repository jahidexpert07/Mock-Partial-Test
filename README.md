
# HA Mock & Partial Test Registration System

A modern, glassmorphic IELTS test management portal connected to Supabase.

## 🚀 Setup Instructions

### 1. Database Setup (Supabase)
Go to your [Supabase Dashboard](https://supabase.com), open the **SQL Editor**, and run the following script to create your tables:

```sql
-- 1. Admins Table
CREATE TABLE IF NOT EXISTS admins (
  admin_id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Students Table
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

-- 3. Test Schedules Table
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

-- 4. Registrations Table
CREATE TABLE IF NOT EXISTS registrations (
  reg_id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES students(user_id) ON DELETE CASCADE,
  test_id TEXT REFERENCES tests(test_id) ON DELETE SET NULL,
  module_type TEXT,
  registration_date DATE,
  status TEXT
);

-- 5. Results Table
CREATE TABLE IF NOT EXISTS results (
  result_id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES students(user_id) ON DELETE CASCADE,
  test_id TEXT REFERENCES tests(test_id) ON DELETE SET NULL,
  listening_score FLOAT,
  reading_score FLOAT,
  writing_score FLOAT,
  speaking_score FLOAT,
  overall_score FLOAT,
  published_date TIMESTAMPTZ DEFAULT NOW(),
  published_by TEXT
);

-- Enable RLS
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE results ENABLE ROW LEVEL SECURITY;

-- Policies (Public Access)
CREATE POLICY "Allow All" ON admins FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow All" ON students FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow All" ON tests FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow All" ON registrations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow All" ON results FOR ALL USING (true) WITH CHECK (true);

-- Initial Admin
INSERT INTO admins (admin_id, username, password, role, created_by)
VALUES ('1', 'HA.admin01', 'HA@2007.app', 'ADMIN', 'System')
ON CONFLICT (admin_id) DO NOTHING;
```

### 2. Deployment (GitHub & Vercel)
1.  **Push to GitHub**: Create a new repository on GitHub and push these files.
2.  **Connect to Vercel**:
    *   Go to [Vercel](https://vercel.com) and click **"Add New Project"**.
    *   Import your GitHub repository.
    *   Vercel will automatically detect the Vite settings.
    *   Click **"Deploy"**.

## 🛠 Features
- **Supabase Integration**: Real-time database syncing.
- **Score Persistence**: Even if an admin removes a session from the schedule, student results remain safely stored in their profiles.
- **Soft Delete**: Sessions are hidden rather than purged to maintain historical accuracy.
- **Multi-Role**: Admin, Co-Admin, Moderator, Viewer, and Student portals.
