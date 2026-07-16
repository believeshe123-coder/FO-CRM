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
let dashboardSettings = { backgroundColor: '#ffffff' };
let activeDrag = null;
let activeResize = null;
let activePan = null;
let topZIndex = 20;

const content = document.querySelector('#content');
const pageTitle = document.querySelector('#page-title');
const breadcrumb = document.querySelector('#breadcrumb');
const authPanel = document.querySelector('#auth-panel');
const userEmail = document.querySelector('#user-email');
const logoutButton = document.querySelector('#logout-button');
const groupSwitcher = document.querySelector('#group-switcher');
const topbarTitle = document.querySelector('#topbar-title');
const topbarActions = document.querySelector('#topbar-actions');

const ELEMENT_DEFAULTS = {
  note: { width: 280, height: 180, title: 'Sticky note', content: 'Type your note here…', category: 'Quick tools' },
};

const ELEMENT_LIBRARY = [];

function getElementLibrary() {
  return ELEMENT_LIBRARY.map((element) => ({
    category: 'Elements',
    ...element,
  }));
}
const DASHBOARD_SURFACE_SIZE = { width: 2400, height: 1600 };

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

function resetTopbar() {
  topbarTitle?.classList.remove('topbar-title--dashboard');
  if (topbarActions) topbarActions.innerHTML = '';
}

