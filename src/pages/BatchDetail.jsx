import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { parseExcel } from '../utils/excel';
import MathRenderer from '../components/MathRenderer';
import { getAvatarUrl } from '../utils/avatars';
import {
  getUnreadCounts,
  markAnnouncementRead,
  markNoteRead,
  isAnnouncementRead,
  isNoteRead,
  showDeviceNotification,
  syncReadStateFromServer,
} from '../utils/notifications';
import { 
  FileText, Megaphone, HelpCircle, Users, Trash2, Plus, Edit3, 
  X, UploadCloud, Calendar, Clock, Award, CheckCircle, AlertTriangle, ArrowLeft, GraduationCap 
} from 'lucide-react';

function ExamRankingTable({ submissions, userId, compact = false }) {
  const sorted = [...submissions].sort((a, b) => b.score - a.score || a.time_taken - b.time_taken);

  return (
    <div className="table-container" style={{ maxHeight: compact ? '180px' : '240px', overflowY: 'auto' }}>
      <table className="data-table" style={{ fontSize: '0.8rem' }}>
        <thead>
          <tr>
            <th>Rank</th>
            <th>Student</th>
            <th>Score</th>
            <th>Time Taken</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((sub, rIdx) => (
            <tr key={sub.id} style={{ backgroundColor: sub.student_id === userId ? 'var(--primary-light)' : 'transparent' }}>
              <td><span className="badge badge-primary">{rIdx + 1}</span></td>
              <td style={{ fontWeight: 600 }}>{sub.students?.name} {sub.student_id === userId && '(You)'}</td>
              <td>{sub.score} / {sub.total_questions}</td>
              <td>{Math.floor(sub.time_taken / 60)}m {sub.time_taken % 60}s</td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr><td colSpan="4" className="text-center">No students attended this exam yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function RankingPodium({ leaderboard, userId }) {
  const top3 = leaderboard.slice(0, 3);
  if (top3.length === 0) return null;

  const medals = ['gold', 'silver', 'bronze'];
  const order = [1, 0, 2];

  return (
    <div className="ranking-podium">
      {order.map((idx) => {
        const row = top3[idx];
        if (!row) return null;
        const rankClass = idx === 0 ? 'first' : idx === 1 ? 'second' : 'third';
        const medalLabel = idx === 0 ? '1' : idx === 1 ? '2' : '3';

        return (
          <div key={row.student.id} className={`podium-item ${rankClass}`}>
            <div className="podium-avatar-wrap">
              <img src={getAvatarUrl(row.student.photo_url, row.student.gender, row.student.id)} alt="" className="avatar" />
              <span className={`podium-medal ${medals[idx]}`}>{medalLabel}</span>
            </div>
            <div className="podium-name">{row.student.name}{row.student.id === userId ? ' (You)' : ''}</div>
            <div className="podium-score">{row.score} pts · {row.examsCount} exams</div>
            <div className="podium-rank-bar" />
          </div>
        );
      })}
    </div>
  );
}

export default function BatchDetail({ batch, role, userId, onBack, onStartExam, initialTab = 'notes', onTabChange }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Data states
  const [notes, setNotes] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [exams, setExams] = useState([]);
  const [enrolledStudents, setEnrolledStudents] = useState([]);
  const [approvedGlobalStudents, setApprovedGlobalStudents] = useState([]); // For enrollment modal
  const [submissions, setSubmissions] = useState([]); // Student exam submissions
  const [instructor, setInstructor] = useState(null); // Teacher/instructor profile

  // Sub-tabs for previous exams
  const [prevExamActiveTab, setPrevExamActiveTab] = useState({}); // examId -> 'questions' | 'results'

  // Modal control
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [selectedReviewExam, setSelectedReviewExam] = useState(null);
  const [reviewModalTab, setReviewModalTab] = useState('review'); // 'review' | 'leaderboard'
  
  // Forms states
  const [noteForm, setNoteForm] = useState({ title: '', drive_link: '' });
  const [annForm, setAnnForm] = useState({ title: '', content: '' });
  
  // Exam creation states
  const [examForm, setExamForm] = useState({
    name: '',
    exam_date: '',
    duration: 30,
    shuffle_mcqs: false,
    shuffle_options: false
  });
  const [parsedQuestions, setParsedQuestions] = useState([]);
  const [editingExamId, setEditingExamId] = useState(null);
  const [unreadCounts, setUnreadCounts] = useState({ announcements: 0, notes: 0, total: 0 });
  const [expandedAnnIds, setExpandedAnnIds] = useState([]);
  const [expandedExamId, setExpandedExamId] = useState(null);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const switchTab = (tab) => {
    setActiveTab(tab);
    onTabChange?.(tab);
  };

  const refreshUnreadCounts = () => {
    if (role !== 'student' || !userId) return;
    setUnreadCounts(getUnreadCounts(userId, batch.id, announcements, notes));
  };

  useEffect(() => {
    refreshUnreadCounts();
  }, [announcements, notes, userId, role, batch.id]);

  useEffect(() => {
    const loadBatchData = async () => {
      if (role === 'student' && userId) {
        await syncReadStateFromServer(userId);
      }
      fetchNotes();
      fetchAnnouncements();
    };
    loadBatchData();
    fetchExams();
    fetchEnrolledStudents();
    if (role === 'teacher') {
      fetchApprovedGlobalStudents();
    }
    if (role === 'student' && batch.teacher_id) {
      fetchInstructor(batch.teacher_id);
    }
  }, [batch.id]);

  const fetchInstructor = async (teacherId) => {
    const { data } = await supabase.from('teachers').select('*').eq('id', teacherId).maybeSingle();
    if (data) setInstructor(data);
  };

  const fetchNotes = async () => {
    const { data } = await supabase.from('notes').select('*').eq('batch_id', batch.id).order('created_at', { ascending: false });
    if (data) setNotes(data);
  };

  const fetchAnnouncements = async () => {
    const { data } = await supabase.from('announcements').select('*').eq('batch_id', batch.id).order('created_at', { ascending: false });
    if (data) setAnnouncements(data);
  };

  const fetchExams = async () => {
    const { data, error } = await supabase.from('exams').select('*').eq('batch_id', batch.id).order('exam_date', { ascending: true });
    if (data) {
      setExams(data);
      // Fetch submissions for all exams
      const examIds = data.map(e => e.id);
      if (examIds.length > 0) {
        const { data: subData } = await supabase
          .from('student_exams')
          .select('*, students(name, photo_url)')
          .in('exam_id', examIds);
        if (subData) setSubmissions(subData);
      }
    }
  };

  const fetchEnrolledStudents = async () => {
    const { data: joinData } = await supabase.from('batch_students').select('student_id').eq('batch_id', batch.id);
    if (joinData && joinData.length > 0) {
      const studentIds = joinData.map(j => j.student_id);
      const { data: studs } = await supabase.from('students').select('*').in('id', studentIds);
      if (studs) setEnrolledStudents(studs);
    } else {
      setEnrolledStudents([]);
    }
  };

  const fetchApprovedGlobalStudents = async () => {
    const { data } = await supabase.from('students').select('*').eq('is_approved', true);
    if (data) setApprovedGlobalStudents(data);
  };

  // Add Note
  const handleAddNote = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!noteForm.title.trim() || !noteForm.drive_link.trim()) {
      setError('Title and Link are required');
      return;
    }
    try {
      const { error } = await supabase
        .from('notes')
        .insert([{ batch_id: batch.id, title: noteForm.title.trim(), drive_link: noteForm.drive_link.trim() }]);
      if (error) throw error;
      setSuccess('Note added successfully');
      setNoteForm({ title: '', drive_link: '' });
      fetchNotes();
    } catch (err) {
      setError(err.message || 'Error adding note');
    }
  };

  const handleDeleteNote = async (id) => {
    if (!confirm('Delete this note?')) return;
    await supabase.from('notes').delete().eq('id', id);
    fetchNotes();
  };

  // Add Announcement
  const handleAddAnn = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!annForm.title.trim() || !annForm.content.trim()) {
      setError('Title and Content are required');
      return;
    }
    try {
      const { error } = await supabase
        .from('announcements')
        .insert([{ batch_id: batch.id, title: annForm.title.trim(), content: annForm.content.trim() }]);
      if (error) throw error;
      setSuccess('Announcement posted');
      setAnnForm({ title: '', content: '' });
      fetchAnnouncements();
    } catch (err) {
      setError(err.message || 'Error posting announcement');
    }
  };

  const handleDeleteAnn = async (id) => {
    if (!confirm('Delete announcement?')) return;
    await supabase.from('announcements').delete().eq('id', id);
    fetchAnnouncements();
  };

  const handleTrashBatch = async () => {
    if (!confirm('Move this batch to Trash?')) return;
    try {
      const { error } = await supabase
        .from('batches')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', batch.id);
      if (error) throw error;
      alert('Batch moved to Trash successfully.');
      onBack();
    } catch (err) {
      alert(err.message || 'Error deleting batch');
    }
  };

  // Upload/Parse MCQ Excel File
  const handleExcelUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setError('');
    try {
      setLoading(true);
      const parsed = await parseExcel(file);
      setParsedQuestions(parsed);
      setSuccess(`Excel file parsed successfully! Found ${parsed.length} questions.`);
    } catch (err) {
      setError(err.message || 'Error parsing Excel file. Ensure columns follow standard.');
    } finally {
      setLoading(false);
    }
  };

  // Generate / Edit Exam
  const handleGenerateExam = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');

    if (!examForm.name.trim()) return setError('Exam Name is required');
    if (!examForm.exam_date) return setError('Exam date and time is required');
    if (parsedQuestions.length === 0) return setError('Please upload an MCQ Excel file containing questions');

    try {
      setLoading(true);
      if (editingExamId) {
        // Edit existing exam
        const { error } = await supabase
          .from('exams')
          .update({
            name: examForm.name,
            exam_date: examForm.exam_date,
            duration: examForm.duration,
            shuffle_mcqs: examForm.shuffle_mcqs,
            shuffle_options: examForm.shuffle_options,
            questions: parsedQuestions
          })
          .eq('id', editingExamId);
        if (error) throw error;
        setSuccess('Exam updated successfully!');
      } else {
        // Create new exam
        const { error } = await supabase
          .from('exams')
          .insert([{
            batch_id: batch.id,
            name: examForm.name,
            exam_date: examForm.exam_date,
            duration: examForm.duration,
            shuffle_mcqs: examForm.shuffle_mcqs,
            shuffle_options: examForm.shuffle_options,
            questions: parsedQuestions
          }]);
        if (error) throw error;
        setSuccess('Exam created and scheduled successfully!');
      }

      // Reset exam form
      setExamForm({ name: '', exam_date: '', duration: 30, shuffle_mcqs: false, shuffle_options: false });
      setParsedQuestions([]);
      setEditingExamId(null);
      fetchExams();
    } catch (err) {
      setError(err.message || 'Error creating exam');
    } finally {
      setLoading(false);
    }
  };

  const handleEditExam = (exam) => {
    setEditingExamId(exam.id);
    setExamForm({
      name: exam.name,
      exam_date: exam.exam_date, // Simple YYYY-MM-DD string
      duration: exam.duration,
      shuffle_mcqs: exam.shuffle_mcqs,
      shuffle_options: exam.shuffle_options
    });
    setParsedQuestions(exam.questions);
    setActiveTab('exams');
  };

  const handleDeleteExam = async (examId) => {
    if (!confirm('Are you sure you want to delete this exam? This will remove all student scores for it.')) return;
    try {
      const { error } = await supabase.from('exams').delete().eq('id', examId);
      if (error) throw error;
      fetchExams();
    } catch (err) {
      alert(err.message || 'Error deleting exam');
    }
  };

  // Add student to batch
  const handleEnrollStudent = async (studentId) => {
    try {
      const { error } = await supabase
        .from('batch_students')
        .insert([{ batch_id: batch.id, student_id: studentId }]);
      if (error) throw error;
      fetchEnrolledStudents();

      // Send welcome email in background (fire-and-forget, don't block UI)
      try {
        // Fetch student details (name + email)
        const { data: studentData } = await supabase
          .from('students')
          .select('name, email')
          .eq('id', studentId)
          .maybeSingle();

        // Fetch teacher name
        const { data: teacherData } = await supabase
          .from('teachers')
          .select('name')
          .eq('id', batch.teacher_id)
          .maybeSingle();

        if (studentData?.email) {
          fetch('/api/send-batch-welcome', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              studentEmail: studentData.email,
              studentName: studentData.name || 'শিক্ষার্থী',
              teacherName: teacherData?.name || 'শিক্ষক',
              batchTitle: batch.title,
              subjects: batch.subjects || [],
            }),
          }).catch(err => console.warn('Welcome email failed (non-critical):', err));
        }
      } catch (emailErr) {
        console.warn('Could not send welcome email (non-critical):', emailErr);
      }
    } catch (err) {
      alert(err.message || 'Error enrolling student');
    }
  };


  // Remove student from batch
  const handleUnenrollStudent = async (studentId) => {
    if (!confirm('Remove this student from the batch?')) return;
    try {
      const { error } = await supabase
        .from('batch_students')
        .delete()
        .eq('batch_id', batch.id)
        .eq('student_id', studentId);
      if (error) throw error;
      fetchEnrolledStudents();
    } catch (err) {
      alert(err.message || 'Error removing student');
    }
  };

  // Categorize exams by local date
  const getLocalDateString = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const todayStr = getLocalDateString(new Date());

  const activeExams = exams.filter(e => {
    const examDateStr = e.exam_date.substring(0, 10);
    return examDateStr >= todayStr;
  });
  
  const previousExams = exams.filter(e => {
    const examDateStr = e.exam_date.substring(0, 10);
    return examDateStr < todayStr;
  });

  // Calculate Overall Leaderboard/Ranking for Students (Student Mode)
  const getOverallLeaderboard = () => {
    const studentScores = {};
    
    // Initialize all batch friends
    enrolledStudents.forEach(s => {
      studentScores[s.id] = { student: s, score: 0, examsCount: 0 };
    });

    // Aggregate submissions matching the exams of this batch
    const examIds = exams.map(e => e.id);
    submissions.forEach(sub => {
      if (examIds.includes(sub.exam_id) && studentScores[sub.student_id]) {
        studentScores[sub.student_id].score += Number(sub.score);
        studentScores[sub.student_id].examsCount += 1;
      }
    });

    // Convert to sorted array
    return Object.values(studentScores)
      .sort((a, b) => b.score - a.score);
  };

  // Helper: check if student has submitted an exam
  const hasStudentTakenExam = (examId) => {
    return submissions.some(sub => sub.exam_id === examId && sub.student_id === userId);
  };

  const getStudentExamSubmission = (examId) => {
    return submissions.find(sub => sub.exam_id === examId && sub.student_id === userId);
  };

  const reviewSubmission = selectedReviewExam
    ? submissions.find(sub => sub.exam_id === selectedReviewExam.id && sub.student_id === userId)
    : null;

  return (
    <div className="batch-detail-shell">
      <div className="back-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button type="button" onClick={onBack}>
            <ArrowLeft size={16} /> Back
          </button>
          <h2 style={{ fontSize: '1.1rem', margin: 0 }}>{batch.title}</h2>
          <span className="badge badge-primary">{role === 'teacher' ? 'Teacher' : 'Student'}</span>
        </div>
        {role === 'teacher' && (
          <button
            type="button"
            className="btn btn-danger btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', minHeight: '32px' }}
            onClick={handleTrashBatch}
          >
            <Trash2 size={14} /> Move to Trash
          </button>
        )}
      </div>

      {error && <div className="alert-banner alert-banner-danger"><div>{error}</div></div>}
      {success && <div className="alert-banner alert-banner-success"><div>{success}</div></div>}

      {/* Tabs */}
      <div className="tabs-nav">
        <button className={`tab-btn tab-btn-with-badge ${activeTab === 'notes' ? 'active' : ''}`} onClick={() => switchTab('notes')}>
          <FileText size={16} style={{ marginRight: '4px', verticalAlign: 'middle' }} /> Notes
          {role === 'student' && unreadCounts.notes > 0 && (
            <span className="notification-badge">{unreadCounts.notes}</span>
          )}
        </button>
        <button className={`tab-btn ${activeTab === 'exams' ? 'active' : ''}`} onClick={() => switchTab('exams')}>
          <HelpCircle size={16} style={{ marginRight: '4px', verticalAlign: 'middle' }} /> Exams
        </button>
        <button className={`tab-btn tab-btn-with-badge ${activeTab === 'notices' ? 'active' : ''}`} onClick={() => switchTab('notices')}>
          <Megaphone size={16} style={{ marginRight: '4px', verticalAlign: 'middle' }} /> {role === 'teacher' ? 'Announcements' : 'Notices'}
          {role === 'student' && unreadCounts.announcements > 0 && (
            <span className="notification-badge">{unreadCounts.announcements}</span>
          )}
        </button>
        {role === 'teacher' ? (
          <button className={`tab-btn ${activeTab === 'students' ? 'active' : ''}`} onClick={() => switchTab('students')}>
            <Users size={16} style={{ marginRight: '4px', verticalAlign: 'middle' }} /> View Students ({enrolledStudents.length})
          </button>
        ) : (
          <>
            <button className={`tab-btn ${activeTab === 'ranking' ? 'active' : ''}`} onClick={() => switchTab('ranking')}>
              <Award size={16} style={{ marginRight: '4px', verticalAlign: 'middle' }} /> Batch Ranking
            </button>
            <button className={`tab-btn ${activeTab === 'friends' ? 'active' : ''}`} onClick={() => switchTab('friends')}>
              <Users size={16} style={{ marginRight: '4px', verticalAlign: 'middle' }} /> Batch Friends ({enrolledStudents.length})
            </button>
            <button className={`tab-btn ${activeTab === 'instructor' ? 'active' : ''}`} onClick={() => switchTab('instructor')}>
              <GraduationCap size={16} style={{ marginRight: '4px', verticalAlign: 'middle' }} /> Instructor
            </button>
          </>
        )}
      </div>

      {/* TAB CONTENT: Notes */}
      {activeTab === 'notes' && (
        <div className="grid grid-cols-3 gap-6">
          {/* Notes list */}
          <div className="card" style={{ gridColumn: role === 'teacher' ? 'span 2' : 'span 3' }}>
            <h3 className="mb-4">Lecture Notes</h3>
            {notes.length === 0 ? (
              <p className="text-secondary">No notes have been uploaded for this batch yet.</p>
            ) : (
              <div className="flex flex-col gap-4">
                {notes.map((note) => {
                  const unread = role === 'student' && userId && !isNoteRead(userId, batch.id, note.id);
                  return (
                  <div
                    key={note.id}
                    className={`flex justify-between align-center p-4 border border-color rounded ${unread ? 'unread-item' : ''}`}
                    style={{ backgroundColor: 'var(--bg-primary)' }}
                  >
                    <div>
                      <h4 style={{ margin: 0 }}>{note.title}{unread && <span className="badge badge-danger ml-2" style={{ marginLeft: '0.5rem', fontSize: '0.65rem' }}>New</span>}</h4>
                      <a
                        href={note.drive_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: '0.85rem' }}
                        onClick={() => {
                          if (role === 'student' && userId) {
                            markNoteRead(userId, batch.id, note.id);
                            refreshUnreadCounts();
                          }
                        }}
                      >
                        Open Google Drive PDF
                      </a>
                    </div>
                    {role === 'teacher' && (
                      <button className="btn btn-danger btn-sm" onClick={() => handleDeleteNote(note.id)}>
                        <Trash2 size={14} /> Delete
                      </button>
                    )}
                  </div>
                  );
                })}
              </div>
            )}
          </div>
          
          {/* Add Note (Teacher Only) */}
          {role === 'teacher' && (
            <div className="card">
              <h3>Upload Note Link</h3>
              <form onSubmit={handleAddNote} className="mt-4">
                <div className="form-group">
                  <label className="form-label">Note Title</label>
                  <input
                    type="text"
                    className="input-control"
                    placeholder="e.g. Chapter 4 Force Lecture"
                    value={noteForm.title}
                    onChange={(e) => setNoteForm({ ...noteForm, title: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Google Drive Link (PDF)</label>
                  <input
                    type="url"
                    className="input-control"
                    placeholder="https://drive.google.com/..."
                    value={noteForm.drive_link}
                    onChange={(e) => setNoteForm({ ...noteForm, drive_link: e.target.value })}
                  />
                </div>
                <button type="submit" className="btn btn-primary mt-2" style={{ width: '100%' }}>
                  <Plus size={16} /> Add Note
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: Announcements / Notices */}
      {activeTab === 'notices' && (
        <div className="grid grid-cols-3 gap-6">
          <div className="card" style={{ gridColumn: role === 'teacher' ? 'span 2' : 'span 3' }}>
            <h3 className="mb-4">Announcements / Notices Board</h3>
            {announcements.length === 0 ? (
              <p className="text-secondary">No notices posted.</p>
            ) : (
              <div className="flex flex-col gap-4">
                {announcements.map((ann) => {
                  const unread = role === 'student' && userId && !isAnnouncementRead(userId, batch.id, ann.id);
                  const isExpanded = expandedAnnIds.includes(ann.id);
                  return (
                  <div
                    key={ann.id}
                    className={`p-4 border border-color rounded ${unread ? 'unread-item' : ''}`}
                    style={{ backgroundColor: 'var(--bg-primary)', cursor: role === 'student' ? 'pointer' : 'default' }}
                    onClick={() => {
                      if (role === 'student' && userId) {
                        markAnnouncementRead(userId, batch.id, ann.id);
                        setExpandedAnnIds((prev) => prev.includes(ann.id) ? prev : [...prev, ann.id]);
                        refreshUnreadCounts();
                      }
                    }}
                  >
                    <div className="flex justify-between align-start mb-2">
                      <h4>{ann.title}{unread && <span className="badge badge-danger" style={{ marginLeft: '0.5rem', fontSize: '0.65rem' }}>New</span>}</h4>
                      {role === 'teacher' && (
                        <button className="btn btn-danger btn-sm" onClick={(e) => { e.stopPropagation(); handleDeleteAnn(ann.id); }}>
                          <Trash2 size={12} /> Delete
                        </button>
                      )}
                    </div>
                    {(role === 'teacher' || isExpanded || !unread) && (
                      <p className="text-secondary" style={{ whiteSpace: 'pre-wrap' }}>{ann.content}</p>
                    )}
                    {!isExpanded && unread && role === 'student' && (
                      <p className="text-muted" style={{ fontSize: '0.8rem' }}>Tap to read notice...</p>
                    )}
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Posted on {new Date(ann.created_at).toLocaleString()}
                    </span>
                  </div>
                  );
                })}
              </div>
            )}
          </div>

          {role === 'teacher' && (
            <div className="card">
              <h3>Post Announcement</h3>
              <form onSubmit={handleAddAnn} className="mt-4">
                <div className="form-group">
                  <label className="form-label">Title</label>
                  <input
                    type="text"
                    className="input-control"
                    placeholder="e.g. Class Postponed Notice"
                    value={annForm.title}
                    onChange={(e) => setAnnForm({ ...annForm, title: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Announcement Content</label>
                  <textarea
                    className="input-control"
                    rows="4"
                    placeholder="Write detailed notice here..."
                    value={annForm.content}
                    onChange={(e) => setAnnForm({ ...annForm, content: e.target.value })}
                  />
                </div>
                <button type="submit" className="btn btn-primary mt-2" style={{ width: '100%' }}>
                  <Megaphone size={16} /> Broadcast Notice
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: Exams */}
      {activeTab === 'exams' && (
        <div>
          {/* TEACHER EXAM PANELS */}
          {role === 'teacher' && (
            <div className="grid grid-cols-3 gap-6">
              {/* Left Column: Create Exam / Edit Exam */}
              <div className="card" style={{ gridColumn: 'span 1' }}>
                <h3>{editingExamId ? 'Edit Scheduled Exam' : 'Create Live Exam'}</h3>
                
                <form onSubmit={handleGenerateExam} className="mt-4">
                  <div className="form-group">
                    <label className="form-label">Exam Name</label>
                    <input
                      type="text"
                      className="input-control"
                      placeholder="e.g. Weekly Math Exam 3"
                      value={examForm.name}
                      onChange={(e) => setExamForm({ ...examForm, name: e.target.value })}
                    />
                  </div>

                    <div className="form-group">
                      <label className="form-label">Exam Date</label>
                      <input
                        type="date"
                        className="input-control"
                        value={examForm.exam_date}
                        onChange={(e) => setExamForm({ ...examForm, exam_date: e.target.value })}
                      />
                    </div>
                    <div className="form-group mt-4">
                      <label className="form-label">Duration (Mins)</label>
                      <input
                        type="number"
                        className="input-control"
                        value={examForm.duration}
                        onChange={(e) => setExamForm({ ...examForm, duration: parseInt(e.target.value) || 0 })}
                      />
                    </div>
                

                  <div className="form-group mt-2">
                    <label className="form-label">Upload MCQ Excel File</label>
                    <label className="btn btn-secondary flex align-center justify-center" style={{ cursor: 'pointer', padding: '0.65rem' }}>
                      <UploadCloud size={18} /> Choose Excel
                      <input
                        type="file"
                        accept=".xlsx, .xls"
                        style={{ display: 'none' }}
                        onChange={handleExcelUpload}
                      />
                    </label>
                    {parsedQuestions.length > 0 && (
                      <span className="badge badge-success mt-2">Loaded: {parsedQuestions.length} MCQs</span>
                    )}
                  </div>

                  <div className="form-group mt-4">
                    <label className="checkbox-group mb-2">
                      <input
                        type="checkbox"
                        className="checkbox-control"
                        checked={examForm.shuffle_mcqs}
                        onChange={(e) => setExamForm({ ...examForm, shuffle_mcqs: e.target.checked })}
                      />
                      <span>Shuffle Questions Order</span>
                    </label>
                    <label className="checkbox-group">
                      <input
                        type="checkbox"
                        className="checkbox-control"
                        checked={examForm.shuffle_options}
                        onChange={(e) => setExamForm({ ...examForm, shuffle_options: e.target.checked })}
                      />
                      <span>Shuffle Options A-D on Student screen</span>
                    </label>
                  </div>

                  <div className="flex gap-2 mt-6">
                    <button type="submit" className="btn btn-success flex-1" disabled={loading}>
                      {editingExamId ? 'Update Exam' : 'Generate Exam'}
                    </button>
                    {editingExamId && (
                      <button 
                        type="button" 
                        className="btn btn-secondary"
                        onClick={() => {
                          setEditingExamId(null);
                          setExamForm({ name: '', exam_date: '', duration: 30, shuffle_mcqs: false, shuffle_options: false });
                          setParsedQuestions([]);
                        }}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </form>
                
                {/* View/Preview Questions Panel */}
                {parsedQuestions.length > 0 && (
                  <div className="mt-6 border-t border-color pt-4">
                    <h4>Preview Loaded Excel Questions</h4>
                    <div className="flex flex-col gap-2 mt-4" style={{ maxHeight: '250px', overflowY: 'auto' }}>
                      {parsedQuestions.map((q, idx) => (
                        <div key={idx} className="p-2 rounded border border-color" style={{ fontSize: '0.8rem', backgroundColor: 'var(--bg-primary)' }}>
                          <span style={{ fontWeight: 'bold', color: 'var(--primary)' }}>Q{idx + 1}: </span>
                          <MathRenderer content={q.question} />
                          <div className="grid grid-cols-2 gap-1 mt-1 pl-2" style={{ fontSize: '0.75rem' }}>
                            {q.options.map((o, oIdx) => (
                              <div key={oIdx} className={q.correctIndex === oIdx ? 'text-success' : 'text-muted'} style={{ display: 'flex', gap: '4px' }}>
                                <span>{String.fromCharCode(65 + oIdx)}:</span>
                                <MathRenderer content={o} />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Right Columns: Created Exams & Previous Exams */}
              <div style={{ gridColumn: 'span 2' }} className="flex flex-col gap-6">
                {/* Created / Upcoming Exams */}
                <div className="card">
                  <h3>Created / Scheduled Exams ({activeExams.length})</h3>
                  {activeExams.length === 0 ? (
                    <p className="text-secondary mt-2">No active or scheduled exams.</p>
                  ) : (
                    <div className="flex flex-col gap-4 mt-4">
                      {activeExams.map((e) => (
                        <div key={e.id} className="p-4 border border-color rounded flex justify-between align-center" style={{ backgroundColor: 'var(--bg-primary)' }}>
                          <div>
                            <h4>{e.name}</h4>
                            <div className="flex gap-4 mt-2" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                              <span className="flex align-center gap-1"><Calendar size={14} /> Date: {e.exam_date}</span>
                              <span className="flex align-center gap-1"><Clock size={14} /> {e.duration} mins</span>
                            </div>
                            <div className="flex gap-4 mt-2">
                              {e.shuffle_mcqs && <span className="badge badge-primary">Shuffle MCQs</span>}
                              {e.shuffle_options && <span className="badge badge-primary">Shuffle Options</span>}
                            </div>
                          </div>
                          
                          <div className="flex gap-2">
                            <button className="btn btn-secondary btn-sm" onClick={() => handleEditExam(e)}>
                              <Edit3 size={14} /> Edit
                            </button>
                            <button className="btn btn-danger btn-sm" onClick={() => handleDeleteExam(e.id)}>
                              <Trash2 size={14} /> Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Previous Exams — collapsed list */}
                <div className="card">
                  <h3>Previous Exams ({previousExams.length})</h3>
                  {previousExams.length === 0 ? (
                    <p className="text-secondary mt-2">No completed exams.</p>
                  ) : (
                    <div className="flex flex-col gap-2 mt-4">
                      {previousExams.map((e) => {
                        const isOpen = expandedExamId === e.id;
                        const activeSubTab = prevExamActiveTab[e.id] || 'questions';
                        const examSubmissions = submissions.filter(sub => sub.exam_id === e.id);

                        return (
                          <div key={e.id} className="border border-color rounded" style={{ backgroundColor: 'var(--bg-primary)', overflow: 'hidden' }}>
                            <button
                              style={{ width: '100%', background: 'none', border: 'none', padding: '0.75rem 1rem', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'inherit' }}
                              onClick={() => setExpandedExamId(isOpen ? null : e.id)}
                            >
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.15rem' }}>
                                <span style={{ fontWeight: 600 }}>{e.name}</span>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                  <Calendar size={12} /> {e.exam_date?.substring(0, 10)} · {examSubmissions.length} submission{examSubmissions.length !== 1 ? 's' : ''}
                                </span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span className="badge badge-success">Completed</span>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{isOpen ? '▲' : '▼'}</span>
                              </div>
                            </button>

                            {/* Expanded Content */}
                            {isOpen && (
                              <div style={{ borderTop: '1px solid var(--border-color)', padding: '1rem' }}>
                                <div className="tabs-nav" style={{ borderBottomWidth: '1px', marginBottom: '1rem' }}>
                                  <button
                                    className={`tab-btn ${activeSubTab === 'questions' ? 'active' : ''}`}
                                    style={{ padding: '0.5rem', fontSize: '0.85rem' }}
                                    onClick={() => setPrevExamActiveTab({ ...prevExamActiveTab, [e.id]: 'questions' })}
                                  >
                                    View Questions
                                  </button>
                                  <button
                                    className={`tab-btn ${activeSubTab === 'results' ? 'active' : ''}`}
                                    style={{ padding: '0.5rem', fontSize: '0.85rem' }}
                                    onClick={() => setPrevExamActiveTab({ ...prevExamActiveTab, [e.id]: 'results' })}
                                  >
                                    Results & Rankings ({examSubmissions.length})
                                  </button>
                                </div>

                                {activeSubTab === 'questions' && (
                                  <div className="flex flex-col gap-2 pl-2" style={{ maxHeight: '260px', overflowY: 'auto' }}>
                                    {e.questions.map((q, qIdx) => (
                                      <div key={qIdx} className="p-2 border-b border-color" style={{ fontSize: '0.85rem' }}>
                                        <div style={{ fontWeight: 'bold' }}>Q{qIdx + 1}: <MathRenderer content={q.question} /></div>
                                        <div className="grid grid-cols-2 gap-2 mt-1">
                                          {q.options.map((opt, oIdx) => (
                                            <div
                                              key={oIdx}
                                              className={q.correctIndex === oIdx ? 'text-success' : 'text-muted'}
                                              style={{ display: 'flex', gap: '4px', fontWeight: q.correctIndex === oIdx ? 'bold' : 'normal' }}
                                            >
                                              <span>{String.fromCharCode(65 + oIdx)})</span>
                                              <MathRenderer content={opt} />
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {activeSubTab === 'results' && (
                                  <div className="table-container" style={{ maxHeight: '240px', overflowY: 'auto', overflowX: 'hidden', width: '100%' }}>
                                    <table className="data-table" style={{ fontSize: '0.8rem' }}>
                                      <thead>
                                        <tr>
                                          <th>Rank</th>
                                          <th>Student</th>
                                          <th>Score</th>
                                          <th>Time Taken</th>
                                          <th>Warnings</th>
                                          <th>Submitted</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {examSubmissions
                                          .sort((a, b) => b.score - a.score || a.time_taken - b.time_taken)
                                          .map((sub, rIdx) => (
                                            <tr key={sub.id}>
                                              <td><span className="badge badge-primary">{rIdx + 1}</span></td>
                                              <td style={{ fontWeight: 600 }}>{sub.students?.name}</td>
                                              <td>{sub.score} / {sub.total_questions}</td>
                                              <td>{Math.floor(sub.time_taken / 60)}m {sub.time_taken % 60}s</td>
                                              <td>
                                                {sub.warnings > 0 ? (
                                                  <span className="text-danger flex align-center gap-1"><AlertTriangle size={12} /> {sub.warnings}</span>
                                                ) : <span className="text-success">0</span>}
                                              </td>
                                              <td>{new Date(sub.submitted_at).toLocaleString()}</td>
                                            </tr>
                                          ))}
                                        {examSubmissions.length === 0 && (
                                          <tr><td colSpan="6" className="text-center">No submissions yet.</td></tr>
                                        )}
                                      </tbody>
                                    </table>
                                  </div>
                                )}

                                <div className="flex justify-end border-t border-color mt-4 pt-2">
                                  <button className="btn btn-danger btn-sm" onClick={() => handleDeleteExam(e.id)}>
                                    <Trash2 size={12} /> Delete Exam Record
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* STUDENT EXAM PANELS */}
          {role === 'student' && (
            <div className="grid grid-cols-2 gap-6">
              {/* Current Live/Scheduled Exams */}
              <div className="card">
                <h3>Live / Current Exams ({activeExams.length})</h3>
                {activeExams.length === 0 ? (
                  <p className="text-secondary mt-2">No live exams scheduled right now.</p>
                ) : (
                  <div className="flex flex-col gap-4 mt-4">
                    {activeExams.map((e) => {
                      const hasTaken = hasStudentTakenExam(e.id);
                      const examDateStr = e.exam_date.substring(0, 10);
                      const isToday = examDateStr === todayStr;
                      const isClickable = isToday && !hasTaken;
                      const examSubmissions = submissions.filter(sub => sub.exam_id === e.id);
                      const myRank = [...examSubmissions]
                        .sort((a, b) => b.score - a.score || a.time_taken - b.time_taken)
                        .findIndex((sub) => sub.student_id === userId) + 1;
                      
                      return (
                        <div key={e.id} className="p-4 border border-color rounded" style={{ backgroundColor: 'var(--bg-primary)' }}>
                          <div className="flex justify-between align-start mb-2">
                            <h4>{e.name}</h4>
                            {hasTaken ? (
                              <span className="badge badge-success">Attended</span>
                            ) : examDateStr > todayStr ? (
                              <span className="badge badge-warning">Upcoming</span>
                            ) : (
                              <span className="badge badge-danger">Live Now</span>
                            )}
                          </div>
                          <div className="flex gap-4 mt-2" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            <span className="flex align-center gap-1"><Calendar size={14} /> Date: {examDateStr}</span>
                            <span className="flex align-center gap-1"><Clock size={14} /> Duration: {e.duration} mins</span>
                          </div>
                          
                          <div className="flex justify-between align-center mt-4">
                            {hasTaken ? (
                              <span className="text-success" style={{ fontSize: '0.85rem' }}>
                                Score: {getStudentExamSubmission(e.id)?.score} / {getStudentExamSubmission(e.id)?.total_questions}
                              </span>
                            ) : (
                              <span className="text-secondary" style={{ fontSize: '0.85rem' }}>
                                {examDateStr > todayStr ? 'Waiting for exam day...' : 'Start exam to answer.'}
                              </span>
                            )}
                            {hasTaken ? (
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => setSelectedReviewExam(e)}
                              >
                                View Answers
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                disabled={!isClickable}
                                onClick={() => onStartExam(e)}
                              >
                                Start Exam
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Previous Completed Exams — collapsed list */}
              <div className="card">
                <h3>Previous Exam Results ({previousExams.length})</h3>
                {previousExams.length === 0 ? (
                  <p className="text-secondary mt-2">No previous exams to show.</p>
                ) : (
                  <div className="flex flex-col gap-2 mt-4">
                    {previousExams.map((e) => {
                      const isOpen = expandedExamId === e.id;
                      const activeSubTab = prevExamActiveTab[e.id] || 'questions';
                      const examSubmissions = submissions.filter(sub => sub.exam_id === e.id);
                      const mySub = getStudentExamSubmission(e.id);

                      return (
                        <div key={e.id} className="border border-color rounded" style={{ backgroundColor: 'var(--bg-primary)', overflow: 'hidden' }}>
                          <button
                            style={{ width: '100%', background: 'none', border: 'none', padding: '0.75rem 1rem', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'inherit' }}
                            onClick={() => setExpandedExamId(isOpen ? null : e.id)}
                          >
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.15rem' }}>
                              <span style={{ fontWeight: 600 }}>{e.name}</span>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                <Calendar size={12} /> {e.exam_date?.substring(0, 10)}
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              {mySub ? (
                                <span className="badge badge-success">Score: {mySub.score}/{mySub.total_questions}</span>
                              ) : (
                                <span className="badge badge-danger">Missed</span>
                              )}
                              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{isOpen ? '▲' : '▼'}</span>
                            </div>
                          </button>

                          {/* Expanded Content */}
                          {isOpen && (
                            <div style={{ borderTop: '1px solid var(--border-color)', padding: '1rem' }}>
                              {mySub && (
                                <div style={{ marginBottom: '0.75rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border-color)' }}>
                                  <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => setSelectedReviewExam(e)}
                                  >
                                    View Detailed Review
                                  </button>
                                </div>
                              )}
                              <div className="tabs-nav" style={{ borderBottomWidth: '1px', marginBottom: '1rem', marginTop: '0.25rem' }}>
                                <button
                                  className={`tab-btn ${activeSubTab === 'questions' ? 'active' : ''}`}
                                  style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                                  onClick={() => setPrevExamActiveTab({ ...prevExamActiveTab, [e.id]: 'questions' })}
                                >
                                  View Questions
                                </button>
                                <button
                                  className={`tab-btn ${activeSubTab === 'results' ? 'active' : ''}`}
                                  style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                                  onClick={() => setPrevExamActiveTab({ ...prevExamActiveTab, [e.id]: 'results' })}
                                >
                                  Leaderboard ({examSubmissions.length})
                                </button>
                              </div>

                              {activeSubTab === 'questions' && (
                                <div className="flex flex-col gap-2 pl-2" style={{ maxHeight: '260px', overflowY: 'auto' }}>
                                  {e.questions.map((q, qIdx) => {
                                    const selectedIdx = mySub?.answers?.[qIdx];
                                    const isCorrectSelected = selectedIdx === q.correctIndex;
                                    return (
                                      <div key={qIdx} className="p-2 border-b border-color" style={{ fontSize: '0.85rem' }}>
                                        <div style={{ fontWeight: 'bold' }}>Q{qIdx + 1}: <MathRenderer content={q.question} /></div>
                                        <div className="grid grid-cols-2 gap-2 mt-1">
                                          {q.options.map((opt, oIdx) => {
                                            let styleClass = 'text-muted';
                                            let extraText = '';
                                            if (q.correctIndex === oIdx) { styleClass = 'text-success font-bold'; extraText = ' ✓'; }
                                            else if (selectedIdx === oIdx && !isCorrectSelected) { styleClass = 'text-danger font-bold'; extraText = ' (You)'; }
                                            return (
                                              <div key={oIdx} className={styleClass} style={{ display: 'flex', gap: '4px' }}>
                                                <span>{String.fromCharCode(65 + oIdx)})</span>
                                                <MathRenderer content={opt} />
                                                {extraText && <span style={{ fontSize: '0.7rem' }}>{extraText}</span>}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              {activeSubTab === 'results' && (
                                <div className="table-container" style={{ maxHeight: '200px', overflowY: 'auto', overflowX: 'hidden', width: '100%' }}>
                                  <table className="data-table" style={{ fontSize: '0.8rem' }}>
                                    <thead>
                                      <tr><th>Rank</th><th>Student</th><th>Score</th><th>Time</th></tr>
                                    </thead>
                                    <tbody>
                                      {examSubmissions
                                        .sort((a, b) => b.score - a.score || a.time_taken - b.time_taken)
                                        .map((sub, rIdx) => (
                                          <tr key={sub.id} style={{ backgroundColor: sub.student_id === userId ? 'var(--primary-light)' : 'transparent' }}>
                                            <td><span className="badge badge-primary">{rIdx + 1}</span></td>
                                            <td style={{ fontWeight: 600 }}>{sub.students?.name} {sub.student_id === userId && '(You)'}</td>
                                            <td>{sub.score} / {sub.total_questions}</td>
                                            <td>{Math.floor(sub.time_taken / 60)}m {sub.time_taken % 60}s</td>
                                          </tr>
                                        ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: View Students (Teacher Only) */}
      {role === 'teacher' && activeTab === 'students' && (
        <div className="card">
          <div className="flex justify-between align-center mb-6">
            <h3>Students enrolled in this batch</h3>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAddStudentModal(true)}>
              <Plus size={16} /> Enroll Students
            </button>
          </div>

          {enrolledStudents.length === 0 ? (
            <p className="text-secondary text-center p-8">No students are currently enrolled in this batch.</p>
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Photo</th>
                    <th>Name</th>
                    <th>Class</th>
                    <th>Institution</th>
                    <th>Email</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {enrolledStudents.map(student => (
                    <tr key={student.id}>
                      <td>
                        <img src={getAvatarUrl(student.photo_url, student.gender, student.id)} alt="" className="avatar avatar-sm" />
                      </td>
                      <td style={{ fontWeight: 600 }}>{student.name}</td>
                      <td><span className="badge badge-primary">{student.class}</span></td>
                      <td>{student.institution}</td>
                      <td>{student.email}</td>
                      <td>
                        <button className="btn btn-danger btn-sm" onClick={() => handleUnenrollStudent(student.id)}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: Overall Leaderboard Ranking (Student Only) */}
      {role === 'student' && activeTab === 'ranking' && (
        <div className="card">
          <h3>Batch Leaderboard Ranking</h3>
          <p className="text-secondary mb-4">Cumulative scores across all completed exams in this batch.</p>

          {/* Podium for top 3 */}
          <RankingPodium leaderboard={getOverallLeaderboard()} userId={userId} />
          
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Student</th>
                  <th>Total Points</th>
                  <th>Exams Attended</th>
                </tr>
              </thead>
              <tbody>
                {getOverallLeaderboard().map((row, rIdx) => {
                  const medalBg = rIdx === 0 ? 'rgba(255,215,0,0.08)' : rIdx === 1 ? 'rgba(192,192,192,0.08)' : rIdx === 2 ? 'rgba(205,127,50,0.08)' : 'transparent';
                  const isMe = row.student.id === userId;
                  const isTop3 = rIdx < 3;
                  return (
                    <tr key={row.student.id} style={{ backgroundColor: isMe ? 'var(--primary-light)' : medalBg }}>
                      <td>
                        {isTop3
                          ? <Award size={18} style={{ color: rIdx === 0 ? '#ffd700' : rIdx === 1 ? '#c0c0c0' : '#cd7f32' }} />
                          : <span className="badge badge-primary">{rIdx + 1}</span>
                        }
                      </td>
                      <td style={{ fontWeight: 600 }}>
                        <div className="flex align-center gap-2">
                          <div style={{ position: 'relative', display: 'inline-flex' }}>
                            <img src={getAvatarUrl(row.student.photo_url, row.student.gender, row.student.id)} alt="" className="avatar avatar-sm"
                              style={{
                                border: rIdx === 0 ? '2px solid #ffd700' : rIdx === 1 ? '2px solid #c0c0c0' : rIdx === 2 ? '2px solid #cd7f32' : undefined,
                                boxShadow: rIdx < 3 ? `0 0 8px ${rIdx === 0 ? '#ffd70080' : rIdx === 1 ? '#c0c0c080' : '#cd7f3280'}` : undefined
                              }}
                            />
                          </div>
                          <span>{row.student.name} {isMe && '(You)'}</span>
                        </div>
                      </td>
                      <td style={{ fontWeight: 'bold' }}>{row.score} pts</td>
                      <td>{row.examsCount}</td>
                    </tr>
                  );
                })}
                {getOverallLeaderboard().length === 0 && (
                  <tr><td colSpan="4" className="text-center">No scores recorded in this batch.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Batch Friends (Student Only) */}
      {role === 'student' && activeTab === 'friends' && (
        <div className="card">
          <h3>Classroom Friends ({enrolledStudents.length})</h3>
          <p className="text-secondary mb-6">Classmates attending this batch with you.</p>

          <div className="grid grid-cols-4 gap-4">
            {enrolledStudents.map(student => (
              <div key={student.id} className="card text-center p-4 border border-color" style={{ backgroundColor: 'var(--bg-primary)' }}>
                <img
                  src={getAvatarUrl(student.photo_url, student.gender, student.id)}
                  alt=""
                  className="avatar avatar-lg mb-2"
                  style={{ margin: '0 auto', width: '64px', height: '64px', borderRadius: '50%', objectFit: 'cover' }}
                />
                <h4 style={{ margin: 0 }}>{student.name} {student.id === userId && '(You)'}</h4>
                <p className="text-secondary" style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>{student.institution}</p>
                <span className="badge badge-primary mt-2">{student.class}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB CONTENT: Course Instructor (Student Only) */}
      {role === 'student' && activeTab === 'instructor' && (
        <div className="card">
          <h3 style={{ marginBottom: '1.25rem' }}>Course Instructor</h3>
          {instructor ? (
            <div className="instructor-card" style={{ maxWidth: '560px' }}>
              <div className="instructor-card-header">
                <img
                  src={getAvatarUrl(instructor.photo_url, instructor.gender, instructor.id)}
                  alt=""
                  className="avatar avatar-lg"
                  style={{ border: '3px solid var(--primary)', boxShadow: 'var(--shadow-md)', width: '64px', height: '64px', borderRadius: '50%', objectFit: 'cover' }}
                />
                <div>
                  <h4 style={{ margin: 0 }}>{instructor.name || 'Teacher'}</h4>
                  <p className="text-secondary" style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
                    {instructor.institution || 'No institution listed'}
                  </p>
                  {instructor.subjects?.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {instructor.subjects.map(subj => (
                        <span key={subj} className="badge badge-primary" style={{ fontSize: '0.75rem' }}>{subj}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="instructor-meta-grid">
                <span>Email</span><span>{instructor.email || '—'}</span>
                <span>Phone</span><span>{instructor.phone || '—'}</span>
                <span>Degrees / Certs</span><span>{instructor.degrees || '—'}</span>
                <span>Experience</span><span>{instructor.experience ? `${instructor.experience} years` : '—'}</span>
              </div>
            </div>
          ) : (
            <div className="card empty-state">
              <GraduationCap size={40} />
              <p className="text-secondary">No instructor profile found for this batch.</p>
            </div>
          )}
        </div>
      )}

      {/* Enroll Student Modal (Teacher Only) */}
      {showAddStudentModal && (
        <div className="modal-overlay" onClick={() => setShowAddStudentModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Enroll Students to Batch</h3>
              <button className="btn btn-secondary" style={{ width: '32px', height: '32px', padding: 0 }} onClick={() => setShowAddStudentModal(false)}>&times;</button>
            </div>
            <div className="modal-body" style={{ maxHeight: '350px' }}>
              <p className="text-secondary mb-4">Showing approved students who are not currently in this batch.</p>
              
              <div className="flex flex-col gap-2">
                {approvedGlobalStudents
                  .filter(gs => !enrolledStudents.some(es => es.id === gs.id))
                  .map(student => (
                    <div key={student.id} className="flex justify-between align-center p-3 border border-color rounded" style={{ backgroundColor: 'var(--bg-primary)' }}>
                      <div className="flex align-center gap-2">
                        <img src={getAvatarUrl(student.photo_url, student.gender, student.id)} alt="" className="avatar avatar-sm" />
                        <div>
                          <div style={{ fontWeight: 600 }}>{student.name}</div>
                          <div className="text-secondary" style={{ fontSize: '0.75rem' }}>Class: {student.class} | {student.institution}</div>
                        </div>
                      </div>
                      <button className="btn btn-primary btn-sm" onClick={() => handleEnrollStudent(student.id)}>
                        Add
                      </button>
                    </div>
                  ))}
                {approvedGlobalStudents.filter(gs => !enrolledStudents.some(es => es.id === gs.id)).length === 0 && (
                  <p className="text-secondary text-center">No other approved students available to enroll.</p>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowAddStudentModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Student Detailed Performance Review Modal */}
      {selectedReviewExam && (() => {
        const reviewExamSubmissions = submissions.filter(sub => sub.exam_id === selectedReviewExam.id);
        const sortedReviewSubs = [...reviewExamSubmissions].sort((a, b) => b.score - a.score || a.time_taken - b.time_taken);
        const myRankInExam = sortedReviewSubs.findIndex(sub => sub.student_id === userId) + 1;
        return (
          <div className="modal-overlay" onClick={() => { setSelectedReviewExam(null); setReviewModalTab('review'); }}>
            <div className="modal-content glass" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px', width: '95%', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div className="modal-header">
                <div>
                  <h4 style={{ margin: 0 }}>{selectedReviewExam.name} — Review</h4>
                  {reviewSubmission ? (
                    <p className="text-secondary" style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
                      Score: <strong className="text-success">{reviewSubmission.score} / {selectedReviewExam.questions?.length}</strong> ({Math.round((reviewSubmission.score / selectedReviewExam.questions?.length) * 100)}%)
                      {myRankInExam > 0 && <span style={{ marginLeft: '12px' }}>🏅 Rank: <strong>#{myRankInExam}</strong> of {reviewExamSubmissions.length}</span>}
                      {reviewSubmission.warnings > 0 && <span className="text-danger" style={{ marginLeft: '12px' }}>⚠️ {reviewSubmission.warnings} Warnings</span>}
                      <span style={{ marginLeft: '12px' }}>⏱️ {Math.floor(reviewSubmission.time_taken / 60)}m {reviewSubmission.time_taken % 60}s</span>
                    </p>
                  ) : (
                    <p className="text-danger" style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>You did not attend this exam.</p>
                  )}
                </div>
                <button type="button" className="icon-btn" onClick={() => { setSelectedReviewExam(null); setReviewModalTab('review'); }} aria-label="Close">&times;</button>
              </div>

              {/* Modal sub-tabs — solid background so scrolled content never bleeds over */}
              <div
                className="tabs-nav"
                style={{
                  borderBottom: '1px solid var(--border-color)',
                  borderTop: '1px solid var(--border-color)',
                  padding: '0 1.5rem',
                  margin: 0,
                  flexShrink: 0,
                  backgroundColor: 'var(--bg-card)',
                  zIndex: 10,
                }}
              >
                <button
                  className={`tab-btn ${reviewModalTab === 'review' ? 'active' : ''}`}
                  style={{ padding: '0.65rem 1rem', fontSize: '0.9rem' }}
                  onClick={() => setReviewModalTab('review')}
                >
                  📋 Answer Review
                </button>
                <button
                  className={`tab-btn ${reviewModalTab === 'leaderboard' ? 'active' : ''}`}
                  style={{ padding: '0.65rem 1rem', fontSize: '0.9rem' }}
                  onClick={() => setReviewModalTab('leaderboard')}
                >
                  🏆 Exam Ranking ({reviewExamSubmissions.length})
                </button>
              </div>
              
              <div className="modal-body" style={{ overflowY: 'auto', padding: '1.5rem' }}>
                {/* Answer Review tab */}
                {reviewModalTab === 'review' && (
                  <>
                    {selectedReviewExam.questions?.map((q, qIdx) => {
                      const selectedIdx = reviewSubmission?.answers?.[qIdx];
                      const correctIdx = q.correctIndex;
                      
                      return (
                        <div key={qIdx} className="p-4 border border-color rounded mb-4" style={{ backgroundColor: 'var(--bg-primary)' }}>
                          <div className="mb-3">
                            <span className="badge badge-primary">Question {qIdx + 1}</span>
                            <div className="mcq-question-text mt-2" style={{ fontSize: '1.05rem', fontWeight: 600 }}>
                              <MathRenderer content={q.question} />
                            </div>
                          </div>
                          
                          <div className="mcq-options-grid mt-3">
                            {q.options.map((opt, oIdx) => {
                              const isSelected = selectedIdx === oIdx;
                              const isCorrect = correctIdx === oIdx;
                              
                              let borderStyle = '1px solid var(--border-color)';
                              let bgColor = 'transparent';
                              let textColor = 'var(--text-primary)';
                              let weight = 'normal';

                              if (isCorrect) {
                                borderStyle = '2px solid var(--success)';
                                bgColor = 'rgba(46, 213, 115, 0.1)';
                                textColor = 'var(--success)';
                                weight = 'bold';
                              } else if (isSelected && !isCorrect) {
                                borderStyle = '2px solid var(--danger)';
                                bgColor = 'rgba(255, 71, 87, 0.1)';
                                textColor = 'var(--danger)';
                                weight = 'bold';
                              }

                              return (
                                <div
                                  key={oIdx}
                                  className="mcq-option disabled"
                                  style={{
                                    padding: '0.75rem 1rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    borderRadius: 'var(--radius-sm)',
                                    border: borderStyle,
                                    backgroundColor: bgColor,
                                    color: textColor,
                                    fontWeight: weight,
                                    textAlign: 'left',
                                    width: '100%',
                                    fontSize: '0.95rem'
                                  }}
                                >
                                  <span style={{ fontWeight: 'bold' }}>{String.fromCharCode(65 + oIdx)}.</span>
                                  <MathRenderer content={opt} />
                                  {isCorrect && (
                                    <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--success)', fontWeight: 'bold' }}>✓ Correct</span>
                                  )}
                                  {isSelected && !isCorrect && (
                                    <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--danger)', fontWeight: 'bold' }}>✗ Your Choice</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}

                {/* Exam Leaderboard tab */}
                {reviewModalTab === 'leaderboard' && (
                  <div>
                    <p className="text-secondary mb-4" style={{ fontSize: '0.9rem' }}>
                      Ranking of all students who attended <strong>{selectedReviewExam.name}</strong>.
                    </p>
                    {sortedReviewSubs.length === 0 ? (
                      <p className="text-secondary text-center">No submissions recorded for this exam.</p>
                    ) : (
                      <div className="table-container">
                        <table className="data-table" style={{ fontSize: '0.9rem' }}>
                          <thead>
                            <tr>
                              <th>Rank</th>
                              <th>Student</th>
                              <th>Score</th>
                              <th>Time Taken</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sortedReviewSubs.map((sub, rIdx) => {
                              const isMe = sub.student_id === userId;
                              const medalBg = rIdx === 0 ? 'rgba(255,215,0,0.1)' : rIdx === 1 ? 'rgba(192,192,192,0.1)' : rIdx === 2 ? 'rgba(205,127,50,0.1)' : 'transparent';
                              const isTop3 = rIdx < 3;
                              return (
                                <tr key={sub.id} style={{ backgroundColor: isMe ? 'var(--primary-light)' : medalBg, fontWeight: isMe ? 700 : 'normal' }}>
                                  <td>
                                    {isTop3
                                      ? <Award size={18} style={{ color: rIdx === 0 ? '#ffd700' : rIdx === 1 ? '#c0c0c0' : '#cd7f32' }} />
                                      : <span className="badge badge-primary">{rIdx + 1}</span>
                                    }
                                  </td>
                                  <td>
                                    <div className="flex align-center gap-2">
                                      <img src={getAvatarUrl(sub.students?.photo_url, sub.students?.gender, sub.students?.id)} alt="" className="avatar avatar-sm" />
                                      <span>{sub.students?.name} {isMe && '(You)'}</span>
                                    </div>
                                  </td>
                                  <td style={{ fontWeight: 'bold', color: 'var(--success)' }}>{sub.score} / {sub.total_questions}</td>
                                  <td>{Math.floor(sub.time_taken / 60)}m {sub.time_taken % 60}s</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => { setSelectedReviewExam(null); setReviewModalTab('review'); }}>Close</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
