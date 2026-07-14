let pipelines = [];
let activePipelineId = null;

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
  return pipelines.find((pipeline) => pipeline.id === activePipelineId) || null;
}

function renderPipelineView() {
  const pipeline = activePipeline();
  pageTitle.textContent = 'Pipelines';
  breadcrumb.innerHTML = pipeline ? `Pipelines / <span>${pipeline.name}</span>⌄` : 'Pipelines';

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
        <select id="pipeline-select">${pipelines.map((item) => `<option value="${item.id}" ${item.id === pipeline.id ? 'selected' : ''}>${item.name}</option>`).join('')}</select>
      </label>
    </section>
    <section class="board" style="--stage-count:${Math.max(pipeline.steps.length, 1)}" aria-label="${pipeline.name} board">
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
    <header style="background:${step.color}"><strong>${step.title}</strong><span>${step.subtitle || 'Drag cards here'}</span></header>
    <div class="stage-summary"><span>${stepItems.length || 'No'} card${stepItems.length === 1 ? '' : 's'}</span><b>${money(total)}</b></div>
    <div class="cards drop-zone" data-step-id="${step.id}">${stepItems.length ? stepItems.map(renderCard).join('') : '<p class="empty">No cards yet.<br />Use Add item to start.</p>'}</div>
  </article>`;
}

function renderCard(item) {
  return `<article class="deal-card" draggable="true" data-item-id="${item.id}"><div><span class="avatar">${item.title.slice(0, 1).toUpperCase()}</span><a>${item.title}</a></div><b>${money(item.value)}</b><small>${item.note || 'No note'}</small></article>`;
}

function renderItemModal(pipeline) {
  return `<dialog class="modal" id="item-modal"><form method="dialog" class="modal-card" id="item-form"><div class="modal-head"><h3>Add item</h3><button value="cancel" aria-label="Close">×</button></div><input id="item-title" placeholder="Item title" required /><input id="item-value" placeholder="Value (optional)" type="number" min="0" /><input id="item-note" placeholder="Short note" /><select id="item-step">${pipeline.steps.map((step) => `<option value="${step.id}">${step.title}</option>`).join('')}</select><button class="primary-action" value="default" type="submit">＋ Add item</button></form></dialog>`;
}

function renderPipelineModal() {
  return `<dialog class="modal" id="pipeline-modal"><form method="dialog" class="modal-card" id="pipeline-form"><div class="modal-head"><h3>Create pipeline</h3><button value="cancel" aria-label="Close">×</button></div><input id="pipeline-name" placeholder="Pipeline name" required /><p class="helper">Add the steps you want to use for this pipeline.</p><div id="step-builder"></div><button class="secondary-action" id="add-step" type="button">＋ Add step</button><button class="primary-action" value="default" type="submit">Create pipeline</button></form></dialog>`;
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

function addItem(event) {
  event.preventDefault();
  const pipeline = activePipeline();
  const title = document.querySelector('#item-title').value.trim();
  if (!pipeline || !title) return;
  pipeline.items.push({ id: `item-${Date.now()}`, title, value: Number(document.querySelector('#item-value').value || 0), note: document.querySelector('#item-note').value || 'No note', stepId: document.querySelector('#item-step').value });
  document.querySelector('#item-modal').close();
  renderPipelineView();
}

function moveItem(event) {
  event.preventDefault();
  event.currentTarget.classList.remove('drag-over');
  const itemId = event.dataTransfer.getData('text/plain');
  const item = activePipeline()?.items.find((card) => card.id === itemId);
  if (item) item.stepId = event.currentTarget.dataset.stepId;
  renderPipelineView();
}

function openPipelineModal() {
  document.querySelector('#step-builder').innerHTML = '';
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
  if (!name) return;
  const pipeline = { id: `pipeline-${Date.now()}`, name, items: [], steps: rows.map((row, index) => ({ id: `step-${Date.now()}-${index}`, title: row.querySelector('.step-name').value.trim() || `Step ${index + 1}`, subtitle: row.querySelector('.step-subtitle').value.trim(), color: row.querySelector('.step-color').value })) };
  pipelines.push(pipeline);
  activePipelineId = pipeline.id;
  document.querySelector('#pipeline-modal').close();
  renderPipelineView();
}

document.querySelector('#accent').addEventListener('input', (event) => document.documentElement.style.setProperty('--accent', event.target.value));
document.querySelector('#radius').addEventListener('input', (event) => document.documentElement.style.setProperty('--card-radius', `${event.target.value}px`));
document.querySelector('#compact').addEventListener('change', (event) => workspace.classList.toggle('compact', event.target.checked));

renderPipelineView();
