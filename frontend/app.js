'use strict';

// ── Config ───────────────────────────────────────────────────────────────────
// Update this to your Render URL once deployed, e.g.:
// const API_BASE = 'https://piggy-bank-api.onrender.com';
const API_BASE = 'https://wc2026-piggy-bank.onrender.com';

// ── State ────────────────────────────────────────────────────────────────────
let currentUser = null;  // { username, balance }
let selectedCoins = 1;
let refreshTimer = null;
let piggyBusy = false;   // true during deposit/withdraw animation

// ── DOM refs (populated on DOMContentLoaded) ──────────────────────────────────
let piggyIdle, piggyHappy, piggyCrying, piggyWrap;
let totalEl, coinField;
let authBar, userInfoEl, guestInfoEl, logoutBtn;
let authPanel, actionPanel;
let loginTab, registerTab, loginForm, registerForm;
let loginUser, loginPass, loginMsg;
let regUser, regPass, regMsg;
let myBalanceEl, depositMsg, withdrawMsg;
let lbBody, lbEmpty;

// ── API helpers ───────────────────────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(API_BASE + path, { ...opts, headers });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data: json };
}

// ── Auth ─────────────────────────────────────────────────────────────────────
async function tryRestoreSession() {
  const token = localStorage.getItem('token');
  if (!token) return;
  const { ok, data } = await apiFetch('/api/me');
  if (ok) {
    currentUser = { username: data.username, balance: data.balance, has_donated: data.has_donated };
    onLoggedIn();
  } else {
    localStorage.removeItem('token');
  }
}

function onLoggedIn() {
  authBar.querySelector('.user-info').textContent = `▶ ${currentUser.username}`;
  authBar.querySelector('.guest-info').style.display = 'none';
  authBar.querySelector('.user-info').style.display = 'inline';
  logoutBtn.style.display = 'inline-block';

  authPanel.style.display = 'none';
  actionPanel.style.display = 'block';
  updateMyBalance();
  updateDonateState();
}

function updateDonateState() {
  const donated = currentUser.has_donated;
  document.getElementById('donate-form').style.display = donated ? 'none' : 'block';
  document.getElementById('donated-msg').style.display = donated ? 'block' : 'none';
}

function onLoggedOut() {
  currentUser = null;
  localStorage.removeItem('token');

  authBar.querySelector('.user-info').style.display = 'none';
  authBar.querySelector('.guest-info').style.display = 'inline';
  logoutBtn.style.display = 'none';

  authPanel.style.display = 'block';
  actionPanel.style.display = 'none';
}

function updateMyBalance() {
  if (currentUser) {
    myBalanceEl.innerHTML = `Your balance: <span>${currentUser.balance} 🪙</span>`;
  }
}

// ── Login / Register ─────────────────────────────────────────────────────────
async function handleLogin(e) {
  e.preventDefault();
  showMsg(loginMsg, '');
  const { ok, data } = await apiFetch('/api/login', {
    method: 'POST',
    body: JSON.stringify({ username: loginUser.value.trim(), password: loginPass.value })
  });
  if (ok) {
    localStorage.setItem('token', data.token);
    currentUser = { username: data.username, balance: data.balance, has_donated: data.balance > 0 };
    onLoggedIn();
    loginPass.value = '';
  } else {
    showMsg(loginMsg, data.error || 'Login failed', true);
  }
}

async function handleRegister(e) {
  e.preventDefault();
  showMsg(regMsg, '');
  const { ok, data } = await apiFetch('/api/register', {
    method: 'POST',
    body: JSON.stringify({ username: regUser.value.trim(), password: regPass.value })
  });
  if (ok) {
    localStorage.setItem('token', data.token);
    currentUser = { username: data.username, balance: data.balance, has_donated: false };
    onLoggedIn();
    regPass.value = '';
  } else {
    showMsg(regMsg, data.error || 'Registration failed', true);
  }
}

// ── Deposit / Withdraw ────────────────────────────────────────────────────────
async function handleDeposit() {
  showMsg(depositMsg, '');
  const { ok, data } = await apiFetch('/api/deposit', {
    method: 'POST',
    body: JSON.stringify({ amount: selectedCoins })
  });
  if (ok) {
    currentUser.balance = data.balance;
    currentUser.has_donated = true;
    updateMyBalance();
    updateDonateState();
    playDepositAnimation(data.deposited);
    refreshData();
  } else {
    showMsg(depositMsg, data.error || 'Deposit failed', true);
  }
}

async function handleWithdraw() {
  showMsg(withdrawMsg, '');
  const { ok, data } = await apiFetch('/api/withdraw', {
    method: 'POST',
    body: JSON.stringify({ amount: selectedCoins })
  });
  if (ok) {
    currentUser.balance = data.balance;
    updateMyBalance();
    showMsg(withdrawMsg, `-${data.withdrawn} coin${data.withdrawn > 1 ? 's' : ''} withdrawn`);
    playWithdrawAnimation();
    refreshData();
  } else {
    showMsg(withdrawMsg, data.error || 'Withdrawal failed', true);
  }
}

