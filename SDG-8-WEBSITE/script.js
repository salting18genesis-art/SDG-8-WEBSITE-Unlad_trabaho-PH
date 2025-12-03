import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, query, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- 1. GLOBAL VARIABLES AND INITIAL SETUP ---

// Retrieve mandatory global variables provided by the Canvas environment
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Initialize Firebase App
let app, auth, db;
let currentUserId = null;
let isAuthenticated = false;
let userAccountDetails = null;

// UI Elements (cached for efficiency) 
const loginForm = document.querySelector('#login-form');
const registerForm = document.querySelector('#register-form');
const jobseekerForm = document.querySelector('#jobseeker-form');
const employerForm = document.querySelector('#employer-form');
const sidebarAccountAccess = document.querySelector('.sidebar a[href="login&register.html"]');


// --- UTILITY FUNCTIONS ---

/**
 * Generates the Firestore path for a user's private data collection.
 * @param {string} collectionName The name of the collection ( 'user_profiles').
 * @returns {string} The full Firestore path.
 */
function getPrivateCollectionPath(collectionName) {
    if (!currentUserId) {
        console.error("Attempted to access private data without a user ID.");
        // Fallback path, but security rules should prevent access
        return `artifacts/${appId}/users/anonymous_user_id/${collectionName}`; 
    }
    return `artifacts/${appId}/users/${currentUserId}/${collectionName}`;
}
function showPage(pageId) {
    // 1. Get all page sections
    const pages = document.querySelectorAll('.page-content');

    // 2. Hide all pages
    pages.forEach(page => {
        page.classList.remove('active');
    });

    // 3. Show the requested page
    const targetPage = document.getElementById(pageId);
        if (targetPage) {
            targetPage.classList.add('active');
                // Scroll to the top of the main content area for a better SPA feel
                document.getElementById('content-area').scrollTop = 0;

    // SPECIAL HANDLER: If navigating to the Auth page, ensure Login is active by default
        if (pageId === 'page-auth') {
            toggleAuthForm('login');
            }

    } else {
        console.error('Page ID not found:', pageId);
    }
}


/**
 * Creates and shows a temporary message modal instead of using alert().
 * @param {string} message The message content.
 * @param {boolean} isError If true, styles the message as an error.
 */
function showModalMessage(message, isError = false) {
    const modalId = 'dynamic-message-modal';
    let modal = document.getElementById(modalId);
    // Create modal if it doesn't exist 
    if (!modal) {
        modal = document.createElement('div');
        modal.id = modalId;
        modal.style.cssText = `
            position: fixed; top: 20px; right: 20px; padding: 15px 25px;
            background: ${isError ? '#e53935' : '#43a047'}; color: white;
            border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            z-index: 1000; transition: all 0.5s ease-in-out; opacity: 0;
            font-family: var(--font-family); font-weight: 600;
        `;
        document.body.appendChild(modal);
    }
    
    modal.textContent = message;
    modal.style.background = isError ? '#e53935' : '#43a047';
    modal.style.opacity = 1;

    setTimeout(() => {
        modal.style.opacity = 0;
        setTimeout(() => modal.remove(), 500); // Remove after fade out
    }, 3000);
}

/**
 * Serializes form data into a plain JavaScript object.
 * @param {HTMLFormElement} form The form element.
 * @returns {Object} The form data object.
 */
function serializeForm(form) {
    const formData = new FormData(form);
    const data = {};
    for (const [key, value] of formData.entries()) {
        data[key] = value;
    }
    return data;
}

// --- 2. AUTHENTICATION AND UI STATE MANAGEMENT ---

/**
 * Updates the navigation sidebar based on the user's authentication status.
 * Shows 'Logout' and enables 'My Account' links if authenticated.
 */
