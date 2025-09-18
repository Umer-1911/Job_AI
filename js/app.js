/* Jobu — app.js
   Put this in js/app.js
   This file:
   - handles demo register/login flows (calls server endpoints if available)
   - protects AI actions (requires login)
   - provides fallbacks so the demo runs without backend (localStorage)
*/

const serverPaths = {
    register: '/php/register.php',
    login: '/php/login.php',
    check: '/php/check_session.php',
    subscribe: '/php/subscribe.php',
    geminiProxy: '/api/generate' // your secure server-side proxy to Gemini
};

let serverAvailable = false;

// small utility
async function probeServer() {
    try {
        const res = await fetch(serverPaths.check, { method: 'GET' });
        if (res.ok) {
            serverAvailable = true;
            return await res.json();
        }
    } catch (e) {
        serverAvailable = false;
    }
    return null;
}

function setLoggedInUI(user) {
    document.getElementById('nav-login')?.classList?.add('hidden');
    const navLogged = document.getElementById('nav-logged');
    if (navLogged) {
        document.getElementById('nav-username').textContent = user?.name || user?.email || 'User';
        navLogged.style.display = 'inline-flex';
    }
    const loginBtns = document.querySelectorAll('.subscribe'); // keep subscribe visible but require login for server calls
    loginBtns.forEach(b => b.disabled = false);
}

function setLoggedOutUI() {
    document.getElementById('nav-login')?.classList?.remove('hidden');
    const navLogged = document.getElementById('nav-logged');
    if (navLogged) navLogged.style.display = 'none';
}

// Demo/local auth helpers (fallback)
function saveLocalUser(payload) {
    localStorage.setItem('jobu_user', JSON.stringify(payload));
}
function getLocalUser() {
    try {
        return JSON.parse(localStorage.getItem('jobu_user'));
    } catch (e) { return null; }
}
function setLocalLoggedIn(email) {
    localStorage.setItem('jobu_logged_in', email);
}
function getLocalLoggedIn() {
    return localStorage.getItem('jobu_logged_in') || null;
}
function logoutLocal() {
    localStorage.removeItem('jobu_logged_in');
}

// register
async function handleRegister(e) {
    e.preventDefault();
    const name = document.getElementById('regName')?.value?.trim();
    const email = document.getElementById('regEmail')?.value?.trim();
    const password = document.getElementById('regPassword')?.value?.trim();
    if (!email || !password || !name) return alert('Please fill all fields.');

    // If server exists, prefer server registration
    if (serverAvailable) {
        try {
            const res = await fetch(serverPaths.register, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, password })
            });
            const json = await res.json();
            if (res.ok) {
                alert(json.message || 'Registered. Please login.');
                window.location.href = 'login.html';
                return;
            } else {
                alert(json.error || 'Registration failed.');
            }
        } catch (err) {
            console.warn('Server error registering:', err);
        }
    }

    // Demo fallback: store locally (never use for production)
    saveLocalUser({ name, email, password });
    alert('Registered (demo, local). Please login.');
    window.location.href = 'login.html';
}

// login
async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail')?.value?.trim();
    const password = document.getElementById('loginPassword')?.value?.trim();
    if (!email || !password) return alert('Please fill all fields.');

    if (serverAvailable) {
        try {
            const res = await fetch(serverPaths.login, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const json = await res.json();
            if (res.ok && json.loggedIn) {
                // server session active
                setLoggedInUI(json.user);
                setLocalLoggedIn(json.user.email);
                window.location.href = 'index.html';
                return;
            } else {
                alert(json.error || 'Invalid credentials.');
            }
        } catch (err) {
            console.warn('Server login error', err);
        }
    }

    // local fallback
    const stored = getLocalUser();
    if (stored && stored.email === email && stored.password === password) {
        setLocalLoggedIn(email);
        setLoggedInUI(stored);
        alert('Login successful (demo).');
        window.location.href = 'index.html';
        return;
    }
    alert('Invalid credentials.');
}

// logout (both server and local)
async function logout() {
    if (serverAvailable) {
        try {
            await fetch('/php/logout.php', { method: 'POST' });
        } catch (e) { /* ignore*/ }
    }
    logoutLocal();
    setLoggedOutUI();
    window.location.href = 'index.html';
}

