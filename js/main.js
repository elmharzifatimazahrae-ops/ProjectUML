// ── 1. STATE MANAGEMENT ──────────────────────────────────────
const STORAGE_KEY = 'creditAppState';
const API = 'https://projectuml-production-91b2.up.railway.app';

const DEFAULTS = {
  users: [
    {
      name: 'Administrator',
      firstName: 'Admin',
      email: 'admin@gmail.com',
      password: 'admin123',
      role: 'admin'
    }
  ],
  requests: [],
  session: null
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return JSON.parse(JSON.stringify(DEFAULTS));
    return Object.assign(JSON.parse(JSON.stringify(DEFAULTS)), JSON.parse(raw));
  } catch {
    return JSON.parse(JSON.stringify(DEFAULTS));
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getState() { return loadState(); }

function updateState(updater) {
  const state = getState();
  updater(state);
  saveState(state);
  return state;
}


// ── 2. AUTH ──────────────────────────────────────────────────
function hashPassword(password) {
  // Hash simple côté frontend pour comparaison
  // Le vrai hash SHA256 est fait côté backend
  return password;
}

function findUser(email) {
  const { users } = getState();
  return users.find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
}

function setSession(user) {
  updateState(state => { state.session = user; });
}

function clearSession() {
  updateState(state => { state.session = null; });
}

function getSession() {
  return getState().session;
}

function requireSession() {
  const session = getSession();
  if (!session) {
    window.location.href = 'index.html';
    return null;
  }
  return session;
}

function getUserRequests(email) {
  return getState().requests.filter(r => r.user_email === email);
}


// ── 3. TOAST ─────────────────────────────────────────────────
function toast(message) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}


// ── 4. PAGE INDEX ────────────────────────────────────────────
function renderIndex() {
  console.log('=== RENDER INDEX START ===');
  const session = getSession();
  console.log('Session:', session);
  if (session) {
    console.log('Redirecting to dashboard/admin');
    window.location.href = session.role === 'admin' ? 'admin.html' : 'dashboard.html';
    return;
  }

  const modal      = document.getElementById('login-modal');
  const closeBtn   = document.getElementById('close-login');
  const loginForm  = document.getElementById('login-form');
  const openBtns   = document.querySelectorAll('#open-login-cta');

  console.log('Elements found:');
  console.log('modal:', modal);
  console.log('closeBtn:', closeBtn);
  console.log('loginForm:', loginForm);
  console.log('openBtns count:', openBtns.length);

  // Debug logs
  console.log('renderIndex called');
  console.log('modal exists:', !!modal);
  console.log('openBtns found:', openBtns.length);
  openBtns.forEach((btn, i) => console.log(`Button ${i}:`, btn.id, btn));

  openBtns.forEach(btn => {
    if (btn) {
      console.log('Adding click listener to button:', btn.id);
      btn.addEventListener('click', () => {
        console.log('Button clicked!');
        modal?.classList.add('active');
      });
    }
  });
  
  closeBtn?.addEventListener('click', () => {
    console.log('Close button clicked');
    modal?.classList.remove('active');
  });
  modal?.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('active'); });

  loginForm?.addEventListener('submit', async e => {
    console.log('Login form submitted');
    e.preventDefault();
    const fd       = new FormData(loginForm);
    const email    = (fd.get('email') || '').trim();
    const password = (fd.get('password') || '').trim();

    console.log('Login attempt:', email, password ? '***' : '');

    try {
      console.log('Trying API login...');
      const res = await fetch(`${API}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      console.log('API response status:', res.status);
      if (res.ok) {
        const data = await res.json();
        console.log('Login successful:', data);
        setSession(data.user);
        updateState(state => {
          const exists = state.users.find(u => u.email === data.user.email);
          if (!exists) state.users.push(data.user);
        });
        toast('Connexion réussie');
        modal?.classList.remove('active');
        setTimeout(() => {
          window.location.href = data.user.role === 'admin' ? 'admin.html' : 'dashboard.html';
        }, 700);
        return;
      }
    } catch (err) {
      console.warn('[LOGIN] Backend inaccessible, tentative locale');
    }

    console.log('Falling back to local login...');
    const user = findUser(email);
    if (!user || user.password !== password) {
      console.log('Local login failed');
      toast('Email ou mot de passe incorrect.');
      return;
    }

    console.log('Local login successful');
    setSession(user);
    toast('Connexion réussie');
    modal?.classList.remove('active');
    setTimeout(() => {
      window.location.href = user.role === 'admin' ? 'admin.html' : 'dashboard.html';
    }, 700);
  });
}


// ── 5. PAGE INSCRIPTION ──────────────────────────────────────
function renderInscription() {
  console.log('=== RENDER INSCRIPTION START ===');
  const form = document.getElementById('signup-form');
  console.log('Signup form found:', form);

  form?.addEventListener('submit', async e => {
    console.log('Signup form submitted');
    e.preventDefault();
    const fd              = new FormData(form);
    const name            = (fd.get('name') || '').trim();
    const firstName       = (fd.get('firstName') || '').trim();
    const email           = (fd.get('email') || '').trim();
    const password        = (fd.get('password') || '').trim();
    const confirmPassword = (fd.get('confirmPassword') || '').trim();

    console.log('Signup data:', { name, firstName, email, password: password ? '***' : '', confirmPassword: confirmPassword ? '***' : '' });

    if (!name || !firstName || !email || !password || !confirmPassword) {
      console.log('Validation failed: missing fields');
      toast('Tous les champs sont requis.');
      return;
    }
    if (password !== confirmPassword) {
      console.log('Validation failed: password mismatch');
      toast('Les mots de passe ne correspondent pas.');
      return;
    }

    try {
      console.log('Trying API signup...');
      const res = await fetch(`${API}/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `${firstName} ${name}`, email, password })
      });

      console.log('API response status:', res.status);
      if (res.ok) {
        console.log('Signup successful');
        updateState(state => {
          if (!state.users.find(u => u.email === email)) {
            state.users.push({ name, firstName, email, password, role: 'user' });
          }
        });
        toast('Inscription réussie ! Connectez-vous.');
        setTimeout(() => { window.location.href = 'index.html'; }, 1000);
        return;
      }

      const err = await res.json();
      console.log('Signup API error:', err);
      toast(err.detail || 'Erreur lors de l\'inscription.');

    } catch (err) {
      console.log('API failed, trying local signup...');
      if (findUser(email)) {
        console.log('Local signup failed: user exists');
        toast('Email déjà utilisé.');
        return;
      }
      updateState(state => {
        state.users.push({ name, firstName, email, password, role: 'user' });
      });
      console.log('Local signup successful');
      toast('Inscription réussie ! Connectez-vous.');
      setTimeout(() => { window.location.href = 'index.html'; }, 1000);
    }
  });
}


