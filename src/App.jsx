import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './firebase/firebaseConfig';
import './styles/UploadPage.css';
import './styles/LoginPage.css';
import SideBar from './components/SideBar';
import UploadPage from './components/UploadPage';
import QuizSettings from './components/QuizSettings';
import QuizResults from './components/QuizResults';
import QuizPage from './components/QuizPage';
import AnalyticsPage from './components/AnalyticsPage';
import LoginPage from './components/LoginPage';
import NoSubjectHome from './components/NoSubjectHome';
import { QUIZ_STORAGE_KEY, QUIZ_RESULTS_KEY } from './utils/quizData';
import { deleteFile, deleteSubject, loadSubjects, saveSubject } from './utils/api';
import LoadingModal from './components/LoadingModal';

const APP_PATH = '/studio';
const THEME_STORAGE_KEY = 'lectify-theme';
const FALLBACK_THEME = 'light';

const getInitialTheme = () => {
  if (typeof window === 'undefined') return FALLBACK_THEME;
  const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const App = () => {
  // ── All hooks must be called unconditionally at the top ───────────────────
  const [user, setUser] = useState(undefined); // undefined = loading, null = signed out
  const [quizWindowData] = useState(() => {
    const isQuizMode =
      new URLSearchParams(window.location.search).get('mode') === 'quiz';
    console.log('[App] init — isQuizMode:', isQuizMode);
    if (!isQuizMode) return null;
    try {
      const raw = sessionStorage.getItem(QUIZ_STORAGE_KEY);
      console.log('[App] sessionStorage quiz data:', raw ? `${raw.length} chars` : 'null');
      const parsed = raw ? JSON.parse(raw) : null;
      console.log('[App] parsed quizWindowData:', parsed ? `${parsed.questions?.length} questions` : 'null');
      return parsed;
    } catch (e) {
      console.error('[App] failed to parse quiz data from sessionStorage:', e);
      return null;
    }
  });

  const [activeTab, setActiveTab] = useState('home');
  const [uploadSessions, setUploadSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [lastQuizResults, setLastQuizResults] = useState(null);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState(null);
  const [showUploadComposer, setShowUploadComposer] = useState(false);
  const [theme, setTheme] = useState(getInitialTheme);

  // Listen for Firebase auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser ?? null);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (quizWindowData) return;
    if (user === undefined) return;

    const path = window.location.pathname;
    if (!user) {
      if (path.startsWith(APP_PATH)) {
        window.history.replaceState({}, '', '/');
      }
      return;
    }

    // Keep "/" as public homepage even when authenticated.
    if (path !== '/' && !path.startsWith(APP_PATH)) {
      window.history.replaceState({}, '', APP_PATH);
    }
  }, [user, quizWindowData]);

  // Load saved subjects when user logs in
  useEffect(() => {
    if (!user) {
      setUploadSessions([]);
      setCurrentSessionId(null);
      setShowUploadComposer(false);
      return;
    }
    setSessionsLoading(true);
    loadSubjects(user.uid)
      .then((sessions) => {
        setUploadSessions(sessions);
      })
      .catch((err) => console.error('Failed to load subjects:', err))
      .finally(() => setSessionsLoading(false));
  }, [user]);

  // Listen for quiz results written to localStorage by the popup window
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== QUIZ_RESULTS_KEY) return;
      console.log('[App] storage event fired for QUIZ_RESULTS_KEY', { newValue: e.newValue });
      try {
        const data = JSON.parse(e.newValue);
        if (data) {
          console.log('[App] setting quiz results from storage event', data);
          setLastQuizResults(data);
          setActiveTab('quiz');
        }
      } catch (_) {}
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const isInActiveSession = uploadSessions.length > 0 && currentSessionId !== null;
  const showUploadTab = isInActiveSession || showUploadComposer;
  const toggleTheme = () => setTheme((prevTheme) => (prevTheme === 'dark' ? 'light' : 'dark'));
  const nextTheme = theme === 'dark' ? 'light' : 'dark';

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleUploadComplete = (title, fileCount, apiData, subjectId, context) => {
    const newFiles = apiData?.files || [];

    if (isInActiveSession) {
      setUploadSessions(prev => {
        const updated = prev.map(s =>
          s.id === currentSessionId
            ? { ...s, fileCount: s.fileCount + fileCount, files: [...s.files, ...newFiles] }
            : s
        );
        // Persist the updated session
        const updatedSession = updated.find(s => s.id === currentSessionId);
        if (updatedSession) saveSubject(user.uid, updatedSession).catch(console.error);
        return updated;
      });
      setActiveTab('quiz');
      return;
    }

    const newSession = {
      id: subjectId,
      name: title || `Session ${uploadSessions.length + 1}`,
      date: new Date().toISOString().split('T')[0],
      fileCount,
      files: newFiles,
      context: context || '',
    };
    setUploadSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
    setActiveTab('quiz');
    saveSubject(user.uid, newSession).catch(console.error);
  };

  const handleDeleteFile = async (sessionId, fileId) => {
    const session = uploadSessions.find(s => s.id === sessionId);
    if (!session) return;

    setLoadingMessage('Deleting file…');
    try {
      await deleteFile(fileId, user.uid, String(sessionId));
    } catch (err) {
      console.error('Failed to delete file from backend:', err);
    }

    const updatedSession = {
      ...session,
      files: session.files.filter(f => f.fileId !== fileId),
      fileCount: Math.max(0, session.fileCount - 1),
    };

    setUploadSessions(prev => prev.map(s => s.id === sessionId ? updatedSession : s));
    saveSubject(user.uid, updatedSession).catch(console.error);
    setLoadingMessage(null);
  };

  const handleUpdateContext = (context) => {
    const session = uploadSessions.find(s => s.id === currentSessionId);
    if (!session) return;
    const updated = { ...session, context };
    setUploadSessions(prev => prev.map(s => s.id === currentSessionId ? updated : s));
    saveSubject(user.uid, updated).catch(console.error);
  };

  const handleDeleteSubject = async (sessionId) => {
    const session = uploadSessions.find(s => s.id === sessionId);
    if (!session) return;

    setLoadingMessage('Deleting subject…');
    try {
      await Promise.all(
        (session.files || []).map(f =>
          deleteFile(f.fileId, user.uid, String(sessionId)).catch(console.error)
        )
      );
      await deleteSubject(user.uid, sessionId);
    } catch (err) {
      console.error('Failed to delete subject:', err);
    }

    setUploadSessions(prev => prev.filter(s => s.id !== sessionId));
    if (currentSessionId === sessionId) {
      setCurrentSessionId(null);
      setActiveTab('home');
      setShowUploadComposer(false);
    }
    setLoadingMessage(null);
  };

  // ── Auth guards ───────────────────────────────────────────────────────────
  if (user === undefined) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-secondary)' }}>
        <div style={{ width: 32, height: 32, border: '3px solid var(--border-color)', borderTopColor: 'var(--primary-blue)', borderRadius: '50%', animation: 'login-spin 0.7s linear infinite' }} />
      </div>
    );
  }

  if (window.location.pathname === '/') {
    return (
      <LoginPage
        isAuthenticated={!!user}
        onEnterStudio={() => window.location.assign(APP_PATH)}
      />
    );
  }

  if (!user) {
    return <LoginPage isAuthenticated={false} />;
  }

  // ── Quiz popup window: render QuizPage directly, no shell ────────────────
  if (quizWindowData) {
    return (
      <QuizPage
        quizMeta={quizWindowData.quizMeta}
        settings={quizWindowData.settings}
        questions={quizWindowData.questions}
        userId={quizWindowData.userId ?? 'default_user'}
        subjectId={quizWindowData.subjectId ?? 'default_subject'}
        reviewMode={!!quizWindowData.reviewMode}
        initialAnswers={quizWindowData.initialAnswers ?? {}}
        initialResults={quizWindowData.initialResults ?? null}
        onExit={() => window.close()}
      />
    );
  }

  // ── Normal app shell ──────────────────────────────────────────────────────

  return (
    <div className="upload-container">
      {loadingMessage && <LoadingModal message={loadingMessage} />}
      <SideBar
          handleNewSession={() => {
            setCurrentSessionId(null);
            setActiveTab('home');
            setShowUploadComposer(true);
          }}
          handleGoHome={() => {
            setCurrentSessionId(null);
            setActiveTab('home');
            setShowUploadComposer(false);
            window.location.assign('/');
          }}
          setCurrentSessionId={(id) => {
            setCurrentSessionId(id);
            setLastQuizResults(null);
            setShowUploadComposer(false);
            setActiveTab('quiz');
          }}
          currentSessionId={currentSessionId}
          uploadSessions={uploadSessions}
          onDeleteSubject={handleDeleteSubject}
          loadingSessions={sessionsLoading}
      />

      <main className="main-content">
        <header className="header">
          <nav className="tabs">
            <button
                className={`tab ${activeTab === 'home' ? 'active' : ''}`}
                onClick={() => {
                  if (!showUploadTab) {
                    setCurrentSessionId(null);
                    setShowUploadComposer(false);
                  }
                  setActiveTab('home');
                }}
              >
                {showUploadTab ? 'Upload' : 'Home'}
              </button>
            {isInActiveSession && (
              <>
                <button
                  className={`tab ${activeTab === 'quiz' ? 'active' : ''}`}
                  onClick={() => setActiveTab('quiz')}
                >
                  Quiz
                </button>
                <button
                  className={`tab ${activeTab === 'analytics' ? 'active' : ''}`}
                  onClick={() => setActiveTab('analytics')}
                >
                  Analytics
                </button>
              </>
            ) }
          </nav>
          <div className="user-section">
            <span style={{ fontSize: 13, color: 'var(--text-secondary, #64748b)', marginRight: 10 }}>
              {user.displayName || user.email}
            </span>
            <button
              type="button"
              className="theme-toggle-btn"
              onClick={toggleTheme}
              aria-label={`Switch to ${nextTheme} mode`}
              title={`Switch to ${nextTheme} mode`}
            >
              {theme === 'dark' ? (
                <svg className="theme-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="4" />
                  <line x1="12" y1="2" x2="12" y2="5" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                  <line x1="2" y1="12" x2="5" y2="12" />
                  <line x1="19" y1="12" x2="22" y2="12" />
                  <line x1="4.22" y1="4.22" x2="6.34" y2="6.34" />
                  <line x1="17.66" y1="17.66" x2="19.78" y2="19.78" />
                  <line x1="4.22" y1="19.78" x2="6.34" y2="17.66" />
                  <line x1="17.66" y1="6.34" x2="19.78" y2="4.22" />
                </svg>
              ) : (
                <svg className="theme-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
                </svg>
              )}
            </button>
            <button
              onClick={() => signOut(auth)}
              style={{ fontSize: 13, padding: '6px 14px', background: 'transparent', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: 6, cursor: 'pointer', color: 'var(--text-secondary, #64748b)' }}
            >
              Sign out
            </button>
          </div>
        </header>

        {activeTab === 'home' && (
          (isInActiveSession || showUploadComposer)
            ? <UploadPage
                onUploadComplete={handleUploadComplete}
                isInSession={isInActiveSession}
                userId={user.uid}
                subjectId={currentSessionId ?? null}
                sessionFiles={uploadSessions.find(s => s.id === currentSessionId)?.files ?? []}
                onDeleteFile={(fileId) => handleDeleteFile(currentSessionId, fileId)}
                sessionContext={uploadSessions.find(s => s.id === currentSessionId)?.context ?? ''}
                onUpdateContext={handleUpdateContext}
              />
            : <NoSubjectHome
                hasSubjects={uploadSessions.length > 0}
                onStartNew={() => setShowUploadComposer(true)}
              />
        )}
        {activeTab === 'quiz' && (
          lastQuizResults
            ? <QuizResults
                results={lastQuizResults.results}
                quizMeta={lastQuizResults.quizMeta}
                onRetake={() => setLastQuizResults(null)}
              />
            : <QuizSettings
                  key={currentSessionId}
                  session={uploadSessions.find(s => s.id === currentSessionId)}
                  userId={user.uid}
              />
        )}
        {activeTab === 'analytics' && (
          sessionsLoading
            ? <div style={{ padding: 40, color: 'var(--text-secondary)' }}>Loading…</div>
            : <AnalyticsPage userId={user.uid} subjectId={String(currentSessionId)} />
        )}
      </main>
    </div>
  );
};

export default App;
