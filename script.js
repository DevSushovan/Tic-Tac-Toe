/* Tic Tac Toe — With Sound, Timer, Best-of-N
   Replaces and extends prior script.
   - WebAudio generated sounds (click, win, lose, draw)
   - Per-move timer with auto-forfeit
   - Best-of-N series tracking and auto-reset on series win
*/

const boardEl = document.getElementById("board");
const cells = [...document.querySelectorAll(".cell")];
const statusEl = document.getElementById("status");
const timerDisplay = document.getElementById("timer-display");
const scoreXEl = document.getElementById("score-x");
const scoreOEl = document.getElementById("score-o");
const scoreDEl = document.getElementById("score-d");

const btnNew = document.getElementById("new-game");
const btnResetScore = document.getElementById("reset-score");
const btnUndo = document.getElementById("undo-move");
const themeToggle = document.getElementById("theme-toggle");

const modePvP = document.getElementById("mode-pvp");
const modePvC = document.getElementById("mode-pvc");
const difficultyGroup = document.getElementById("difficulty-group");
const diffEasy = document.getElementById("diff-easy");
const diffNormal = document.getElementById("diff-normal");
const diffHard = document.getElementById("diff-hard");

const playX = document.getElementById("play-x");
const playO = document.getElementById("play-o");

const historyList = document.getElementById("history-list");
const winLine = document.getElementById("win-line");

const celebration = document.getElementById("celebration");
const celebTitle = document.getElementById("celebration-title");
const celebSub = document.getElementById("celebration-sub");
const celebClose = document.getElementById("celebration-close");

const confettiCanvas = document.getElementById("confetti-canvas");
const ctxConfetti = confettiCanvas.getContext("2d");

const timerEnable = document.getElementById("timer-enable");
const timerLengthInput = document.getElementById("timer-length");

const bestOfSelect = document.getElementById("best-of");
const resetSeriesBtn = document.getElementById("reset-series");
const seriesBestEl = document.getElementById("series-best");
const seriesTargetEl = document.getElementById("series-target");
const seriesXEl = document.getElementById("series-x");
const seriesOEl = document.getElementById("series-o");

const soundToggle = document.getElementById("sound-toggle");

// Game constants
const WIN_PATTERNS = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6]
];

// Game state
let board = Array(9).fill(null);
let current = "X";
let humanSymbol = "X";
let mode = "pvc";
let difficulty = "normal";
let gameOver = false;
let moveHistory = [];
let scores = { X:0, O:0, D:0 };

// Series state (best-of)
let series = { bestOf: 3, target: 2, wins: { X:0, O:0 } };

// Timer state
let timerEnabled = false;
let timePerMove = 15;
let timeLeft = 0;
let timerInterval = null;
let timerOwner = null; // which player the timer is for ('X'/'O')

// Sound state + WebAudio
let audioCtx = null;
let soundOn = true;

// Confetti
let confettiParticles = [];
let confettiAnimId = null;

// Canvas resize
function resizeConfetti(){ confettiCanvas.width = window.innerWidth; confettiCanvas.height = window.innerHeight; }
resizeConfetti(); window.addEventListener("resize", resizeConfetti);

// Restore settings, attach events, start
restoreSettings();
attachEvents();
startNewGame(true);

