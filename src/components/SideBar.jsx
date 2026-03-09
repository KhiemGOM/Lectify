import React, {useState} from 'react'

function SideBar({
                     setCurrentSessionId,
                     handleNewSession,
                     handleGoHome,
                     uploadSessions,
                     currentSessionId,
                     onDeleteSubject,
                     loadingSessions = false,
                 }) {
    const [confirmingDelete, setConfirmingDelete] = useState(null);

    const handleDeleteClick = (e, sessionId) => {
        e.stopPropagation();
        setConfirmingDelete(sessionId);
    };

    const handleConfirmDelete = (e, sessionId) => {
        e.stopPropagation();
        setConfirmingDelete(null);
        onDeleteSubject?.(sessionId);
    };

    const handleCancelDelete = (e) => {
        e.stopPropagation();
        setConfirmingDelete(null);
    };

    return (
        <aside className="sidebar">
            <button className="logo" onClick={handleGoHome} type="button">
                <h1>Lect<span>ify</span></h1>
            </button>

            <div className="sessions-section">
                <h3>Upload Subjects</h3>
                <div className="sessions-list">
                    {loadingSessions ? (
                        <div className="empty-state">
                            <p>Loading subjects...</p>
                        </div>
                    ) : uploadSessions.length > 0 ? (
                        uploadSessions.map(session => {
                            const isActive = currentSessionId === session.id;
                            return (
                                <div
                                    key={session.id}
                                    className={`session-item session-row ${isActive ? 'active' : ''}`}
                                >
                                    <button
                                        onClick={() => setCurrentSessionId(session.id)}
                                        className="session-select-btn"
                                    >
                                        <div className="session-info">
                                            <span className="session-name">{session.name}</span>
                                            <span
                                                className="session-meta">{session.fileCount} files • {session.date}</span>
                                        </div>
                                    </button>

                                    {confirmingDelete === session.id ? (
                                        <div className="session-delete-confirm">
                                            <button
                                                onClick={(e) => handleConfirmDelete(e, session.id)}
                                                title="Confirm delete"
                                                className="session-confirm-btn session-confirm-btn-danger"
                                            >
                                                Delete
                                            </button>
                                            <button
                                                onClick={handleCancelDelete}
                                                title="Cancel"
                                                className="session-confirm-btn session-confirm-btn-neutral"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={(e) => handleDeleteClick(e, session.id)}
                                            title="Delete subject"
                                            className="session-delete-btn"
                                        >
                                            ✕
                                        </button>
                                    )}
                                </div>
                            );
                        })
                    ) : (
                        <div className="empty-state">
                            <p>No subjects yet</p>
                        </div>
                    )}
                </div>
                <button className="new-session-btn" onClick={handleNewSession}>
                    <svg
                        className="new-session-icon"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        aria-hidden="true"
                    >
                        <line x1="8" y1="3" x2="8" y2="13"/>
                        <line x1="3" y1="8" x2="13" y2="8"/>
                    </svg>
                    <span>New Subject</span>
                </button>
            </div>
        </aside>
    )
}

export default SideBar