// ── 6. DASHBOARD UTILISATEUR ─────────────────────────────────
function getStatusConfig(status) {
  const map = {
    'Accepté': {
      label: 'CRÉDIT ACCORDÉ',
      className: 'status-accepted',
      color: '#2ECC71',
      description: ''
    },
    'Pré-acceptation': {
      label: 'PRÉ-ACCORD EN ATTENTE',
      className: 'status-pre',
      color: '#F39C12',
      description: ''
    },
    'Refusé': {
      label: 'DEMANDE REFUSÉE',
      className: 'status-refused',
      color: '#E74C3C',
      description: ''
    },
    'Finalisé': {
      label: 'RENDEZ-VOUS CONFIRMÉ',
      className: 'status-finalized',
      color: '#27AE60',
      description: ''
    }
  };
  return map[status] || {
    label: 'EN TRAITEMENT',
    className: 'status-pending',
    color: '#C8A96E',
    description: ''
  };
}

function formatAppointmentDate(dateStr) {
  try {
    const date = new Date(dateStr);
    const options = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    };
    return date.toLocaleDateString('fr-FR', options);
  } catch {
    return dateStr;
  }
}

function extractRequestData(request) {
  const data = request?.data || {};
  return {
    loan:      data.LoanAmount       || 0,
    salary:    data.ApplicantIncome  || 0,
    duration:  data.Loan_Amount_Term || null,
    gender:    data.Gender           || '—',
    married:   data.Married          || '—',
    education: data.Education        || '—',
    selfEmp:   data.Self_Employed    || '—',
    credit:    data.CreditHistory != null
                 ? (data.CreditHistory === 1 ? 'Bon' : 'Mauvais') : '—',
    proba:     request.proba         || 0
  };
}

async function renderDashboard() {
  const session = requireSession();
  if (!session) return;
  if (session.role === 'admin') {
    window.location.href = 'admin.html';
    return;
  }

  const nameEl = document.getElementById('user-name');
  if (nameEl) nameEl.textContent = session.firstName || session.name;

  document.querySelectorAll('#logout-top').forEach(btn => {
    btn.addEventListener('click', () => {
      clearSession();
      window.location.href = 'index.html';
    });
  });

  try {
    const res = await fetch(`${API}/requests/${encodeURIComponent(session.email)}`);
    if (res.ok) {
      const backendReqs = await res.json();
      if (backendReqs.length) {
        updateState(state => {
          state.requests = state.requests.filter(r => r.user_email !== session.email);
          state.requests.push(...backendReqs);
        });
      }
    }
  } catch (err) {
    console.warn('[SYNC]', err.message);
  }

  renderCurrentRequest(session);
  setupFormSubmit(session);
  loadPreviousDataForUser(session);
  setupContactForm(session);
}

