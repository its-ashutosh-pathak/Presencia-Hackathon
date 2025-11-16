import React, { useState, useEffect, useMemo } from 'react';
import { KccLogoSVG } from '/src/components/KccLogo.jsx';
import { db } from '/src/firebaseConfig.js';
import { 
  collection, getDocs, doc, writeBatch, 
  query, where, orderBy, updateDoc, getDoc, setDoc,
  increment, runTransaction, Timestamp
} from 'firebase/firestore';
import '/src/styles/TeacherDashboard.css'; // <-- Import our new CSS

// --- Reusable Notification Component ---
function Notification({ message, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div 
      className="notification-popup"
      style={{ 
        backgroundColor: message.type === 'success' ? '#10B981' : '#EF4444' 
      }}
    >
      {message.text}
    </div>
  );
}

// --- Date Helpers ---
const FAKE_TODAY = new Date(); // Use today's actual date
const FAKE_TODAY_ISO = FAKE_TODAY.toISOString().split('T')[0]; // e.g., 2025-11-15
const FAKE_TODAY_LABEL = FAKE_TODAY.toLocaleDateString('en-GB'); // e.g., 15/11/2025

// --- Utility Functions ---
const calculatePercentage = (attended, total) => {
  attended = attended || 0;
  total = total || 0;
  if (total === 0) return "N/A";
  return ((attended / total) * 100).toFixed(1) + "%";
};

