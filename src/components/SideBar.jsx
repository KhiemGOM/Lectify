import React from 'react'

function SideBar({ uploadSessions }) {
    return (
        <aside className="sidebar">
            <div className="logo">
                <h1>MD<span>Quiz</span></h1>
            </div>

            <div className="sessions-section">
                <h3>Upload Sessions</h3>
                <div className="sessions-list">
                    {uploadSessions.length > 0 ? (
                        uploadSessions.map(session => (
                            <div key={session.id} className="session-item">
                                <div className="session-info">
                                    <span className="session-name">{session.name}</span>
                                    <span className="session-meta">{session.fileCount} files • {session.date}</span>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="empty-state">
                            <p>No sessions yet</p>
                        </div>
                    )}
                </div>
            </div>
        </aside>
    )
}

export default SideBar