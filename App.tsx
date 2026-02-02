
import React, { useState, useEffect, useMemo } from 'react';
import { HashRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { createClient } from '@supabase/supabase-js';
import { 
  UserRole, Student, Admin, TestSchedule, Registration, Result, TestType, RegistrationStatus, RemainingTests, Gender 
} from './types';
import { INITIAL_ADMINS, MOCK_TESTS } from './constants';

const STORAGE_KEY = 'ielts_system_supabase_v1';

// --- SUPABASE CONFIGURATION ---
const SUPABASE_URL = 'https://cirfftfeoegwzipfpyiq.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Z64vGG6BaXHAo3BAov8WJA_8f8i3Y5b';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

interface AppState {
  students: Student[];
  admins: Admin[];
  tests: TestSchedule[];
  registrations: Registration[];
  results: Result[];
}

// --- GLOBAL UTILITIES ---

const formatDate = (dateStr: string) => {
  if (!dateStr) return '--/--/----';
  const parts = dateStr.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return new Date(dateStr).toLocaleDateString('en-GB');
};

const getWeekday = (dateStr: string) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { weekday: 'long' });
};

const UserAvatar: React.FC<{ role: UserRole; id: string; name?: string; className?: string }> = ({ role, id, name, className = "" }) => {
  const seed = `${id}-${role}`;
  const bgColor = role === UserRole.STUDENT ? 'dcfce7' : 'dbeafe';
  const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}&backgroundColor=${bgColor}&clothing=overall&topColor=3c4e5e&accessories=none`;
  
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    const initials = name ? name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) : id.substring(0, 2);
    const bgClass = role === UserRole.STUDENT ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700';
    return (
      <div className={`${className} flex items-center justify-center font-black text-xs ${bgClass}`}>
        {initials}
      </div>
    );
  }

  return (
    <img 
      src={avatarUrl} 
      alt="Avatar" 
      className={`${className} object-cover`}
      onError={() => setHasError(true)}
      loading="lazy"
    />
  );
};

const generateAvatar = (role: UserRole, id: string) => {
  const seed = `${id}-${role}`;
  const bgColor = role === UserRole.STUDENT ? 'dcfce7' : 'dbeafe';
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}&backgroundColor=${bgColor}&clothing=overall&topColor=3c4e5e&accessories=none`;
};

// --- SUPABASE SYNC ENGINE ---

const SupabaseAPI = {
  async getData(): Promise<AppState | null> {
    try {
      const [st, ad, ts, rg, rs] = await Promise.all([
        supabase.from('students').select('*'),
        supabase.from('admins').select('*'),
        supabase.from('tests').select('*'),
        supabase.from('registrations').select('*'),
        supabase.from('results').select('*')
      ]);

      if (st.error || ad.error || ts.error || rg.error || rs.error) {
        console.error("Supabase Data Fetch error", { st: st.error, ad: ad.error });
        return null;
      }

      return {
        students: st.data || [],
        admins: ad.data || INITIAL_ADMINS,
        tests: ts.data || MOCK_TESTS,
        registrations: rg.data || [],
        results: rs.data || []
      };
    } catch (e) {
      console.error("Supabase API Connection error:", e);
      return null;
    }
  },

  async upsertStudent(student: Student) {
    return supabase.from('students').upsert(student);
  },

  async deleteStudent(userId: string) {
    return supabase.from('students').delete().eq('user_id', userId);
  },

  async upsertTest(test: TestSchedule) {
    return supabase.from('tests').upsert(test);
  },

  async deleteTest(testId: string) {
    return supabase.from('tests').delete().eq('test_id', testId);
  },

  async upsertRegistration(reg: Registration) {
    return supabase.from('registrations').upsert(reg);
  },

  async upsertResult(res: Result) {
    return supabase.from('results').upsert(res);
  },

  async deleteResult(resultId: string) {
    return supabase.from('results').delete().eq('result_id', resultId);
  },

  async upsertAdmin(admin: Admin) {
    return supabase.from('admins').upsert(admin);
  },

  async deleteAdmin(adminId: string) {
    return supabase.from('admins').delete().eq('admin_id', adminId);
  },

  async purgeOldData() {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const isoDate = oneYearAgo.toISOString();

    const { data: oldStudents, error } = await supabase
      .from('students')
      .select('user_id')
      .lt('created_at', isoDate);

    if (error) {
      console.error("Purge Error:", error);
      return false;
    }

    if (oldStudents && oldStudents.length > 0) {
      const ids = oldStudents.map(s => s.user_id);
      const { error: deleteError } = await supabase
        .from('students')
        .delete()
        .in('user_id', ids);
      
      if (deleteError) {
        console.error("Deletion during purge failed:", deleteError);
        return false;
      }
      return true;
    }
    return false;
  }
};

const getInitialState = (): AppState => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) return JSON.parse(stored);
  return {
    students: [],
    admins: INITIAL_ADMINS,
    tests: MOCK_TESTS,
    registrations: [],
    results: []
  };
};

const calculateIELTSBand = (l: number, r: number, w: number, s: number): number => {
  const avg = (l + r + w + s) / 4;
  const whole = Math.floor(avg);
  const frac = avg - whole;
  if (frac < 0.25) return whole;
  if (frac < 0.75) return whole + 0.5;
  return whole + 1;
};

// --- UI Components ---

