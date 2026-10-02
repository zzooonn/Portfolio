/* Pack variable-height cards without changing their DOM or keyboard order. */
(() => {
  const board = document.querySelector('.project-board');
  if (!board) return;
  const cards = Array.from(board.querySelectorAll('.project-card'));
  const wide = window.matchMedia('(min-width: 741px)');
  let frame = 0;
  function layout() {
    frame = 0;
    if (!wide.matches) {
      board.classList.remove('has-masonry');
      cards.forEach(card => card.style.removeProperty('grid-row-end'));
      return;
    }
    board.classList.add('has-masonry');
    const style = getComputedStyle(board);
    const row = parseFloat(style.gridAutoRows) || 8;
    const gap = parseFloat(style.rowGap) || 24;
    const sizes = cards.map(card => {
      const content = card.querySelector('.pin-content');
      return Math.max(1, Math.ceil((content.getBoundingClientRect().height + 2 + gap) / (row + gap)));
    });
    cards.forEach((card, i) => {
      const value = `span ${sizes[i]}`;
      if (card.style.gridRowEnd !== value) card.style.gridRowEnd = value;
    });
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(layout);
  }
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(schedule);
    cards.forEach(card => observer.observe(card.querySelector('.pin-content')));
  }
  wide.addEventListener('change', schedule);
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('load', schedule);
  window.addEventListener('afterprint', schedule);
  document.fonts?.ready.then(schedule);
  schedule();
})();
