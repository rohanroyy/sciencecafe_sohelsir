import React, { useState, useEffect, useCallback } from 'react';
import { supabase, getSupabaseConfig, saveSupabaseConfig, clearSupabaseConfig, setMockModeActive, isMockModeActive } from './supabase';
import TeacherDashboard from './pages/TeacherDashboard';
import StudentDashboard from './pages/StudentDashboard';
import ExamSetupPage from './pages/ExamSetupPage';
import BatchDetail from './pages/BatchDetail';
import ExamSession from './pages/ExamSession';
import ThemeToggle from './components/ThemeToggle';
import LanguageToggle from './components/LanguageToggle';
import { useLanguage } from './context/LanguageContext';
import { getPortalFromHostname, parseHashRoute, syncHashRoute } from './utils/navigation';
import { registerServiceWorker } from './utils/notifications';
import { GraduationCap, DatabaseZap, WifiOff, Eye, EyeOff } from 'lucide-react';
import PullToRefresh from './components/PullToRefresh';

function AppContent() {
  const { t } = useLanguage();
  const defaultPortal = getPortalFromHostname();
  const [view, setView] = useState(() => parseHashRoute()?.view || defaultPortal);
  const [config] = useState(getSupabaseConfig());
  const [urlInput, setUrlInput] = useState('');
  const [keyInput, setKeyInput] = useState('');
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [selectedExam, setSelectedExam] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [studentTab, setStudentTab] = useState('batches');
  const [teacherTab, setTeacherTab] = useState('batches');
  const [batchTab, setBatchTab] = useState('notes');
  const [routeReady, setRouteReady] = useState(false);
  const mockMode = isMockModeActive();

  const navigate = useCallback((nextView, extras = {}) => {
    setView(nextView);
    if (extras.batch !== undefined) setSelectedBatch(extras.batch);
    if (extras.exam !== undefined) setSelectedExam(extras.exam);
    if (extras.studentTab) setStudentTab(extras.studentTab);
    if (extras.teacherTab) setTeacherTab(extras.teacherTab);
    if (extras.batchTab) setBatchTab(extras.batchTab);

    syncHashRoute({
      view: nextView,
      batchId: extras.batch?.id ?? (nextView === 'batch-detail' ? selectedBatch?.id : null),
      examId: extras.exam?.id ?? (nextView === 'exam-session' ? selectedExam?.id : null),
      tab: extras.batchTab || extras.studentTab || extras.teacherTab,
    });
  }, [selectedBatch?.id, selectedExam?.id]);

  const applyPortalView = useCallback((portalView, tab) => {
    if (portalView === 'teacher') {
      setTeacherTab(tab || 'batches');
      setView('teacher');
    } else if (portalView === 'exam-setup') {
      setView('exam-setup');
    } else if (portalView === 'student') {
      setStudentTab(tab || 'batches');
      setView('student');
    } else {
      setView(defaultPortal);
    }
  }, [defaultPortal]);

  const restoreRoute = useCallback(async () => {
    const hashRoute = parseHashRoute();
    const portalFromHash = hashRoute?.view;

    if (!supabase) {
      applyPortalView(portalFromHash || defaultPortal, hashRoute?.tab);
      setRouteReady(true);
      return;
    }

    let batch = null;
    let exam = null;

    try {
      if (hashRoute?.view === 'batch-detail' && hashRoute.batchId) {
        const { data } = await supabase.from('batches').select('*').eq('id', hashRoute.batchId).maybeSingle();
        batch = data;
      }

      if (hashRoute?.view === 'exam-session' && hashRoute.examId) {
        const { data: examData } = await supabase.from('exams').select('*').eq('id', hashRoute.examId).maybeSingle();
        exam = examData;
        if (exam && !batch && hashRoute.batchId) {
          const { data: batchData } = await supabase.from('batches').select('*').eq('id', hashRoute.batchId).maybeSingle();
          batch = batchData;
        } else if (exam && !batch) {
          const { data: batchData } = await supabase.from('batches').select('*').eq('id', exam.batch_id).maybeSingle();
          batch = batchData;
        }
      }
    } catch (err) {
      console.warn('Route restore failed (DB may be offline):', err);
    }

    if (hashRoute?.view === 'batch-detail' && batch) {
      setSelectedBatch(batch);
      setBatchTab(hashRoute.tab || 'notes');
      setView('batch-detail');
    } else if (hashRoute?.view === 'exam-session' && exam) {
      setSelectedExam(exam);
      if (batch) setSelectedBatch(batch);
      setView('exam-session');
    } else if (portalFromHash === 'teacher' || portalFromHash === 'exam-setup' || portalFromHash === 'student') {
      applyPortalView(portalFromHash, hashRoute.tab);
    } else {
      applyPortalView(defaultPortal);
    }
    setRouteReady(true);
  }, [defaultPortal, applyPortalView]);

  useEffect(() => {
    registerServiceWorker();
    restoreRoute();

    const onHashChange = () => {
      restoreRoute();
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [restoreRoute]);

  useEffect(() => {
    if (supabase) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) setCurrentUserId(session.user.id);
      });
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (session) {
          setCurrentUserId(session.user.id);
          if (event === 'PASSWORD_RECOVERY') {
            setView('reset-password');
          }
        } else {
          setCurrentUserId(null);
        }
      });
      return () => subscription.unsubscribe();
    }
  }, []);

  const handleSaveConfig = (e) => {
    e.preventDefault();
    if (!urlInput.trim() || !keyInput.trim()) return;
    saveSupabaseConfig(urlInput, keyInput);
    window.location.reload();
  };

  const handleActivateLocalMode = () => {
    setMockModeActive(true);
    window.location.reload();
  };

  const goHome = () => {
    setSelectedBatch(null);
    setSelectedExam(null);
    setView(defaultPortal);
    syncHashRoute({ view: defaultPortal, tab: 'batches' }, true);
  };

  if (!supabase) {
    return (
      <div className="auth-screen">
        <div className="auth-card glass">
          <div className="auth-logo">
            <DatabaseZap size={24} style={{ color: 'var(--primary)' }} />
            <span>{t('appName')}</span>
          </div>
          <h3 className="auth-title">{t('connectDb')}</h3>
          <form onSubmit={handleSaveConfig}>
            <div className="form-group">
              <label className="form-label">{t('supabaseUrl')}</label>
              <input type="url" className="input-control" required placeholder="https://your-project.supabase.co" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('supabaseKey')}</label>
              <textarea className="input-control" required rows="3" placeholder="eyJ..." value={keyInput} onChange={(e) => setKeyInput(e.target.value)} />
            </div>
            <button type="submit" className="btn btn-primary btn-block">{t('saveConnect')}</button>
          </form>
          <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1.25rem', textAlign: 'center' }}>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              {t('localDbDesc')}
            </p>
            <button
              className="btn btn-ghost btn-block"
              style={{ border: '1px dashed var(--border)', gap: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onClick={handleActivateLocalMode}
            >
              <WifiOff size={16} />
              {t('activateLocalMode')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!routeReady) {
    return <div className="auth-screen"><div className="card glass">{t('loading')}</div></div>;
  }

  return (
    <PullToRefresh>
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
        <main className="flex-1">
          {view === 'teacher' && (
            <TeacherDashboard
              initialTab={teacherTab}
              onTabChange={(tab) => {
                setTeacherTab(tab);
                syncHashRoute({ view: 'teacher', tab });
              }}
              onSelectBatch={(batch) => navigate('batch-detail', { batch, batchTab: 'notes' })}
              onNavigateToExamSetup={() => navigate('exam-setup')}
              onBack={goHome}
            />
          )}

          {view === 'student' && (
            <StudentDashboard
              initialTab={studentTab}
              onTabChange={(tab) => {
                setStudentTab(tab);
                syncHashRoute({ view: 'student', tab });
              }}
              onSelectBatch={(batch) => navigate('batch-detail', { batch, batchTab: 'notes' })}
              onBack={goHome}
            />
          )}

          {view === 'exam-setup' && <ExamSetupPage onBack={goHome} />}

          {view === 'reset-password' && (
            <ResetPasswordView 
              onComplete={() => {
                setView('student');
                syncHashRoute({ view: 'student' }, true);
              }}
            />
          )}

          {view === 'batch-detail' && selectedBatch && (
            <BatchDetail
              batch={selectedBatch}
              role={currentUserId === selectedBatch.teacher_id ? 'teacher' : 'student'}
              userId={currentUserId}
              initialTab={batchTab}
              onTabChange={(tab) => {
                setBatchTab(tab);
                syncHashRoute({ view: 'batch-detail', batchId: selectedBatch.id, tab });
              }}
              onBack={() => {
                const backView = currentUserId === selectedBatch.teacher_id ? 'teacher' : 'student';
                setSelectedBatch(null);
                navigate(backView, { batch: null });
              }}
              onStartExam={(exam) => navigate('exam-session', { exam, batch: selectedBatch })}
            />
          )}

          {view === 'exam-session' && selectedExam && (
            <ExamSession
              exam={selectedExam}
              batchId={selectedBatch?.id}
              studentId={currentUserId}
              onExamCompleted={() => {
                setSelectedExam(null);
                navigate('batch-detail', { batch: selectedBatch, batchTab: 'exams' });
              }}
            />
          )}
        </main>
      </div>
    </PullToRefresh>
  );
}

function ResetPasswordView({ onComplete }) {
  const { t } = useLanguage();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      });

      if (updateError) throw updateError;

      setSuccess('Your password has been reset successfully! Redirecting...');
      setTimeout(async () => {
        await supabase.auth.signOut();
        onComplete();
      }, 3000);
    } catch (err) {
      setError(err.message || 'Failed to update password');
      setLoading(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card glass" style={{ maxWidth: '400px', width: '100%' }}>
        <h3 className="auth-title">Choose New Password</h3>
        <p className="text-secondary" style={{ fontSize: '0.85rem', marginBottom: '1.5rem', textAlign: 'center' }}>
          Enter a secure password containing at least 6 characters.
        </p>

        {error && <div className="alert-banner alert-banner-danger"><div>{error}</div></div>}
        {success && <div className="alert-banner alert-banner-success"><div>{success}</div></div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">New Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                className="input-control"
                style={{ paddingRight: '2.5rem' }}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 chars"
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
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Confirm New Password</label>
            <input
              type="password"
              className="input-control"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
            />
          </div>

          <button type="submit" className="btn btn-primary btn-block mt-4" disabled={loading}>
            {loading ? 'Updating...' : 'Update Password'}
          </button>
          
          <button 
            type="button" 
            className="btn btn-secondary btn-block mt-2" 
            onClick={async () => {
              await supabase.auth.signOut();
              onComplete();
            }}
            disabled={loading}
          >
            Cancel
          </button>
        </form>
      </div>
    </div>
  );
}

export default function App() {
  return <AppContent />;
}
