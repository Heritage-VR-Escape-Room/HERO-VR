/**
 * New Game opening: three title cards on black, then a flight down through
 * the fog onto the plaza (the caller moves the camera from `progress`), then
 * black again before Julian wakes. Space, Escape or a click skips it.
 */
import type { I18n } from '../logic/i18n';

const CARD_SEC = 3.8;
const FLY_SEC = 9;

export interface Intro {
  /** Flight progress 0..1 while the camera flies; null otherwise. */
  progress(): number | null;
  /** Resolves when the intro is over (played or skipped), with the screen black. */
  done: Promise<void>;
}

export const INTRO_KEYS = ['ui.intro.1', 'ui.intro.2', 'ui.intro.3'] as const;

export function playIntro(i18n: I18n): Intro {
  const black = document.createElement('div');
  black.id = 'intro';
  black.dir = i18n.dir();
  black.lang = i18n.locale();
  const card = document.createElement('p');
  card.className = 'intro-card';
  const skip = document.createElement('p');
  skip.className = 'intro-skip';
  skip.textContent = i18n.t('ui.intro.skip');
  black.append(card, skip);
  document.body.append(black);

  let fly: number | null = null;
  let finished = false;
  let resolveDone!: () => void;
  const done = new Promise<void>((r) => (resolveDone = r));
  const wait = (ms: number): Promise<void> => new Promise((r) => window.setTimeout(r, ms));

  const finish = (): void => {
    if (finished) return;
    finished = true;
    fly = null;
    window.removeEventListener('keydown', onKey, true);
    black.removeEventListener('click', onSkip);
    black.style.transition = 'opacity 0.6s';
    black.style.opacity = '1';
    card.textContent = '';
    window.setTimeout(() => {
      black.remove();
      resolveDone();
    }, 650);
  };
  const onSkip = (): void => finish();
  const onKey = (e: KeyboardEvent): void => {
    if (e.code === 'Space' || e.code === 'Escape' || e.code === 'Enter') {
      e.stopPropagation();
      finish();
    }
  };
  window.addEventListener('keydown', onKey, true);
  black.addEventListener('click', onSkip);

  void (async () => {
    for (const key of INTRO_KEYS) {
      if (finished) return;
      card.textContent = i18n.t(key);
      card.classList.add('show');
      await wait((CARD_SEC - 0.7) * 1000);
      card.classList.remove('show');
      await wait(700);
    }
    if (finished) return;
    // Fade up on the flight.
    black.classList.add('flying');
    const t0 = performance.now();
    fly = 0;
    while (!finished && fly < 1) {
      await new Promise((r) => requestAnimationFrame(r));
      fly = Math.min(1, (performance.now() - t0) / (FLY_SEC * 1000));
    }
    finish();
  })();

  return { progress: () => fly, done };
}
