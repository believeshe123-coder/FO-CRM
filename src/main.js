const emptyPipeline = {
  id: 'fresh-pipeline',
  name: 'Fresh Pipeline',
  type: 'deals',
  steps: [
    { id: 'new', title: 'New', subtitle: 'First touch', color: '#69738f' },
    { id: 'working', title: 'Working', subtitle: 'In progress', color: '#ff7c2f' },
    { id: 'done', title: 'Done', subtitle: 'Completed or won', color: '#23c4a0' },
  ],
  items: [],
};

let activeView = 'deals';
let pipelines = [{ ...emptyPipeline, steps: [...emptyPipeline.steps], items: [] }];
let activePipelineId = pipelines[0].id;

const content = document.querySelector('#content');
const pageTitle = document.querySelector('#page-title');
const workspace = document.querySelector('#workspace');
const breadcrumb = document.querySelector('#breadcrumb');

function money(value) {
  const amount = Number(value || 0);
  if (amount >= 1000) return `$${Math.round(amount / 1000)}k`;
  return `$${amount}`;
}

function activePipeline() {
  return pipelines.find((pipeline) => pipeline.id === activePipelineId) || pipelines[0];
}

function currentPipelines() {
  return pipelines.filter((pipeline) => pipeline.type === activeView);
}

function ensureActivePipeline() {
  const visible = currentPipelines();
  if (!visible.length) {
    const pipeline = createPipeline(activeView === 'deals' ? 'Fresh Deals Pipeline' : 'Fresh Tasks Pipeline', activeView);
    pipelines.push(pipeline);
    activePipelineId = pipeline.id;
    return pipeline;
  }
  if (!visible.some((pipeline) => pipeline.id === activePipelineId)) activePipelineId = visible[0].id;
  return activePipeline();
}

