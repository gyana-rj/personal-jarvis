export type JState = 'idle' | 'listening' | 'thinking' | 'speaking';

export interface CalendarEvent {
  time: string;
  title: string;
  attendees?: string;
  platform?: 'MEET' | 'TEAMS';
  conflict?: string | false;
}
export interface CalendarPanelData {
  title?: string;
  events: CalendarEvent[];
}

export interface Store {
  state: JState;
  level: number;
  question: string;
  answer: string;
  tools: string[];
  activeTool: string;
  elevenlabs: boolean;
  online: boolean;
  notice: string;
  calendar: CalendarPanelData | null;
}

export const store: Store = {
  state: 'idle',
  level: 0,
  question: '',
  answer: '',
  tools: [],
  activeTool: '',
  elevenlabs: false,
  online: false,
  notice: '',
  calendar: null,
};

type Listener = (s: Store, changed: (keyof Store)[]) => void;
const listeners = new Set<Listener>();

export function set(patch: Partial<Store>): void {
  const changed = (Object.keys(patch) as (keyof Store)[]).filter((k) => store[k] !== patch[k]);
  if (!changed.length) return;
  Object.assign(store, patch);
  listeners.forEach((fn) => fn(store, changed));
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