function renderAuthView(message = '') {
  resetTopbar();
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
  resetTopbar();
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

function dashboardSettingsStorageKey() {
  return `fo-crm-dashboard-settings:${currentGroup?.id || 'solo'}`;
}

function loadDashboardData() {
  try {
    dashboardElements = JSON.parse(localStorage.getItem(dashboardStorageKey()) || '[]').filter((element) => ELEMENT_DEFAULTS[element.type]);
  } catch {
    dashboardElements = [];
  }
  try {
    dashboardSettings = { backgroundColor: '#ffffff', ...JSON.parse(localStorage.getItem(dashboardSettingsStorageKey()) || '{}') };
  } catch {
    dashboardSettings = { backgroundColor: '#ffffff' };
  }
  topZIndex = Math.max(20, ...dashboardElements.map((element) => Number(element.zIndex || 1)));
}

function saveDashboardData() {
  localStorage.setItem(dashboardStorageKey(), JSON.stringify(dashboardElements));
}

function saveDashboardSettings() {
  localStorage.setItem(dashboardSettingsStorageKey(), JSON.stringify(dashboardSettings));
}

function renderDashboardView() {
  if (!currentSession) {
    renderAuthView();
    return;
  }

  topbarTitle?.classList.add('topbar-title--dashboard');
  pageTitle.textContent = currentGroup?.name || 'Group';
  breadcrumb.innerHTML = `
    <span class="group-code-badge">Group code: ${escapeHtml(currentGroup?.code || '')}</span>
    ${renderElementPicker()}
    <button class="primary-action" id="add-note" type="button">＋ Sticky note</button>`;
  if (topbarActions) {
    topbarActions.innerHTML = '<button class="secondary-action dashboard-settings-button" type="button">⚙ Dashboard settings</button>';
  }
  renderGroupSwitcher();
  updateAuthShell();
  content.innerHTML = `
    <section class="dashboard-canvas" id="dashboard-canvas" aria-label="Custom dashboard canvas">
      <div class="dashboard-surface" style="--dashboard-surface-width:${DASHBOARD_SURFACE_SIZE.width}px; --dashboard-surface-height:${DASHBOARD_SURFACE_SIZE.height}px; --dashboard-bg:${escapeHtml(dashboardSettings.backgroundColor || '#ffffff')};">${dashboardElements.length ? dashboardElements.map(renderDashboardElement).join('') : renderEmptyDashboard()}</div>
    </section>`;
  bindDashboardEvents();
}

function renderElementPicker() {
  return `<details class="element-picker">
    <summary class="primary-action element-picker-toggle" role="button">＋ Add elements</summary>
    <div class="element-picker-panel" aria-label="Add dashboard elements">
      <label class="element-search-label" for="element-search">Search elements</label>
      <input class="element-search" id="element-search" type="search" placeholder="Search widgets and elements" autocomplete="off" />
      <div class="element-tree" id="element-tree" role="tree">${renderElementTree()}</div>
    </div>
  </details>`;
}

function renderElementTree(searchTerm = '') {
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const visibleElements = getElementLibrary().filter((element) => {
    const searchableText = `${element.title} ${element.category} ${element.type}`.toLowerCase();
    return !normalizedSearch || searchableText.includes(normalizedSearch);
  });
  if (!visibleElements.length) {
    return `<div class="element-tree-empty">
      <strong>No elements available yet.</strong>
      <span>${normalizedSearch ? 'No widgets or elements match your search.' : 'Widgets and elements will appear here when they are ready.'}</span>
    </div>`;
  }

  const categories = [...new Set(visibleElements.map((element) => element.category))].sort((left, right) => left.localeCompare(right));
  return categories.map((category) => {
    const categoryElements = visibleElements.filter((element) => element.category === category);
    return `<details class="element-tree-branch" open>
      <summary role="treeitem">${escapeHtml(category)}</summary>
      <div class="element-tree-items" role="group">
        ${categoryElements.map((element) => `
          <button class="element-tree-item" type="button" role="treeitem" data-element-type="${escapeHtml(element.type)}">
            <span>${element.type === 'calendar' ? '▣' : element.type === 'customers' ? '◫' : '▪'}</span>
            ${escapeHtml(element.title)}
          </button>`).join('')}
      </div>
    </details>`;
  }).join('');
}

function renderEmptyDashboard() {
  return '<div class="empty-dashboard"><h3>Start building your dashboard</h3><p>Use Add elements to search widgets and elements when they are available.</p></div>';
}

function renderDashboardElement(element) {
  const style = `left:${element.x}px; top:${element.y}px; width:${element.width}px; height:${element.height}px; z-index:${element.zIndex || 1};`;
  return `<article class="dashboard-element dashboard-element--${escapeHtml(element.type)}" style="${style}" data-element-id="${escapeHtml(element.id)}">
    <header class="element-header">
      <strong>${escapeHtml(element.title)}</strong>
      <div class="element-header-actions">
        <button class="element-delete" type="button" aria-label="Delete ${escapeHtml(element.title)}">×</button>
      </div>
    </header>
    <div class="element-body">${renderNote(element)}</div>
    <span class="resize-handle" aria-hidden="true"></span>
  </article>`;
}

function renderNote(element) {
  return `<textarea class="note-editor" aria-label="${escapeHtml(element.title)} text">${escapeHtml(element.content || '')}</textarea>`;
}

const CALENDAR_VIEWS = ['today', 'day', 'work-week', 'week', 'month', 'agenda', 'crew'];
const CALENDAR_EVENT_TYPES = ['Customer appointment','Service job','Estimate appointment','Consultation','Site visit','Follow-up','Phone call','Internal meeting','Employee meeting','Training','Deadline','Reminder','Inspection','PTO','Vacation','Sick time','Holiday','Equipment reservation','Vehicle reservation','Custom event'];
const CALENDAR_STATUSES = ['Tentative','Scheduled','Confirmed','In progress','Completed','Cancelled','Rescheduled','No-show'];
const CALENDAR_PRIORITIES = ['Low','Normal','High','Urgent'];
const CALENDAR_EMPLOYEES = ['Unassigned','Alex Rivera','Jordan Lee','Morgan Chen','Taylor Smith'];
const CALENDAR_CREWS = ['Unassigned','Install crew','Service crew','Estimate team','Office team'];
const CALENDAR_RESOURCES = ['None','Van 1','Van 2','Trailer A','Lift','Conference room'];
const CALENDAR_PERMISSIONS = ['view','create','edit','delete','cancel','assign','privateNotes','customerNotes','recurring','resources','export','settings'];

function getCalendarBusinessId() {
  return currentGroup?.id || 'solo';
}

function calendarStorageKey() {
  return `fo-crm-calendar:${getCalendarBusinessId()}`;
}

function loadCalendarEvents() {
  try {
    return JSON.parse(localStorage.getItem(calendarStorageKey()) || '[]').filter((event) => event.businessId === getCalendarBusinessId());
  } catch {
    return [];
  }
}

function saveCalendarEvents(events) {
  localStorage.setItem(calendarStorageKey(), JSON.stringify(events.map((event) => ({ ...event, businessId: getCalendarBusinessId() }))));
}

function defaultCalendarPreferences(element) {
  return {
    filtersOpen: element.filtersOpen ?? false,
    legendOpen: element.legendOpen ?? true,
    fullscreen: element.fullscreen ?? false,
    minimized: element.minimized ?? false,
    showWeekends: element.showWeekends ?? true,
    search: element.search || '',
    filterType: element.filterType || '',
    filterStatus: element.filterStatus || '',
    filterEmployee: element.filterEmployee || '',
    filterCrew: element.filterCrew || '',
    filterPriority: element.filterPriority || '',
  };
}

function getCalendarState(element) {
  const today = new Date();
  if (typeof element.month !== 'number') element.month = today.getMonth();
  if (typeof element.year !== 'number') element.year = today.getFullYear();
  if (!element.selectedDate) element.selectedDate = formatDateInput(today);
  if (!CALENDAR_VIEWS.includes(element.view)) element.view = 'month';
  if (!element.color) element.color = '#102b63';
  Object.assign(element, defaultCalendarPreferences(element));
  return element;
}

function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getEventStart(event) {
  return `${event.startDate}T${event.startTime || '00:00'}`;
}

function getEventEnd(event) {
  return `${event.endDate || event.startDate}T${event.endTime || '23:59'}`;
}

function eventsOverlap(left, right) {
  return getEventStart(left) < getEventEnd(right) && getEventEnd(left) > getEventStart(right);
}

function normalizeTags(value) {
  return String(value || '').split(',').map((tag) => tag.trim()).filter(Boolean);
}

function getFilteredCalendarEvents(element) {
  const search = (element.search || '').trim().toLowerCase();
  return loadCalendarEvents().filter((event) => {
    if (element.filterType && event.type !== element.filterType) return false;
    if (element.filterStatus && event.status !== element.filterStatus) return false;
    if (element.filterEmployee && !event.employeeIds?.includes(element.filterEmployee)) return false;
    if (element.filterCrew && event.crewId !== element.filterCrew) return false;
    if (element.filterPriority && event.priority !== element.filterPriority) return false;
    if (!search) return true;
    return [event.title, event.customerName, event.customerPhone, event.customerEmail, event.jobNumber, event.serviceAddress, event.description, event.internalNotes, event.customerNotes, ...(event.tags || []), ...(event.employeeIds || [])]
      .join(' ').toLowerCase().includes(search);
  }).sort((left, right) => getEventStart(left).localeCompare(getEventStart(right)));
}

function getEventsForDate(element, dateKey) {
  return getFilteredCalendarEvents(element).filter((event) => event.startDate <= dateKey && (event.endDate || event.startDate) >= dateKey);
}

function renderOptions(values, selected = '', blank = '') {
  return `${blank ? `<option value="">${escapeHtml(blank)}</option>` : ''}${values.map((value) => `<option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('')}`;
}

function hasCalendarPermission(permission) {
  const stored = JSON.parse(localStorage.getItem(`fo-crm-calendar-permissions:${getCalendarBusinessId()}`) || 'null');
  const permissions = stored || Object.fromEntries(CALENDAR_PERMISSIONS.map((item) => [item, true]));
  return permissions[permission] !== false;
}

function renderCalendar(element) {
  getCalendarState(element);
  const selectedDate = new Date(`${element.selectedDate}T00:00:00`);
  const title = element.view === 'today' ? 'Today' : selectedDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const compact = element.width < 430 || element.height < 360;
  if (element.minimized) return '<div class="calendar-widget calendar-widget--minimized"><p class="calendar-empty">Calendar minimized.</p></div>';
  if (element.filtersOpen) {
    return `<div class="calendar-widget calendar-widget--settings ${compact ? 'calendar-widget--compact' : ''} ${element.fullscreen ? 'calendar-widget--fullscreen' : ''}" style="--calendar-color: ${escapeHtml(element.color)}">
      <section class="calendar-settings-view"><div><h4>Calendar settings</h4><p class="helper">Adjust filters and display color. The calendar stays hidden until you close settings.</p></div>${renderCalendarFilters(element)}</section>
    </div>`;
  }
  return `<div class="calendar-widget ${compact ? 'calendar-widget--compact' : ''} ${element.fullscreen ? 'calendar-widget--fullscreen' : ''}" style="--calendar-color: ${escapeHtml(element.color)}">
    <div class="calendar-controls">
      <button class="calendar-prev" type="button" aria-label="Previous date range">‹</button>
      <strong>${escapeHtml(title)}</strong>
      <button class="calendar-next" type="button" aria-label="Next date range">›</button>
    </div>
    <div class="calendar-toolbar" role="toolbar" aria-label="Calendar actions">
      <button class="calendar-today" type="button">Today</button>
      <input class="calendar-date-input" type="date" value="${escapeHtml(element.selectedDate)}" aria-label="Select date" />
      <input class="calendar-search" type="search" value="${escapeHtml(element.search)}" placeholder="Search events" aria-label="Search calendar events" />
      <button class="calendar-filter-toggle" type="button">Filters</button>
      <button class="calendar-add-appointment" type="button" ${hasCalendarPermission('create') ? '' : 'disabled'}>＋ Event</button>
      <button class="calendar-refresh" type="button" aria-label="Refresh calendar">↻</button>
      <button class="calendar-minimize" type="button" aria-label="Minimize calendar">_</button>
      <button class="calendar-fullscreen" type="button" aria-label="Toggle full screen">⛶</button>
    </div>
    <div class="calendar-view-tabs" role="tablist" aria-label="Calendar views">
      ${CALENDAR_VIEWS.map((view) => `<button class="calendar-view ${element.view === view ? 'active' : ''}" type="button" data-calendar-view="${view}">${view.replace('-', ' ')}</button>`).join('')}
    </div>
    ${element.legendOpen ? renderCalendarLegend() : ''}
    ${compact ? renderCalendarAgenda(element, true) : renderCalendarView(element, selectedDate)}
  </div>`;
}

function renderCalendarFilters(element) {
  return `<div class="calendar-settings-panel">
    <label>Type <select class="calendar-filter" data-filter="filterType">${renderOptions(CALENDAR_EVENT_TYPES, element.filterType, 'All types')}</select></label>
    <label>Status <select class="calendar-filter" data-filter="filterStatus">${renderOptions(CALENDAR_STATUSES, element.filterStatus, 'All statuses')}</select></label>
    <label>Employee <select class="calendar-filter" data-filter="filterEmployee">${renderOptions(CALENDAR_EMPLOYEES.slice(1), element.filterEmployee, 'All employees')}</select></label>
    <label>Crew <select class="calendar-filter" data-filter="filterCrew">${renderOptions(CALENDAR_CREWS.slice(1), element.filterCrew, 'All crews')}</select></label>
    <label>Priority <select class="calendar-filter" data-filter="filterPriority">${renderOptions(CALENDAR_PRIORITIES, element.filterPriority, 'All priorities')}</select></label>
    <label>Color <input class="calendar-color-input" type="color" value="${escapeHtml(element.color)}" /></label>
    <button class="calendar-filter-toggle calendar-settings-close" type="button">Close settings</button>
  </div>`;
}

function renderCalendarLegend() {
  return `<div class="calendar-legend"><span><b class="status-scheduled"></b>Scheduled</span><span><b class="status-confirmed"></b>Confirmed</span><span><b class="status-completed"></b>Completed</span><span><b class="status-cancelled"></b>Cancelled</span><button class="calendar-legend-toggle" type="button">Hide legend</button></div>`;
}

function renderCalendarView(element, selectedDate) {
  if (element.view === 'agenda' || element.view === 'today') return renderCalendarAgenda(element, element.view === 'today');
  if (element.view === 'crew') return renderCrewSchedule(element);
  if (element.view === 'day') return renderCalendarDays(element, selectedDate, 1);
  if (element.view === 'work-week') return renderCalendarDays(element, addDays(selectedDate, 1 - selectedDate.getDay()), 5);
  if (element.view === 'week') return renderCalendarDays(element, addDays(selectedDate, -selectedDate.getDay()), element.showWeekends ? 7 : 5);
  return renderCalendarMonth(element);
}

function renderCalendarMonth(element) {
  const firstOfMonth = new Date(element.year, element.month, 1);
  const daysInMonth = new Date(element.year, element.month + 1, 0).getDate();
  const startDay = firstOfMonth.getDay();
  const todayKey = formatDateInput(new Date());
  const cells = [];
  for (let index = 0; index < startDay; index += 1) cells.push('<button class="calendar-cell calendar-cell--empty" type="button" disabled></button>');
  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = formatDateInput(new Date(element.year, element.month, day));
    const events = getEventsForDate(element, dateKey);
    cells.push(`<button class="calendar-cell ${dateKey === todayKey ? 'calendar-cell--today' : ''} ${dateKey === element.selectedDate ? 'calendar-cell--selected' : ''}" type="button" data-calendar-date="${dateKey}" aria-label="Open ${dateKey}">
      <span class="calendar-date-number">${day}</span>${dateKey === todayKey ? '<strong class="calendar-today-badge">Today</strong>' : ''}
      ${events.slice(0, 3).map(renderCalendarEventPill).join('')}${events.length > 3 ? `<small>+${events.length - 3} more</small>` : ''}</button>`);
  }
  return `<div class="calendar-weekdays"><span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span></div><div class="calendar-grid calendar-grid--month">${cells.join('')}</div>`;
}

function renderCalendarDays(element, startDate, count) {
  const todayKey = formatDateInput(new Date());
  return `<div class="calendar-week-view">${Array.from({ length: count }, (_, index) => {
    const date = addDays(startDate, index);
    const dateKey = formatDateInput(date);
    return `<section class="calendar-day-column ${dateKey === todayKey ? 'calendar-day-column--today' : ''}" data-drop-date="${dateKey}">
      <button type="button" data-calendar-date="${dateKey}">${date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}${dateKey === todayKey ? '<span>Today</span>' : ''}</button>
      ${renderCalendarEventList(getEventsForDate(element, dateKey))}</section>`;
  }).join('')}</div>`;
}

function renderCalendarAgenda(element, todayOnly = false) {
  const today = formatDateInput(new Date());
  const events = getFilteredCalendarEvents(element).filter((event) => todayOnly ? event.startDate >= today : true).slice(0, todayOnly ? 8 : 50);
  return `<section class="calendar-agenda"><h4>${todayOnly ? 'Today and upcoming' : 'Agenda'}</h4>${renderCalendarEventList(events)}</section>`;
}

function renderCrewSchedule(element) {
  return `<div class="calendar-crew-view">${CALENDAR_CREWS.slice(1).map((crew) => `<section class="calendar-day-column"><strong>${escapeHtml(crew)}</strong>${renderCalendarEventList(getFilteredCalendarEvents(element).filter((event) => event.crewId === crew))}</section>`).join('')}</div>`;
}

function renderCalendarEventPill(event) {
  return `<em class="calendar-event-pill" draggable="true" data-event-id="${escapeHtml(event.id)}">${escapeHtml(event.allDay ? 'All day' : event.startTime || '')} ${escapeHtml(event.title)}</em>`;
}

function renderCalendarEventList(events) {
  if (!events.length) return '<p class="calendar-empty">No events scheduled.</p>';
  return `<ul class="calendar-appointments">${events.map((event) => `<li class="calendar-event-row" draggable="true" data-event-id="${escapeHtml(event.id)}"><span class="calendar-appointment-time">${escapeHtml(event.allDay ? 'All day' : `${event.startTime || ''}-${event.endTime || ''}`)}</span><button type="button" class="calendar-event-open" data-open-event="${escapeHtml(event.id)}"><b>${escapeHtml(event.title)}</b><small>${escapeHtml(event.type)} • ${escapeHtml(event.status)} • ${escapeHtml((event.employeeIds || []).join(', ') || 'Unassigned')}</small></button><span class="calendar-resize-event" role="button" tabindex="0" data-resize-event="${escapeHtml(event.id)}">↕</span></li>`).join('')}</ul>`;
}

const CUSTOMER_TYPES = ['Individual','Household','Business','Commercial client','Property manager','Contractor','Subcontractor','Government organization','Nonprofit','Vendor','Referral partner','Custom customer type'];
const CUSTOMER_STATUSES = ['Lead','Prospect','Active','Inactive','Past customer','On hold','Do not service','Collections','Archived'];
const CUSTOMER_VIEWS = ['table','cards','compact','recent','favorites','map','saved'];
const CUSTOMER_PERMISSIONS = ['view','create','edit','archive','merge','export','billing','balances','privateNotes','addNotes','deleteNotes','documents','uploadDocuments','communications','logCalls','createTasks','alerts','customFields','bulkActions'];

function customerStorageKey() { return `fo-crm-customers:${getCalendarBusinessId()}`; }
function loadCustomers() {
  try { return JSON.parse(localStorage.getItem(customerStorageKey()) || '[]').filter((customer) => customer.businessId === getCalendarBusinessId()); }
  catch { return []; }
}
function saveCustomers(customers) { localStorage.setItem(customerStorageKey(), JSON.stringify(customers.map((customer) => ({ ...customer, businessId: getCalendarBusinessId() })))); }
function hasCustomerPermission(permission) {
  const stored = JSON.parse(localStorage.getItem(`fo-crm-customer-permissions:${getCalendarBusinessId()}`) || 'null');
  const permissions = stored || Object.fromEntries(CUSTOMER_PERMISSIONS.map((item) => [item, true]));
  return permissions[permission] !== false;
}
function getCustomerState(element) {
  if (!CUSTOMER_VIEWS.includes(element.view)) element.view = 'table';
  element.search ||= '';
  element.filterType ||= '';
  element.filterStatus ||= '';
  element.sortBy ||= 'customerName';
  element.filtersOpen ??= false;
  element.statusTab ||= 'All';
  element.selectedCustomerId ||= '';
  element.fullscreen ??= false;
  element.minimized ??= false;
  return element;
}
function customerDisplayName(customer) { return customer.customerName || customer.businessName || `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'Unnamed customer'; }
function getFilteredCustomers(element) {
  const search = element.search.trim().toLowerCase();
  return loadCustomers().filter((customer) => {
    if (element.filterType && customer.customerType !== element.filterType) return false;
    if (element.statusTab === 'Leads' && customer.status !== 'Lead') return false;
    if (element.statusTab === 'Active' && customer.status !== 'Active') return false;
    if (element.statusTab === 'Archived' && customer.status !== 'Archived') return false;
    if (element.filterStatus && customer.status !== element.filterStatus) return false;
    if (element.filterTag && !(customer.tags || []).some((tag) => tag.toLowerCase().includes(element.filterTag.toLowerCase()))) return false;
    if (element.view === 'recent' && !customer.recentlyViewedAt) return false;
    if (element.view === 'favorites' && !customer.favorite) return false;
    if (!search) return true;
    return [customerDisplayName(customer), customer.businessName, customer.firstName, customer.lastName, customer.primaryPhone, customer.secondaryPhone, customer.email, customer.serviceAddress, customer.billingAddress, customer.mailingAddress, customer.customerNumber, ...(customer.tags || []), customer.internalNotes, customer.customerNotes, ...(customer.customFields || [])].join(' ').toLowerCase().includes(search);
  }).sort((left, right) => String(left[element.sortBy] || customerDisplayName(left)).localeCompare(String(right[element.sortBy] || customerDisplayName(right))));
}
function renderCustomersWidget(element) {
  getCustomerState(element);
  const compact = element.width < 520 || element.height < 380;
  if (element.minimized) return '<div class="customer-widget"><p class="calendar-empty">Customer widget minimized.</p></div>';
  const customers = getFilteredCustomers(element);
  const selected = loadCustomers().find((customer) => customer.id === element.selectedCustomerId);
  return `<div class="customer-widget ${compact ? 'customer-widget--compact' : ''} ${element.fullscreen ? 'customer-widget--fullscreen' : ''}">
    <div class="customer-toolbar" role="toolbar" aria-label="Customer actions">
      <input class="customer-search" type="search" placeholder="Search customers" value="${escapeHtml(element.search)}" aria-label="Search customers" />
      <button class="customer-new" type="button" ${hasCustomerPermission('create') ? '' : 'disabled'}>+ New customer</button>
      <details class="customer-view-menu"><summary>View</summary><div>${CUSTOMER_VIEWS.map((view) => `<button class="customer-view ${element.view === view ? 'active' : ''}" type="button" data-customer-view="${view}">${view}</button>`).join('')}</div></details>
      <details class="customer-more-menu"><summary>More</summary><div><button class="customer-export" type="button" ${hasCustomerPermission('export') ? '' : 'disabled'}>Export CSV</button><button class="customer-save-view" type="button">Save view</button><button class="customer-bulk-archive" type="button" ${hasCustomerPermission('bulkActions') ? '' : 'disabled'}>Archive selected</button><button class="customer-filter-toggle" type="button">More filters</button><button class="customer-minimize" type="button">Minimize</button><button class="customer-fullscreen" type="button">Full screen</button></div></details>
    </div>
    <div class="customer-status-tabs" role="tablist">${['All','Leads','Active','Archived'].map((tab) => `<button class="customer-status-tab ${element.statusTab === tab ? 'active' : ''}" type="button" data-customer-status-tab="${tab}">${tab}</button>`).join('')}<button class="customer-filter-toggle" type="button">More filters</button></div>
    ${element.filtersOpen && !compact ? renderCustomerFilters(element) : ''}
    ${compact ? renderCustomerCompact(element, customers) : `<div class="customer-layout">${renderCustomerList(element, customers)}${renderCustomerProfile(selected)}</div>`}
  </div>`;
}
function renderCustomerFilters(element) {
  const tagValue = element.filterTag || '';
  return `<div class="customer-filters">
    <label>Customer type<select class="customer-filter" data-filter="filterType">${renderOptions(CUSTOMER_TYPES, element.filterType, 'All types')}</select></label>
    <label>Tags<input class="customer-filter-text" data-filter="filterTag" value="${escapeHtml(tagValue)}" placeholder="Any tag" /></label>
    <label>Status<select class="customer-filter" data-filter="filterStatus">${renderOptions(CUSTOMER_STATUSES, element.filterStatus, 'All statuses')}</select></label>
    <label>Sort<select class="customer-sort"><option value="customerName" ${element.sortBy === 'customerName' ? 'selected' : ''}>Customer name</option><option value="businessName" ${element.sortBy === 'businessName' ? 'selected' : ''}>Company</option><option value="status" ${element.sortBy === 'status' ? 'selected' : ''}>Status</option><option value="createdAt" ${element.sortBy === 'createdAt' ? 'selected' : ''}>Created date</option><option value="outstandingBalance" ${element.sortBy === 'outstandingBalance' ? 'selected' : ''}>Outstanding balance</option></select></label>
  </div>`;
}
function renderCustomerCompact(element, customers) {
  const attention = customers.filter((customer) => Number(customer.outstandingBalance || 0) > 0 || customer.status === 'Collections' || customer.doNotContact || customer.alerts?.length);
  return `<section class="customer-compact"><h4>Customers needing attention</h4>${renderCustomerMiniList(attention.slice(0, 4))}<h4>Recently viewed</h4>${renderCustomerMiniList(customers.filter((customer) => customer.recentlyViewedAt).slice(0, 4))}<h4>Follow-ups due</h4>${renderCustomerMiniList(customers.filter((customer) => (customer.tasks || []).some((task) => task.status !== 'Complete')).slice(0, 4))}</section>`;
}
function renderCustomerMiniList(customers) {
  if (!customers.length) return '<p class="calendar-empty">No customer records yet.</p>';
  return `<ul class="customer-mini-list">${customers.map((customer) => `<li><button type="button" data-customer-id="${escapeHtml(customer.id)}"><b>${escapeHtml(customerDisplayName(customer))}</b><small>${escapeHtml(customer.status)} • ${escapeHtml(customer.primaryPhone || 'No phone')}</small></button></li>`).join('')}</ul>`;
}
function getCustomerAttention(customer) {
  if (customer.status === 'Lead') return 'Lead';
  if (customer.nextAppointmentDate) return 'Appointment tomorrow';
  if ((customer.estimates || []).some((item) => String(item.status || '').toLowerCase().includes('waiting'))) return 'Estimate waiting';
  if ((customer.tasks || []).some((task) => task.status !== 'Complete')) return 'Follow-up due';
  if (Number(customer.outstandingBalance || 0) > 0) return 'Outstanding balance';
  return customer.status || 'Active';
}
function renderCustomerList(element, customers) {
  if (!customers.length) return `<section class="customer-list customer-empty-state"><h3>No customers yet</h3><p>Create your first customer to keep their contact details, jobs, estimates, invoices, and notes in one place.</p><button class="customer-new" type="button" ${hasCustomerPermission('create') ? '' : 'disabled'}>+ New customer</button></section>`;
  if (element.view === 'cards' || element.view === 'map' || element.view === 'saved') return `<section class="customer-card-grid">${customers.map((customer) => `<article class="customer-card ${customer.id === element.selectedCustomerId ? 'active' : ''}"><button type="button" data-customer-id="${escapeHtml(customer.id)}"><strong>${escapeHtml(customerDisplayName(customer))}</strong><span>${escapeHtml(customer.status)} • ${escapeHtml(customer.customerType)}</span><small>${escapeHtml(customer.serviceAddress || customer.billingAddress || 'No address')}</small><b>$${Number(customer.outstandingBalance || 0).toFixed(2)}</b></button></article>`).join('')}</section>`;
  return `<section class="customer-list customer-inbox-list">${customers.map((customer) => `<button class="customer-row ${customer.id === element.selectedCustomerId ? 'active' : ''}" type="button" data-customer-id="${escapeHtml(customer.id)}"><span><b>${escapeHtml(customerDisplayName(customer))}</b><small>${escapeHtml(`${customer.firstName || ''} ${customer.lastName || ''}`.trim() || customer.primaryContact || customer.customerNumber || '')}</small></span><span>${escapeHtml(customer.primaryPhone || 'No phone')}</span><em>${escapeHtml(getCustomerAttention(customer))}</em></button>`).join('')}</section>`;
}
function renderCustomerProfile(customer) {
  if (!customer) {
    const recent = loadCustomers().filter((item) => item.recentlyViewedAt).slice(0, 4);
    return `<aside class="customer-profile customer-profile-empty"><h3>Select a customer</h3><p>Choose a customer from the list to open their full profile, history, jobs, estimates, invoices, and notes.</p><h4>Recent customers</h4>${renderCustomerMiniList(recent)}<div class="customer-profile-actions"><button class="customer-new" type="button">New customer</button><button type="button">New appointment</button><button type="button">New estimate</button></div></aside>`;
  }
  const alerts = [Number(customer.outstandingBalance || 0) > 0 ? 'Past-due balance' : '', customer.doNotContact ? 'Do not contact' : '', customer.doNotService ? 'Do not service' : '', customer.taxExempt ? 'Tax exemption' : '', ...(customer.alerts || [])].filter(Boolean);
  return `<aside class="customer-profile"><header><strong>${escapeHtml(customerDisplayName(customer))}</strong><button class="customer-edit" type="button" data-edit-customer="${escapeHtml(customer.id)}">Edit</button></header>
    <nav class="customer-profile-tabs"><span>Overview</span><span>Jobs</span><span>Appointments</span><span>Estimates</span><span>Invoices</span><span>Notes</span><span>Activity</span></nav>
    <div class="customer-alerts">${alerts.map((alert) => `<span>${escapeHtml(alert)}</span>`).join('') || '<small>No active alerts</small>'}</div>
    <section class="customer-profile-section"><h4>Overview</h4><dl><dt>Customer #</dt><dd>${escapeHtml(customer.customerNumber)}</dd><dt>Type</dt><dd>${escapeHtml(customer.customerType)}</dd><dt>Status</dt><dd>${escapeHtml(customer.status)}</dd><dt>Primary contact</dt><dd>${escapeHtml(`${customer.firstName || ''} ${customer.lastName || ''}`.trim() || customer.primaryContact || '')}</dd><dt>Phone</dt><dd>${escapeHtml(customer.primaryPhone || '')}</dd><dt>Email</dt><dd>${escapeHtml(customer.email || '')}</dd><dt>Preferred contact</dt><dd>${escapeHtml(customer.preferredContact || '')}</dd><dt>Address</dt><dd>${escapeHtml(customer.serviceAddress || customer.billingAddress || '')}</dd><dt>Balance</dt><dd>$${Number(customer.outstandingBalance || 0).toFixed(2)}</dd></dl></section>
    <div class="customer-profile-actions"><button type="button" data-add-note="${escapeHtml(customer.id)}">Add note</button><button type="button" data-log-call="${escapeHtml(customer.id)}">Log call</button><button type="button" data-add-task="${escapeHtml(customer.id)}">Create follow-up</button><button type="button" data-archive-customer="${escapeHtml(customer.id)}">Archive</button></div>
    ${renderCustomerProfileSection('Jobs', customer.jobs, (item) => `${item.jobNumber || 'Job'} ${item.title || ''} — ${item.status || ''}`)}
    ${renderCustomerProfileSection('Appointments', customer.appointments, (item) => `${item.date || ''} ${item.title || ''} — ${item.status || ''}`)}
    ${renderCustomerProfileSection('Estimates', customer.estimates, (item) => `${item.number || 'Estimate'} $${Number(item.amount || 0).toFixed(2)} — ${item.status || ''}`)}
    ${renderCustomerProfileSection('Invoices', customer.invoices, (item) => `${item.number || 'Invoice'} balance $${Number(item.balance || 0).toFixed(2)} — ${item.status || ''}`)}
    ${renderCustomerProfileSection('Notes', customer.notes, (item) => `${item.type || 'General'}: ${item.content || ''}`)}
    ${renderCustomerProfileSection('Activity', customer.activity, (item) => `${item.at || ''}: ${item.action || ''}`)}
    ${renderCustomerProfileSection('Contacts', customer.contacts, (item) => `${item.firstName || ''} ${item.lastName || ''} — ${item.role || ''} ${item.phone || ''}`)}
    ${renderCustomerProfileSection('Locations', customer.locations, (item) => `${item.name || 'Location'} — ${item.address || ''} ${item.city || ''} ${item.zip || ''}`)}
    ${renderCustomerProfileSection('Documents', customer.documents, (item) => `${item.fileName || 'Document'} — ${item.category || ''}`)}
    ${renderCustomerProfileSection('Communication history', customer.communications, (item) => `${item.type || 'Communication'} ${item.direction || ''}: ${item.summary || ''}`)}
    ${renderCustomerProfileSection('Tasks', customer.tasks, (item) => `${item.title || 'Task'} — ${item.status || ''} due ${item.dueDate || ''}`)}
  </aside>`;
}
function renderCustomerProfileSection(title, rows = [], formatter) {
  return `<section class="customer-profile-section"><h4>${escapeHtml(title)}</h4>${rows.length ? `<ul>${rows.map((item) => `<li>${escapeHtml(formatter(item))}</li>`).join('')}</ul>` : '<p class="calendar-empty">None recorded.</p>'}</section>`;
}