function renderCurrentRequest(session) {
  const userRequests = getUserRequests(session.email);
  const emptyState      = document.getElementById('empty-state');
  const requestFormCard = document.getElementById('request-form-card');
  const statusCard      = document.getElementById('status-card');

  if (!userRequests.length) {
    emptyState?.classList.remove('hidden');
    requestFormCard?.classList.remove('hidden');
    statusCard?.classList.add('hidden');
    return;
  }

  emptyState?.classList.add('hidden');
  requestFormCard?.classList.add('hidden');
  statusCard?.classList.remove('hidden');

  const last   = userRequests[userRequests.length - 1];
  const config = getStatusConfig(last.status);
  const badge  = document.getElementById('status-badge');

  if (badge) {
    badge.textContent = config.label;
    badge.className   = `status-badge ${config.className}`;
    badge.style.cssText = `
      color: ${config.color};
      font-weight: 700;
      font-size: 1.3rem;
      animation: pulse 2s infinite;
    `;
  }

  const summaryEl = document.getElementById('status-summary');
  if (summaryEl && last.explanation && last.explanation.length > 10) {

    if (last.status === 'Refusé') {
      // Affichage structuré pour le refus avec SHAP
      const lines = last.explanation
        .split('\n')
        .filter(l => l.trim().length > 0);

      let html = '<div class="ai-explanation-card refus-card">';
      html += '<div class="ai-explanation-header">';
      html += '<span></span><span>Analyse détaillée de votre dossier</span>';
      html += '</div>';
      html += '<div class="ai-explanation-body">';

      lines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed.match(/^\d+\./)) {
          // Ligne numérotée = titre de raison
          html += `<p style="font-weight:600;margin-top:0.75rem;color:#E74C3C;">${trimmed}</p>`;
        } else if (trimmed.startsWith('•')) {
          // Bullet point
          html += `<p style="margin-left:1rem;margin-bottom:0.3rem;">${trimmed}</p>`;
        } else if (trimmed.startsWith('Conseil')) {
          // Conseil
          html += `<p style="
            background:rgba(243,156,18,0.08);
            border-left:3px solid #F39C12;
            padding:0.4rem 0.75rem;
            border-radius:0 6px 6px 0;
            margin:0.3rem 0 0.5rem 1rem;
            font-size:0.9rem;
            color:#666;
          ">${trimmed}</p>`;
        } else if (
          trimmed.includes('Plan d\'action') ||
          trimmed.includes('Raisons principales') ||
          trimmed.includes('Points favorables') ||
          trimmed.includes('Analyse financière')
        ) {
          // Titre de section
          html += `<p style="
            font-weight:700;
            margin-top:1rem;
            margin-bottom:0.4rem;
            color:#4d433c;
            border-bottom:1px solid rgba(200,169,110,0.2);
            padding-bottom:0.3rem;
          ">${trimmed}</p>`;
        } else {
          html += `<p style="margin-bottom:0.4rem;line-height:1.7;">${trimmed}</p>`;
        }
      });

      html += '</div></div>';
      summaryEl.innerHTML = html;

    } else {
      // Cas accepté : pas d'explication détaillée
      summaryEl.innerHTML = `
        <div class="ai-explanation-card" style="border-color: #2ECC71; background: #D5F4E6;">
          <div class="ai-explanation-header">
            <span>✅</span>
            <span>Félicitations !</span>
          </div>
          <div class="ai-explanation-body">
            <p style="line-height:1.75; color: #27AE60;">Votre demande de crédit a été approuvée.</p>
          </div>
        </div>`;
    }
  }

  const d = extractRequestData(last);
  const summaryGrid = document.getElementById('summary-grid');
  if (summaryGrid) {
    summaryGrid.innerHTML = `
      <div><strong>Montant</strong><p>${d.loan ? d.loan + ' €' : '—'}</p></div>
      <div><strong>Salaire</strong><p>${d.salary ? d.salary + ' €' : '—'}</p></div>
      <div><strong>Durée</strong><p>${d.duration ? d.duration + ' mois' : '—'}</p></div>
      <div><strong>Date</strong><p>${last.date}</p></div>`;
  }

  const steps = {
    'step-in-progress': document.getElementById('step-in-progress'),
    'step-decision':    document.getElementById('step-decision'),
    'step-final':       document.getElementById('step-final')
  };
  Object.values(steps).forEach(s => s?.classList.remove('active', 'completed'));
  if (last.status === 'Pré-acceptation') {
    steps['step-in-progress']?.classList.add('active');
  } else if (last.status === 'Accepté' || last.status === 'Refusé') {
    steps['step-in-progress']?.classList.add('completed');
    steps['step-decision']?.classList.add('active');
  } else if (last.status === 'Finalisé') {
    steps['step-in-progress']?.classList.add('completed');
    steps['step-decision']?.classList.add('completed');
    steps['step-final']?.classList.add('active');
  }

  const rejCard      = document.getElementById('rejection-card');
  const apprvContact = document.getElementById('approved-contact');
  const apptCard     = document.getElementById('appointment-card');

  if (last.status === 'Refusé') {
    if (rejCard) {
      rejCard.style.display = 'block';
      let reasonsHtml = '';
      if (last.impact && last.impact.length) {
        // Mapping des noms techniques vers des noms lisibles
        const featureLabels = {
          'num__ApplicantIncome': 'Revenus du demandeur insuffisants',
          'num__LoanAmount': 'Montant du crédit demandé trop élevé',
          'num__CreditHistory': 'Historique de crédit défavorable',
          'num__Loan_Amount_Term': 'Durée de remboursement inadaptée',
          'cat__Gender_Male': 'Genre masculin',
          'cat__Gender_Female': 'Genre féminin',
          'cat__Married_Yes': 'Situation maritale (marié)',
          'cat__Married_No': 'Situation maritale (célibataire)',
          'cat__Education_Graduate': 'Niveau d\'éducation (diplômé)',
          'cat__Education_Not Graduate': 'Niveau d\'éducation (non diplômé)',
          'cat__Self_Employed_Yes': 'Statut auto-entrepreneur',
          'cat__Self_Employed_No': 'Statut salarié'
        };

        // Trier par impact absolu décroissant
        const sortedImpact = last.impact.slice().sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));

        // Filtrer les doublons one-hot
        const filteredImpact = [];
        const seenBases = new Set();
        for (const [feature, value] of sortedImpact) {
          if (feature.startsWith('cat__')) {
            const base = feature.replace('cat__', '').split('_')[0];
            if (!seenBases.has(base)) {
              filteredImpact.push([feature, value]);
              seenBases.add(base);
            }
          } else {
            filteredImpact.push([feature, value]);
          }
        }

        reasonsHtml = filteredImpact.slice(0, 5).map(([feature, value]) => {
          const label = featureLabels[feature] || feature;
          const isNeg = value < 0;
          const icon = isNeg ? '🔴' : '🟢';
          const barWidth = Math.min(Math.abs(value) * 100, 100);
          return `
            <div class="shap-item" style="border: 1px solid rgba(231, 76, 60, 0.3); background: rgba(231, 76, 60, 0.05); padding: 1rem; border-radius: 8px; margin-bottom: 0.5rem; animation: fadeIn 0.5s ease-in;">
              <div style="display: flex; align-items: center; gap: 0.5rem;">
                <span>${icon}</span>
                <span style="flex: 1; font-weight: 500;">${label}</span>
                <div style="width: 60px; background: #eee; border-radius: 4px; height: 6px;">
                  <div style="width: ${barWidth}%; background: ${isNeg ? '#E74C3C' : '#2ECC71'}; height: 6px; border-radius: 4px;"></div>
                </div>
              </div>
            </div>`;
        }).join('');
      } else {
        // Fallback : afficher l'explication textuelle si impact vide
        if (last.explanation && last.explanation.trim().length > 0) {
          const lines = last.explanation
            .split('\n')
            .filter(l => l.trim().length > 0)
            .map(line => {
              const trimmed = line.trim();
              if (trimmed.match(/^\d+\./)) {
                return `<p style="font-weight:600;margin-top:0.75rem;color:#E74C3C;">${trimmed}</p>`;
              } else if (trimmed.startsWith('•')) {
                return `<p style="margin-left:1rem;margin-bottom:0.3rem;">${trimmed}</p>`;
              } else if (trimmed.startsWith('Conseil')) {
                return `<p style="background:rgba(243,156,18,0.08);border-left:3px solid #F39C12;padding:0.4rem 0.75rem;border-radius:0 6px 6px 0;margin:0.3rem 0 0.5rem 1rem;font-size:0.9rem;color:#666;">${trimmed}</p>`;
              } else if (trimmed.includes('Plan d\'action') || trimmed.includes('Raisons principales') || trimmed.includes('Points favorables') || trimmed.includes('Analyse financière')) {
                return `<p style="font-weight:700;margin-top:1rem;margin-bottom:0.4rem;color:#4d433c;border-bottom:1px solid rgba(200,169,110,0.2);padding-bottom:0.3rem;">${trimmed}</p>`;
              } else {
                return `<p style="margin-bottom:0.4rem;line-height:1.7;">${trimmed}</p>`;
              }
            })
            .join('');
          reasonsHtml = lines;
        } else {
          reasonsHtml = '<p style="text-align: center; color: #666;">Explication non disponible pour ce dossier</p>';
        }
      }
      const reasonsEl = document.getElementById('rejection-reasons');
      if (reasonsEl) {
        reasonsEl.innerHTML = `${reasonsHtml}
          <div style="margin-top: 1rem; padding: 1rem; background: #f8f9fa; border-radius: 8px; text-align: center; color: #666;">
            Vous pouvez soumettre une nouvelle demande après 3 mois. Un conseiller reste disponible pour vous accompagner.
          </div>`;
      }
    }
    if (apprvContact) apprvContact.style.display = 'none';
    if (apptCard)     apptCard.style.display     = 'none';
  } else if (last.status === 'Accepté' || last.status === 'Finalisé') {
    if (rejCard) rejCard.style.display = 'none';
    if (last.appointment?.status === 'confirmed') {
      if (apptCard) {
        apptCard.style.display = 'block';
        document.getElementById('appointment-details').innerHTML = `
          <div><strong> Agence</strong><span>${last.appointment.agency}</span></div>
          <div><strong> Date</strong><span>${formatAppointmentDate(last.appointment.date)}</span></div>
          <div><strong> Heure</strong><span>${last.appointment.time}</span></div>
          <div><strong> Téléphone</strong><span>${last.appointment.phone}</span></div>`;
      }
      if (apprvContact) apprvContact.style.display = 'none';
    } else if (last.contact?.status === 'pending') {
      // Contact en attente de confirmation
      if (apprvContact) apprvContact.style.display = 'none';
      if (apptCard) apptCard.style.display = 'none';
      // Afficher un message d'attente
      const statusSummary = document.getElementById('status-summary');
      if (statusSummary) {
        statusSummary.innerHTML = `
          <div class="ai-explanation-card" style="border-color: #FFC107; background: #FFF3CD;">
            <div class="ai-explanation-header">
              <span>⏳</span>
              <span>Contact en attente de confirmation</span>
            </div>
            <div class="ai-explanation-body">
              <p>Votre demande de contact a bien été transmise à l'agence.</p>
              <p>Veuillez patienter, une confirmation vous sera envoyée prochainement.</p>
              <p>Sans confirmation, votre dossier ne pourra pas être finalisé.</p>
            </div>
          </div>`;
      }
    } else {
      if (apprvContact) apprvContact.style.display = 'block';
      if (apptCard)     apptCard.style.display     = 'none';
    }
  } else {
    if (rejCard)      rejCard.style.display      = 'none';
    if (apprvContact) apprvContact.style.display = 'none';
    if (apptCard)     apptCard.style.display     = 'none';
  }
}

