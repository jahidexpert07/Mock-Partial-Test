
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { HashRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { createClient } from '@supabase/supabase-js';
import { 
  UserRole, Student, Admin, TestSchedule, Registration, Result, TestType, RegistrationStatus, RemainingTests, Gender 
} from './types';
import { INITIAL_ADMINS, MOCK_TESTS } from './constants';

const STORAGE_KEY = 'ielts_system_v18_final';
const BRAND_BLUE = '#38b6ff';

const SPEAKING_TIMES = [
  "10:40 AM", "11:00 AM", "11:20 AM", "11:40 AM",
  "12:00 PM", "12:20 PM", "12:40 PM",
  "02:10 PM", "02:30 PM", "02:50 PM", "03:10 PM", "03:30 PM", "03:50 PM",
  "04:10 PM", "04:30 PM", "04:50 PM", "05:10 PM", "05:30 PM", "05:50 PM",
  "06:10 PM", "06:30 PM"
];

const SPEAKING_ROOMS = ["Room No: 01", "Room No: 02", "Room No: 03"];

// --- SUPABASE CONFIGURATION ---
const SUPABASE_URL = 'https://njbmcxkmugnabqfwvolr.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_SS6k_XZBjOFBKzQR42pJow_cETglJ61';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

interface AppState {
  students: Student[];
  admins: Admin[];
  tests: TestSchedule[];
  registrations: Registration[];
  results: Result[];
  isSystemLocked?: boolean;
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

// --- GLOBAL SYNC ENGINE (SUPABASE) ---

const SupabaseAPI = {
  async getData(): Promise<AppState | null> {
    try {
      const fetchTable = async (name: string) => {
        const { data, error } = await supabase.from(name).select('*');
        if (error) {
          console.error(`Error fetching ${name}:`, error);
          return [];
        }
        return data || [];
      };

      const [st, ad, ts, rg, rs] = await Promise.all([
        fetchTable('students'),
        fetchTable('admins'),
        fetchTable('tests'),
        fetchTable('registrations'),
        fetchTable('results')
      ]);

      const { data: lockData } = await supabase.from('settings').select('*').eq('key', 'system_lock').maybeSingle();

      return {
        students: st,
        admins: ad.length > 0 ? ad : INITIAL_ADMINS,
        tests: ts,
        registrations: rg,
        results: rs,
        isSystemLocked: lockData?.value === 'true'
      };
    } catch (e) {
      console.error("Critical API Error:", e);
      return null;
    }
  },

  async saveData(data: AppState): Promise<boolean> {
    try {
      const tables = [
        { name: 'students', data: data.students, pk: 'user_id' },
        { name: 'admins', data: data.admins, pk: 'admin_id' },
        { name: 'tests', data: data.tests, pk: 'test_id' },
        { name: 'registrations', data: data.registrations, pk: 'reg_id' },
        { name: 'results', data: data.results, pk: 'result_id' }
      ];

      for (const table of tables) {
        if (table.data && table.data.length > 0) {
          const { error } = await supabase.from(table.name).upsert(table.data, { onConflict: table.pk });
          if (error) console.error(`Error saving ${table.name}:`, error);
        }
      }
      
      await supabase.from('settings').upsert({ key: 'system_lock', value: data.isSystemLocked ? 'true' : 'false' }, { onConflict: 'key' });
      return true;
    } catch (e) {
      return false;
    }
  },

  async deleteTest(testId: string) {
    return supabase.from('tests').update({ is_deleted: true }).eq('test_id', testId);
  },

  async deleteStudent(userId: string) {
    return supabase.from('students').delete().eq('user_id', userId);
  },

  async deleteAdmin(adminId: string) {
    return supabase.from('admins').delete().eq('admin_id', adminId);
  },

  async deleteResult(resultId: string) {
    return supabase.from('results').delete().eq('result_id', resultId);
  }
};

const getInitialState = (): AppState => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) return JSON.parse(stored);
  return {
    students: [],
    admins: INITIAL_ADMINS,
    tests: [],
    registrations: [],
    results: [],
    isSystemLocked: false
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

const ConfirmationModal: React.FC<{
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'primary' | 'success';
}> = ({ isOpen, onCancel, onConfirm, title, message, confirmText = 'Confirm', cancelText = 'Cancel', variant = 'danger' }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-2xl z-[100] flex items-center justify-center p-4">
      <Card className="max-w-md w-full !rounded-[2rem] !bg-white/95 shadow-2xl animate-in zoom-in duration-200" title={title}>
        <div className="space-y-6">
          <p className="text-sm text-slate-600 font-black leading-relaxed">{message}</p>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={onCancel}>{cancelText}</Button>
            <Button variant={variant as any} onClick={onConfirm} className="px-8">{confirmText}</Button>
          </div>
        </div>
      </Card>
    </div>
  );
};

// --- Page Components ---

const LoginPage = ({ data, onLogin }: { data: AppState, onLogin: (id: string, role: UserRole) => void }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showLockPopup, setShowLockPopup] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const admin = data.admins.find(a => a.username === username && a.password === password);
    if (admin) { onLogin(admin.admin_id, admin.role); return; }
    
    const student = data.students.find(s => (s.user_id === username || s.username === username) && s.password === password);
    if (student) { 
      if (data.isSystemLocked) {
        setShowLockPopup(true);
        return;
      }
      onLogin(student.user_id, UserRole.STUDENT); 
      return; 
    }
    setError('Invalid credentials. Please check your ID/Password.');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-0 md:p-6 relative overflow-hidden bg-[#B2A5FF]">
      <div className="absolute inset-0 z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-[#B2A5FF] rounded-full blur-[100px] opacity-80"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-white rounded-full blur-[120px] opacity-40"></div>
        <div className="absolute inset-0 backdrop-blur-[40px]"></div>
      </div>

      {showLockPopup && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <Card className="max-w-sm w-full !bg-white/95 !rounded-[2.5rem] text-center shadow-2xl animate-in zoom-in duration-200">
            <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>
            <h3 className="text-xl font-black text-slate-900 mb-2">Login Disabled</h3>
            <p className="text-sm font-bold text-slate-500 leading-relaxed mb-8">Result Publishing Ongoing.<br/>Please come back after some time.</p>
            <Button variant="primary" className="w-full" onClick={() => setShowLockPopup(false)}>Understood</Button>
          </Card>
        </div>
      )}

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

const ColumnChart = ({ data }: { data: { week: string; students: number; mocks: number }[] }) => {
  const maxVal = Math.max(...data.map(d => Math.max(d.students, d.mocks, 5)), 10);
  return (
    <div className="w-full h-64 flex items-end justify-between gap-4 mt-8 px-2">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center group relative">
          <div className="flex gap-1.5 w-full items-end h-48">
            <div 
              className="flex-1 rounded-t-lg bg-[#6c3baa]/80 transition-all duration-700 hover:bg-[#6c3baa] relative group/bar"
              style={{ height: `${(d.students / maxVal) * 100}%` }}
            >
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover/bar:opacity-100 transition-opacity bg-slate-800 text-white text-[10px] font-black px-2 py-1 rounded">
                {d.students}
              </div>
            </div>
            <div 
              className="flex-1 rounded-t-lg bg-[#38b6ff]/80 transition-all duration-700 hover:bg-[#38b6ff] relative group/bar"
              style={{ height: `${(d.mocks / maxVal) * 100}%` }}
            >
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover/bar:opacity-100 transition-opacity bg-slate-800 text-white text-[10px] font-black px-2 py-1 rounded">
                {d.mocks}
              </div>
            </div>
          </div>
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-tighter mt-4 whitespace-nowrap">{d.week}</p>
        </div>
      ))}
    </div>
  );
};

