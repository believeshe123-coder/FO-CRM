const SUPABASE_URL = 'https://YOUR_PROJECT_REF.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

const supabaseClient = window.supabase?.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let pipelines = [];
let activePipelineId = null;
let currentSession = null;
let currentUser = null;

const content = document.querySelector('#content');
const pageTitle = document.querySelector('#page-title');
const workspace = document.querySelector('#workspace');
const breadcrumb = document.querySelector('#breadcrumb');
const authPanel = document.querySelector('#auth-panel');
const userEmail = document.querySelector('#user-email');
const logoutButton = document.querySelector('#logout-button');

function money(value) {
  const amount = Number(value || 0);
  if (amount >= 1000) return `$${Math.round(amount / 1000)}k`;
  return `$${amount}`;
}

function activePipeline() {
  return pipelines.find((pipeline) => pipeline.id === activePipelineId) || null;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function requireSupabase() {
  if (!supabaseClient || SUPABASE_URL.includes('YOUR_PROJECT_REF') || SUPABASE_ANON_KEY.includes('YOUR_SUPABASE_ANON_KEY')) {
    throw new Error('Supabase is not configured. Add your project URL and anon key in src/main.js.');
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
  pipelines = [];
  activePipelineId = null;
  currentUser = null;
  pageTitle.textContent = 'Sign in';
  breadcrumb.textContent = 'Account';
  authPanel.hidden = true;
  content.innerHTML = `
    <section class="auth-view" aria-live="polite">
      <form class="auth-card" id="auth-form">
        <span class="auth-kicker">Supabase Auth</span>
        <h3>Sign in to your CRM</h3>
        <p>Use an email and password to save pipelines, steps, and items to your Supabase project.</p>
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

async function loadCrmData() {
  const client = requireSupabase();
  renderLoadingView();

  const { data: pipelineRows, error: pipelineError } = await client
    .from('pipelines')
    .select('id, name, created_at')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: true });
  if (pipelineError) throw pipelineError;

  const pipelineIds = (pipelineRows || []).map((pipeline) => pipeline.id);
  let stepRows = [];
  let itemRows = [];

  if (pipelineIds.length) {
    const [{ data: steps, error: stepsError }, { data: items, error: itemsError }] = await Promise.all([
      client.from('pipeline_steps').select('id, pipeline_id, title, subtitle, color, position, created_at').eq('user_id', currentUser.id).in('pipeline_id', pipelineIds).order('position', { ascending: true }),
      client.from('pipeline_items').select('id, pipeline_id, step_id, title, value, note, created_at').eq('user_id', currentUser.id).in('pipeline_id', pipelineIds).order('created_at', { ascending: true }),
    ]);
    if (stepsError) throw stepsError;
    if (itemsError) throw itemsError;
    stepRows = steps || [];
    itemRows = items || [];
  }

  pipelines = (pipelineRows || []).map((pipeline) => ({
    id: pipeline.id,
    name: pipeline.name,
    steps: stepRows
      .filter((step) => step.pipeline_id === pipeline.id)
      .map((step) => ({ id: step.id, title: step.title, subtitle: step.subtitle, color: step.color || '#0b55ff' })),
    items: itemRows
      .filter((item) => item.pipeline_id === pipeline.id)
      .map((item) => ({ id: item.id, title: item.title, value: item.value, note: item.note, stepId: item.step_id })),
  }));

  if (!pipelines.some((pipeline) => pipeline.id === activePipelineId)) {
    activePipelineId = pipelines[0]?.id || null;
  }
  updateAuthShell();
  renderPipelineView();
}

function renderLoadingView() {
  pageTitle.textContent = 'Loading';
  breadcrumb.textContent = 'Pipelines';
  content.innerHTML = '<section class="empty-pipelines" aria-live="polite"><p>Loading your CRM data…</p></section>';
}

function renderPipelineView() {
  if (!currentSession) {
    renderAuthView();
    return;
  }

  const pipeline = activePipeline();
  pageTitle.textContent = 'Pipelines';
  breadcrumb.innerHTML = pipeline ? `Pipelines / <span>${escapeHtml(pipeline.name)}</span>⌄` : 'Pipelines';

  if (!pipeline) {
    content.innerHTML = `
      <section class="pipeline-toolbar" aria-label="Pipeline controls">
        <div class="toolbar-left">
          <button class="secondary-action" id="open-pipeline-modal">▦ New pipeline</button>
        </div>
      </section>
      <section class="empty-pipelines" aria-live="polite">
        <p>No pipelines to be found, make a new pipeline to see steps here.</p>
      </section>
      ${renderPipelineModal()}`;
    bindEmptyPipelineEvents();
    return;
  }

  content.innerHTML = `
    <section class="pipeline-toolbar" aria-label="Pipeline controls">
      <div class="toolbar-left">
        <button class="primary-action" id="open-item-modal">＋ Add item</button>
        <button class="secondary-action" id="open-pipeline-modal">▦ New pipeline</button>
      </div>
      <label class="pipeline-picker">Pipeline
        <select id="pipeline-select">${pipelines.map((item) => `<option value="${item.id}" ${item.id === pipeline.id ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select>
      </label>
    </section>
    <section class="board" style="--stage-count:${Math.max(pipeline.steps.length, 1)}" aria-label="${escapeHtml(pipeline.name)} board">
      ${pipeline.steps.length ? pipeline.steps.map((step) => renderStep(step, pipeline)).join('') : `<div class="empty-pipelines empty-pipelines--board"><p>No steps to show yet.</p></div>`}
    </section>
    ${renderItemModal(pipeline)}
    ${renderPipelineModal()}`;

  bindPipelineEvents();
}

function renderStep(step, pipeline) {
  const stepItems = pipeline.items.filter((item) => item.stepId === step.id);
  const total = stepItems.reduce((sum, item) => sum + Number(item.value || 0), 0);
  return `<article class="stage" data-step-id="${step.id}">
    <header style="background:${escapeHtml(step.color)}"><strong>${escapeHtml(step.title)}</strong><span>${escapeHtml(step.subtitle || 'Drag cards here')}</span></header>
    <div class="stage-summary"><span>${stepItems.length || 'No'} card${stepItems.length === 1 ? '' : 's'}</span><b>${money(total)}</b></div>
    <div class="cards drop-zone" data-step-id="${step.id}">${stepItems.length ? stepItems.map(renderCard).join('') : '<p class="empty">No cards yet.<br />Use Add item to start.</p>'}</div>
  </article>`;
}

function renderCard(item) {
  return `<article class="deal-card" draggable="true" data-item-id="${item.id}"><div><span class="avatar">${escapeHtml(item.title.slice(0, 1).toUpperCase())}</span><a>${escapeHtml(item.title)}</a></div><b>${money(item.value)}</b><small>${escapeHtml(item.note || 'No note')}</small></article>`;
}

function renderItemModal(pipeline) {
  return `<dialog class="modal" id="item-modal"><form method="dialog" class="modal-card" id="item-form"><div class="modal-head"><h3>Add item</h3><button value="cancel" aria-label="Close">×</button></div><input id="item-title" placeholder="Item title" required /><input id="item-value" placeholder="Value (optional)" type="number" min="0" /><input id="item-note" placeholder="Short note" /><select id="item-step">${pipeline.steps.map((step) => `<option value="${step.id}">${escapeHtml(step.title)}</option>`).join('')}</select><p class="status-message"></p><button class="primary-action" value="default" type="submit">＋ Add item</button></form></dialog>`;
}

function renderPipelineModal() {
  return `<dialog class="modal" id="pipeline-modal"><form method="dialog" class="modal-card" id="pipeline-form"><div class="modal-head"><h3>Create pipeline</h3><button value="cancel" aria-label="Close">×</button></div><input id="pipeline-name" placeholder="Pipeline name" required /><p class="helper">Add the steps you want to use for this pipeline.</p><div id="step-builder"></div><button class="secondary-action" id="add-step" type="button">＋ Add step</button><p class="status-message"></p><button class="primary-action" value="default" type="submit">Create pipeline</button></form></dialog>`;
}

function bindEmptyPipelineEvents() {
  document.querySelector('#open-pipeline-modal').addEventListener('click', openPipelineModal);
  document.querySelector('#pipeline-form').addEventListener('submit', addPipeline);
  document.querySelector('#add-step').addEventListener('click', () => addStepRow());
}

function bindPipelineEvents() {
  document.querySelector('#open-item-modal').addEventListener('click', () => document.querySelector('#item-modal').showModal());
  document.querySelector('#open-pipeline-modal').addEventListener('click', openPipelineModal);
  document.querySelector('#pipeline-select').addEventListener('change', (event) => { activePipelineId = event.target.value; renderPipelineView(); });
  document.querySelector('#item-form').addEventListener('submit', addItem);
  document.querySelector('#pipeline-form').addEventListener('submit', addPipeline);
  document.querySelector('#add-step').addEventListener('click', () => addStepRow());
  document.querySelectorAll('.deal-card').forEach((card) => card.addEventListener('dragstart', (event) => event.dataTransfer.setData('text/plain', card.dataset.itemId)));
  document.querySelectorAll('.drop-zone').forEach((zone) => {
    zone.addEventListener('dragover', (event) => { event.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', moveItem);
  });
}

async function addItem(event) {
  event.preventDefault();
  const pipeline = activePipeline();
  const title = document.querySelector('#item-title').value.trim();
  if (!pipeline || !title || !currentUser) return;
  const payload = { user_id: currentUser.id, pipeline_id: pipeline.id, step_id: document.querySelector('#item-step').value, title, value: Number(document.querySelector('#item-value').value || 0), note: document.querySelector('#item-note').value || 'No note' };
  const { data, error } = await requireSupabase().from('pipeline_items').insert(payload).select('id, pipeline_id, step_id, title, value, note').single();
  if (error) {
    showMessage(error.message, 'error', document.querySelector('#item-form'));
    return;
  }
  pipeline.items.push({ id: data.id, title: data.title, value: data.value, note: data.note, stepId: data.step_id });
  document.querySelector('#item-modal').close();
  renderPipelineView();
}

async function moveItem(event) {
  event.preventDefault();
  event.currentTarget.classList.remove('drag-over');
  const itemId = event.dataTransfer.getData('text/plain');
  const stepId = event.currentTarget.dataset.stepId;
  const item = activePipeline()?.items.find((card) => card.id === itemId);
  if (!item || item.stepId === stepId) return;
  const previousStepId = item.stepId;
  item.stepId = stepId;
  renderPipelineView();
  const { error } = await requireSupabase().from('pipeline_items').update({ step_id: stepId }).eq('id', itemId).eq('user_id', currentUser.id);
  if (error) {
    item.stepId = previousStepId;
    renderPipelineView();
    window.alert(error.message);
  }
}

function openPipelineModal() {
  document.querySelector('#step-builder').innerHTML = '';
  addStepRow('Lead', '#0b55ff');
  addStepRow('Qualified', '#7c3aed');
  addStepRow('Won', '#16a34a');
  document.querySelector('#pipeline-modal').showModal();
}

function addStepRow(name = '', color = '#0b55ff') {
  const row = document.createElement('div');
  row.className = 'step-row';
  row.innerHTML = `<input class="step-name" placeholder="Step name" value="${escapeHtml(name)}" required /><input class="step-subtitle" placeholder="Step description" /><input class="step-color" type="color" value="${escapeHtml(color)}" />`;
  document.querySelector('#step-builder').append(row);
}

async function addPipeline(event) {
  event.preventDefault();
  const name = document.querySelector('#pipeline-name').value.trim();
  const rows = [...document.querySelectorAll('.step-row')];
  if (!name || !currentUser) return;

  const { data: pipeline, error: pipelineError } = await requireSupabase()
    .from('pipelines')
    .insert({ user_id: currentUser.id, name })
    .select('id, name')
    .single();
  if (pipelineError) {
    showMessage(pipelineError.message, 'error', document.querySelector('#pipeline-form'));
    return;
  }

  const stepPayloads = rows.map((row, index) => ({
    user_id: currentUser.id,
    pipeline_id: pipeline.id,
    title: row.querySelector('.step-name').value.trim() || `Step ${index + 1}`,
    subtitle: row.querySelector('.step-subtitle').value.trim(),
    color: row.querySelector('.step-color').value,
    position: index,
  }));

  let steps = [];
  if (stepPayloads.length) {
    const { data, error: stepsError } = await requireSupabase()
      .from('pipeline_steps')
      .insert(stepPayloads)
      .select('id, title, subtitle, color, position');
    if (stepsError) {
      showMessage(stepsError.message, 'error', document.querySelector('#pipeline-form'));
      return;
    }
    steps = (data || []).sort((first, second) => first.position - second.position);
  }

  pipelines.push({ id: pipeline.id, name: pipeline.name, items: [], steps: steps.map((step) => ({ id: step.id, title: step.title, subtitle: step.subtitle, color: step.color })) });
  activePipelineId = pipeline.id;
  document.querySelector('#pipeline-modal').close();
  renderPipelineView();
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
    await loadCrmData();
  } catch (error) {
    showMessage(error.message);
  }
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
      await loadCrmData();
      return;
    }
    showMessage('Account created. Check your email to confirm your signup before signing in.', 'success');
  } catch (error) {
    showMessage(error.message);
  }
}

async function logout() {
  const client = requireSupabase();
  await client.auth.signOut();
  currentSession = null;
  currentUser = null;
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
    await loadCrmData();
  } catch (error) {
    renderAuthView(error.message);
  }
}

document.querySelector('#accent').addEventListener('input', (event) => document.documentElement.style.setProperty('--accent', event.target.value));
document.querySelector('#radius').addEventListener('input', (event) => document.documentElement.style.setProperty('--card-radius', `${event.target.value}px`));
document.querySelector('#compact').addEventListener('change', (event) => workspace.classList.toggle('compact', event.target.checked));
logoutButton.addEventListener('click', logout);

initializeApp();
