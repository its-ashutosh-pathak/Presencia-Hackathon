import React, { useState, useMemo, useEffect } from 'react';
import { KccLogoSVG } from '/src/components/KccLogo.jsx';
import { db, auth } from '/src/firebaseConfig.js';
import { 
  collection, getDocs, doc, getDoc, 
  setDoc, deleteDoc, updateDoc,
  query, where, orderBy, Timestamp
} from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth'; // For creating new users
import '/src/styles/AdminDashboard.css'; // <-- Import our new CSS

// Helper function
const hashString = (s) => {
  let h = 0;
  if (!s) return h;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
};

// --- Utility function for CSV Export ---
const exportToCsv = (data, filename) => {
    if (!data || data.length === 0) {
        alert("No data to export.");
        return;
    }

    const header = Object.keys(data[0]);
    const csvContent = [
        header.join(','),
        ...data.map(row => header.map(fieldName => JSON.stringify(row[fieldName])).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
};

// --- Attendance Calculation Utility ---
const calculatePercentage = (attended, total) => {
    attended = attended || 0;
    total = total || 0;
    if (total === 0) return "N/A";
    return ((attended / total) * 100).toFixed(1);
};


function AdminDashboard({ adminProfile, onLogout }) {
  const primary = "#0B3D91"; // KCC Blue
  const accent = "#9B1B1B"; // KCC Red

  const TABS = ["Overview", "Users", "Corrections"];
  const [tab, setTab] = useState("Overview");
  const [loading, setLoading] = useState(true);

  // App-wide data
  const [appConfig, setAppConfig] = useState({ courses: [], years: [], sections: [] });
  const [allUsers, setAllUsers] = useState([]);
  const [allSubjects, setAllSubjects] = useState([]);
  const [allCorrections, setAllCorrections] = useState([]);
  
  // --- NEW: Overview Data State ---
  const [overviewAttendanceData, setOverviewAttendanceData] = useState([]); // Students with embedded attendance data
  const [allClassSubjects, setAllClassSubjects] = useState([]); // List of all subject IDs/Names in the class

  // UI State
  const [visibleSections, setVisibleSections] = useState({ admin: true, teacher: true, student: true });
  
  // Overview Tab State (Filters)
  const [viewCourse, setViewCourse] = useState("");
  const [viewYear, setViewYear] = useState("");
  const [viewSection, setViewSection] = useState("");
  const currentClassId = `${viewCourse}-${viewYear}-${viewSection}`;

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newUser, setNewUser] = useState({
    role: 'student',
    name: '',
    email: '',
    // --- FIX: Add UID field for manual entry ---
    uid: '', 
    father: '',
    subjectId: '',
    classIds: [],
    course: '',
    year: '',
    section: '',
    roll: '',
    contact: ''
  });

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  // Filter State
  const [studentFilter, setStudentFilter] = useState({ course: 'All', year: 'All', section: 'All' });

  // Memoized derived data
  const allClassIds = useMemo(() => {
    const ids = [];
    if (appConfig.courses && appConfig.years && appConfig.sections) {
      for (const course of appConfig.courses) {
        for (const year of appConfig.years) {
          for (const section of appConfig.sections) {
            ids.push(`${course}-${year}-${section}`);
          }
        }
      }
    }
    return ids;
  }, [appConfig]);

  // --- Data Fetching ---
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch Config
        const configDoc = await getDoc(doc(db, 'config', 'appData'));
        const config = { courses: [], years: [], sections: [] };
        if (configDoc.exists()) {
          const data = configDoc.data();
          // DEFENSIVE CHECK: Make sure fields exist and are arrays
          config.courses = Array.isArray(data.courses) ? data.courses : (Array.isArray(data.corses) ? data.corses : []);
          config.years = Array.isArray(data.years) ? data.years : [];
          config.sections = Array.isArray(data.sections) ? data.sections : (Array.isArray(data.Sections) ? data.Sections : []);
          
          setAppConfig(config);
          
          // Set initial filter defaults once config is loaded
          if (config.courses.length > 0) {
             setViewCourse(config.courses[0]);
             setNewUser(u => ({...u, course: config.courses[0] }));
          }
          if (config.years.length > 0) {
             setViewYear(config.years[0]);
             setNewUser(u => ({...u, year: config.years[0] }));
          }
          if (config.sections.length > 0) {
             setViewSection(config.sections[0]);
             setNewUser(u => ({...u, section: config.sections[0] }));
          }
        }

        // Fetch All Users
        const usersSnap = await getDocs(collection(db, 'users'));
        // --- FIX: Convert all roles to lowercase on fetch ---
        setAllUsers(usersSnap.docs.map(d => {
          const data = d.data();
          if (data.role) {
            data.role = data.role.toLowerCase();
          }
          return { id: d.id, ...data };
        }));

        // Fetch All Subjects
        const subjectsSnap = await getDocs(collection(db, 'subjects'));
        const subjects = subjectsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setAllSubjects(subjects);
        if (subjects.length > 0) {
          setNewUser(u => ({...u, subjectId: subjects[0].id }));
        }

        // Fetch All Corrections
        const correctionsSnap = await getDocs(query(collection(db, 'corrections'), orderBy('submittedAt', 'desc')));
        // --- FIX: Convert Timestamps to JS Dates to prevent crash ---
        setAllCorrections(correctionsSnap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
            submittedAt: (data.submittedAt && data.submittedAt.toDate) 
                            ? data.submittedAt.toDate() 
                            : new Date(),
            statusUpdatedAt: (data.statusUpdatedAt && data.statusUpdatedAt.toDate)
                            ? data.statusUpdatedAt.toDate()
                            : null
          }
        }));
        
      } catch (err) {
        console.error("Error fetching admin data:", err);
      }
      setLoading(false);
    };
    fetchData();
  }, []);

  // --- NEW: Function to Fetch Overview Attendance Data ---
  useEffect(() => {
    const fetchOverviewData = async () => {
        if (!viewCourse || !viewYear || !viewSection) return;
        setLoading(true);
        setOverviewAttendanceData([]);
        setAllClassSubjects([]);

        const classId = `${viewCourse}-${viewYear}-${viewSection}`;

        try {
            // 1. Get all students in this class
            const studentsInClass = allUsers
                .filter(u => u.role === 'student' && u.classId === classId)
                // --- FIX: Sort students by roll number before fetching summaries ---
                .sort((a, b) => (parseInt(a.roll, 10) || Infinity) - (parseInt(b.roll, 10) || Infinity));

            if (studentsInClass.length === 0) {
                setLoading(false);
                return;
            }

            // 2. Map all students' attendance summaries
            const allSubjectSummaries = [];
            
            const studentDataPromises = studentsInClass.map(async (student) => {
                const attendanceSnap = await getDocs(collection(db, 'users', student.id, 'attendence'));
                
                const studentSubjects = {};
                let totalAttended = 0;
                let totalClasses = 0;
                
                attendanceSnap.docs.forEach(doc => {
                    const data = doc.data();
                    const subjectId = doc.id;
                    const attended = data.attended || 0;
                    const total = data.total || 0;
                    const subjectName = data.subjectName || subjectId; 
                    
                    // Store for the student row
                    studentSubjects[subjectId] = { attended, total, name: subjectName };
                    
                    // Aggregate for overall calculation
                    totalAttended += attended;
                    totalClasses += total;

                    // Add to global list of class subjects (to define columns)
                    if (!allSubjectSummaries.find(s => s.id === subjectId)) {
                        allSubjectSummaries.push({ id: subjectId, name: subjectName });
                    }
                });

                const overallPercent = calculatePercentage(totalAttended, totalClasses);
                
                return {
                    ...student,
                    subjectAttendance: studentSubjects,
                    overallPercent: overallPercent,
                    totalAttended,
                    totalClasses,
                };
            });

            const updatedStudents = await Promise.all(studentDataPromises);
            
            // 3. Deduplicate and set the list of columns
            const uniqueSubjects = Array.from(new Set(allSubjectSummaries.map(s => s.id)))
                .map(id => allSubjectSummaries.find(s => s.id === id))
                // --- OPTIONAL: Sort subjects alphabetically by name for cleaner table ---
                .sort((a, b) => a.name.localeCompare(b.name));

            setAllClassSubjects(uniqueSubjects);
            setOverviewAttendanceData(updatedStudents);

        } catch (err) {
            console.error("Error fetching class overview data:", err);
        }
        setLoading(false);
    };

    if (tab === "Overview" && allUsers.length > 0) {
        fetchOverviewData();
    }
  }, [viewCourse, viewYear, viewSection, tab, allUsers]); 
  // --- END NEW: Function to Fetch Overview Attendance Data ---


  const pendingCount = allCorrections.filter(c => c.status === "Pending").length;
  
  // --- Event Handlers ---

  function handleCorrectionDecision(id, status) {
    const correctionRef = doc(db, 'corrections', id);
    const updateTime = Timestamp.now(); // Get Firebase Timestamp
    
    updateDoc(correctionRef, {
      status: status,
      statusUpdatedAt: updateTime
    }).then(() => {
      setAllCorrections(prev => 
        // --- FIX: Use a JS Date for local state ---
        prev.map(c => c.id === id ? { ...c, status: status, statusUpdatedAt: updateTime.toDate() } : c)
      );
    }).catch(err => console.error("Error updating correction:", err));
  }

  function handleFormChange(e) {
    const { name, value } = e.target;
    setNewUser(prev => ({ ...prev, [name]: value }));
  }

  function handleNewUserClassIds(classId, isChecked) {
    setNewUser(prev => {
      const currentClassIds = prev.classIds || [];
      const newClassIds = isChecked
        ? [...currentClassIds, classId]
        : currentClassIds.filter(id => id !== classId);
      return { ...prev, classIds: newClassIds };
    });
  }

  // --- FIX: Updated Add User Flow ---
  async function handleAddUser(e) {
    e.preventDefault();
    setLoading(true);
    const { email, role, name, father, subjectId, classIds, course, year, section, roll, contact, uid } = newUser;

    if (!email || !name || !uid) {
      alert("Please fill in Name, Email, and the Firebase Auth UID (User ID).");
      setLoading(false);
      return;
    }

    try {
      // 1. Check if a profile already exists for this UID
      const docRef = doc(db, 'users', uid);
      const existingDoc = await getDoc(docRef);
      if (existingDoc.exists()) {
        alert(`Error: A user profile already exists with UID: ${uid}.`);
        setLoading(false);
        return;
      }
      
      // 2. Create user profile using the PROVIDED Auth UID as the Document ID
      const userProfile = {
        role,
        name,
        email,
      };

      if (role === "student") {
        userProfile.father = father;
        userProfile.course = course;
        userProfile.year = year;
        userProfile.section = section;
        userProfile.roll = roll;
        userProfile.classId = `${course}-${year}-${section}`;
      } else if (role === "teacher") {
        userProfile.subjectId = subjectId;
        userProfile.subjectName = allSubjects.find(s => s.id === subjectId)?.name || '';
        userProfile.classIds = classIds;
        userProfile.contact = contact;
      }

      await setDoc(docRef, userProfile); // Use the provided UID as the Doc ID
      
      setAllUsers(prev => [...prev, { id: uid, ...userProfile }]);
      setIsModalOpen(false);
      setNewUser({ // Reset form
        role: 'student', name: '', email: '', uid: '', father: '', 
        subjectId: allSubjects[0]?.id || '', classIds: [], 
        course: appConfig.courses[0] || '', year: appConfig.years[0] || '', 
        section: appConfig.sections[0] || '', roll: '', contact: ''
      });
      
      // --- FINAL MESSAGE FIX ---
      alert("SUCCESS: Profile created with correct Auth UID. This user can now log in.");

    } catch (err) {
      console.error("Error adding new user:", err);
      alert("Failed to create profile. Check console.");
    }
    setLoading(false);
  }
  // --- END Updated Add User Flow ---

  function handleDeleteUser(idToDelete) {
    if (window.confirm("Are you sure you want to delete this user? This only deletes their database record, not their login.")) {
      setLoading(true);
      // Note: Deleting from Auth requires a backend function.
      // We will just delete from Firestore.
      deleteDoc(doc(db, 'users', idToDelete))
        .then(() => {
          setAllUsers(allUsers.filter(u => u.id !== idToDelete));
          setLoading(false);
        })
        .catch(err => {
          console.error("Error deleting user:", err);
          alert("Failed to delete user.");
          setLoading(false);
        });
    }
  }

  function openEditModal(user) {
    setEditingUser({ ...user });
    setIsEditModalOpen(true);
  }

  function handleEditUserChange(e) {
    const { name, value } = e.target;
    setEditingUser(prev => ({ ...prev, [name]: value }));
  }
  
  function handleEditTeacherClasses(compoundClassId, isChecked) {
    if (!editingUser) return;
    const currentClassIds = editingUser.classIds || [];
    const newClassIds = isChecked
      ? Array.from(new Set([...currentClassIds, compoundClassId]))
      : currentClassIds.filter(id => id !== compoundClassId);
    setEditingUser({ ...editingUser, classIds: newClassIds });
  }

  function handleEditUser() {
    if (!editingUser) return;
    setLoading(true);
    
    // Create a copy to update
    const updatedUser = { ...editingUser };
    if (updatedUser.role === 'student') {
        updatedUser.classId = `${updatedUser.course}-${updatedUser.year}-${updatedUser.section}`;
    }
    
    const userRef = doc(db, 'users', updatedUser.id);
    // Use setDoc with merge to avoid overwriting fields not in the form
    setDoc(userRef, updatedUser, { merge: true })
      .then(() => {
        setAllUsers(allUsers.map(u => u.id === updatedUser.id ? updatedUser : u));
        setIsEditModalOpen(false);
        setEditingUser(null);
        setLoading(false);
      })
      .catch(err => {
        console.error("Error editing user:", err);
        alert("Failed to edit user.");
        setLoading(false);
      });
  }
  
  const toggleSection = (section) => {
    setVisibleSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // --- Filtered Data for Display (User Tab) ---
  
  // Helper for sorting by name (case insensitive)
  const sortByName = (a, b) => a.name?.toLowerCase().localeCompare(b.name?.toLowerCase());

  // Helper for sorting students by roll number
  const sortByRoll = (a, b) => (parseInt(a.roll, 10) || Infinity) - (parseInt(b.roll, 10) || Infinity);

  const adminUsers = useMemo(() => 
    allUsers.filter(u => u.role === 'admin').sort(sortByName)
  , [allUsers]);

  const teacherUsers = useMemo(() => 
    allUsers.filter(u => u.role === 'teacher').sort(sortByName)
  , [allUsers]);

  const studentUsers = useMemo(() => 
    allUsers.filter(u => u.role === 'student').sort(sortByRoll)
  , [allUsers]);

  const filteredStudents = useMemo(() => {
    return studentUsers
      .filter(u => {
        const { course, year, section } = studentFilter;
        const matchCourse = course === 'All' || u.course === course;
        const matchYear = year === 'All' || u.year === year;
        const matchSection = section === 'All' || u.section === section;
        return matchCourse && matchYear && matchSection;
      });
  }, [studentUsers, studentFilter]);

  // --- Export Handler ---
  const handleExport = () => {
    if (overviewAttendanceData.length === 0) {
        alert("No data available for export in the current class view.");
        return;
    }
    
    const exportableData = overviewAttendanceData.map(student => {
        const row = {
            'Roll': student.roll,
            'Name': student.name,
            'Father': student.father,
        };

        // Add columns for each subject
        allClassSubjects.forEach(subject => {
            const summary = student.subjectAttendance[subject.id];
            const nameWithTotal = `${subject.name} (Total: ${summary?.total || 0})`;
            row[nameWithTotal] = summary?.attended || 0;
        });

        // Add overall total/percentage
        row['Overall Attended'] = student.totalAttended;
        row['Overall Total'] = student.totalClasses;
        row['Overall %'] = student.overallPercent;

        return row;
    });

    const filename = `Attendance_Report_${currentClassId.replace(/-/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
    exportToCsv(exportableData, filename);
  };
  
  if (loading && allUsers.length === 0) {
    return <div className="loading-backdrop">Loading Admin Dashboard...</div>;
  }
  
  return (
    <div className="dashboard-container">
      {loading && <div className="loading-backdrop">Loading...</div>}
      
      <header className="dashboard-header" style={{ borderColor: primary }}>
        <div className="header-logo-group">
          <KccLogoSVG size={40} />
          <div>
            <h1 className="header-title" style={{ color: primary }}>Admin Dashboard</h1>
            <p className="header-subtitle">Presencia · Control Center</p>
          </div>
        </div>
        <div className="admin-nav-container">
            {/* Nav Tabs are now inside the header for better grouping */}
            <nav className="admin-nav">
            {TABS.map(t => (
                <button
                key={t}
                onClick={() => setTab(t)}
                className="admin-nav-button"
                style={{ 
                  background: tab === t ? primary : "#e6ebf5",
                  color: tab === t ? 'white' : '#374151' 
                }}
                >
                {t}
                {t === "Corrections" && pendingCount > 0 && (
                    <span className="pending-badge">{pendingCount}</span>
                )}
                </button>
            ))}
            </nav>
            <button 
                className="logout-button"
                style={{ background: accent, marginLeft: '1rem' }}
                onClick={onLogout}
            >
                Logout
            </button>
        </div>
      </header>

      {/* --- FILTERS FOR OVERVIEW --- */}
      {tab === "Overview" && (
        <div className="content-card filter-card" style={{ borderColor: primary }}>
          <div className="filter-grid">
            <div>
              <label className="form-label">Course</label>
              <select value={viewCourse} onChange={e=>setViewCourse(e.target.value)} className="form-select">
                {appConfig.courses.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Year</label>
              <select value={viewYear} onChange={e=>setViewYear(e.target.value)} className="form-select">
                {appConfig.years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Section</label>
              <select value={viewSection} onChange={e=>setViewSection(e.target.value)} className="form-select">
                {appConfig.sections.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}
      {/* --- END FILTERS --- */}

      {tab === "Overview" && (
        <section className="overview-tab-container">
          <div className="overview-stats-grid">
            <div className="stat-box">
              <p>Total Students (All)</p>
              <span style={{ color: primary }}>{allUsers.filter(u=>u.role==="student").length}</span>
            </div>
            <div className="stat-box">
              <p>Total Teachers (All)</p>
              <span style={{ color: primary }}>{allUsers.filter(u=>u.role==="teacher").length}</span>
            </div>
            <div className="stat-box">
              <p>Pending Corrections (All)</p>
              <span style={{ color: accent }}>{pendingCount}</span>
            </div>
          </div>

          <div className="content-card" style={{ borderColor: primary }}>
            <div className="card-header-action overview-header">
              <h2 className="card-title" style={{ color: primary, margin: 0 }}>
                {/* --- FIX: Updated title to reflect filter --- */}
                Attendance Overview: {viewCourse} {viewYear} - Section {viewSection}
              </h2>
              {/* --- NEW: Export Button --- */}
              <button 
                onClick={handleExport}
                className="form-button export-button"
                style={{ background: accent }}
                disabled={overviewAttendanceData.length === 0}
              >
                Export CSV
              </button>
            </div>
            <div className="table-wrapper">
              {overviewAttendanceData.length === 0 && !loading ? (
                <p className="table-empty-text">No students found or attendance data available for this class.</p>
              ) : (
                <table className="data-table overview-table">
                  <thead>
                    <tr className="border-b text-gray-700">
                      <th className="p-2 sticky-col">Roll</th>
                      <th className="p-2 sticky-col">Name</th>
                      <th className="p-2 sticky-col">Father</th>
                      {/* --- Dynamically generated subject headers --- */}
                      {allClassSubjects.map(subject => (
                          <th key={subject.id} className="p-2" style={{ textAlign: 'center' }}>
                              {subject.name} (Total: {overviewAttendanceData[0]?.subjectAttendance?.[subject.id]?.total || 0})
                          </th>
                      ))}
                      {/* --- Overall Percentage --- */}
                      <th className="p-2 overall-col" style={{ textAlign: 'center' }}>Overall %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overviewAttendanceData.map(stu => {
                      const overall = stu.overallPercent;
                      const isBelow75 = overall !== "N/A" && parseFloat(overall) < 75;

                      return (
                        <tr key={stu.id} className="data-row">
                          <td className="sticky-col">{stu.roll}</td>
                          <td className="sticky-col">{stu.name}</td>
                          <td className="sticky-col">{stu.father}</td>
                          
                          {/* --- Dynamically generated subject attendance data --- */}
                          {allClassSubjects.map(subject => {
                            const summary = stu.subjectAttendance[subject.id];
                            const attended = summary?.attended || 0;
                            const total = summary?.total || 0;
                            const subjectPercent = calculatePercentage(attended, total);
                            const isSubjectBelow75 = total > 0 && parseFloat(subjectPercent) < 75;

                            return (
                              <td key={subject.id} style={{ textAlign: 'center' }}>
                                <span style={{ color: isSubjectBelow75 ? accent : primary, fontWeight: 500 }}>
                                    {attended}
                                </span> / {total}
                              </td>
                            );
                          })}
                          
                          {/* --- Overall Percentage --- */}
                          <td className="overall-col" style={{ textAlign: 'center' }}>
                            <span style={{ color: isBelow75 ? accent : 'green', fontWeight: 'bold' }}>
                              {overall}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </section>
      )}

      {tab === "Corrections" && (
        <section className="content-card" style={{ borderColor: primary }}>
          <h2 className="card-title" style={{ color: primary }}>All Corrections</h2>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Roll</th>
                  <th>Name</th>
                  <th>Class ID</th>
                  <th>Subject</th>
                  <th>Date</th>
                  <th>Lecture</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Submitted At</th>
                  <th style={{ textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {allCorrections.length === 0 && (
                  <tr><td colSpan="10" className="table-empty-text">No corrections found.</td></tr>
                )}
                {allCorrections.map(c => {
                  const student = allUsers.find(u => u.roll === c.roll && u.classId === c.classId);
                  return (
                    <tr key={c.id} className="data-row">
                      <td>{c.roll}</td>
                      <td>{student?.name ?? c.name ?? '-'}</td>
                      <td>{c.classId}</td>
                      <td>{c.subjectName}</td>
                      <td>{c.date}</td>
                      <td>L{c.lectureNumber || 1}</td>
                      <td>{c.reason}</td>
                      <td>
                        <span className={`status-badge status-${c.status.toLowerCase()}`}>{c.status}</span>
                      </td>
                      <td>{c.submittedAt.toLocaleString()}</td>
                      <td className="action-cell">
                        <button onClick={() => handleCorrectionDecision(c.id, 'Approved')} disabled={c.status !== 'Pending'} className="form-button action-button" style={{ background: primary }}>Accept</button>
                        <button onClick={() => handleCorrectionDecision(c.id, 'Rejected')} disabled={c.status !== 'Pending'} className="form-button action-button" style={{ background: accent }}>Reject</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "Users" && (
        <section className="users-tab-container">
          <div className="card-header-action">
            <h2 className="card-title" style={{ color: primary, margin: 0 }}>User Management</h2>
            <button onClick={() => setIsModalOpen(true)} className="form-button" style={{ background: primary }}>
              + Add New User
            </button>
          </div>

          <div className="content-card" style={{ borderColor: primary }}>
            <h3 
              className="card-title-toggle"
              style={{ color: primary }}
              onClick={() => toggleSection('admin')}
            >
              Admins
              <span className="toggle-icon">
                {visibleSections.admin ? '▼' : '►'}
              </span>
            </h3>
            {visibleSections.admin && (
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Name</th>
                      <th>Role</th>
                      <th style={{ textAlign: 'center' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* --- Display sorted admin users --- */}
                    {adminUsers.map(u => (
                      <tr key={u.id} className="data-row">
                        <td className="truncate-cell">{u.id}</td>
                        <td className="truncate-cell">{u.name}</td>
                        <td style={{ textTransform: 'capitalize' }}>{u.role}</td>
                        <td className="action-cell">
                          <button onClick={() => openEditModal(u)} className="form-button action-button" style={{ background: primary }}>Edit</button>
                          <button onClick={() => handleDeleteUser(u.id)} className="form-button action-button" style={{ background: accent }}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="content-card" style={{ borderColor: primary }}>
            <h3 
              className="card-title-toggle"
              style={{ color: primary }}
              onClick={() => toggleSection('teacher')}
            >
              Teachers
              <span className="toggle-icon">
                {visibleSections.teacher ? '▼' : '►'}
              </span>
            </h3>
            {visibleSections.teacher && (
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Name</th>
                      <th>Subject</th>
                      <th>Assigned Classes</th>
                      <th style={{ textAlign: 'center' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* --- Display sorted teacher users --- */}
                    {teacherUsers.map(u => (
                      <tr key={u.id} className="data-row">
                        <td className="truncate-cell">{u.id}</td>
                        <td className="truncate-cell">{u.name}</td>
                        <td className="truncate-cell">{allSubjects.find(s=>s.id===u.subjectId)?.name ?? '-'}</td>
                        <td className="truncate-cell">{(u.classIds || []).join(', ') || '-'}</td>
                        <td className="action-cell">
                          <button onClick={() => openEditModal(u)} className="form-button action-button" style={{ background: primary }}>Edit</button>
                          <button onClick={() => handleDeleteUser(u.id)} className="form-button action-button" style={{ background: accent }}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="content-card" style={{ borderColor: primary }}>
            <h3 
              className="card-title-toggle"
              style={{ color: primary }}
              onClick={() => toggleSection('student')}
            >
              Students
              <span className="toggle-icon">
                {visibleSections.student ? '▼' : '►'}
              </span>
            </h3>
            {visibleSections.student && (
              <>
                <div className="filter-grid" style={{ marginBottom: '1rem' }}>
                  <div>
                    <label className="form-label">Course</label>
                    <select value={studentFilter.course} onChange={e => setStudentFilter({...studentFilter, course: e.target.value})} className="form-select">
                      <option value="All">All Courses</option>
                      {appConfig.courses.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Year</label>
                    <select value={studentFilter.year} onChange={e => setStudentFilter({...studentFilter, year: e.target.value})} className="form-select">
                      <option value="All">All Years</option>
                      {appConfig.years.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Section</label>
                    <select value={studentFilter.section} onChange={e => setStudentFilter({...studentFilter, section: e.target.value})} className="form-select">
                      <option value="All">All Sections</option>
                      {appConfig.sections.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
              
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Roll</th>
                        <th>Name</th>
                        <th>Father</th>
                        <th>Course</th>
                        <th>Year</th>
                        <th>Section</th>
                        <th style={{ textAlign: 'center' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStudents.length === 0 && (
                        <tr><td colSpan="7" className="table-empty-text">No students match filters.</td></tr>
                      )}
                      {/* --- Display sorted and filtered student users --- */}
                      {filteredStudents.map(u => (
                          <tr key={u.id} className="data-row">
                            <td>{u.roll}</td>
                            <td className="truncate-cell">{u.name}</td>
                            <td className="truncate-cell">{u.father}</td>
                            <td className="truncate-cell">{u.course}</td>
                            <td>{u.year}</td>
                            <td>{u.section}</td>
                            <td className="action-cell">
                              <button onClick={() => openEditModal(u)} className="form-button action-button" style={{ background: primary }}>Edit</button>
                              <button onClick={() => handleDeleteUser(u.id)} className="form-button action-button" style={{ background: accent }}>Delete</button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {/* --- Add User Modal --- */}
      {isModalOpen && (
        <div className="modal-backdrop">
          <form className="modal-content" onSubmit={handleAddUser}>
            <h2 className="modal-title" style={{ color: primary }}>Add New User</h2>
            <p className="text-sm text-gray-600 mb-4">
              <strong style={{ color: accent }}>STEP 1:</strong> Go to Firebase Console → Authentication → Add user to create the login first.
            </p>
            <div className="modal-body">
              <div>
                <label className="form-label">Role</label>
                <select name="role" value={newUser.role} onChange={handleFormChange} className="form-select">
                  <option value="student">Student</option>
                  <option value="teacher">Teacher</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="form-grid-2">
                <div>
                  <label className="form-label">Email</label>
                  <input type="email" name="email" value={newUser.email} onChange={handleFormChange} className="form-input" required />
                </div>
                <div>
                  <label className="form-label">Full Name</label>
                  <input type="text" name="name" value={newUser.name} onChange={handleFormChange} className="form-input" required />
                </div>
              </div>
              <div className="modal-section">
                 <h3>Authentication Details (CRITICAL)</h3>
                 <p className="form-input-hint" style={{ color: accent }}>
                    <strong style={{ fontWeight: 600 }}>STEP 2:</strong> Copy the **User UID** from the Firebase Auth tab and paste it below.
                </p>
                <div>
                  <label className="form-label">Firebase Auth UID</label>
                  <input 
                    type="text" 
                    name="uid" 
                    value={newUser.uid} 
                    onChange={handleFormChange} 
                    className="form-input" 
                    placeholder="e.g., rI3VldyL..." 
                    required 
                  />
                </div>
              </div>
              
              {newUser.role === 'student' && (
                <div className="modal-section">
                  <h3>Student Details</h3>
                  <div className="form-grid-2">
                    <div>
                      <label className="form-label">Father's Name</label>
                      <input type="text" name="father" value={newUser.father} onChange={handleFormChange} className="form-input" />
                    </div>
                     <div>
                      <label className="form-label">Roll Number</label>
                      <input type="text" name="roll" value={newUser.roll} onChange={handleFormChange} className="form-input" />
                    </div>
                  </div>
                  <div className="form-grid-3">
                    <div>
                      <label className="form-label">Course</label>
                      <select name="course" value={newUser.course} onChange={handleFormChange} className="form-select">
                        {appConfig.courses.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="form-label">Year</label>
                      <select name="year" value={newUser.year} onChange={handleFormChange} className="form-select">
                        {appConfig.years.map(y => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="form-label">Section</label>
                      <select name="section" value={newUser.section} onChange={handleFormChange} className="form-select">
                        {appConfig.sections.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              )}
              {newUser.role === 'teacher' && (
                <div className="modal-section">
                  <h3>Teacher Details</h3>
                  <div>
                    <label className="form-label">Assigned Subject</label>
                    <select name="subjectId" value={newUser.subjectId} onChange={handleFormChange} className="form-select">
                      {allSubjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Contact No.</label>
                    <input type="text" name="contact" value={newUser.contact} onChange={handleFormChange} className="form-input" placeholder="e.g. 9876543210" />
                  </div>
                  <div>
                    <label className="form-label">Assigned Classes</label>
                    <div className="checkbox-grid">
                      {allClassIds.map(cId => (
                        <label key={cId} className="checkbox-label">
                          <input 
                            type="checkbox"
                            checked={newUser.classIds.includes(cId)}
                            onChange={(e) => handleNewUserClassIds(cId, e.target.checked)}
                          />
                          <span>{cId}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" onClick={() => setIsModalOpen(false)} className="form-button" style={{ background: '#e6ebf5', color: '#374151' }}>Cancel</button>
              <button type="submit" className="form-button" style={{ background: primary }}>Create Profile</button>
            </div>
          </form>
        </div>
      )}

      {/* --- Edit User Modal --- */}
      {isEditModalOpen && editingUser && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <h2 className="modal-title" style={{ color: primary }}>Edit User: {editingUser.name}</h2>
            <div className="modal-body">
              <div>
                <label className="form-label">Role</label>
                <input type="text" value={editingUser.role} readOnly className="form-input" style={{ background: '#f9fafb' }}/>
              </div>
              <div>
                <label className="form-label">Full Name</label>
                <input type="text" name="name" value={editingUser.name} onChange={handleEditUserChange} className="form-input" />
              </div>
              <div>
                <label className="form-label">Email</label>
                <input type="email" name="email" value={editingUser.email} onChange={handleEditUserChange} className="form-input" />
              </div>
              {editingUser.role === 'student' && (
                <div className="modal-section">
                  <h3>Student Details</h3>
                  <div className="form-grid-2">
                    <div>
                      <label className="form-label">Father's Name</label>
                      <input type="text" name="father" value={editingUser.father || ''} onChange={handleEditUserChange} className="form-input" />
                    </div>
                    <div>
                      <label className="form-label">Roll Number</label>
                      <input type="text" name="roll" value={editingUser.roll || ''} onChange={handleEditUserChange} className="form-input" />
                    </div>
                  </div>
                  <div className="form-grid-3">
                    <div>
                      <label className="form-label">Course</label>
                      <select name="course" value={editingUser.course || ''} onChange={handleEditUserChange} className="form-select">
                        {appConfig.courses.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="form-label">Year</label>
                      <select name="year" value={editingUser.year || ''} onChange={handleEditUserChange} className="form-select">
                        {appConfig.years.map(y => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="form-label">Section</label>
                      <select name="section" value={editingUser.section || ''} onChange={handleEditUserChange} className="form-select">
                        {appConfig.sections.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              )}
              {editingUser.role === 'teacher' && (
                <div className="modal-section">
                  <h3>Teacher Details</h3>
                  <div>
                    <label className="form-label">Assigned Subject</label>
                    <select name="subjectId" value={editingUser.subjectId || ''} onChange={handleEditUserChange} className="form-select">
                      {allSubjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Contact No.</label>
                    <input type="text" name="contact" value={editingUser.contact || ''} onChange={handleEditUserChange} className="form-input" />
                  </div>
                  <div>
                    <label className="form-label">Assigned Classes</label>
                    <div className="checkbox-grid">
                      {allClassIds.map(cId => (
                        <label key={cId} className="checkbox-label">
                          <input 
                            type="checkbox"
                            checked={(editingUser.classIds || []).includes(cId)}
                            onChange={(e) => handleEditTeacherClasses(cId, e.target.checked)}
                          />
                          <span>{cId}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" onClick={() => setIsEditModalOpen(false)} className="form-button" style={{ background: '#e6ebf5', color: '#374151' }}>Cancel</button>
              <button type="button" onClick={handleEditUser} className="form-button" style={{ background: primary }}>Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminDashboard;