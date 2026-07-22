function createProgressController({ panel, progress } = {}) {
  function update() {
    if (!progress) return;
    const maximumScroll = panel.scrollHeight - panel.clientHeight;
    const ratio = maximumScroll > 0 ? panel.scrollTop / maximumScroll : 0;
    progress.style.width = `${Math.max(0, Math.min(100, ratio * 100)).toFixed(2)}%`;
  }

  return { update };
}

export { createProgressController };