function updateUIState() {
    // 1. Update Login/Register Link on all pages (if present)
    if (sidebarAccountAccess) {
        if (isAuthenticated) {
            // Change link to Logout and show user email/name (if available)
            sidebarAccountAccess.textContent = `Logout (${userAccountDetails?.email || 'User'})`;
            sidebarAccountAccess.href = "#"; // Prevent navigation on click
            sidebarAccountAccess.removeEventListener('click', handleExternalAuthLink);
            sidebarAccountAccess.addEventListener('click', handleLogout);
        } else {
            // Change link to Login/Register and point to the dedicated page
            sidebarAccountAccess.textContent = 'Login / Register';
            sidebarAccountAccess.href = "login&register.html";
            sidebarAccountAccess.removeEventListener('click', handleLogout); 
            sidebarAccountAccess.addEventListener('click', handleExternalAuthLink);
        }
    }
    
    // 2. Enable/Disable My Account Links on all pages
    const sidebarMyAccountItems = document.querySelectorAll('.sidebar nav h4:nth-child(2) + ul li a');
    sidebarMyAccountItems.forEach(link => {
        if (isAuthenticated) {
            link.style.opacity = '1';
            link.style.pointerEvents = 'auto';
            link.setAttribute('aria-disabled', 'false');
        } else {
            // Visually grey out/disable links if not logged in
            link.style.opacity = '0.5';
            link.style.pointerEvents = 'none';
            link.setAttribute('aria-disabled', 'true');
        }
    });
}

/**
 * Handles navigation to the external login/register page.
 */
function handleExternalAuthLink(event) {
    if (isAuthenticated) {
        // If somehow authenticated but link is still 'Login/Register', perform logout
        handleLogout(event);
    } 
    // Otherwise, allow the default navigation to the login&register.html
}

/**
 * Handles user logout.
 */
async function handleLogout(event) {
    event.preventDefault();
    try {
        await auth.signOut();
        showModalMessage("You have been successfully logged out.", false);
        // Redirect to home page after logout
        window.location.href = 'index.html'; 
    } catch (error) {
        console.error("Logout Error:", error);
        showModalMessage("Logout failed. Please try again.", true);
    }
}

// --- 3. FIREBASE AUTHENTICATION HANDLERS (Simulated Logic) ---

/**
 * Attempts to register a new user profile in Firestore.
 */
async function registerUser(email, fullName) {
    // In this simulation, we assume anonymous sign-in already occurred.
    if (!currentUserId) {
        showModalMessage("Authentication service not ready. Try logging in first.", true);
        return false;
    }
    
    const userDocRef = doc(db, getPrivateCollectionPath('user_profiles'), currentUserId);
    
    try {
        const docSnap = await getDoc(userDocRef);
        if (docSnap.exists()) {
             showModalMessage("Account already exists with this session. Please log in.", true);
             return false;
        }

        // Save new user profile data to Firestore
        await setDoc(userDocRef, {
            email: email,
            fullName: fullName,
            accountType: "Unspecified", // Initial type
            registrationDate: new Date().toISOString(),
            isVerified: false
        });

        console.log("Registration successful for new user:", currentUserId);
        showModalMessage(`Welcome, ${fullName}! Your basic account is ready.`, false);
        return true;
        
    } catch (error) {
        console.error("Firestore Registration Error:", error);
        showModalMessage("Registration failed. Data storage error.", true);
        return false;
    }
}

/**
 * Simulates the login process.
 */
async function loginUser(email) {
    if (!currentUserId) {
        showModalMessage("Authentication service not ready. Try again.", true);
        return false;
    }

    const userDocRef = doc(db, getPrivateCollectionPath('user_profiles'), currentUserId);
    
    try {
        const docSnap = await getDoc(userDocRef);

        if (docSnap.exists()) {
            userAccountDetails = docSnap.data();
            showModalMessage(`Welcome back, ${userAccountDetails.fullName || userAccountDetails.email}!`, false);
            // Redirect to home after successful login
            window.location.href = 'index.html';
            return true;
        } else {
            showModalMessage("Login failed. Profile not found. Please register.", true);
            return false;
        }
    } catch (error) {
        console.error("Firestore Login Error:", error);
        showModalMessage("Login failed due to a database error.", true);
        return false;
    }
}