// ---------- UI & Events ----------
function attachEvents(){
  cells.forEach(cell => cell.addEventListener("click", onCellClick));
  btnNew.addEventListener("click", ()=> startNewGame(false));
  btnResetScore.addEventListener("click", resetScore);
  btnUndo.addEventListener("click", undoMove);
  themeToggle.addEventListener("click", toggleTheme);
  celebClose.addEventListener("click", ()=> { celebration.classList.add("hidden"); startNewGame(false); });

  modePvP.addEventListener("change", ()=> {
    if (modePvP.checked){ mode = "pvp"; difficultyGroup.style.display = "none"; persistSettings(); startNewGame(false); }
  });
  modePvC.addEventListener("change", ()=> {
    if (modePvC.checked){ mode = "pvc"; difficultyGroup.style.display = ""; persistSettings(); startNewGame(false); }
  });

  [diffEasy,diffNormal,diffHard].forEach(r=> r.addEventListener("change", ()=>{
    difficulty = getSelectedDifficulty(); persistSettings(); startNewGame(false);
  }));

  [playX, playO].forEach(r=> r.addEventListener("change", ()=>{
    humanSymbol = playX.checked ? "X" : "O';" /* fallback shouldn't happen */; 
    humanSymbol = playX.checked ? "X" : "O";
    persistSettings(); startNewGame(false);
  }));

  timerEnable.addEventListener("change", ()=> { timerEnabled = timerEnable.checked; persistSettings(); startNewGame(false); });
  timerLengthInput.addEventListener("change", ()=> { const v = parseInt(timerLengthInput.value)||15; timePerMove = Math.max(3, Math.min(120,v)); persistSettings(); startNewGame(false); });

  bestOfSelect.addEventListener("change", ()=> {
    series.bestOf = parseInt(bestOfSelect.value||3);
    series.target = Math.ceil(series.bestOf/2);
    seriesBestEl.textContent = String(series.bestOf);
    seriesTargetEl.textContent = String(series.target);
    persistSettings();
    // Note: do not reset series automatically — keep current wins unless user resets
  });
  resetSeriesBtn.addEventListener("click", ()=> { series.wins = { X:0, O:0 }; updateSeriesUI(); persistSettings(); rippleFlash(resetSeriesBtn); });

  soundToggle.addEventListener("click", ()=> {
    soundOn = !soundOn; soundToggle.textContent = `Sound: ${soundOn ? "On" : "Off"}`; persistSettings();
    if (soundOn && !audioCtx) initAudio();
  });
}

// Helpers
function getSelectedDifficulty(){ if (diffEasy.checked) return "easy"; if (diffHard.checked) return "hard"; return "normal"; }
function updateStatus(text, type){ statusEl.textContent = text; statusEl.classList.remove("win","lose","draw"); if (type) statusEl.classList.add(type); updateTimerDisplay(); }
function renderBoard(){ board.forEach((v,i)=>{ const cell = cells[i]; cell.textContent = v||""; cell.classList.toggle("x", v==="X"); cell.classList.toggle("o", v==="O"); cell.disabled = !!v || gameOver; }); }
function updateHistory(){ historyList.innerHTML = ""; moveHistory.forEach((m,i)=>{ const li = document.createElement("li"); li.textContent = `#${i+1}: ${m.player} → cell ${m.index+1}`; historyList.appendChild(li); }); }
function updateScoreboard(){ scoreXEl.textContent = String(scores.X); scoreOEl.textContent = String(scores.O); scoreDEl.textContent = String(scores.D); }
function updateSeriesUI(){ seriesXEl.textContent = String(series.wins.X); seriesOEl.textContent = String(series.wins.O); seriesBestEl.textContent = String(series.bestOf); seriesTargetEl.textContent = String(series.target); }
function clearWinLine(){ winLine.style.opacity = 0; }
function drawWinLine(pattern){
  const rect = boardEl.getBoundingClientRect();
  const cellRects = pattern.map(i=>cells[i].getBoundingClientRect());
  const p1 = centerOf(cellRects[0]); const p3 = centerOf(cellRects[2]);
  const x1 = p1.x - rect.left, y1 = p1.y - rect.top, x3 = p3.x - rect.left, y3 = p3.y - rect.top;
  const dx = x3-x1, dy = y3-y1, length = Math.hypot(dx,dy), angle = Math.atan2(dy,dx)*180/Math.PI;
  winLine.style.width = `${length}px`; winLine.style.transform = `translate(${x1}px, ${y1-3}px) rotate(${angle}deg)`; winLine.style.opacity = 1;
}
function centerOf(r){ return { x: r.left + r.width/2, y: r.top + r.height/2 }; }

