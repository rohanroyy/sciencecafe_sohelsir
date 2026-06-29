import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { compressImage } from '../utils/excel';
import AppShell from '../components/AppShell';
import ThemeToggle from '../components/ThemeToggle';
import LanguageToggle from '../components/LanguageToggle';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import { getAvatarUrl } from '../utils/avatars';
import { 
  User, PlusCircle, CheckSquare, Folder, LogOut, 
  GraduationCap, Phone, Mail, CheckCircle2, XCircle, Eye, EyeOff, ArrowRight, ArrowLeft,
  AlertTriangle, ChevronLeft, FileEdit, Calendar, User as UserIcon, Trash2, RotateCcw
} from 'lucide-react';

const AVAILABLE_SUBJECTS = [
  'Bangla', 'English', 'Math', 'Higher Math', 
  'Science', 'Physics', 'Chemistry', 'Biology', 'ICT'
];

const CLASSES = ['Class6', 'Class7', 'Class8', 'SSC', 'HSC'];

export default function TeacherDashboard({ onSelectBatch, onNavigateToExamSetup, onBack }) {
  const { t } = useLanguage();
  const { theme } = useTheme();
  const [session, setSession] = useState(null);
  const [teacher, setTeacher] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Login Form States
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [profileError, setProfileError] = useState('');
  const [showDemoSetup, setShowDemoSetup] = useState(false);

  // Profile Wizard States
  const [wizardStep, setWizardStep] = useState(1);
  const [profileForm, setProfileForm] = useState({
    name: '',
    photo_url: '',
    dob: '',
    gender: 'Male',
    address: '',
    phone: '',
    institution: '',
    degrees: '',
    experience: 0,
    subjects: []
  });
  
  // Dashboard Tabs
  const [activeTab, setActiveTab] = useState('batches'); // 'profile', 'create-batch', 'approve-students', 'batches'
  
  const [batches, setBatches] = useState([]);
  const [trashedBatches, setTrashedBatches] = useState([]);
  const [newBatch, setNewBatch] = useState({
    title: '',
    classes: [],
    subjects: [],
    thumbnail_url: ''
  });
  const [batchError, setBatchError] = useState('');
  const [batchSuccess, setBatchSuccess] = useState('');

  // Approve Students State
  const [pendingStudents, setPendingStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null); // For popup view
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [studentClassFilter, setStudentClassFilter] = useState('All');
  const [showPassword, setShowPassword] = useState(false);
  
  // Search & Filter for Batches
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClassFilter, setSelectedClassFilter] = useState('All');

  useEffect(() => {
    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchTeacherProfile(session.user.id, session.user.email);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchTeacherProfile(session.user.id, session.user.email);
      else {
        setTeacher(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchTeacherProfile = async (userId, userEmail = '') => {
    try {
      setLoading(true);
      setProfileError('');
      let { data, error } = await supabase
        .from('teachers')
        .select('*')
        .eq('id', userId)
        .single();

      if (error && error.code === 'PGRST116') {
        // Teacher profile doesn't exist yet, insert a blank one
        const { data: newProfile, error: insertError } = await supabase
          .from('teachers')
          .insert([{ id: userId, email: userEmail }])
          .select()
          .single();

        if (insertError) throw insertError;
        data = newProfile;
      } else if (error) {
        throw error;
      }

      setTeacher(data);
      if (data) {
        setProfileForm({
          name: data.name || '',
          photo_url: data.photo_url || '',
          dob: data.dob || '',
          gender: data.gender || 'Male',
          address: data.address || '',
          phone: data.phone || '',
          institution: data.institution || '',
          degrees: data.degrees || '',
          experience: data.experience || 0,
          subjects: data.subjects || []
        });
        
        if (data.is_profile_completed) {
          fetchBatches(userId);
          fetchPendingStudents();
        }
      }
    } catch (err) {
      console.error('Error fetching teacher profile:', err);
      setProfileError(err.message || 'Failed to load teacher profile');
    } finally {
      setLoading(false);
    }
  };

  const fetchBatches = async (teacherId) => {
    const { data, error } = await supabase
      .from('batches')
      .select('*')
      .eq('teacher_id', teacherId)
      .order('created_at', { ascending: false });
    if (data) {
      const now = Date.now();
      const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
      // Auto-cleanup batches in trash for more than 7 days
      const expiredIds = data
        .filter(b => b.deleted_at && (now - new Date(b.deleted_at).getTime()) > SEVEN_DAYS)
        .map(b => b.id);
      for (const id of expiredIds) {
        await supabase.from('batches').delete().eq('id', id);
      }
      const remaining = data.filter(b => !expiredIds.includes(b.id));
      setBatches(remaining.filter(b => !b.deleted_at));
      setTrashedBatches(remaining.filter(b => !!b.deleted_at));
    }
  };

  const trashBatch = async (batchId) => {
    if (!confirm('Move this batch to Trash?')) return;
    const { error } = await supabase
      .from('batches')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', batchId);
    if (error) { alert(error.message); return; }
    fetchBatches(session.user.id);
    alert(t('trashedSuccess'));
  };

  const restoreBatch = async (batchId) => {
    const { error } = await supabase
      .from('batches')
      .update({ deleted_at: null })
      .eq('id', batchId);
    if (error) { alert(error.message); return; }
    fetchBatches(session.user.id);
    alert(t('restoredSuccess'));
  };

  const permanentDeleteBatch = async (batchId) => {
    if (!confirm('Permanently delete this batch? This cannot be undone.')) return;
    const { error } = await supabase.from('batches').delete().eq('id', batchId);
    if (error) { alert(error.message); return; }
    fetchBatches(session.user.id);
    alert(t('permDeletedSuccess'));
  };

  const fetchPendingStudents = async () => {
    // Get all students
    const { data, error } = await supabase
      .from('students')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setPendingStudents(data);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      if (error) throw error;
    } catch (err) {
      setLoginError(err.message || 'Login failed');
      setLoading(false);
    }
  };

  // Demo credentials pre-fill helper — NO email sending, no signUp call
  const handleDemoLogin = async () => {
    const demoEmail = 'demoteacher@gmail.com';
    const demoPass = 'teacher123';

    // Pre-fill the form fields so the user sees the credentials
    setEmail(demoEmail);
    setPassword(demoPass);
    setLoginError('');
    setShowDemoSetup(false);
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: demoEmail,
        password: demoPass
      });

      if (error) {
        // Account likely doesn't exist yet — show one-time setup hint
        setShowDemoSetup(true);
        setLoading(false);
      }
    } catch (err) {
      setLoginError(err.message || 'Demo Login failed');
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setTeacher(null);
  };

  const handleProfileImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const base64 = await compressImage(file);
      setProfileForm({ ...profileForm, photo_url: base64 });
    } catch (err) {
      alert('Error compressing image');
    }
  };

  const handleSubjectToggle = (subj) => {
    const updated = [...profileForm.subjects];
    if (updated.includes(subj)) {
      setProfileForm({ ...profileForm, subjects: updated.filter(s => s !== subj) });
    } else {
      setProfileForm({ ...profileForm, subjects: [...updated, subj] });
    }
  };

  const saveProfile = async (e) => {
    if (e) e.preventDefault();
    
    // Validations
    if (!profileForm.name.trim()) return alert('Name is required');
    if (!profileForm.dob) return alert('Date of Birth is required');
    if (!profileForm.phone.trim()) return alert('Phone is required');
    if (!profileForm.institution.trim()) return alert('Institution is required');
    if (profileForm.subjects.length === 0) return alert('Please select at least one subject you teach');

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('teachers')
        .update({
          ...profileForm,
          is_profile_completed: true
        })
        .eq('id', session.user.id)
        .select()
        .single();

      if (error) throw error;
      setTeacher(data);
      fetchBatches(session.user.id);
      fetchPendingStudents();
    } catch (err) {
      alert(err.message || 'Error saving profile');
    } finally {
      setLoading(false);
    }
  };

  const handleBatchImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const base64 = await compressImage(file);
      setNewBatch({ ...newBatch, thumbnail_url: base64 });
    } catch (err) {
      alert('Error uploading thumbnail');
    }
  };

  const handleClassToggle = (cls) => {
    const updated = [...newBatch.classes];
    if (updated.includes(cls)) {
      setNewBatch({ ...newBatch, classes: updated.filter(c => c !== cls) });
    } else {
      setNewBatch({ ...newBatch, classes: [...updated, cls] });
    }
  };

  const createBatch = async (e) => {
    e.preventDefault();
    setBatchError('');
    setBatchSuccess('');

    if (!newBatch.title.trim()) {
      setBatchError('Batch title is required');
      return;
    }
    if (newBatch.classes.length === 0) {
      setBatchError('Select at least one class');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('batches')
        .insert([{
          teacher_id: session.user.id,
          title: newBatch.title,
          classes: newBatch.classes,
          subjects: newBatch.subjects,
          thumbnail_url: newBatch.thumbnail_url
        }])
        .select();

      if (error) throw error;
      
      setBatchSuccess('Batch created successfully!');
      setNewBatch({ title: '', classes: [], subjects: [], thumbnail_url: '' });
      fetchBatches(session.user.id);
      setActiveTab('batches');
    } catch (err) {
      setBatchError(err.message || 'Error creating batch');
    }
  };

  const approveStudent = async (studentId, approve) => {
    try {
      const { error } = await supabase
        .from('students')
        .update({ is_approved: approve })
        .eq('id', studentId);

      if (error) throw error;
      
      // Update local state
      setPendingStudents(pendingStudents.map(s => s.id === studentId ? { ...s, is_approved: approve } : s));
      if (selectedStudent && selectedStudent.id === studentId) {
        setSelectedStudent({ ...selectedStudent, is_approved: approve });
      }
    } catch (err) {
      alert(err.message || 'Error updating student approval');
    }
  };

  const deleteStudent = async (studentId) => {
    if (!confirm('Are you sure you want to reject/remove this student?')) return;
    try {
      const { error } = await supabase
        .from('students')
        .delete()
        .eq('id', studentId);
      if (error) throw error;
      setPendingStudents(pendingStudents.filter(s => s.id !== studentId));
      setSelectedStudent(null);
    } catch (err) {
      alert(err.message || 'Error rejecting student');
    }
  };

  if (loading && !session) {
    return (
      <div className="auth-screen">
        <div className="card glass">{t('loading')}</div>
      </div>
    );
  }

  if (session && !teacher) {
    return (
      <div className="auth-screen">
        <div className="auth-card glass text-center">
          {profileError ? (
            <>
              <div className="alert-banner alert-banner-danger">{profileError}</div>
              <button className="btn btn-primary btn-block" onClick={() => fetchTeacherProfile(session.user.id, session.user.email)}>{t('retry')}</button>
              <button className="btn btn-secondary btn-block mt-2" onClick={handleLogout}>{t('backToLogin')}</button>
            </>
          ) : (
            <p>{t('loadingDashboard')}</p>
          )}
        </div>
      </div>
    );
  }

  const authToolbar = (
    <div className="auth-toolbar">
      <LanguageToggle />
      <ThemeToggle />
    </div>
  );

  // Teacher Login Render
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
          <h3 className="auth-title">{t('teacherLogin')}</h3>
          
          {loginError && <div className="alert-banner alert-banner-danger"><div>{loginError}</div></div>}

          {showDemoSetup && (
            <div className="alert-banner alert-banner-warning flex-col">
              <strong className="flex align-center gap-2"><AlertTriangle size={16} /> {t('demoNotReady')}</strong>
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label className="form-label">{t('adminEmail')}</label>
              <input type="email" className="input-control" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('password')}</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input-control"
                  style={{ paddingRight: '2.5rem' }}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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

  // Teacher Profile Completion Wizard
  if (teacher && !teacher.is_profile_completed) {
    return (
      <div className="auth-screen">
        <div className="auth-card glass" style={{ maxWidth: '520px' }}>
          {authToolbar}
          <h3 className="auth-title">{t('completeProfile')}</h3>
          <p className="auth-sub">{t('completeProfileHint')}</p>
          
          {/* Progress Indicator */}
          <div className="wizard-progress">
            <div className={`wizard-step ${wizardStep >= 1 ? 'active' : ''} ${wizardStep > 1 ? 'completed' : ''}`}>1</div>
            <div className={`wizard-step ${wizardStep >= 2 ? 'active' : ''} ${wizardStep > 2 ? 'completed' : ''}`}>2</div>
            <div className={`wizard-step ${wizardStep >= 3 ? 'active' : ''} ${wizardStep > 3 ? 'completed' : ''}`}>3</div>
          </div>

          {/* Step 1: Personal Info */}
          {wizardStep === 1 && (
            <div>
              <h4 className="mb-4">Step 1: Personal Details</h4>
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input
                  type="text"
                  className="input-control"
                  value={profileForm.name}
                  onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                  placeholder="e.g. Professor Sohel Sir"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="form-label">Gender</label>
                  <select
                    className="input-control select-control"
                    value={profileForm.gender}
                    onChange={(e) => setProfileForm({ ...profileForm, gender: e.target.value })}
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Date of Birth</label>
                  <input
                    type="date"
                    className="input-control"
                    value={profileForm.dob}
                    onChange={(e) => setProfileForm({ ...profileForm, dob: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group mt-2">
                <label className="form-label">Profile Photo (PNG)</label>
                <div className="flex gap-4 align-center">
                  <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                    Upload Photo
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={handleProfileImageUpload}
                    />
                  </label>
                  {profileForm.photo_url && (
                    <img src={profileForm.photo_url} alt="Profile preview" className="avatar avatar-lg" />
                  )}
                </div>
              </div>

              <div className="flex justify-end mt-6">
                <button 
                  className="btn btn-primary" 
                  onClick={() => {
                    if(!profileForm.name.trim() || !profileForm.dob) {
                      alert('Please fill out Name and Date of Birth');
                      return;
                    }
                    setWizardStep(2);
                  }}
                >
                  Next Step <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Contact & Institution */}
          {wizardStep === 2 && (
            <div>
              <h4 className="mb-4">Step 2: Contact & Institution</h4>
              <div className="form-group">
                <label className="form-label">Phone Number</label>
                <input
                  type="text"
                  className="input-control"
                  placeholder="+8801700000000"
                  value={profileForm.phone}
                  onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Address</label>
                <input
                  type="text"
                  className="input-control"
                  placeholder="Street, City, Country"
                  value={profileForm.address}
                  onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Current Institution</label>
                <input
                  type="text"
                  className="input-control"
                  placeholder="School / College / University Name"
                  value={profileForm.institution}
                  onChange={(e) => setProfileForm({ ...profileForm, institution: e.target.value })}
                />
              </div>

              <div className="flex justify-between mt-6">
                <button className="btn btn-secondary" onClick={() => setWizardStep(1)}>
                  <ArrowLeft size={16} /> Back
                </button>
                <button 
                  className="btn btn-primary" 
                  onClick={() => {
                    if(!profileForm.phone.trim() || !profileForm.institution.trim()) {
                      alert('Please fill out Phone and Institution');
                      return;
                    }
                    setWizardStep(3);
                  }}
                >
                  Next Step <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Qualifications & Subjects */}
          {wizardStep === 3 && (
            <div>
              <h4 className="mb-4">Step 3: Teaching Credentials</h4>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="form-label">Degrees</label>
                  <input
                    type="text"
                    className="input-control"
                    placeholder="B.Sc, M.Sc, PhD"
                    value={profileForm.degrees}
                    onChange={(e) => setProfileForm({ ...profileForm, degrees: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Teaching Experience (Years)</label>
                  <input
                    type="number"
                    className="input-control"
                    value={profileForm.experience}
                    onChange={(e) => setProfileForm({ ...profileForm, experience: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>

              <div className="form-group mt-2">
                <label className="form-label">Subjects You Teach (Select all that apply)</label>
                <div className="flex flex-wrap gap-2" style={{ maxHeight: '150px', overflowY: 'auto', border: '1px solid var(--border-color)', padding: '0.75rem', borderRadius: 'var(--radius-md)' }}>
                  {AVAILABLE_SUBJECTS.map((subj) => (
                    <label key={subj} className="checkbox-group" style={{ flex: '1 0 40%', margin: '0.25rem 0' }}>
                      <input
                        type="checkbox"
                        className="checkbox-control"
                        checked={profileForm.subjects.includes(subj)}
                        onChange={() => handleSubjectToggle(subj)}
                      />
                      <span>{subj}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-between mt-6">
                <button className="btn btn-secondary" onClick={() => setWizardStep(2)}>
                  <ArrowLeft size={16} /> Back
                </button>
                <button className="btn btn-success" onClick={saveProfile}>
                  <CheckCircle2 size={16} /> Submit & Unlock Dashboard
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const teacherTabs = [
    { id: 'batches', icon: Folder, label: t('batches') },
    { id: 'create-batch', icon: PlusCircle, label: t('createBatch') },
    { id: 'approve-students', icon: CheckSquare, label: t('approveStudents') },
    { id: 'trash', icon: Trash2, label: t('trash') },
    { id: 'profile', icon: User, label: t('profile') },
  ];

  return (
    <AppShell
      userName={teacher?.name || t('teacher')}
      userSubtitle={teacher?.institution}
      avatarUrl={teacher?.photo_url}
      avatarGender={teacher?.gender || 'Male'}
      avatarId={teacher?.id || ''}
      avatarLetter={teacher?.name?.[0] || 'T'}
      tabs={teacherTabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      headerActions={
        <button type="button" className="icon-btn" onClick={onNavigateToExamSetup} aria-label={t('examSetupPanel')}>
          <FileEdit size={18} strokeWidth={1.75} />
        </button>
      }
    >

      {activeTab === 'batches' && (
        <div>
          <h3 className="section-title">{t('myBatches')}</h3>
          
          {/* Search and Filters */}
          <div className="flex gap-4 mb-6" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="form-group mb-0" style={{ flex: '1 1 250px', marginBottom: 0 }}>
              <input
                type="text"
                className="input-control"
                placeholder="Search batches by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="form-group mb-0" style={{ width: '150px', marginBottom: 0 }}>
              <select
                className="input-control select-control"
                value={selectedClassFilter}
                onChange={(e) => setSelectedClassFilter(e.target.value)}
              >
                <option value="All">All Classes</option>
                {CLASSES.map(cls => (
                  <option key={cls} value={cls}>{cls}</option>
                ))}
              </select>
            </div>
          </div>

          {batches.length === 0 ? (
            <div className="card empty-state">
              <Folder size={40} />
              <p className="text-secondary">{t('noBatches')}</p>
              <button className="btn btn-primary btn-sm" onClick={() => setActiveTab('create-batch')}>
                <PlusCircle size={16} /> {t('createFirstBatch')}
              </button>
            </div>
          ) : batches.filter(b => {
              const matchesName = b.title.toLowerCase().includes(searchQuery.toLowerCase());
              const matchesClass = selectedClassFilter === 'All' || b.classes.includes(selectedClassFilter);
              return matchesName && matchesClass;
            }).length === 0 ? (
            <div className="card empty-state">
              <Folder size={40} />
              <p className="text-secondary">No matching batches found.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3">
              {batches
                .filter(b => {
                  const matchesName = b.title.toLowerCase().includes(searchQuery.toLowerCase());
                  const matchesClass = selectedClassFilter === 'All' || b.classes.includes(selectedClassFilter);
                  return matchesName && matchesClass;
                })
                .map((batch) => (
                  <div key={batch.id} className="card card-hover card-compact" style={{ position: 'relative' }}>
                    <div style={{ cursor: 'pointer' }} onClick={() => onSelectBatch(batch)}>
                      {batch.thumbnail_url ? (
                        <img src={batch.thumbnail_url} alt={batch.title} className="batch-card-thumb" />
                      ) : (
                        <div className="batch-card-placeholder">{t('noThumbnail')}</div>
                      )}
                      <h4>{batch.title}</h4>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {batch.classes.map(cls => <span key={cls} className="badge badge-primary">{cls}</span>)}
                      </div>
                      {batch.subjects?.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-1">
                          {batch.subjects.map(subj => <span key={subj} className="badge" style={{ background: 'var(--surface-2)', fontSize: '0.7rem' }}>{subj}</span>)}
                        </div>
                      )}
                      <button className="btn btn-secondary btn-sm btn-block mt-4">{t('manageBatch')}</button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
      {activeTab === 'create-batch' && (
        <div className="card card-compact">
          <h3 className="section-title">{t('createBatch')}</h3>
          {batchError && <div className="alert-banner alert-banner-danger"><div>{batchError}</div></div>}
          {batchSuccess && <div className="alert-banner alert-banner-success"><div>{batchSuccess}</div></div>}
          <form onSubmit={createBatch}>
            <div className="form-group">
              <label className="form-label">{t('batchTitle')}</label>
              <input type="text" className="input-control" value={newBatch.title} onChange={(e) => setNewBatch({ ...newBatch, title: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('selectClasses')}</label>
              <div className="checkbox-grid">
                {CLASSES.map(cls => (
                  <label key={cls} className="checkbox-group">
                    <input type="checkbox" className="checkbox-control" checked={newBatch.classes.includes(cls)} onChange={() => handleClassToggle(cls)} />
                    <span>{cls}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">{t('selectSubjects')}</label>
              <div className="checkbox-grid">
                {AVAILABLE_SUBJECTS.map(subj => (
                  <label key={subj} className="checkbox-group">
                    <input
                      type="checkbox"
                      className="checkbox-control"
                      checked={newBatch.subjects.includes(subj)}
                      onChange={() => {
                        const updated = newBatch.subjects.includes(subj)
                          ? newBatch.subjects.filter(s => s !== subj)
                          : [...newBatch.subjects, subj];
                        setNewBatch({ ...newBatch, subjects: updated });
                      }}
                    />
                    <span>{subj}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">{t('thumbnail')}</label>
              <div className="flex gap-4 align-center">
                <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                  {t('uploadThumbnail')}
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleBatchImageUpload} />
                </label>
                {newBatch.thumbnail_url && <img src={newBatch.thumbnail_url} alt="" style={{ height: '72px', borderRadius: 'var(--radius-sm)' }} />}
              </div>
            </div>
            <button type="submit" className="btn btn-primary btn-block mt-4">{t('createBatchBtn')}</button>
          </form>
        </div>
      )}

      {activeTab === 'approve-students' && (
        <div>
          <h3 className="section-title">{t('approvePanel')}</h3>
          
          <div className="flex gap-4 mb-4" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="form-group mb-0" style={{ flex: '1 1 250px', marginBottom: 0 }}>
              <input
                type="text"
                className="input-control"
                placeholder="Search students by name..."
                value={studentSearchQuery}
                onChange={(e) => setStudentSearchQuery(e.target.value)}
              />
            </div>
            <div className="form-group mb-0" style={{ width: '150px', marginBottom: 0 }}>
              <select
                className="input-control select-control"
                value={studentClassFilter}
                onChange={(e) => setStudentClassFilter(e.target.value)}
              >
                <option value="All">All Classes</option>
                {CLASSES.map(cls => (
                  <option key={cls} value={cls}>{cls}</option>
                ))}
              </select>
            </div>
          </div>

          {pendingStudents.filter(s => {
            const matchesName = s.name.toLowerCase().includes(studentSearchQuery.toLowerCase());
            const matchesClass = studentClassFilter === 'All' || s.class === studentClassFilter;
            return matchesName && matchesClass;
          }).length === 0 ? (
            <div className="card empty-state">
              <p className="text-secondary">
                {pendingStudents.length === 0 ? t('noStudents') : 'No matching students found'}
              </p>
            </div>
          ) : (
            <div className="student-card-list">
              {pendingStudents
                .filter(s => {
                  const matchesName = s.name.toLowerCase().includes(studentSearchQuery.toLowerCase());
                  const matchesClass = studentClassFilter === 'All' || s.class === studentClassFilter;
                  return matchesName && matchesClass;
                })
                .map((stud) => (
                  <div key={stud.id} className="student-card">
                    {stud.photo_url ? <img src={stud.photo_url} alt="" className="avatar avatar-sm" /> : <img src={getAvatarUrl(stud.photo_url, stud.gender, stud.id)} alt="" className="avatar avatar-sm" />}
                    <div className="student-card-info">
                      <div className="student-card-name">{stud.name}</div>
                      <div className="student-card-meta">{stud.class} · {stud.institution}</div>
                      <span className={`badge ${stud.is_approved ? 'badge-success' : 'badge-warning'} mt-2`}>{stud.is_approved ? t('approved') : t('pending')}</span>
                    </div>
                    <div className="student-card-actions flex-col">
                      <button className="icon-btn" onClick={() => setSelectedStudent(stud)} aria-label={t('viewProfile')}><Eye size={16} /></button>
                      {stud.is_approved ? (
                        <button className="btn btn-danger btn-sm" onClick={() => approveStudent(stud.id, false)}>{t('revoke')}</button>
                      ) : (
                        <button className="btn btn-success btn-sm" onClick={() => approveStudent(stud.id, true)}>{t('approve')}</button>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'trash' && (
        <div>
          <h3 className="section-title">{t('trash')}</h3>
          {trashedBatches.length === 0 ? (
            <div className="card empty-state">
              <Trash2 size={40} />
              <p className="text-secondary">{t('emptyTrash')}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {trashedBatches.map(batch => {
                const deletedAgo = batch.deleted_at
                  ? Math.floor((Date.now() - new Date(batch.deleted_at).getTime()) / (1000 * 60 * 60 * 24))
                  : 0;
                const daysLeft = 7 - deletedAgo;
                return (
                  <div key={batch.id} className="card card-compact" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ flex: 1 }}>
                      <h4 style={{ margin: 0 }}>{batch.title}</h4>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {batch.classes.map(cls => <span key={cls} className="badge badge-primary" style={{ fontSize: '0.7rem' }}>{cls}</span>)}
                      </div>
                      <p className="text-secondary" style={{ fontSize: '0.78rem', marginTop: '0.4rem' }}>
                        🗑️ Deleted {deletedAgo}d ago · Auto-deletes in {daysLeft} day{daysLeft !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                        onClick={() => restoreBatch(batch.id)}
                      >
                        <RotateCcw size={14} /> {t('restore')}
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                        onClick={() => permanentDeleteBatch(batch.id)}
                      >
                        <XCircle size={14} /> {t('deletePermanently')}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'profile' && (
        <div className="card card-compact">
          <h3 className="section-title">{t('editProfile')}</h3>
          <form onSubmit={(e) => { saveProfile(e); }}>
            <div className="flex align-center gap-4 mb-4">
              {profileForm.photo_url ? <img src={profileForm.photo_url} alt="" className="avatar avatar-lg" /> : <div className="avatar avatar-lg">{profileForm.name?.[0] || 'T'}</div>}
              <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                {t('updateAvatar')}
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleProfileImageUpload} />
              </label>
            </div>
            <div className="form-group">
              <label className="form-label">{t('name')}</label>
              <input type="text" className="input-control" value={profileForm.name} onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('gender')}</label>
              <select className="input-control select-control" value={profileForm.gender} onChange={(e) => setProfileForm({ ...profileForm, gender: e.target.value })}>
                <option value="Male">{t('male')}</option>
                <option value="Female">{t('female')}</option>
                <option value="Other">{t('other')}</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">{t('dob')}</label>
              <input type="date" className="input-control" value={profileForm.dob} onChange={(e) => setProfileForm({ ...profileForm, dob: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('phone')}</label>
              <input type="text" className="input-control" value={profileForm.phone} onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('address')}</label>
              <input type="text" className="input-control" value={profileForm.address} onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('institution')}</label>
              <input type="text" className="input-control" value={profileForm.institution} onChange={(e) => setProfileForm({ ...profileForm, institution: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('degreesCerts')}</label>
              <input type="text" className="input-control" value={profileForm.degrees} onChange={(e) => setProfileForm({ ...profileForm, degrees: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('subjectsTeach')}</label>
              <div className="checkbox-grid">
                {AVAILABLE_SUBJECTS.map((subj) => (
                  <label key={subj} className="checkbox-group">
                    <input type="checkbox" className="checkbox-control" checked={profileForm.subjects.includes(subj)} onChange={() => handleSubjectToggle(subj)} />
                    <span>{subj}</span>
                  </label>
                ))}
              </div>
            </div>
            <button type="submit" className="btn btn-success btn-block mt-4">{t('saveProfile')}</button>
          </form>
          
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

      {selectedStudent && (
        <div className="modal-overlay" onClick={() => setSelectedStudent(null)}>
          <div className="modal-content glass" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h4>{t('studentDetails')}</h4>
              <button type="button" className="icon-btn" onClick={() => setSelectedStudent(null)} aria-label={t('close')}>&times;</button>
            </div>
            <div className="modal-body flex flex-col align-center text-center">
              {selectedStudent.photo_url ? <img src={selectedStudent.photo_url} alt="" className="avatar avatar-lg mb-4" /> : <div className="avatar avatar-lg mb-4">{selectedStudent.name?.[0]}</div>}
              <h2>{selectedStudent.name}</h2>
              <div className="flex gap-2 mb-4">
                <span className="badge badge-primary">{selectedStudent.class}</span>
                <span className={`badge ${selectedStudent.is_approved ? 'badge-success' : 'badge-warning'}`}>{selectedStudent.is_approved ? t('approved') : t('pending')}</span>
              </div>
              <div className="flex flex-col gap-3 text-left" style={{ width: '100%' }}>
                <div className="flex justify-between"><span className="text-secondary">{t('dob')}</span><span>{selectedStudent.dob || '—'}</span></div>
                <div className="flex justify-between"><span className="text-secondary">{t('gender')}</span><span>{selectedStudent.gender || '—'}</span></div>
                <div className="flex justify-between"><span className="text-secondary">{t('email')}</span><span>{selectedStudent.email}</span></div>
                <div className="flex justify-between"><span className="text-secondary">{t('phone')}</span><span>{selectedStudent.phone_number}</span></div>
                <div className="flex justify-between"><span className="text-secondary">{t('school')}</span><span>{selectedStudent.institution}</span></div>
              </div>
            </div>
            <div className="modal-footer">
              {selectedStudent.is_approved ? (
                <button className="btn btn-danger" onClick={() => approveStudent(selectedStudent.id, false)}>{t('revokeApproval')}</button>
              ) : (
                <button className="btn btn-success" onClick={() => approveStudent(selectedStudent.id, true)}>{t('approveStudent')}</button>
              )}
              <button className="btn btn-secondary" onClick={() => setSelectedStudent(null)}>{t('close')}</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
