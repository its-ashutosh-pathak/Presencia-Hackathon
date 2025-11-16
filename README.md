Presencia: Cloud Attendance Management System

Presencia is a full-stack, role-based cloud attendance system developed for the KCC Institute of Technology and Management hackathon. It offers specialized dashboards for Students, Teachers, and Administrators to manage attendance, track performance, and process corrections in real-time.

Key Features (In Simple Words)

This application serves three main user roles, giving each one a unique set of tools:

1. Student Dashboard (Self-Service)

Real-time Attendance: Students see their current attendance percentage for every subject.

Overall Summary: A donut chart shows the aggregate attendance across all courses.

75% Rule: Calculations show exactly how many classes the student needs to attend to hit the $75\%$ benchmark, or how many they can still miss.

Correction Requests: Students can directly raise a request to correct an absence (e.g., "Present but marked absent"), specifying the date, lecture number, reason, and optional proof.

2. Teacher Dashboard (Marking & Management)

Class Selection: Teachers can select any class assigned to them to view and mark attendance.

Roll Number Sorting: Student lists are always sorted by Roll Number for fast, organized marking.

Batch Marking: Ability to mark attendance for multiple lectures at once (Lecture 1, Lecture 2, etc.).

Attendance History: Detailed table showing day-by-day attendance (P/A). Includes a Subject % column for the teacher to quickly see which students are falling behind in their subject.

Correction Approval: Teachers can review, approve, or reject student correction requests. Approving a request automatically updates the student's final attendance record.

3. Admin Dashboard (Reporting & Control)

User Management: Centralized control to add, edit, or delete user profiles (Admin, Teacher, Student). Lists are sorted by Name (Admin/Teacher) or Roll Number (Student).

Attendance Overview: Dynamic matrix view for any selected class (Course, Year, Section). The table shows the total classes attended by every student for every single subject taught to that class.

Overall % Calculation: Calculates and displays each student’s overall percentage across all subjects.

Data Export: Includes an Export CSV button to download the entire class attendance report for record-keeping.

Correction Monitoring: Tracks all pending, approved, and rejected correction requests across the entire institution.

Technical Stack

Frontend: React (Built with Vite)

Styling: Custom CSS modules

Backend & Database: Google Firebase (Authentication & Firestore)

Authentication: Manages role-based logins.

Firestore: Used for real-time data storage, including user profiles, attendance records, and correction requests.

Local Setup and Running the Project

To get a copy of this project running on your local machine, follow these steps:

A. Secure Configuration (Critical!)

This project securely hides the Firebase API key using environment variables. Before running the app, you must create the configuration file.

Create .env.local: In your frontend directory (the root of the project), create a new file named .env.local.

Paste Configuration: Copy the following content into the new .env.local file:

VITE_FIREBASE_API_KEY="AIzaSyCTBPKWe2srEF98OcIyn6TpbBhnhXBzvgk"
VITE_FIREBASE_AUTH_DOMAIN="presencia-hackathon.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="presencia-hackathon"
VITE_FIREBASE_STORAGE_BUCKET="presencia-hackathon.firebasestorage.app"
VITE_FIREBASE_MESSAGING_SENDER_ID="222987019150"
VITE_FIREBASE_APP_ID="1:222987019150:web:18c85298f164977ac9fadf"


B. Installation

Install Dependencies: In your terminal, navigate to the frontend directory and run:

npm install
# or
yarn install


Start the Server:

npm run dev
# or
yarn dev


The application will now open in your browser.

How to Update the Project (The Git Workflow)

Updating the project is easy! Since you've already initialized Git and pushed your first commit, here is the simple process for saving new changes:

1. Make Changes Locally

Edit the code (e.g., fix a bug in StudentDashboard.jsx or add a new feature).

2. Stage the Changes

This prepares your updated files for the next history snapshot.

git add .


3. Commit the Changes

This saves the snapshot of your work locally. The message should clearly describe what you fixed or added.

git commit -m "FEAT: Added support for displaying teacher's name on subject card."
# OR
git commit -m "FIX: Ensured student list sorts correctly by Roll Number."


4. Push to GitHub

This uploads the new saved history (the commit) to your public GitHub repository.

git push origin main


That's it! Repeat steps 2, 3, and 4 every time you want to save a new set of changes.