// Start / Reset
function startNewGame(isInitial){
  board = Array(9).fill(null); moveHistory = []; gameOver=false; current="X"; clearWinLine(); renderBoard(); updateHistory(); timeLeft = timePerMove; stopTimer();

  // update status and timer owner
  if (mode === "pvc"){
    const you = humanSymbol, ai = opponentOf(you);
    if (you === "O"){ updateStatus(`Computer starts as ${ai}`); // AI starts
      if (timerEnabled) { timerOwner = ai; startTimer(); }
      setTimeout(()=>{ computerMove(); checkEnd(); }, 250);
    } else {
      updateStatus(`Your move: ${you}`); timerOwner = humanSymbol; if (timerEnabled) startTimer();
    }
  } else { updateStatus(`Player ${current}'s turn`); timerOwner = current; if (timerEnabled) startTimer(); }

  difficultyGroup.style.display = (mode === "pvp") ? "none" : "";
  if (!isInitial) rippleFlash(btnNew);
}

// Click handler
function onCellClick(e){
  const idx = Number(e.currentTarget.dataset.index);
  if (gameOver || board[idx]) return;
  // if PvC and it's not human's turn, ignore
  if (mode==="pvc" && current !== humanSymbol) return;

  playMove(idx, current);
  if (soundOn) playClick();

  if (checkEnd()) return;

  // For PvC, let AI move
  if (mode==="pvc" && current !== humanSymbol){
    stopTimer(); // AI thinking, pause timer
    setTimeout(()=>{ computerMove(); checkEnd(); }, 220);
  } else {
    // start timer for next player's turn
    if (timerEnabled) { timerOwner = current; timeLeft = timePerMove; startTimer(); }
  }
}

// Play move
function playMove(index, player){
  board[index] = player; moveHistory.push({ index, player }); current = opponentOf(player); renderBoard(); updateHistory();
  if (mode==="pvp"){ updateStatus(`Player ${current}'s turn`); } else {
    const you = humanSymbol;
    if (current === you) updateStatus(`Your move: ${you}`); else updateStatus(`Computer's move...`);
  }
}

// Undo move
function undoMove(){
  if (moveHistory.length === 0 || gameOver) return;
  const last = moveHistory.pop();
  board[last.index] = null;
  current = last.player;
  renderBoard(); updateHistory();
  updateStatus(mode==="pvp" ? `Player ${current}'s turn` : (current===humanSymbol ? `Your move: ${humanSymbol}` : `Computer's move...`));
  clearWinLine();
  if (timerEnabled){ timerOwner = current; timeLeft = timePerMove; startTimer(); }
}

// Check end
function checkEnd(){
  const win = getWinner(board);
  if (win){
    gameOver = true; renderBoard(); highlightWin(win); handleResult(win.player); return true;
  }
  if (isFull(board)){
    gameOver = true; handleResult("D"); return true;
  }
  return false;
}

function highlightWin(win){
  drawWinLine(win.pattern);
  cells.forEach((c,i)=>{ if (win.pattern.includes(i)) c.style.filter = "brightness(1.15)"; else c.style.filter = "grayscale(0.2)"; });
}

// Result handling + series logic
function handleResult(result){
  stopTimer();
  if (result === "D"){
    scores.D++; updateScoreboard(); updateStatus("It's a draw 🤝", "draw"); if (soundOn) playDraw(); celebrate("Draw!", "So close! Rematch?");
    // draws do NOT count toward series wins (common convention). If you prefer draws to count, change here.
    persistSettings();
    return;
  }

  scores[result]++; updateScoreboard();

  // series tracking
  series.wins[result] = (series.wins[result]||0) + 1;
  updateSeriesUI();
  persistSettings();

  const isHumanWin = (mode === "pvc") ? (result === humanSymbol) : true;
  const title = isHumanWin ? "You Win! 🎉" : (mode==="pvc" ? "You Lose 😅" : `Player ${result} Wins! 🏆`);
  const sub = isHumanWin ? "Nice one — keep going!" : (mode==="pvc" ? "Try again!" : "Great match!");
  updateStatus(title, isHumanWin ? "win" : "lose");

  if (soundOn) { if (isHumanWin) playWin(); else playLose(); }
  celebrate(title, sub);

  // Check if series is over
  const target = series.target;
  if (series.wins[result] >= target){
    // series winner
    setTimeout(()=> {
      const seriesTitle = `Series Winner: ${result} 🏆`;
      const seriesSub = `${result} reached ${series.wins[result]} of ${series.bestOf}`;
      celebrate(seriesTitle, seriesSub);
      // reset series after displaying a bit
      setTimeout(()=> {
        series.wins = { X:0, O:0 };
        updateSeriesUI();
        persistSettings();
      }, 2200);
    }, 900);
  }

  persistSettings();
}

