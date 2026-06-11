(function () {
  'use strict';

  const state = {
    screen: 'start',
    diceCount: 5,
    diceValues: [],
    diceState: 'hidden',
    settings: { alwaysSort: false, tapToRoll: false },
    history: []
  };

  const $ = id => document.getElementById(id);
  const startScreen = $('start-screen');
  const gameScreen = $('game-screen');
  const diceContainer = $('dice-container');
  const rollBtn = $('roll-btn');
  const enterBtn = $('enter-btn');
  const removeDieBtn = $('remove-die-btn');
  const resetBtn = $('reset-btn');
  const settingsBtn = $('settings-btn');
  const instructionsBtn = $('instructions-btn');
  const closeSettingsBtn = $('close-settings-btn');
  const closeInstructionsBtn = $('close-instructions-btn');
  const settingsModal = $('settings-modal');
  const instructionsModal = $('instructions-modal');
  const alwaysSortToggle = $('always-sort-toggle');
  const tapToRollToggle = $('tap-to-roll-toggle');
  const holdHint = $('hold-hint');
  const diceCountDisplay = $('dice-count-display');
  const diceCountGame = $('dice-count-game');
  const decrementBtn = $('decrement-btn');
  const incrementBtn = $('increment-btn');
  const gameoverMessage = $('gameover-message');
  const gameoverResetBtn = $('gameover-reset-btn');
  const sortBtn = $('sort-btn');
  const coverBtn = $('cover-btn');
  const historyBtn = $('history-btn');
  const historySidebar = $('history-sidebar');
  const historyOverlay = $('history-overlay');
  const historyList = $('history-list');
  const closeHistoryBtn = $('close-history-btn');
  const historyConfirm = $('history-confirm');
  const confirmYes = $('confirm-yes');
  const confirmNo = $('confirm-no');

  function loadSettings() {
    try {
      const saved = localStorage.getItem('dadoMentirosoSettings');
      if (saved) {
        const p = JSON.parse(saved);
        state.settings.alwaysSort = p.alwaysSort !== undefined ? p.alwaysSort : false;
        state.settings.tapToRoll = p.tapToRoll !== undefined ? p.tapToRoll : false;
      }
    } catch (e) { }
    alwaysSortToggle.checked = state.settings.alwaysSort;
    tapToRollToggle.checked = state.settings.tapToRoll;
    sortBtn.style.display = state.settings.alwaysSort ? 'none' : '';
    holdHint.style.display = state.settings.tapToRoll ? 'none' : '';
  }

  function saveSettings() {
    try { localStorage.setItem('dadoMentirosoSettings', JSON.stringify(state.settings)); } catch (e) { }
  }

  function createDiceElement(value, isHidden, isRolling) {
    const el = document.createElement('div');
    el.className = 'dice';
    if (isHidden) el.classList.add('hidden');
    if (isRolling) el.classList.add('rolling');
    if (value > 0 && !isHidden) el.classList.add('face-' + value);
    for (let i = 1; i <= 9; i++) {
      const pip = document.createElement('div');
      pip.className = 'pip';
      el.appendChild(pip);
    }
    return el;
  }

  function renderDice() {
    diceContainer.innerHTML = '';
    const hidden = state.diceState === 'hidden';
    const rolling = state.diceState === 'rolling';
    for (let i = 0; i < state.diceCount; i++) {
      const val = state.diceValues[i] || 0;
      const el = createDiceElement(val, hidden, rolling);
      if (rolling) el.style.animationDelay = (i * 0.06) + 's';
      diceContainer.appendChild(el);
    }
    diceCountGame.textContent = state.diceCount;
  }

  function startDiceRoll() {
    state.diceState = 'rolling';
    const dice = diceContainer.querySelectorAll('.dice');
    dice.forEach((el, i) => {
      el.classList.remove('hidden');
      el.classList.add('rolling');
      el.style.animationDelay = (i * 0.06) + 's';
    });
  }

  function switchScreen(screen) {
    state.screen = screen;
    startScreen.classList.toggle('active', screen === 'start');
    gameScreen.classList.toggle('active', screen === 'game');
  }

  function startGame() {
    if (state.diceCount < 1 || state.diceCount > 10) return;
    state.diceValues = new Array(state.diceCount).fill(0);
    state.diceState = 'hidden';
    sortBtn.style.display = state.settings.alwaysSort ? 'none' : '';
    coverBtn.style.display = '';
    coverBtn.textContent = 'Tapar';
    switchScreen('game');
    renderDice();
  }

  function rollDice() {
    if (state.diceState === 'rolling' || state.diceCount === 0) return;
    startDiceRoll();
    setTimeout(() => {
      state.diceValues = Array.from({ length: state.diceCount }, () => Math.floor(Math.random() * 6) + 1);
      state.diceState = 'revealed';
      renderDice();
      if (state.settings.alwaysSort) sortDice();
      addRollToHistory(state.diceCount, state.diceValues);
    }, 650);
  }

  function removeDie() {
    if (state.diceCount <= 0) return;
    state.diceCount--;
    state.diceValues.pop();
    if (state.diceCount === 0) {
      showGameOver();
      return;
    }
    if (state.diceState === 'rolling') return;
    renderDice();
  }

  function showGameOver() {
    diceContainer.innerHTML = '';
    diceCountGame.textContent = '0';
    gameoverMessage.style.display = 'flex';
    rollBtn.style.display = 'none';
    gameoverResetBtn.style.display = 'block';
    removeDieBtn.disabled = true;
    sortBtn.style.display = 'none';
    coverBtn.style.display = 'none';
  }

  function sortDice() {
    if (state.diceCount === 0 || state.diceState !== 'revealed') return;
    state.diceValues.sort((a, b) => a - b);
    renderDice();
  }

  function coverDice() {
    if (state.diceCount === 0 || (state.diceState !== 'revealed' && state.diceState !== 'hidden')) return;
    state.diceState = state.diceState === 'revealed' ? 'hidden' : 'revealed';
    coverBtn.textContent = state.diceState === 'hidden' ? 'Destapar' : 'Tapar';
    renderDice();
  }

  function hideGameOver() {
    gameoverMessage.style.display = 'none';
    gameoverResetBtn.style.display = 'none';
    rollBtn.style.display = 'block';
    removeDieBtn.disabled = false;
  }

  function resetGame() {
    hideGameOver();
    state.diceCount = 5;
    state.diceValues = [];
    state.diceState = 'hidden';
    diceCountDisplay.textContent = '5';
    switchScreen('start');
  }

  const HOLD_MS = 500;
  const HISTORY_KEY = 'dadoMentirosoHistory';
  const MAX_HISTORY = 5;
  let pressTimer = null;
  let pendingRestore = -1;

  function startPress(e) {
    if (state.diceState === 'rolling' || state.diceCount === 0) return;
    if (state.settings.tapToRoll) {
      e.preventDefault();
      rollDice();
      return;
    }
    e.preventDefault();
    rollBtn.style.setProperty('--hold-ms', HOLD_MS + 'ms');
    pressTimer = setTimeout(rollDice, HOLD_MS);
    rollBtn.classList.add('pressing');
  }

  function endPress() {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    rollBtn.classList.remove('pressing');
  }

  function loadHistory() {
    try {
      const saved = localStorage.getItem(HISTORY_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch (e) { return []; }
  }

  function saveHistory() {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history)); } catch (e) { }
  }

  function addRollToHistory(count, values) {
    state.history.unshift({ diceCount: count, values: [...values] });
    if (state.history.length > MAX_HISTORY) state.history.length = MAX_HISTORY;
    saveHistory();
  }

  function createMiniDice(value) {
    const el = document.createElement('div');
    el.className = 'dice mini';
    if (value > 0) el.classList.add('face-' + value);
    for (let i = 1; i <= 9; i++) {
      const pip = document.createElement('div');
      pip.className = 'pip';
      el.appendChild(pip);
    }
    return el;
  }

  function renderHistorySidebar() {
    historyList.innerHTML = '';
    if (state.history.length === 0) {
      historyList.innerHTML = '<p class="text-slate-500 text-sm text-center mt-8">Sin tiradas aún</p>';
      return;
    }
    state.history.forEach((entry, index) => {
      const entryEl = document.createElement('div');
      entryEl.className = 'history-entry';
      const title = document.createElement('div');
      title.className = 'entry-title';
      if(index === 0){
        title.textContent = 'Última';
      } else {
        title.textContent = 'Hace ' + (index + 1) + ' tiradas';
      }
      const row = document.createElement('div');
      row.className = 'dice-row';
      entry.values.forEach(v => row.appendChild(createMiniDice(v)));
      entryEl.appendChild(title);
      entryEl.appendChild(row);
      entryEl.addEventListener('click', () => { pendingRestore = index; historyConfirm.style.display = 'flex'; });
      historyList.appendChild(entryEl);
    });
  }

  function openHistorySidebar() {
    renderHistorySidebar();
    historySidebar.classList.add('open');
    historyOverlay.classList.add('open');
  }

  function closeHistorySidebar() {
    historySidebar.classList.remove('open');
    historyOverlay.classList.remove('open');
  }

  function doRestoreRoll(index) {
    const entry = state.history[index];
    if (!entry) return;
    hideGameOver();
    if (state.screen === 'start') switchScreen('game');
    state.diceCount = entry.diceCount;
    state.diceValues = [];
    state.diceState = 'rolling';
    coverBtn.textContent = 'Tapar';
    coverBtn.style.display = '';
    rollBtn.style.display = 'block';
    gameoverResetBtn.style.display = 'none';
    removeDieBtn.disabled = false;
    sortBtn.style.display = state.settings.alwaysSort ? 'none' : '';
    renderDice();
    setTimeout(() => {
      state.diceValues = [...entry.values];
      state.diceState = 'revealed';
      renderDice();
    }, 600);
  }

  function confirmRestore() {
    if (pendingRestore >= 0) doRestoreRoll(pendingRestore);
    pendingRestore = -1;
    historyConfirm.style.display = 'none';
    closeHistorySidebar();
  }

  function cancelRestore() {
    pendingRestore = -1;
    historyConfirm.style.display = 'none';
  }

  function openModal(m) { m.classList.add('open'); }
  function closeModal(m) { m.classList.remove('open'); }

  function init() {
    loadSettings();
    state.history = loadHistory();
    diceCountDisplay.textContent = state.diceCount;

    enterBtn.addEventListener('click', startGame);
    decrementBtn.addEventListener('click', () => {
      if (state.diceCount > 1) { state.diceCount--; diceCountDisplay.textContent = state.diceCount; }
    });
    incrementBtn.addEventListener('click', () => {
      if (state.diceCount < 10) { state.diceCount++; diceCountDisplay.textContent = state.diceCount; }
    });

    rollBtn.addEventListener('mousedown', startPress);
    rollBtn.addEventListener('touchstart', startPress, { passive: false });
    rollBtn.addEventListener('touchmove', endPress, { passive: true });
    rollBtn.addEventListener('mouseup', endPress);
    rollBtn.addEventListener('touchend', endPress);
    rollBtn.addEventListener('mouseleave', endPress);
    removeDieBtn.addEventListener('click', removeDie);
    resetBtn.addEventListener('click', resetGame);
    gameoverResetBtn.addEventListener('click', resetGame);
    sortBtn.addEventListener('click', sortDice);
    coverBtn.addEventListener('click', coverDice);
    coverBtn.addEventListener('touchend', e => { e.preventDefault(); coverDice(); });

    settingsBtn.addEventListener('click', () => openModal(settingsModal));
    instructionsBtn.addEventListener('click', () => openModal(instructionsModal));
    closeSettingsBtn.addEventListener('click', () => closeModal(settingsModal));
    closeInstructionsBtn.addEventListener('click', () => closeModal(instructionsModal));
    settingsModal.addEventListener('click', e => { if (e.target === settingsModal) closeModal(settingsModal); });
    instructionsModal.addEventListener('click', e => { if (e.target === instructionsModal) closeModal(instructionsModal); });

    historyBtn.addEventListener('click', openHistorySidebar);
    closeHistoryBtn.addEventListener('click', closeHistorySidebar);
    historyOverlay.addEventListener('click', closeHistorySidebar);
    confirmYes.addEventListener('click', confirmRestore);
    confirmNo.addEventListener('click', cancelRestore);

    alwaysSortToggle.addEventListener('change', () => { state.settings.alwaysSort = alwaysSortToggle.checked; saveSettings(); sortBtn.style.display = state.settings.alwaysSort ? 'none' : ''; if (state.settings.alwaysSort && state.diceState === 'revealed') sortDice(); });
    tapToRollToggle.addEventListener('change', () => { state.settings.tapToRoll = tapToRollToggle.checked; saveSettings(); holdHint.style.display = state.settings.tapToRoll ? 'none' : ''; });

    document.addEventListener('dblclick', e => e.preventDefault());
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
