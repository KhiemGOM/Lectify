import React, { useState, useEffect } from 'react';
import './styles/UploadPage.css';
import SideBar from './components/SideBar';
import UploadPage from './components/UploadPage';
import QuizSettings from './components/QuizSettings';
import QuizResults from './components/QuizResults';
import QuizPage from './components/QuizPage';
import AnalyticsPage from './components/AnalyticsPage';
import { QUIZ_STORAGE_KEY, QUIZ_RESULTS_KEY } from './utils/quizData';

const App = () => {
  // ── All hooks must be called unconditionally at the top ───────────────────
  const [quizWindowData] = useState(() => {
    const isQuizMode =
      new URLSearchParams(window.location.search).get('mode') === 'quiz';
    if (!isQuizMode) return null;
    try {
      const raw = sessionStorage.getItem(QUIZ_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const [activeTab, setActiveTab] = useState('upload');
  const [uploadSessions, setUploadSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [lastQuizResults, setLastQuizResults] = useState(null);

  // Listen for quiz results written to localStorage by the popup window
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== QUIZ_RESULTS_KEY) return;
      try {
        const data = JSON.parse(e.newValue);
        if (data) {
          setLastQuizResults(data);
          setActiveTab('quiz');
        }
      } catch (_) {}
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const isInActiveSession = uploadSessions.length > 0 && currentSessionId !== null;

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleUploadComplete = (title, fileCount, apiData) => {
    const newFiles = apiData?.files || [];

    if (isInActiveSession) {
      // Add files to the existing session
      setUploadSessions(prev => prev.map(s =>
        s.id === currentSessionId
          ? { ...s, fileCount: s.fileCount + fileCount, files: [...s.files, ...newFiles] }
          : s
      ));
      setActiveTab('quiz');
      return;
    }

    const newSession = {
      id: Date.now(),
      name: title || `Session ${uploadSessions.length + 1}`,
      date: new Date().toISOString().split('T')[0],
      fileCount: fileCount,
      files: newFiles,
    };
    setUploadSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
    setActiveTab('quiz');
  };

  // ── Quiz popup window: render QuizPage directly, no shell ────────────────
  if (quizWindowData) {
    return (
      <QuizPage
        quizMeta={quizWindowData.quizMeta}
        settings={quizWindowData.settings}
        questions={quizWindowData.questions}
        onExit={() => window.close()}
      />
    );
  }

  // ── Normal app shell ──────────────────────────────────────────────────────

  return (
    <div className="upload-container">
      <SideBar
        handleNewSession={() => {
          setCurrentSessionId(null);
          setActiveTab('upload');
        }}
        setCurrentSessionId={(id) => {
          setCurrentSessionId(id);
          setActiveTab('quiz');
        }}
        currentSessionId={currentSessionId}
        uploadSessions={uploadSessions}
      />

      <main className="main-content">
        <header className="header">
          <nav className="tabs">
            <button
                className={`tab ${activeTab === 'upload' ? 'active' : ''}`}
                onClick={() => setActiveTab('upload')}
              >
                Upload
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
            <div className="user-avatar" />
          </div>
        </header>

        {activeTab === 'upload' && (
          <UploadPage onUploadComplete={handleUploadComplete} isInSession={isInActiveSession} />
        )}
        {activeTab === 'quiz' && (
          lastQuizResults
            ? <QuizResults
                results={lastQuizResults.results}
                quizMeta={lastQuizResults.quizMeta}
                onRetake={() => setLastQuizResults(null)}
              />
            : <QuizSettings
                session={uploadSessions.find(s => s.id === currentSessionId)}
              />
        )}
        {activeTab === 'analytics' && (
          <AnalyticsPage />
        )}
      </main>
    </div>
  );
};

export default App;