// ---------- AI ----------
function computerMove(){
  if (gameOver) return;
  const ai = opponentOf(humanSymbol);
  let move;
  switch (difficulty){
    case "easy": move = randomMove(board); break;
    case "normal": move = heuristicMove(board, ai, humanSymbol); break;
    default: move = minimaxBestMove(board, ai);
  }
  if (move != null){ playMove(move, ai); if (soundOn) playClick(); }
  // restart timer for human if timer enabled
  if (!gameOver && timerEnabled){
    timerOwner = humanSymbol;
    timeLeft = timePerMove;
    startTimer();
  }
}

// Easy: random
function randomMove(b){ const moves = b.map((v,i)=>v?null:i).filter(v=>v!==null); return moves[Math.floor(Math.random()*moves.length)]; }

// Normal: heuristic
function heuristicMove(b, ai, human){
  const winMove = findTacticalMove(b, ai); if (winMove!=null) return winMove;
  const blockMove = findTacticalMove(b, human); if (blockMove!=null) return blockMove;
  if (!b[4]) return 4;
  const corners = [0,2,6,8].filter(i=>!b[i]); if (corners.length) return corners[Math.floor(Math.random()*corners.length)];
  const sides = [1,3,5,7].filter(i=>!b[i]); if (sides.length) return sides[Math.floor(Math.random()*sides.length)];
  return null;
}
function findTacticalMove(b, player){
  for (const p of WIN_PATTERNS){
    const line = p.map(i=>b[i]); const countP = line.filter(v=>v===player).length; const countEmpty = line.filter(v=>!v).length;
    if (countP===2 && countEmpty===1){ const idx = p[line.indexOf(null)]; return idx; }
  }
  return null;
}

// Hard: minimax
function minimaxBestMove(b, aiPlayer){
  let bestScore = -Infinity, bestMove = null;
  for (let i=0;i<9;i++){ if (!b[i]){ b[i] = aiPlayer; const score = minimax(b,false,aiPlayer,opponentOf(aiPlayer),0); b[i]=null; if (score>bestScore){ bestScore=score; bestMove=i; } } }
  return bestMove;
}
function minimax(b,isMax,ai,human,depth){
  const res = getWinner(b);
  if (res){
    if (res.player === ai) return 10-depth;
    if (res.player === human) return depth-10;
  }
  if (isFull(b)) return 0;
  if (isMax){
    let best = -Infinity;
    for (let i=0;i<9;i++){ if (!b[i]){ b[i]=ai; best = Math.max(best, minimax(b,false,ai,human,depth+1)); b[i]=null; } }
    return best;
  } else {
    let best = Infinity;
    for (let i=0;i<9;i++){ if (!b[i]){ b[i]=human; best = Math.min(best, minimax(b,true,ai,human,depth+1)); b[i]=null; } }
    return best;
  }
}

// ---------- Helpers ----------
function opponentOf(p){ return p==="X" ? "O" : "X"; }
function isFull(b){ return b.every(Boolean); }
function getWinner(b){
  for (const p of WIN_PATTERNS){
    const [a,b1,c] = p;
    if (b[a] && b[a] === b[b1] && b[a] === b[c]) return { player: b[a], pattern: p };
  }
  return null;
}

