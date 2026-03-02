import React, { useState, useRef } from 'react'
import '../styles/UploadPage.css'
import { Upload, X, FileText, Image as ImageIcon, CheckCircle, AlertCircle, Loader } from 'lucide-react';
function UploadPage({ onUploadComplete }) {
    const [files, setFiles] = useState([]);
    const [dragActive, setDragActive] = useState(false);
    const [quizTitle, setQuizTitle] = useState('');
    const [quizContext, setQuizContext] = useState('');
    const fileInputRef = useRef(null);
    const canCreateSession = () => {
        const hasTitle = quizTitle.trim().length > 0;
        const hasFiles = files.length > 0;
        const allFilesUploaded = files.every(f => f.status === 'success');

        return hasTitle && hasFiles && allFilesUploaded;
    };

    const getValidationMessage = () => {
        if (!quizTitle.trim()) {
            return 'Please enter a title';
        }
        if (files.length === 0) {
            return 'Please upload at least one file';
        }
        if (!files.every(f => f.status === 'success')) {
            return 'Please wait for all files to finish uploading';
        }
        return '';
    };

    const handleCreateSession = () => {
        if (!canCreateSession()) return;

        // Call parent's onUploadComplete
        onUploadComplete(quizTitle, files.length);

        // Optional: Clear the form for next session
        setFiles([]);
        setQuizTitle('');
        setQuizContext('');
    };
    const handleDrag = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            setDragActive(false);
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        const droppedFiles = Array.from(e.dataTransfer.files);
        handleFiles(droppedFiles);
    };

    const handleFileInput = (e) => {
        const selectedFiles = Array.from(e.target.files);
        handleFiles(selectedFiles);
    };

    const handleFiles = (newFiles) => {
        const validFiles = newFiles.filter(file => {
            const isValidType = file.type === 'application/pdf';
            if (!isValidType) {
                alert(`${file.name} is not a valid file type. Only PDFs and images are allowed.`);
            }
            return isValidType;
        });

        const filesWithMetadata = validFiles.map(file => ({
            id: Math.random().toString(36).substr(2, 9),
            file,
            name: file.name,
            size: file.size,
            type: file.type,
            status: 'ready', // ready, uploading, success, error
            progress: 0,
            preview: null
        }));

        setFiles(prev => [...prev, ...filesWithMetadata]);
    };

    const removeFile = (id) => {
        setFiles(prev => prev.filter(f => f.id !== id));
    };

    const formatFileSize = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    };

    const uploadFiles = async () => {
        const filesToUpload = files.filter(f => f.status === 'ready');

        for (let fileObj of filesToUpload) {
            // Update status to uploading
            setFiles(prev => prev.map(f =>
                f.id === fileObj.id ? { ...f, status: 'uploading', progress: 0 } : f
            ));

            const formData = new FormData();
            formData.append('file', fileObj.file);
            formData.append('title', quizTitle);
            formData.append('context', quizContext);

            try {
                // TODO: Replace with actual API endpoint
                // const response = await fetch('https://your-api.com/upload', {
                //   method: 'POST',
                //   body: formData
                // });

                // Simulate upload progress
                for (let progress = 0; progress <= 100; progress += 10) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    setFiles(prev => prev.map(f =>
                        f.id === fileObj.id ? { ...f, progress } : f
                    ));
                }

                // Update status to success
                setFiles(prev => prev.map(f =>
                    f.id === fileObj.id ? { ...f, status: 'success', progress: 100 } : f
                ));

            } catch (error) {
                setFiles(prev => prev.map(f =>
                    f.id === fileObj.id ? { ...f, status: 'error' } : f
                ));
            }
        }

        // After all uploads complete, notify parent to create session
        if (filesToUpload.length > 0) {
            onUploadComplete(quizTitle, filesToUpload.length);
        }
    };

    const getFileIcon = (type) => {
        if (type === 'application/pdf') {
            return <FileText size={24} />;
        }
        return <FileText size={24} />;
    };

    const getStatusIcon = (status) => {
        switch (status) {
            case 'uploading':
                return <Loader className="spinner" size={20} />;
            case 'success':
                return <CheckCircle size={20} className="success-icon" />;
            case 'error':
                return <AlertCircle size={20} className="error-icon" />;
            default:
                return null;
        }
    };
    return (
        <div className="content-area">
            <div className="upload-section">
                <h2>Upload Files</h2>
                <p className="subtitle">Upload lecture slides / notes for quiz generation</p>

                {/* Input Fields */}
                <div className="input-section">
                    <div className="input-group">
                        <label htmlFor="quiz-title">Title <span style={{
                            color: "red"
                        }}>*</span></label>
                        <input
                            id="quiz-title"
                            type="text"
                            value={quizTitle}
                            onChange={(e) => setQuizTitle(e.target.value)}
                            placeholder="e.g., Course code (SC1007), topic (Data Structures), etc."
                            className="title-input"
                        />
                    </div>

                    <div className="input-group">
                        <label htmlFor="quiz-context">Additional Context</label>
                        <textarea
                            id="quiz-context"
                            value={quizContext}
                            onChange={(e) => setQuizContext(e.target.value)}
                            placeholder="Provide context to help generate better questions (e.g., what this course is about, what topics to focus on, etc.)"
                            className="context-input"
                            rows="3"
                        />
                    </div>
                </div>
                {/* Drop Zone */}
                <div
                    className={`drop-zone ${dragActive ? 'active' : ''}`}
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                >
                    <Upload size={48} className="upload-icon" />
                    <h3>Drag & drop lecture slides / notes here <span style={{
                            color: "red"
                        }}>*</span></h3>
                    <p>or click to browse</p>
                    <span className="file-types">Supported: PDF</span>
                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept=".pdf"
                        onChange={handleFileInput}
                        style={{ display: 'none' }}
                    />
                </div>

                {/* Files List */}
                {files.length > 0 && (
                    <div className="files-section">
                        <div className="files-header">
                            <h3>Files Ready to Upload ({files.length})</h3>
                            <button
                                className="upload-button"
                                onClick={uploadFiles}
                                disabled={files.every(f => f.status !== 'ready')}
                            >
                                Upload All
                            </button>
                        </div>

                        <div className="files-list">
                            {files.map(fileObj => (
                                <div key={fileObj.id} className={`file-item ${fileObj.status}`}>
                                    <div className="file-preview">
                                        {fileObj.preview ? (
                                            <img src={fileObj.preview} alt={fileObj.name} />
                                        ) : (
                                            getFileIcon(fileObj.type)
                                        )}
                                    </div>

                                    <div className="file-info">
                                        <div className="file-name">{fileObj.name}</div>
                                        <div className="file-meta">
                                            <span>{formatFileSize(fileObj.size)}</span>
                                            {fileObj.status === 'uploading' && (
                                                <span className="progress-text">{fileObj.progress}%</span>
                                            )}
                                        </div>
                                        {fileObj.status === 'uploading' && (
                                            <div className="progress-bar">
                                                <div
                                                    className="progress-fill"
                                                    style={{ width: `${fileObj.progress}%` }}
                                                ></div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="file-actions">
                                        {getStatusIcon(fileObj.status)}
                                        {fileObj.status === 'ready' && (
                                            <button
                                                className="remove-button"
                                                onClick={() => removeFile(fileObj.id)}
                                            >
                                                <X size={20} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
            {/* Create Session Button */}
            <div className="create-section">
                <button
                    className="create-button"
                    onClick={handleCreateSession}
                    disabled={!canCreateSession()}
                >
                    Create Quiz Session
                </button>
                {!canCreateSession() && (
                    <p className="validation-message">
                        {getValidationMessage()}
                    </p>
                )}
            </div>
        </div>
    )
}

export default UploadPage