async function loadPreviousDataForUser(session) {
  if (!session || !session.email) return;
  
  try {
    const res = await fetch(`${API}/last-request/${encodeURIComponent(session.email)}`);
    if (!res.ok) return;
    
    const data = await res.json();
    if (!data || Object.keys(data).length === 0) return;
    
    // Pré-remplir le formulaire avec les données précédentes
    const form = document.getElementById('request-form');
    if (!form) return;
    
    if (data.Gender) form.querySelector('select[name="Gender"]').value = data.Gender;
    if (data.Married) form.querySelector('select[name="Married"]').value = data.Married === 'Yes' ? 'Married' : 'Célibataire';
    if (data.Education) form.querySelector('select[name="Education"]').value = data.Education;
    if (data.Self_Employed) form.querySelector('select[name="Self_Employed"]').value = data.Self_Employed === 'Yes' ? 'Yes' : 'No';
    if (data.ApplicantIncome) form.querySelector('input[name="ApplicantIncome"]').value = data.ApplicantIncome;
    if (data.LoanAmount) form.querySelector('input[name="LoanAmount"]').value = data.LoanAmount;
    if (data.Loan_Amount_Term) form.querySelector('input[name="Loan_Amount_Term"]').value = data.Loan_Amount_Term;
    if (data.CreditHistory) form.querySelector('select[name="CreditHistory"]').value = data.CreditHistory;
  } catch (err) {
    console.error('[LOAD PREVIOUS]', err);
  }
}

