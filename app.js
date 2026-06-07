(function(){
  'use strict';

  const state = {
    screen: 'start',
    diceCount: 5,
    diceValues: [],
    diceState: 'hidden',
    settings: { shakeEnabled: true, alwaysSort: false },
    sensorsActive: false,
    motionPermissionGranted: false
  };

  const $ = id => document.getElementById(id);
  const startScreen   = $('start-screen');
  const gameScreen    = $('game-screen');
  const diceContainer = $('dice-container');
  const rollBtn       = $('roll-btn');
  const enterBtn      = $('enter-btn');
  const removeDieBtn  = $('remove-die-btn');
  const resetBtn      = $('reset-btn');
  const settingsBtn   = $('settings-btn');
  const instructionsBtn = $('instructions-btn');
  const closeSettingsBtn  = $('close-settings-btn');
  const closeInstructionsBtn = $('close-instructions-btn');
  const settingsModal = $('settings-modal');
  const instructionsModal = $('instructions-modal');
  const shakeToggle   = $('shake-toggle');
  const alwaysSortToggle = $('always-sort-toggle');
  const diceCountDisplay = $('dice-count-display');
  const diceCountGame = $('dice-count-game');
  const decrementBtn  = $('decrement-btn');
  const incrementBtn  = $('increment-btn');
  const motionPermissionBtn = $('motion-permission-btn');
  const gameoverMessage = $('gameover-message');
  const gameoverResetBtn = $('gameover-reset-btn');
  const sortBtn = $('sort-btn');

  function loadSettings(){
    try {
      const saved = localStorage.getItem('dadoMentirosoSettings');
      if(saved){
        const p = JSON.parse(saved);
        state.settings.shakeEnabled = p.shakeEnabled !== undefined ? p.shakeEnabled : true;
      state.settings.alwaysSort = p.alwaysSort !== undefined ? p.alwaysSort : false;
      }
    } catch(e){}
    shakeToggle.checked = state.settings.shakeEnabled;
    alwaysSortToggle.checked = state.settings.alwaysSort;
    sortBtn.style.display = state.settings.alwaysSort ? 'none' : '';
  }

  function saveSettings(){
    try { localStorage.setItem('dadoMentirosoSettings', JSON.stringify(state.settings)); } catch(e){}
  }

  function createDiceElement(value, isHidden, isRolling){
    const el = document.createElement('div');
    el.className = 'dice';
    if(isHidden) el.classList.add('hidden');
    if(isRolling) el.classList.add('rolling');
    if(value > 0 && !isHidden) el.classList.add('face-' + value);
    for(let i=1; i<=9; i++){
      const pip = document.createElement('div');
      pip.className = 'pip';
      el.appendChild(pip);
    }
    return el;
  }

  function renderDice(){
    diceContainer.innerHTML = '';
    const hidden  = state.diceState === 'hidden';
    const rolling = state.diceState === 'rolling';
    for(let i=0; i<state.diceCount; i++){
      const val = state.diceValues[i] || 0;
      const el  = createDiceElement(val, hidden, rolling);
      if(rolling) el.style.animationDelay = (i * 0.06) + 's';
      diceContainer.appendChild(el);
    }
    diceCountGame.textContent = state.diceCount;
  }

  function switchScreen(screen){
    state.screen = screen;
    startScreen.classList.toggle('active', screen === 'start');
    gameScreen.classList.toggle('active', screen === 'game');
  }

  function startGame(){
    if(state.diceCount < 1 || state.diceCount > 10) return;
    state.diceValues = new Array(state.diceCount).fill(0);
    state.diceState  = 'hidden';
    sortBtn.style.display = state.settings.alwaysSort ? 'none' : '';
    switchScreen('game');
    renderDice();
    enableSensors();
  }

  function rollDice(){
    if(state.diceState === 'rolling' || state.diceCount === 0) return;
    state.diceState = 'rolling';
    renderDice();
    rollBtn.disabled = true;
    setTimeout(() => {
      state.diceValues = Array.from({length: state.diceCount}, () => Math.floor(Math.random()*6)+1);
      state.diceState  = 'revealed';
      renderDice();
      rollBtn.disabled = false;
      if(state.settings.alwaysSort) sortDice();
    }, 650);
  }

  function removeDie(){
    if(state.diceCount <= 0) return;
    state.diceCount--;
    state.diceValues.pop();
    if(state.diceCount === 0){
      showGameOver();
      return;
    }
    if(state.diceState === 'rolling') return;
    renderDice();
  }

  function showGameOver(){
    diceContainer.innerHTML = '';
    diceCountGame.textContent = '0';
    gameoverMessage.style.display = 'flex';
    rollBtn.style.display = 'none';
    gameoverResetBtn.style.display = 'block';
    removeDieBtn.disabled = true;
    sortBtn.style.display = 'none';
  }

  function sortDice(){
    if(state.diceCount === 0 || state.diceState !== 'revealed') return;
    state.diceValues.sort((a,b) => a - b);
    renderDice();
  }

  function hideGameOver(){
    gameoverMessage.style.display = 'none';
    gameoverResetBtn.style.display = 'none';
    rollBtn.style.display = 'block';
    removeDieBtn.disabled = false;
  }

  function resetGame(){
    disableSensors();
    hideGameOver();
    state.diceCount = 5;
    state.diceValues = [];
    state.diceState = 'hidden';
    diceCountDisplay.textContent = '5';
    switchScreen('start');
  }

  /* Sensors */
  let lastAccel = null;

  function handleMotion(e){
    if(!state.settings.shakeEnabled || state.diceState === 'rolling' || state.screen !== 'game') return;

    let acc = e.acceleration;
    if(!acc || (acc.x === null && acc.y === null && acc.z === null)){
      acc = e.accelerationIncludingGravity;
    }
    if(!acc) return;

    const ax = acc.x || 0;
    const ay = acc.y || 0;
    const az = acc.z || 0;

    if(!lastAccel){ lastAccel = { x:ax, y:ay, z:az }; return; }

    const delta = Math.abs(ax - lastAccel.x) + Math.abs(ay - lastAccel.y) + Math.abs(az - lastAccel.z);
    lastAccel = { x:ax, y:ay, z:az };

    const threshold = e.acceleration && e.acceleration.x !== null ? 10 : 16;
    if(delta > threshold) rollDice();
  }

  function enableSensors(){
    if(state.sensorsActive) return;
    if(typeof window.DeviceMotionEvent === 'undefined') return;
    const needsPermission = typeof DeviceMotionEvent !== 'undefined' &&
      typeof DeviceMotionEvent.requestPermission === 'function';
    if(needsPermission){
      if(state.motionPermissionGranted){ addSensorListeners(); }
      else { motionPermissionBtn.style.display = 'block'; }
      return;
    }
    addSensorListeners();
  }

  function addSensorListeners(){
    window.addEventListener('devicemotion', handleMotion);
    state.sensorsActive = true;
  }

  function disableSensors(){
    window.removeEventListener('devicemotion', handleMotion);
    state.sensorsActive = false;
    motionPermissionBtn.style.display = 'none';
  }

  async function requestMotionPermission(){
    if(typeof DeviceMotionEvent !== 'undefined' &&
       typeof DeviceMotionEvent.requestPermission === 'function'){
      try {
        if(await DeviceMotionEvent.requestPermission() === 'granted'){
          state.motionPermissionGranted = true;
          addSensorListeners();
          motionPermissionBtn.style.display = 'none';
        }
      } catch(e){
        motionPermissionBtn.textContent = 'Permiso denegado';
      }
    }
  }

  function openModal(m){ m.classList.add('open'); }
  function closeModal(m){ m.classList.remove('open'); }

  function init(){
    loadSettings();
    diceCountDisplay.textContent = state.diceCount;

    enterBtn.addEventListener('click', startGame);
    decrementBtn.addEventListener('click', () => {
      if(state.diceCount > 1){ state.diceCount--; diceCountDisplay.textContent = state.diceCount; }
    });
    incrementBtn.addEventListener('click', () => {
      if(state.diceCount < 10){ state.diceCount++; diceCountDisplay.textContent = state.diceCount; }
    });

    rollBtn.addEventListener('click', rollDice);
    removeDieBtn.addEventListener('click', removeDie);
    resetBtn.addEventListener('click', resetGame);
    gameoverResetBtn.addEventListener('click', resetGame);
    motionPermissionBtn.addEventListener('click', requestMotionPermission);
    sortBtn.addEventListener('click', sortDice);

    settingsBtn.addEventListener('click', () => openModal(settingsModal));
    instructionsBtn.addEventListener('click', () => openModal(instructionsModal));
    closeSettingsBtn.addEventListener('click', () => closeModal(settingsModal));
    closeInstructionsBtn.addEventListener('click', () => closeModal(instructionsModal));
    settingsModal.addEventListener('click', e => { if(e.target === settingsModal) closeModal(settingsModal); });
    instructionsModal.addEventListener('click', e => { if(e.target === instructionsModal) closeModal(instructionsModal); });

    shakeToggle.addEventListener('change', () => { state.settings.shakeEnabled = shakeToggle.checked; saveSettings(); });
    alwaysSortToggle.addEventListener('change', () => { state.settings.alwaysSort = alwaysSortToggle.checked; saveSettings(); sortBtn.style.display = state.settings.alwaysSort ? 'none' : ''; });

    document.addEventListener('dblclick', e => e.preventDefault());
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