// ---------- Timer ----------
function startTimer(){
  stopTimer();
  if (!timerEnabled) { updateTimerDisplay(); return; }
  timeLeft = timePerMove;
  updateTimerDisplay();
  timerInterval = setInterval(()=> {
    timeLeft--;
    updateTimerDisplay();
    if (timeLeft <= 0){
      stopTimer();
      handleTimeout(timerOwner);
    }
  }, 1000);
}
function stopTimer(){ if (timerInterval){ clearInterval(timerInterval); timerInterval = null; } updateTimerDisplay(); }
function updateTimerDisplay(){ if (!timerEnabled){ timerDisplay.textContent = ""; return; } const left = timeLeft!=null ? timeLeft : timePerMove; timerDisplay.textContent = `⏱ ${left}s`; }

// Timeout behavior: auto-forfeit for timerOwner
function handleTimeout(playerWhoTimedOut){
  // If game already over, ignore
  if (gameOver) return;
  const opponent = opponentOf(playerWhoTimedOut);
  // In PvC: if human timed out, human loses; if AI "times out" (unlikely), grant win to human
  if (mode === "pvc"){
    if (playerWhoTimedOut === humanSymbol){
      // human loses immediately
      board = board; // no change
      gameOver = true; highlightTimeout(playerWhoTimedOut);
      handleResult(opponent);
    } else {
      // AI timeout => human wins
      gameOver = true; highlightTimeout(playerWhoTimedOut); handleResult(humanSymbol);
    }
  } else {
    // PvP: treat as opponent win
    gameOver = true; highlightTimeout(playerWhoTimedOut); handleResult(opponent);
  }
}
function highlightTimeout(player){
  updateStatus(`Time up! ${player} timed out.`, "lose");
  // subtle visual: flash the player's cells
  cells.forEach((c,i)=> { if (board[i]===player) c.style.filter = "brightness(1.05)"; else c.style.filter = "grayscale(0.2)"; });
  if (soundOn) playLose();
}

// ---------- Celebration (confetti + modal) ----------
function celebrate(title, sub){
  celebTitle.textContent = title; celebSub.textContent = sub; celebration.classList.remove("hidden");
  spawnConfetti();
  if (!confettiAnimId) loopConfetti();
  setTimeout(stopConfetti, 2200);
}
function spawnConfetti(){
  const count = 140;
  for (let i=0;i<count;i++){
    confettiParticles.push({
      x: Math.random()*confettiCanvas.width,
      y: -20,
      vx: (Math.random()-0.5)*6,
      vy: Math.random()*3+2,
      size: Math.random()*6+3,
      rot: Math.random()*Math.PI,
      vr: (Math.random()-0.5)*0.2,
      alpha:1
    });
  }
}
function loopConfetti(){
  confettiAnimId = requestAnimationFrame(loopConfetti);
  ctxConfetti.clearRect(0,0,confettiCanvas.width, confettiCanvas.height);
  confettiParticles.forEach(p=>{
    p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.vy += 0.05; p.alpha -= 0.006;
    ctxConfetti.save(); ctxConfetti.globalAlpha = Math.max(0,p.alpha); ctxConfetti.translate(p.x,p.y); ctxConfetti.rotate(p.rot);
    ctxConfetti.fillStyle = "#fff"; ctxConfetti.fillRect(-p.size/2,-p.size/2,p.size,p.size*0.6); ctxConfetti.restore();
  });
  confettiParticles = confettiParticles.filter(p => p.alpha>0 && p.y < confettiCanvas.height+40);
  if (confettiParticles.length === 0){ cancelAnimationFrame(confettiAnimId); confettiAnimId = null; }
}
function stopConfetti(){ confettiParticles.forEach(p=> p.alpha=0); }

// ---------- Sound (Web Audio API) ----------
function initAudio(){
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) { audioCtx = null; soundOn = false; soundToggle.textContent = "Sound: Off"; return; }
}
function playTone(freq, duration = 0.12, type = "sine", gain = 0.08){
  if (!soundOn) return;
  if (!audioCtx) initAudio();
  if (!audioCtx) return;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.value = gain;
  o.connect(g); g.connect(audioCtx.destination);
  o.start();
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
  setTimeout(()=> { o.stop(); o.disconnect(); g.disconnect(); }, duration*1000 + 50);
}
function playClick(){ playTone(880, 0.08, "sine", 0.04); }
function playWin(){ playTone(880, 0.06, "triangle", 0.05); setTimeout(()=>playTone(1100, 0.16, "sine", 0.08), 80); setTimeout(()=>playTone(1320,0.12,"sine",0.07),200); }
function playLose(){ playTone(220,0.16,"sawtooth",0.08); setTimeout(()=>playTone(160,0.18,"sawtooth",0.07),160); }
function playDraw(){ playTone(440,0.12,"sine",0.06); playTone(660,0.12,"sine",0.06); }

