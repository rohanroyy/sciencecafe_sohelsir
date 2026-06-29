import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { compressImage } from '../utils/excel';
import AppShell from '../components/AppShell';
import ThemeToggle from '../components/ThemeToggle';
import LanguageToggle from '../components/LanguageToggle';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import { getAvatarUrl } from '../utils/avatars';
import { User, BookOpen, Lock, LogOut, ChevronLeft, GraduationCap, Pencil, Bell, Camera, Eye, EyeOff } from 'lucide-react';
import {
  getUnreadCounts,
  ensureNotificationPermission,
  showDeviceNotification,
  syncReadStateFromServer,
} from '../utils/notifications';

const CLASSES = ['Class6', 'Class7', 'Class8', 'SSC', 'HSC'];

export default function StudentDashboard({ onSelectBatch, onBack, initialTab = 'batches', onTabChange }) {
  const { t } = useLanguage();
  const { theme } = useTheme();
  const [session, setSession] = useState(null);
  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isRegistering, setIsRegistering] = useState(false);

  // Forms state
  const [loginPhone, setLoginPhone] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');
  const [forgotPasswordMode, setForgotPasswordMode] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');

  const [registerForm, setRegisterForm] = useState({
    name: '',
    photo_url: '',
    dob: '',
    gender: 'Male',
    institution: '',
    class: 'Class6',
    phone_number: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [registerError, setRegisterError] = useState('');

  // Dashboard Tabs
  const [activeTab, setActiveTab] = useState(initialTab);
  const [enrolledBatches, setEnrolledBatches] = useState([]);
  const [batchInstructors, setBatchInstructors] = useState([]);
  const [batchUnread, setBatchUnread] = useState({});
  const knownContentRef = React.useRef({});
  
  const [profileForm, setProfileForm] = useState({
    photo_url: '',
    dob: '',
    institution: '',
    email: '',
    class: 'Class6'
  });
  const [profileSuccess, setProfileSuccess] = useState('');
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [notificationPermissionStatus, setNotificationPermissionStatus] = useState(
    'Notification' in window ? Notification.permission : 'unsupported'
  );

  const handleRequestNotificationPermission = async () => {
    if ('Notification' in window) {
      const status = await Notification.requestPermission();
      setNotificationPermissionStatus(status);
    }
  };

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    onTabChange?.(tab);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchStudentProfile(session.user.id);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchStudentProfile(session.user.id);
      else {
        setStudent(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchStudentProfile = async (userId) => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('students')
        .select('*')
        .eq('id', userId)
        .single();

      if (data) {
        setStudent(data);
        setProfileForm({
          photo_url: data.photo_url || '',
          dob: data.dob || '',
          institution: data.institution || '',
          email: data.email || '',
          class: data.class || 'Class6'
        });

        if (data.is_approved) {
          // Sync cross-device read state from server before fetching batches
          await syncReadStateFromServer(userId);
          fetchEnrolledBatches(userId);
        }
      }
    } catch (err) {
      console.error('Error fetching student profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchEnrolledBatches = async (studentId) => {
    // 1. Get batch IDs from batch_students join table
    const { data: enrollments, error: err1 } = await supabase
      .from('batch_students')
      .select('batch_id')
      .eq('student_id', studentId);

    if (err1 || !enrollments || enrollments.length === 0) {
      setEnrolledBatches([]);
      return;
    }

    const batchIds = enrollments.map(e => e.batch_id);

    // 2. Fetch the batches matching those IDs
    const { data: batches, error: err2 } = await supabase
      .from('batches')
      .select('*')
      .in('id', batchIds)
      .order('created_at', { ascending: false });

    if (batches) {
      setEnrolledBatches(batches);
      fetchInstructorsForBatches(batches);
      fetchUnreadCounts(studentId, batches);
    }
  };

  const fetchInstructorsForBatches = async (batches) => {
    const teacherIds = [...new Set(batches.map((b) => b.teacher_id).filter(Boolean))];
    if (teacherIds.length === 0) {
      setBatchInstructors([]);
      return;
    }

    const { data: teachers } = await supabase.from('teachers').select('*').in('id', teacherIds);
    if (!teachers) return;

    const instructorRows = batches.map((batch) => ({
      batch,
      teacher: teachers.find((t) => t.id === batch.teacher_id) || null,
    }));
    setBatchInstructors(instructorRows);
  };

  const fetchUnreadCounts = async (studentId, batches) => {
    const unreadMap = {};
    await Promise.all(
      batches.map(async (batch) => {
        const [{ data: announcements }, { data: notes }] = await Promise.all([
          supabase.from('announcements').select('id, title, created_at').eq('batch_id', batch.id),
          supabase.from('notes').select('id, title, created_at').eq('batch_id', batch.id),
        ]);
        unreadMap[batch.id] = getUnreadCounts(studentId, batch.id, announcements || [], notes || []);
      })
    );
    setBatchUnread(unreadMap);
  };

  // Note: Notification.requestPermission() MUST be called from a user gesture (click).
  // We do NOT auto-request here — the banner below handles it via the Enable button.

  useEffect(() => {
    if (!student?.is_approved || !student?.id || enrolledBatches.length === 0) return;

    // Timestamps of last content check per batch — only notify for items posted AFTER this
    const lastCheck = {};
    const initTime = new Date().toISOString();
    enrolledBatches.forEach(b => { lastCheck[b.id] = initTime; });

    // Combined function: refresh badge counts + check for genuinely new content
    const pollAndNotify = async () => {
      // Sync latest read markers from the database first
      await syncReadStateFromServer(student.id);
      
      // 1. Refresh unread badge counts for all batches
      fetchUnreadCounts(student.id, enrolledBatches);

      // 2. For each batch, look for content posted since the last poll
      const checkTime = new Date().toISOString();
      for (const batch of enrolledBatches) {
        const since = lastCheck[batch.id];
        lastCheck[batch.id] = checkTime; // advance checkpoint before fetching

        if (!since) continue;

        const [{ data: newAnns }, { data: newNotes }] = await Promise.all([
          supabase.from('announcements').select('id, title').eq('batch_id', batch.id).gt('created_at', since),
          supabase.from('notes').select('id, title').eq('batch_id', batch.id).gt('created_at', since),
        ]);

        newAnns?.forEach(ann => {
          const key = `ann-${ann.id}`;
          if (!knownContentRef.current[key]) {
            knownContentRef.current[key] = true;
            showDeviceNotification(`Announcement from ${batch.title}`, `${ann.title}`, key);
          }
        });

        newNotes?.forEach(note => {
          const key = `note-${note.id}`;
          if (!knownContentRef.current[key]) {
            knownContentRef.current[key] = true;
            showDeviceNotification(`New Notes in ${batch.title}`, `${note.title}`, key);
          }
        });
      }
    };

    // Initial badge count refresh (no notifications on first load)
    fetchUnreadCounts(student.id, enrolledBatches);

    // Poll every 30 seconds — this is the primary notification trigger
    // (does NOT require Supabase Realtime to be configured)
    const interval = setInterval(pollAndNotify, 30000);

    // Supabase Realtime channels as a bonus — fires instantly IF Realtime is
    // enabled on 'announcements' and 'notes' tables in the Supabase dashboard.
    // knownContentRef prevents duplicate notifications if both Realtime + polling fire.
    const channels = enrolledBatches.flatMap((batch) => [
      supabase
        .channel(`ann-${batch.id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'announcements', filter: `batch_id=eq.${batch.id}` }, (payload) => {
          const ann = payload.new;
          const key = `ann-${ann.id}`;
          if (!knownContentRef.current[key]) {
            knownContentRef.current[key] = true;
            showDeviceNotification(`Announcement from ${batch.title}`, `${ann.title}`, key);
          }
          fetchUnreadCounts(student.id, enrolledBatches);
        })
        .subscribe(),
      supabase
        .channel(`note-${batch.id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notes', filter: `batch_id=eq.${batch.id}` }, (payload) => {
          const note = payload.new;
          const key = `note-${note.id}`;
          if (!knownContentRef.current[key]) {
            knownContentRef.current[key] = true;
            showDeviceNotification(`New Notes in ${batch.title}`, `${note.title}`, key);
          }
          fetchUnreadCounts(student.id, enrolledBatches);
        })
        .subscribe(),
    ]);

    return () => {
      clearInterval(interval);
      channels.forEach((ch) => supabase.removeChannel(ch));
    };
  }, [student?.id, student?.is_approved, enrolledBatches]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setLoading(true);

    if (!loginPhone.trim() || !loginPass) {
      setLoginError('Phone number and password are required');
      setLoading(false);
      return;
    }

    try {
      // 1. Look up student by phone number to get their email address
      const { data: studentRecord, error: findError } = await supabase
        .from('students')
        .select('email')
        .eq('phone_number', loginPhone.trim())
        .maybeSingle();

      if (findError || !studentRecord) {
        throw new Error('No student registered with this phone number');
      }

      // 2. Sign in with the resolved email and password
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: studentRecord.email,
        password: loginPass
      });

      if (signInError) throw signInError;
    } catch (err) {
      setLoginError(err.message || 'Login failed. Please check credentials.');
      setLoading(false);
    }
  };

  const handleRequestReset = async (e) => {
    e.preventDefault();
    setResetError('');
    setResetSuccess('');
    setLoading(true);

    if (!resetEmail.trim()) {
      setResetError('Email address is required');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/send-password-reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: resetEmail.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send reset link.');
      }

      setResetSuccess('A beautiful password reset link has been emailed to you. Please check your inbox.');
      setResetEmail('');
    } catch (err) {
      setResetError(err.message || 'Error occurred while sending password reset request');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setRegisterError('');

    // Validations
    if (!registerForm.name.trim()) return setRegisterError('Name is required');
    if (!registerForm.dob) return setRegisterError('Date of Birth is required');
    if (!registerForm.institution.trim()) return setRegisterError('Institution is required');
    if (!registerForm.phone_number.trim()) return setRegisterError('Phone number is required');
    if (!registerForm.email.trim()) return setRegisterError('Email is required');
    if (registerForm.password.length < 6) return setRegisterError('Password must be at least 6 characters');
    if (registerForm.password !== registerForm.confirmPassword) return setRegisterError('Passwords do not match');

    setLoading(true);
    try {
      // 1. Register user in Supabase Auth
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: registerForm.email.trim(),
        password: registerForm.password
      });

      if (signUpError) throw signUpError;
      if (!authData.user) throw new Error('Registration failed. Try again.');

      // 2. Insert profile details into students table
      const { error: insertError } = await supabase
        .from('students')
        .insert([{
          id: authData.user.id,
          name: registerForm.name.trim(),
          photo_url: registerForm.photo_url,
          dob: registerForm.dob,
          gender: registerForm.gender,
          institution: registerForm.institution.trim(),
          class: registerForm.class,
          phone_number: registerForm.phone_number.trim(),
          email: registerForm.email.trim(),
          is_approved: false // Starts locked
        }]);

      if (insertError) {
        // Cleanup Auth user if DB insert fails
        // Note: Supabase doesn't easily let clients delete auth users, but this handles showing the error
        throw insertError;
      }

      // Successful registration
      alert('Signup successful! Your profile has been sent for teacher approval.');
      setIsRegistering(false);
      // Try logging in immediately if auto-session is created
      if (authData.session) {
        setSession(authData.session);
        fetchStudentProfile(authData.user.id);
      } else {
        setLoading(false);
      }
    } catch (err) {
      let errMsg = err.message || 'Error occurred during signup';
      if (errMsg.toLowerCase().includes('rate limit')) {
        errMsg = 'Signup failed: Email rate limit exceeded. To resolve this, go to your Supabase Dashboard -> Authentication -> Providers -> Email and turn OFF "Confirm email" (Email Confirmations), or configure a Custom SMTP Provider.';
      }
      setRegisterError(errMsg);
      setLoading(false);
    }
  };

  const handleProfileImageUpload = async (e, mode) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const base64 = await compressImage(file);
      if (mode === 'register') {
        setRegisterForm({ ...registerForm, photo_url: base64 });
      } else {
        setProfileForm({ ...profileForm, photo_url: base64 });
      }
    } catch (err) {
      alert('Error uploading photo');
    }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setProfileSuccess('');
    setLoading(true);

    try {
      const { error } = await supabase
        .from('students')
        .update({
          photo_url: profileForm.photo_url,
          dob: profileForm.dob,
          institution: profileForm.institution.trim(),
          email: profileForm.email.trim(),
          class: profileForm.class
        })
        .eq('id', student.id);

      if (error) throw error;
      
      setProfileSuccess('Profile updated successfully!');
      // Refetch profile
      fetchStudentProfile(student.id);
    } catch (err) {
      alert(err.message || 'Error updating profile');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setStudent(null);
  };

  const authToolbar = (
    <div className="auth-toolbar">
      <LanguageToggle />
      <ThemeToggle />
    </div>
  );

  if (loading && !session) {
    return <div className="auth-screen"><div className="card glass">{t('loading')}</div></div>;
  }

  if (!session && isRegistering) {
    return (
      <div className="auth-screen">
        <div className="auth-card glass" style={{ maxWidth: '480px' }}>
          {authToolbar}
          <h3 className="auth-title">{t('studentRegister')}</h3>
          {registerError && <div className="alert-banner alert-banner-danger"><div>{registerError}</div></div>}

          <form onSubmit={handleRegister}>
            <div className="grid grid-cols-2 gap-4">
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input
                  type="text"
                  className="input-control"
                  required
                  value={registerForm.name}
                  onChange={(e) => setRegisterForm({ ...registerForm, name: e.target.value })}
                  placeholder="e.g. Abir Hossain"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Gender</label>
                <select
                  className="input-control select-control"
                  value={registerForm.gender}
                  onChange={(e) => setRegisterForm({ ...registerForm, gender: e.target.value })}
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="form-group">
                <label className="form-label">Date of Birth</label>
                <input
                  type="date"
                  className="input-control"
                  required
                  value={registerForm.dob}
                  onChange={(e) => setRegisterForm({ ...registerForm, dob: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Target Class</label>
                <select
                  className="input-control select-control"
                  value={registerForm.class}
                  onChange={(e) => setRegisterForm({ ...registerForm, class: e.target.value })}
                >
                  {CLASSES.map(cls => (
                    <option key={cls} value={cls}>{cls}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">School / Institution</label>
              <input
                type="text"
                className="input-control"
                required
                value={registerForm.institution}
                onChange={(e) => setRegisterForm({ ...registerForm, institution: e.target.value })}
                placeholder="e.g. Dhaka Residential Model College"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="form-group">
                <label className="form-label">Phone Number</label>
                <input
                  type="tel"
                  className="input-control"
                  required
                  value={registerForm.phone_number}
                  onChange={(e) => setRegisterForm({ ...registerForm, phone_number: e.target.value })}
                  placeholder="e.g. 01700000000"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input
                  type="email"
                  className="input-control"
                  required
                  value={registerForm.email}
                  onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                  placeholder="e.g. student@mail.com"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="form-group">
                <label className="form-label">Password</label>
                <input
                  type="password"
                  className="input-control"
                  required
                  value={registerForm.password}
                  onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })}
                  placeholder="At least 6 chars"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Confirm Password</label>
                <input
                  type="password"
                  className="input-control"
                  required
                  value={registerForm.confirmPassword}
                  onChange={(e) => setRegisterForm({ ...registerForm, confirmPassword: e.target.value })}
                  placeholder="Confirm password"
                />
              </div>
            </div>

            <div className="form-group mt-2">
              <label className="form-label">Student Photo (Optional PNG)</label>
              <div className="flex gap-4 align-center">
                <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                  Upload Photo
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => handleProfileImageUpload(e, 'register')}
                  />
                </label>
                {registerForm.photo_url && (
                  <img src={registerForm.photo_url} alt="Profile preview" className="avatar avatar-md" />
                )}
              </div>
            </div>

            <button type="submit" className="btn btn-primary btn-block mt-4">{t('registerSubmit')}</button>
            <button type="button" className="btn btn-secondary btn-block mt-2" onClick={() => setIsRegistering(false)}>{t('alreadyRegistered')} {t('login')}</button>
          </form>
        </div>
      </div>
    );
  }

  if (!session && forgotPasswordMode) {
    return (
      <div className="auth-screen">
        <div className="auth-card glass">
          {authToolbar}
          <div className="auth-logo" style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <img 
              src={theme === 'dark' ? '/black logo.svg' : '/white logo.svg'} 
              alt="Science Cafe" 
              style={{ maxHeight: '144px', width: 'auto', display: 'inline-block' }} 
            />
          </div>
          <h3 className="auth-title">Reset Password</h3>
          <p className="text-secondary" style={{ fontSize: '0.85rem', marginBottom: '1.5rem', textAlign: 'center' }}>
            Enter your registered email address. We will email you a password reset link.
          </p>
          {resetError && <div className="alert-banner alert-banner-danger"><div>{resetError}</div></div>}
          {resetSuccess && <div className="alert-banner alert-banner-success"><div>{resetSuccess}</div></div>}
          <form onSubmit={handleRequestReset}>
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input 
                type="email" 
                className="input-control" 
                required 
                value={resetEmail} 
                onChange={(e) => setResetEmail(e.target.value)} 
                placeholder="student@mail.com"
              />
            </div>
            <button type="submit" className="btn btn-primary btn-block mt-4" disabled={loading}>
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>
            <button type="button" className="btn btn-secondary btn-block mt-2" onClick={() => setForgotPasswordMode(false)}>
              Back to Login
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="auth-screen">
        <div className="auth-card glass">
          
          {authToolbar}
          <div className="auth-logo" style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <img 
              src={theme === 'dark' ? '/black logo.svg' : '/white logo.svg'} 
              alt="Science Cafe" 
              style={{ maxHeight: '144px', width: 'auto', display: 'inline-block' }} 
            />
          </div>
          <h3 className="auth-title">{t('studentLogin')}</h3>
          {loginError && <div className="alert-banner alert-banner-danger"><div>{loginError}</div></div>}
          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label className="form-label">{t('phone')}</label>
              <input type="text" className="input-control" required value={loginPhone} onChange={(e) => setLoginPhone(e.target.value)} />
            </div>
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="form-label">{t('password')}</label>
                <button type="button" onClick={() => { setForgotPasswordMode(true); setResetError(''); setResetSuccess(''); }} className="btn-link" style={{ fontSize: '0.8rem', background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: 0 }}>
                  Forgot Password?
                </button>
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input-control"
                  style={{ paddingRight: '2.5rem' }}
                  required
                  value={loginPass}
                  onChange={(e) => setLoginPass(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '0.75rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0.25rem',
                  }}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <button type="submit" className="btn btn-primary btn-block mt-4">{t('login')}</button>
          </form>
          <button type="button" className="btn btn-ghost btn-block mt-4" onClick={() => setIsRegistering(true)}>{t('noAccount')} {t('signUp')}</button>

          {/* Footer Quote */}
          <footer style={{
            marginTop: '2rem',
            paddingTop: '1.25rem',
            borderTop: '1px solid var(--border-color)',
            textAlign: 'center',
            opacity: 0.85,
          }}>
            <p style={{
              fontStyle: 'italic',
              fontSize: '0.85rem',
              color: 'var(--text-secondary)',
              marginBottom: '0.2rem',
              fontWeight: '500',
            }}>&ldquo;Success is a journey , not a destination&rdquo;</p>
            <p style={{
              fontSize: '0.75rem',
              fontWeight: '700',
              color: 'var(--primary)',
              letterSpacing: '0.05em',
            }}>&mdash; Sohel Sir</p>
          </footer>
        </div>
      </div>
    );
  }

  if (student && !student.is_approved) {
    return (
      <div className="lockscreen-container app-page">
        <div className="locked-blur app-shell">
          <header className="app-header glass"><h3>{t('student')}</h3></header>
        </div>
        <div className="lockscreen-overlay">
          <div className="lockscreen-card glass">
            <div className="lock-icon-container"><Lock size={28} /></div>
            <h3>{t('approvalPending')}</h3>
            <p className="text-secondary">{t('approvalPendingHint')}</p>
            <button className="btn btn-danger btn-block" onClick={handleLogout}><LogOut size={16} /> {t('logout')}</button>
          </div>
        </div>
      </div>
    );
  }

  const studentTabs = [
    { id: 'batches', icon: BookOpen, label: t('enrolledBatches') },
    { id: 'profile', icon: User, label: t('profile') },
  ];

  return (
    <AppShell
      userName={student?.name}
      userSubtitle={`${student?.class} · ${student?.institution}`}
      avatarUrl={student?.photo_url}
      avatarGender={student?.gender || 'Male'}
      avatarId={student?.id || ''}
      avatarLetter={student?.name?.[0]}
      tabs={studentTabs}
      activeTab={activeTab}
      onTabChange={handleTabChange}
    >
      {activeTab === 'batches' && (
        <div>
          <h3 className="section-title">{t('enrolledBatches')}</h3>
          
          {/* Notification permission prompt — only visible when permission not yet decided or denied */}
          {(notificationPermissionStatus === 'default' || notificationPermissionStatus === 'denied') && (
            <div
              style={{
                background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark, #4f35cc) 100%)',
                borderRadius: 'var(--radius-lg)',
                padding: '1.25rem 1.5rem',
                marginBottom: '1.25rem',
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                boxShadow: '0 4px 24px rgba(99,102,241,0.25)',
              }}
            >
              {/* Bell icon */}
              <div style={{
                width: '48px', height: '48px', borderRadius: '50%',
                background: 'rgba(255,255,255,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0
              }}>
                <Bell size={24} color="#fff" />
              </div>

              {/* Text */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {notificationPermissionStatus === 'default' ? (
                  <>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#fff', marginBottom: '0.2rem' }}>
                      Enable Notifications
                    </div>
                    <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.85)' }}>
                      Get instant alerts when your teacher posts an announcement or uploads new notes.
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#fff', marginBottom: '0.2rem' }}>
                      Notifications Blocked
                    </div>
                    <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.85)' }}>
                      To receive alerts, click the lock icon in your browser's address bar and allow notifications for this site.
                    </div>
                  </>
                )}
              </div>

              {/* Action button */}
              {notificationPermissionStatus === 'default' && (
                <button
                  type="button"
                  onClick={handleRequestNotificationPermission}
                  style={{
                    background: '#fff',
                    color: 'var(--primary)',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    padding: '0.55rem 1.25rem',
                    fontWeight: 700,
                    fontSize: '0.88rem',
                    cursor: 'pointer',
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                    transition: 'transform 0.15s, box-shadow 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.05)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
                >
                  Enable Now
                </button>
              )}
            </div>
          )}

          {enrolledBatches.length === 0 ? (
            <div className="card empty-state">
              <BookOpen size={40} />
              <p className="text-secondary">{t('noEnrolledBatches')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-3">
              {enrolledBatches.map((batch) => (
                <div key={batch.id} className="card card-hover card-compact" style={{ cursor: 'pointer' }} onClick={() => onSelectBatch(batch)}>
                  {(batchUnread[batch.id]?.total || 0) > 0 && (
                    <span className="batch-card-badge">{batchUnread[batch.id].total}</span>
                  )}
                  {batch.thumbnail_url ? <img src={batch.thumbnail_url} alt={batch.title} className="batch-card-thumb" /> : <div className="batch-card-placeholder">{t('noThumbnail')}</div>}
                  <h4>{batch.title}</h4>
                  <div className="flex flex-wrap gap-2 mt-2">{batch.classes.map(cls => <span key={cls} className="badge badge-primary">{cls}</span>)}</div>
                  <button className="btn btn-primary btn-sm btn-block mt-4">{t('enterClassroom')}</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}


      {activeTab === 'profile' && (
        <div className="card card-compact">
          <div className="flex justify-between align-center mb-4">
            <h3 className="section-title" style={{ margin: 0 }}>{t('profile')}</h3>
            {!isEditingProfile && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                onClick={() => setIsEditingProfile(true)}
              >
                <Pencil size={14} /> Edit Profile
              </button>
            )}
          </div>

          {profileSuccess && <div className="alert-banner alert-banner-success" style={{ marginBottom: '1rem' }}><div>{profileSuccess}</div></div>}

          {/* Avatar Row */}
          <div className="flex align-center gap-4 mb-6">
            <img
              src={getAvatarUrl(profileForm.photo_url, student?.gender, student?.id)}
              alt=""
              className="avatar avatar-lg"
              style={{ width: '72px', height: '72px', borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--primary)' }}
            />
            <div>
              <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{student?.name}</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{student?.class} · {student?.gender}</div>
              {isEditingProfile && (
                <label className="btn btn-secondary btn-sm mt-2" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Camera size={14} /> Change Photo
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleProfileImageUpload(e, 'edit')} />
                </label>
              )}
            </div>
          </div>

          {/* View Mode */}
          {!isEditingProfile && (
            <div className="flex flex-col gap-3">
              {[['Name', student?.name], ['Phone', student?.phone_number], ['Email', student?.email || profileForm.email || '—'], ['Date of Birth', student?.dob || '—'], ['Institution', student?.institution || '—'], ['Class', student?.class || '—']].map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.6rem 0.75rem', borderRadius: 'var(--radius-sm)', background: 'var(--bg-secondary)' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</span>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{value}</span>
                </div>
              ))}
            </div>
          )}

          {/* Edit Mode */}
          {isEditingProfile && (
            <form onSubmit={async (e) => { await handleUpdateProfile(e); setIsEditingProfile(false); }}>
              <div className="form-group">
                <label className="form-label">{t('name')}</label>
                <input type="text" className="input-control" disabled value={student?.name || ''} />
              </div>
              <div className="form-group">
                <label className="form-label">{t('phone')}</label>
                <input type="text" className="input-control" disabled value={student?.phone_number || ''} />
              </div>
              <div className="form-group">
                <label className="form-label">{t('email')}</label>
                <input type="email" className="input-control" value={profileForm.email} onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">{t('dob')}</label>
                <input type="date" className="input-control" value={profileForm.dob} onChange={(e) => setProfileForm({ ...profileForm, dob: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">{t('institution')}</label>
                <input type="text" className="input-control" value={profileForm.institution} onChange={(e) => setProfileForm({ ...profileForm, institution: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">{t('class')}</label>
                <select className="input-control select-control" value={profileForm.class} onChange={(e) => setProfileForm({ ...profileForm, class: e.target.value })}>
                  {CLASSES.map(cls => (
                    <option key={cls} value={cls}>{cls}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 mt-4">
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Update Profile</button>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setIsEditingProfile(false)}>Cancel</button>
              </div>
            </form>
          )}
          
          <div style={{ marginTop: '2rem', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
            <button 
              type="button" 
              className="btn btn-danger btn-block" 
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
              onClick={handleLogout}
            >
              <LogOut size={16} />
              {t('logout')}
            </button>
          </div>
        </div>
      )}
      {/* Footer Quote */}
      <footer style={{
        marginTop: '3rem',
        padding: '1.5rem 0',
        borderTop: '1px solid var(--border-color)',
        textAlign: 'center',
        opacity: 0.85,
      }}>
        <p style={{
          fontStyle: 'italic',
          fontSize: '0.85rem',
          color: 'var(--text-secondary)',
          marginBottom: '0.2rem',
          fontWeight: '500',
        }}>&ldquo;Success is a journey , not a destination&rdquo;</p>
        <p style={{
          fontSize: '0.75rem',
          fontWeight: '700',
          color: 'var(--primary)',
          letterSpacing: '0.05em',
        }}>&mdash; Sohel Sir</p>
      </footer>
    </AppShell>
  );
}
