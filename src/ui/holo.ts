/**
 * Fritz's hologram communicator (new script §4): a small glowing panel that
 * pops up with the raven while he gives a hint; the words are the subtitle.
 */
export function createHolo() {
  const root = document.createElement('div');
  root.id = 'holo';
  root.hidden = true;
  root.innerHTML = `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
    <path d="M10 40 C18 26 30 20 42 22 L54 16 L50 26 C54 30 54 38 48 42 L36 46 L28 54 L26 46 C18 46 13 44 10 40 Z"/>
    <circle cx="44" cy="26" r="1.8" fill="currentColor"/><path d="M22 36 C28 34 34 34 40 36"/></g></svg>
    <div class="holo-text"><b>FRITZ</b><span></span></div>`;
  document.body.append(root);
  const label = root.querySelector('span')!;
  let timer = 0;
  return {
    show(text: string, sec = 6) {
      label.textContent = text;
      root.hidden = false;
      root.classList.remove('on');
      void root.offsetWidth;
      root.classList.add('on');
      window.clearTimeout(timer);
      timer = window.setTimeout(() => (root.hidden = true), sec * 1000);
    },
    isShown: () => !root.hidden,
  };
}
