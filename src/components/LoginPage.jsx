import React, {useEffect, useRef, useState} from 'react';
import {signInWithPopup} from 'firebase/auth';
import {auth, googleProvider} from '../firebase/firebaseConfig';
import '../styles/LoginPage.css';

const GoogleIcon = () => (
    <svg className="google-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            fill="#4285F4"/>
        <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"/>
        <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
            fill="#FBBC05"/>
        <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#EA4335"/>
    </svg>
);

const QUIZ_OPTIONS = [
    'A. Calvin cycle in chloroplast stroma',
    'B. Glycolysis in mitochondrial matrix',
    'C. Electron transport chain at inner mitochondrial membrane',
    'D. Fermentation in chloroplast thylakoids',
];
const CORRECT_OPTION = QUIZ_OPTIONS[2];
const TRUST_ITEMS = [
    {icon: '📄', label: 'PDF upload'},
    {icon: '⚡', label: 'Adaptive quiz generation'},
    {icon: '🧠', label: 'Review queue'},
    {icon: '📎', label: 'Citation coverage'},
    {icon: '📊', label: 'Progress analytics'},
];
const STAT_TARGETS = [82, 7, 5];

const LoginPage = ({isAuthenticated = false, onEnterStudio, user, onSignOut, theme, onToggleTheme}) => {
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const [isDemoHovered, setIsDemoHovered] = useState(false);
    const [pickedOption, setPickedOption] = useState(null);
    const [showQuizCta, setShowQuizCta] = useState(false);
    const [feedbackState, setFeedbackState] = useState(null);
    const [showRewardBurst, setShowRewardBurst] = useState(false);
    const [statsValues, setStatsValues] = useState([0, 0, 0]);
    const [statsInView, setStatsInView] = useState(false);
    const [processInView, setProcessInView] = useState(false);
    const ctaTimerRef = useRef(null);
    const returnTimerRef = useRef(null);
    const rewardTimerRef = useRef(null);
    const statsRef = useRef(null);
    const processRef = useRef(null);
    const hasCountedStatsRef = useRef(false);
    const hasRevealedProcessRef = useRef(false);
    const [typedCount, setTypedCount] = useState(0);

    const TYPED_TEXT = 'high-quality quizzes';

    useEffect(() => {
        if (typedCount >= TYPED_TEXT.length) return;
        const t = window.setTimeout(() => setTypedCount(c => c + 1), 55);
        return () => window.clearTimeout(t);
    }, [typedCount]);
    useEffect(() => {
        return () => {
            if (ctaTimerRef.current) {
                window.clearTimeout(ctaTimerRef.current);
            }
            if (returnTimerRef.current) {
                window.clearTimeout(returnTimerRef.current);
            }
            if (rewardTimerRef.current) {
                window.clearTimeout(rewardTimerRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (!statsRef.current || hasCountedStatsRef.current) {
            return;
        }

        const statsObserver = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setStatsInView(true);
                    statsObserver.disconnect();
                }
            },
            {threshold: 0.35}
        );

        statsObserver.observe(statsRef.current);
        return () => statsObserver.disconnect();
    }, []);

    useEffect(() => {
        if (!statsInView || hasCountedStatsRef.current) {
            return;
        }

        hasCountedStatsRef.current = true;
        const duration = 950;
        const startTs = performance.now();
        let rafId = null;

        const tick = (now) => {
            const elapsed = Math.min((now - startTs) / duration, 1);
            const eased = 1 - Math.pow(1 - elapsed, 3);
            setStatsValues(STAT_TARGETS.map((target) => Math.round(target * eased)));
            if (elapsed < 1) {
                rafId = window.requestAnimationFrame(tick);
            }
        };

        rafId = window.requestAnimationFrame(tick);
        return () => {
            if (rafId) {
                window.cancelAnimationFrame(rafId);
            }
        };
    }, [statsInView]);

    useEffect(() => {
        if (!processRef.current || hasRevealedProcessRef.current) {
            return;
        }

        const processObserver = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setProcessInView(true);
                    hasRevealedProcessRef.current = true;
                    processObserver.disconnect();
                }
            },
            {threshold: 0.25}
        );

        processObserver.observe(processRef.current);
        return () => processObserver.disconnect();
    }, []);

    const clearReturnTimer = () => {
        if (returnTimerRef.current) {
            window.clearTimeout(returnTimerRef.current);
            returnTimerRef.current = null;
        }
    };

    const scheduleReturnToNotes = (delayMs) => {
        clearReturnTimer();
        returnTimerRef.current = window.setTimeout(() => {
            setIsDemoHovered(false);
            setShowQuizCta(false);
            setPickedOption(null);
            setFeedbackState(null);
            setShowRewardBurst(false);
            returnTimerRef.current = null;
        }, delayMs);
    };

    const handleGoogleSignIn = async () => {
        if (isAuthenticated) {
            onEnterStudio?.();
            return;
        }
        setError(null);
        setLoading(true);
        try {
            await signInWithPopup(auth, googleProvider);
            window.location.assign('/studio');
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
            <div className="home-bg" aria-hidden="true">
                <div className="home-blob home-blob--1"/>
                <div className="home-blob home-blob--2"/>
                <div className="home-blob home-blob--3"/>
                <div className="home-hero-grid"/>
            </div>

            <nav className="home-nav">
                <div className="home-nav-logo">
                    <span className="home-nav-logo-icon">L</span>
                    <span className="home-nav-logo-text">Lectify</span>
                </div>
                <div className="home-nav-actions">
                    {isAuthenticated && user && (
                        <span className="home-nav-username">{user.displayName || user.email}</span>
                    )}
                    {isAuthenticated && (
                        <button
                            type="button"
                            className="theme-toggle-btn"
                            onClick={onToggleTheme}
                            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                        >
                            {theme === 'dark' ? (
                                <svg className="theme-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                     strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="4"/>
                                    <line x1="12" y1="2" x2="12" y2="5"/>
                                    <line x1="12" y1="19" x2="12" y2="22"/>
                                    <line x1="2" y1="12" x2="5" y2="12"/>
                                    <line x1="19" y1="12" x2="22" y2="12"/>
                                    <line x1="4.22" y1="4.22" x2="6.34" y2="6.34"/>
                                    <line x1="17.66" y1="17.66" x2="19.78" y2="19.78"/>
                                    <line x1="4.22" y1="19.78" x2="6.34" y2="17.66"/>
                                    <line x1="17.66" y1="6.34" x2="19.78" y2="4.22"/>
                                </svg>
                            ) : (
                                <svg className="theme-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                     strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>
                                </svg>
                            )}
                        </button>
                    )}
                    {!isAuthenticated && (
                        <button className="home-nav-signin" onClick={handleGoogleSignIn} disabled={loading}>
                            {loading ? <span className="login-spinner"/> : <GoogleIcon/>}
                            {loading ? 'Signing in...' : 'Sign in'}
                        </button>
                    )}
                    {isAuthenticated && (
                        <button className="home-nav-signout" onClick={onSignOut}>Sign out</button>
                    )}
                </div>
            </nav>

            <section className="home-hero">
                <div className="home-hero-layout">
                    <div className="home-hero-copy">
                        <div className="home-hero-badge hero-anim hero-anim--1">[ AI-powered ]</div>
                        <h1 className="home-hero-title hero-anim hero-anim--2">
                            Turn class materials into
                            <br/>
                            <span className="home-hero-accent">{TYPED_TEXT.slice(0, typedCount)}
                            </span>
                            <span className="home-typing-cursor" aria-hidden="true"/>
                        </h1>
                        <p className="home-hero-sub hero-anim hero-anim--3">
                            Lectify generates question sets from your notes in seconds, then helps you drill weak spots
                            with analytics-backed review.
                        </p>
                        <button
                            className="home-hero-cta hero-anim hero-anim--4"
                            onClick={handleGoogleSignIn}
                            disabled={loading}
                        >
                            {loading ?
                                <span className="login-spinner login-spinner--white"/> : (isAuthenticated ? null :
                                    <GoogleIcon/>)}
                            {loading ? 'Signing in...' : (isAuthenticated ? 'Enter Studio' : 'Get started with Google')}
                        </button>
                        <div className="home-socialProof hero-anim hero-anim--4">
                            <span className="home-liveDot" aria-hidden="true"/>
                            Used for 1,200+ quiz attempts this week
                        </div>
                        {error && <p className="login-error">{error}</p>}
                    </div>

                    <div className="home-demo feature-anim feature-anim--1">
                        <div className="home-demo-head">
                            <span className="home-demo-file">/slides/Biology/Unit-4-Cell-Energy.pptx</span>
                            <span className="home-demo-headBadge">Preview</span>
                        </div>
                        <div className="home-demo-body">
                            <div className="home-demo-row">
                                <span className="home-demo-tag">Upload</span>
                                <span className="home-demo-line">Biology Unit 4 - Cell Energy.pptx</span>
                            </div>
                            <div className="home-demo-row">
                                <span className="home-demo-tag">Generate</span>
                                <span className="home-demo-line">12 questions - Mixed difficulty</span>
                            </div>

                            <div
                                className={`home-demo-singleFlip${isDemoHovered ? ' flipped' : ''}`}
                                onMouseEnter={() => {
                                    clearReturnTimer();
                                    setIsDemoHovered(true);
                                }}
                                onMouseLeave={() => {
                                    if (ctaTimerRef.current) {
                                        window.clearTimeout(ctaTimerRef.current);
                                        ctaTimerRef.current = null;
                                    }
                                    if (showQuizCta) {
                                        scheduleReturnToNotes(10000);
                                    } else {
                                        scheduleReturnToNotes(1000);
                                    }
                                }}
                            >
                                <div className="home-demo-singleFlipInner">
                                    <div className="home-demo-singleFace home-demo-singleFace--front">
                                        <div className="home-demo-notes">
                                            <div className="home-demo-noteLine home-demo-noteLine--title">Cell Energy
                                                Pathways
                                            </div>
                                            <div className="home-demo-noteLine">- Photosynthesis stores energy: light
                                                reaction makes ATP/NADPH, Calvin cycle fixes CO2.
                                            </div>
                                            <div className="home-demo-noteLine">- Respiration releases energy:
                                                glycolysis, Krebs cycle, electron transport chain.
                                            </div>
                                            <div className="home-demo-noteLine">- Highest ATP yield comes from oxidative
                                                phosphorylation via chemiosmosis.
                                            </div>
                                            <div className="home-demo-noteLine">- Oxygen is final electron acceptor in
                                                aerobic respiration and water is produced.
                                            </div>
                                            <div className="home-demo-noteLine">- Fermentation regenerates NAD+ without
                                                oxygen but produces far less ATP.
                                            </div>
                                            <div className="home-demo-noteLine">- Chloroplast captures photon energy;
                                                mitochondria convert fuel energy into ATP.
                                            </div>
                                            <div className="home-demo-noteLine home-demo-noteLine--title">Exam cues:
                                                pathway location, inputs/outputs, ATP efficiency.
                                            </div>
                                        </div>
                                    </div>

                                    <div
                                        className={`home-demo-singleFace home-demo-singleFace--back${feedbackState ? ` is-${feedbackState}` : ''}`}>
                    <span className={`home-demo-reward${showRewardBurst ? ' show' : ''}`} aria-hidden="true">
                      +10 XP
                    </span>
                                        {!showQuizCta ? (
                                            <div className="home-demo-quiz home-demo-quiz--interactive">
                                                <div className="home-demo-qtitle">Q: Which step produces the highest ATP
                                                    yield in aerobic respiration?
                                                </div>
                                                {QUIZ_OPTIONS.map((option) => (
                                                    <button
                                                        key={option}
                                                        type="button"
                                                        className={`home-demo-opt home-demo-opt-btn${pickedOption === option ? ' chosen' : ''}`}
                                                        onClick={() => {
                                                            if (ctaTimerRef.current) {
                                                                window.clearTimeout(ctaTimerRef.current);
                                                            }
                                                            if (rewardTimerRef.current) {
                                                                window.clearTimeout(rewardTimerRef.current);
                                                            }
                                                            const isCorrect = option === CORRECT_OPTION;
                                                            setPickedOption(option);
                                                            setFeedbackState(isCorrect ? 'correct' : 'wrong');
                                                            if (isCorrect) {
                                                                setShowRewardBurst(true);
                                                                rewardTimerRef.current = window.setTimeout(() => {
                                                                    setShowRewardBurst(false);
                                                                    rewardTimerRef.current = null;
                                                                }, 1300);
                                                            } else {
                                                                setShowRewardBurst(false);
                                                            }
                                                            ctaTimerRef.current = window.setTimeout(() => {
                                                                setShowQuizCta(true);
                                                                ctaTimerRef.current = null;
                                                            }, isCorrect ? 760 : 220);
                                                        }}
                                                    >
                                                        {option}
                                                    </button>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="home-demo-quizCta">
                                                <div className="home-demo-quizCtaBadge">Nice pick</div>
                                                <p className="home-demo-quizCtaTitle">Build your own quiz from your
                                                    slides</p>
                                                <p className="home-demo-quizCtaSub">Upload notes, pick difficulty, and
                                                    generate a full set in seconds.</p>
                                                <p className="home-demo-quizCtaHint">Go on, your exam won't study
                                                    itself.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="home-demo-stats" ref={statsRef}>
                                <div className="home-demo-stat">
                                    <strong>{statsValues[0]}%</strong><span>Rolling avg</span></div>
                                <div className="home-demo-stat">
                                    <strong>+{statsValues[1]}pp</strong><span>Improvement</span></div>
                                <div className="home-demo-stat">
                                    <strong>{statsValues[2]}</strong><span>Best streak</span></div>
                            </div>
                        </div>
                    </div>

                    <div className="home-floatChips home-floatChips--edge" aria-hidden="true">
                        <span className="home-floatChip home-floatChip--a">82% rolling avg</span>
                        <span className="home-floatChip home-floatChip--b">+7pp improvement</span>
                        <span className="home-floatChip home-floatChip--c">5 best streak</span>
                    </div>
                </div>
            </section>

            <section className="home-trust">
                <div className="home-trust-strip" aria-label="Feature highlights">
                    <div className="home-trust-track">
                        <div className="home-trust-marquee">
                            {TRUST_ITEMS.map((item) => (
                                <span className="home-trust-pill" key={`m1-${item.label}`}>
                  <span className="home-trust-pillIcon" aria-hidden="true">{item.icon}</span>
                  <span>{item.label}</span>
                </span>
                            ))}
                        </div>
                        <div className="home-trust-marquee" aria-hidden="true">
                            {TRUST_ITEMS.map((item) => (
                                <span className="home-trust-pill" key={`m2-${item.label}`}>
                  <span className="home-trust-pillIcon" aria-hidden="true">{item.icon}</span>
                  <span>{item.label}</span>
                </span>
                            ))}
                        </div>
                        <div className="home-trust-marquee" aria-hidden="true">
                            {TRUST_ITEMS.map((item) => (
                                <span className="home-trust-pill" key={`m3-${item.label}`}>
                  <span className="home-trust-pillIcon" aria-hidden="true">{item.icon}</span>
                  <span>{item.label}</span>
                </span>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            <section className="home-process" ref={processRef}>
                <div className="home-process-grid">
                    <div className={`home-process-card${processInView ? ' is-visible' : ''}`}
                         style={{'--reveal-delay': '0.05s'}} data-step="01">
                        <div className="home-process-index">01</div>
                        <h3 className="home-feature-title">Upload your material</h3>
                        <p className="home-feature-desc">Drop in any PDF. Lectify parses and chunks it
                            automatically.</p>
                    </div>
                    <div className={`home-process-card${processInView ? ' is-visible' : ''}`}
                         style={{'--reveal-delay': '0.15s'}} data-step="02">
                        <div className="home-process-index">02</div>
                        <h3 className="home-feature-title">Generate quizzes instantly</h3>
                        <p className="home-feature-desc">Pick question types and difficulty, then launch in one
                            click.</p>
                    </div>
                    <div className={`home-process-card${processInView ? ' is-visible' : ''}`}
                         style={{'--reveal-delay': '0.25s'}} data-step="03">
                        <div className="home-process-index">03</div>
                        <h3 className="home-feature-title">Track your progress</h3>
                        <p className="home-feature-desc">Use rolling average, weak areas, and review queue to improve
                            faster.</p>
                    </div>
                </div>
            </section>

            <footer className="home-footer">
                <span>Lectify</span>
            </footer>
        </div>
    );
};

export default LoginPage;
