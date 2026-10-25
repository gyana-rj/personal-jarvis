import { Panel, renderCalendar } from './panels';
import { startParticles } from './particles';
import { startRing } from './ring';
import { store, subscribe } from './state';

const STATE_LABEL = { idle: 'STANDING BY', listening: 'LISTENING', thinking: 'PROCESSING', speaking: 'RESPONDING' } as const;

const BUILTIN_TOOLS = [
  { id: 'websearch', label: 'WEB SEARCH' },
  { id: 'currenttime', label: 'CLOCK' },
  { id: 'screen', label: 'SCREEN VISION' },
];

export function mountHud(): void {
  startParticles(document.querySelector('#particles')!);
  startRing(document.querySelector('#ring')!);

  const hud = document.querySelector<HTMLElement>('#hud')!;
  hud.innerHTML = `
    <div class="brand">
      <h1>J.A.R.V.I.S.</h1>
      <p>JUST A RATHER VERY INTELLIGENT SYSTEM</p>
      <p class="link"><span class="dot"></span><span id="link">LINK OFFLINE</span></p>
    </div>
    <ul id="tools" class="tools" aria-label="Tools"></ul>
    <div id="state" class="state-label"></div>
    <div id="notice" class="notice" role="status"></div>
    <div class="qa"><p id="q"></p><p id="a"></p></div>
    <div class="keys"><b>SPACE</b> push to talk &nbsp;&middot;&nbsp; <b>HEY JARVIS</b> wake &nbsp;&middot;&nbsp; <b>V</b> voice &nbsp;&middot;&nbsp; <b>S</b> share screen</div>`;

  const calendar = new Panel('CALENDAR', hud, { right: 40, top: 90 });
  calendar.hide();

  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const render = () => {
    document.body.dataset.state = store.state;
    $('state').textContent = STATE_LABEL[store.state];
    $('link').textContent = store.online ? (store.elevenlabs ? 'LINK ONLINE // VOICE: ELEVENLABS' : 'LINK ONLINE // VOICE: BROWSER') : 'LINK OFFLINE';
    document.querySelector('.link')!.classList.toggle('on', store.online);
    $('notice').textContent = store.notice;
    $('q').textContent = store.question ? `› ${store.question}` : '';
    $('a').textContent = store.answer;

    const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '');
    const active = norm(store.activeTool);
    const items = [
      ...BUILTIN_TOOLS.map((t) => ({ label: t.label, on: active.includes(t.id) || (t.id === 'screen' && store.screenShared) })),
      ...store.tools.map((n) => ({ label: `MCP // ${n.toUpperCase()}`, on: active.includes(norm(n)) })),
    ];
    $('tools').innerHTML = items.map((i) => `<li class="${i.on ? 'on' : ''}">${i.label}</li>`).join('');

    if (store.calendar) { renderCalendar(calendar, store.calendar); calendar.show(); }
  };
  subscribe(render);
  render();
}
