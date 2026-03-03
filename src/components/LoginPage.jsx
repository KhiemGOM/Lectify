import React, { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../firebase/firebaseConfig';
import '../styles/LoginPage.css';

const GoogleIcon = () => (
  <svg className="google-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

const LoginPage = () => {
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setError('Sign-in failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="home-root">

      {/* Nav */}
      <nav className="home-nav">
        <div className="home-nav-logo">
          <span className="home-nav-logo-icon">&#128214;</span>
          <span className="home-nav-logo-text">MDQuiz</span>
        </div>
        <button
          className="home-nav-signin"
          onClick={handleGoogleSignIn}
          disabled={loading}
        >
          {loading ? <span className="login-spinner" /> : <GoogleIcon />}
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </nav>

      {/* Hero */}
      <section className="home-hero">
        <div className="home-hero-inner">
          <div className="home-hero-badge">AI-powered study tool</div>
          <h1 className="home-hero-title">
            Turn your slides into<br />
            <span className="home-hero-accent">adaptive quizzes</span>
          </h1>
          <p className="home-hero-sub">
            Upload lecture notes or PDFs, generate MCQ, True/False, multi-select and short-answer
            questions instantly, and track your progress over time.
          </p>
          <button
            className="home-hero-cta"
            onClick={handleGoogleSignIn}
            disabled={loading}
          >
            {loading ? <span className="login-spinner login-spinner--white" /> : <GoogleIcon />}
            {loading ? 'Signing in...' : 'Get started with Google'}
          </button>
          {error && <p className="login-error">{error}</p>}
        </div>
      </section>

      {/* Features */}
      <section className="home-features">
        <div className="home-features-grid">
          <div className="home-feature-card">
            <div className="home-feature-icon">&#128196;</div>
            <h3 className="home-feature-title">Upload your material</h3>
            <p className="home-feature-desc">
              Drop in any PDF or slide deck. The AI chunks your content into logical study units automatically.
            </p>
          </div>
          <div className="home-feature-card">
            <div className="home-feature-icon">&#129488;</div>
            <h3 className="home-feature-title">Generate quizzes instantly</h3>
            <p className="home-feature-desc">
              Choose question count and type — MCQ, True/False, Multi-select, or Short Answer — and get a tailored quiz in seconds.
            </p>
          </div>
          <div className="home-feature-card">
            <div className="home-feature-icon">&#128200;</div>
            <h3 className="home-feature-title">Track your progress</h3>
            <p className="home-feature-desc">
              Review scores, identify weak topics, and watch your understanding improve session over session.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="home-footer">
        <span>&#128214; MDQuiz</span>
      </footer>

    </div>
  );
};

export default LoginPage;