function bindDashboardEvents() {
  document.querySelector('#add-note')?.addEventListener('click', () => {
    closeElementPicker();
    addDashboardElement('note');
  });
  document.querySelector('.dashboard-settings-button')?.addEventListener('click', openDashboardSettings);
  document.querySelector('#element-search')?.addEventListener('input', filterElementTree);
  document.querySelectorAll('[data-element-type]').forEach((button) => {
    button.addEventListener('click', () => {
      closeElementPicker(button);
      addDashboardElement(button.dataset.elementType);
    });
  });
  document.querySelector('#dashboard-canvas')?.addEventListener('pointerdown', startDashboardPan);
  document.querySelectorAll('.dashboard-element').forEach((elementNode) => {
    elementNode.addEventListener('pointerdown', bringElementForward);
    elementNode.querySelector('.element-header').addEventListener('pointerdown', startElementDrag);
    elementNode.querySelector('.resize-handle').addEventListener('pointerdown', startElementResize);
    elementNode.querySelector('.element-delete').addEventListener('click', deleteDashboardElement);
    elementNode.querySelector('.element-settings')?.addEventListener('click', toggleElementSettings);
  });
  document.querySelectorAll('.note-editor').forEach((editor) => editor.addEventListener('input', updateNoteContent));
  document.querySelectorAll('.calendar-prev').forEach((button) => button.addEventListener('click', () => moveCalendar(button, -1)));
  document.querySelectorAll('.calendar-next').forEach((button) => button.addEventListener('click', () => moveCalendar(button, 1)));
  document.querySelectorAll('.calendar-today').forEach((button) => button.addEventListener('click', jumpCalendarToday));
  document.querySelectorAll('[data-calendar-view]').forEach((button) => button.addEventListener('click', changeCalendarView));
  document.querySelectorAll('[data-calendar-date]').forEach((button) => button.addEventListener('click', selectCalendarDate));
  document.querySelectorAll('.calendar-add-appointment').forEach((button) => button.addEventListener('click', addCalendarAppointment));
  document.querySelectorAll('.calendar-color-input').forEach((input) => input.addEventListener('input', updateCalendarColor));
  document.querySelectorAll('.calendar-date-input').forEach((input) => input.addEventListener('change', jumpCalendarDate));
  document.querySelectorAll('.calendar-search').forEach((input) => input.addEventListener('input', updateCalendarSearch));
  document.querySelectorAll('.calendar-filter').forEach((input) => input.addEventListener('change', updateCalendarFilter));
  document.querySelectorAll('.calendar-filter-toggle').forEach((button) => button.addEventListener('click', toggleCalendarFilters));
  document.querySelectorAll('.calendar-legend-toggle').forEach((button) => button.addEventListener('click', toggleCalendarLegend));
  document.querySelectorAll('.calendar-minimize').forEach((button) => button.addEventListener('click', toggleCalendarMinimize));
  document.querySelectorAll('.calendar-fullscreen').forEach((button) => button.addEventListener('click', toggleCalendarFullscreen));
  document.querySelectorAll('.calendar-refresh').forEach((button) => button.addEventListener('click', () => renderDashboardView()));
  document.querySelectorAll('[data-open-event]').forEach((button) => button.addEventListener('click', openCalendarEvent));
  document.querySelectorAll('[data-event-id]').forEach((node) => node.addEventListener('dragstart', dragCalendarEvent));
  document.querySelectorAll('[data-drop-date]').forEach((node) => { node.addEventListener('dragover', (event) => event.preventDefault()); node.addEventListener('drop', dropCalendarEvent); });
  document.querySelectorAll('[data-resize-event]').forEach((node) => node.addEventListener('click', resizeCalendarEvent));
  document.querySelectorAll('.customer-search').forEach((input) => input.addEventListener('input', updateCustomerSearch));
  document.querySelectorAll('.customer-new').forEach((button) => button.addEventListener('click', addCustomer));
  document.querySelectorAll('.customer-filter-toggle').forEach((button) => button.addEventListener('click', toggleCustomerFilters));
  document.querySelectorAll('.customer-filter').forEach((input) => input.addEventListener('change', updateCustomerFilter));
  document.querySelectorAll('.customer-filter-text').forEach((input) => input.addEventListener('input', updateCustomerFilter));
  document.querySelectorAll('[data-customer-status-tab]').forEach((button) => button.addEventListener('click', changeCustomerStatusTab));
  document.querySelectorAll('.customer-sort').forEach((input) => input.addEventListener('change', updateCustomerSort));
  document.querySelectorAll('[data-customer-view]').forEach((button) => button.addEventListener('click', changeCustomerView));
  document.querySelectorAll('[data-customer-id]').forEach((button) => button.addEventListener('click', selectCustomer));
  document.querySelectorAll('[data-edit-customer]').forEach((button) => button.addEventListener('click', editCustomer));
  document.querySelectorAll('[data-add-note]').forEach((button) => button.addEventListener('click', quickCustomerNote));
  document.querySelectorAll('[data-log-call]').forEach((button) => button.addEventListener('click', quickCustomerCall));
  document.querySelectorAll('[data-add-task]').forEach((button) => button.addEventListener('click', quickCustomerTask));
  document.querySelectorAll('[data-archive-customer]').forEach((button) => button.addEventListener('click', archiveCustomer));
  document.querySelectorAll('.customer-export').forEach((button) => button.addEventListener('click', exportCustomersCsv));
  document.querySelectorAll('.customer-save-view').forEach((button) => button.addEventListener('click', saveCustomerView));
  document.querySelectorAll('.customer-minimize').forEach((button) => button.addEventListener('click', toggleCustomerMinimize));
  document.querySelectorAll('.customer-fullscreen').forEach((button) => button.addEventListener('click', toggleCustomerFullscreen));
}