// ---------- Persistence ----------
function persistSettings(){
  localStorage.setItem("ttt-mode", mode);
  localStorage.setItem("ttt-difficulty", difficulty);
  localStorage.setItem("ttt-human", humanSymbol);
  localStorage.setItem("ttt-scores", JSON.stringify(scores));
  localStorage.setItem("ttt-series", JSON.stringify(series));
  localStorage.setItem("ttt-timerEnabled", timerEnabled ? "1" : "0");
  localStorage.setItem("ttt-timePerMove", String(timePerMove));
  localStorage.setItem("ttt-soundOn", soundOn ? "1" : "0");
}
function restoreSettings(){
  const m = localStorage.getItem("ttt-mode");
  const d = localStorage.getItem("ttt-difficulty");
  const h = localStorage.getItem("ttt-human");
  const s = localStorage.getItem("ttt-scores");
  const ser = localStorage.getItem("ttt-series");
  const ten = localStorage.getItem("ttt-timerEnabled");
  const tpm = localStorage.getItem("ttt-timePerMove");
  const snd = localStorage.getItem("ttt-soundOn");

  if (m) { mode = m; (mode==="pvc" ? modePvC : modePvP).checked = true; }
  if (d) { difficulty = d; diffEasy.checked = d==="easy"; diffNormal.checked = d==="normal"; diffHard.checked = d==="hard"; }
  if (h) { humanSymbol = h; playX.checked = h==="X"; playO.checked = h==="O"; }
  if (s) { try { scores = JSON.parse(s) || scores; } catch(e){} }
  if (ser) { try { series = JSON.parse(ser) || series; } catch(e){} }
  if (ten) { timerEnabled = ten === "1"; timerEnable.checked = timerEnabled; }
  if (tpm) { timePerMove = parseInt(tpm) || 15; timerLengthInput.value = String(timePerMove); }
  if (snd) { soundOn = snd === "1"; soundToggle.textContent = `Sound: ${soundOn ? "On" : "Off"}`; if (soundOn) initAudio(); }

  updateScoreboard(); updateSeriesUI();
  bestOfSelect.value = String(series.bestOf);
  seriesBestEl.textContent = String(series.bestOf);
  seriesTargetEl.textContent = String(series.target);
}

// ---------- Utilities ----------
function resetScore(){ scores = { X:0, O:0, D:0 }; updateScoreboard(); persistSettings(); rippleFlash(btnResetScore); }
function rippleFlash(btn){ btn.style.transform = "translateY(-1px) scale(1.02)"; setTimeout(()=> btn.style.transform = "", 120); }

// Close celebration by clicking outside
celebration.addEventListener("click", (e)=> {
  if (e.target === celebration){ celebration.classList.add("hidden"); startNewGame(false); }
});

// Theme
function toggleTheme(){ document.documentElement.classList.toggle("dark"); localStorage.setItem("ttt-theme-dark", document.documentElement.classList.contains("dark") ? "1" : "0"); }
(function restoreTheme(){ if (localStorage.getItem("ttt-theme-dark")==="1") document.documentElement.classList.add("dark"); })();

// Keyboard access: allow 1-9 to place
document.addEventListener("keydown", (e)=>{
  if (/^[1-9]$/.test(e.key)){
    const idx = parseInt(e.key)-1;
    if (!cells[idx].disabled) cells[idx].click();
  }
});

// Ensure audio context resumes on user gesture (some browsers block autoplay)
document.addEventListener("click", ()=> { if (audioCtx && audioCtx.state === "suspended") audioCtx.resume(); }, { once:true });
