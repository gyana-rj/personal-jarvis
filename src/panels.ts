import type { CalendarPanelData } from './state';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Glass panel with corner brackets, a tracked-caps header, drag-to-move and a close button. */
export class Panel {
  readonly el: HTMLElement;
  readonly body: HTMLElement;
  private title: HTMLElement;

  constructor(title: string, parent: HTMLElement, pos: { right?: number; top?: number; left?: number }, onClose?: () => void) {
    this.el = document.createElement('section');
    this.el.className = 'panel';
    this.el.innerHTML = `
      <i class="br tl"></i><i class="br tr"></i><i class="br bl"></i><i class="br brr"></i>
      <header><span class="ptitle"></span><button class="close" aria-label="Close panel">&times;</button></header>
      <div class="pbody"></div>`;
    this.title = this.el.querySelector('.ptitle')!;
    this.body = this.el.querySelector('.pbody')!;
    this.setTitle(title);
    if (pos.left !== undefined) this.el.style.left = `${pos.left}px`;
    if (pos.right !== undefined) this.el.style.right = `${pos.right}px`;
    this.el.style.top = `${pos.top ?? 90}px`;
    parent.append(this.el);

    this.el.querySelector('.close')!.addEventListener('click', () => { this.hide(); onClose?.(); });
    this.makeDraggable(this.el.querySelector('header')!);
  }

  setTitle(t: string): void { this.title.textContent = t; }
  show(): void { this.el.hidden = false; }
  hide(): void { this.el.hidden = true; }

  private makeDraggable(handle: HTMLElement): void {
    handle.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('.close')) return;
      const r = this.el.getBoundingClientRect();
      const dx = e.clientX - r.left, dy = e.clientY - r.top;
      handle.setPointerCapture(e.pointerId);
      this.el.classList.add('dragging');
      const move = (ev: PointerEvent) => {
        const x = Math.min(Math.max(0, ev.clientX - dx), innerWidth - r.width);
        const y = Math.min(Math.max(0, ev.clientY - dy), innerHeight - 40);
        this.el.style.left = `${x}px`;
        this.el.style.top = `${y}px`;
        this.el.style.right = 'auto';
      };
      const up = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        this.el.classList.remove('dragging');
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
    });
  }
}

export function renderCalendar(panel: Panel, data: CalendarPanelData): void {
  panel.setTitle(data.title ? `CALENDAR // ${data.title}` : 'CALENDAR');
  if (!data.events.length) {
    panel.body.innerHTML = '<p class="empty">Nothing scheduled, sir.</p>';
    return;
  }
  panel.body.innerHTML = data.events
    .map((e) => `
      <div class="row">
        <span class="time">${esc(e.time)}</span>
        <div class="main">
          <div class="etitle">${esc(e.title)}</div>
          ${e.attendees ? `<div class="sub">${esc(e.attendees)}</div>` : ''}
          ${e.conflict ? `<div class="conflict">&#9650; CONFLICT${typeof e.conflict === 'string' ? ` &mdash; ${esc(e.conflict)}` : ''}</div>` : ''}
        </div>
        ${e.platform ? `<span class="tag ${e.platform.toLowerCase()}">${esc(e.platform)}</span>` : ''}
      </div>`)
    .join('');
}