function toggleElementSettings(event) {
  const element = findElement(event.currentTarget.closest('.dashboard-element').dataset.elementId);
  if (!element) return;
  if (element.type === 'calendar') toggleCalendarSettings(event);
  if (element.type === 'customers') toggleCustomerFilters(event);
}

function getCustomerElement(control) { return findElement(control.closest('.dashboard-element').dataset.elementId); }
function updateCustomerSearch(event) { const element = getCustomerElement(event.target); element.search = event.target.value; saveDashboardData(); renderDashboardView(); }
function toggleCustomerFilters(event) { event.stopPropagation(); const element = getCustomerElement(event.currentTarget); element.filtersOpen = !element.filtersOpen; saveDashboardData(); renderDashboardView(); }
function updateCustomerFilter(event) { const element = getCustomerElement(event.target); element[event.target.dataset.filter] = event.target.value; saveDashboardData(); renderDashboardView(); }
function updateCustomerSort(event) { const element = getCustomerElement(event.target); element.sortBy = event.target.value; saveDashboardData(); renderDashboardView(); }
function changeCustomerView(event) { const element = getCustomerElement(event.target); element.view = event.target.dataset.customerView; saveDashboardData(); renderDashboardView(); }
function changeCustomerStatusTab(event) { const element = getCustomerElement(event.target); element.statusTab = event.target.dataset.customerStatusTab; saveDashboardData(); renderDashboardView(); }
function selectCustomer(event) { const element = getCustomerElement(event.currentTarget); const customers = loadCustomers(); const customer = customers.find((item) => item.id === event.currentTarget.dataset.customerId); if (!customer) return; customer.recentlyViewedAt = new Date().toISOString(); element.selectedCustomerId = customer.id; saveCustomers(customers); saveDashboardData(); renderDashboardView(); }
function toggleCustomerMinimize(event) { const element = getCustomerElement(event.currentTarget); element.minimized = !element.minimized; saveDashboardData(); renderDashboardView(); }
function toggleCustomerFullscreen(event) { const element = getCustomerElement(event.currentTarget); element.fullscreen = !element.fullscreen; if (element.fullscreen) { element.x = 12; element.y = 12; element.width = Math.max(element.width, 1080); element.height = Math.max(element.height, 760); } saveDashboardData(); renderDashboardView(); }
function addCustomer(event) { const element = getCustomerElement(event.target); openCustomerForm(element); }
function editCustomer(event) { const element = getCustomerElement(event.target); const customer = loadCustomers().find((item) => item.id === event.currentTarget.dataset.editCustomer); if (customer) openCustomerForm(element, customer); }
function makeCustomerNumber() { return `C-${new Date().getFullYear()}-${String(loadCustomers().length + 1).padStart(4, '0')}`; }
function parseLines(value, mapper) { return String(value || '').split('\n').map((line) => line.trim()).filter(Boolean).map(mapper); }
function openCustomerForm(element, customer = {}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'modal customer-modal';
  const canEdit = !customer.id ? hasCustomerPermission('create') : hasCustomerPermission('edit');
  const isNew = !customer.id;
  const heading = isNew ? 'New customer' : 'Edit customer';
  const intro = isNew
    ? 'Start with the basics. You can add more details after the customer is created.'
    : 'Editing existing customers still provides access to every current field.';
  dialog.innerHTML = `<form class="modal-card customer-form" method="dialog"><div class="modal-head"><h3>${heading}</h3><button type="button" data-close-modal>×</button></div><p class="helper">${intro} Customer records are saved only for ${escapeHtml(currentGroup?.name || 'this workspace')}.</p><div class="customer-form-grid customer-form-basic">
    <label>Customer type<select name="customerType" class="customer-type-select">${renderOptions(['Individual','Business'], customer.customerType || 'Individual')}</select></label><label>Status<select name="status">${renderOptions(CUSTOMER_STATUSES, customer.status || 'Lead')}</select></label><label class="business-name-field">Business name<input name="businessName" value="${escapeHtml(customer.businessName || '')}" /></label><label>First name<input name="firstName" value="${escapeHtml(customer.firstName || '')}" /></label><label>Last name<input name="lastName" value="${escapeHtml(customer.lastName || '')}" /></label><label>Primary phone<input name="primaryPhone" type="tel" value="${escapeHtml(customer.primaryPhone || '')}" /></label><label>Email<input name="email" type="email" value="${escapeHtml(customer.email || '')}" /></label><label class="span-2">Service address<input name="serviceAddress" value="${escapeHtml(customer.serviceAddress || '')}" /></label><label>Preferred contact<select name="preferredContact">${renderOptions(['Phone','Email','Text placeholder','Mail','Do not contact'], customer.preferredContact || 'Phone')}</select></label><input name="customerName" type="hidden" value="${escapeHtml(customer.customerName || '')}" /></div>
    <details class="customer-more-details" ${isNew ? '' : 'open'}><summary>Add more details</summary><div class="customer-form-grid">
    <label>Secondary phone<input name="secondaryPhone" type="tel" value="${escapeHtml(customer.secondaryPhone || '')}" /></label><label>Billing address<input name="billingAddress" value="${escapeHtml(customer.billingAddress || '')}" /></label><label class="checkbox-line"><input name="billingSameAsService" type="checkbox" /> Billing address is the same as service address</label><label>Mailing address<input name="mailingAddress" value="${escapeHtml(customer.mailingAddress || '')}" /></label><label class="checkbox-line"><input name="mailingSameAsService" type="checkbox" /> Mailing address is the same as service address</label><label>Lead source<input name="leadSource" value="${escapeHtml(customer.leadSource || '')}" /></label><label>Payment terms<input name="paymentTerms" value="${escapeHtml(customer.paymentTerms || 'Due on receipt')}" /></label><label>Outstanding balance<input name="outstandingBalance" type="number" step="0.01" value="${escapeHtml(customer.outstandingBalance || 0)}" /></label><label>Tags<input name="tags" value="${escapeHtml((customer.tags || []).join(', '))}" /></label><label class="checkbox-line"><input name="taxExempt" type="checkbox" ${customer.taxExempt ? 'checked' : ''} /> Tax exempt</label><label class="checkbox-line"><input name="doNotContact" type="checkbox" ${customer.doNotContact ? 'checked' : ''} /> Do not contact</label><label class="checkbox-line"><input name="doNotService" type="checkbox" ${customer.doNotService ? 'checked' : ''} /> Do not service</label><label class="checkbox-line"><input name="favorite" type="checkbox" ${customer.favorite ? 'checked' : ''} /> Favorite</label><label class="span-2">Internal notes<textarea name="internalNotes">${escapeHtml(customer.internalNotes || '')}</textarea></label><label class="span-2">Customer notes<textarea name="customerNotes">${escapeHtml(customer.customerNotes || '')}</textarea></label><label class="span-2">Additional contacts, one per line<textarea name="contactsText" placeholder="Jane Smith | Scheduling | 555-0100 | jane@example.com">${escapeHtml((customer.contacts || []).map((c) => `${c.firstName || ''} ${c.lastName || ''} | ${c.role || ''} | ${c.phone || ''} | ${c.email || ''}`).join('\n'))}</textarea></label><label class="span-2">Service locations, one per line<textarea name="locationsText" placeholder="Main home | 123 Oak St | Austin | 78701">${escapeHtml((customer.locations || []).map((l) => `${l.name || ''} | ${l.address || ''} | ${l.city || ''} | ${l.zip || ''}`).join('\n'))}</textarea></label><label class="span-2">Custom fields, one per line<textarea name="customFieldsText" placeholder="Maintenance plan: Gold">${escapeHtml((customer.customFields || []).join('\n'))}</textarea></label></div></details><div class="duplicate-warning" hidden></div><p class="status-message"></p><div class="auth-actions wrap"><button class="primary-action" value="save" ${canEdit ? '' : 'disabled'}>${isNew ? 'Create customer' : 'Save customer'}</button>${customer.id ? '<button class="secondary-action" value="duplicate">Duplicate</button><button class="secondary-action" value="archive">Archive</button>' : ''}<button class="secondary-action" type="button" data-close-modal>Cancel</button></div></form>`;
  document.body.append(dialog);
  const form = dialog.querySelector('form');
  const warning = dialog.querySelector('.duplicate-warning');
  const syncBusinessField = () => form.classList.toggle('customer-form--business', form.customerType.value === 'Business');
  form.customerType.addEventListener('change', syncBusinessField);
  form.billingSameAsService?.addEventListener('change', () => { if (form.billingSameAsService.checked) form.billingAddress.value = form.serviceAddress.value; });
  form.mailingSameAsService?.addEventListener('change', () => { if (form.mailingSameAsService.checked) form.mailingAddress.value = form.serviceAddress.value; });
  form.addEventListener('input', () => showCustomerDuplicates(form, customer.id, warning));
  form.addEventListener('submit', (submitEvent) => saveCustomerForm(submitEvent, element, customer, dialog));
  dialog.querySelectorAll('[data-close-modal]').forEach((button) => button.addEventListener('click', () => dialog.close()));
  dialog.addEventListener('close', () => dialog.remove());
  syncBusinessField();
  showCustomerDuplicates(form, customer.id, warning);
  dialog.showModal();
}
function getCustomerFromForm(form, existing = {}) { const data = new FormData(form); const now = new Date().toISOString(); return { ...existing, id: existing.id || `customer-${Date.now()}`, businessId: getCalendarBusinessId(), customerNumber: existing.customerNumber || makeCustomerNumber(), customerType: data.get('customerType'), status: data.get('status'), customerName: (data.get('customerName') || `${data.get('firstName') || ''} ${data.get('lastName') || ''}`.trim() || data.get('businessName') || '').trim(), businessName: data.get('businessName'), firstName: data.get('firstName'), lastName: data.get('lastName'), primaryPhone: data.get('primaryPhone'), secondaryPhone: data.get('secondaryPhone'), email: data.get('email'), preferredContact: data.get('preferredContact'), billingAddress: data.get('billingSameAsService') === 'on' ? data.get('serviceAddress') : data.get('billingAddress'), serviceAddress: data.get('serviceAddress'), mailingAddress: data.get('mailingSameAsService') === 'on' ? data.get('serviceAddress') : data.get('mailingAddress'), assignedStaff: existing.assignedStaff || '', leadSource: data.get('leadSource'), paymentTerms: data.get('paymentTerms'), outstandingBalance: Number(data.get('outstandingBalance') || 0), tags: normalizeTags(data.get('tags')), taxExempt: data.get('taxExempt') === 'on', doNotContact: data.get('doNotContact') === 'on', doNotService: data.get('doNotService') === 'on', favorite: data.get('favorite') === 'on', internalNotes: data.get('internalNotes'), customerNotes: data.get('customerNotes'), contacts: parseLines(data.get('contactsText'), (line) => { const [name='', role='', phone='', email=''] = line.split('|').map((part) => part.trim()); const [firstName='', ...last] = name.split(' '); return { firstName, lastName: last.join(' '), role, phone, email, preferredContact: 'Phone' }; }), locations: parseLines(data.get('locationsText'), (line) => { const [name='', address='', city='', zip=''] = line.split('|').map((part) => part.trim()); return { name, address, city, zip, primaryService: true }; }), customFields: parseLines(data.get('customFieldsText'), (line) => line), notes: existing.notes || [], jobs: existing.jobs || [], appointments: existing.appointments || [], estimates: existing.estimates || [], invoices: existing.invoices || [], documents: existing.documents || [], communications: existing.communications || [], tasks: existing.tasks || [], alerts: existing.alerts || [], openJobs: existing.openJobs || 0, lastContactDate: existing.lastContactDate || '', nextAppointmentDate: existing.nextAppointmentDate || '', createdAt: existing.createdAt || now, updatedAt: now, createdBy: existing.createdBy || currentUser?.id || 'local-user', updatedBy: currentUser?.id || 'local-user', activity: [...(existing.activity || []), { at: now, action: existing.id ? 'Customer updated' : 'Customer created', by: currentUser?.id || 'local-user' }] }; }
function showCustomerDuplicates(form, customerId, warning) { const draft = getCustomerFromForm(form, { id: customerId || 'draft' }); const dupes = loadCustomers().filter((c) => c.id !== customerId && [draft.customerName && c.customerName === draft.customerName, draft.businessName && c.businessName === draft.businessName, draft.primaryPhone && c.primaryPhone === draft.primaryPhone, draft.email && c.email === draft.email, draft.serviceAddress && c.serviceAddress === draft.serviceAddress].some(Boolean)); warning.hidden = !dupes.length; warning.textContent = dupes.length ? `Possible duplicate: ${dupes.map(customerDisplayName).join(', ')}. Review before saving or continue if authorized.` : ''; }
function saveCustomerForm(event, element, existing, dialog) {
  event.preventDefault();
  const action = event.submitter?.value || 'save';
  if (action === 'save' || action === 'duplicate') {
    const data = new FormData(event.currentTarget);
    const hasName = [data.get('customerName'), data.get('businessName'), data.get('firstName'), data.get('lastName')].some((value) => String(value || '').trim());
    const hasContact = [data.get('primaryPhone'), data.get('email'), data.get('serviceAddress')].some((value) => String(value || '').trim());
    if (!hasName || !hasContact) {
      showMessage('Add a customer name or business name and at least one contact method.', 'error', event.currentTarget);
      return;
    }
  }
  let customers = loadCustomers();
  if (action === 'archive') {
    if (!hasCustomerPermission('archive') || !window.confirm('Archive this customer?')) return;
    customers = customers.map((c) => c.id === existing.id ? { ...c, status: 'Archived', activity: [...(c.activity || []), { at: new Date().toISOString(), action: 'Customer archived', by: currentUser?.id || 'local-user' }] } : c);
    element.selectedCustomerId = existing.id;
  } else {
    const next = getCustomerFromForm(event.currentTarget, action === 'duplicate' ? {} : existing);
    const savedCustomer = action === 'duplicate' ? { ...next, customerName: `${next.customerName} copy` } : next;
    customers = customers.filter((c) => c.id !== savedCustomer.id);
    customers.push(savedCustomer);
    element.selectedCustomerId = savedCustomer.id;
  }
  saveCustomers(customers);
  saveDashboardData();
  dialog.close();
  renderDashboardView();
}
function quickCustomerNote(event) { mutateCustomer(event.currentTarget.dataset.addNote, (customer) => { const content = window.prompt('Note'); if (content) customer.notes = [{ type: 'General', content, createdAt: new Date().toISOString(), privacy: 'internal' }, ...(customer.notes || [])]; }); }
function quickCustomerCall(event) { mutateCustomer(event.currentTarget.dataset.logCall, (customer) => { const summary = window.prompt('Call summary'); if (summary) customer.communications = [{ type: 'Phone call', direction: 'Logged', summary, at: new Date().toISOString(), followUpRequired: false }, ...(customer.communications || [])]; customer.lastContactDate = formatDateInput(new Date()); }); }
function quickCustomerTask(event) { mutateCustomer(event.currentTarget.dataset.addTask, (customer) => { const title = window.prompt('Follow-up task'); if (title) customer.tasks = [{ id: `task-${Date.now()}`, title, status: 'Open', priority: 'Normal', dueDate: formatDateInput(new Date()), customerId: customer.id }, ...(customer.tasks || [])]; }); }
function archiveCustomer(event) { if (!window.confirm('Archive this customer?')) return; mutateCustomer(event.currentTarget.dataset.archiveCustomer, (customer) => { customer.status = 'Archived'; }); }
function mutateCustomer(id, updater) { const customers = loadCustomers(); const customer = customers.find((item) => item.id === id); if (!customer) return; updater(customer); customer.updatedAt = new Date().toISOString(); customer.activity = [...(customer.activity || []), { at: customer.updatedAt, action: 'Customer activity updated', by: currentUser?.id || 'local-user' }]; saveCustomers(customers); renderDashboardView(); }
function exportCustomersCsv(event) { const element = getCustomerElement(event.currentTarget); const rows = getFilteredCustomers(element); const csv = ['Customer name,Company,Phone,Email,Type,Status,Address,Balance', ...rows.map((c) => [customerDisplayName(c), c.businessName, c.primaryPhone, c.email, c.customerType, c.status, c.serviceAddress, c.outstandingBalance].map((v) => `"${String(v || '').replaceAll('"', '""')}"`).join(','))].join('\n'); const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'customers.csv'; link.click(); URL.revokeObjectURL(url); }
function saveCustomerView(event) { const element = getCustomerElement(event.currentTarget); const name = window.prompt('Saved view name'); if (!name) return; const key = `fo-crm-customer-saved-views:${getCalendarBusinessId()}`; const saved = JSON.parse(localStorage.getItem(key) || '[]'); saved.push({ name, view: element.view, filters: { type: element.filterType, status: element.filterStatus }, sortBy: element.sortBy, createdAt: new Date().toISOString() }); localStorage.setItem(key, JSON.stringify(saved)); }


