
# HA Mock & Partial Test Registration System

A modern, glassmorphic IELTS test management portal connected to Supabase.

## 🚀 Setup Instructions

### 1. Database Setup (Supabase)
Go to your [Supabase Dashboard](https://supabase.com), open the **SQL Editor**, and run the following script to create your tables. This script includes soft-delete support and score persistence logic.

```sql
-- 1. CLEAN START (Optional: removes existing tables to ensure fresh schema)
-- DROP TABLE IF EXISTS results;
-- DROP TABLE IF EXISTS registrations;
-- DROP TABLE IF EXISTS tests;
-- DROP TABLE IF EXISTS students;
-- DROP TABLE IF EXISTS admins;

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

-- 4. Test Schedules Table (Soft Delete Support)
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
  is_deleted BOOLEAN DEFAULT FALSE -- This keeps the session data in the DB after "deletion"
);

-- 5. Registrations Table
CREATE TABLE IF NOT EXISTS registrations (
  reg_id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES students(user_id) ON DELETE CASCADE,
  test_id TEXT REFERENCES tests(test_id) ON DELETE SET NULL, -- Keeps record info if test row is removed
  module_type TEXT,
  registration_date DATE,
  status TEXT
);

-- 6. Results Table
CREATE TABLE IF NOT EXISTS results (
  result_id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES students(user_id) ON DELETE CASCADE,
  test_id TEXT REFERENCES tests(test_id) ON DELETE SET NULL, -- Keeps score context if test row is removed
  listening_score FLOAT,
  reading_score FLOAT,
  writing_score FLOAT,
  speaking_score FLOAT,
  overall_score FLOAT,
  published_date TIMESTAMPTZ DEFAULT NOW(),
  published_by TEXT
);

-- 7. Security & Access (Row Level Security)
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE results ENABLE ROW LEVEL SECURITY;

-- Policies (Public Access for this prototype - restrict these for production)
CREATE POLICY "Allow All" ON admins FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow All" ON students FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow All" ON tests FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow All" ON registrations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow All" ON results FOR ALL USING (true) WITH CHECK (true);

-- 8. Seed Admin
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
- **New Supabase Integration**:njbmcxkmugnabqfwvolr project connected.
- **Score Persistence**: Even if an admin removes a session from the schedule, student results remain safely stored in their profiles.
- **Metadata Visibility**: Room, Date, and Time remain visible for "Archived" sessions.
- **Multi-Role**: Admin, Co-Admin, Moderator, Viewer, and Student portals.