// protect AI/subscribe: require login
function requireAuth() {
    // prefer server check
    if (serverAvailable) {
        // frontend will rely on server endpoints for enforcement in real app
        // here we try local check as well
    }
    const logged = getLocalLoggedIn();
    if (!logged && !serverAvailable) {
        alert('Please register / login to use this feature (demo).');
        window.location.href = 'login.html';
        return false;
    }
    return true;
}

// search job results (simple demo generator)
function searchJobs(q) {
    const query = q || document.getElementById('q')?.value?.trim() || '';
    const results = document.getElementById('job-results');
    results.innerHTML = '';
    const titles = [
        query ? `${query} Specialist` : 'AI Job Match Engineer',
        query ? `Junior ${query}` : 'Assistant Analyst',
        query ? `Senior ${query}` : 'Project Lead'
    ];
    titles.forEach((t, i) => {
        const el = document.createElement('div');
        el.className = 'card job-card';
        el.innerHTML = `<h3>${t}</h3><p class="muted">Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p><div class="muted small">City ${i + 1} • PKR ${80 * (i + 1)}k-${150 * (i + 1)}k</div>`;
        results.appendChild(el);
    });
}

// call Gemini — safe client: POST to '/api/generate' (server proxy). Do not place API keys client-side.
async function callGemini(prompt) {
    if (!requireAuth()) return;
    const text = prompt || document.getElementById('aiPrompt')?.value?.trim();
    if (!text) return alert('Please enter a prompt.');

    const status = document.getElementById('aiStatus');
    const output = document.getElementById('aiOutput');
    status.textContent = 'Thinking...';
    output.textContent = '';

    try {
        const res = await fetch(serverPaths.geminiProxy, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: text })
        });
        if (!res.ok) throw new Error('Server returned ' + res.status);
        const json = await res.json();
        // Expect server to return { output: "..." }
        output.textContent = json.output || JSON.stringify(json);
        status.textContent = 'Done';
    } catch (err) {
        // If proxy not available, provide a demo reply
        console.warn('Gemini proxy error', err);
        output.textContent = `Demo response for prompt: "${text}".\n\n1) Suggested skill: Networking fundamentals\n2) Suggested course: CCNA / Linux basics\n---\nLorem ipsum dolor sit amet.`;
        status.textContent = 'Demo';
    }
}

// subscription handler (demo)
async function subscribePlan(planId) {
    if (!requireAuth()) return;
    // If server present, call subscribe endpoint
    if (serverAvailable) {
        try {
            const res = await fetch(serverPaths.subscribe, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ plan: planId })
            });
            if (res.ok) {
                alert('Subscription successful! Check your account.');
                return;
            }
        } catch (e) {
            console.warn('Server subscribe error', e);
        }
    }
    // Demo local subscription
    const email = getLocalLoggedIn();
    if (!email) return alert('Please login to subscribe (demo).');
    localStorage.setItem('jobu_subscription', JSON.stringify({ email, plan: planId, when: Date.now() }));
    alert(`Subscribed to ${planId} (demo).`);
}

// wire up event listeners
document.addEventListener('DOMContentLoaded', async () => {
    // probe for server support (non-blocking)
    await probeServer();

    // update UI from local login if available
    const loggedEmail = getLocalLoggedIn();
    const localUser = getLocalUser();
    if (loggedEmail && localUser && localUser.email === loggedEmail) {
        setLoggedInUI(localUser);
    } else {
        setLoggedOutUI();
    }

    // wire login/register forms
    const registerForm = document.getElementById('registerForm');
    if (registerForm) registerForm.addEventListener('submit', handleRegister);

    const loginForm = document.getElementById('loginForm');
    if (loginForm) loginForm.addEventListener('submit', handleLogin);

    // logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', (e) => { e.preventDefault(); logout(); });

    // search
    document.getElementById('searchBtn')?.addEventListener('click', (e) => { e.preventDefault(); searchJobs(); });

    // simple initial results
    searchJobs();

    // AI button
    document.getElementById('aiBtn')?.addEventListener('click', (e) => { e.preventDefault(); callGemini(); });

    // subscribe buttons
    document.querySelectorAll('.subscribe').forEach(btn => {
        btn.addEventListener('click', (ev) => {
            const plan = btn.getAttribute('data-plan');
            subscribePlan(plan);
        });
    });
});
