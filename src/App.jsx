import React, { useState } from 'react';
import './styles/UploadPage.css';
import SideBar from './components/SideBar';
import UploadPage from './components/UploadPage';

const App = () => {
  const [activeTab, setActiveTab] = useState('upload');
  const [uploadSessions, setUploadSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);

  // Function to create a new session after upload
  const handleUploadComplete = (title, fileCount) => {
    const newSession = {
      id: Date.now(),
      name: title || `Session ${uploadSessions.length + 1}`,
      date: new Date().toISOString().split('T')[0],
      fileCount: fileCount
    };
    
    setUploadSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
  };

  // Check if there's an active session
  const hasActiveSession = uploadSessions.length > 0;

  return (
    <div className="upload-container">
      {/* Sidebar - only show if there are sessions */}
      {<SideBar uploadSessions={uploadSessions} />}

      {/* Main Content */}
      <main className="main-content">
        {/* Header with Tabs - only show Quiz/Analytics if session exists */}
        <header className="header">
          <nav className="tabs">
            <button 
              className={`tab ${activeTab === 'upload' ? 'active' : ''}`}
              onClick={() => setActiveTab('upload')}
            >
              Upload
            </button>
            {hasActiveSession && (
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
            )}
          </nav>

          <div className="user-section">
            <div className="user-avatar"></div>
          </div>
        </header>

        {/* Upload Content */}
        {activeTab === 'upload' && (
          <UploadPage onUploadComplete={handleUploadComplete} />
        )}
        {activeTab === 'quiz' && <div className="content-area">Quiz Page</div>}
        {activeTab === 'analytics' && <div className="content-area">Analytics Page</div>}
      </main>
    </div>
  );
};

export default App;