// ── Coin selector ─────────────────────────────────────────────────────────────
function setupCoinSelector() {
  const selector = document.getElementById('coin-selector');
  for (let i = 1; i <= 10; i++) {
    const btn = document.createElement('button');
    btn.className = 'coin-btn' + (i === 1 ? ' selected' : '');
    btn.textContent = i;
    btn.dataset.value = i;
    btn.addEventListener('click', () => selectCoins(i));
    selector.appendChild(btn);
  }
}

function selectCoins(n) {
  selectedCoins = n;
  document.querySelectorAll('.coin-btn').forEach(b => {
    b.classList.toggle('selected', +b.dataset.value === n);
  });
  document.getElementById('selected-amount').innerHTML =
    `Selected: <span>${n} coin${n > 1 ? 's' : ''} (€${n})</span>`;
}

// ── Animations ────────────────────────────────────────────────────────────────
function setPiggyState(state) {
  piggyIdle.classList.toggle('hidden',    state !== 'idle');
  piggyHappy.classList.toggle('hidden',   state !== 'happy');
  piggyCrying.classList.toggle('hidden',  state !== 'crying');
  document.getElementById('piggy-kicking').classList.toggle('hidden', state !== 'kicking');
  document.getElementById('piggy-dizzy').classList.toggle('hidden',   state !== 'dizzy');
}

function playDepositAnimation(count) {
  piggyBusy = true;
  setPiggyState('happy');
  piggyWrap.classList.add('hopping');

  // Get piggy position to aim coins at it
  const piggyRect = piggyWrap.getBoundingClientRect();
  const targetX = piggyRect.left + piggyRect.width / 2;
  const targetY = piggyRect.top + piggyRect.height * 0.3;

  const depositBtn = document.getElementById('deposit-btn');
  const srcRect = depositBtn.getBoundingClientRect();

  for (let i = 0; i < count; i++) {
    setTimeout(() => spawnCoin(srcRect, targetX, targetY, i), i * 80);
  }

  const totalDuration = count * 80 + 900;
  setTimeout(() => {
    setPiggyState('idle');
    piggyWrap.classList.remove('hopping');
    piggyBusy = false;
  }, totalDuration);
}

function spawnCoin(srcRect, targetX, targetY, index) {
  const coin = document.createElement('div');
  coin.className = 'coin-anim';

  // Start near deposit button, with slight random spread
  const startX = srcRect.left + srcRect.width / 2 + (Math.random() - 0.5) * 30;
  const startY = srcRect.top + srcRect.height / 2;
  coin.style.left = startX + 'px';
  coin.style.top  = startY + 'px';

  // Arc midpoint: go up before falling into piggy
  const midX = (startX + targetX) / 2 + (Math.random() - 0.5) * 40;
  const midY = Math.min(startY, targetY) - 80 - Math.random() * 40;

  coin.style.setProperty('--tx-mid', (midX - startX) + 'px');
  coin.style.setProperty('--ty-mid', (midY - startY) + 'px');
  coin.style.setProperty('--tx-end', (targetX - startX) + 'px');
  coin.style.setProperty('--ty-end', (targetY - startY) + 'px');

  coinField.appendChild(coin);
  coin.addEventListener('animationend', () => coin.remove());
}

function playWithdrawAnimation() {
  piggyBusy = true;
  setPiggyState('crying');
  piggyWrap.classList.add('shaking');
  setTimeout(() => {
    setPiggyState('idle');
    piggyWrap.classList.remove('shaking');
    piggyBusy = false;
  }, 1200);
}

// ── Data refresh ──────────────────────────────────────────────────────────────
async function fetchTotal() {
  const { ok, data } = await apiFetch('/api/total');
  if (ok) totalEl.textContent = `${data.total} 🪙`;
}

