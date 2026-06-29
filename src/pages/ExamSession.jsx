import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import MathRenderer from '../components/MathRenderer';
import { AlertTriangle, Clock, ShieldAlert, Award, CheckCircle } from 'lucide-react';

/**
 * Shuffles an array in place.
 */
function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default function ExamSession({ exam, studentId, onExamCompleted }) {
  const [secondsLeft, setSecondsLeft] = useState(exam.duration * 60);
  const [questions, setQuestions] = useState([]);
  const [selectedAnswers, setSelectedAnswers] = useState({}); // questionIndex -> selectedOriginalOptionIndex
  const [warnings, setWarnings] = useState(0);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [achievedScore, setAchievedScore] = useState(0);

  const timerRef = useRef(null);
  const initialSeconds = exam.duration * 60;

  // Enforce light mode during the exam
  useEffect(() => {
    const originalTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', 'light');
    
    return () => {
      // Restore original theme on exit
      document.documentElement.setAttribute('data-theme', originalTheme);
    };
  }, []);

  // Initialize and shuffle questions & options
  useEffect(() => {
    let preparedQuestions = exam.questions.map((q, qIdx) => {
      // Map options to keep track of their original indexes
      const optionsWithMetadata = q.options.map((opt, oIdx) => ({
        ...opt,
        originalIndex: oIdx
      }));

      return {
        originalIndex: qIdx, // index in the original exams.questions array
        question: q.question,
        correctIndex: q.correctIndex,
        // Shuffle options if enabled
        options: exam.shuffle_options ? shuffleArray(optionsWithMetadata) : optionsWithMetadata
      };
    });

    if (exam.shuffle_mcqs) {
      preparedQuestions = shuffleArray(preparedQuestions);
    }

    setQuestions(preparedQuestions);
  }, [exam]);

  // Active Timer Countdown
  useEffect(() => {
    if (isSubmitted) return;

    timerRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          handleAutoSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [isSubmitted]);

  // Anti-cheating Tab Switch Warning
  useEffect(() => {
    if (isSubmitted) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        registerWarning();
      }
    };

    const handleWindowBlur = () => {
      registerWarning();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [warnings, submitting, isSubmitted]);

  const registerWarning = () => {
    if (submitting || isSubmitted) return;

    setWarnings((prev) => {
      const nextWarnings = prev + 1;
      if (nextWarnings > 2) {
        // Auto-submit immediately on third strike
        triggerAutoSubmitOnCheating();
        return nextWarnings;
      } else {
        setShowWarningModal(true);
        return nextWarnings;
      }
    });
  };

  const triggerAutoSubmitOnCheating = () => {
    clearInterval(timerRef.current);
    alert('Exam auto-submitted: You switched tabs/minimized the window more than 2 times.');
    submitExamAnswers(true); // Flag cheating
  };

  const handleAutoSubmit = () => {
    alert('Time is up! Your exam is being submitted.');
    submitExamAnswers(false);
  };

  const submitExamAnswers = async (forcedByCheating = false) => {
    if (submitting) return;
    setSubmitting(true);

    // Calculate score
    let score = 0;
    const finalAnswersObj = {};

    questions.forEach((q, idx) => {
      // Find selected answer index for this question
      const selectedOrigIdx = selectedAnswers[idx];
      finalAnswersObj[q.originalIndex] = selectedOrigIdx !== undefined ? selectedOrigIdx : null;

      if (selectedOrigIdx === q.correctIndex) {
        score++;
      }
    });

    const timeTaken = initialSeconds - secondsLeft;

    try {
      const { error } = await supabase
        .from('student_exams')
        .insert([{
          student_id: studentId,
          exam_id: exam.id,
          score,
          total_questions: questions.length,
          answers: finalAnswersObj,
          warnings: forcedByCheating ? Math.max(warnings, 3) : warnings,
          time_taken: timeTaken
        }]);

      if (error) throw error;
      
      setAchievedScore(score);
      setIsSubmitted(true);
    } catch (err) {
      console.error('Error submitting exam:', err);
      alert('Error submitting exam answers. Saving local score.');
      setAchievedScore(score);
      setIsSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

  const selectOption = (questionIdx, originalOptionIdx) => {
    if (isSubmitted) return;
    setSelectedAnswers({
      ...selectedAnswers,
      [questionIdx]: originalOptionIdx
    });
  };

  const formatTime = (secs) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${String(mins).padStart(2, '0')}:${String(remainingSecs).padStart(2, '0')}`;
  };

  if (questions.length === 0) {
    return <div className="exam-theme auth-screen"><div className="card glass">Loading exam...</div></div>;
  }

  // Submitted Score & Answers Review Layout
  if (isSubmitted) {
    const pct = Math.round((achievedScore / questions.length) * 100);
    const timeTaken = initialSeconds - secondsLeft;

    return (
      <div className="exam-theme" style={{ minHeight: '100vh', backgroundColor: 'var(--bg-secondary)' }}>

        {/* ── Fixed score bar – always on top of everything ── */}
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 200,
          backgroundColor: 'var(--bg-card)',
          borderBottom: '1px solid var(--border-color)',
          boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
          padding: '0.75rem 1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          flexWrap: 'wrap',
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>{exam.name} — Results</h2>
            <p className="text-secondary" style={{ fontSize: '0.85rem', margin: '0.2rem 0 0' }}>
              Score: <strong className="text-success">{achievedScore} / {questions.length}</strong>
              &nbsp;({pct}%)&nbsp;·&nbsp;
              Time: {Math.floor(timeTaken / 60)}m {timeTaken % 60}s
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            style={{ flexShrink: 0 }}
            onClick={onExamCompleted}
          >
            ← Return to Dashboard
          </button>
        </div>

        {/* ── Scrollable content starts below the fixed bar ── */}
        <div style={{ paddingTop: '80px', paddingBottom: '4rem' }}>
          <div className="container" style={{ maxWidth: '800px' }}>

            {/* Score summary card */}
            <div className="card mb-6" style={{
              borderLeft: '5px solid var(--success)',
              padding: '1.5rem 2rem',
              display: 'flex',
              alignItems: 'center',
              gap: '1.5rem',
              flexWrap: 'wrap',
            }}>
              <div style={{
                width: 72, height: 72, borderRadius: '50%',
                background: pct >= 80
                  ? 'linear-gradient(135deg,#2ed573,#26bf65)'
                  : pct >= 50
                    ? 'linear-gradient(135deg,#ffa502,#ff8000)'
                    : 'linear-gradient(135deg,#ff4757,#e8334a)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: '1.35rem', fontWeight: 800, flexShrink: 0,
              }}>{pct}%</div>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0 }} className="text-success">Exam Completed! 🎉</h3>
                <p className="text-secondary" style={{ margin: '0.35rem 0 0', fontSize: '0.9rem' }}>
                  You answered <strong>{achievedScore}</strong> out of <strong>{questions.length}</strong> questions correctly.
                  Review all answers below.
                </p>
              </div>
            </div>

            {/* Question review cards */}
            {questions.map((q, idx) => {
              const selectedOriginalIdx = selectedAnswers[idx];
              const correctOriginalIdx = q.correctIndex;
              const wasCorrect = selectedOriginalIdx === correctOriginalIdx;
              const wasSkipped = selectedOriginalIdx === undefined || selectedOriginalIdx === null;

              return (
                <div key={idx} className="card mb-6" style={{
                  padding: '1.5rem',
                  borderLeft: `4px solid ${wasCorrect ? 'var(--success)' : wasSkipped ? 'var(--border-color)' : 'var(--danger)'}`,
                }}>
                  {/* Question header */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '1rem' }}>
                    <span className={`badge ${wasCorrect ? 'badge-success' : wasSkipped ? 'badge-secondary' : 'badge-danger'}`}>
                      Q{idx + 1}
                    </span>
                    <div className="mcq-question-text" style={{ fontSize: '1.1rem', flex: 1 }}>
                      <MathRenderer content={q.question} />
                    </div>
                    <span style={{ flexShrink: 0, fontSize: '0.8rem', fontWeight: 700,
                      color: wasCorrect ? 'var(--success)' : wasSkipped ? 'var(--text-muted)' : 'var(--danger)' }}>
                      {wasCorrect ? '✓ Correct' : wasSkipped ? '— Skipped' : '✗ Wrong'}
                    </span>
                  </div>

                  {/* Options */}
                  <div className="mcq-options-grid">
                    {q.options.map((opt, oIdx) => {
                      const isSelected = selectedOriginalIdx === opt.originalIndex;
                      const isCorrect = correctOriginalIdx === opt.originalIndex;

                      let border = '1px solid var(--border-color)';
                      let bg = 'transparent';
                      let color = 'var(--text-primary)';
                      let fw = 'normal';

                      if (isCorrect) {
                        border = '2px solid var(--success)';
                        bg = 'rgba(46, 213, 115, 0.1)';
                        color = 'var(--success)';
                        fw = 'bold';
                      } else if (isSelected && !isCorrect) {
                        border = '2px solid var(--danger)';
                        bg = 'rgba(255, 71, 87, 0.1)';
                        color = 'var(--danger)';
                        fw = 'bold';
                      }

                      return (
                        <div key={oIdx} className="mcq-option disabled" style={{
                          padding: '0.85rem 1.25rem',
                          display: 'flex', alignItems: 'center', gap: '8px',
                          borderRadius: 'var(--radius-sm)',
                          border, backgroundColor: bg, color, fontWeight: fw,
                          width: '100%',
                        }}>
                          <span style={{ fontWeight: 'bold' }}>{String.fromCharCode(65 + oIdx)}.</span>
                          <MathRenderer content={opt} />
                          {isCorrect && (
                            <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--success)', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                              ✓ Correct
                            </span>
                          )}
                          {isSelected && !isCorrect && (
                            <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--danger)', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                              ✗ Your Choice
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Bottom CTA */}
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '2rem' }}>
              <button
                type="button"
                className="btn btn-primary btn-lg"
                style={{ minWidth: '240px' }}
                onClick={onExamCompleted}
              >
                ← Finish &amp; Return to Dashboard
              </button>
            </div>

          </div>
        </div>
      </div>
    );
  }

  // Active Exam Layout - All Questions on Same Page
  return (
    <div className="exam-theme" style={{ paddingBottom: '4rem' }}>
      {/* Sticky Active Exam Header */}
      <div className="exam-header" style={{ position: 'sticky', top: 0, zIndex: 100, borderBottom: '1px solid var(--border-color)', background: 'var(--bg-card)' }}>
        <div>
          <h2>{exam.name}</h2>
          <p className="text-secondary" style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
            Total Questions: {questions.length} | Warnings: {warnings}/2
          </p>
        </div>
        
        <div className="flex align-center gap-4">
          <div className={`timer-box ${secondsLeft <= 60 ? 'warning' : ''}`}>
            <div className="flex align-center gap-2">
              <Clock size={18} />
              <span>{formatTime(secondsLeft)}</span>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-success btn-sm"
            onClick={() => {
              if (confirm('Are you sure you want to finish and submit your exam?')) {
                submitExamAnswers(false);
              }
            }}
            disabled={submitting}
          >
            Submit Exam
          </button>
        </div>
      </div>

      <div className="container" style={{ maxWidth: '800px', marginTop: '2rem' }}>
        {/* Warning Indicator */}
        {warnings > 0 && (
          <div className="alert-banner alert-banner-danger align-center mb-6">
            <ShieldAlert size={20} />
            <div>
              <strong>Tab Switch Warning Detected!</strong> You have switched windows/tabs <strong>{warnings}</strong> time(s). If you switch again, your exam will be automatically submitted and locked.
            </div>
          </div>
        )}

        {/* Questions List */}
        {questions.map((q, idx) => {
          const selectedOptionIdx = selectedAnswers[idx];
          return (
            <div key={idx} className="card p-8 mb-6">
              <div className="mb-6">
                <span className="badge badge-primary mb-2">Question {idx + 1}</span>
                <div className="mcq-question-text mt-2" style={{ fontSize: '1.2rem' }}>
                  <MathRenderer content={q.question} />
                </div>
              </div>

              <div className="mcq-options-grid mt-4">
                {q.options.map((opt, oIdx) => {
                  const isSelected = selectedOptionIdx === opt.originalIndex;
                  return (
                    <button
                      key={oIdx}
                      type="button"
                      className={`mcq-option ${isSelected ? 'selected' : ''}`}
                      onClick={() => selectOption(idx, opt.originalIndex)}
                      style={{ fontSize: '1.05rem', padding: '1rem' }}
                    >
                      <span style={{ fontWeight: 'bold', color: isSelected ? 'var(--primary)' : 'var(--text-muted)' }}>
                        {String.fromCharCode(65 + oIdx)}.
                      </span>
                      <MathRenderer content={opt} />
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Bottom Submit Button */}
        <div className="flex justify-center mt-8">
          <button
            type="button"
            className="btn btn-success btn-lg btn-block"
            onClick={() => {
              if (confirm('Are you sure you want to finish and submit your exam?')) {
                submitExamAnswers(false);
              }
            }}
            disabled={submitting}
          >
            <Award size={18} /> Submit and Complete Exam
          </button>
        </div>
      </div>

      {/* Cheating Warning Modal */}
      {showWarningModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '450px' }}>
            <div className="modal-header" style={{ borderBottom: 'none' }}>
              <h3 className="text-danger flex align-center gap-2"><AlertTriangle /> Cheating Alert!</h3>
            </div>
            <div className="modal-body text-center">
              <p className="mb-4">
                We detected that you minimized the browser or switched tabs/windows. This behavior is strictly monitored as a cheat warning.
              </p>
              <div className="alert-banner alert-banner-danger text-center justify-center p-4">
                <strong>Warning Count: {warnings} / 2</strong>
              </div>
              <p className="mt-4 text-secondary" style={{ fontSize: '0.85rem' }}>
                If you trigger one more warning, your session will be closed immediately, and your exam answers will be automatically submitted.
              </p>
            </div>
            <div className="modal-footer" style={{ borderTop: 'none', justifyCenter: 'center' }}>
              <button 
                type="button"
                className="btn btn-primary" 
                style={{ width: '100%' }}
                onClick={() => setShowWarningModal(false)}
              >
                I Understand, Return to Exam
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
