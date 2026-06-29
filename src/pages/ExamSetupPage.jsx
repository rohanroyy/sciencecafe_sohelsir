import React, { useState, useEffect } from 'react';
import { generateExcel, compressImage } from '../utils/excel';
import MathRenderer from '../components/MathRenderer';
import { ArrowLeft, ArrowRight, Plus, Download, Trash2, Edit2, List, FilePlus } from 'lucide-react';

const initialQuestion = () => ({
  question: { text: '', image: '' },
  options: [
    { text: '', image: '' },
    { text: '', image: '' },
    { text: '', image: '' },
    { text: '', image: '' }
  ],
  correctIndex: 0 // Default to first option
});

export default function ExamSetupPage({ onBack }) {
  const [examName, setExamName] = useState('');
  const [questions, setQuestions] = useState([initialQuestion()]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [activeTab, setActiveTab] = useState('create'); // 'create' or 'view'
  const [error, setError] = useState('');

  const currentQ = questions[currentIndex] || initialQuestion();

  const handleQuestionTextChange = (text) => {
    const updated = [...questions];
    updated[currentIndex].question.text = text;
    setQuestions(updated);
  };

  const handleImageUpload = async (e, type, optionIdx = null) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.includes('image/png') && !file.type.includes('image/jpeg')) {
      setError('Only PNG/JPEG images are supported');
      return;
    }

    try {
      const base64 = await compressImage(file);
      const updated = [...questions];
      if (type === 'question') {
        updated[currentIndex].question.image = base64;
      } else if (type === 'option' && optionIdx !== null) {
        updated[currentIndex].options[optionIdx].image = base64;
      }
      setQuestions(updated);
      setError('');
    } catch (err) {
      console.error(err);
      setError('Error compressing image');
    }
  };

  /**
   * Converts any image Blob (including WMF/EMF from Word/PowerPoint)
   * to a canvas-based PNG base64 string by drawing it via an Image element.
   */
  const blobToBase64ViаCanvas = (blob) => {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 300;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) { height = Math.round((height * maxDim) / width); width = maxDim; }
          else { width = Math.round((width * maxDim) / height); height = maxDim; }
        }
        canvas.width = width || maxDim;
        canvas.height = height || maxDim;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(objectUrl);
        resolve(canvas.toDataURL('image/png', 0.85));
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Could not render pasted image'));
      };
      img.src = objectUrl;
    });
  };

  const applyPastedImage = async (base64, type, optionIdx) => {
    const updated = [...questions];
    if (type === 'question') {
      updated[currentIndex].question.image = base64;
    } else if (type === 'option' && optionIdx !== null) {
      updated[currentIndex].options[optionIdx].image = base64;
    }
    setQuestions(updated);
    setError('');
  };

  const handlePaste = async (e, type, optionIdx = null) => {
    const clipData = e.clipboardData;
    if (!clipData) return;

    // --- Strategy 1: Check clipboardData.files (drag-drop and some Office pastes) ---
    if (clipData.files && clipData.files.length > 0) {
      const file = clipData.files[0];
      if (file.type.startsWith('image/')) {
        e.preventDefault();
        try {
          const base64 = await compressImage(file);
          await applyPastedImage(base64, type, optionIdx);
        } catch (err) {
          setError('Error processing pasted image file');
        }
        return;
      }
    }

    const items = clipData.items;
    if (!items) return;

    // --- Strategy 2: Prefer bitmap/png items (standard browser paste) ---
    const preferredTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp'];
    for (const prefType of preferredTypes) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type === prefType) {
          e.preventDefault();
          const file = items[i].getAsFile();
          if (file) {
            try {
              const base64 = await compressImage(file);
              await applyPastedImage(base64, type, optionIdx);
            } catch (err) {
              setError('Error processing pasted image');
            }
            return;
          }
        }
      }
    }

    // --- Strategy 3: Fallback – any image/* type (covers WMF, EMF from Word/PowerPoint) ---
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (blob) {
          try {
            // Try Canvas rendering first (handles WMF/EMF via browser's native decoder)
            const base64 = await blobToBase64ViаCanvas(blob);
            await applyPastedImage(base64, type, optionIdx);
          } catch (canvasErr) {
            // Canvas failed (format not renderable): try FileReader as last resort
            try {
              const base64 = await compressImage(blob);
              await applyPastedImage(base64, type, optionIdx);
            } catch (err) {
              setError('Could not process the pasted image. Try saving it as PNG first.');
            }
          }
          return;
        }
      }
    }
  };

  const removeImage = (type, optionIdx = null) => {
    const updated = [...questions];
    if (type === 'question') {
      updated[currentIndex].question.image = '';
    } else if (type === 'option' && optionIdx !== null) {
      updated[currentIndex].options[optionIdx].image = '';
    }
    setQuestions(updated);
  };

  const handleOptionTextChange = (text, idx) => {
    const updated = [...questions];
    updated[currentIndex].options[idx].text = text;
    setQuestions(updated);
  };

  const selectCorrectAnswer = (idx) => {
    const updated = [...questions];
    updated[currentIndex].correctIndex = idx;
    setQuestions(updated);
  };

  const validateCurrentQuestion = () => {
    if (!currentQ.question.text && !currentQ.question.image) {
      return 'Question text or image is required';
    }
    for (let i = 0; i < 4; i++) {
      if (!currentQ.options[i].text && !currentQ.options[i].image) {
        return `Option ${String.fromCharCode(65 + i)} cannot be empty`;
      }
    }
    if (currentQ.correctIndex === null) {
      return 'Please select the correct answer';
    }
    return '';
  };

  const handleNext = () => {
    const validationErr = validateCurrentQuestion();
    if (validationErr) {
      setError(validationErr);
      return;
    }
    setError('');

    if (currentIndex === questions.length - 1) {
      // Add a new blank question
      setQuestions([...questions, initialQuestion()]);
      setCurrentIndex(currentIndex + 1);
    } else {
      // Go to next existing question
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handleBack = () => {
    setError('');
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleDeleteQuestion = (idx) => {
    if (questions.length <= 1) {
      setQuestions([initialQuestion()]);
      setCurrentIndex(0);
      return;
    }
    
    const updated = questions.filter((_, i) => i !== idx);
    setQuestions(updated);
    
    if (currentIndex >= updated.length) {
      setCurrentIndex(updated.length - 1);
    }
  };

  const handleDownloadExcel = () => {
    if (!examName.trim()) {
      setError('Please provide an exam name before generating the Excel sheet');
      return;
    }
    // Validate all questions
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.question.text && !q.question.image) {
        setError(`Question ${i + 1} is empty`);
        setCurrentIndex(i);
        setActiveTab('create');
        return;
      }
      for (let j = 0; j < 4; j++) {
        if (!q.options[j].text && !q.options[j].image) {
          setError(`Question ${i + 1} is missing Option ${String.fromCharCode(65 + j)}`);
          setCurrentIndex(i);
          setActiveTab('create');
          return;
        }
      }
    }
    
    setError('');
    generateExcel(examName, questions);
  };

  return (
    <div className="exam-theme">
      <div className="batch-detail-shell">
        <div className="back-bar">
          <button type="button" onClick={onBack || (() => window.history.back())}>
            <ArrowLeft size={16} /> Back
          </button>
          <h2 style={{ fontSize: '1.1rem' }}>Exam Setup</h2>
        </div>

      <div className="card mb-6">
        <div className="form-group">
          <label className="form-label">Exam Name (Used as the downloaded Excel sheet name)</label>
          <div className="flex gap-4 align-center">
            <input
              type="text"
              className="input-control"
              placeholder="e.g., Physics Midterm 2026, Bangla Grammar Quiz"
              value={examName}
              onChange={(e) => setExamName(e.target.value)}
            />
            <button
              className="btn btn-primary"
              onClick={handleDownloadExcel}
              disabled={questions.length === 0}
            >
              <Download size={18} /> Generate Excel Sheet
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="alert-banner alert-banner-danger">
          <div>{error}</div>
        </div>
      )}

      {/* Tabs */}
      <div className="tabs-nav">
        <button
          className={`tab-btn ${activeTab === 'create' ? 'active' : ''}`}
          onClick={() => setActiveTab('create')}
        >
          <FilePlus size={16} style={{ marginRight: '4px', verticalAlign: 'middle' }} /> Create / Edit Questions
        </button>
        <button
          className={`tab-btn ${activeTab === 'view' ? 'active' : ''}`}
          onClick={() => setActiveTab('view')}
        >
          <List size={16} style={{ marginRight: '4px', verticalAlign: 'middle' }} /> View Created List ({questions.length})
        </button>
      </div>

      {activeTab === 'create' ? (
        <div className="grid grid-cols-3 gap-6">
          {/* Main Question Editor */}
          <div className="card" style={{ gridColumn: 'span 2' }}>
            <div className="flex justify-between align-center mb-4">
              <h4>MCQ Question #{currentIndex + 1}</h4>
              <span className="badge badge-primary">Total: {questions.length}</span>
            </div>

            {/* Question Section */}
            <div className="form-group">
              <label className="form-label">Question Text (Supports KaTeX equations like $x^2$ or $$E=mc^2$$)</label>
              <textarea
                className="input-control"
                rows="3"
                value={currentQ.question.text}
                onChange={(e) => handleQuestionTextChange(e.target.value)}
                onPaste={(e) => handlePaste(e, 'question')}
                placeholder="Enter question text here (You can also copy & paste an image here directly)..."
              />
              <div className="mt-2 flex align-center gap-4">
                <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                  Upload Question PNG Image
                  <input
                    type="file"
                    accept="image/png, image/jpeg"
                    style={{ display: 'none' }}
                    onChange={(e) => handleImageUpload(e, 'question')}
                  />
                </label>
                {currentQ.question.image && (
                  <div className="image-preview-container">
                    <img src={currentQ.question.image} alt="Question preview" />
                    <button className="remove-img-btn" onClick={() => removeImage('question')}>&times;</button>
                  </div>
                )}
              </div>
            </div>

            {/* Options Section */}
            <div className="mt-4">
              <label className="form-label">Options (Click option box to set as CORRECT ANSWER - turning green)</label>
              
              <div className="grid grid-cols-2 gap-4">
                {currentQ.options.map((option, idx) => (
                  <div
                    key={idx}
                    className={`mcq-option-builder ${currentQ.correctIndex === idx ? 'correct' : ''}`}
                    onClick={() => selectCorrectAnswer(idx)}
                  >
                    <div className="flex justify-between align-center mb-2">
                      <span style={{ fontWeight: 'bold' }}>Option {String.fromCharCode(65 + idx)}</span>
                      {currentQ.correctIndex === idx && <span className="badge badge-success">Correct</span>}
                    </div>
                    
                    <input
                      type="text"
                      className="input-control mb-2"
                      value={option.text}
                      onChange={(e) => handleOptionTextChange(e.target.value, idx)}
                      onPaste={(e) => handlePaste(e, 'option', idx)}
                      onClick={(e) => e.stopPropagation()} // Prevent setting correct on typing
                      placeholder={`Enter text or paste image for Option ${String.fromCharCode(65 + idx)}`}
                    />

                    <div className="flex align-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}>
                        Image
                        <input
                          type="file"
                          accept="image/png, image/jpeg"
                          style={{ display: 'none' }}
                          onChange={(e) => handleImageUpload(e, 'option', idx)}
                        />
                      </label>
                      {option.image && (
                        <div className="image-preview-container">
                          <img src={option.image} alt="Option preview" style={{ maxHeight: '80px' }} />
                          <button className="remove-img-btn" onClick={() => removeImage('option', idx)}>&times;</button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Navigation buttons */}
            <div className="flex justify-between align-center mt-6">
              <button
                className="btn btn-secondary"
                onClick={handleBack}
                disabled={currentIndex === 0}
              >
                <ArrowLeft size={16} /> Back
              </button>
              
              <button className="btn btn-primary" onClick={handleNext}>
                {currentIndex === questions.length - 1 ? 'Add MCQ' : 'Next'} <ArrowRight size={16} />
              </button>
            </div>
          </div>

          {/* Quick Nav Sidebar */}
          <div className="card">
            <h4>Question Navigation</h4>
            <p className="text-secondary mb-4" style={{ fontSize: '0.85rem' }}>Quickly jump to edit any question or remove them.</p>
            <div className="flex flex-col gap-2" style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {questions.map((q, idx) => (
                <div
                  key={idx}
                  className="flex justify-between align-center p-2 rounded border"
                  style={{
                    backgroundColor: idx === currentIndex ? 'var(--primary-light)' : 'var(--bg-primary)',
                    borderColor: idx === currentIndex ? 'var(--primary)' : 'var(--border-color)',
                    cursor: 'pointer'
                  }}
                  onClick={() => setCurrentIndex(idx)}
                >
                  <span style={{ fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '150px' }}>
                    #{idx + 1}: {q.question.text || '[Image Only]'}
                  </span>
                  <div className="flex gap-2">
                    <button
                      className="btn btn-danger btn-sm"
                      style={{ padding: '0.25rem', borderRadius: '4px' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteQuestion(idx);
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            
            <button
              className="btn btn-success mt-4"
              style={{ width: '100%' }}
              onClick={() => {
                setQuestions([...questions, initialQuestion()]);
                setCurrentIndex(questions.length);
              }}
            >
              <Plus size={16} /> Add Blank MCQ
            </button>
          </div>
        </div>
      ) : (
        /* View Tab List */
        <div className="card">
          <div className="flex justify-between align-center mb-4">
            <h4>Questions Draft Summary</h4>
            <button className="btn btn-primary btn-sm" onClick={handleDownloadExcel}>
              <Download size={14} /> Export to Excel
            </button>
          </div>
          <div className="flex flex-col gap-4">
            {questions.map((q, idx) => (
              <div key={idx} className="p-4 rounded border border-color" style={{ backgroundColor: 'var(--bg-primary)' }}>
                <div className="flex justify-between align-start">
                  <div className="flex-1">
                    <span style={{ fontWeight: 'bold', color: 'var(--primary)', marginRight: '0.5rem' }}>Question #{idx + 1}:</span>
                    <MathRenderer content={q.question} />
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        setCurrentIndex(idx);
                        setActiveTab('create');
                      }}
                    >
                      <Edit2 size={12} /> Edit
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleDeleteQuestion(idx)}
                    >
                      <Trash2 size={12} /> Delete
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-3 pl-4 border-l-2 border-color">
                  {q.options.map((opt, oIdx) => (
                    <div
                      key={oIdx}
                      className="p-2 rounded flex align-center gap-2"
                      style={{
                        backgroundColor: q.correctIndex === oIdx ? 'var(--success-light)' : 'rgba(255,255,255,0.01)',
                        border: q.correctIndex === oIdx ? '1px solid var(--success)' : '1px solid var(--border-color)'
                      }}
                    >
                      <span style={{ fontWeight: 'bold' }}>{String.fromCharCode(65 + oIdx)}:</span>
                      <MathRenderer content={opt} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
