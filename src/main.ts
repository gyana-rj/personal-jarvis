import { Controller } from './controller';
import { subscribe, store } from './state';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.style.cssText = 'font:14px monospace;color:#2cff9a;padding:16px';
subscribe(() => {
  app.textContent = `${store.state} | ${store.question} -> ${store.answer} ${store.notice}`;
});

void new Controller().start();