// --- 4. FORM SUBMISSION HANDLERS ---

/**
 * Handles the registration form submission on login&register.html.
 */
function handleRegisterSubmit(event) {
    event.preventDefault();

    const emailInput = document.getElementById('register-email');
    const passwordInput = document.getElementById('register-password');
    const nameInput = document.getElementById('register-name');

    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();
    const fullName = nameInput.value.trim();
    
    if (!email || !password || !fullName) {
        showModalMessage("All registration fields are required.", true);
        return;
    }
    
    if (password.length < 6) {
        showModalMessage("Password must be at least 6 characters long.", true);
        return;
    }

    registerUser(email, fullName).then(success => {
        if (success) {
            registerForm.reset();
        }
    });
}

/**
 * Handles the login form submission on login&register.html.
 */
function handleLoginSubmit(event) {
    event.preventDefault();

    const emailInput = document.getElementById('login-email');
    const passwordInput = document.getElementById('login-password');

    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();
    
    if (!email || !password) {
        showModalMessage("Email and Password are required.", true);
        return;
    }
    
    loginUser(email).then(success => {
        if (success) {
            loginForm.reset();
        }
    });
}

/**
 * Handles the Job Seeker (Resume) form submission on jobseeker.html.
 */
function handleJobSeekerFormSubmit(event) {
    event.preventDefault();
    
    if (!isAuthenticated) {
        showModalMessage("You must be logged in to save your resume.", true);
        return;
    }

    const formData = serializeForm(jobseekerForm);
    const userDocRef = doc(db, getPrivateCollectionPath('user_profiles'), currentUserId);
    
    // Simple conditional logic for data completeness check
    if (!formData.fullName || !formData.email || !formData.degree) {
        showModalMessage("Please fill in the required Personal and Educational fields.", true);
        return;
    }
    
    try {
        // Update user profile with resume data
        setDoc(userDocRef, { 
            resumeData: formData,
            accountType: "JobSeeker",
            lastUpdated: new Date().toISOString()
        }, { merge: true });

        showModalMessage("Resume Profile saved successfully! You can now start applying.", false);
    } catch (error) {
        console.error("Error saving resume data:", error);
        showModalMessage("Failed to save resume profile. Database error.", true);
    }
}

/**
 * Handles the Employer (Company) form submission on employer.html.
 */
function handleEmployerFormSubmit(event) {
    event.preventDefault();
    
    if (!isAuthenticated) {
        showModalMessage("You must be logged in to register a company.", true);
        return;
    }

    const formData = serializeForm(employerForm);
    
    // Check required fields for company registration
    if (!formData.companyName || !formData.secReg || !formData.jobTitle || !formData.salaryMin) {
        showModalMessage("Please fill in all Company and Job Posting required fields.", true);
        return;
    }

    const userDocRef = doc(db, getPrivateCollectionPath('user_profiles'), currentUserId);
    const jobPostingsCollectionRef = collection(db, getPrivateCollectionPath('job_postings'));
    
    // Separate company and job data for storage
    const companyData = {
        companyName: formData.companyName,
        secReg: formData.secReg,
        industry: formData.industry,
        headOfficeLocation: formData.headOfficeLocation,
        companyMission: formData.companyMission,
        employerId: currentUserId,
        isVerified: false,
        registrationDate: new Date().toISOString()
    };
    
    const jobData = {
        jobTitle: formData.jobTitle,
        jobLocation: formData.jobLocation,
        salaryMin: parseInt(formData.salaryMin),
        salaryMax: parseInt(formData.salaryMax),
        jobDescription: formData.jobDescription,
        companyName: formData.companyName,
        employerId: currentUserId,
        datePosted: new Date().toISOString()
    };

    try {
        // 1. Update user profile to mark as Employer
        setDoc(userDocRef, { 
            companyProfile: companyData,
            accountType: "Employer",
            lastUpdated: new Date().toISOString()
        }, { merge: true });

        // 2. Add the first job posting to a separate collection
        addDoc(jobPostingsCollectionRef, jobData);
        
        showModalMessage(`Company ${formData.companyName} registered and job posted successfully!`, false);
    } catch (error) {
        console.error("Error saving employer data:", error);
        showModalMessage("Failed to register company/post job. Database error.", true);
    }
}

