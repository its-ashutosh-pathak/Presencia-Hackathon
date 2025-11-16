import React, { useState, useEffect } from 'react';
import { KccLogoSVG } from '/src/components/KccLogo.jsx';
import { db } from '/src/firebaseConfig.js';
import { collection, getDocs, addDoc, query, where, Timestamp, onSnapshot, doc, getDoc } from 'firebase/firestore'; // <-- Added doc, getDoc
import '/src/styles/StudentDashboard.css'; // <-- Import our new CSS

// Helper functions to get date strings
const getTodayDateString = () => {
  const today = new Date();
  return today.toISOString().split('T')[0]; // YYYY-MM-DD
};

const getYesterdayDateString = () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday.toISOString().split('T')[0]; // YYYY-MM-DD
};


function StudentDashboard({ studentProfile, onLogout }) {
  const primary = "#0B3D91";
  const accent = "#9B1B1B";
  const [loading, setLoading] = useState(true);

  const [attendanceData, setAttendanceData] = useState([]);
  const [corrections, setCorrections] = useState([]);
  // --- NEW: Store Subject-Faculty map ---
  const [subjectFacultyMap, setSubjectFacultyMap] = useState({});
  // --- NEW: Store Subject Name Fallback map ---
  const [subjectNameFallback, setSubjectNameFallback] = useState({});
  
  // State for the correction form
  const [proofFile, setProofFile] = useState(null);
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedDate, setSelectedDate] = useState(getTodayDateString());
  const [selectedReason, setSelectedReason] = useState("Present but marked absent");
  // --- FIX: Add lecture number state ---
  const [lectureNumber, setLectureNumber] = useState(1);
  const [notes, setNotes] = useState("");
  const [submitMessage, setSubmitMessage] = useState(null);

  // Date picker limits
  const maxDate = getTodayDateString();
  const minDate = getYesterdayDateString();

  // --- Data Calculation ---
  const calcPercent = (a, t) => (t && t > 0 ? ((a / t) * 100).toFixed(1) : "0.0");
  const calcTo75 = (a, t) => {
    if (!t || t === 0 || a / t >= 0.75) return 0;
    let x = 0;
    while ((a + x) / (t + x) < 0.75) x++;
    return x;
  };
  const calcCanSkip = (a, t) => {
    if (!t || t === 0 || a / t < 0.75) return 0;
    let y = 0;
    while (a / (t + y) >= 0.75) y++;
    return Math.max(0, y - 1);
  };

  // --- FIX: Add defensive check for NaN/null values from Firestore ---
  const totalAttended = attendanceData.reduce((s, x) => s + (x.attended || 0), 0);
  const totalClasses = attendanceData.reduce((s, x) => s + (x.total || 0), 0);
  
  const overallPercent = calcPercent(totalAttended, totalClasses);
  const overallTo75 = calcTo75(totalAttended, totalClasses);
  const overallCanSkip = calcCanSkip(totalAttended, totalClasses);

  // --- Data Fetching ---
  useEffect(() => {
    if (!studentProfile?.uid) {
      return; 
    }
    
    setLoading(true);

    // 1. Fetch Subject-Faculty Mapping
    const fetchFacultyData = async () => {
      try {
        const teachersQuery = query(
          collection(db, 'users'),
          where('role', '==', 'teacher'),
          where('classIds', 'array-contains', studentProfile.classId)
        );
        const teachersSnapshot = await getDocs(teachersQuery);
        const map = {};
        teachersSnapshot.docs.forEach(doc => {
          const data = doc.data();
          // Map subjectId to the teacher's name
          if (data.subjectId && data.name) {
            map[data.subjectId] = data.name;
          }
        });
        setSubjectFacultyMap(map);
      } catch (err) {
        console.error("Error fetching faculty data:", err);
      }
    };

    // 2. REAL-TIME listener for attendance summary
    const attendanceQuery = collection(db, 'users', studentProfile.uid, 'attendence');
    const unsubscribeAttendance = onSnapshot(attendanceQuery, async (snapshot) => {
      const fetchedAttendance = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setAttendanceData(fetchedAttendance);

      if (fetchedAttendance.length > 0 && !selectedSubject) {
        setSelectedSubject(fetchedAttendance[0].id); 
      }
      setLoading(false); 

      // --- NEW FALLBACK LOGIC: Check for missing subject names ---
      const missingSubjectIds = fetchedAttendance
        .filter(item => !item.subjectName)
        .map(item => item.id);
      
      if (missingSubjectIds.length > 0) {
        const fallbackNames = {};
        // Fetch names from master 'subjects' collection
        for (const subjectId of missingSubjectIds) {
          try {
            const subjectDoc = await getDoc(doc(db, 'subjects', subjectId));
            if (subjectDoc.exists()) {
              fallbackNames[subjectId] = subjectDoc.data().name;
            } else {
              fallbackNames[subjectId] = "Subject Not Found";
            }
          } catch (e) {
            console.error(`Error fetching master subject ${subjectId}:`, e);
          }
        }
        setSubjectNameFallback(prev => ({ ...prev, ...fallbackNames }));
      }
      // --- END NEW FALLBACK LOGIC ---

    }, (err) => {
      console.error("Error fetching student attendance:", err);
      setLoading(false);
    });

    // 3. REAL-TIME listener for corrections
    const correctionsQuery = query(
      collection(db, 'corrections'),
      where('studentUid', '==', studentProfile.uid)
    );
    const unsubscribeCorrections = onSnapshot(correctionsQuery, (snapshot) => {
      let fetchedCorrections = snapshot.docs.map(doc => {
        const data = doc.data();
        // --- FIX: Create pivotDate on the object here ---
        const submittedAt = (data.submittedAt && typeof data.submittedAt.toDate === 'function') 
                          ? data.submittedAt.toDate() 
                          : new Date();
        const statusUpdatedAt = (data.statusUpdatedAt && typeof data.statusUpdatedAt.toDate === 'function')
                            ? data.statusUpdatedAt.toDate()
                            : null;
        return {
          id: doc.id,
          ...data,
          submittedAt: submittedAt,
          statusUpdatedAt: statusUpdatedAt,
          pivotDate: statusUpdatedAt ? statusUpdatedAt : submittedAt
        }
      });
      
      // Sort by the pivotDate (newest first)
      fetchedCorrections.sort((a, b) => b.pivotDate - a.pivotDate);
      
      // --- FIX: Filter for 3-day rule (applies to ALL requests) ---
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      const visibleCorrections = fetchedCorrections.filter(r => {
        // Now we can safely filter by r.pivotDate
        return r.pivotDate > threeDaysAgo;
      });
      
      setCorrections(visibleCorrections);
    }, (err) => {
      console.error("Error fetching corrections:", err);
    });
    
    // Run initial faculty fetch and clean up listeners on unmount
    fetchFacultyData();
    return () => {
      unsubscribeAttendance();
      unsubscribeCorrections();
    };

  }, [studentProfile]); 


  // --- Form Handling ---
  function showMessage(msg, type = 'error') {
    setSubmitMessage({ msg, type });
    setTimeout(() => setSubmitMessage(null), 3000);
  }

  function validateForm() {
    if (!selectedSubject) return "Please choose a subject.";
    if (!selectedDate) return "Please pick a date.";
    const d = new Date(selectedDate);
    const now = new Date();
    d.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);
    if (d > now) return "Date cannot be in the future.";
    return null;
  }

  async function submitRequest(e) {
    e.preventDefault();
    const err = validateForm();
    if (err) {
      showMessage(err, 'error');
      return;
    }

    try {
      const subjectObj = attendanceData.find(s => s.id === selectedSubject);
      
      const newReq = {
        studentUid: studentProfile.uid,
        roll: studentProfile.roll,
        name: studentProfile.name,
        father: studentProfile.father,
        classId: studentProfile.classId, 
        subjectId: selectedSubject,
        // Use subjectName from the attendance data (which might have been filled by fallback)
        subjectName: subjectObj?.subjectName || subjectNameFallback[selectedSubject] || "Unknown Subject",
        date: selectedDate, 
        reason: selectedReason,
        lectureNumber: parseInt(lectureNumber, 10) || 1, // --- FIX: Save lecture number ---
        notes: notes || "",
        proof: proofFile?.name || null, 
        status: "Pending",
        submittedAt: Timestamp.now(), 
        statusUpdatedAt: Timestamp.now(), // Add this for 3-day rule
      };

      await addDoc(collection(db, 'corrections'), newReq);

      // Reset form & show success
      setSelectedDate(getTodayDateString());
      setSelectedReason("Present but marked absent");
      setLectureNumber(1);
      setNotes("");
      setProofFile(null);
      showMessage("Correction request submitted.", 'success');
      
    } catch (err) {
      console.error("Error submitting correction:", err);
      showMessage("Failed to submit request.", 'error');
    }
  }
  
  // --- Render ---
  
  if (loading && !attendanceData.length) {
    return <div className="loading-backdrop">Loading Student Dashboard...</div>;
  }

  if (!studentProfile) {
    return <div className="loading-backdrop">Loading...</div>;
  }

  return (
    <div className="dashboard-container">
      
      {submitMessage && (
        <div 
          className="notification-popup"
          style={{ background: submitMessage.type === 'success' ? '#10B981' : '#EF4444' }}
        >
          {submitMessage.msg}
        </div>
      )}

      <header
        className="dashboard-header"
        style={{ borderColor: primary }}
      >
        <div className="header-logo-group">
          <KccLogoSVG size={56} />
          <div>
            <h1 className="header-title" style={{ color: primary }}>Presencia Dashboard</h1>
            <p className="header-subtitle">Student Attendance Overview</p>
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

      <div
        className="content-card"
        style={{ borderColor: primary }}
      >
        <h2 className="card-title" style={{ color: primary }}>Student Details</h2>
        <div className="details-grid">
          <div><strong>Name:</strong> {studentProfile.name}</div>
          <div><strong>Father's Name:</strong> {studentProfile.father}</div>
          <div><strong>Roll No.:</strong> {studentProfile.roll}</div>
          <div><strong>Course:</strong> {studentProfile.course}</div>
          <div><strong>Year:</strong> {studentProfile.year}</div>
          <div><strong>Section:</strong> {studentProfile.section}</div>
        </div>
      </div>

      <div className="stats-grid">
        {attendanceData.map((item) => {
          // --- Data points ---
          const attended = item.attended || 0;
          const total = item.total || 0;
          const subjectCode = item.id; // BAS-105

          // --- Display Name Logic ---
          // 1. Try to get the name from the Firestore summary document (item.subjectName)
          // 2. Fallback to the subjectNameFallback map (fetched from master 'subjects' collection)
          const subjectDisplayName = item.subjectName || subjectNameFallback[subjectCode] || "Unknown Subject";
          
          // --- Other calculations ---
          const percent = parseFloat(calcPercent(attended, total));
          const to75 = calcTo75(attended, total);
          const canSkip = calcCanSkip(attended, total);
          
          // --- Faculty name ---
          const facultyName = subjectFacultyMap[subjectCode] || 'N/A';

          return (
            <div key={item.id} className="stat-card" style={{ borderColor: primary }}>
              <h2 className="stat-card-title">
                {subjectDisplayName} ({subjectCode})
              </h2>
              <p className="stat-card-faculty">
                Faculty: {facultyName}
              </p>
              <p className="stat-card-numbers">{attended} / {total} classes attended</p>
              <div className="mt-3">
                <div className="stat-card-progress-bar">
                  <div className="progress-bar-inner" style={{ width: `${percent}%`, background: percent < 75 ? accent : primary }} />
                </div>
                <p className="stat-card-percent-text">Attendance: <span style={{ color: percent < 75 ? accent : primary }}>{percent}%</span></p>
                <p className="stat-card-meta-text">Need +{to75} classes for 75% | Can skip {canSkip >= 0 ? canSkip : 0}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div
        className="content-card summary-card"
        style={{ borderColor: primary }}
      >
        <div className="summary-details">
          <h2 className="card-title" style={{ color: primary }}>Overall Summary</h2>
          <div className="summary-grid">
            <div><strong>Total Attended:</strong> {totalAttended}</div>
            <div><strong>Total Classes:</strong> {totalClasses}</div>
            {/* --- FIX: Use 0 for display if NaN is possible, though fixes above should prevent it --- */}
            <div><strong>Percentage:</strong> <span style={{ color: overallPercent < 75 ? accent : primary }}>{overallPercent}%</span></div>
            <div><strong>Need for 75%:</strong> +{overallTo75}</div>
            <div><strong>Can Skip:</strong> {overallCanSkip >= 0 ? overallCanSkip : 0}</div>
          </div>
        </div>

        <div className="summary-donut-chart">
          <svg width="140" height="140" viewBox="0 0 140 140">
            <circle cx="70" cy="70" r="60" stroke="#E5E7EB" strokeWidth="10" fill="none" />
            <circle
              cx="70"
              cy="70"
              r="60"
              stroke={overallPercent < 75 ? accent : primary}
              strokeWidth="10"
              fill="none"
              strokeDasharray={`${(parseFloat(overallPercent) / 100) * 377} 377`}
              strokeLinecap="round"
              transform="rotate(-90 70 70)"
            />
            <text x="70" y="78" textAnchor="middle" fontSize="22" fill="#111827" fontWeight="bold">
              {overallPercent}%
            </text>
          </svg>
        </div>
      </div>

      <div
        className="content-card"
        style={{ borderColor: primary }}
      >
        <h2 className="card-title" style={{ color: primary }}>Raise Attendance Correction</h2>
        <form className="correction-form-grid" onSubmit={submitRequest}>
          <div className="form-group">
            <label className="form-label">Subject</label>
            <select
              className="form-select"
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
            >
              <option value="">Select Subject</option>
              {attendanceData.map((s) => {
                const subjectDisplayName = s.subjectName || subjectNameFallback[s.id] || "Unknown Subject";
                return (
                  <option key={s.id} value={s.id}>
                    {subjectDisplayName} ({s.id})
                  </option>
                );
              })}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Date</label>
            <input
              type="date"
              className="form-input"
              value={selectedDate}
              min={minDate}
              max={maxDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Reason</label>
            <select
              className="form-select"
              value={selectedReason}
              onChange={(e) => setSelectedReason(e.target.value)}
            >
              <option>Present but marked absent</option>
              <option>Entered late but attended</option>
              <option>Technical marking issue</option>
              <option>Participating in other college activity</option>
            </select>
          </div>
          
          {/* --- FIX: Add Lecture Number to student form --- */}
          <div className="form-group">
            <label className="form-label" htmlFor="lecture-number-student">Lecture Number</label>
            <select
              id="lecture-number-student"
              className="form-select"
              value={lectureNumber}
              onChange={(e) => setLectureNumber(parseInt(e.target.value, 10))}
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
            </select>
          </div>

          <div className="form-group form-span-3">
            <label className="form-label">Additional Notes (optional)</label>
            <textarea
              rows="2"
              className="form-input"
              placeholder="Provide brief details..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="form-group form-span-3">
            <label className="form-label">Upload Proof (optional)</label>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,application/pdf,image/jpeg,image/jpg"
              onChange={(e) => setProofFile(e.target.files[0])}
              className="form-input-file"
            />
            <p className="form-input-hint">Accepted: PDF, JPG. We are only storing the file name for this demo.</p>
          </div>

          <div className="form-group form-span-3 form-submit-container">
            <button type="submit" className="form-button" style={{ background: primary }}>Submit Request</button>
          </div>
        </form>
      </div>

      <div
        className="content-card"
        style={{ borderColor: primary }}
      >
        <h2 className="card-title" style={{ color: primary }}>My Correction Requests</h2>
        {corrections.length === 0 ? (
          <p className="table-empty-text">No active requests found.</p>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Subject</th>
                  {/* --- FIX: Show lecture number --- */}
                  <th>Lecture</th>
                  <th>Reason</th>
                  <th>Proof</th>
                  <th>Status</th>
                  <th>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {corrections.map((r) => (
                  <tr key={r.id}>
                    <td>{r.date}</td>
                    <td>{r.subjectName}</td>
                    <td>L{r.lectureNumber || 1}</td>
                    <td>{r.reason}</td>
                    <td>{r.proof || '-'}</td>
                    <td>
                      <span className={`status-badge ${
                        r.status === 'Pending' ? 'status-pending' :
                        r.status === 'Approved' ? 'status-approved' : 'status-rejected'
                      }`}>
                        {r.status}
                      </span>
                    </td>
                    {/* --- FIX: Use pivotDate here --- */}
                    <td>{r.pivotDate.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default StudentDashboard;