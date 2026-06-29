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
import { GraduationCap, DatabaseZap, WifiOff } from 'lucide-react';
import PullToRefresh from './components/PullToRefresh';

function AppContent() {
  const { t } = useLanguage();
  const defaultPortal = getPortalFromHostname();
  const [view, setView] = useState(defaultPortal);
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

  const restoreRoute = useCallback(async () => {
    const hashRoute = parseHashRoute();
    const portal = hashRoute?.view || defaultPortal;

    if (!supabase) {
      setView(portal);
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
    } else if (hashRoute?.view === defaultPortal) {
      if (defaultPortal === 'teacher') {
        setTeacherTab(hashRoute.tab || 'batches');
      } else if (defaultPortal === 'student') {
        setStudentTab(hashRoute.tab || 'batches');
      }
      setView(defaultPortal);
    } else {
      setView(defaultPortal);
    }
    setRouteReady(true);
  }, [defaultPortal]);

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
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session) setCurrentUserId(session.user.id);
        else setCurrentUserId(null);
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

export default function App() {
  return <AppContent />;
}
