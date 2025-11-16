import React, { useState, useEffect } from 'react';
import { auth, db } from '/src/firebaseConfig.js';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

// Import our pages using absolute paths
import LandingPage from '/src/pages/LandingPage';
import LoginPage from '/src/pages/LoginPage';
import StudentDashboard from '/src/pages/StudentDashboard';
import TeacherDashboard from '/src/pages/TeacherDashboard';
import AdminDashboard from '/src/pages/AdminDashboard';

function LoadingScreen({ message = "Loading..."}) {
  return (
    <div className="min-h-screen" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', fontWeight: 500 }}>
      {message}
    </div>
  );
}

function App() {
  const [loading, setLoading] = useState(true);
  const [authUser, setAuthUser] = useState(null); // The user object from Firebase Auth
  const [userProfile, setUserProfile] = useState(null); // The user's data from Firestore (name, role, etc.)
  const [showLogin, setShowLogin] = useState(false); // Toggle between Landing and Login

  useEffect(() => {
    // This listener runs when the component mounts and whenever auth state changes
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setLoading(true); // Start loading on any auth change
      if (user) {
        // User is logged in
        setAuthUser(user);
        
        // Now, let's get their profile (and role) from Firestore
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
          const profileData = userDoc.data();
          // Convert role to lowercase to prevent case-sensitivity bugs
          if (profileData.role) {
            profileData.role = profileData.role.toLowerCase();
          }
          setUserProfile({ uid: user.uid, ...profileData });
        } else {
          console.error("No user profile found in Firestore!");
          // Handle this case - log them out
          await signOut(auth);
          setAuthUser(null);
          setUserProfile(null);
        }
      } else {
        // User is logged out
        setAuthUser(null);
        setUserProfile(null);
        setShowLogin(false); // Go back to landing page on logout
      }
      setLoading(false);
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  const handleLogout = () => {
    signOut(auth).catch((error) => console.error("Logout Error:", error));
  };

  // 1. Show a loading screen while we check auth
  if (loading) {
    return <LoadingScreen />;
  }

  // 2. If no user is logged in, show Landing or Login page
  if (!authUser) {
    return showLogin ? (
      <LoginPage />
    ) : (
      <LandingPage onGetStarted={() => setShowLogin(true)} />
    );
  }

  // 3. A user is logged in, but we're still fetching their profile
  if (!userProfile) {
     return <LoadingScreen message="Fetching profile..." />;
  }

  // 4. We have a logged-in user AND their profile. Show the correct dashboard.
  switch (userProfile.role) {
    case 'student':
      return <StudentDashboard studentProfile={userProfile} onLogout={handleLogout} />;
    case 'teacher':
      return <TeacherDashboard teacherProfile={userProfile} onLogout={handleLogout} />;
    case 'admin':
      return <AdminDashboard adminProfile={userProfile} onLogout={handleLogout} />;
    default:
      console.error("Unknown user role:", userProfile.role);
      handleLogout(); // Log out if role is unknown
      return <div>Error: Unknown user role. Logging out.</div>;
  }
}

export default App;