function openDashboardSettings() {
  const dialog = document.createElement('dialog');
  dialog.className = 'modal dashboard-settings-modal';
  dialog.innerHTML = `<form class="modal-card dashboard-settings-form" method="dialog">
    <div class="modal-head"><h3>Dashboard settings</h3><button type="button" data-close-modal>×</button></div>
    <label>Background color<input name="backgroundColor" type="color" value="${escapeHtml(dashboardSettings.backgroundColor || '#ffffff')}" /></label>
    <p class="helper">These settings apply to ${escapeHtml(currentGroup?.name || 'this dashboard')}.</p>
    <p class="status-message"></p>
    <div class="auth-actions wrap"><button class="primary-action" value="save">Save settings</button><button class="secondary-action danger" type="button" data-leave-group ${currentUser && currentGroup ? '' : 'disabled'}>Leave group</button><button class="secondary-action" type="button" data-close-modal>Cancel</button></div>
  </form>`;
  document.body.append(dialog);
  const form = dialog.querySelector('form');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    dashboardSettings.backgroundColor = new FormData(form).get('backgroundColor') || '#ffffff';
    saveDashboardSettings();
    dialog.close();
    renderDashboardView();
  });
  dialog.querySelector('[data-leave-group]')?.addEventListener('click', () => leaveCurrentGroup(dialog));
  dialog.querySelectorAll('[data-close-modal]').forEach((button) => button.addEventListener('click', () => dialog.close()));
  dialog.addEventListener('close', () => dialog.remove());
  dialog.showModal();
}