const App = () => {
  const [loggedID, setLoggedID] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [appData, setAppData] = useState<AppState>(getInitialState());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const initCloud = async () => {
      setIsSyncing(true);
      const cloudData = await SupabaseAPI.getData();
      if (cloudData) {
        setAppData(cloudData);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cloudData));
        
        // AUTO-CLEANUP EXPIRED STUDENTS (For Admin/Co-Admin)
        if (userRole === UserRole.ADMIN || userRole === UserRole.CO_ADMIN) {
          const today = new Date().toISOString().split('T')[0];
          const expired = cloudData.students.filter(s => s.expiry_date && s.expiry_date < today);
          if (expired.length > 0) {
            for (const s of expired) {
              await SupabaseAPI.deleteStudent(s.user_id);
            }
            // Reload to reflect changes
            const updated = await SupabaseAPI.getData();
            if (updated) setAppData(updated);
          }
        }
      }
      setIsSyncing(false);
    };
    initCloud();
  }, [userRole]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
    const syncTimer = setTimeout(async () => {
      setIsSyncing(true);
      await SupabaseAPI.saveData(appData);
      setIsSyncing(false);
    }, 2000);
    return () => clearTimeout(syncTimer);
  }, [appData]);

  const currentStudent = useMemo(() => {
    if (userRole === UserRole.STUDENT && loggedID) return appData.students.find(s => s.user_id === loggedID) || null;
    return null;
  }, [appData.students, loggedID, userRole]);

  const currentAdmin = useMemo(() => {
    if (userRole !== UserRole.STUDENT && loggedID) return appData.admins.find(a => a.admin_id === loggedID) || null;
    return null;
  }, [appData.admins, loggedID, userRole]);

  if (!loggedID || (userRole === UserRole.STUDENT && !currentStudent) || (userRole !== UserRole.STUDENT && userRole !== null && !currentAdmin)) {
    return <LoginPage data={appData} onLogin={(id, role) => { 
        setLoggedID(id); 
        setUserRole(role); 
        window.location.hash = '#/';
    }} />;
  }

  const isReadOnly = userRole === UserRole.VIEWER;

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
                <NavLink to="/paid-test" onClick={() => setSidebarOpen(false)}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
                  Paid Test
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
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">{loggedID}</p>
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
            <Route path="/" element={userRole === UserRole.STUDENT ? <StudentDashboard student={currentStudent!} data={appData} /> : <AdminDashboard data={appData} onToggleLock={() => setAppData(prev => ({ ...prev, isSystemLocked: !prev.isSystemLocked }))} />} />
            <Route path="/students" element={<StudentManager students={appData.students} 
                currentAdmin={currentAdmin} userRole={userRole}
                onAdd={(s:any) => {
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
                  return newStudent;
                }} 
                onUpdate={(s: Student) => setAppData(p => ({ ...p, students: p.students.map(x => x.user_id === s.user_id ? s : x) }))}
                onDelete={async (id:string) => {
                  setAppData(p => ({
                    ...p,
                    students: p.students.filter(s => s.user_id !== id),
                    registrations: p.registrations.filter(r => r.user_id !== id),
                    results: p.results.filter(r => r.user_id !== id)
                  }));
                  await SupabaseAPI.deleteStudent(id);
                }} 
                data={appData} isReadOnly={isReadOnly} 
            />} />
            <Route path="/schedules" element={<ScheduleManager data={appData} 
                onAdd={(t:any) => {
                  setAppData(p => ({ ...p, tests: [...p.tests, { ...t, test_id: Math.random().toString(36).substr(2,6), current_registrations: 0, created_by: currentAdmin?.username || 'Admin', is_closed: false, is_deleted: false }] }));
                }}
                onUpdate={(t: TestSchedule) => setAppData(p => ({ ...p, tests: p.tests.map(x => x.test_id === t.test_id ? t : x) }))}
                onDelete={async (id:string) => {
                  setAppData(p => ({ 
                    ...p, 
                    tests: p.tests.map(t => t.test_id === id ? { ...t, is_deleted: true } : t)
                  }));
                  await SupabaseAPI.deleteTest(id);
                }}
                isReadOnly={isReadOnly || userRole === UserRole.MODERATOR}
            />} />
            <Route path="/paid-test" element={<PaidTestManager data={appData} onRegister={(t: any, guestInfo: { name: string, phone: string }, speakingSlot?: { date: string, room: string, time: string }) => {
                const newReg: Registration = { 
                  reg_id: Math.random().toString(36).substr(2, 9), 
                  user_id: `GUEST-${Date.now()}`, 
                  test_id: t.test_id, 
                  module_type: t.test_type, 
                  registration_date: new Date().toISOString().split('T')[0], 
                  status: RegistrationStatus.CONFIRMED,
                  speaking_date: speakingSlot?.date,
                  speaking_time: speakingSlot?.time,
                  speaking_room: speakingSlot?.room,
                  guest_name: guestInfo.name,
                  guest_phone: guestInfo.phone
                };
                setAppData(prev => ({ 
                  ...prev, 
                  registrations: [...prev.registrations, newReg], 
                  tests: prev.tests.map(x => x.test_id === t.test_id ? { ...x, current_registrations: x.current_registrations + 1 } : x)
                }));
                return newReg;
            }} isReadOnly={isReadOnly} />} />
            <Route path="/admin-results" element={<AdminResults data={appData} 
                onAddResult={(r:any) => setAppData(p => ({...p, results: [...p.results, {...r, result_id: Math.random().toString(36).substr(2,5), published_by: currentAdmin?.username || 'Admin', published_date: new Date().toISOString()}]}))}
                onUpdateResult={(r: Result) => setAppData(p => ({...p, results: p.results.map(x => x.result_id === r.result_id ? { ...x, ...r } : x)}))}
                onDeleteResult={async (id: string) => {
                   setAppData(p => ({ ...p, results: p.results.filter(r => r.result_id !== id) }));
                   await SupabaseAPI.deleteResult(id);
                }}
                isReadOnly={isReadOnly}
            />} />
            <Route path="/reports" element={<ReportsView data={appData} />} />
            <Route path="/tests" element={<AvailableTests student={currentStudent} data={appData} onRegister={(t: any, speakingSlot?: { date: string, room: string, time: string }) => {
                if (!currentStudent) return;
                const key = t.test_type.toLowerCase() as keyof RemainingTests;
                const newReg: Registration = { 
                  reg_id: Math.random().toString(36).substr(2, 9), 
                  user_id: currentStudent.user_id, 
                  test_id: t.test_id, 
                  module_type: t.test_type, 
                  registration_date: new Date().toISOString().split('T')[0], 
                  status: RegistrationStatus.CONFIRMED,
                  speaking_date: speakingSlot?.date,
                  speaking_time: speakingSlot?.time,
                  speaking_room: speakingSlot?.room
                };
                setAppData(prev => ({ 
                  ...prev, 
                  registrations: [...prev.registrations, newReg], 
                  tests: prev.tests.map(x => x.test_id === t.test_id ? { ...x, current_registrations: x.current_registrations + 1 } : x), 
                  students: prev.students.map(s => s.user_id === currentStudent.user_id ? { ...s, remaining_tests: { ...s.remaining_tests, [key]: s.remaining_tests[key] - 1 } } : s) 
                }));
                alert('Test successfully booked!');
            }} />} />
            <Route path="/history" element={<RegistrationHistory student={currentStudent} data={appData} />} />
            <Route path="/results" element={<StudentResults student={currentStudent} data={appData} />} />
            <Route path="/staff" element={<StaffManager admins={appData.admins} isReadOnly={isReadOnly}
                onAdd={(a) => {
                  const na: Admin = { ...a, admin_id: Math.random().toString(36).substr(2, 6).toUpperCase(), created_by: currentAdmin?.username || 'Admin', created_at: new Date().toISOString() };
                  setAppData(p => ({ ...p, admins: [...p.admins, na] }));
                }}
                onDelete={async (id) => {
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

const StudentDashboard = ({ student, data }: { student: Student | null, data: AppState }) => {
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
                <p className="text-slate-600 font-black uppercase tracking-widest text-xs">Batch: {student.batch_number} • ID: {student.user_id}</p>
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
        <p className="text-sm font-black text-slate-600 uppercase tracking-[0.2em] mb-6">Module Inventory</p>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {Object.entries(student.remaining_tests).map(([key, val]) => (
            <Card key={key} className="text-center group hover:bg-white/50 transition-colors">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 group-hover:text-[#6c3baa]">{key}</p>
              <p className="text-3xl font-black text-slate-900">{val}</p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

const AdminDashboard = ({ data, onToggleLock }: { data: AppState, onToggleLock: () => void }) => {
  const [showLockConfirm, setShowLockConfirm] = useState(false);
  const activeStudentsCount = useMemo(() => {
    const today = new Date();
    return data.students.filter(s => s.expiry_date && new Date(s.expiry_date) >= today).length;
  }, [data.students]);
  const activeTestsCount = useMemo(() => data.tests.filter(t => !t.is_deleted).length, [data.tests]);
  const recentActivity = useMemo(() => {
    const activities: any[] = [];
    data.students.slice(-5).forEach(s => activities.push({ id: `s-${s.user_id}`, type: 'Candidate Registered', label: s.name, time: s.created_at, icon: '👤' }));
    data.registrations.slice(-5).forEach(r => {
      const s = data.students.find(x => x.user_id === r.user_id);
      activities.push({ id: `r-${r.reg_id}`, type: 'Test Booked', label: `${s?.name || r.guest_name || 'User'} -> ${r.module_type}`, time: r.registration_date, icon: '📝' });
    });
    return activities.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 5);
  }, [data.students, data.registrations]);
  const weeklyData = useMemo(() => {
    const now = new Date();
    const weeks = [];
    for (let i = 4; i >= 0; i--) {
      const weekStart = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
      const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
      const newStudents = data.students.filter(s => { const d = new Date(s.created_at); return d >= weekStart && d < weekEnd; }).length;
      const mockBookings = data.registrations.filter(r => { const d = new Date(r.registration_date); return r.module_type === TestType.MOCK && d >= weekStart && d < weekEnd; }).length;
      weeks.push({ week: `Week ${5-i}`, students: newStudents, mocks: mockBookings });
    }
    return weeks;
  }, [data.students, data.registrations]);

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-4xl font-black text-slate-900 leading-tight tracking-tight">System Oversight</h2>
          <p className="text-sm font-bold text-[#6c3baa] uppercase tracking-widest mt-1">Your Portal Statistic</p>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setShowLockConfirm(true)}
            className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all ${data.isSystemLocked ? 'bg-red-500 text-white shadow-lg shadow-red-200' : 'bg-white/40 text-slate-600 border border-white/60 hover:bg-white'}`}
          >
            <div className={`w-3 h-3 rounded-full ${data.isSystemLocked ? 'bg-white animate-pulse' : 'bg-red-400'}`}></div>
            {data.isSystemLocked ? 'Maintenance Mode ON' : 'Lock Student Login'}
          </button>
          <div className="flex items-center gap-3 bg-white/40 backdrop-blur-3xl px-5 py-3 rounded-2xl border border-white/50 shadow-sm">
            <div className="w-3 h-3 bg-[#38b6ff] rounded-full animate-pulse shadow-[0_0_10px_#38b6ff]"></div>
            <p className="text-xs font-black uppercase tracking-tighter">Live Monitor Active</p>
          </div>
        </div>
      </div>
      <ConfirmationModal 
        isOpen={showLockConfirm}
        onCancel={() => setShowLockConfirm(false)}
        onConfirm={() => { onToggleLock(); setShowLockConfirm(false); }}
        title={data.isSystemLocked ? "Disable Lockdown" : "Enable Login Lockdown"}
        message={data.isSystemLocked ? "Students will be allowed to log in and access the portal again. Confirm?" : "All student accounts will be blocked from logging in. This is used for maintenance or result publishing. Continue?"}
        variant={data.isSystemLocked ? 'success' : 'danger'}
        confirmText={data.isSystemLocked ? "Unlock Access" : "Lock Portal Now"}
      />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {[
          { label: 'Total Base', value: data.students.length, color: '#6c3baa' },
          { label: 'Live Active', value: activeStudentsCount, color: BRAND_BLUE },
          { label: 'Sessions', value: activeTestsCount, color: '#6c3baa' },
          { label: 'System Staff', value: data.admins.length, color: '#6c3baa' },
        ].map(s => (
          <Card key={s.label} className="group relative overflow-hidden transition-all hover:-translate-y-1">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 group-hover:text-[#38b6ff] transition-colors">{s.label}</p>
            <p className="text-4xl font-black text-slate-900">{s.value}</p>
            <div className="absolute right-[-10px] bottom-[-10px] opacity-5 group-hover:opacity-10 transition-opacity">
               <svg width="80" height="80" viewBox="0 0 24 24" fill={s.color}><circle cx="12" cy="12" r="10"/></svg>
            </div>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card title="Engagement Metrics" subtitle="Weekly New Enrollments vs. Mock Bookings">
          <div className="flex items-center gap-6 mb-4">
             <div className="flex items-center gap-2"><div className="w-3 h-3 bg-[#6c3baa] rounded-full"></div><span className="text-[10px] font-black uppercase text-slate-600">Candidates</span></div>
             <div className="flex items-center gap-2"><div className="w-3 h-3 bg-[#38b6ff] rounded-full"></div><span className="text-[10px] font-black uppercase text-slate-600">Mock Tests</span></div>
          </div>
          <ColumnChart data={weeklyData} />
        </Card>
        <Card title="Activity Pulse" subtitle="Latest system transactions">
          <div className="space-y-4">
            {recentActivity.map(activity => (
              <div key={activity.id} className="flex items-center gap-4 p-4 rounded-2xl bg-white/30 hover:bg-white/50 border border-white/40 transition-all group">
                <div className="w-10 h-10 rounded-xl bg-white/60 flex items-center justify-center text-xl shadow-sm">
                   {activity.icon}
                </div>
                <div className="flex-1 min-w-0">
                   <div className="flex justify-between items-center">
                     <p className="text-[10px] font-black text-[#38b6ff] uppercase tracking-widest mb-0.5">{activity.type}</p>
                     <p className="text-[9px] font-bold text-slate-500">{formatDate(activity.time)}</p>
                   </div>
                   <p className="text-sm font-black text-slate-800 truncate group-hover:text-[#6c3baa] transition-colors">{activity.label}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};

const ReportsView = ({ data }: { data: AppState }) => {
  const [filterType, setFilterType] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const logs = useMemo(() => {
    const list: any[] = [];
    data.students.forEach(s => list.push({ id: s.user_id, type: 'STUDENT_ADD', name: s.name, date: s.created_at, details: `Batch: ${s.batch_number} (Added by ${s.created_by})` }));
    data.registrations.forEach(r => {
      const s = data.students.find(x => x.user_id === r.user_id);
      list.push({ id: r.reg_id, type: 'TEST_BOOK', name: s?.name || r.guest_name || r.user_id, date: r.registration_date, details: `Module: ${r.module_type} (Status: ${r.status})` });
    });
    data.results.forEach(res => {
      const s = data.students.find(x => x.user_id === res.user_id);
      list.push({ id: res.result_id, type: 'RESULT_PUB', name: s?.name || res.user_id, date: res.published_date, details: `Score Published (By ${res.published_by})` });
    });
    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .filter(l => (filterType === 'ALL' || l.type === filterType))
      .filter(l => l.name.toLowerCase().includes(searchTerm.toLowerCase()) || l.id.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [data, filterType, searchTerm]);
  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <h2 className="text-4xl font-black text-slate-900 tracking-tight">System Reports</h2>
        <div className="flex items-center gap-4 w-full md:w-auto">
          <select value={filterType} onChange={e => setFilterType(e.target.value)} className="bg-white/40 backdrop-blur-xl border border-white/40 rounded-xl px-4 py-2 font-black text-xs uppercase outline-none focus:ring-2 focus:ring-[#6c3baa]">
            <option value="ALL">All Activities</option>
            <option value="STUDENT_ADD">Enrollments</option>
            <option value="TEST_BOOK">Bookings</option>
            <option value="RESULT_PUB">Results</option>
          </select>
          <input placeholder="Filter by user..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="bg-white/40 backdrop-blur-xl border border-white/40 rounded-xl px-4 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-[#6c3baa]" />
        </div>
      </div>
      <div className="bg-white/30 backdrop-blur-[40px] border border-white/40 rounded-[2rem] overflow-hidden shadow-2xl">
        <table className="w-full text-left text-sm border-collapse">
          <thead className="bg-[#6c3baa] text-white">
            <tr><th className="p-6 font-black uppercase text-[10px] tracking-widest">Event</th><th className="p-6 font-black uppercase text-[10px] tracking-widest">Candidate</th><th className="p-6 font-black uppercase text-[10px] tracking-widest">Timeline</th><th className="p-6 font-black uppercase text-[10px] tracking-widest text-right">Reference</th></tr>
          </thead>
          <tbody className="divide-y divide-white/20">
            {logs.map((log, idx) => (
              <tr key={idx} className="hover:bg-white/40 transition-colors group">
                <td className="p-6">
                  <Badge color={log.type === 'STUDENT_ADD' ? 'green' : log.type === 'TEST_BOOK' ? 'sky' : 'brand'}>{log.type.replace('_', ' ')}</Badge>
                  <p className="mt-1 text-xs font-bold text-slate-600">{log.details}</p>
                </td>
                <td className="p-6 font-black text-slate-900">{log.name}</td>
                <td className="p-6 font-bold text-slate-600">{formatDate(log.date)}</td>
                <td className="p-6 text-right font-mono text-[10px] text-slate-500 group-hover:text-slate-900 transition-colors uppercase">{log.id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const StudentManager = ({ students, onAdd, onUpdate, onDelete, isReadOnly, currentAdmin, data }: any) => {
  const [showAdd, setShowAdd] = useState(false);
  const [viewStudent, setViewStudent] = useState<Student | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmError, setConfirmError] = useState('');
  const [deleteCandidateID, setDeleteCandidateID] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'profile' | 'bookings' | 'scores' | 'progress'>('profile');
  const [form, setForm] = useState({ user_id: '', name: '', phone: '', gender: Gender.MALE, batch_number: '', listening: 0, reading: 0, writing: 0, speaking: 0, mock: 0, expiry_date: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0] });

  const handleOpenProfile = (s: Student) => {
    setViewStudent(s);
    setEditForm({ ...s });
    setIsEditing(false);
    setActiveTab('profile');
  };

  const filtered = useMemo(() => [...students].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .filter((s: Student) => s.name.toLowerCase().includes(search.toLowerCase()) || s.user_id.toLowerCase().includes(search.toLowerCase()) || s.phone.includes(search) || s.batch_number.toLowerCase().includes(search.toLowerCase())), [students, search]);
  const studentBookings = useMemo(() => viewStudent ? data.registrations.filter((r: Registration) => r.user_id === viewStudent.user_id) : [], [viewStudent, data.registrations]);

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <h2 className="text-4xl font-black text-slate-900 leading-tight">All Students</h2>
        <div className="flex flex-col sm:flex-row items-center justify-end w-full md:w-auto gap-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Search candidates..." />
          {!isReadOnly && <Button onClick={() => setShowAdd(true)} variant="primary" className="px-8 whitespace-nowrap">+ Register</Button>}
        </div>
      </div>
      <ConfirmationModal isOpen={!!deleteCandidateID} title="Remove Candidate" message="Permanently remove candidate? This will wipe all profile data, registrations, and results from the database." confirmText="Confirm Remove" onCancel={() => setDeleteCandidateID(null)} onConfirm={() => { onDelete(deleteCandidateID); setDeleteCandidateID(null); }} />
      {showAdd && (
        <Card title="Register New Candidate">
          <form onSubmit={(e) => { e.preventDefault(); const res = onAdd({...form, remaining_tests: { listening: form.listening, reading: form.reading, writing: form.writing, speaking: form.speaking, mock: form.mock }}); if(res) setShowAdd(false); }} className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1.5"><label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Candidate ID</label><input placeholder="Ex: HA-ST-101" required value={form.user_id} onChange={e => setForm({...form, user_id: e.target.value})} className="w-full px-5 py-3 border border-slate-200/50 rounded-2xl outline-none font-bold bg-white/60" /></div>
              <div className="space-y-1.5"><label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Full Name</label><input placeholder="Ex: John Doe" required value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full px-5 py-3 border border-slate-200/50 rounded-2xl outline-none font-bold bg-white/60" /></div>
              <div className="space-y-1.5"><label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Gender</label><select value={form.gender} onChange={e => setForm({...form, gender: e.target.value as Gender})} className="w-full px-5 py-3 border border-slate-200/50 rounded-2xl font-bold bg-white/60"><option value={Gender.MALE}>Male</option><option value={Gender.FEMALE}>Female</option><option value={Gender.OTHERS}>Others</option></select></div>
              <div className="space-y-1.5"><label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Phone</label><input placeholder="+880..." required value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className="w-full px-5 py-3 border border-slate-200/50 rounded-2xl outline-none font-bold bg-white/60" /></div>
              <div className="space-y-1.5"><label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Batch</label><input placeholder="Ex: IELTS-22" required value={form.batch_number} onChange={e => setForm({...form, batch_number: e.target.value})} className="w-full px-5 py-3 border border-slate-200/50 rounded-2xl outline-none font-bold bg-white/60" /></div>
              <div className="space-y-1.5"><label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Account Expiry Date</label><input type="date" required value={form.expiry_date} onChange={e => setForm({...form, expiry_date: e.target.value})} className="w-full px-5 py-3 border border-slate-200/50 rounded-2xl outline-none font-bold bg-white/60" /></div>
            </div>
            <div className="bg-slate-50/40 backdrop-blur-md p-8 rounded-3xl border border-slate-100/50">
              <p className="text-sm font-black text-slate-600 uppercase tracking-widest mb-6">Initial Balance</p>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {['listening','reading','writing','speaking','mock'].map(key => (<div key={key} className="space-y-1.5 text-center"><label className="text-[10px] font-black text-slate-500 uppercase block">{key}</label><input type="number" value={(form as any)[key]} onChange={e => setForm({...form, [key]: parseInt(e.target.value) || 0})} className="w-full border-2 border-white/50 rounded-2xl p-3 text-center font-black text-[#6c3baa] bg-white/40" /></div>))}
              </div>
            </div>
            <div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => setShowAdd(false)}>Discard</Button><Button variant="primary" type="submit" className="px-10">Create Profile</Button></div>
          </form>
        </Card>
      )}
      {viewStudent && (
        <div className="fixed inset-0 bg-[#6c3baa]/20 backdrop-blur-2xl z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="max-w-4xl w-full" onClick={e => e.stopPropagation()}>
            <Card className="!p-0 shadow-2xl rounded-[2.5rem] overflow-hidden !bg-white/40 !backdrop-blur-3xl !border-white/60" title="">
              <div className="bg-[#6c3baa]/90 backdrop-blur-xl p-10 text-white flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div className="flex items-center gap-6">
                  <div className="w-24 h-24 rounded-[2rem] overflow-hidden border-4 border-white/60 shadow-xl bg-white flex-shrink-0"><UserAvatar role={UserRole.STUDENT} id={viewStudent.user_id} name={viewStudent.name} className="w-full h-full" /></div>
                  <div>
                    {isEditing ? (<div className="space-y-2"><input value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} className="bg-white/20 border-b-2 border-white font-black text-2xl outline-none px-2 w-full text-white" /><div className="text-sm font-bold opacity-80">ID: {viewStudent.user_id}</div></div>) : (<><h3 className="text-3xl font-black">{viewStudent.name}</h3><p className="text-purple-100 font-bold mt-1 text-sm tracking-widest uppercase">ID: {viewStudent.user_id} • {viewStudent.gender}</p></>)}
                  </div>
                </div>
                <div className="bg-white/10 p-4 rounded-2xl border border-white/20 w-full md:w-64 text-center"><p className="text-[10px] font-black text-purple-100 uppercase tracking-widest mb-2">System Access Key</p><div className="flex items-center justify-center gap-2"><PasswordInput value={viewStudent.password} onChange={()=>{}} disabled className="!bg-transparent !p-0 !border-0 scale-90" /></div></div>
              </div>
              <div className="px-10 pt-6">
                <div className="flex border-b border-slate-200/50 gap-8">
                  {['profile', 'bookings', 'scores', 'progress'].map(tab => (<button key={tab} onClick={() => setActiveTab(tab as any)} className={`pb-4 text-xs font-black uppercase tracking-widest transition-all relative ${activeTab === tab ? 'text-[#6c3baa]' : 'text-slate-500'}`}>{tab}{activeTab === tab && <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#6c3baa] rounded-full"></div>}</button>))}
                </div>
              </div>
              <div className="p-10">
                {activeTab === 'profile' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    <div className="space-y-6">
                      <p className="text-sm font-black text-slate-800 uppercase tracking-widest border-b pb-2">Profile Data</p>
                      {isEditing ? (<div className="space-y-5">
                        <div className="space-y-1"><label className="text-[10px] font-black text-slate-500 uppercase ml-1">Phone</label><input value={editForm.phone} onChange={e => setEditForm({...editForm, phone: e.target.value})} className="w-full p-4 bg-white/40 border rounded-2xl font-black" /></div>
                        <div className="space-y-1"><label className="text-[10px] font-black text-slate-500 uppercase ml-1">Batch</label><input value={editForm.batch_number} onChange={e => setEditForm({...editForm, batch_number: e.target.value})} className="w-full p-4 bg-white/40 border rounded-2xl font-black" /></div>
                        <div className="space-y-1"><label className="text-[10px] font-black text-slate-500 uppercase ml-1">Expiry</label><input type="date" value={editForm.expiry_date} onChange={e => setEditForm({...editForm, expiry_date: e.target.value})} className="w-full p-4 bg-white/40 border rounded-2xl font-black" /></div>
                      </div>) : (<div className="grid grid-cols-2 gap-6">
                        <div><p className="text-[10px] font-black text-slate-500 uppercase mb-1">Phone</p><p className="font-black text-slate-900">{viewStudent.phone}</p></div>
                        <div><p className="text-[10px] font-black text-slate-500 uppercase mb-1">Batch</p><p className="font-black text-slate-900">{viewStudent.batch_number}</p></div>
                        <div><p className="text-[10px] font-black text-slate-500 uppercase mb-1">Account Expiry</p><p className="font-black text-slate-900">{formatDate(viewStudent.expiry_date)}</p></div>
                        <div><p className="text-[10px] font-black text-slate-500 uppercase mb-1">Status</p>{new Date(viewStudent.expiry_date) < new Date() ? <Badge color="red">EXPIRED</Badge> : <Badge color="green">ACTIVE</Badge>}</div>
                      </div>)}
                    </div>
                    <div className="bg-white/20 p-8 rounded-[2rem] border border-white/40 backdrop-blur-md">
                      <p className="text-sm font-black text-slate-800 uppercase tracking-widest mb-6">Balances</p>
                      <div className="grid grid-cols-2 gap-4">
                        {Object.entries(editForm?.remaining_tests || viewStudent.remaining_tests).map(([key, val]) => (
                          <div key={key} className="text-center bg-white/40 p-4 rounded-2xl shadow-sm border border-white/40">
                            <label className="text-[9px] font-black text-slate-500 uppercase block mb-1">{key}</label>
                            {isEditing ? (<input type="number" value={val as number} onChange={e => setEditForm({ ...editForm, remaining_tests: { ...editForm.remaining_tests, [key]: parseInt(e.target.value) || 0 } })} className="w-full text-center font-black text-[#6c3baa] bg-white/60 rounded-xl outline-none py-1" />) : (<div className="font-black text-slate-900 text-2xl">{val as number}</div>)}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                {activeTab === 'bookings' && (
                  <div className="bg-white/20 rounded-3xl overflow-hidden border border-white/40 shadow-xl">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-[#6c3baa]/80 text-white font-black uppercase tracking-widest"><tr><th className="p-4">Module</th><th className="p-4">Scheduled Date</th><th className="p-4">Location</th><th className="p-4 text-right">Status</th></tr></thead>
                      <tbody className="divide-y divide-white/20">
                        {studentBookings.map((b: any) => { const test = data.tests.find((t: any) => t.test_id === b.test_id); return (
                          <tr key={b.reg_id} className="hover:bg-white/30 transition-colors">
                            <td className="p-4 font-black text-slate-800">{b.module_type}{(b.speaking_date || b.speaking_time) && (<div className="mt-1 text-[9px] font-black text-[#38b6ff] uppercase flex flex-col gap-0.5"><span>Speaking: {b.speaking_date ? formatDate(b.speaking_date) : '--'}</span><span>{b.speaking_time} • {b.speaking_room}</span></div>)}</td>
                            <td className="p-4"><p className="font-black text-slate-800">{test ? formatDate(test.test_date) : '--'}</p><p className="text-[10px] text-slate-500 uppercase">{test?.test_time || 'Past'}</p></td>
                            <td className="p-4 font-black text-slate-600">{test?.room_number || 'Historical'}</td>
                            <td className="p-4 text-right"><Badge color={b.status === RegistrationStatus.CONFIRMED ? 'green' : 'slate'}>{b.status}</Badge></td>
                          </tr>
                        );})}
                        {studentBookings.length === 0 && (<tr><td colSpan={4} className="p-10 text-center text-slate-500 font-black italic">No records.</td></tr>)}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="flex flex-col sm:flex-row justify-between items-center gap-6 border-t border-slate-200/50 pt-8 mt-10">
                  <div className="flex gap-4">{!isReadOnly && (isEditing ? (<><Button variant="primary" onClick={() => setShowConfirmModal(true)}>Save</Button><Button variant="secondary" onClick={() => { setIsEditing(false); setEditForm({...viewStudent}); }}>Cancel</Button></>) : (<Button variant="secondary" onClick={() => setIsEditing(true)}>Edit Profile</Button>))}</div>
                  <Button onClick={() => { setViewStudent(null); setEditForm(null); setIsEditing(false); }} variant="primary" className="w-full sm:w-auto px-12">Close</Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-2xl z-[60] flex items-center justify-center p-4">
          <Card className="max-w-md w-full !rounded-[2rem] !bg-white/80" title="Admin Authorization">
            <div className="space-y-6">
              <p className="text-sm text-slate-600 font-black">Admin password required.</p>
              <PasswordInput value={confirmPassword} onChange={setConfirmPassword} placeholder="Enter password" />
              {confirmError && <p className="text-red-500 text-xs font-black">{confirmError}</p>}
              <div className="flex justify-end gap-3"><Button variant="secondary" onClick={() => { setShowConfirmModal(false); setConfirmPassword(''); setConfirmError(''); }}>Cancel</Button><Button variant="primary" onClick={() => { if(!currentAdmin || confirmPassword !== currentAdmin.password) { setConfirmError('Incorrect.'); return; } onUpdate(editForm); setViewStudent({...editForm}); setShowConfirmModal(false); setIsEditing(false); setConfirmPassword(''); setConfirmError(''); }} className="px-8">Confirm</Button></div>
            </div>
          </Card>
        </div>
      )}
      <div className="bg-white/20 backdrop-blur-3xl border border-white/40 rounded-3xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse min-w-[750px]">
            <thead className="bg-[#6c3baa]/90 backdrop-blur-xl text-white">
              <tr><th className="p-6 font-black uppercase tracking-widest text-[10px]">ID</th><th className="p-6 font-black uppercase tracking-widest text-[10px]">Candidate Details</th><th className="p-6 font-black uppercase tracking-widest text-[10px]">Access Key</th><th className="p-6 font-black uppercase tracking-widest text-[10px]">Status</th><th className="p-6 font-black uppercase tracking-widest text-[10px] text-right">Action</th></tr>
            </thead>
            <tbody className="divide-y divide-white/20">
              {filtered.map((s:any) => { const isExpired = new Date(s.expiry_date) < new Date(); return (
                <tr key={s.user_id} className="hover:bg-white/40 transition-colors group">
                  <td className="p-6 font-black text-[#6c3baa]">{s.user_id}</td>
                  <td className="p-6"><div className="flex items-center gap-4"><div className="w-12 h-12 rounded-2xl overflow-hidden border border-white/40 bg-white/40 flex-shrink-0"><UserAvatar role={UserRole.STUDENT} id={s.user_id} name={s.name} className="w-full h-full" /></div><div><p className="font-black text-slate-900">{s.name}</p><p className="text-slate-500 font-black text-[10px] uppercase mt-0.5">Batch: {s.batch_number} • {s.phone}</p></div></div></td>
                  <td className="p-6 font-mono font-black text-slate-400 group-hover:text-slate-900 transition-colors">{s.password}</td>
                  <td className="p-6">{isExpired ? <Badge color="red">EXPIRED</Badge> : <Badge color="green">ACTIVE</Badge>}</td>
                  <td className="p-6 text-right space-x-3 whitespace-nowrap"><button onClick={() => handleOpenProfile(s)} className="text-[#6c3baa] font-black text-xs hover:underline uppercase tracking-widest">Portal</button>{!isReadOnly && <button onClick={() => setDeleteCandidateID(s.user_id)} className="text-red-400 font-black text-xs hover:text-red-600 uppercase tracking-widest">Remove</button>}</td>
                </tr>
              );})}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const ScheduleManager = ({ data, onAdd, onUpdate, onDelete, isReadOnly }: { data: AppState, onAdd: (t: any) => void, onUpdate: (t: TestSchedule) => void, onDelete: (id: string) => void, isReadOnly: boolean }) => {
  const [showAdd, setShowAdd] = useState(false);
  const [editingTest, setEditingTest] = useState<TestSchedule | null>(null);
  const [search, setSearch] = useState('');
  const [viewSlotID, setViewSlotID] = useState<string | null>(null);
  const [form, setForm] = useState({ test_type: TestType.LISTENING, test_day: 'Monday', test_date: '', test_time: '', room_number: '', max_capacity: 10, is_closed: false });
  const [deleteSessionID, setDeleteSessionID] = useState<string | null>(null);
  const filtered = data.tests.filter(t => !t.is_deleted && (t.test_type.toLowerCase().includes(search.toLowerCase()) || t.room_number.toLowerCase().includes(search.toLowerCase()) || t.test_day.toLowerCase().includes(search.toLowerCase())));
  const studentList = useMemo(() => { if (!viewSlotID) return []; return data.registrations.filter(r => r.test_id === viewSlotID).map(reg => { const s = data.students.find(x => x.user_id === reg.user_id); if (s) return { ...s, speaking_date: reg.speaking_date, speaking_time: reg.speaking_time, speaking_room: reg.speaking_room }; return { user_id: reg.user_id, name: reg.guest_name || 'Guest', phone: reg.guest_phone || '--', batch_number: 'PAID-GUEST', speaking_date: reg.speaking_date, speaking_time: reg.speaking_time, speaking_room: reg.speaking_room }; }).filter(s => !!s.user_id); }, [data.registrations, data.students, viewSlotID]);

  const downloadExcel = () => {
    const currentViewedTest = data.tests.find(t => t.test_id === viewSlotID);
    if (!currentViewedTest || studentList.length === 0) return;
    const headers = ["Name", "Phone", "ID", "Batch", "Module", "Room", "Date", "Time", "Day", "Speaking Date", "Speaking Time", "Speaking Room"];
    let tableHtml = '<html><head><meta charset="utf-8"></head><body><table border="1"><tr>';
    headers.forEach(h => tableHtml += `<th style="background-color:#6c3baa; color:white;">${h}</th>`);
    tableHtml += '</tr>';
    studentList.forEach((s: any) => { tableHtml += `<tr><td>${s.name}</td><td>${s.phone}</td><td>${s.user_id}</td><td>${s.batch_number}</td><td>${currentViewedTest.test_type}</td><td>${currentViewedTest.room_number}</td><td>${formatDate(currentViewedTest.test_date)}</td><td>${currentViewedTest.test_time}</td><td>${currentViewedTest.test_day}</td><td>${s.speaking_date ? formatDate(s.speaking_date) : '--'}</td><td>${s.speaking_time || '--'}</td><td>${s.speaking_room || '--'}</td></tr>`; });
    tableHtml += '</table></body></html>';
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([tableHtml], { type: 'application/vnd.ms-excel' }));
    link.download = `Candidates_${currentViewedTest.test_type}_${currentViewedTest.test_date}.xls`;
    link.click();
  };

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <h2 className="text-4xl font-black text-slate-900 leading-tight">Sessions</h2>
        <div className="flex flex-col sm:flex-row items-center justify-end w-full md:w-auto gap-4"><SearchInput value={search} onChange={setSearch} placeholder="Search slots..." />{!isReadOnly && <Button onClick={() => { setEditingTest(null); setShowAdd(true); }} variant="primary" className="px-8 whitespace-nowrap">+ New Slot</Button>}</div>
      </div>
      <ConfirmationModal isOpen={!!deleteSessionID} title="Delete Session" message="Delete this test session? Historic bookings will be preserved in candidate records." confirmText="Delete Session" onCancel={() => setDeleteSessionID(null)} onConfirm={() => { onDelete(deleteSessionID!); setDeleteSessionID(null); }} />
      {!isReadOnly && showAdd && (
        <Card title={editingTest ? "Edit Session" : "New Test Slot"}>
          <form onSubmit={(e) => { e.preventDefault(); if (editingTest) onUpdate({...editingTest, ...form}); else onAdd(form); setShowAdd(false); setEditingTest(null); }} className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-500 uppercase">Module</label><select value={form.test_type} onChange={e => setForm({...form, test_type: e.target.value as TestType})} className="w-full border border-slate-200/50 p-4 rounded-2xl font-black text-slate-900 bg-white/60">{Object.values(TestType).map(v => <option key={v} value={v}>{v}</option>)}</select></div>
            <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-500 uppercase">Date</label><input type="date" required value={form.test_date} onChange={e => setForm({...form, test_date: e.target.value, test_day: getWeekday(e.target.value)})} className="w-full border border-slate-200/50 p-4 rounded-2xl font-black text-slate-900 bg-white/60" /></div>
            <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-500 uppercase">Day (Auto)</label><input readOnly value={form.test_day} className="w-full border border-slate-200/50 p-4 rounded-2xl font-black text-slate-400 bg-slate-50/50" /></div>
            <div className="space-y-1.5"><label className="text-[10px] font-black text-slate-500 uppercase">Time</label><input placeholder="Ex: 09:30 AM" required value={form.test_time} onChange={e => setForm({...form, test_time: e.target.value})} className="w-full border border-slate-200/50 p-4 rounded-2xl font-black text-slate-900 bg-white/60" /></div>
            <div className="space-y-1.5 md:col-span-2"><label className="text-[10px] font-black text-slate-500 uppercase">Room</label><input placeholder="Ex: Room 4" required value={form.room_number} onChange={e => setForm({...form, room_number: e.target.value})} className="w-full border border-slate-200/50 p-4 rounded-2xl font-black text-slate-900 bg-white/60" /></div>
            <div className="space-y-1.5 md:col-span-1"><label className="text-[10px] font-black text-slate-500 uppercase">Max</label><input type="number" min="1" required value={form.max_capacity} onChange={e => setForm({...form, max_capacity: parseInt(e.target.value) || 0})} className="w-full border border-slate-200/50 p-4 rounded-2xl font-black text-slate-900 bg-white/60" /></div>
            <div className="md:col-span-1 flex items-center pt-4"><label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={form.is_closed} onChange={e => setForm({...form, is_closed: e.target.checked})} className="w-6 h-6 rounded-lg text-[#6c3baa]" /><span className="font-black text-slate-700 uppercase text-xs">Manual Close</span></label></div>
            <div className="col-span-full flex justify-end gap-3 pt-6"><Button variant="secondary" onClick={() => { setShowAdd(false); setEditingTest(null); }}>Cancel</Button><Button variant="primary" type="submit">Deploy Session</Button></div>
          </form>
        </Card>
      )}
      {viewSlotID && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-3xl z-50 flex items-center justify-center p-4">
          <div className="max-w-2xl w-full" onClick={e => e.stopPropagation()}>
            <Card className="!p-0 overflow-hidden shadow-2xl rounded-3xl !bg-white/90" title="">
              <div className="p-8 border-b flex justify-between items-center bg-slate-50/50"><h3 className="text-xl font-black text-slate-900">Enrolled Candidates</h3>{studentList.length > 0 && <Button onClick={downloadExcel} variant="success" className="text-xs px-4">Download EXCEL</Button>}</div>
              <div className="p-8 max-h-[50vh] overflow-y-auto space-y-3">
                {studentList.length > 0 ? studentList.map((s: any) => (<div key={s.user_id} className="p-4 bg-white/40 border border-slate-200 rounded-2xl flex justify-between items-center hover:bg-white hover:shadow-lg transition-all group"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl overflow-hidden border border-slate-200 bg-white flex-shrink-0"><UserAvatar role={UserRole.STUDENT} id={s.user_id} name={s.name} className="w-full h-full" /></div><div><p className="font-black text-slate-800">{s.name}</p><p className="text-[10px] text-slate-500 font-black uppercase">ID: {s.user_id} • Phone: {s.phone}</p>{s.speaking_time && (<p className="text-[9px] font-black text-[#38b6ff] uppercase mt-1">Speaking: {formatDate(s.speaking_date)} at {s.speaking_time} ({s.speaking_room})</p>)}</div></div><Badge color="brand">{s.batch_number}</Badge></div>)) : <p className="text-center py-20 text-slate-400 font-black italic bg-slate-50 rounded-3xl">No candidates.</p>}
              </div>
              <div className="p-6 flex justify-end border-t border-slate-100"><Button onClick={() => setViewSlotID(null)} variant="primary" className="px-10">Close Window</Button></div>
            </Card>
          </div>
        </div>
      )}
      <div className="bg-white/20 backdrop-blur-3xl border border-white/40 rounded-3xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse min-w-[700px]">
            <thead className="bg-[#6c3baa]/90 text-white"><tr><th className="p-6 font-black uppercase tracking-widest text-[10px]">Test Module</th><th className="p-6 font-black uppercase tracking-widest text-[10px]">Timeline</th><th className="p-6 font-black uppercase tracking-widest text-[10px] text-center">Registrations</th><th className="p-6 font-black uppercase tracking-widest text-[10px] text-right">Actions</th></tr></thead>
            <tbody className="divide-y divide-white/20">
              {filtered.map((t:any) => (<tr key={t.test_id} className="hover:bg-white/40 transition-colors"><td className="p-6 font-black text-[#6c3baa]">{t.test_type}</td><td className="p-6"><p className="font-black text-slate-900">{t.test_day} • {t.room_number}</p><p className="text-slate-500 font-bold text-[10px] uppercase mt-0.5">{formatDate(t.test_date)} at {t.test_time}</p></td><td className="p-6 text-center"><span className="px-4 py-1.5 rounded-full font-black text-xs bg-white/50 text-[#6c3baa] border border-[#6c3baa]/20">{t.current_registrations} / {t.max_capacity} Used</span><div className="mt-1">{t.is_closed || t.current_registrations >= t.max_capacity ? <Badge color="red">CLOSED</Badge> : <Badge color="green">OPEN</Badge>}</div></td><td className="p-6 text-right space-x-3 whitespace-nowrap"><button onClick={() => setViewSlotID(t.test_id)} className="text-[#6c3baa] font-black text-xs hover:underline uppercase">Candidates</button>{!isReadOnly && <button onClick={() => { setEditingTest(t); setForm({...t}); setShowAdd(true); }} className="text-[#6c3baa] font-black text-xs hover:underline uppercase">Edit</button>}{!isReadOnly && <button onClick={() => setDeleteSessionID(t.test_id)} className="text-red-400 font-black text-xs hover:text-red-600 uppercase">Delete</button>}</td></tr>))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const PaidTestManager = ({ data, onRegister, isReadOnly }: { data: AppState, onRegister: (t: any, guestInfo: { name: string, phone: string }, speakingSlot?: any) => Registration | void, isReadOnly: boolean }) => {
  const [search, setSearch] = useState('');
  const [selectedTest, setSelectedTest] = useState<TestSchedule | null>(null);
  const [guestForm, setGuestForm] = useState({ name: '', phone: '' });
  const [confirmedBooking, setConfirmedBooking] = useState<Registration | null>(null);
  const [speakingDate, setSpeakingDate] = useState<string>('');
  const [speakingTime, setSpeakingTime] = useState<string>('');
  const [assignedRoom, setAssignedRoom] = useState<string>('');
  const filtered = data.tests.filter(t => !t.is_deleted && !t.is_closed && t.current_registrations < t.max_capacity && (t.test_type.toLowerCase().includes(search.toLowerCase()) || t.room_number.toLowerCase().includes(search.toLowerCase())));
  const testSpeakingDates = useMemo(() => { if (!selectedTest) return []; const baseDate = new Date(selectedTest.test_date); if (selectedTest.test_type === TestType.MOCK) { const prev = new Date(baseDate); prev.setDate(baseDate.getDate() - 1); const next = new Date(baseDate); next.setDate(baseDate.getDate() + 1); return [prev.toISOString().split('T')[0], next.toISOString().split('T')[0]]; } return [selectedTest.test_date]; }, [selectedTest]);
  const occupiedSlots = useMemo(() => selectedTest ? data.registrations.filter(r => r.test_id === selectedTest.test_id && r.speaking_date && r.speaking_time && r.speaking_room).map(r => `${r.speaking_date}|${r.speaking_room}|${r.speaking_time}`) : [], [data.registrations, selectedTest]);

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6"><h2 className="text-4xl font-black text-slate-900">Paid Test</h2><SearchInput value={search} onChange={setSearch} placeholder="Filter schedules..." /></div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {filtered.map((t: any) => (<Card key={t.test_id} className="group hover:scale-[1.02] transition-all"><Badge color="sky">{t.test_type}</Badge><p className="text-2xl font-black text-slate-900 mt-4">{t.room_number}</p><p className="text-xs font-black text-slate-500 uppercase tracking-widest mt-1">{formatDate(t.test_date)} at {t.test_time}</p><Button onClick={() => setSelectedTest(t)} variant="primary" className="w-full mt-6 py-4">Book Test</Button></Card>))}
      </div>
      {confirmedBooking && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <Card className="max-w-md w-full !bg-white/95 !rounded-[2.5rem] shadow-2xl text-center"><div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6"><svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg></div><h3 className="text-2xl font-black text-slate-900 mb-6">Booking Confirmed</h3><div className="bg-slate-50 rounded-2xl p-6 space-y-4 border text-left"><div className="flex justify-between border-b pb-2"><span className="text-xs font-bold text-slate-400 uppercase">Student</span><span className="text-sm font-black text-slate-800">{confirmedBooking.guest_name}</span></div><div className="flex justify-between border-b pb-2"><span className="text-xs font-bold text-slate-400 uppercase">Phone</span><span className="text-sm font-black text-slate-800">{confirmedBooking.guest_phone}</span></div><div className="flex justify-between border-b pb-2"><span className="text-xs font-bold text-slate-400 uppercase">Module</span><span className="text-sm font-black text-[#6c3baa]">{confirmedBooking.module_type}</span></div>{confirmedBooking.speaking_time && (<div className="pt-2"><p className="text-[10px] font-black text-[#38b6ff] uppercase mb-1">Speaking</p><p className="text-sm font-black text-slate-800">{formatDate(confirmedBooking.speaking_date || '')} • {confirmedBooking.speaking_time}</p><p className="text-xs font-bold text-slate-500">{confirmedBooking.speaking_room}</p></div>)}</div><Button variant="primary" className="w-full mt-8" onClick={() => setConfirmedBooking(null)}>Close Receipt</Button></Card>
        </div>
      )}
      {selectedTest && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-3xl z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="max-w-md w-full my-8" onClick={e => e.stopPropagation()}>
            <Card className="!rounded-[2.5rem] shadow-2xl p-10 !bg-[#6c3baa]" title="">
              <h3 className="text-2xl font-black text-white text-center mb-8">Guest Student Details</h3>
              <div className="space-y-6">
                <div><label className="text-xs font-black text-purple-200 uppercase tracking-widest ml-1">Student Name</label><input value={guestForm.name} onChange={e => setGuestForm({...guestForm, name: e.target.value})} placeholder="Enter Full Name" className="w-full px-5 py-4 border border-white/20 rounded-2xl outline-none font-black bg-white/10 text-white placeholder-white/40 focus:bg-white/20" /></div>
                <div><label className="text-xs font-black text-purple-200 uppercase tracking-widest ml-1">Phone Number</label><input value={guestForm.phone} onChange={e => setGuestForm({...guestForm, phone: e.target.value})} placeholder="Enter Contact Phone" className="w-full px-5 py-4 border border-white/20 rounded-2xl outline-none font-black bg-white/10 text-white placeholder-white/40 focus:bg-white/20" /></div>
                {(selectedTest.test_type === TestType.MOCK || selectedTest.test_type === TestType.SPEAKING) && (
                  <div className="space-y-4 border-t border-white/10 pt-6">
                    <p className="text-[10px] font-black text-white uppercase opacity-80">Allocate Speaking Slot</p>
                    <select value={speakingDate} onChange={e => { setSpeakingDate(e.target.value); setSpeakingTime(''); setAssignedRoom(''); }} className="w-full border border-white/20 p-4 rounded-2xl font-black bg-white/10 text-white outline-none"><option value="" className="text-slate-900">Select Date</option>{testSpeakingDates.map(d => <option key={d} value={d} className="text-slate-900">{formatDate(d)}</option>)}</select>
                    {speakingDate && (
                      <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1">
                        {SPEAKING_TIMES.map(t => {
                          const room = SPEAKING_ROOMS.find(r => !occupiedSlots.includes(`${speakingDate}|${r}|${t}`));
                          return (<button key={t} disabled={!room} onClick={() => { setSpeakingTime(t); setAssignedRoom(room!); }} className={`p-3 rounded-xl text-[10px] font-black border transition-all ${!room ? 'bg-white/5 text-white/20' : speakingTime === t ? 'bg-white text-[#6c3baa]' : 'bg-white/10 text-white hover:bg-white/20'}`}>{t}</button>);
                        })}
                      </div>
                    )}
                    {assignedRoom && <p className="text-[10px] font-black text-emerald-300 text-center">{assignedRoom}</p>}
                  </div>
                )}
                <div className="flex gap-4 pt-6"><Button variant="secondary" onClick={() => setSelectedTest(null)} className="flex-1 !bg-white/10 !text-white">Cancel</Button><Button variant="primary" onClick={() => { if(!guestForm.name || !guestForm.phone) return alert("Fill all fields."); const reg = onRegister(selectedTest, guestForm, (selectedTest.test_type === TestType.MOCK || selectedTest.test_type === TestType.SPEAKING) ? { date: speakingDate, room: assignedRoom, time: speakingTime } : undefined); if(reg) setConfirmedBooking(reg); setSelectedTest(null); setGuestForm({name:'', phone:''}); setSpeakingDate(''); setSpeakingTime(''); setAssignedRoom(''); }} className="flex-[1.5] !bg-white !text-[#6c3baa]">Confirm</Button></div>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
};

const AvailableTests = ({ student, data, onRegister }: any) => {
  const [search, setSearch] = useState('');
  const [confirmTest, setConfirmTest] = useState<TestSchedule | null>(null);
  const [passInput, setPassInput] = useState('');
  const [error, setError] = useState('');
  const [speakingDate, setSpeakingDate] = useState<string>('');
  const [speakingTime, setSpeakingTime] = useState<string>('');
  const [assignedRoom, setAssignedRoom] = useState<string>('');
  if (!student) return null;
  const isAccountExpired = new Date(student.expiry_date) < new Date();
  const filtered = data.tests.filter((t: any) => !t.is_deleted && (t.test_type.toLowerCase().includes(search.toLowerCase()) || t.room_number.toLowerCase().includes(search.toLowerCase()) || t.test_day.toLowerCase().includes(search.toLowerCase())));
  const testSpeakingDates = useMemo(() => { if (!confirmTest) return []; const baseDate = new Date(confirmTest.test_date); if (confirmTest.test_type === TestType.MOCK) { const prev = new Date(baseDate); prev.setDate(baseDate.getDate() - 1); const next = new Date(baseDate); next.setDate(baseDate.getDate() + 1); return [prev.toISOString().split('T')[0], next.toISOString().split('T')[0]]; } return [confirmTest.test_date]; }, [confirmTest]);
  useEffect(() => { if (testSpeakingDates.length === 1 && !speakingDate) setSpeakingDate(testSpeakingDates[0]); }, [testSpeakingDates, speakingDate]);
  const occupiedSlots = useMemo(() => confirmTest ? data.registrations.filter(r => r.test_id === confirmTest.test_id && r.speaking_date && r.speaking_time && r.speaking_room).map(r => `${r.speaking_date}|${r.speaking_room}|${r.speaking_time}`) : [], [data.registrations, confirmTest]);

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6"><h2 className="text-4xl font-black text-slate-900 tracking-tight">Booking</h2><SearchInput value={search} onChange={setSearch} placeholder="Find sessions..." /></div>
      {isAccountExpired && (<Card className="!bg-red-500/10 text-center"><p className="text-red-600 font-black text-xl mb-2 uppercase">Account Expired</p><p className="text-slate-600 font-bold">Renewal required. Contact office.</p></Card>)}
      {confirmTest && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-3xl z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="max-w-md w-full my-8" onClick={e => e.stopPropagation()}>
            <Card className="!rounded-[2.5rem] shadow-2xl p-10 !bg-white/95" title="Verify Identity">
              <div className="mb-8 space-y-3 p-5 bg-purple-50 rounded-3xl border border-purple-100 shadow-inner"><p className="text-[10px] font-black text-[#6c3baa] uppercase tracking-[0.2em]">Confirming</p><p className="text-2xl font-black text-slate-900">{confirmTest.test_type}</p><div className="grid grid-cols-2 gap-y-3 text-xs"><div><p className="font-bold text-slate-400">Date</p><p className="font-black text-slate-700">{formatDate(confirmTest.test_date)}</p></div><div><p className="font-bold text-slate-400">Time</p><p className="font-black text-slate-700">{confirmTest.test_time}</p></div></div></div>
              {(confirmTest.test_type === TestType.MOCK || confirmTest.test_type === TestType.SPEAKING) && (
                <div className="mb-8 space-y-6">
                  <p className="text-[10px] font-black text-[#38b6ff] uppercase tracking-[0.2em] border-b border-[#38b6ff]/20 pb-2">Assign Speaking Slot</p>
                  {confirmTest.test_type === TestType.MOCK && (<div className="space-y-1.5"><label className="text-[10px] font-black text-slate-500 uppercase ml-1">Speaking Date</label><div className="flex gap-2">{testSpeakingDates.map(d => (<button key={d} onClick={() => { setSpeakingDate(d); setSpeakingTime(''); setAssignedRoom(''); }} className={`flex-1 p-3 rounded-xl text-[10px] font-black border transition-all ${speakingDate === d ? 'bg-[#38b6ff] text-white border-[#38b6ff]' : 'bg-white text-slate-700 border-slate-200'}`}>{formatDate(d)}</button>))}</div></div>)}
                  {speakingDate && (<div className="space-y-1.5"><label className="text-[10px] font-black text-slate-500 uppercase ml-1">Choose Time</label><div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1">{SPEAKING_TIMES.map(t => { const room = SPEAKING_ROOMS.find(r => !occupiedSlots.includes(`${speakingDate}|${r}|${t}`)); return (<button key={t} type="button" disabled={!room} onClick={() => { setSpeakingTime(t); setAssignedRoom(room!); }} className={`p-3 rounded-xl text-[10px] font-black transition-all border ${!room ? 'bg-slate-50 text-slate-300' : speakingTime === t ? 'bg-[#6c3baa] text-white' : 'bg-white text-slate-700'}`}>{t}</button>); })}</div></div>)}
                  {assignedRoom && (<div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-center justify-between"><p className="text-[10px] font-black text-emerald-700 uppercase">Assigned Room:</p><p className="font-black text-emerald-800 text-sm">{assignedRoom}</p></div>)}
                </div>
              )}
              <div className="space-y-6"><label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Portal Password</label><PasswordInput value={passInput} onChange={setPassInput} placeholder="Confirm Identity" />{error && <p className="text-red-500 text-xs font-black bg-red-50 p-3 rounded-xl">{error}</p>}<div className="flex gap-4 pt-4"><Button variant="secondary" onClick={() => { setConfirmTest(null); setPassInput(''); setSpeakingDate(''); setSpeakingTime(''); setAssignedRoom(''); setError(''); }} className="flex-1">Cancel</Button><Button variant="primary" onClick={() => { if (passInput === student.password) { if (confirmTest?.current_registrations >= confirmTest?.max_capacity) return setError('Full.'); if ((confirmTest?.test_type === TestType.MOCK || confirmTest?.test_type === TestType.SPEAKING) && (!speakingDate || !speakingTime)) return setError('Select speaking.'); onRegister(confirmTest, { date: speakingDate, room: assignedRoom, time: speakingTime }); setConfirmTest(null); setPassInput(''); setSpeakingDate(''); setSpeakingTime(''); setAssignedRoom(''); setError(''); } else setError('Incorrect.'); }} className="flex-[1.5]">Confirm</Button></div></div>
            </Card>
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {filtered.map((t:any) => { const registered = data.registrations.some((r:any) => r.user_id === student.user_id && r.test_id === t.test_id); const noBalance = (student.remaining_tests as any)[t.test_type.toLowerCase()] <= 0; const isFull = t.current_registrations >= t.max_capacity; return (
          <Card key={t.test_id} className={`group hover:scale-[1.02] transition-all ${isAccountExpired ? 'opacity-60 pointer-events-none' : ''}`}><div className="flex justify-between items-start mb-6"><div className="w-14 h-14 bg-purple-100/50 rounded-[1.5rem] flex items-center justify-center text-[#6c3baa] font-black group-hover:bg-[#6c3baa] group-hover:text-white transition-all transform group-hover:rotate-6">{t.test_type[0]}</div><div className="flex flex-col gap-2 items-end">{t.is_closed ? <Badge color="red">CLOSED</Badge> : isFull ? <Badge color="red">FULL</Badge> : <Badge color="sky">{t.max_capacity - t.current_registrations} LEFT</Badge>}</div></div><p className="text-2xl font-black text-slate-900 mb-1">{t.test_type}</p><p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-6">{t.test_day} • {t.room_number}</p><div className="grid grid-cols-2 gap-4 mb-8"><div className="bg-white/40 p-3 rounded-2xl border"><p className="text-[9px] font-black text-slate-500 uppercase mb-1">DATE</p><p className="font-black text-slate-800 text-sm">{formatDate(t.test_date)}</p></div><div className="bg-white/40 p-3 rounded-2xl border"><p className="text-[9px] font-black text-slate-500 uppercase mb-1">TIME</p><p className="font-black text-slate-800 text-sm">{t.test_time}</p></div></div>{registered ? (<div className="w-full py-4 rounded-2xl bg-emerald-100 text-emerald-700 font-black text-center text-xs uppercase border border-emerald-200">RESERVED</div>) : (<Button disabled={noBalance || t.is_closed || isAccountExpired || isFull} onClick={() => setConfirmTest(t)} variant={noBalance ? 'secondary' : 'primary'} className="w-full py-4">{isAccountExpired ? 'Expired' : isFull ? 'Full' : t.is_closed ? 'Closed' : noBalance ? 'No Balance' : 'Book Session'}</Button>)}</Card>
        );})}
      </div>
    </div>
  );
};

const RegistrationHistory = ({ student, data }: any) => {
  if (!student) return null;
  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <h2 className="text-4xl font-black text-slate-900 leading-tight">Bookings</h2>
      <div className="bg-white/20 backdrop-blur-3xl border border-white/40 rounded-[2rem] overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse min-w-[800px]">
            <thead className="bg-[#6c3baa]/90 backdrop-blur-xl text-white"><tr><th className="p-6 font-black uppercase tracking-widest text-[10px]">Module</th><th className="p-6 font-black uppercase tracking-widest text-[10px]">Details</th><th className="p-6 font-black uppercase tracking-widest text-[10px]">Registered</th><th className="p-6 font-black uppercase tracking-widest text-[10px] text-right">Status</th></tr></thead>
            <tbody className="divide-y divide-white/20">
              {data.registrations.filter((r:any) => r.user_id === student.user_id).map((reg:any) => { const test = data.tests.find((t:any) => t.test_id === reg.test_id); return (
                <tr key={reg.reg_id} className="hover:bg-white/40 transition-colors group">
                  <td className="p-6"><div><p className="font-black text-[#6c3baa]">{reg.module_type}</p><p className="text-[10px] font-black text-slate-500 uppercase">Ref: {reg.reg_id}</p>{(reg.speaking_date || reg.speaking_time) && (<div className="mt-1 text-[9px] font-black text-[#38b6ff] uppercase flex flex-col gap-0.5"><span>Speaking: {reg.speaking_date ? formatDate(reg.speaking_date) : '--'}</span><span>{reg.speaking_time} • {reg.speaking_room}</span></div>)}</div></td>
                  <td className="p-6"><div><span className="font-black text-slate-900">{test ? formatDate(test.test_date) : '--'}</span><span className="text-[11px] font-bold text-slate-600 uppercase block">{test ? `${test.test_time} • ${test.room_number}` : 'Past'}</span></div></td>
                  <td className="p-6 font-bold text-slate-600">{formatDate(reg.registration_date)}</td>
                  <td className="p-6 text-right"><Badge color="green">Confirmed</Badge></td>
                </tr>
              );})}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const StudentResults = ({ student, data }: any) => {
  if (!student) return null;
  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <h2 className="text-4xl font-black text-slate-900 leading-tight">Scores</h2>
      <div className="grid grid-cols-1 gap-8">
        {data.results.filter((r:any) => r.user_id === student.user_id).map((res:any) => { const test = data.tests.find((t:any) => t.test_id === res.test_id); return (
          <Card key={res.result_id} className="group flex flex-col md:flex-row gap-10 items-stretch"><div className="flex-1 flex flex-col justify-center"><div className="mb-6"><Badge color="brand">{test?.test_type || 'Academic'}</Badge><h3 className="text-3xl font-black text-slate-900 mt-2">{test ? `${test.test_type} Assessment` : 'Historical Record'}</h3></div><div className={`grid gap-6 bg-white/20 p-6 rounded-[2rem] border border-white/40 grid-cols-2 md:grid-cols-4`}>{[{l:'L', v:res.listening_score}, {l:'R', v:res.reading_score}, {l:'W', v:res.writing_score}, {l:'S', v:res.speaking_score}].map((s, idx) => (<div key={idx} className="text-center"><p className="text-[9px] font-black text-slate-500 uppercase mb-1">{s.l}</p><p className="text-2xl font-black text-[#6c3baa]">{s.v || '--'}</p></div>))}</div></div><div className="w-full md:w-80 flex flex-col gap-6 justify-center"><div className="bg-[#6c3baa] p-8 rounded-[2.5rem] text-white shadow-xl text-center"><p className="text-[10px] font-black uppercase opacity-60 mb-1">BAND</p><p className="text-6xl font-black">{res.overall_score ? res.overall_score.toFixed(1) : '0.0'}</p></div></div></Card>
        );})}
        {data.results.filter((r:any) => r.user_id === student.user_id).length === 0 && (<div className="p-20 text-center text-slate-400 font-black italic bg-white/20 rounded-[3rem] border-2 border-dashed">No results found.</div>)}
      </div>
    </div>
  );
};

const AdminResults = ({ data, onAddResult, onUpdateResult, onDeleteResult, isReadOnly }: any) => {
  const [showAdd, setShowAdd] = useState(false);
  const [editingResultId, setEditingResultId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ user_id: '', test_id: '', l: 0, r: 0, w: 0, s: 0, overall: 0 });
  const selectedSession = data.tests.find((t: any) => t.test_id === form.test_id);
  const isMock = selectedSession?.test_type === TestType.MOCK;
  useEffect(() => { if (isMock) setForm(f => ({ ...f, overall: (f.l && f.r && f.w && f.s) ? calculateIELTSBand(f.l, f.r, f.w, f.s) : 0 })); else setForm(f => ({ ...f, overall: 0 })); }, [form.l, form.r, form.w, form.s, isMock]);
  const filteredResults = data.results.filter((r: Result) => { const s = data.students.find(x => x.user_id === r.user_id); return s?.name.toLowerCase().includes(search.toLowerCase()) || r.user_id.toLowerCase().includes(search.toLowerCase()); });
  const sessionOptions = data.tests.filter(t => !t.is_deleted).map((t: any) => ({ id: t.test_id, type: t.test_type, date: t.test_date, time: t.test_time, day: t.test_day }));
  const studentOptions = useMemo(() => { if (!form.test_id) return []; const registeredIds = data.registrations.filter(reg => reg.test_id === form.test_id).map(reg => reg.user_id); const resultIds = data.results.filter(res => res.test_id === form.test_id && res.result_id !== editingResultId).map(res => res.user_id); return data.students.filter(s => registeredIds.includes(s.user_id) && !resultIds.includes(s.user_id)).map(s => ({ id: s.user_id, name: s.name, batch: s.batch_number, avatar: s.avatar_url })); }, [data.students, data.registrations, data.results, form.test_id, editingResultId]);

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6"><h2 className="text-4xl font-black text-slate-900 leading-tight">Scoring</h2><div className="flex flex-col sm:flex-row items-center justify-end w-full md:w-auto gap-4"><SearchInput value={search} onChange={setSearch} placeholder="Filter outcomes..." />{!isReadOnly && <Button onClick={() => { setEditingResultId(null); setShowAdd(true); setForm({ user_id: '', test_id: '', l: 0, r: 0, w: 0, s: 0, overall: 0 }); }} variant="primary">+ Result</Button>}</div></div>
      {!isReadOnly && showAdd && (
        <Card title={editingResultId ? "Modify Record" : "Post Outcome"}>
          <form onSubmit={(e) => { e.preventDefault(); const payload = { user_id: form.user_id, test_id: form.test_id, listening_score: form.l, reading_score: form.r, writing_score: form.w, speaking_score: form.s, overall_score: form.overall }; if (editingResultId) onUpdateResult({ ...payload, result_id: editingResultId }); else onAddResult(payload); setShowAdd(false); setEditingResultId(null); setForm({ user_id: '', test_id: '', l: 0, r: 0, w: 0, s: 0, overall: 0 }); }} className="space-y-10">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <SearchableSelect label="Examination" placeholder="Audit Link..." options={sessionOptions} value={form.test_id} onChange={(id: string) => setForm({...form, test_id: id, user_id: ''})} formatOption={(opt: any) => (<div className="flex flex-col"><span className="font-black text-[#6c3baa]">{opt.type}</span><span className="text-[10px] text-slate-500 font-bold uppercase">{opt.day}, {formatDate(opt.date)}</span></div>)} />
              <SearchableSelect label="Candidate" placeholder="Find handle..." options={studentOptions} value={form.user_id} onChange={(id: string) => setForm({...form, user_id: id})} formatOption={(opt: any) => (<div className="flex items-center gap-3"><UserAvatar role={UserRole.STUDENT} id={opt.id} name={opt.name} className="w-10 h-10 rounded-lg" /><div><span className="font-black text-slate-900 block">{opt.name}</span><span className="text-[10px] text-slate-500 font-bold uppercase">ID: {opt.id}</span></div></div>)} />
            </div>
            {form.test_id && (<div className="bg-[#6c3baa]/90 p-10 rounded-[2.5rem] text-white shadow-2xl border border-white/20"><div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-10">{['l','r','w','s'].map(k => (<div key={k} className="text-center space-y-2"><label className="text-[10px] font-black text-purple-200 uppercase">{k==='l'?'Listening':k==='r'?'Reading':k==='w'?'Writing':'Speaking'}</label><input type="number" step="0.5" value={(form as any)[k]} className="w-full border-2 border-white/20 rounded-2xl p-4 text-center font-black text-white bg-white/10 text-2xl" onChange={e => setForm({...form, [k]: parseFloat(e.target.value) || 0})} /></div>))}</div>{isMock && (<div className="border-t border-white/20 pt-10 text-center"><p className="text-[10px] font-black text-purple-200 uppercase mb-2">BAND</p><p className="text-7xl font-black">{form.overall.toFixed(1)}</p></div>)}</div>)}
            <div className="flex justify-end gap-3 pt-6"><Button variant="secondary" onClick={() => { setShowAdd(false); setEditingResultId(null); }}>Cancel</Button><Button variant="primary" type="submit" disabled={!form.test_id || !form.user_id}>Validate & Post</Button></div>
          </form>
        </Card>
      )}
      <div className="bg-white/20 backdrop-blur-3xl border border-white/40 rounded-3xl overflow-hidden shadow-2xl relative z-10">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse min-w-[650px]">
            <thead className="bg-[#6c3baa]/90 text-white"><tr><th className="p-6 font-black uppercase text-[10px] tracking-widest">Candidate</th><th className="p-6 font-black uppercase text-[10px] tracking-widest">Score Vector</th><th className="p-6 font-black uppercase text-[10px] tracking-widest">Outcome</th><th className="p-6 font-black uppercase text-[10px] tracking-widest text-right">Action</th></tr></thead>
            <tbody className="divide-y divide-white/20">
              {filteredResults.map((r:any) => { const s = data.students.find(x => x.user_id === r.user_id); return (
                <tr key={r.result_id} className="hover:bg-white/40 transition-colors"><td className="p-6"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-white/40 shadow-sm border border-white/60 overflow-hidden"><UserAvatar role={UserRole.STUDENT} id={r.user_id} name={s?.name} className="w-full h-full" /></div><div><span className="font-black text-slate-900 block">{s?.name || 'Candidate'}</span><span className="text-[9px] font-bold text-slate-500 uppercase">{r.user_id}</span></div></div></td><td className="p-6 font-black text-slate-600 font-mono text-xs">L:{r.listening_score} R:{r.reading_score} W:{r.writing_score} S:{r.speaking_score}</td><td className="p-6">{(r.overall_score > 0) ? <span className="text-2xl font-black text-[#6c3baa]">{r.overall_score.toFixed(1)}</span> : <Badge color="slate">MODULE DATA</Badge>}</td><td className="p-6 text-right space-x-3 whitespace-nowrap">{!isReadOnly && <button onClick={() => { setEditingResultId(r.result_id); setForm({user_id: r.user_id, test_id: r.test_id, l: r.listening_score||0, r: r.reading_score||0, w: r.writing_score||0, s: r.speaking_score||0, overall: r.overall_score||0}); setShowAdd(true); }} className="text-[#6c3baa] font-black text-xs hover:underline uppercase">Edit</button>}{!isReadOnly && <button onClick={() => { if(confirm('Permanently delete this result?')) onDeleteResult(r.result_id); }} className="text-red-400 font-black text-xs hover:text-red-600 uppercase">Revoke</button>}</td></tr>
              );})}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const StaffManager = ({ admins, onAdd, onDelete, isReadOnly }: { admins: Admin[], onAdd: (a: any) => void, onDelete: (id: string) => void, isReadOnly: boolean }) => {
  const [showAdd, useStateAdd] = useState(false);
  const [form, setForm] = useState({ username: '', password: '', role: UserRole.MODERATOR });
  const [deleteAdminID, setDeleteAdminID] = useState<string | null>(null);
  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <div className="flex justify-between items-center"><h2 className="text-4xl font-black text-slate-900">Access</h2>{!isReadOnly && <Button onClick={() => useStateAdd(true)} variant="primary">+ Handle</Button>}</div>
      <ConfirmationModal isOpen={!!deleteAdminID} title="Revoke Access" message="Remove administrator? All privileges will be revoked." confirmText="Revoke" onCancel={() => setDeleteAdminID(null)} onConfirm={() => { onDelete(deleteAdminID!); setDeleteAdminID(null); }} />
      {!isReadOnly && showAdd && (<Card title="Grant Access"><form onSubmit={(e) => { e.preventDefault(); onAdd(form); useStateAdd(false); setForm({ username: '', password: '', role: UserRole.MODERATOR }); }} className="grid grid-cols-1 md:grid-cols-3 gap-6"><div className="space-y-1.5"><label className="text-xs font-black text-slate-500 uppercase ml-1">Member Handle</label><input required value={form.username} onChange={e => setForm({...form, username: e.target.value})} className="w-full border border-slate-200/50 p-4 rounded-2xl font-black text-slate-900 bg-white/60" /></div><div className="space-y-1.5"><label className="text-xs font-black text-slate-500 uppercase ml-1">Master Key</label><PasswordInput value={form.password} onChange={v => setForm({...form, password: v})} required /></div><div className="space-y-1.5"><label className="text-xs font-black text-slate-500 uppercase ml-1">Level</label><select value={form.role} onChange={e => setForm({...form, role: e.target.value as UserRole})} className="w-full border border-slate-200/50 p-4 rounded-2xl font-black text-slate-900 bg-white/60"><option value={UserRole.CO_ADMIN}>Co-Admin</option><option value={UserRole.MODERATOR}>Moderator</option><option value={UserRole.VIEWER}>Viewer</option></select></div><div className="col-span-full flex justify-end gap-3 pt-6"><Button variant="secondary" onClick={() => useStateAdd(false)}>Discard</Button><Button variant="primary" type="submit">Deploy Handle</Button></div></form></Card>)}
      <div className="bg-white/20 backdrop-blur-3xl border border-white/40 rounded-3xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto"><table className="w-full text-left text-sm border-collapse"><thead className="bg-[#6c3baa]/90 text-white"><tr><th className="p-6 font-black uppercase text-[10px] tracking-widest">Handle</th><th className="p-6 font-black uppercase text-[10px] tracking-widest">Layer</th><th className="p-6 font-black uppercase text-[10px] tracking-widest text-right">Action</th></tr></thead><tbody className="divide-y divide-white/20">{admins.map(a => (<tr key={a.admin_id} className="hover:bg-white/40 transition-colors"><td className="p-6"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-white/40 overflow-hidden"><UserAvatar role={a.role} id={a.admin_id} name={a.username} className="w-full h-full" /></div><span className="font-black text-slate-900">{a.username}</span></div></td><td className="p-6"><Badge color="brand">{a.role.replace('_', ' ')}</Badge></td><td className="p-6 text-right">{!isReadOnly && a.username !== 'HA.admin01' && (<button onClick={() => setDeleteAdminID(a.admin_id)} className="text-red-400 font-black text-xs hover:text-red-600 uppercase">Revoke</button>)}</td></tr>))}</tbody></table></div>
      </div>
    </div>
  );
};

const NavLink: React.FC<{ to: string; children: React.ReactNode; onClick?: () => void }> = ({ to, children, onClick }) => {
  const { pathname } = useLocation();
  const isActive = pathname === to || (pathname === "" && to === "/");
  return (<Link to={to} onClick={onClick} className={`flex items-center gap-3 px-5 py-4 rounded-2xl text-sm font-black transition-all ${isActive ? 'bg-[#6c3baa] text-white shadow-xl shadow-purple-200' : 'text-slate-600 hover:text-[#6c3baa] hover:bg-white/10'}`}>{children}</Link>);
};

const SearchableSelect = ({ label, placeholder, options, value, onChange, formatOption }: any) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const h = (e: MouseEvent) => { if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setIsOpen(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);
  const filtered = options.filter((o: any) => JSON.stringify(o).toLowerCase().includes(search.toLowerCase()));
  const selected = options.find((o: any) => o.id === value);
  return (
    <div className="space-y-1.5 relative" ref={wrapperRef}>
      <label className="text-xs font-black text-slate-500 uppercase ml-1">{label}</label>
      <div onClick={() => setIsOpen(!isOpen)} className={`w-full px-5 py-4 border-2 rounded-2xl font-black text-slate-900 bg-white/60 cursor-pointer transition-all ${isOpen ? 'border-[#6c3baa]' : 'border-slate-100/50 hover:border-slate-200'}`}>{selected ? formatOption(selected) : <span className="text-slate-400">{placeholder}</span>}</div>
      {isOpen && (<div className="absolute z-[100] top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden"><div className="p-3 border-b bg-slate-50/50"><input autoFocus type="text" placeholder="Filter..." value={search} onChange={e => setSearch(e.target.value)} className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none text-sm" onClick={e => e.stopPropagation()} /></div><div className="max-h-60 overflow-y-auto">{filtered.length > 0 ? filtered.map((o: any) => (<div key={o.id} onClick={() => { onChange(o.id); setIsOpen(false); setSearch(''); }} className="p-4 hover:bg-purple-50 cursor-pointer border-b border-slate-50 last:border-0">{formatOption(o, true)}</div>)) : <div className="p-8 text-center text-xs font-bold text-slate-400">No matching entries.</div>}</div></div>)}
    </div>
  );
};

export default App;
