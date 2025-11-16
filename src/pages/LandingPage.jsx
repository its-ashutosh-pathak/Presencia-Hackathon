import React from 'react';
import { KccLogoSVG } from '../components/KccLogo';
import '../styles/LandingPage.css'; // <-- Import our new CSS

// This is the component function
function LandingPage({ onGetStarted }) {
  const primary = "#0B3D91"; // KCC Blue
  const accent = "#9B1B1B"; // KCC Red

  return (
    <div className="landing-container min-h-screen">
      
      {/* --- HEADER --- */}
      <header className="landing-header">
        <div className="landing-logo">
          <KccLogoSVG size={100} />
        </div>
        <div>
          <h1 className="landing-title" style={{ color: primary }}>
            Presencia
          </h1>
          <p className="landing-subtitle">
            Cloud Attendance Management for KCC Institue Of Technology And Management
          </p>
          <div className="landing-header-details">
            <p>
              Approved By All India Council For Technical Education, Ministry of HRD, Govt. Of India.
            </p>
            <p>
              Affilated to Dr. A P J. Abdul Kalam Technical university
            </p>
            <p className="landing-address">
              Campus 2B-2C, Knowledge Park-III Greater Noida-201306 Uttar Pradesh
            </p>
          </div>
        </div>
      </header>

      {/* --- Content Blocks Wrapper --- */}
      <main className="content-blocks-wrapper">
      
        <section className="content-block" style={{ borderLeftColor: primary }}>
          <h2 className="content-title" style={{ color: primary }}>
            Welcome to Presencia
          </h2>
          <p className="content-text">
            Presencia is a modern, web-based attendance management system designed to simplify the tracking, calculation, and management of student attendance in real-time. The platform provides distinct, secure interfaces for students, teachers, and administrators, ensuring that every user interacts only with the data and tools relevant to their role.
          </p>
          <ul className="content-list">
            <li>
              <span>For Students:</span> Check your attendance records, subject-wise percentages, and submit correction requests with proof, all in one place.
            </li>
            <li>
              <span>For Teachers:</span> Mark and manage attendance for your assigned classes, approve correction requests, and view student records.
            </li>
            <li>
              <span>For Admins:</span> A complete overview of the institute. Manage users, generate comprehensive reports, and oversee all classes.
            </li>
          </ul>
          <div className="button-container">
            <button
              onClick={onGetStarted}
              className="get-started-button"
              style={{ background: accent }}
            >
              Get Started
            </button>
          </div>
        </section>

        {/* --- MINDMESH BLOCK --- */}
        <section className="content-block" style={{ borderLeftColor: primary }}>
          <h3 className="mindmesh-title" style={{ color: primary }}>
            Made with ❤️ by MindMesh
          </h3>
          <p className="mindmesh-subtitle">Students of KCC Institute Of Technology And Management</p>
          <ul className="content-list">
            <li>Ashutosh Pathak</li>
            <li>Sruti Jha</li>
            <li>Samita Lenka</li>
            <li>Aaditya Singh</li>
          </ul>
        </section>
        
        {/* --- CONTACT US BLOCK --- */}
        <section className="content-block" style={{ borderLeftColor: primary }}>
           <h3 className="content-title-small" style={{ color: primary }}>
            Contact Us
          </h3>
          <ul className="contact-list">
            <li>
              <span>Call:</span> 92100 65555
            </li>
            <li>
              <span>Email:</span> admissions@kccitm.edu.in
            </li>
            <li>
              <span>Website:</span> www.kccitm.edu.in
            </li>
          </ul>
        </section>
        
      </main>
    </div>
  );
}

export default LandingPage;