async function leaveCurrentGroup(dialog) {
  if (!currentUser || !currentGroup || !window.confirm(`Leave ${currentGroup.name}?`)) return;
  try {
    const { error } = await requireSupabase()
      .from('group_members')
      .delete()
      .eq('group_id', currentGroup.id)
      .eq('user_id', currentUser.id);
    if (error) throw error;
    const leftGroupId = currentGroup.id;
    dialog.close();
    await loadUserGroup(userGroups.find((group) => group.id !== leftGroupId)?.id);
  } catch (error) {
    showMessage(error.message, 'error', dialog);
  }
}

function filterElementTree(event) {
  document.querySelector('#element-tree').innerHTML = renderElementTree(event.target.value);
  document.querySelectorAll('[data-element-type]').forEach((button) => {
    button.addEventListener('click', () => {
      closeElementPicker(button);
      addDashboardElement(button.dataset.elementType);
    });
  });
}

function closeElementPicker(control) {
  const picker = control?.closest('.element-picker');
  if (picker) {
    picker.open = false;
    return;
  }
  document.querySelectorAll('.element-picker[open]').forEach((openPicker) => {
    openPicker.open = false;
  });
}

function addDashboardElement(type) {
  const defaults = ELEMENT_DEFAULTS[type];
  if (!defaults) return;
  const now = new Date();
  const canvas = document.querySelector('#dashboard-canvas');
  const offset = dashboardElements.length % 3;
  dashboardElements.push({
    id: `${type}-${Date.now()}`,
    type,
    title: defaults.title,
    content: defaults.content || '',
    x: Math.min(DASHBOARD_SURFACE_SIZE.width - defaults.width, (canvas?.scrollLeft || 0) + 36 + offset * 34),
    y: Math.min(DASHBOARD_SURFACE_SIZE.height - defaults.height, (canvas?.scrollTop || 0) + 34 + offset * 30),
    width: defaults.width,
    height: defaults.height,
    month: now.getMonth(),
    year: now.getFullYear(),
    selectedDate: formatDateInput(now),
    view: defaults.view || 'month',
    color: defaults.color || '#102b63',
    appointments: defaults.appointments ? [...defaults.appointments] : [],
    settingsOpen: false,
    zIndex: ++topZIndex,
  });
  saveDashboardData();
  renderDashboardView();
}


