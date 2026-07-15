const SUPABASE_URL = window.__SUPABASE_CONFIG__?.url || '';
const SUPABASE_PUBLISHABLE_KEY = window.__SUPABASE_CONFIG__?.publishableKey || '';

const supabaseClient = SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY
  ? window.supabase?.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
  : null;

let currentSession = null;
let currentUser = null;
let currentGroup = null;
let userGroups = [];
let dashboardElements = [];
let activeDrag = null;
let activeResize = null;
let topZIndex = 20;

const content = document.querySelector('#content');
const pageTitle = document.querySelector('#page-title');
const breadcrumb = document.querySelector('#breadcrumb');
const authPanel = document.querySelector('#auth-panel');
const userEmail = document.querySelector('#user-email');
const logoutButton = document.querySelector('#logout-button');
const groupSwitcher = document.querySelector('#group-switcher');

const ELEMENT_DEFAULTS = {
  note: { width: 280, height: 180, title: 'Note', content: 'Type your note here…' },
  calendar: { width: 430, height: 420, title: 'Calendar' },
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function requireSupabase() {
  if (!supabaseClient) {
    throw new Error('Supabase public configuration is missing. Check the Vercel environment variables and redeploy.');
  }
  return supabaseClient;
}

function showMessage(message, type = 'error', root = document) {
  const status = root.querySelector('.status-message');
  if (!status) return;
  status.textContent = message;
  status.className = `status-message ${type}`;
}

function renderAuthView(message = '') {
  currentUser = null;
  currentGroup = null;
  userGroups = [];
  dashboardElements = [];
  renderGroupSwitcher();
  pageTitle.textContent = 'Sign in';
  breadcrumb.textContent = 'Account';
  authPanel.hidden = true;
  content.innerHTML = `
    <section class="auth-view" aria-live="polite">
      <form class="auth-card" id="auth-form">
        <span class="auth-kicker">Supabase Auth</span>
        <h3>Sign in to your CRM</h3>
        <p>Use an email and password to save your shared workspace to your Supabase project. New accounts must confirm their email from Supabase Auth before login works.</p>
        <label>Email<input id="auth-email" type="email" autocomplete="email" required /></label>
        <label>Password<input id="auth-password" type="password" autocomplete="current-password" required minlength="6" /></label>
        <div class="auth-actions">
          <button class="primary-action" type="submit" data-auth-action="sign-in">Sign in</button>
          <button class="secondary-action" type="button" id="signup-button">Create account</button>
        </div>
        <p id="status-message" class="status-message ${message ? 'error' : ''}">${escapeHtml(message)}</p>
      </form>
    </section>`;
  document.querySelector('#auth-form').addEventListener('submit', signIn);
  document.querySelector('#signup-button').addEventListener('click', signUp);
}

function updateAuthShell() {
  const signedIn = Boolean(currentUser);
  authPanel.hidden = !signedIn;
  userEmail.textContent = currentUser?.email || '';
}

function generateGroupCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function getGroupInitial(name) {
  return (String(name || '').trim().charAt(0) || '?').toUpperCase();
}

function renderGroupSwitcher() {
  if (!groupSwitcher) return;
  const addGroupButton = currentUser ? `
    <button
      class="group-switcher-button group-switcher-button--add"
      type="button"
      title="Join or create a business group"
      aria-label="Join or create a business group"
      data-group-action="manage"
    >+</button>` : '';
  groupSwitcher.innerHTML = `${userGroups.map((group) => `
    <button
      class="group-switcher-button ${group.id === currentGroup?.id ? 'active' : ''}"
      type="button"
      title="${escapeHtml(group.name)}"
      aria-label="Switch to ${escapeHtml(group.name)}"
      data-group-id="${escapeHtml(group.id)}"
    >${escapeHtml(getGroupInitial(group.name))}</button>`).join('')}${addGroupButton}`;
  groupSwitcher.querySelectorAll('[data-group-id]').forEach((button) => {
    button.addEventListener('click', switchGroup);
  });
  groupSwitcher.querySelector('[data-group-action="manage"]')?.addEventListener('click', () => renderGroupView());
}

async function switchGroup(event) {
  const group = userGroups.find((item) => item.id === event.currentTarget.dataset.groupId);
  if (!group || group.id === currentGroup?.id) return;
  currentGroup = group;
  loadDashboardData();
  renderGroupSwitcher();
  renderDashboardView();
}

function renderGroupView(message = '') {
  currentGroup = null;
  renderGroupSwitcher();
  pageTitle.textContent = 'Choose a group';
  breadcrumb.textContent = 'Groups';
  updateAuthShell();
  content.innerHTML = `
    <section class="auth-view" aria-live="polite">
      <div class="group-card">
        <span class="auth-kicker">Shared dashboard workspace</span>
        <h3>Join or create a group</h3>
        <p>Everyone in the same group can open the shared dashboard workspace.</p>
        <form id="join-group-form" class="group-form">
          <label>Join group with code<input id="group-code" type="text" autocomplete="off" placeholder="ABC123" required /></label>
          <button class="primary-action" type="submit">Join group</button>
        </form>
        <div class="group-divider"><span>or</span></div>
        <form id="create-group-form" class="group-form">
          <label>Business name<input id="group-name" type="text" autocomplete="organization" placeholder="Acme Co." required /></label>
          <button class="secondary-action" type="submit">Create new group</button>
        </form>
        <p class="helper">Share the business group code with teammates after creating a group.</p>
        <p class="status-message ${message ? 'error' : ''}">${escapeHtml(message)}</p>
      </div>
    </section>`;
  document.querySelector('#join-group-form').addEventListener('submit', joinGroup);
  document.querySelector('#create-group-form').addEventListener('submit', createGroup);
}

async function loadUserGroup(preferredGroupId = currentGroup?.id) {
  const { data, error } = await requireSupabase()
    .from('group_members')
    .select('group_id, groups(id, name, code)')
    .eq('user_id', currentUser.id);
  if (error) throw error;

  userGroups = (data || [])
    .map((membership) => membership.groups)
    .filter(Boolean)
    .sort((left, right) => left.name.localeCompare(right.name));
  currentGroup = userGroups.find((group) => group.id === preferredGroupId) || userGroups[0] || null;
  renderGroupSwitcher();

  if (!currentGroup) {
    renderGroupView();
    return;
  }
  loadDashboardData();
  renderDashboardView();
}

async function joinGroup(event) {
  event.preventDefault();
  const code = document.querySelector('#group-code').value.trim().toUpperCase();
  if (!code || !currentUser) return;

  try {
    const { data: group, error: groupError } = await requireSupabase()
      .from('groups')
      .select('id, name, code')
      .eq('code', code)
      .maybeSingle();
    if (groupError) throw groupError;
    if (!group) {
      showMessage('We could not find a group with that code.', 'error');
      return;
    }

    const { error: memberError } = await requireSupabase()
      .from('group_members')
      .upsert({ group_id: group.id, user_id: currentUser.id }, { onConflict: 'group_id,user_id' });
    if (memberError) throw memberError;
    currentGroup = group;
    await loadUserGroup(group.id);
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

async function createGroup(event) {
  event.preventDefault();
  const name = document.querySelector('#group-name').value.trim();
  if (!name || !currentUser) return;

  try {
    const { data: group, error: groupError } = await requireSupabase()
      .from('groups')
      .insert({ name, code: generateGroupCode(), created_by: currentUser.id })
      .select('id, name, code')
      .single();
    if (groupError) throw groupError;

    const { error: memberError } = await requireSupabase()
      .from('group_members')
      .insert({ group_id: group.id, user_id: currentUser.id });
    if (memberError) throw memberError;
    currentGroup = group;
    await loadUserGroup(group.id);
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

function dashboardStorageKey() {
  return `fo-crm-dashboard:${currentGroup?.id || 'solo'}`;
}

function loadDashboardData() {
  try {
    dashboardElements = JSON.parse(localStorage.getItem(dashboardStorageKey()) || '[]');
  } catch {
    dashboardElements = [];
  }
  topZIndex = Math.max(20, ...dashboardElements.map((element) => Number(element.zIndex || 1)));
}

function saveDashboardData() {
  localStorage.setItem(dashboardStorageKey(), JSON.stringify(dashboardElements));
}

function renderDashboardView() {
  if (!currentSession) {
    renderAuthView();
    return;
  }

  pageTitle.textContent = 'Dashboard';
  breadcrumb.innerHTML = `<span>${escapeHtml(currentGroup?.name || 'Group')}</span> / Custom dashboard`;
  renderGroupSwitcher();
  updateAuthShell();
  content.innerHTML = `
    <section class="dashboard-toolbar" aria-label="Dashboard controls">
      <div class="toolbar-left">
        <span class="group-code-badge">Group code: ${escapeHtml(currentGroup?.code || '')}</span>
        <button class="primary-action" id="add-note" type="button">＋ Add note</button>
        <button class="secondary-action" id="add-calendar" type="button">▣ Add calendar</button>
      </div>
      <p class="dashboard-hint">Drag by the top bar. Pull the bottom-right corner to resize.</p>
    </section>
    <section class="dashboard-canvas" id="dashboard-canvas" aria-label="Custom dashboard canvas">
      ${dashboardElements.length ? dashboardElements.map(renderDashboardElement).join('') : renderEmptyDashboard()}
    </section>`;
  bindDashboardEvents();
}

function renderEmptyDashboard() {
  return '<div class="empty-dashboard"><h3>Start building your dashboard</h3><p>Add a note or calendar, then drag and stretch it into place.</p></div>';
}

function renderDashboardElement(element) {
  const style = `left:${element.x}px; top:${element.y}px; width:${element.width}px; height:${element.height}px; z-index:${element.zIndex || 1};`;
  return `<article class="dashboard-element dashboard-element--${escapeHtml(element.type)}" style="${style}" data-element-id="${escapeHtml(element.id)}">
    <header class="element-header">
      <strong>${escapeHtml(element.title)}</strong>
      <button class="element-delete" type="button" aria-label="Delete ${escapeHtml(element.title)}">×</button>
    </header>
    <div class="element-body">${element.type === 'calendar' ? renderCalendar(element) : renderNote(element)}</div>
    <span class="resize-handle" aria-hidden="true"></span>
  </article>`;
}

function renderNote(element) {
  return `<textarea class="note-editor" aria-label="${escapeHtml(element.title)} text">${escapeHtml(element.content || '')}</textarea>`;
}

function renderCalendar(element) {
  const selectedDate = new Date(element.year, element.month, 1);
  const monthName = selectedDate.toLocaleString(undefined, { month: 'long' });
  const daysInMonth = new Date(element.year, element.month + 1, 0).getDate();
  const startDay = selectedDate.getDay();
  const cells = [];
  for (let index = 0; index < startDay; index += 1) cells.push('<span class="calendar-cell calendar-cell--empty"></span>');
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(`<span class="calendar-cell">${day}</span>`);
  return `<div class="calendar-widget">
    <div class="calendar-controls">
      <button class="calendar-prev" type="button">‹</button>
      <strong>${escapeHtml(monthName)} ${element.year}</strong>
      <button class="calendar-next" type="button">›</button>
    </div>
    <div class="calendar-weekdays"><span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span></div>
    <div class="calendar-grid">${cells.join('')}</div>
  </div>`;
}

function bindDashboardEvents() {
  document.querySelector('#add-note').addEventListener('click', () => addDashboardElement('note'));
  document.querySelector('#add-calendar').addEventListener('click', () => addDashboardElement('calendar'));
  document.querySelectorAll('.dashboard-element').forEach((elementNode) => {
    elementNode.addEventListener('pointerdown', bringElementForward);
    elementNode.querySelector('.element-header').addEventListener('pointerdown', startElementDrag);
    elementNode.querySelector('.resize-handle').addEventListener('pointerdown', startElementResize);
    elementNode.querySelector('.element-delete').addEventListener('click', deleteDashboardElement);
  });
  document.querySelectorAll('.note-editor').forEach((editor) => editor.addEventListener('input', updateNoteContent));
  document.querySelectorAll('.calendar-prev').forEach((button) => button.addEventListener('click', () => changeCalendarMonth(button, -1)));
  document.querySelectorAll('.calendar-next').forEach((button) => button.addEventListener('click', () => changeCalendarMonth(button, 1)));
}

function addDashboardElement(type) {
  const defaults = ELEMENT_DEFAULTS[type];
  const now = new Date();
  dashboardElements.push({
    id: `${type}-${Date.now()}`,
    type,
    title: defaults.title,
    content: defaults.content || '',
    x: 36 + (dashboardElements.length % 3) * 34,
    y: 34 + (dashboardElements.length % 3) * 30,
    width: defaults.width,
    height: defaults.height,
    month: now.getMonth(),
    year: now.getFullYear(),
    zIndex: ++topZIndex,
  });
  saveDashboardData();
  renderDashboardView();
}

function findElement(id) {
  return dashboardElements.find((element) => element.id === id);
}

function bringElementForward(event) {
  const element = findElement(event.currentTarget.dataset.elementId);
  if (!element) return;
  element.zIndex = ++topZIndex;
  event.currentTarget.style.zIndex = element.zIndex;
  saveDashboardData();
}

function startElementDrag(event) {
  if (event.target.closest('button')) return;
  const node = event.currentTarget.closest('.dashboard-element');
  const element = findElement(node.dataset.elementId);
  if (!element) return;
  activeDrag = { element, node, startX: event.clientX, startY: event.clientY, initialX: element.x, initialY: element.y };
  node.setPointerCapture(event.pointerId);
  node.addEventListener('pointermove', dragElement);
  node.addEventListener('pointerup', stopElementDrag, { once: true });
}

function dragElement(event) {
  if (!activeDrag) return;
  activeDrag.element.x = Math.max(0, activeDrag.initialX + event.clientX - activeDrag.startX);
  activeDrag.element.y = Math.max(0, activeDrag.initialY + event.clientY - activeDrag.startY);
  activeDrag.node.style.left = `${activeDrag.element.x}px`;
  activeDrag.node.style.top = `${activeDrag.element.y}px`;
}

function stopElementDrag(event) {
  if (!activeDrag) return;
  activeDrag.node.releasePointerCapture(event.pointerId);
  activeDrag.node.removeEventListener('pointermove', dragElement);
  activeDrag = null;
  saveDashboardData();
}

function startElementResize(event) {
  event.stopPropagation();
  const node = event.currentTarget.closest('.dashboard-element');
  const element = findElement(node.dataset.elementId);
  if (!element) return;
  activeResize = { element, node, startX: event.clientX, startY: event.clientY, initialWidth: element.width, initialHeight: element.height };
  node.setPointerCapture(event.pointerId);
  node.addEventListener('pointermove', resizeElement);
  node.addEventListener('pointerup', stopElementResize, { once: true });
}

function resizeElement(event) {
  if (!activeResize) return;
  activeResize.element.width = Math.max(220, activeResize.initialWidth + event.clientX - activeResize.startX);
  activeResize.element.height = Math.max(150, activeResize.initialHeight + event.clientY - activeResize.startY);
  activeResize.node.style.width = `${activeResize.element.width}px`;
  activeResize.node.style.height = `${activeResize.element.height}px`;
}

function stopElementResize(event) {
  if (!activeResize) return;
  activeResize.node.releasePointerCapture(event.pointerId);
  activeResize.node.removeEventListener('pointermove', resizeElement);
  activeResize = null;
  saveDashboardData();
}

function updateNoteContent(event) {
  const element = findElement(event.target.closest('.dashboard-element').dataset.elementId);
  if (!element) return;
  element.content = event.target.value;
  saveDashboardData();
}

function changeCalendarMonth(button, delta) {
  const element = findElement(button.closest('.dashboard-element').dataset.elementId);
  if (!element) return;
  const date = new Date(element.year, element.month + delta, 1);
  element.month = date.getMonth();
  element.year = date.getFullYear();
  saveDashboardData();
  renderDashboardView();
}

function deleteDashboardElement(event) {
  const id = event.target.closest('.dashboard-element').dataset.elementId;
  dashboardElements = dashboardElements.filter((element) => element.id !== id);
  saveDashboardData();
  renderDashboardView();
}

async function signIn(event) {
  event.preventDefault();
  try {
    const email = document.querySelector('#auth-email').value.trim();
    const password = document.querySelector('#auth-password').value;
    const { data, error } = await requireSupabase().auth.signInWithPassword({ email, password });
    if (error) throw error;
    currentSession = data.session;
    currentUser = data.user;
    await loadUserGroup();
  } catch (error) {
    showMessage(getAuthErrorMessage(error, 'sign-in'));
  }
}

function getAuthErrorMessage(error, action) {
  if (!navigator.onLine) return 'You appear to be offline. Check your internet connection and try again.';

  const message = String(error?.message || '').toLowerCase();
  if (message.includes('missing') && message.includes('configuration')) return error.message;
  if (message.includes('invalid login') || message.includes('invalid credentials')) return 'We could not sign you in. Check your email and password, then try again.';
  if (message.includes('already registered') || message.includes('already exists')) return 'An account already exists for this email. Try signing in instead.';
  if (message.includes('email not confirmed') || message.includes('not confirmed')) return 'Please confirm your email before signing in. Look for the confirmation email from Supabase Auth.';
  if (message.includes('password')) return 'Please use a password that meets the signup requirements.';
  if (message.includes('email')) return 'Please enter a valid email address.';
  if (action === 'sign-up') return 'We could not create your account. Check your email and password, then try again.';
  return 'We could not sign you in. Check your email and password, then try again.';
}

async function signUp() {
  try {
    const email = document.querySelector('#auth-email').value.trim();
    const password = document.querySelector('#auth-password').value;
    const { data, error } = await requireSupabase().auth.signUp({ email, password });
    if (error) throw error;
    if (data.session) {
      currentSession = data.session;
      currentUser = data.user;
      await loadUserGroup();
      return;
    }
    showMessage('Account created. Before signing in, check your email and click the confirmation link from Supabase Auth.', 'success');
  } catch (error) {
    showMessage(getAuthErrorMessage(error, 'sign-up'));
  }
}

async function logout() {
  const client = requireSupabase();
  await client.auth.signOut();
  currentSession = null;
  currentUser = null;
  currentGroup = null;
  userGroups = [];
  dashboardElements = [];
  renderGroupSwitcher();
  renderAuthView();
}

async function initializeApp() {
  try {
    const { data, error } = await requireSupabase().auth.getSession();
    if (error) throw error;
    currentSession = data.session;
    currentUser = data.session?.user || null;
    updateAuthShell();
    if (!currentSession) {
      renderAuthView();
      return;
    }
    await loadUserGroup();
  } catch (error) {
    renderAuthView(error.message);
  }
}

logoutButton.addEventListener('click', logout);

initializeApp();