function setupFormSubmit(session) {
  const form = document.getElementById('request-form');
  form?.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(form);

    const gender        = fd.get('Gender')           || '';
    const married       = fd.get('Married')          || '';
    const education     = fd.get('Education')        || '';
    const selfEmployed  = fd.get('Self_Employed')    || '';
    const income        = Number(fd.get('ApplicantIncome'));
    const loanAmount    = Number(fd.get('LoanAmount'));
    const loanTerm      = Number(fd.get('Loan_Amount_Term'));
    const creditHistory = Number(fd.get('CreditHistory'));

    if (!gender || !married || !education || !selfEmployed || 
        isNaN(income) || income < 0 || 
        isNaN(loanAmount) || loanAmount <= 0 || 
        isNaN(loanTerm) || loanTerm <= 0) {
      toast('Merci de compléter tous les champs avec des valeurs valides.');
      return;
    }

    toast('⏳ Analyse de votre dossier...');

    try {
      const res = await fetch(`${API}/predict_form`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_email:       session.email,
          user_name:        session.name || session.firstName,
          Gender:           gender,
          ApplicantIncome:  income,
          LoanAmount:       loanAmount,
          Married:          married === 'Married' ? 'Yes' : 'No',
          CreditHistory:    creditHistory,
          Education:        education,
          Self_Employed:    selfEmployed,
          Loan_Amount_Term: loanTerm
        })
      });

      if (!res.ok) throw new Error(`Erreur serveur ${res.status}`);
      const result = await res.json();

      updateState(state => state.requests.push({
        user_name:       session.name,
        user_email:      session.email,
        date:            new Date().toLocaleString('fr-FR', { hour12: false }),
        data: {
          Gender: gender, ApplicantIncome: income, LoanAmount: loanAmount,
          Married: married, CreditHistory: creditHistory,
          Education: education, Self_Employed: selfEmployed,
          Loan_Amount_Term: loanTerm
        },
        result:          result.result,
        proba:           result.proba,
        status:          result.status,
        explanation:     result.explanation,
        impact:          result.impact || [],
        recommendations: result.recommendations || ''
      }));

      window.location.href = 'confirmation.html';
    } catch (err) {
      console.error('[FORM]', err);
      toast('❌ Erreur : ' + err.message);
    }
  });
}

function setupContactForm(session) {
  const contactForm = document.getElementById('contact-form');
  contactForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const fd     = new FormData(contactForm);
    const agency = (fd.get('agency') || '').trim();
    const phone  = (fd.get('phone')  || '').trim();

    if (!agency || !phone) {
      toast('Remplissez tous les champs.');
      return;
    }

    const userReqs = getUserRequests(session.email);
    const last     = userReqs[userReqs.length - 1];
    if (!last) {
      toast('Aucune demande trouvée.');
      return;
    }

    try {
      const res = await fetch(`${API}/requests/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_email: session.email,
          date:       last.date,
          agency,
          phone
        })
      });
      if (!res.ok) throw new Error('Erreur serveur');
    } catch (err) {
      console.warn('[CONTACT-BACKEND]', err.message);
    }

    updateState(state => {
      const item = state.requests.find(
        r => r.user_email === session.email && r.date === last.date
      );
      if (item) {
        item.contact = {
          agency, phone,
          date:   new Date().toLocaleString('fr-FR', { hour12: false }),
          status: 'pending'
        };
      }
    });

    contactForm.style.display = 'none';
    const confirmation = document.getElementById('contact-confirmation');
    if (confirmation) confirmation.style.display = 'block';
    toast('Demande de contact envoyée');
  });
}


// ── 7. PAGE ADMIN ────────────────────────────────────────────
async function renderAdmin() {
  const session = requireSession();
  if (!session || session.role !== 'admin') {
    window.location.href = 'index.html';
    return;
  }

  const nameEl = document.getElementById('admin-name');
  if (nameEl) nameEl.textContent = session.firstName || session.name;

  document.querySelectorAll('#logout-top').forEach(btn => {
    btn.addEventListener('click', () => {
      clearSession();
      window.location.href = 'index.html';
    });
  });

  const detailModal = document.getElementById('detail-modal');
  const detailClose = document.getElementById('detail-close');

  function closeModal() {
    detailModal?.classList.remove('active');
    // Détruire tous les graphes
    ['shapChart','gaugeChart','radarChart'].forEach(k => {
      if (window[k]) { window[k].destroy(); window[k] = null; }
    });
  }

  detailClose?.addEventListener('click', closeModal);
  detailModal?.addEventListener('click', e => { if (e.target === detailModal) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  const filterSelect  = document.getElementById('filter-status');
  const refreshBtn    = document.getElementById('refresh-admin');

  refreshBtn?.addEventListener('click', () => renderAdminTable(filterSelect?.value || 'all'));
  filterSelect?.addEventListener('change', () => renderAdminTable(filterSelect.value));

  await renderAdminTable('all');
}

async function renderAdminTable(filter) {
  try {
    const res = await fetch(`${API}/requests`);
    if (res.ok) {
      const backendReqs = await res.json();
      updateState(state => { state.requests = backendReqs; });
    }
  } catch (err) {
    console.warn('[ADMIN-SYNC]', err.message);
  }

  const state    = getState();
  const all      = state.requests.slice().reverse();
  const items    = filter === 'all' ? all : all.filter(r => r.status === filter);

  const totalEl    = document.getElementById('admin-total');
  const pendingEl  = document.getElementById('admin-pending');
  const acceptedEl = document.getElementById('admin-accepted');
  const finalizedEl = document.getElementById('admin-finalized');
  const refusedEl  = document.getElementById('admin-refused');

  if (totalEl)     totalEl.textContent     = all.length;
  if (pendingEl)   pendingEl.textContent   = all.filter(r => r.status === 'Pré-acceptation').length;
  if (acceptedEl)  acceptedEl.textContent  = all.filter(r => r.status === 'Accepté').length;
  if (finalizedEl) finalizedEl.textContent = all.filter(r => r.status === 'Finalisé').length;
  if (refusedEl)   refusedEl.textContent   = all.filter(r => r.status === 'Refusé').length;

  const tableContainer = document.getElementById('admin-table');
  if (!tableContainer) return;

  if (!items.length) {
    tableContainer.innerHTML = '<div class="glass-inner" style="padding:2rem;text-align:center;color:#888;">Aucune demande trouvée.</div>';
    return;
  }

  const rows = items.map((req, i) => {
    const statusClass = req.status === 'Accepté' || req.status === 'Finalisé' ? 'accepted'
      : req.status === 'Refusé' ? 'refused' : 'pre';

    const hasContact  = !!(req.contact?.phone);
    const canContact  = (req.status === 'Accepté' || req.status === 'Pré-acceptation' || req.status === 'Finalisé') && hasContact;
    const contactBtn  = canContact
      ? `<button class="admin-btn admin-btn-contact view-contact"
           data-email="${req.user_email}" data-date="${req.date}">
           Contact
         </button>`
      : '';

    return `
      <tr>
        <td>${i + 1}</td>
        <td><strong>${req.user_name}</strong></td>
        <td>${req.user_email}</td>
        <td>${req.date}</td>
        <td><span class="status-pill ${statusClass}">${req.status}</span></td>
        <td>
          <div class="action-row">
            <select class="admin-select"
                    data-email="${req.user_email}"
                    data-date="${req.date}">
              <option value="Pré-acceptation" ${req.status==='Pré-acceptation'?'selected':''}>Pré-acceptation</option>
              <option value="Accepté"         ${req.status==='Accepté'        ?'selected':''}>Accepté</option>
              <option value="Finalisé"        ${req.status==='Finalisé'       ?'selected':''}>Finalisé</option>
              <option value="Refusé"          ${req.status==='Refusé'         ?'selected':''}>Refusé</option>
            </select>
            <button class="admin-btn admin-btn-secondary apply-status"
                    data-email="${req.user_email}" data-date="${req.date}">
              Appliquer
            </button>
            <button class="admin-btn admin-btn-outline view-detail"
                    data-email="${req.user_email}" data-date="${req.date}">
              Voir
            </button>
            ${contactBtn}
          </div>
        </td>
      </tr>`;
  }).join('');

  tableContainer.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Utilisateur</th>
          <th>Email</th>
          <th>Date</th>
          <th>Statut</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;

  document.querySelectorAll('.apply-status').forEach(btn => {
    btn.addEventListener('click', async () => {
      const email  = btn.dataset.email;
      const date   = btn.dataset.date;
      const select = btn.closest('td')?.querySelector('select');
      const status = select?.value;
      if (!status) return;

      try {
        await fetch(`${API}/requests/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_email: email, date, new_status: status })
        });
      } catch (err) {
        console.warn('[STATUS-UPDATE]', err.message);
      }

      updateState(state => {
        const item = state.requests.find(r => r.user_email === email && r.date === date);
        if (item) item.status = status;
      });

      toast('Statut mis à jour');
      await renderAdminTable(filter);
    });
  });

  document.querySelectorAll('.view-detail').forEach(btn => {
    btn.addEventListener('click', () => {
      const email = btn.dataset.email;
      const date  = btn.dataset.date;
      const req   = getState().requests.find(r => r.user_email === email && r.date === date);
      if (req) openDetailModal(req);
    });
  });

  document.querySelectorAll('.view-contact').forEach(btn => {
    btn.addEventListener('click', () => {
      const email = btn.dataset.email;
      const date  = btn.dataset.date;
      const req   = getState().requests.find(r => r.user_email === email && r.date === date);
      if (req) openContactModal(req);
    });
  });
}