function startDashboardPan(event) {
  if (event.button !== 0 || event.target.closest('.dashboard-element')) return;
  event.preventDefault();
  const canvas = event.currentTarget;
  activePan = { canvas, startX: event.clientX, startY: event.clientY, scrollLeft: canvas.scrollLeft, scrollTop: canvas.scrollTop };
  canvas.classList.add('is-panning');
  canvas.setPointerCapture(event.pointerId);
  canvas.addEventListener('pointermove', panDashboard);
  canvas.addEventListener('pointerup', stopDashboardPan, { once: true });
  canvas.addEventListener('pointercancel', stopDashboardPan, { once: true });
}

function panDashboard(event) {
  if (!activePan) return;
  activePan.canvas.scrollLeft = activePan.scrollLeft - (event.clientX - activePan.startX);
  activePan.canvas.scrollTop = activePan.scrollTop - (event.clientY - activePan.startY);
}

function stopDashboardPan(event) {
  if (!activePan) return;
  activePan.canvas.releasePointerCapture(event.pointerId);
  activePan.canvas.removeEventListener('pointermove', panDashboard);
  activePan.canvas.classList.remove('is-panning');
  activePan = null;
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
  activeDrag = { element, node, startX: event.clientX, startY: event.clientY, initialX: element.x, initialY: element.y, maxX: DASHBOARD_SURFACE_SIZE.width - element.width, maxY: DASHBOARD_SURFACE_SIZE.height - element.height };
  node.setPointerCapture(event.pointerId);
  node.addEventListener('pointermove', dragElement);
  node.addEventListener('pointerup', stopElementDrag, { once: true });
}