// --- Main TeacherDashboard Component ---
function TeacherDashboard({ teacherProfile, onLogout }) {
  const primary = "#0B3D91";
  const accent = "#9B1B1B";
  
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState(null);
  
  // Data from Firestore
  const [mySubject, setMySubject] = useState(null);
  // Store students with their subject attendance summary attached
  const [students, setStudents] = useState([]); 
  const [corrections, setCorrections] = useState([]);

  // UI State
  const [selectedClassId, setSelectedClassId] = useState(teacherProfile.classIds?.[0] || "");
  const [showAttendanceBlock, setShowAttendanceBlock] = useState(true);
  
  const [lectureCount, setLectureCount] = useState(1); // For submitting multiple at once
  
  // State for "Mark Attendance" block
  const [dailyAttendance, setDailyAttendance] = useState([]); // { uid, name, roll, present }

  const [historyColumns, setHistoryColumns] = useState([]); // Replaces historyDates
  const [attendanceRecordMap, setAttendanceRecordMap] = useState(new Map());
  
  // Fetch subject name from profile
  useEffect(() => {
    const fetchSubject = async () => {
      if (teacherProfile.subjectId) {
        if (teacherProfile.subjectName) {
           setMySubject(teacherProfile.subjectName);
        } else {
          // Fallback
          const subjectDoc = await getDoc(doc(db, 'subjects', teacherProfile.subjectId));
          if(subjectDoc.exists()) {
            setMySubject(subjectDoc.data().name);
          } else {
            setMySubject("My Subject");
          }
        }
      }
    };
    fetchSubject();
  }, [teacherProfile]);


  // Fetch students, corrections, and history when selectedClassId changes
  useEffect(() => {
    if (!selectedClassId || !teacherProfile.subjectId) {
      setLoading(false);
      return;
    }

    const fetchStudents = async () => {
      setLoading(true);
      setStudents([]);
      setDailyAttendance([]);

      try {
        const subjectId = teacherProfile.subjectId;
        
        // 1. Fetch students in the selected class
        const studentsQuery = query(
          collection(db, 'users'),
          where('classId', '==', selectedClassId)
        );
        const studentsSnapshot = await getDocs(studentsQuery);
        
        let fetchedStudents = studentsSnapshot.docs
          .map(d => ({ uid: d.id, ...d.data() }))
          .filter(s => s.role && s.role.toLowerCase() === 'student'); 
        
        // --- NEW: Fetch attendance summary for each student ---
        const studentsWithSummaryPromises = fetchedStudents.map(async (student) => {
          const summaryRef = doc(db, 'users', student.uid, 'attendence', subjectId);
          const summarySnap = await getDoc(summaryRef);
          const summaryData = summarySnap.exists() ? summarySnap.data() : { attended: 0, total: 0 };
          
          return {
            ...student,
            roll: parseInt(student.roll, 10) || Infinity, // Convert roll to number for sorting
            subjectSummary: summaryData
          };
        });

        // Resolve all promises
        let studentsWithSummary = await Promise.all(studentsWithSummaryPromises);

        // --- FIX: Sort students by roll number ---
        studentsWithSummary.sort((a, b) => a.roll - b.roll);
        
        setStudents(studentsWithSummary);
        setDailyAttendance(
          studentsWithSummary.map(s => ({
            uid: s.uid,
            name: s.name,
            father: s.father,
            roll: s.roll,
            present: true 
          }))
        );

      } catch (err) {
        console.error("Error fetching students or summaries:", err);
        showNotification("Error loading student data.", 'error' );
      }
      setLoading(false);
    };

    const fetchCorrections = async () => {
      setCorrections([]); 
      try {
        // 2. Fetch corrections
        const correctionsQuery = query(
          collection(db, 'corrections'),
          where('subjectId', '==', teacherProfile.subjectId)
        );
        const correctionsSnapshot = await getDocs(correctionsQuery);
        let fetchedCorrections = correctionsSnapshot.docs
          .map(d => {
            const data = d.data();
            return {
              id: d.id,
              ...data,
              submittedAt: (data.submittedAt && typeof data.submittedAt.toDate === 'function') 
                            ? data.submittedAt.toDate() 
                            : new Date() 
            }
          })
          .filter(c => c.classId === selectedClassId); 

        fetchedCorrections.sort((a, b) => b.submittedAt - a.submittedAt); 
        setCorrections(fetchedCorrections);

      } catch (err) {
        console.error("Error fetching corrections:", err);
      }
    };

    const fetchHistory = async () => {
      setHistoryColumns([]);
      setAttendanceRecordMap(new Map());
      try {
        // 3. Fetch all attendance records
        const historyQuery = query(
          collection(db, 'attendanceRecords'),
          where('classId', '==', selectedClassId),
          where('subjectId', '==', teacherProfile.subjectId),
          orderBy('date', 'asc'), 
          orderBy('lectureNumber', 'asc') 
        );
        const historySnapshot = await getDocs(historyQuery);
        const records = historySnapshot.docs.map(d => d.data());

        const newColumns = [];
        const newRecordMap = new Map();
        
        records.forEach(rec => {
          const date = rec.date; // 'YYYY-MM-DD'
          const lectureNum = rec.lectureNumber || 1;
          const columnId = `${date}_L${lectureNum}`;
          
          if (!newColumns.find(c => c.id === columnId)) {
            newColumns.push({
              id: columnId,
              date: date,
              lecture: lectureNum,
              label: `${date.substring(8, 10)}/${date.substring(5, 7)} (L${lectureNum})`
            });
          }
          
          // Only store true/false for presentation status
          newRecordMap.set(rec.studentUid + columnId, rec.present);
        });
        
        setHistoryColumns(newColumns);
        setAttendanceRecordMap(newRecordMap);

      } catch (err) {
        console.error("Error fetching attendance history:", err);
      }
    };

    fetchStudents();
    fetchCorrections();
    fetchHistory();
  }, [selectedClassId, teacherProfile.subjectId]);

  const showNotification = (message, type = 'success') => {
    setNotification({ text: message, type });
  };

  const handleDailyAttendanceChange = (studentUid) => {
    setDailyAttendance(prev => {
      // Find the corresponding student in the sorted 'students' list and update its 'present' state
      const updatedDaily = prev.map(student =>
        student.uid === studentUid
          ? { ...student, present: !student.present }
          : student
      );
      return updatedDaily;
    });
  };
  
  // Re-sort the daily attendance list whenever the main students list changes (which is sorted by roll)
  useEffect(() => {
      if (students.length > 0 && dailyAttendance.length > 0) {
          // Create a map of existing daily attendance state for quick lookup
          const attendanceStateMap = new Map(dailyAttendance.map(d => [d.uid, d.present]));

          // Create the new, sorted daily attendance list
          const sortedDaily = students.map(s => ({
              uid: s.uid,
              name: s.name,
              father: s.father,
              roll: s.roll,
              // Restore the existing 'present' state, or default to true
              present: attendanceStateMap.get(s.uid) !== undefined ? attendanceStateMap.get(s.uid) : true
          }));
          setDailyAttendance(sortedDaily);
      }
  }, [students]);
  
  
  const handleSubmitAttendance = async () => {
    setLoading(true);
    const dateLabel = FAKE_TODAY_LABEL.substring(0, 5); // DD/MM
    const dateISO = FAKE_TODAY_ISO; // YYYY-MM-DD
    const subjectId = teacherProfile.subjectId;
    const numLecturesToSubmit = parseInt(lectureCount, 10) || 1;
    // Get the subject name that was fetched in the useEffect
    const subjectName = mySubject || 'Unknown Subject';

    try {
      // 1. Check existing lectures marked today to determine startLectureNum
      const q = query(
        collection(db, 'attendanceRecords'),
        where('classId', '==', selectedClassId),
        where('subjectId', '==', subjectId),
        where('date', '==', dateISO)
      );
      const snapshot = await getDocs(q);
      const records = snapshot.docs.map(d => d.data());
      const maxLectureNum = records.reduce((max, r) => Math.max(max, r.lectureNumber || 0), 0);
      const startLectureNum = maxLectureNum + 1;
      
      const batch = writeBatch(db);
      
      const newRecordMap = new Map(attendanceRecordMap);
      const newColumns = [...historyColumns];

      // 2. Loop through the number of lectures to submit
      for (let i = 0; i < numLecturesToSubmit; i++) {
        const currentLectureNum = startLectureNum + i;
        const columnId = `${dateISO}_L${currentLectureNum}`;

        // Update history columns for display
        if (!newColumns.find(c => c.id === columnId)) {
          newColumns.push({
            id: columnId,
            date: dateISO,
            lecture: currentLectureNum,
            label: `${dateISO.substring(8, 10)}/${dateISO.substring(5, 7)} (L${currentLectureNum})`
          });
        }
        
        // 3. Loop through students and mark attendance
        for (const student of dailyAttendance) {
          // --- 3a. Create individual attendance record ---
          const record = {
            studentUid: student.uid,
            classId: selectedClassId,
            subjectId: subjectId,
            date: dateISO,
            present: student.present,
            markedBy: teacherProfile.uid,
            lectureNumber: currentLectureNum 
          };
          const recordRef = doc(db, 'attendanceRecords', `${dateISO}_${subjectId}_${student.uid}_L${currentLectureNum}`);
          batch.set(recordRef, record); 

          newRecordMap.set(student.uid + columnId, student.present);

          // --- 3b. Update student's attendance summary document ---
          const summaryDocRef = doc(db, 'users', student.uid, 'attendence', subjectId);
          
          const updateData = {
            // CRITICAL FIX: Ensure subjectName is passed here
            subjectName: subjectName, 
            classId: selectedClassId,
            // Ensure the counts are initialized to 0 if this is the first lecture
            attended: increment(student.present ? 1 : 0),
            total: increment(1)
          };
          
          // Use SET with merge: true to ensure the subjectName and classId are set,
          // and the attended/total counts are correctly incremented.
          // This fixes the atomicity issue with increments on new documents.
          batch.set(summaryDocRef, updateData, { merge: true }); 
          
          // --- NEW: Update local student summary for immediate history update ---
          setStudents(prev => prev.map(s => {
              if (s.uid === student.uid) {
                  const newAttended = s.subjectSummary.attended + (student.present ? 1 : 0);
                  const newTotal = s.subjectSummary.total + 1;
                  return {
                      ...s,
                      subjectSummary: { 
                          attended: newAttended, 
                          total: newTotal,
                          subjectName: subjectName // Keep the name updated
                      }
                  };
              }
              return s;
          }));
        }
      }
      
      await batch.commit();
      
      showNotification(`Attendance for ${FAKE_TODAY_LABEL} (${numLecturesToSubmit} lectures) submitted!`, 'success');
      setShowAttendanceBlock(false); 
      
      setAttendanceRecordMap(newRecordMap);
      // Sort columns again to keep them in order
      setHistoryColumns(newColumns.sort((a, b) => a.id.localeCompare(b.id))); 
      setLectureCount(1); 

    } catch (err) {
      console.error("Error submitting attendance:", err);
      showNotification("Failed to submit attendance.", 'error');
    }
    setLoading(false);
  };

  const handleCorrectionStatus = async (correctionId, newStatus) => {
    setLoading(true);
    try {
      const correction = corrections.find(c => c.id === correctionId);
      if (!correction) {
        showNotification("Error: Could not find correction.", 'error');
        setLoading(false);
        return;
      }
      const correctionRef = doc(db, 'corrections', correctionId);
      
      if (newStatus === 'Rejected') {
        await updateDoc(correctionRef, {
          status: newStatus,
          statusUpdatedAt: Timestamp.now(), 
        });
        setCorrections(prev =>
          prev.map(c =>
            c.id === correctionId
              ? { ...c, status: newStatus, statusUpdatedAt: new Date() } 
              : c
          )
        );
        showNotification(`Correction Rejected.`, 'success');
        setLoading(false);
        return;
      }

      const lectureNum = correction.lectureNumber || 1;
      const recordRef = doc(db, 'attendanceRecords', `${correction.date}_${correction.subjectId}_${correction.studentUid}_L${lectureNum}`);
      const summaryDocRef = doc(db, 'users', correction.studentUid, 'attendence', correction.subjectId);

      const recordSnap = await getDoc(recordRef);
      
      if (!recordSnap.exists()) {
        showNotification("No lecture record found for that date and lecture number. Make sure the teacher marked attendance for that subject/date/lecture.", 'error');
        setLoading(false);
        return;
      }
      
      // We must only update if the student was previously marked absent
      if(recordSnap.data().present === true) {
        showNotification("Correction is unnecessary: Student was already marked Present.", 'error');
        setLoading(false);
        return;
      }

      await runTransaction(db, async (transaction) => {
        // 1. Update Correction status
        transaction.update(correctionRef, {
          status: newStatus,
          statusUpdatedAt: Timestamp.now(), 
        });
        
        // 2. Update Attendance Record to Present
        transaction.update(recordRef, {
          present: true,
          notes: `Approved correction by ${teacherProfile.name}`
        });
        
        // 3. Update Summary to increment attended count
        // Note: We don't touch 'total' since it was already counted.
        transaction.update(summaryDocRef, {
          attended: increment(1)
        });
      });
      
      setCorrections(prev =>
        prev.map(c =>
          c.id === correctionId
            ? { ...c, status: newStatus, statusUpdatedAt: new Date() }
            : c
        )
      );
      
      // Update local student list summary for immediate display update
      setStudents(prev => prev.map(s => {
          if (s.uid === correction.studentUid) {
              return {
                  ...s,
                  subjectSummary: { 
                      ...s.subjectSummary,
                      attended: (s.subjectSummary.attended || 0) + 1,
                  }
              };
          }
          return s;
      }));
      
      // Update attendance history map (P/A history table)
      setAttendanceRecordMap(prevMap => {
        const newMap = new Map(prevMap);
        const columnId = `${correction.date}_L${lectureNum}`;
        newMap.set(correction.studentUid + columnId, true); 
        return newMap;
      });
      
      showNotification("Correction Approved & Record Updated.", 'success');
      
    } catch (err) {
      console.error("Error updating correction:", err);
      showNotification("Failed to update status. Check console for details.", 'error');
    }
    setLoading(false);
  };


  return (
    <div className="dashboard-container">
      {loading && <div className="loading-backdrop">Loading...</div>}
      
      {notification && (
        <Notification message={notification} onClose={() => setNotification(null)} />
      )}
      
      <header className="dashboard-header" style={{ borderColor: primary }}>
        <div className="header-logo-group">
          <KccLogoSVG size={56} />
          <div>
            <h1 className="header-title" style={{ color: primary }}>
              Teacher Dashboard
            </h1>
            <p className="header-subtitle">
              <span style={{ fontWeight: 500 }}>{teacherProfile.name}</span> · {mySubject || 'Loading...'}
            </p>
          </div>
        </div>
        <button 
          className="logout-button" 
          style={{ background: accent }}
          onClick={onLogout}
        >
          Logout
        </button>
      </header>

      <section 
        className="content-card"
        style={{ borderColor: primary }}
      >
        <h2 className="card-title" style={{ color: primary }}>
          Select Class
        </h2>
        <div className="select-class-grid">
          <div>
            <label className="form-label" htmlFor="class-select">Class</label>
            <select
              id="class-select"
              className="form-select"
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
            >
              {teacherProfile.classIds?.length === 0 && <option>No classes assigned</option>}
              {teacherProfile.classIds?.map((cId) => <option key={cId} value={cId}>{cId}</option>)}
            </select>
          </div>

          <div className="subject-lock-text">
            <span>
              Subject locked: <span style={{ fontWeight: 500 }}>{mySubject || '...'}</span>
            </span>
          </div>
        </div>
      </section>

      <section 
        className="content-card"
        style={{ borderColor: primary }}
      >
        <div className="toggle-header">
          <h2 className="card-title" style={{ color: primary, marginBottom: 0 }}>
            Mark Attendance — {mySubject} · {selectedClassId}
          </h2>
          <button
            onClick={() => setShowAttendanceBlock(!showAttendanceBlock)}
            className="toggle-button"
            style={{ color: primary }}
            aria-expanded={showAttendanceBlock}
          >
            {showAttendanceBlock ? '▼ Hide' : '▲ Show'}
          </button>
        </div>
        
        {showAttendanceBlock && (
          <div className="attendance-block">
            <div className="attendance-info-bar">
              <div className="info-item">
                <label className="info-label">Date</label>
                <div className="info-value">
                  {FAKE_TODAY_LABEL}
                </div>
              </div>
              <div className="info-item">
                <label className="info-label" htmlFor="lecture-count">Number of Lectures</label>
                <select
                  id="lecture-count"
                  className="form-select"
                  value={lectureCount}
                  onChange={(e) => setLectureCount(parseInt(e.target.value, 10))}
                >
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                </select>
              </div>
            </div>
            
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Roll No.</th>
                    <th>Student Name</th>
                    <th>Father's Name</th>
                    <th style={{ textAlign: 'center' }}>Present</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyAttendance.length === 0 && (
                     <tr>
                       <td colSpan="4" className="table-empty-text">
                         No students found for this class.
                       </td>
                     </tr>
                  )}
                  {/* --- FIX: Display students from the sorted dailyAttendance state --- */}
                  {dailyAttendance.map((entry) => (
                    <tr key={entry.uid}>
                      <td>{entry.roll}</td>
                      <td>{entry.name}</td>
                      <td>{entry.father}</td>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          className="attendance-checkbox"
                          checked={entry.present}
                          onChange={() => handleDailyAttendanceChange(entry.uid)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="submit-attendance-container">
              <button 
                onClick={handleSubmitAttendance}
                className="form-button"
                style={{ background: primary }}
                disabled={dailyAttendance.length === 0}
              >
                Submit Attendance for {FAKE_TODAY_LABEL}
              </button>
            </div>
          </div>
        )}
      </section>
      
      {/* --- ATTENDANCE HISTORY SECTION --- */}
      <section 
        className="content-card"
        style={{ borderColor: primary }}
      >
        <h2 className="card-title" style={{ color: primary }}>
          Attendance History
        </h2>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Roll No.</th>
                <th>Name</th>
                {historyColumns.map(col => (
                  <th key={col.id} style={{ textAlign: 'center' }} title={col.date}>
                    {col.label}
                  </th>
                ))}
                {/* --- NEW COLUMN: Subject Percentage --- */}
                <th style={{ textAlign: 'center' }}>Subject %</th> 
              </tr>
            </thead>
            <tbody>
              {students.length === 0 && (
                <tr>
                  <td colSpan={3 + historyColumns.length} className="table-empty-text">
                    No students to display.
                  </td>
                </tr>
              )}
              {/* --- Students list is now sorted by roll number --- */}
              {students.map(student => {
                const summary = student.subjectSummary;
                const percent = calculatePercentage(summary.attended, summary.total);
                const isBelow75 = summary.total > 0 && parseFloat(percent) < 75;

                return (
                  <tr key={student.uid}>
                    <td>{student.roll}</td>
                    <td>{student.name}</td>
                    {historyColumns.map(col => {
                      const key = student.uid + col.id;
                      // Check the map for true/false status
                      const isPresent = attendanceRecordMap.get(key); 
                      const status = isPresent === true ? 'P' : isPresent === false ? 'A' : '-';
                      const statusClass = isPresent === true ? 'status-present' : isPresent === false ? 'status-absent' : 'status-null';
                      return (
                        <td key={col.id} style={{ textAlign: 'center' }}>
                          <span className={`status-badge-round ${statusClass}`}>
                            {status}
                          </span>
                        </td>
                      );
                    })}
                    {/* --- Display Percentage --- */}
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ 
                        fontWeight: 'bold', 
                        color: isBelow75 ? accent : primary 
                      }}>
                        {percent}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section 
        className="content-card"
        style={{ borderColor: primary }}
      >
        <h2 className="card-title" style={{ color: primary }}>
          Attendance Corrections
        </h2>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Roll</th>
                <th>Name</th>
                <th>Date (YYYY-MM-DD)</th>
                <th>Lecture</th>
                <th>Reason</th>
                <th>Proof</th>
                <th>Status</th>
                <th style={{ textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {corrections.length === 0 && (
                <tr>
                  <td colSpan="8" className="table-empty-text">
                    No correction requests found for this class and subject.
                  </td>
                </tr>
              )}
              {corrections.map((r) => (
                <tr key={r.id}>
                  <td>{r.roll}</td>
                  <td>{r.name}</td>
                  <td>{r.date}</td>
                  <td>L{r.lectureNumber || 1}</td>
                  <td>{r.reason}</td>
                  <td>{r.proof || '-'}</td>
                  <td>
                    <span className={`status-badge status-${r.status.toLowerCase()}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="action-cell">
                    <button
                      onClick={() => handleCorrectionStatus(r.id, "Approved")}
                      disabled={r.status !== "Pending"}
                      className="form-button action-button"
                      style={{ background: primary }}
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => handleCorrectionStatus(r.id, "Rejected")}
                      disabled={r.status !== "Pending"}
                      className="form-button action-button"
                      style={{ background: accent }}
                    >
                      Reject
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default TeacherDashboard;