function buildShapChart(ctx, req) {
  const impact = req.impact || [];
  if (!impact.length) return null;

  const labels = impact.map(([f]) => f
    .replace('cat__Gender_', 'Genre : ')
    .replace('cat__Married_', 'Marié : ')
    .replace('cat__Education_', 'Éducation : ')
    .replace('cat__Self_Employed_', 'Auto-emp : ')
    .replace('num__ApplicantIncome', 'Salaire')
    .replace('num__LoanAmount', 'Montant crédit')
    .replace('num__Loan_Amount_Term', 'Durée')
    .replace('num__CreditHistory', 'Historique crédit')
  );

  const values  = impact.map(([, v]) => parseFloat(v));
  const colors  = values.map(v => v >= 0
    ? 'rgba(46, 204, 113, 0.85)'   // vert = favorable
    : 'rgba(231, 76, 60, 0.85)'    // rouge = défavorable
  );

  return new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Impact sur la décision',
        data:   values,
        backgroundColor: colors,
        borderRadius: 6,
      }]
    },
    options: {
      indexAxis: 'y',        // barres horizontales
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const v = ctx.raw;
              return v >= 0
                ? `✅ Favorable (+${v.toFixed(3)})`
                : `❌ Défavorable (${v.toFixed(3)})`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(0,0,0,0.05)' },
          ticks: { color: '#4d433c' },
          title: {
            display: true,
            text: '← Défavorable       Favorable →',
            color: '#4d433c',
            font: { size: 11 }
          }
        },
        y: { ticks: { color: '#4d433c', font: { size: 11 } } }
      }
    }
  });
}