function createPipeline(name, type) {
  return {
    id: `pipeline-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name,
    type,
    steps: [
      { id: `step-${Date.now()}-1`, title: 'New', subtitle: 'Add cards here', color: '#69738f' },
      { id: `step-${Date.now()}-2`, title: 'In Progress', subtitle: 'Drag cards forward', color: '#ff7c2f' },
      { id: `step-${Date.now()}-3`, title: 'Complete', subtitle: 'Finished work', color: '#23c4a0' },
    ],
    items: [],
  };
}

function renderPipelineView() {
  const pipeline = ensureActivePipeline();
  const totalValue = pipeline.items.reduce((sum, item) => sum + Number(item.value || 0), 0);
  const openItems = pipeline.items.length;
  const visiblePipelines = currentPipelines();
  pageTitle.textContent = activeView === 'deals' ? 'Deals' : 'Tasks';
  breadcrumb.innerHTML = `${activeView === 'deals' ? 'Deals' : 'Tasks'} / Pipelines / <span>${pipeline.name}</span>⌄`;

  content.innerHTML = `
    <section class="pipeline-toolbar" aria-label="Pipeline controls">
      <div class="toolbar-left">
        <button class="primary-action" id="open-item-modal">＋ Add item</button>
        <button class="secondary-action" id="open-pipeline-modal">▦ New pipeline</button>
      </div>
      <label class="pipeline-picker">Pipeline
        <select id="pipeline-select">${visiblePipelines.map((item) => `<option value="${item.id}" ${item.id === pipeline.id ? 'selected' : ''}>${item.name}</option>`).join('')}</select>
      </label>
    </section>
    <section class="metrics" aria-label="Pipeline summary">
      <article class="metric"><span>${activeView === 'deals' ? 'Pipeline value' : 'Task value'}</span><b>${money(totalValue)}</b><small>Fresh workspace</small></article>
      <article class="metric"><span>Cards</span><b>${openItems}</b><small>Drag between steps</small></article>
      <article class="metric"><span>Steps</span><b>${pipeline.steps.length}</b><small>Color coded</small></article>
      <article class="metric"><span>Pipelines</span><b>${visiblePipelines.length}</b><small>${activeView}</small></article>
    </section>
    <section class="prompt-row" aria-label="Smart prompts">
      <button>✦ Find stalled cards</button><button>✦ Summarize this pipeline</button><button>✦ Suggest next step</button>
    </section>
    <section class="board" style="--stage-count:${pipeline.steps.length}" aria-label="${pipeline.name} board">
      ${pipeline.steps.map((step) => renderStep(step, pipeline)).join('')}
    </section>
    ${renderItemModal(pipeline)}
    ${renderPipelineModal()}`;

  bindPipelineEvents();
}

function renderStep(step, pipeline) {
  const stepItems = pipeline.items.filter((item) => item.stepId === step.id);
  const total = stepItems.reduce((sum, item) => sum + Number(item.value || 0), 0);
  return `<article class="stage" data-step-id="${step.id}">
    <header style="background:${step.color}"><strong>${step.title}</strong><span>${step.subtitle || 'Drag cards here'}</span></header>
    <div class="stage-summary"><span>${stepItems.length || 'No'} card${stepItems.length === 1 ? '' : 's'}</span><b>${money(total)}</b></div>
    <div class="cards drop-zone" data-step-id="${step.id}">${stepItems.length ? stepItems.map(renderCard).join('') : '<p class="empty">No cards yet.<br />Use Add item to start.</p>'}</div>
  </article>`;
}

function renderCard(item) {
  return `<article class="deal-card" draggable="true" data-item-id="${item.id}"><div><span class="avatar">${item.title.slice(0, 1).toUpperCase()}</span><a>${item.title}</a></div><b>${money(item.value)}</b><small>${item.note || 'No note'} · ${item.type}</small></article>`;
}

function renderItemModal(pipeline) {
  return `<dialog class="modal" id="item-modal"><form method="dialog" class="modal-card" id="item-form"><div class="modal-head"><h3>Add card item</h3><button value="cancel" aria-label="Close">×</button></div><input id="item-title" placeholder="Card title" required /><input id="item-value" placeholder="Value (optional)" type="number" min="0" /><input id="item-note" placeholder="Short note" /><select id="item-step">${pipeline.steps.map((step) => `<option value="${step.id}">${step.title}</option>`).join('')}</select><button class="primary-action" value="default" type="submit">＋ Add card</button></form></dialog>`;
}

function renderPipelineModal() {
  return `<dialog class="modal" id="pipeline-modal"><form method="dialog" class="modal-card" id="pipeline-form"><div class="modal-head"><h3>Create pipeline</h3><button value="cancel" aria-label="Close">×</button></div><input id="pipeline-name" placeholder="Pipeline name" required /><p class="helper">Add each step name and color. You can create more steps before saving.</p><div id="step-builder"></div><button class="secondary-action" id="add-step" type="button">＋ Add step</button><button class="primary-action" value="default" type="submit">Create pipeline</button></form></dialog>`;
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

function addItem(event) {
  event.preventDefault();
  const pipeline = activePipeline();
  const title = document.querySelector('#item-title').value.trim();
  if (!title) return;
  pipeline.items.push({ id: `item-${Date.now()}`, title, value: Number(document.querySelector('#item-value').value || 0), note: document.querySelector('#item-note').value || 'No note', stepId: document.querySelector('#item-step').value, type: activeView.slice(0, -1) });
  document.querySelector('#item-modal').close();
  renderPipelineView();
}

function moveItem(event) {
  event.preventDefault();
  event.currentTarget.classList.remove('drag-over');
  const itemId = event.dataTransfer.getData('text/plain');
  const item = activePipeline().items.find((card) => card.id === itemId);
  if (item) item.stepId = event.currentTarget.dataset.stepId;
  renderPipelineView();
}

function openPipelineModal() {
  document.querySelector('#step-builder').innerHTML = '';
  ['New', 'In Progress', 'Complete'].forEach((name, index) => addStepRow(name, ['#69738f', '#ff7c2f', '#23c4a0'][index]));
  document.querySelector('#pipeline-modal').showModal();
}

function addStepRow(name = '', color = '#0b55ff') {
  const row = document.createElement('div');
  row.className = 'step-row';
  row.innerHTML = `<input class="step-name" placeholder="Step name" value="${name}" required /><input class="step-subtitle" placeholder="Step description" /><input class="step-color" type="color" value="${color}" />`;
  document.querySelector('#step-builder').append(row);
}

function addPipeline(event) {
  event.preventDefault();
  const name = document.querySelector('#pipeline-name').value.trim();
  const rows = [...document.querySelectorAll('.step-row')];
  if (!name || !rows.length) return;
  const pipeline = { id: `pipeline-${Date.now()}`, name, type: activeView, items: [], steps: rows.map((row, index) => ({ id: `step-${Date.now()}-${index}`, title: row.querySelector('.step-name').value.trim() || `Step ${index + 1}`, subtitle: row.querySelector('.step-subtitle').value.trim(), color: row.querySelector('.step-color').value })) };
  pipelines.push(pipeline);
  activePipelineId = pipeline.id;
  document.querySelector('#pipeline-modal').close();
  renderPipelineView();
}

function setView(view) {
  activeView = view;
  document.querySelectorAll('.nav-pill').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  renderPipelineView();
}

document.querySelectorAll('.nav-pill').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
document.querySelector('#accent').addEventListener('input', (event) => document.documentElement.style.setProperty('--accent', event.target.value));
document.querySelector('#radius').addEventListener('input', (event) => document.documentElement.style.setProperty('--card-radius', `${event.target.value}px`));
document.querySelector('#compact').addEventListener('change', (event) => workspace.classList.toggle('compact', event.target.checked));

setView(activeView);