const Button: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  variant?: 'primary' | 'secondary' | 'danger' | 'success';
  className?: string;
  disabled?: boolean;
}> = ({ children, onClick, type = 'button', variant = 'primary', className = '', disabled }) => {
  const base = "px-5 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2";
  const variants = {
    primary: "bg-[#6c3baa] text-white hover:bg-[#5a318e] shadow-lg shadow-purple-100",
    secondary: "bg-white/40 backdrop-blur-md text-[#6c3baa] border-2 border-[#6c3baa] hover:bg-white",
    danger: "bg-red-50 text-red-600 hover:bg-red-100 border border-red-200",
    success: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200",
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
};

const Card: React.FC<{ children: React.ReactNode; title?: string; subtitle?: string; className?: string }> = ({ children, title, subtitle, className = '' }) => (
  <div className={`bg-white/30 backdrop-blur-2xl rounded-[2rem] border border-white/40 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] p-6 md:p-8 ${className}`}>
    {title && (
      <div className="mb-6">
        <h3 className="text-xl font-black text-slate-900">{title}</h3>
        {subtitle && <p className="text-sm text-slate-500 mt-1 font-medium">{subtitle}</p>}
      </div>
    )}
    {children}
  </div>
);

const Badge: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color = 'brand' }) => {
  const colors: Record<string, string> = {
    brand: "bg-purple-100/50 text-[#6c3baa] border border-purple-200/50",
    green: "bg-emerald-100/50 text-emerald-700 border border-emerald-200/50",
    slate: "bg-slate-100/50 text-slate-600 border border-slate-200/50",
    red: "bg-red-100/50 text-red-600 border border-red-200/50",
    blue: "bg-blue-100/50 text-blue-700 border border-blue-200/50",
    amber: "bg-amber-100/50 text-amber-700 border border-amber-200/50",
    sky: "bg-[#38b6ff]/10 text-[#38b6ff] border border-[#38b6ff]/20",
  };
  return (
    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest backdrop-blur-md ${colors[color] || colors.brand}`}>
      {children}
    </span>
  );
};

const SearchInput: React.FC<{ value: string; onChange: (v: string) => void; placeholder?: string }> = ({ value, onChange, placeholder = "Search..." }) => (
  <div className="relative w-full max-sm:hidden">
    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
      <svg className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    </div>
    <input
      type="text"
      className="block w-full pl-11 pr-4 py-3 border border-white/50 rounded-xl focus:ring-2 focus:ring-[#6c3baa] focus:border-[#6c3baa] outline-none text-slate-900 font-medium bg-white/40 backdrop-blur-xl text-sm transition-all"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  </div>
);

const PasswordInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
  disabled?: boolean;
}> = ({ value, onChange, placeholder = "Enter password", className = "", required = false, disabled = false }) => {
  const [show, setShow] = useState(false);
  return (
    <div className={`relative ${className}`}>
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        className="w-full px-5 py-3 border border-slate-200/50 rounded-xl focus:ring-4 focus:ring-[#B2A5FF]/20 focus:border-[#6c3baa] outline-none text-slate-900 font-bold bg-white/60 backdrop-blur-md transition-all pr-12"
      />
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-[#6c3baa]"
      >
        {show ? (
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
        ) : (
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" /></svg>
        )}
      </button>
    </div>
  );
};

// --- Page Components ---

const AdminDashboard = ({ data }: { data: AppState }) => {
  const stats = [
    { label: 'Total Students', value: data.students.length, color: 'brand' },
    { label: 'Upcoming Tests', value: data.tests.filter(t => !t.is_closed).length, color: 'blue' },
    { label: 'Total Registrations', value: data.registrations.length, color: 'green' },
    { label: 'Published Results', value: data.results.length, color: 'amber' },
  ];

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <h2 className="text-4xl font-black text-slate-900 leading-tight">Admin Overview</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((s, idx) => (
          <Card key={idx} title={s.label}>
             <p className="text-4xl font-black text-slate-900">{s.value}</p>
          </Card>
        ))}
      </div>
    </div>
  );
};

const StudentManager = ({ 
  students, onAdd, onDelete, isReadOnly 
}: { 
  students: Student[]; 
  onAdd: (s: any) => Promise<any>; 
  onUpdate: (s: Student) => Promise<void>; 
  onDelete: (id: string) => Promise<void>;
  isReadOnly: boolean;
  data: AppState;
  currentAdmin: any;
  userRole: any;
}) => {
  const [search, setSearch] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [newStudent, setNewStudent] = useState({ user_id: '', name: '', phone: '', gender: Gender.MALE, batch_number: '', expiry_date: '' });

  const filtered = students.filter(s => 
    s.name.toLowerCase().includes(search.toLowerCase()) || 
    s.user_id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-3xl font-black text-slate-900">Student Directory</h2>
        <div className="flex gap-2 w-full md:w-auto">
          <SearchInput value={search} onChange={setSearch} placeholder="Search by name or ID..." />
          {!isReadOnly && <Button onClick={() => setIsAdding(true)}>Add Student</Button>}
        </div>
      </div>

      {isAdding && (
        <Card title="Register New Student">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <input className="px-4 py-2 border rounded-xl" placeholder="User ID" value={newStudent.user_id} onChange={e => setNewStudent({...newStudent, user_id: e.target.value})} />
            <input className="px-4 py-2 border rounded-xl" placeholder="Full Name" value={newStudent.name} onChange={e => setNewStudent({...newStudent, name: e.target.value})} />
            <input className="px-4 py-2 border rounded-xl" placeholder="Phone" value={newStudent.phone} onChange={e => setNewStudent({...newStudent, phone: e.target.value})} />
            <input className="px-4 py-2 border rounded-xl" placeholder="Batch" value={newStudent.batch_number} onChange={e => setNewStudent({...newStudent, batch_number: e.target.value})} />
            <input className="px-4 py-2 border rounded-xl" type="date" value={newStudent.expiry_date} onChange={e => setNewStudent({...newStudent, expiry_date: e.target.value})} />
            <select className="px-4 py-2 border rounded-xl" value={newStudent.gender} onChange={e => setNewStudent({...newStudent, gender: e.target.value as Gender})}>
              <option value={Gender.MALE}>Male</option>
              <option value={Gender.FEMALE}>Female</option>
              <option value={Gender.OTHERS}>Others</option>
            </select>
          </div>
          <div className="flex gap-2">
            <Button onClick={async () => {
              const res = await onAdd({ ...newStudent, remaining_tests: { listening: 0, reading: 0, writing: 0, speaking: 0, mock: 0 } });
              if (res) setIsAdding(false);
            }}>Save Student</Button>
            <Button variant="secondary" onClick={() => setIsAdding(false)}>Cancel</Button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map(s => (
          <Card key={s.user_id} className="relative">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-full overflow-hidden bg-slate-100">
                <UserAvatar role={UserRole.STUDENT} id={s.user_id} name={s.name} className="w-full h-full" />
              </div>
              <div>
                <p className="font-black text-slate-900">{s.name}</p>
                <p className="text-xs text-slate-500 font-bold uppercase tracking-tighter">ID: {s.user_id}</p>
              </div>
            </div>
            <div className="space-y-1 text-sm">
              <p><span className="text-slate-400 font-bold">Batch:</span> {s.batch_number}</p>
              <p><span className="text-slate-400 font-bold">Phone:</span> {s.phone}</p>
              <p><span className="text-slate-400 font-bold">Expires:</span> {formatDate(s.expiry_date)}</p>
            </div>
            {!isReadOnly && (
              <div className="flex gap-2 mt-4">
                <Button variant="danger" className="text-[10px] py-1 px-3" onClick={() => { if(confirm('Delete student?')) onDelete(s.user_id) }}>Delete</Button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
};

const ScheduleManager = ({ data, onAdd, onDelete, isReadOnly }: { data: AppState, onAdd: (t: any) => Promise<void>, onUpdate: (t: TestSchedule) => Promise<void>, onDelete: (id: string) => Promise<void>, isReadOnly: boolean }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newTest, setNewTest] = useState({ test_type: TestType.LISTENING, test_date: '', test_time: '', room_number: '', max_capacity: 10 });

  return (
    <div className="space-y-6">
       <div className="flex justify-between items-center">
        <h2 className="text-3xl font-black text-slate-900">Test Schedules</h2>
        {!isReadOnly && <Button onClick={() => setIsAdding(true)}>Create Session</Button>}
      </div>

      {isAdding && (
        <Card title="Schedule New Session">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <select className="px-4 py-2 border rounded-xl" value={newTest.test_type} onChange={e => setNewTest({...newTest, test_type: e.target.value as TestType})}>
              {Object.values(TestType).map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <input className="px-4 py-2 border rounded-xl" type="date" value={newTest.test_date} onChange={e => setNewTest({...newTest, test_date: e.target.value})} />
            <input className="px-4 py-2 border rounded-xl" type="time" value={newTest.test_time} onChange={e => setNewTest({...newTest, test_time: e.target.value})} />
            <input className="px-4 py-2 border rounded-xl" placeholder="Room" value={newTest.room_number} onChange={e => setNewTest({...newTest, room_number: e.target.value})} />
          </div>
          <div className="flex gap-2">
            <Button onClick={async () => {
              await onAdd({ ...newTest, test_day: getWeekday(newTest.test_date) });
              setIsAdding(false);
            }}>Save Session</Button>
            <Button variant="secondary" onClick={() => setIsAdding(false)}>Cancel</Button>
          </div>
        </Card>
      )}

      <div className="grid gap-4">
        {data.tests.map(t => (
          <Card key={t.test_id} className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-2xl bg-slate-100">
                <svg className="w-6 h-6 text-[#6c3baa]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
              </div>
              <div>
                <p className="font-black text-slate-900">{t.test_type} - {t.test_day}</p>
                <p className="text-sm text-slate-500 font-bold">{formatDate(t.test_date)} at {t.test_time} • Room {t.room_number}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Badge color={t.current_registrations >= t.max_capacity ? 'red' : 'green'}>
                {t.current_registrations}/{t.max_capacity} Enrolled
              </Badge>
              {!isReadOnly && (
                <Button variant="danger" className="py-1 px-3 text-xs" onClick={() => onDelete(t.test_id)}>Cancel</Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

const AdminResults = ({ data, onAddResult, onDeleteResult, isReadOnly }: { data: AppState, onAddResult: (r: any) => Promise<void>, onDeleteResult: (id: string) => Promise<void>, isReadOnly: boolean, onUpdateResult: any }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newRes, setNewRes] = useState({ user_id: '', test_id: '', l: 0, r: 0, w: 0, s: 0 });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-black text-slate-900">Result Management</h2>
        {!isReadOnly && <Button onClick={() => setIsAdding(true)}>Publish Result</Button>}
      </div>

      {isAdding && (
        <Card title="Entry Scores">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-4">
            <input className="px-4 py-2 border rounded-xl col-span-2 md:col-span-1" placeholder="Student ID" value={newRes.user_id} onChange={e => setNewRes({...newRes, user_id: e.target.value})} />
            <select className="px-4 py-2 border rounded-xl col-span-2 md:col-span-1" value={newRes.test_id} onChange={e => setNewRes({...newRes, test_id: e.target.value})}>
              <option value="">Select Test</option>
              {data.tests.map(t => <option key={t.test_id} value={t.test_id}>{t.test_type} ({formatDate(t.test_date)})</option>)}
            </select>
            <input type="number" step="0.5" className="px-4 py-2 border rounded-xl" placeholder="L" onChange={e => setNewRes({...newRes, l: parseFloat(e.target.value)})} />
            <input type="number" step="0.5" className="px-4 py-2 border rounded-xl" placeholder="R" onChange={e => setNewRes({...newRes, r: parseFloat(e.target.value)})} />
            <input type="number" step="0.5" className="px-4 py-2 border rounded-xl" placeholder="W" onChange={e => setNewRes({...newRes, w: parseFloat(e.target.value)})} />
            <input type="number" step="0.5" className="px-4 py-2 border rounded-xl" placeholder="S" onChange={e => setNewRes({...newRes, s: parseFloat(e.target.value)})} />
          </div>
          <div className="flex gap-2">
            <Button onClick={async () => {
              const overall = calculateIELTSBand(newRes.l, newRes.r, newRes.w, newRes.s);
              await onAddResult({ ...newRes, overall_score: overall });
              setIsAdding(false);
            }}>Publish</Button>
            <Button variant="secondary" onClick={() => setIsAdding(false)}>Cancel</Button>
          </div>
        </Card>
      )}

      <div className="grid gap-4">
        {data.results.map(r => {
          const student = data.students.find(s => s.user_id === r.user_id);
          return (
            <Card key={r.result_id} className="flex justify-between items-center">
              <div>
                <p className="font-black text-slate-900">{student?.name || r.user_id}</p>
                <div className="flex gap-4 text-xs font-bold text-slate-500 uppercase mt-1">
                  <span>L: {r.listening_score}</span>
                  <span>R: {r.reading_score}</span>
                  <span>W: {r.writing_score}</span>
                  <span>S: {r.speaking_score}</span>
                  <Badge color="blue">Band: {r.overall_score}</Badge>
                </div>
              </div>
              {!isReadOnly && <Button variant="danger" className="p-2" onClick={() => onDeleteResult(r.result_id)}>Remove</Button>}
            </Card>
          );
        })}
      </div>
    </div>
  );
};

const ReportsView = ({ data }: { data: AppState }) => {
  const avgScores = data.results.length > 0 
    ? (data.results.reduce((acc, curr) => acc + (curr.overall_score || 0), 0) / data.results.length).toFixed(1)
    : '0.0';

  return (
    <div className="space-y-10">
      <h2 className="text-3xl font-black text-slate-900">Performance Reports</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card title="Academic Summary">
           <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="font-bold text-slate-500">Average Band Score</span>
                <span className="text-2xl font-black text-[#6c3baa]">{avgScores}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-bold text-slate-500">Top Scoring Student</span>
                <span className="font-black text-emerald-600">
                  {data.results.length > 0 ? data.students.find(s => s.user_id === [...data.results].sort((a,b) => (b.overall_score || 0) - (a.overall_score || 0))[0].user_id)?.name : 'N/A'}
                </span>
              </div>
           </div>
        </Card>
        <Card title="Activity Levels">
           <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="font-bold text-slate-500">Active Registrations</span>
                <span className="font-black text-blue-600">{data.registrations.length}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-bold text-slate-500">Scheduled Sessions</span>
                <span className="font-black text-slate-900">{data.tests.length}</span>
              </div>
           </div>
        </Card>
      </div>
    </div>
  );
};

const AvailableTests = ({ student, data, onRegister }: { student: Student | null, data: AppState, onRegister: (t: TestSchedule) => Promise<void> }) => {
  if (!student) return null;
  const isExpired = new Date(student.expiry_date) < new Date();
  
  const upcoming = data.tests.filter(t => !t.is_closed && new Date(t.test_date) >= new Date());

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-black text-slate-900">Available Test Slots</h2>
      {isExpired ? (
        <div className="bg-red-50 p-6 rounded-3xl border border-red-100 text-red-600 font-bold">
          Your account has expired. Please contact administration to renew.
        </div>
      ) : (
        <div className="grid gap-4">
          {upcoming.map(t => {
            const hasQuota = (student.remaining_tests as any)[t.test_type.toLowerCase()] > 0;
            const isFull = t.current_registrations >= t.max_capacity;
            const isAlreadyRegistered = data.registrations.some(r => r.user_id === student.user_id && r.test_id === t.test_id);

            return (
              <Card key={t.test_id} className="flex justify-between items-center">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-black text-slate-900 text-lg">{t.test_type}</p>
                    <Badge color="sky">{t.room_number}</Badge>
                  </div>
                  <p className="text-sm font-bold text-slate-500">{formatDate(t.test_date)} • {t.test_time}</p>
                </div>
                <div className="flex items-center gap-4">
                  {isAlreadyRegistered ? (
                    <Badge color="green">Registered</Badge>
                  ) : isFull ? (
                    <Badge color="red">Session Full</Badge>
                  ) : !hasQuota ? (
                    <Badge color="amber">No Quota</Badge>
                  ) : (
                    <Button onClick={() => onRegister(t)}>Book Slot</Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

const RegistrationHistory = ({ student, data }: { student: Student | null, data: AppState }) => {
  if (!student) return null;
  const myRegs = data.registrations.filter(r => r.user_id === student.user_id);

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-black text-slate-900">My Registrations</h2>
      <div className="grid gap-4">
        {myRegs.length === 0 ? (
          <p className="text-slate-500 font-bold italic">No registrations found.</p>
        ) : (
          myRegs.map(r => {
            const test = data.tests.find(t => t.test_id === r.test_id);
            return (
              <Card key={r.reg_id} className="flex justify-between items-center">
                <div>
                  <p className="font-black text-slate-900">{r.module_type}</p>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-tighter">
                    {test ? `${formatDate(test.test_date)} at ${test.test_time}` : 'Date Unknown'}
                  </p>
                </div>
                <Badge color={r.status === RegistrationStatus.CONFIRMED ? 'green' : 'slate'}>{r.status}</Badge>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
};

const StudentResults = ({ student, data }: { student: Student | null, data: AppState }) => {
  if (!student) return null;
  const myResults = data.results.filter(r => r.user_id === student.user_id);

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-black text-slate-900">Performance Record</h2>
      <div className="grid gap-6">
        {myResults.length === 0 ? (
          <p className="text-slate-500 font-bold italic">No published scores yet.</p>
        ) : (
          myResults.map(r => (
            <Card key={r.result_id} className="relative overflow-hidden">
               <div className="absolute top-0 right-0 p-6">
                  <div className="w-16 h-16 rounded-2xl bg-[#6c3baa] text-white flex flex-col items-center justify-center">
                    <span className="text-[8px] font-black uppercase">Band</span>
                    <span className="text-2xl font-black leading-none">{r.overall_score}</span>
                  </div>
               </div>
               <p className="text-slate-400 font-black uppercase tracking-widest text-xs mb-4">Official Result</p>
               <div className="grid grid-cols-4 gap-4">
                  <div className="bg-slate-50 p-4 rounded-2xl text-center">
                    <p className="text-[10px] font-black text-slate-400 uppercase">Listening</p>
                    <p className="text-xl font-black text-slate-900">{r.listening_score}</p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl text-center">
                    <p className="text-[10px] font-black text-slate-400 uppercase">Reading</p>
                    <p className="text-xl font-black text-slate-900">{r.reading_score}</p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl text-center">
                    <p className="text-[10px] font-black text-slate-400 uppercase">Writing</p>
                    <p className="text-xl font-black text-slate-900">{r.writing_score}</p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl text-center">
                    <p className="text-[10px] font-black text-slate-400 uppercase">Speaking</p>
                    <p className="text-xl font-black text-slate-900">{r.speaking_score}</p>
                  </div>
               </div>
               <p className="mt-4 text-[10px] font-bold text-slate-400 uppercase">Published: {formatDate(r.published_date)}</p>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

const StaffManager = ({ admins, onAdd, onDelete, isReadOnly }: { admins: Admin[], onAdd: (a: any) => Promise<void>, onDelete: (id: string) => Promise<void>, isReadOnly: boolean }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newAdmin, setNewAdmin] = useState({ username: '', password: '', role: UserRole.MODERATOR });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-black text-slate-900">Staff Management</h2>
        {!isReadOnly && <Button onClick={() => setIsAdding(true)}>Add Staff</Button>}
      </div>

      {isAdding && (
        <Card title="Register Staff Member">
           <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <input className="px-4 py-2 border rounded-xl" placeholder="Username" value={newAdmin.username} onChange={e => setNewAdmin({...newAdmin, username: e.target.value})} />
              <input className="px-4 py-2 border rounded-xl" placeholder="Password" value={newAdmin.password} onChange={e => setNewAdmin({...newAdmin, password: e.target.value})} />
              <select className="px-4 py-2 border rounded-xl" value={newAdmin.role} onChange={e => setNewAdmin({...newAdmin, role: e.target.value as UserRole})}>
                 <option value={UserRole.VIEWER}>Viewer</option>
                 <option value={UserRole.MODERATOR}>Moderator</option>
                 <option value={UserRole.CO_ADMIN}>Co-Admin</option>
                 <option value={UserRole.ADMIN}>Admin</option>
              </select>
           </div>
           <div className="flex gap-2">
            <Button onClick={async () => {
              await onAdd(newAdmin);
              setIsAdding(false);
            }}>Create Account</Button>
            <Button variant="secondary" onClick={() => setIsAdding(false)}>Cancel</Button>
          </div>
        </Card>
      )}

      <div className="grid gap-4">
        {admins.map(a => (
          <Card key={a.admin_id} className="flex justify-between items-center">
             <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
                  <svg className="w-5 h-5 text-[#6c3baa]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                </div>
                <div>
                   <p className="font-black text-slate-900">{a.username}</p>
                   <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{a.role.replace('_', ' ')}</p>
                </div>
             </div>
             {!isReadOnly && a.role !== UserRole.ADMIN && (
                <Button variant="danger" className="py-1 px-3 text-xs" onClick={() => onDelete(a.admin_id)}>Remove</Button>
             )}
          </Card>
        ))}
      </div>
    </div>
  );
};

const LoginPage = ({ data, onLogin }: { data: AppState, onLogin: (id: string, role: UserRole) => void }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const admin = data.admins.find(a => a.username === username && a.password === password);
    if (admin) { onLogin(admin.admin_id, admin.role); return; }
    
    const student = data.students.find(s => (s.user_id === username || s.username === username) && s.password === password);
    if (student) { onLogin(student.user_id, UserRole.STUDENT); return; }
    
    setError('Invalid credentials. Please check your ID/Password.');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-0 md:p-6 relative overflow-hidden bg-[#B2A5FF]">
      <div className="absolute inset-0 z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-[#B2A5FF] rounded-full blur-[100px] opacity-80"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-white rounded-full blur-[120px] opacity-40"></div>
        <div className="absolute inset-0 backdrop-blur-[40px]"></div>
      </div>

      <div className="max-w-5xl w-full md:rounded-[2.5rem] overflow-hidden flex flex-col md:flex-row min-h-[600px] relative z-10 border-0 shadow-2xl">
        <div className="w-full md:w-1/2 bg-[#6c3baa] p-10 md:p-16 flex flex-col justify-between text-white relative overflow-hidden">
          <div className="relative z-10">
            <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center mb-8 border border-white/30">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h1 className="text-4xl md:text-5xl font-black mb-4 leading-tight">HEXA'S<br/>AMBARKHANA</h1>
            <p className="text-purple-100 text-lg font-medium max-w-xs opacity-90">IELTS & Partial Test Registration Portal.</p>
          </div>
          <div className="mt-12 relative z-10">
            <div className="flex -space-x-3 mb-4">
              {[1,2,3,4].map(i => (
                <div key={i} className="w-10 h-10 rounded-full border-2 border-[#6c3baa] bg-white/20 backdrop-blur-md"></div>
              ))}
              <div className="w-10 h-10 rounded-full bg-white text-[#6c3baa] flex items-center justify-center text-xs font-black">+10k</div>
            </div>
            <p className="text-sm font-bold text-purple-200">Trusted Locally With 10,000+ Students.</p>
          </div>
        </div>

        <div className="w-full md:w-1/2 p-10 md:p-16 flex flex-col justify-center bg-white/95 backdrop-blur-sm">
          <div className="max-w-sm mx-auto w-full">
            <h2 className="text-3xl font-black text-slate-900 mb-2">Welcome Back</h2>
            <p className="text-[#6c3baa] font-bold mb-10 uppercase text-xs tracking-widest">Login Portal</p>
            
            <form onSubmit={handleLogin} className="space-y-6">
              <div>
                <label className="block text-sm font-black text-slate-700 mb-2">User ID</label>
                <input 
                  type="text" 
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-5 py-4 border-2 border-slate-100 rounded-2xl focus:ring-4 focus:ring-[#B2A5FF]/20 focus:border-[#6c3baa] outline-none text-slate-900 font-bold bg-slate-50/50 placeholder-slate-400 transition-all"
                  placeholder="Enter User ID"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-black text-slate-700 mb-2">Password</label>
                <PasswordInput value={password} onChange={setPassword} />
              </div>
              {error && <p className="text-red-600 text-sm font-bold bg-red-50 p-3 rounded-xl border border-red-100">{error}</p>}
              <Button type="submit" className="w-full py-4 text-lg">Enter Portal</Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

const StudentDashboard = ({ student }: { student: Student | null, data: AppState }) => {
  if (!student) return null;
  const totalPartial = student.remaining_tests.listening + student.remaining_tests.reading + student.remaining_tests.writing + student.remaining_tests.speaking;
  const totalMock = student.remaining_tests.mock;
  const isExpired = new Date(student.expiry_date) < new Date();

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="flex items-center gap-5">
           <div className="w-16 h-16 rounded-3xl overflow-hidden border-4 border-white/60 shadow-xl bg-white flex-shrink-0">
              <UserAvatar role={UserRole.STUDENT} id={student.user_id} name={student.name} className="w-full h-full" />
           </div>
           <div>
             <h2 className="text-4xl font-black text-slate-900 leading-tight">Welcome, {student.name}</h2>
             <div className="flex items-center gap-2 mt-1">
                <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Batch: {student.batch_number} • ID: {student.user_id}</p>
                {isExpired ? <Badge color="red">ACCOUNT EXPIRED</Badge> : <Badge color="green">ACCOUNT ACTIVE</Badge>}
             </div>
           </div>
        </div>
        {!isExpired && (
          <Link to="/tests" className="w-full md:w-auto">
            <Button variant="primary" className="w-full md:px-10 py-4 shadow-xl">Book Now</Button>
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:gap-6">
        <Card className="!bg-[#6c3baa] text-white overflow-hidden relative group !border-0">
          <div className="relative z-10">
             <p className="text-purple-200 font-black uppercase tracking-widest text-[8px] md:text-[10px] mb-1">Total Partial</p>
             <p className="text-3xl md:text-5xl font-black leading-none">{totalPartial}</p>
          </div>
          <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-white/10 rounded-full blur-2xl group-hover:scale-110 transition-transform"></div>
        </Card>
        
        <Card className="!bg-[#38b6ff] text-white overflow-hidden relative group !border-0">
          <div className="relative z-10">
             <p className="text-blue-100 font-black uppercase tracking-widest text-[8px] md:text-[10px] mb-1">Total Mock</p>
             <p className="text-3xl md:text-5xl font-black leading-none">{totalMock}</p>
          </div>
          <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-white/10 rounded-full blur-2xl group-hover:scale-110 transition-transform"></div>
        </Card>
      </div>
      
      <div>
        <p className="text-sm font-black text-slate-400 uppercase tracking-[0.2em] mb-6">Module Inventory</p>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {Object.entries(student.remaining_tests).map(([key, val]) => (
            <Card key={key} className="text-center group hover:bg-white/50 transition-colors">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 group-hover:text-[#6c3baa]">{key}</p>
              <p className="text-3xl font-black text-slate-900">{val}</p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

const NavLink: React.FC<{ to: string; children: React.ReactNode; onClick?: () => void }> = ({ to, children, onClick }) => {
  const { pathname } = useLocation();
  const isActive = pathname === to || (pathname === "" && to === "/");
  return (
    <Link 
      to={to} 
      onClick={onClick}
      className={`flex items-center gap-3 px-5 py-4 rounded-2xl text-sm font-black transition-all ${isActive ? 'bg-purple-100/50 text-[#6c3baa] shadow-inner backdrop-blur-xl border border-white/20' : 'text-slate-500 hover:text-[#6c3baa] hover:bg-white/10'}`}
    >
      {children}
    </Link>
  );
};

const App = () => {
  const [loggedID, setLoggedID] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [appData, setAppData] = useState<AppState>(getInitialState());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const fetchFullData = async () => {
    setIsSyncing(true);
    const cloudData = await SupabaseAPI.getData();
    if (cloudData) {
      setAppData(cloudData);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cloudData));
    }
    setIsSyncing(false);
  };

  useEffect(() => {
    fetchFullData();
  }, []);

  const currentStudent = useMemo(() => {
    if (userRole === UserRole.STUDENT && loggedID) return appData.students.find(s => s.user_id === loggedID) || null;
    return null;
  }, [appData.students, loggedID, userRole]);

  const currentAdmin = useMemo(() => {
    if (userRole !== UserRole.STUDENT && loggedID) return appData.admins.find(a => a.admin_id === loggedID) || null;
    return null;
  }, [appData.admins, loggedID, userRole]);

  const handleLogin = async (id: string, role: UserRole) => {
    setLoggedID(id);
    setUserRole(role);
    
    if (role !== UserRole.STUDENT) {
      await SupabaseAPI.purgeOldData();
      await fetchFullData();
    }
  };

  const isReadOnly = userRole === UserRole.VIEWER;

  if (!loggedID || (userRole === UserRole.STUDENT && !currentStudent) || (userRole !== UserRole.STUDENT && userRole !== null && !currentAdmin)) {
    return <LoginPage data={appData} onLogin={handleLogin} />;
  }

  return (
    <HashRouter>
      <div 
        className="min-h-screen flex flex-col md:flex-row text-slate-900 transition-colors duration-500 font-['Inter']"
        style={{ background: 'radial-gradient(circle at 0% 0%, #bfd5ff, #c6a4e0)' }}
      >
        <nav className={`fixed inset-0 z-40 md:relative md:flex w-full md:w-72 bg-white/20 backdrop-blur-3xl flex-col border-r border-white/40 transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
          <div className="p-8 hidden md:block">
            <h2 className="text-xl font-black text-[#6c3baa] tracking-tighter">HEXA'S AMBARKHANA</h2>
            <div className="mt-2 flex items-center gap-2">
               <Badge color="brand">{userRole?.replace('_', ' ')} Portal</Badge>
               {isSyncing ? <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></div> : <div className="w-2 h-2 rounded-full bg-emerald-400"></div>}
            </div>
          </div>
          
          <div className="flex-1 p-6 space-y-2 overflow-y-auto">
            <NavLink to="/" onClick={() => setSidebarOpen(false)}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
              Dashboard
            </NavLink>
            {userRole === UserRole.STUDENT ? (
              <>
                <NavLink to="/tests" onClick={() => setSidebarOpen(false)}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 002-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                  Book a Test
                </NavLink>
                <NavLink to="/history" onClick={() => setSidebarOpen(false)}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
                  My Registrations
                </NavLink>
                <NavLink to="/results" onClick={() => setSidebarOpen(false)}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
                  My Scores
                </NavLink>
              </>
            ) : (
              <>
                <NavLink to="/students" onClick={() => setSidebarOpen(false)}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 01-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
                  Students
                </NavLink>
                <NavLink to="/schedules" onClick={() => setSidebarOpen(false)}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  Schedules
                </NavLink>
                <NavLink to="/admin-results" onClick={() => setSidebarOpen(false)}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                  Results Entry
                </NavLink>
                <NavLink to="/reports" onClick={() => setSidebarOpen(false)}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                  Reports
                </NavLink>
                {userRole === UserRole.ADMIN && (
                  <NavLink to="/staff" onClick={() => setSidebarOpen(false)}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
                    Staff Management
                  </NavLink>
                )}
              </>
            )}
          </div>

          <div className="p-8 bg-black/5 border-t border-white/20">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-[#6c3baa] shadow-sm bg-white">
                <UserAvatar role={userRole || UserRole.VIEWER} id={loggedID || 'guest'} name={currentAdmin?.username || currentStudent?.name} className="w-full h-full" />
              </div>
              <div className="overflow-hidden">
                <p className="text-sm font-black truncate text-slate-900">{currentAdmin?.username || currentStudent?.name}</p>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">{loggedID}</p>
              </div>
            </div>
            <button 
              onClick={() => { setLoggedID(null); setUserRole(null); }} 
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black text-red-500 bg-red-100/50 border border-red-200 hover:bg-red-200 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </nav>

        <div className="md:hidden flex items-center justify-between p-5 bg-[#6c3baa] text-white shadow-lg z-20">
          <h2 className="text-xl font-black tracking-tighter">HEXA'S AMBARKHANA</h2>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 rounded-xl bg-white/20">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d={sidebarOpen ? "M6 18L18 6" : "M4 6h16M4 12h16M4 18h16"} /></svg>
          </button>
        </div>

        <main className="flex-1 p-6 md:p-12 overflow-y-auto max-h-screen">
          <Routes>
            <Route path="/" element={userRole === UserRole.STUDENT ? <StudentDashboard student={currentStudent} data={appData} /> : <AdminDashboard data={appData} />} />
            <Route path="/students" element={<StudentManager students={appData.students} 
                currentAdmin={currentAdmin} userRole={userRole} data={appData}
                onAdd={async (s:any) => {
                  const existing = appData.students.find(x => x.user_id === s.user_id);
                  if (existing) { alert('User ID already exists.'); return null; }
                  const newStudent: Student = { 
                    ...s, 
                    avatar_url: generateAvatar(UserRole.STUDENT, s.user_id),
                    username: s.user_id, 
                    password: Math.random().toString(36).substr(2, 8).toUpperCase(), 
                    created_by: currentAdmin?.username || 'Admin', 
                    created_at: new Date().toISOString() 
                  };
                  setAppData(prev => ({ ...prev, students: [...prev.students, newStudent] }));
                  await SupabaseAPI.upsertStudent(newStudent);
                  return newStudent;
                }} 
                onUpdate={async (s: Student) => {
                  setAppData(p => ({ ...p, students: p.students.map(x => x.user_id === s.user_id ? s : x) }));
                  await SupabaseAPI.upsertStudent(s);
                }}
                onDelete={async (id:string) => {
                  setAppData(p => ({
                    ...p,
                    students: p.students.filter(s => s.user_id !== id),
                    registrations: p.registrations.filter(r => r.user_id !== id),
                    results: p.results.filter(r => r.user_id !== id)
                  }));
                  await SupabaseAPI.deleteStudent(id);
                }} 
                isReadOnly={isReadOnly} 
            />} />
            <Route path="/schedules" element={<ScheduleManager data={appData} 
                onAdd={async (t:any) => {
                  const newTest = { ...t, test_id: Math.random().toString(36).substr(2,6), current_registrations: 0, created_by: currentAdmin?.username || 'Admin', is_closed: false };
                  setAppData(p => ({ ...p, tests: [...p.tests, newTest] }));
                  await SupabaseAPI.upsertTest(newTest);
                }}
                onUpdate={async (t: TestSchedule) => {
                  setAppData(p => ({ ...p, tests: p.tests.map(x => x.test_id === t.test_id ? t : x) }));
                  await SupabaseAPI.upsertTest(t);
                }}
                onDelete={async (id:string) => {
                  setAppData(p => ({ 
                    ...p, 
                    tests: p.tests.filter(t => t.test_id !== id), 
                    registrations: p.registrations.filter(r => r.test_id !== id), 
                    results: p.results.filter(r => r.test_id !== id) 
                  }));
                  await SupabaseAPI.deleteTest(id);
                }}
                isReadOnly={isReadOnly || userRole === UserRole.MODERATOR}
            />} />
            <Route path="/admin-results" element={<AdminResults data={appData} 
                onAddResult={async (r:any) => {
                  const newRes: Result = {
                    result_id: Math.random().toString(36).substr(2,5),
                    user_id: r.user_id,
                    test_id: r.test_id,
                    listening_score: r.l,
                    reading_score: r.r,
                    writing_score: r.w,
                    speaking_score: r.s,
                    overall_score: r.overall_score,
                    published_by: currentAdmin?.username || 'Admin',
                    published_date: new Date().toISOString()
                  };
                  setAppData(p => ({...p, results: [...p.results, newRes]}));
                  await SupabaseAPI.upsertResult(newRes);
                }}
                onUpdateResult={async (r: Result) => {
                  setAppData(p => ({...p, results: p.results.map(x => x.result_id === r.result_id ? { ...x, ...r } : x)}));
                  await SupabaseAPI.upsertResult(r);
                }}
                onDeleteResult={async (id: string) => {
                   setAppData(p => ({ ...p, results: p.results.filter(r => r.result_id !== id) }));
                   await SupabaseAPI.deleteResult(id);
                }}
                isReadOnly={isReadOnly}
            />} />
            <Route path="/reports" element={<ReportsView data={appData} />} />
            <Route path="/tests" element={<AvailableTests student={currentStudent} data={appData} onRegister={async (t: any) => {
                if (!currentStudent) return;
                const key = t.test_type.toLowerCase() as keyof RemainingTests;
                const newReg: Registration = { reg_id: Math.random().toString(36).substr(2, 9), user_id: currentStudent.user_id, test_id: t.test_id, module_type: t.test_type, registration_date: new Date().toISOString().split('T')[0], status: RegistrationStatus.CONFIRMED };
                
                const updatedTests = appData.tests.map(x => x.test_id === t.test_id ? { ...x, current_registrations: x.current_registrations + 1 } : x);
                const updatedStudents = appData.students.map(s => s.user_id === currentStudent.user_id ? { ...s, remaining_tests: { ...s.remaining_tests, [key]: s.remaining_tests[key] - 1 } } : s);
                
                setAppData(prev => ({ ...prev, registrations: [...prev.registrations, newReg], tests: updatedTests, students: updatedStudents }));
                
                await Promise.all([
                  SupabaseAPI.upsertRegistration(newReg),
                  SupabaseAPI.upsertTest(updatedTests.find(x => x.test_id === t.test_id)!),
                  SupabaseAPI.upsertStudent(updatedStudents.find(x => x.user_id === currentStudent.user_id)!)
                ]);
                
                alert('Test successfully booked!');
            }} />} />
            <Route path="/history" element={<RegistrationHistory student={currentStudent} data={appData} />} />
            <Route path="/results" element={<StudentResults student={currentStudent} data={appData} />} />
            <Route path="/staff" element={<StaffManager admins={appData.admins} isReadOnly={isReadOnly}
                onAdd={async (a: any) => {
                  const na: Admin = { ...a, admin_id: Math.random().toString(36).substr(2, 6).toUpperCase(), created_by: currentAdmin?.username || 'Admin', created_at: new Date().toISOString() };
                  setAppData(p => ({ ...p, admins: [...p.admins, na] }));
                  await SupabaseAPI.upsertAdmin(na);
                }}
                onDelete={async (id: string) => {
                  setAppData(p => ({ ...p, admins: p.admins.filter(x => x.admin_id !== id) }));
                  await SupabaseAPI.deleteAdmin(id);
                }}
            />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
};

export default App;