function dragElement(event) {
  if (!activeDrag) return;
  activeDrag.element.x = Math.min(activeDrag.maxX, Math.max(0, activeDrag.initialX + event.clientX - activeDrag.startX));
  activeDrag.element.y = Math.min(activeDrag.maxY, Math.max(0, activeDrag.initialY + event.clientY - activeDrag.startY));
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
  activeResize.element.width = Math.min(DASHBOARD_SURFACE_SIZE.width - activeResize.element.x, Math.max(220, activeResize.initialWidth + event.clientX - activeResize.startX));
  activeResize.element.height = Math.min(DASHBOARD_SURFACE_SIZE.height - activeResize.element.y, Math.max(150, activeResize.initialHeight + event.clientY - activeResize.startY));
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

function getCalendarElement(control) {
  return findElement(control.closest('.dashboard-element').dataset.elementId);
}

function setCalendarFocus(element, date) {
  element.selectedDate = formatDateInput(date);
  element.month = date.getMonth();
  element.year = date.getFullYear();
}

function moveCalendar(button, delta) {
  const element = getCalendarElement(button);
  if (!element) return;
  getCalendarState(element);
  const currentDate = new Date(`${element.selectedDate}T00:00:00`);
  if (element.view === 'day' || element.view === 'today') {
    currentDate.setDate(currentDate.getDate() + delta);
  } else if (element.view === 'week' || element.view === 'work-week') {
    currentDate.setDate(currentDate.getDate() + (delta * 7));
  } else {
    currentDate.setMonth(element.month + delta, 1);
  }
  setCalendarFocus(element, currentDate);
  saveDashboardData();
  renderDashboardView();
}

function changeCalendarView(event) {
  const element = getCalendarElement(event.target);
  if (!element) return;
  element.view = event.target.dataset.calendarView;
  saveDashboardData();
  renderDashboardView();
}

function jumpCalendarToday(event) {
  const element = getCalendarElement(event.target);
  if (!element) return;
  setCalendarFocus(element, new Date());
  element.view = 'today';
  saveDashboardData();
  renderDashboardView();
}

function selectCalendarDate(event) {
  const element = getCalendarElement(event.currentTarget);
  if (!element) return;
  const date = event.currentTarget.dataset.calendarDate;
  setCalendarFocus(element, new Date(`${date}T00:00:00`));
  openCalendarEventForm(element, { startDate: date, endDate: date });
}

function toggleCalendarSettings(event) { toggleCalendarFilters(event); }
function toggleCalendarFilters(event) {
  event.stopPropagation();
  const element = getCalendarElement(event.currentTarget);
  if (!element) return;
  element.filtersOpen = !element.filtersOpen;
  saveDashboardData();
  renderDashboardView();
}
function toggleCalendarLegend(event) {
  const element = getCalendarElement(event.currentTarget);
  if (!element) return;
  element.legendOpen = !element.legendOpen;
  saveDashboardData();
  renderDashboardView();
}
function toggleCalendarMinimize(event) {
  const element = getCalendarElement(event.currentTarget);
  if (!element) return;
  element.minimized = !element.minimized;
  saveDashboardData();
  renderDashboardView();
}
function toggleCalendarFullscreen(event) {
  const element = getCalendarElement(event.currentTarget);
  if (!element) return;
  element.fullscreen = !element.fullscreen;
  if (element.fullscreen) { element.x = 12; element.y = 12; element.width = Math.max(element.width, 980); element.height = Math.max(element.height, 720); }
  saveDashboardData();
  renderDashboardView();
}

function updateCalendarColor(event) {
  const element = getCalendarElement(event.target);
  if (!element) return;
  element.color = event.target.value;
  saveDashboardData();
  renderDashboardView();
}
function jumpCalendarDate(event) {
  const element = getCalendarElement(event.target);
  if (!element) return;
  setCalendarFocus(element, new Date(`${event.target.value}T00:00:00`));
  saveDashboardData();
  renderDashboardView();
}
function updateCalendarSearch(event) {
  const element = getCalendarElement(event.target);
  if (!element) return;
  element.search = event.target.value;
  saveDashboardData();
  renderDashboardView();
}
function updateCalendarFilter(event) {
  const element = getCalendarElement(event.target);
  if (!element) return;
  element[event.target.dataset.filter] = event.target.value;
  saveDashboardData();
  renderDashboardView();
}

function addCalendarAppointment(event) {
  const element = getCalendarElement(event.target);
  if (!element || !hasCalendarPermission('create')) return;
  openCalendarEventForm(element, { startDate: element.selectedDate, endDate: element.selectedDate });
}

function openCalendarEvent(event) {
  const element = getCalendarElement(event.target);
  const calendarEvent = loadCalendarEvents().find((item) => item.id === event.currentTarget.dataset.openEvent);
  if (!element || !calendarEvent) return;
  openCalendarEventForm(element, calendarEvent);
}

function openCalendarEventForm(element, event = {}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'modal calendar-event-modal';
  const isExisting = Boolean(event.id);
  const canEdit = !isExisting || hasCalendarPermission('edit');
  dialog.innerHTML = `<form class="modal-card calendar-event-form" method="dialog">
    <div class="modal-head"><h3>${isExisting ? 'Edit calendar event' : 'Create calendar event'}</h3><button type="button" data-close-modal>×</button></div>
    <p class="helper">Records are saved only for ${escapeHtml(currentGroup?.name || 'this workspace')} and include business_id ${escapeHtml(getCalendarBusinessId())}.</p>
    <div class="calendar-form-grid">
      <label>Title<input name="title" required value="${escapeHtml(event.title || '')}" ${canEdit ? '' : 'disabled'} /></label>
      <label>Type<select name="type" ${canEdit ? '' : 'disabled'}>${renderOptions(CALENDAR_EVENT_TYPES, event.type || 'Customer appointment')}</select></label>
      <label>Status<select name="status" ${canEdit ? '' : 'disabled'}>${renderOptions(CALENDAR_STATUSES, event.status || 'Scheduled')}</select></label>
      <label>Priority<select name="priority" ${canEdit ? '' : 'disabled'}>${renderOptions(CALENDAR_PRIORITIES, event.priority || 'Normal')}</select></label>
      <label>Start date<input name="startDate" type="date" required value="${escapeHtml(event.startDate || element.selectedDate)}" ${canEdit ? '' : 'disabled'} /></label>
      <label>End date<input name="endDate" type="date" required value="${escapeHtml(event.endDate || event.startDate || element.selectedDate)}" ${canEdit ? '' : 'disabled'} /></label>
      <label>Start time<input name="startTime" type="time" value="${escapeHtml(event.startTime || '09:00')}" ${canEdit ? '' : 'disabled'} /></label>
      <label>End time<input name="endTime" type="time" value="${escapeHtml(event.endTime || '10:00')}" ${canEdit ? '' : 'disabled'} /></label>
      <label>Time zone<input name="timeZone" value="${escapeHtml(event.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')}" ${canEdit ? '' : 'disabled'} /></label>
      <label>All day<span class="checkbox-line"><input name="allDay" type="checkbox" ${event.allDay ? 'checked' : ''} ${canEdit ? '' : 'disabled'} /> All-day event</span></label>
      <label>Employees<select name="employeeIds" multiple ${hasCalendarPermission('assign') && canEdit ? '' : 'disabled'}>${CALENDAR_EMPLOYEES.slice(1).map((employee) => `<option value="${employee}" ${event.employeeIds?.includes(employee) ? 'selected' : ''}>${employee}</option>`).join('')}</select></label>
      <label>Crew<select name="crewId" ${canEdit ? '' : 'disabled'}>${renderOptions(CALENDAR_CREWS.slice(1), event.crewId || '', 'No crew')}</select></label>
      <label>Resource<select name="resourceId" ${hasCalendarPermission('resources') && canEdit ? '' : 'disabled'}>${renderOptions(CALENDAR_RESOURCES.slice(1), event.resourceId || '', 'No resource')}</select></label>
      <label>Custom color<input name="color" type="color" value="${escapeHtml(event.color || element.color)}" ${canEdit ? '' : 'disabled'} /></label>
      <label>Customer<input name="customerName" value="${escapeHtml(event.customerName || '')}" ${canEdit ? '' : 'disabled'} /></label>
      <label>Contact<input name="contactName" value="${escapeHtml(event.contactName || '')}" ${canEdit ? '' : 'disabled'} /></label>
      <label>Phone<input name="customerPhone" type="tel" value="${escapeHtml(event.customerPhone || '')}" ${canEdit ? '' : 'disabled'} /></label>
      <label>Email<input name="customerEmail" type="email" value="${escapeHtml(event.customerEmail || '')}" ${canEdit ? '' : 'disabled'} /></label>
      <label>Job number<input name="jobNumber" value="${escapeHtml(event.jobNumber || '')}" ${canEdit ? '' : 'disabled'} /></label>
      <label>Service address<input name="serviceAddress" value="${escapeHtml(event.serviceAddress || '')}" ${canEdit ? '' : 'disabled'} /></label>
      <label>Tags<input name="tags" value="${escapeHtml((event.tags || []).join(', '))}" ${canEdit ? '' : 'disabled'} /></label>
      <label>Recurring<select name="recurrence" ${hasCalendarPermission('recurring') && canEdit ? '' : 'disabled'}>${renderOptions(['None','Daily','Weekdays','Weekly','Every two weeks','Monthly','Quarterly','Yearly','Custom days','Custom weeks'], event.recurrence || 'None')}</select></label>
      <label>Reminder<input name="reminder" value="${escapeHtml(event.reminder || 'In-app: 1 hour before')}" ${canEdit ? '' : 'disabled'} /></label>
      <label class="span-2">Description<textarea name="description" ${canEdit ? '' : 'disabled'}>${escapeHtml(event.description || '')}</textarea></label>
      <label class="span-2">Internal notes<textarea name="internalNotes" ${hasCalendarPermission('privateNotes') && canEdit ? '' : 'disabled'}>${escapeHtml(event.internalNotes || '')}</textarea></label>
      <label class="span-2">Customer-facing notes<textarea name="customerNotes" ${hasCalendarPermission('customerNotes') && canEdit ? '' : 'disabled'}>${escapeHtml(event.customerNotes || '')}</textarea></label>
    </div>
    <div class="calendar-conflict-warning" hidden></div>
    <div class="auth-actions wrap"><button class="primary-action" value="save" ${canEdit ? '' : 'disabled'}>Save event</button>${isExisting ? '<button class="secondary-action" value="duplicate">Duplicate</button><button class="secondary-action" value="complete">Mark complete</button><button class="secondary-action" value="cancel">Cancel event</button><button class="secondary-action danger" value="delete">Delete</button>' : ''}<button class="secondary-action" type="button" data-close-modal>Close</button></div>
  </form>`;
  document.body.append(dialog);
  const form = dialog.querySelector('form');
  const warning = dialog.querySelector('.calendar-conflict-warning');
  form.addEventListener('input', () => showCalendarConflicts(form, event.id, warning));
  form.addEventListener('submit', (submitEvent) => saveCalendarEvent(submitEvent, element, event, dialog));
  dialog.querySelectorAll('[data-close-modal]').forEach((button) => button.addEventListener('click', () => dialog.close()));
  dialog.addEventListener('close', () => dialog.remove());
  showCalendarConflicts(form, event.id, warning);
  dialog.showModal();
}


function getEventFromForm(form, existing = {}) {
  const data = new FormData(form);
  return {
    ...existing,
    id: existing.id || `event-${Date.now()}`,
    businessId: getCalendarBusinessId(),
    title: data.get('title').trim(),
    type: data.get('type'),
    status: data.get('status'),
    priority: data.get('priority'),
    startDate: data.get('startDate'),
    endDate: data.get('endDate') || data.get('startDate'),
    startTime: data.get('startTime'),
    endTime: data.get('endTime'),
    allDay: data.get('allDay') === 'on',
    timeZone: data.get('timeZone'),
    employeeIds: data.getAll('employeeIds'),
    crewId: data.get('crewId'),
    resourceId: data.get('resourceId'),
    color: data.get('color'),
    customerName: data.get('customerName'),
    contactName: data.get('contactName'),
    customerPhone: data.get('customerPhone'),
    customerEmail: data.get('customerEmail'),
    jobNumber: data.get('jobNumber'),
    serviceAddress: data.get('serviceAddress'),
    tags: normalizeTags(data.get('tags')),
    recurrence: data.get('recurrence'),
    reminder: data.get('reminder'),
    description: data.get('description'),
    internalNotes: data.get('internalNotes'),
    customerNotes: data.get('customerNotes'),
    updatedBy: currentUser?.id || 'local-user',
    updatedAt: new Date().toISOString(),
    createdBy: existing.createdBy || currentUser?.id || 'local-user',
    createdAt: existing.createdAt || new Date().toISOString(),
    activity: [...(existing.activity || []), { at: new Date().toISOString(), by: currentUser?.id || 'local-user', action: existing.id ? 'Event edited' : 'Event created' }],
  };
}

function showCalendarConflicts(form, eventId, warning) {
  const draft = getEventFromForm(form, { id: eventId || 'draft' });
  const conflicts = loadCalendarEvents().filter((event) => event.id !== eventId && eventsOverlap(event, draft) && (
    (draft.employeeIds || []).some((employee) => event.employeeIds?.includes(employee)) ||
    (draft.resourceId && event.resourceId === draft.resourceId)
  ));
  warning.hidden = conflicts.length === 0;
  warning.textContent = conflicts.length ? `Warning: ${conflicts.length} scheduling/resource conflict${conflicts.length === 1 ? '' : 's'} found. Authorized users may still save.` : '';
}

function saveCalendarEvent(event, element, existing, dialog) {
  event.preventDefault();
  const action = event.submitter?.value || 'save';
  let events = loadCalendarEvents();
  if (action === 'delete') {
    if (!hasCalendarPermission('delete') || !window.confirm('Delete this calendar event?')) return;
    events = events.filter((item) => item.id !== existing.id);
  } else if (action === 'cancel') {
    if (!hasCalendarPermission('cancel')) return;
    events = events.map((item) => item.id === existing.id ? { ...item, status: 'Cancelled', activity: [...(item.activity || []), { at: new Date().toISOString(), by: currentUser?.id || 'local-user', action: 'Event cancelled' }] } : item);
  } else if (action === 'complete') {
    events = events.map((item) => item.id === existing.id ? { ...item, status: 'Completed', activity: [...(item.activity || []), { at: new Date().toISOString(), by: currentUser?.id || 'local-user', action: 'Event completed' }] } : item);
  } else {
    if (!hasCalendarPermission(existing.id ? 'edit' : 'create')) return;
    const next = getEventFromForm(event.currentTarget, action === 'duplicate' ? {} : existing);
    if (!next.title || next.endDate < next.startDate || (!next.allDay && next.endTime && next.startTime && next.endTime <= next.startTime && next.endDate === next.startDate)) {
      event.currentTarget.reportValidity();
      return;
    }
    events = events.filter((item) => item.id !== next.id);
    events.push(action === 'duplicate' ? { ...next, id: `event-${Date.now()}`, title: `${next.title} copy`, activity: [{ at: new Date().toISOString(), by: currentUser?.id || 'local-user', action: 'Event duplicated' }] } : next);
    setCalendarFocus(element, new Date(`${next.startDate}T00:00:00`));
  }
  saveCalendarEvents(events);
  saveDashboardData();
  dialog.close();
  renderDashboardView();
}

function dragCalendarEvent(event) {
  event.dataTransfer.setData('text/calendar-event-id', event.currentTarget.dataset.eventId);
}

function dropCalendarEvent(event) {
  event.preventDefault();
  if (!hasCalendarPermission('edit')) return;
  const id = event.dataTransfer.getData('text/calendar-event-id');
  const date = event.currentTarget.dataset.dropDate;
  const events = loadCalendarEvents().map((item) => {
    if (item.id !== id) return item;
    const originalStart = new Date(`${item.startDate}T00:00:00`);
    const originalEnd = new Date(`${item.endDate || item.startDate}T00:00:00`);
    const durationDays = Math.max(0, Math.round((originalEnd - originalStart) / 86400000));
    return {
      ...item,
      startDate: date,
      endDate: formatDateInput(addDays(new Date(`${date}T00:00:00`), durationDays)),
      updatedAt: new Date().toISOString(),
      activity: [...(item.activity || []), { at: new Date().toISOString(), by: currentUser?.id || 'local-user', action: 'Date changed by drag-and-drop' }],
    };
  });
  saveCalendarEvents(events);
  renderDashboardView();
}

function resizeCalendarEvent(event) {
  const id = event.currentTarget.dataset.resizeEvent;
  const events = loadCalendarEvents().map((item) => item.id === id ? { ...item, endTime: item.endTime ? `${String(Math.min(23, Number(item.endTime.slice(0, 2)) + 1)).padStart(2, '0')}${item.endTime.slice(2)}` : '10:00', activity: [...(item.activity || []), { at: new Date().toISOString(), by: currentUser?.id || 'local-user', action: 'Time changed by resize control' }] } : item);
  saveCalendarEvents(events);
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
