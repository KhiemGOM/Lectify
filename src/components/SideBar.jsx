import React, { useState } from 'react'

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
                                    className={`session-item ${isActive ? 'active' : ''}`}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 0,
                                        padding: 0,
                                        backgroundColor: isActive ? '#e2e8f0' : 'transparent',
                                        borderRadius: 8,
                                    }}
                                >
                                    <button
                                        onClick={() => setCurrentSessionId(session.id)}
                                        style={{
                                            flex: 1,
                                            background: 'none',
                                            border: 'none',
                                            padding: '10px 12px',
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                            color: isActive ? '#fff' : 'inherit',
                                        }}
                                    >
                                        <div className="session-info">
                                            <span className="session-name">{session.name}</span>
                                            <span className="session-meta">{session.fileCount} files • {session.date}</span>
                                        </div>
                                    </button>

                                    {confirmingDelete === session.id ? (
                                        <div style={{ display: 'flex', gap: 4, padding: '0 8px', flexShrink: 0 }}>
                                            <button
                                                onClick={(e) => handleConfirmDelete(e, session.id)}
                                                title="Confirm delete"
                                                style={{ fontSize: 11, padding: '3px 7px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
                                            >
                                                Delete
                                            </button>
                                            <button
                                                onClick={handleCancelDelete}
                                                title="Cancel"
                                                style={{ fontSize: 11, padding: '3px 7px', background: 'transparent', color: 'var(--text-secondary, #64748b)', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: 4, cursor: 'pointer' }}
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
                <button className="new-session-btn" onClick={handleNewSession} style={{ marginTop: 30 }}>+ New Subject</button>
            </div>
        </aside>
    )
}

export default SideBar
