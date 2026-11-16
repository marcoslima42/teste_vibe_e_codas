(function () {
  function initArena() {
    const canvas = document.getElementById('arena-bg');
    if (!canvas || !window.SimuMaratona || !window.SimuMaratona.ContestArenaBackground) return;

    const { ContestArenaBackground } = window.SimuMaratona;
    const arena = new ContestArenaBackground(canvas, {
      theme: 'cyber',
      cameraMode: 'cinematic',
    });
    arena.start();
    window.arenaBg = arena;

    const btnCelebrate = document.getElementById('btn-trigger-ac');
    if (btnCelebrate) {
      btnCelebrate.addEventListener('click', () => {
        arena.triggerCelebrationWave();
      });
    }

    canvas.addEventListener('click', () => {
      arena.triggerCelebrationWave();
    });

    const moodButtons = document.querySelectorAll('[data-mood]');
    moodButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        moodButtons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        arena.setCompetitorMood(btn.dataset.mood);
      });
    });

    const camButtons = document.querySelectorAll('[data-camera]');
    camButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        camButtons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        arena.setCameraMode(btn.dataset.camera);
      });
    });

    const themeButtons = document.querySelectorAll('[data-theme]');
    themeButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        themeButtons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        arena.setTheme(btn.dataset.theme);
      });
    });

    const btnToggleUi = document.getElementById('btn-toggle-ui');
    if (btnToggleUi) {
      btnToggleUi.addEventListener('click', () => {
        const isPure = document.body.classList.toggle('pure-background');
        btnToggleUi.textContent = isPure ? 'Show Website Overlay (H)' : 'Pure Background Mode (H)';
      });
    }

    window.addEventListener('keydown', (e) => {
      if (e.key === 'h' || e.key === 'H') {
        const isPure = document.body.classList.toggle('pure-background');
        if (btnToggleUi) {
          btnToggleUi.textContent = isPure ? 'Show Website Overlay (H)' : 'Pure Background Mode (H)';
        }
      } else if (e.key === ' ') {
        arena.triggerCelebrationWave();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initArena);
  } else {
    initArena();
  }
})();
