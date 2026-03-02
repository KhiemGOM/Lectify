import React from 'react'

function SideBar({ setCurrentSessionId, handleNewSession, uploadSessions, currentSessionId }) {
    return (
        <aside className="sidebar">
            <div className="logo">
                <h1>MD<span>Quiz</span></h1>
            </div>

            <div className="sessions-section">
                <h3>Upload Subjects</h3>
                <div className="sessions-list">
                    {uploadSessions.length > 0 ? (
                        uploadSessions.map(session => (

                            <button onClick={() => {
                                setCurrentSessionId(session.id);
                            }} key={session.id} className={`session-item ${currentSessionId === session.id ? 'active' : ''}`}>
                                <div className="session-info">
                                    <span className="session-name">{session.name}</span>
                                    <span className="session-meta">{session.fileCount} files • {session.date}</span>
                                </div>
                            </button>
                        ))
                    ) : (
                        <div className="empty-state">
                            <p>No subjects yet</p>
                        </div>
                    )}
                </div>
                {/* Button to create new session  */}
                <button className="new-session-btn" onClick={handleNewSession}>+ New Subject</button>
            </div>
        </aside>
    )
}

export default SideBar