function buildGaugeChart(ctx, proba) {
  const pct      = Math.round(proba * 100);
  const remaining = 100 - pct;

  // Couleur selon le niveau de risque
  const color = pct >= 70 ? '#2ECC71'    // vert : bon dossier
              : pct >= 45 ? '#F39C12'    // orange : dossier limite
              :              '#E74C3C';  // rouge : dossier risqué

  const label = pct >= 70 ? 'Dossier solide'
              : pct >= 45 ? 'Dossier limite'
              :              'Dossier risqué';

  return new Chart(ctx, {
    type: 'doughnut',
    data: {
      datasets: [{
        data: [pct, remaining],
        backgroundColor: [color, 'rgba(0,0,0,0.06)'],
        borderWidth: 0,
        circumference: 180,   // demi-cercle = jauge
        rotation: -90
      }]
    },
    plugins: [{
      id: 'gaugeText',
      afterDraw(chart) {
        const { ctx, width, height } = chart;
        ctx.save();
        ctx.font        = 'bold 2rem Montserrat, sans-serif';
        ctx.fillStyle   = color;
        ctx.textAlign   = 'center';
        ctx.textBaseline= 'middle';
        ctx.fillText(`${pct}%`, width / 2, height * 0.72);
        ctx.font        = '0.9rem Montserrat, sans-serif';
        ctx.fillStyle   = '#4d433c';
        ctx.fillText(label, width / 2, height * 0.86);
        ctx.restore();
      }
    }],
    options: {
      responsive: true,
      cutout: '75%',
      plugins: {
        legend:  { display: false },
        tooltip: { enabled: false }
      }
    }
  });
}

function buildRadarChart(ctx, req) {
  const d = extractRequestData(req);

  // Normaliser chaque valeur entre 0 et 100
  const salaryScore  = Math.min((d.salary  / 10000) * 100, 100);
  const loanRatio    = d.salary > 0
    ? Math.max(100 - ((d.loan / (d.salary * 12)) * 100), 0)
    : 0;
  const termScore    = d.duration
    ? Math.min((d.duration / 480) * 100, 100) : 50;
  const creditScore  = d.credit === 'Bon' ? 100 : 20;
  const eduScore     = d.education === 'Graduate' ? 100 : 60;
  const empScore     = d.selfEmp === 'No' ? 85 : 60;

  return new Chart(ctx, {
    type: 'radar',
    data: {
      labels: [
        'Salaire',
        'Ratio crédit/revenu',
        'Durée',
        'Historique crédit',
        'Éducation',
        'Stabilité emploi'
      ],
      datasets: [
        {
          label: 'Profil demandeur',
          data:  [salaryScore, loanRatio, termScore, creditScore, eduScore, empScore],
          backgroundColor: 'rgba(197, 155, 95, 0.2)',
          borderColor:     '#c59b5f',
          pointBackgroundColor: '#c59b5f',
          borderWidth: 2
        },
        {
          label: 'Seuil recommandé',
          data:  [60, 60, 50, 80, 60, 70],
          backgroundColor: 'rgba(46, 204, 113, 0.08)',
          borderColor:     'rgba(46, 204, 113, 0.5)',
          borderDash:      [5, 5],
          borderWidth: 1.5,
          pointRadius: 0
        }
      ]
    },
    options: {
      responsive: true,
      scales: {
        r: {
          min: 0, max: 100,
          ticks:   { display: false },
          grid:    { color: 'rgba(0,0,0,0.07)' },
          pointLabels: {
            color: '#4d433c',
            font: { size: 11 }
          }
        }
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#4d433c', font: { size: 11 } }
        }
      }
    }
  });
}

function openDetailModal(req) {
  const modal  = document.getElementById('detail-modal');
  const title  = document.getElementById('detail-title');
  const info   = document.getElementById('detail-info');
  if (!modal) return;

  // Détruire les anciens graphes
  ['shapChart','gaugeChart','radarChart'].forEach(k => {
    if (window[k]) { window[k].destroy(); window[k] = null; }
  });

  const d    = extractRequestData(req);
  const prob = Math.round((d.proba || 0) * 100);

  if (title) title.textContent = `${req.user_name} — ${req.status}`;
  if (info) info.innerHTML = `
    <p><strong>Email :</strong> ${req.user_email}</p>
    <p><strong>Statut :</strong> ${req.status}</p>
    <p><strong>Probabilité :</strong> ${prob}%</p>
    <p><strong>Salaire :</strong> ${d.salary ? d.salary + ' €' : '—'}</p>
    <p><strong>Durée :</strong> ${d.duration ? d.duration + ' mois' : '—'}</p>
    <p><strong>Éducation :</strong> ${d.education}</p>
    <p><strong>Auto-entrepreneur :</strong> ${d.selfEmp}</p>
    <p><strong>Historique crédit :</strong> ${d.credit}</p>
    ${req.explanation && req.status === 'Refusé' ? `
      <hr style="margin:1rem 0;border:none;border-top:1px solid rgba(0,0,0,0.08);" />
      <p><strong>Analyse IA :</strong></p>
      <p style="font-size:0.9rem;color:#555;line-height:1.65;">${req.explanation}</p>` : ''}
  `;

  // Créer les 3 canvas dans la modale
  const isRefused = req.status === 'Refusé';
  const hasShap = req.impact && req.impact.length && isRefused; // SHAP seulement pour les refusés
  const chartsHtml = `
    <div class="chart-tabs">
      ${hasShap ? `<button class="chart-tab active" data-tab="shap">
        Impact variables
      </button>` : ''}
      <button class="chart-tab ${!hasShap ? 'active' : ''}" data-tab="gauge">
        Jauge de risque
      </button>
      <button class="chart-tab" data-tab="radar">
        🕸️ Profil global
      </button>
    </div>

    ${hasShap ? `<div class="chart-panel active" id="panel-shap">
      <canvas id="chart-shap"></canvas>
      <p class="chart-hint">
        Les barres vertes indiquent les facteurs qui jouent en faveur du demandeur,
        les rouges contre lui.
      </p>
    </div>` : ''}

    <div class="chart-panel ${!hasShap ? 'active' : ''}" id="panel-gauge">
      <canvas id="chart-gauge" style="max-height:220px;"></canvas>
      <p class="chart-hint">
        Probabilité calculée par le modèle ML.
        Au-dessus de 70% → dossier solide.
        Entre 45% et 70% → à examiner.
        En dessous de 45% → dossier risqué.
      </p>
    </div>

    <div class="chart-panel" id="panel-radar">
      <canvas id="chart-radar"></canvas>
      <p class="chart-hint">
        Comparaison du profil avec les critères standards d'acceptation.
        Plus la surface bleue dépasse la ligne verte, plus le dossier est solide.
      </p>
    </div>
  `;

  // Injecter dans la modale à la place de l'ancien canvas
  const chartZone = document.getElementById('chart-zone');
  if (chartZone) chartZone.innerHTML = chartsHtml;

  // Construire les 3 graphes
  const proba = (req.proba || 0);

  const shapCtx  = document.getElementById('chart-shap')?.getContext('2d');
  const gaugeCtx = document.getElementById('chart-gauge')?.getContext('2d');
  const radarCtx = document.getElementById('chart-radar')?.getContext('2d');

  if (shapCtx  && hasShap) window.shapChart  = buildShapChart(shapCtx, req);
  if (gaugeCtx) window.gaugeChart = buildGaugeChart(gaugeCtx, proba);
  if (radarCtx) window.radarChart = buildRadarChart(radarCtx, req);

  // Onglets
  document.querySelectorAll('.chart-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.chart-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.chart-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`panel-${tab.dataset.tab}`)?.classList.add('active');
    });
  });

  modal.classList.add('active');
}