/**
 * Handles the click event for "View Jobs" buttons in the Location section.
 */
function handleLocationView(event) {
    event.preventDefault();
    const button = event.target;
    const locationName = button.getAttribute('data-location');
    
    // Conditional Logic: Check user status before filtering
    if (isAuthenticated) {
        showModalMessage(`Redirecting to job board filtered by ${locationName}...`, false);
        // Simulate a job filtering redirect (not actually implemented as a new page here)
        setTimeout(() => {
            console.log(`Job filter simulated for ${locationName}`);
        }, 1500);
    } else {
        showModalMessage(`Please log in first to view job listings in ${locationName}. Redirecting to login.`, true);
        // Suggest action
        setTimeout(() => {
            window.location.href = 'login&register.html'; 
        }, 1000);
    }
}


// --- 5. INITIALIZATION AND EVENT LISTENERS ---

/**
 * Main initialization function.
 */
async function initializeApp() {
    try {
        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);

        if (initialAuthToken) {
            await signInWithCustomToken(auth, initialAuthToken);
        } else {
            await signInAnonymously(auth);
        }

        // 1. Set up Auth State Listener
        onAuthStateChanged(auth, (user) => {
            if (user) {
                currentUserId = user.uid;
                isAuthenticated = true;
                fetchUserProfile(currentUserId);
            } else {
                currentUserId = null;
                isAuthenticated = false;
                userAccountDetails = null;
                updateUIState();
            }
        });

        // 2. Attach Form Handlers (only attach if the form exists on the current page)
        if (loginForm) {
            loginForm.addEventListener('submit', handleLoginSubmit);
        }
        if (registerForm) {
            registerForm.addEventListener('submit', handleRegisterSubmit);
        }
        if (jobseekerForm) {
            jobseekerForm.addEventListener('submit', handleJobSeekerFormSubmit);
        }
        if (employerForm) {
            employerForm.addEventListener('submit', handleEmployerFormSubmit);
        }
        
        // 3. Attach Location Button Handlers (only attach if on location.html)
        document.querySelectorAll('.location-card .btn-primary').forEach(button => {
            button.addEventListener('click', handleLocationView);
        });

        console.log("Application initialized. Firebase Auth status is being monitored.");

    } catch (error) {
        console.error("Firebase Initialization Error:", error);
        showModalMessage("FATAL: Could not connect to the backend services.", true);
        isAuthenticated = false;
        updateUIState();
    }
}

/**
 * Fetches the user's profile data from Firestore in real-time.
 */
function fetchUserProfile(uid) {
    if (!uid) return;

    const profileDocRef = doc(db, getPrivateCollectionPath('user_profiles'), uid);

    // Use onSnapshot for real-time updates (dynamic experience)
    onSnapshot(profileDocRef, (docSnap) => {
        if (docSnap.exists()) {
            userAccountDetails = docSnap.data();
            console.log("User Profile Loaded:", userAccountDetails);
        } else {
            userAccountDetails = null;
            console.log("Authenticated but no user profile found.");
        }
        updateUIState();
    }, (error) => {
        console.error("Error fetching user profile:", error);
        userAccountDetails = null;
        updateUIState();
    });
}

// Start the application after the DOM is fully loaded
document.addEventListener('DOMContentLoaded', initializeApp);