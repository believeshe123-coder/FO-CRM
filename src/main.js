const stages = [
  { id: 'prospecting', title: 'Prospecting Stage', subtitle: 'Turning Suspects Into Prospects', color: '#69738f' },
  { id: 'qualifying', title: 'Qualifying Stage', subtitle: 'Are They A Fit?', color: '#ff7c2f' },
  { id: 'quoting', title: 'Quoting Stage', subtitle: 'Gathering Information To Generate A Quote', color: '#f8d86a' },
  { id: 'closing', title: 'Closing Stage', subtitle: 'Overcoming Objections and Closing the Sale', color: '#23c4a0' },
  { id: 'implementation', title: 'Implementation Stage', subtitle: 'Seek Cross-Sell / Upsell Opportunities', color: '#547ff4' },
];

let activeView = 'deals';
let deals = [
  { id: 1, name: 'Jonathan Vega / CBRE', value: 100, owner: 'HQ', stage: 'quoting', age: '11 days old', task: 'No task' },
  { id: 2, name: 'Luke Silverman', value: 30000, owner: 'HQ', stage: 'closing', age: '2 minutes old', task: 'No task' },
];
let tasks = [
  { id: 1, title: 'Confirm quote details with Jonathan', due: 'Today', deal: 'Jonathan Vega / CBRE', status: 'Open' },
  { id: 2, title: 'Send implementation outline', due: 'Tomorrow', deal: 'Luke Silverman', status: 'Open' },
];

const content = document.querySelector('#content');
const pageTitle = document.querySelector('#page-title');
const workspace = document.querySelector('#workspace');

function money(value) {
  if (value >= 1000) return `$${Math.round(value / 1000)}k`;
  return `$${value}`;
}

function renderDeals() {
  content.innerHTML = `
    <section class="prompt-row" aria-label="Smart prompts">
      <button>✦ Find stalled deals</button>
      <button>✦ What's my forecasted revenue?</button>
      <button>✦ How healthy is my pipeline?</button>
    </section>
    <form class="create-bar" id="deal-form">
      <input id="deal-name" aria-label="Deal name" placeholder="Deal or customer name" />
      <input id="deal-value" aria-label="Deal value" placeholder="Value" type="number" min="0" />
      <select id="deal-stage" aria-label="Deal stage">${stages.map((stage) => `<option value="${stage.id}">${stage.title}</option>`).join('')}</select>
      <button type="submit">＋ Add a deal</button>
    </form>
    <section class="board" aria-label="Deal pipeline board">
      ${stages.map(renderStage).join('')}
    </section>`;
  document.querySelector('#deal-form').addEventListener('submit', addDeal);
}

function renderStage(stage) {
  const stageDeals = deals.filter((deal) => deal.stage === stage.id);
  const total = stageDeals.reduce((sum, deal) => sum + Number(deal.value || 0), 0);
  return `<article class="stage">
    <header style="background:${stage.color}"><strong>${stage.title}</strong><span>${stage.subtitle}</span></header>
    <div class="stage-summary"><span>${stageDeals.length || 'No'} deal${stageDeals.length === 1 ? '' : 's'}</span><b>${money(total)}</b></div>
    <div class="cards">${stageDeals.length ? stageDeals.map(renderDealCard).join('') : '<p class="empty">Could not find any deals.<br />Add one when you are ready.</p>'}</div>
  </article>`;
}

function renderDealCard(deal) {
  return `<article class="deal-card"><div><span class="avatar">●</span><a>${deal.name}</a></div><b>${money(deal.value)}</b><small>${deal.age} · ${deal.task}</small></article>`;
}

function addDeal(event) {
  event.preventDefault();
  const name = document.querySelector('#deal-name').value.trim();
  if (!name) return;
  deals.push({ id: Date.now(), name, value: Number(document.querySelector('#deal-value').value || 0), owner: 'You', stage: document.querySelector('#deal-stage').value, age: 'Just now', task: 'No task' });
  renderDeals();
}

function renderTasks() {
  content.innerHTML = `<section class="task-panel">
    <form class="create-card" id="task-form"><h3>Add a task</h3><input id="task-title" placeholder="Task title" /><input id="task-due" placeholder="Due date or timing" /><input id="task-deal" placeholder="Related deal" /><button type="submit">＋ Add a task</button></form>
    <div class="task-list">${tasks.map((task) => `<article class="task"><b>${task.title}</b><span>${task.due} · ${task.deal}</span><em>${task.status}</em></article>`).join('')}</div>
  </section>`;
  document.querySelector('#task-form').addEventListener('submit', addTask);
}

function addTask(event) {
  event.preventDefault();
  const title = document.querySelector('#task-title').value.trim();
  if (!title) return;
  tasks.push({ id: Date.now(), title, due: document.querySelector('#task-due').value || 'Unscheduled', deal: document.querySelector('#task-deal').value || 'General', status: 'Open' });
  renderTasks();
}

function setView(view) {
  activeView = view;
  pageTitle.textContent = view === 'deals' ? 'Deals' : 'Tasks';
  document.querySelectorAll('.nav-pill').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  view === 'deals' ? renderDeals() : renderTasks();
}

document.querySelectorAll('.nav-pill').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
document.querySelector('#accent').addEventListener('input', (event) => document.documentElement.style.setProperty('--accent', event.target.value));
document.querySelector('#radius').addEventListener('input', (event) => document.documentElement.style.setProperty('--card-radius', `${event.target.value}px`));
document.querySelector('#compact').addEventListener('change', (event) => workspace.classList.toggle('compact', event.target.checked));

setView(activeView);