function openContactModal(req) {
  const modal  = document.getElementById('detail-modal');
  const title  = document.getElementById('detail-title');
  const info   = document.getElementById('detail-info');
  const canvas = document.getElementById('detail-chart');
  if (!modal) return;

  // Détruire les anciens graphes
  ['shapChart','gaugeChart','radarChart'].forEach(k => {
    if (window[k]) { window[k].destroy(); window[k] = null; }
  });
  if (canvas) canvas.style.display = 'none';

  const contact        = req.contact || {};
  const hasAppointment = req.appointment?.status === 'confirmed';

  if (title) title.textContent = `Contact — ${req.user_name}`;
  if (info) info.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:0.75rem;">
      <div style="display:flex;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid rgba(0,0,0,0.06);">
        <span>Utilisateur</span><strong>${req.user_name}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid rgba(0,0,0,0.06);">
        <span>Email</span><strong>${req.user_email}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid rgba(0,0,0,0.06);">
        <span>Agence choisie</span><strong>${contact.agency || '—'}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid rgba(0,0,0,0.06);">
        <span>Téléphone</span><strong>${contact.phone || '—'}</strong>
      </div>
    </div>
    ${hasAppointment
      ? `<div style="background:#EAFAF1;border:1px solid #2ECC71;border-radius:10px;padding:1rem;margin-top:1rem;">
           <p>✅ <strong>Rendez-vous confirmé</strong></p>
           <p>${req.appointment.date} à ${req.appointment.time}</p>
           <p>Agence : ${req.appointment.agency}</p>
         </div>`
      : contact.status === 'pending'
      ? `<button class="button button-primary" style="width:100%;margin-top:1.5rem;"
           onclick="confirmContact('${req.user_email}','${req.date}')">
           ✅ Confirmer le contact
         </button>`
      : `<div style="background:#FFF3CD;border:1px solid #FFC107;border-radius:10px;padding:1rem;margin-top:1rem;">
           <p>⏳ <strong>Contact confirmé - Rendez-vous en cours de génération</strong></p>
         </div>`
    }
  `;

  modal.classList.add('active');
}

window.confirmContact = async function(email, date) {
  try {
    const res = await fetch(`${API}/requests/confirm-contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_email: email, date })
    });

    if (!res.ok) throw new Error('Erreur lors de la confirmation');

    const data = await res.json();

    // Mettre à jour l'état local
    updateState(state => {
      const item = state.requests.find(r => r.user_email === email && r.date === date);
      if (item) {
        item.contact.status = 'confirmed';
        item.status = 'Finalisé';
        if (data.appointment) {
          item.appointment = data.appointment;
        }
      }
    });

    toast('✅ Contact confirmé et rendez-vous généré automatiquement');
    document.getElementById('detail-modal')?.classList.remove('active');
    await renderAdminTable(document.getElementById('filter-status')?.value || 'all');
  } catch (err) {
    console.error('[CONFIRM-CONTACT]', err);
    toast('❌ Erreur lors de la confirmation');
  }
};


// ── 8. INIT ──────────────────────────────────────────────────
function init() {
  console.log('=== INIT CALLED ===');
  console.log('Page:', document.body.dataset.page);
  const page = document.body.dataset.page;
  if (page === 'index')       renderIndex();
  if (page === 'inscription') renderInscription();
  if (page === 'dashboard')   renderDashboard().catch(console.error);
  if (page === 'confirmation') renderConfirmation();
  if (page === 'admin')       renderAdmin().catch(console.error);
}

function renderConfirmation() {
  const session = requireSession();
  if (!session) return;
  const reqs = getUserRequests(session.email);
  if (!reqs.length) { window.location.href = 'dashboard.html'; return; }
  const last    = reqs[reqs.length - 1];
  const summary = document.getElementById('confirm-summary');
  if (!summary) return;
  const d = extractRequestData(last);
  summary.innerHTML = `
    <div class="glass-inner">
      <h2>Détails de la demande</h2>
      <p><strong>Montant demandé :</strong> ${d.loan} €</p>
      <p><strong>Salaire :</strong> ${d.salary} €</p>
      <p><strong>Durée :</strong> ${d.duration} mois</p>
      <p><strong>Statut :</strong> ${last.status}</p>
      <p><strong>Date :</strong> ${last.date}</p>
    </div>`;
}

window.addEventListener('DOMContentLoaded', init);