async function fetchLeaderboard() {
  const { ok, data } = await apiFetch('/api/leaderboard');
  if (!ok) return;
  lbBody.innerHTML = '';
  if (!data.length) {
    lbEmpty.style.display = 'block';
    return;
  }
  lbEmpty.style.display = 'none';
  data.forEach((row, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="rank">${i + 1}</td>
      <td>${escHtml(row.username)}</td>
    `;
    lbBody.appendChild(tr);
  });
}

async function refreshData() {
  await Promise.all([fetchTotal(), fetchLeaderboard()]);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function showMsg(el, text, isError = false) {
  el.textContent = text;
  el.className = 'msg' + (text ? ' visible' : '') + (isError ? ' error' : ' success');
}

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
function setupTabs() {
  loginTab.addEventListener('click', () => {
    loginTab.classList.add('active');
    registerTab.classList.remove('active');
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
  });
  registerTab.addEventListener('click', () => {
    registerTab.classList.add('active');
    loginTab.classList.remove('active');
    registerForm.style.display = 'block';
    loginForm.style.display = 'none';
  });
}

// ── Football animation ────────────────────────────────────────────────────────
function startFootball() {
  const ball    = document.getElementById('football');
  const piggyEl = document.getElementById('piggy-wrap');

  const INTER_PAUSE  = 30000;  // 30s between animations
  const ROLL_MS      = 2600;
  const KICK_MS      = 400;
  const FLY_MS       = 780;
  const FALL_MS      = 1300;
  const DIZZY_MS     = 2600;
  const DROP_CHANCE  = 0.3;    // 30% chance of drop-from-top

  let rollDirection = true;    // true = next regular roll comes from left

  function positionAtFeet() {
    const r = piggyEl.getBoundingClientRect();
    ball.style.top  = (r.bottom - 14) + 'px';
    ball.style.left = (r.left + r.width / 2 - 14) + 'px';
  }

  function positionAtHead() {
    const r = piggyEl.getBoundingClientRect();
    ball.style.top  = (r.top + r.height / 2 - 14) + 'px';
    ball.style.left = (r.left + r.width / 2 - 14) + 'px';
  }

  function clearBall() {
    ball.classList.remove(
      'visible', 'roll-from-left', 'roll-from-right',
      'fly-to-right', 'fly-to-left', 'fall-from-top'
    );
  }

  function kick(flyRight, done) {
    if (!piggyBusy) {
      setPiggyState('kicking');
      piggyWrap.classList.add('hopping');
    }
    setTimeout(() => {
      if (!piggyBusy) {
        setPiggyState('idle');
        piggyWrap.classList.remove('hopping');
      }
      positionAtFeet();
      ball.classList.remove('roll-from-left', 'roll-from-right', 'fall-from-top');
      ball.classList.add(flyRight ? 'fly-to-right' : 'fly-to-left');
      setTimeout(() => {
        clearBall();
        setTimeout(done, INTER_PAUSE);
      }, FLY_MS);
    }, KICK_MS);
  }

  function doRoll(fromLeft) {
    positionAtFeet();
    clearBall();
    ball.classList.add('visible', fromLeft ? 'roll-from-left' : 'roll-from-right');
    setTimeout(() => kick(!fromLeft, nextCycle), ROLL_MS);
  }

  function doDrop() {
    positionAtHead();
    clearBall();
    ball.classList.add('visible', 'fall-from-top');

    setTimeout(() => {
      // Ball landed on head — go dizzy
      if (!piggyBusy) {
        setPiggyState('dizzy');
        piggyWrap.classList.add('dizzy');
      }
      setTimeout(() => {
        // Recover from dizzy, then kick
        if (!piggyBusy) {
          piggyWrap.classList.remove('dizzy');
        }
        const flyRight = rollDirection;  // kick whichever direction is "next"
        kick(flyRight, nextCycle);
      }, DIZZY_MS);
    }, FALL_MS);
  }

  function nextCycle() {
    if (!piggyBusy && Math.random() < DROP_CHANCE) {
      doDrop();
    } else {
      doRoll(rollDirection);
      rollDirection = !rollDirection;
    }
  }

  setTimeout(nextCycle, 1500);
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // DOM refs
  piggyIdle   = document.getElementById('piggy-idle');
  piggyHappy  = document.getElementById('piggy-happy');
  piggyCrying = document.getElementById('piggy-crying');
  piggyWrap   = document.getElementById('piggy-wrap');
  totalEl     = document.getElementById('total-amount');
  coinField   = document.getElementById('coin-field');
  authBar     = document.getElementById('auth-bar');
  userInfoEl  = authBar.querySelector('.user-info');
  guestInfoEl = authBar.querySelector('.guest-info');
  logoutBtn   = document.getElementById('logout-btn');
  authPanel   = document.getElementById('auth-panel');
  actionPanel = document.getElementById('action-panel');
  loginTab    = document.getElementById('login-tab');
  registerTab = document.getElementById('register-tab');
  loginForm   = document.getElementById('login-form');
  registerForm= document.getElementById('register-form');
  loginUser   = document.getElementById('login-username');
  loginPass   = document.getElementById('login-password');
  loginMsg    = document.getElementById('login-msg');
  regUser     = document.getElementById('reg-username');
  regPass     = document.getElementById('reg-password');
  regMsg      = document.getElementById('reg-msg');
  myBalanceEl = document.getElementById('my-balance');
  depositMsg  = document.getElementById('deposit-msg');
  lbBody      = document.getElementById('lb-body');
  lbEmpty     = document.getElementById('lb-empty');

  setupCoinSelector();
  setupTabs();

  // Events
  loginForm.addEventListener('submit', handleLogin);
  registerForm.addEventListener('submit', handleRegister);
  logoutBtn.addEventListener('click', onLoggedOut);
  document.getElementById('deposit-btn').addEventListener('click', handleDeposit);

  // Init state
  await tryRestoreSession();
  await refreshData();

  // Poll every 15s
  refreshTimer = setInterval(refreshData, 15000);

  startFootball();
});
