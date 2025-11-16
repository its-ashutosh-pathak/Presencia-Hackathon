import React, { useState } from 'react';
import { KccLogoSVG } from '../components/KccLogo.jsx';
import { auth } from '../firebaseConfig.js'; // <-- Import Firebase Auth
import { signInWithEmailAndPassword } from 'firebase/auth';
import '../styles/LoginPage.css'; // <-- Import our new CSS

function LoginPage() {
  const primary = "#0B3D91";
  const accent = "#9B1B1B";

  const [username, setUsername] = useState(""); // This is the email
  const [password, setPassword] = useState("");
  // Note: The 'role' is NOT needed for login. 
  // We get the role from the database *after* login.
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const [showPassword, setShowPassword] = useState(false);

  async function handleSignIn(e) {
    e.preventDefault(); 
    setError(null);
    setLoading(true);

    try {
      // Use Firebase to sign in!
      await signInWithEmailAndPassword(auth, username, password);
      // That's it! The `onAuthStateChanged` listener in `App.jsx`
      // will detect this login and automatically show the dashboard.
    } catch (err) {
      // Handle Firebase errors
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError("Invalid email or password.");
      } else {
        setError("Failed to sign in. Please try again.");
      }
      console.error("Firebase Login Error:", err);
    }
    setLoading(false);
  }

  return (
    <div className="login-page-container min-h-screen">
      <div className="login-card-wrapper">
        <div className="login-card" style={{ borderLeftColor: primary }}>
          
          <div className="login-header">
            <KccLogoSVG size={56} />
            <div>
              <h1 className="login-title" style={{ color: primary }}>Presencia</h1>
              <p className="login-subtitle">Cloud Attendance | KCCITM</p>
            </div>
          </div>

          <form className="login-form" onSubmit={handleSignIn}>
            <div className="form-group">
              <label className="form-label" htmlFor="email-input">User ID (Email)</label>
              <input
                id="email-input"
                type="text"
                placeholder="student@demo.com"
                className="form-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="password-input">Password</label>
              <div className="password-input-wrapper">
                <input
                  id="password-input"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  className="form-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="password-toggle-button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {/* Simple text instead of SVG for now. You can add SVGs later! */}
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <div className="form-options">
              <div className="form-remember">
                <input id="remember" type="checkbox" className="form-checkbox" />
                <label htmlFor="remember">Remember me</label>
              </div>
              <a href="#" className="form-forgot-link" style={{ color: accent }}>Forgot password?</a>
            </div>

            {/* We removed the 'Sign in as' dropdown because the role 
              comes from the database, not the user.
            */}

            {error && (
              <div className="form-error">
                <p>{error}</p>
              </div>
            )}

            <div className="form-button-container">
              <button
                type="submit"
                className="submit-button"
                style={{ background: primary }}
                disabled={loading}
              >
                {loading ? 'Signing in...' : 'Sign in'}
              </button>
            </div>

            <div className="form-footer-text">
              <p>
                Your attendance data is private. Access is role-based and subject-restricted. By signing in you agree to the college policies.
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;