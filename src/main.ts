import './styles.css';
import { Controller } from './controller';
import { mountHud } from './hud';
import { set, type JState, type CalendarPanelData } from './state';

mountHud();

// `?demo=<state>[&panel=calendar]` renders the HUD without mic or bridge (used for screenshots).
const params = new URLSearchParams(location.search);
const demo = params.get('demo');

if (demo) {
  const state = (['idle', 'listening', 'thinking', 'speaking'].includes(demo) ? demo : 'idle') as JState;
  set({ state, online: true, provider: 'gemini', tools: ['calendar', 'gmail'], elevenlabs: false });
  if (state === 'speaking') {
    // Fake an audio envelope so the ring pulses.
    setInterval(() => { (window as any).__level = 0.35 + 0.35 * Math.abs(Math.sin(Date.now() / 140)); }, 30);
  }
  set({
    question: 'Good morning, Jarvis',
    answer: state === 'idle' ? '' : 'Good morning, sir. Fourteen degrees and overcast, with two meetings today, one of which conflicts with the other.',
  });
  if (params.get('panel') === 'calendar') {
    const data: CalendarPanelData = {
      title: 'TODAY',
      events: [
        { time: '09:30', title: 'Design review', attendees: 'Ana Ruiz, Raj Patel, Mei Chen', platform: 'MEET', conflict: false },
        { time: '10:00', title: 'Quarterly planning', attendees: 'Leadership team', platform: 'TEAMS', conflict: 'Overlaps with Design review' },
        { time: '13:15', title: 'Lunch with Priya', attendees: 'Priya N.', conflict: false },
        { time: '16:00', title: 'Investor update call', attendees: 'Sam Ortiz, 4 others', platform: 'MEET', conflict: false },
      ],
    };
    set({ calendar: data });
  }
} else {
  void new Controller().start();
}
