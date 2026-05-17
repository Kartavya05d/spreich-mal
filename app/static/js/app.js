/* ─────────────────────────────────────────────
   Sprich Mal! — App Logic
   States: idle → loading → topic → prep → speaking → revealed
   Modules: Timer, Recorder, WaveformPlayer
───────────────────────────────────────────── */

(() => {
  'use strict';

  // ── DOM Refs ──
  const btnGenerate     = document.getElementById('btn-generate');
  const btnReset        = document.getElementById('btn-reset');
  const themeBtn        = document.getElementById('theme-btn');
  const topicCard       = document.getElementById('topic-card');
  const topicTitle      = document.getElementById('topic-title');
  const topicHint       = document.getElementById('topic-hint');
  const burstEl         = document.getElementById('burst');
  const timerCard       = document.getElementById('timer-card');
  const timerPhase      = document.getElementById('timer-phase');
  const timerNumber     = document.getElementById('timer-number');
  const timerUnit       = document.getElementById('timer-unit');
  const timerMsg        = document.getElementById('timer-msg');
  const progressRing    = document.getElementById('timer-progress');
  const micStatus       = document.getElementById('mic-status');
  const micDot          = document.getElementById('mic-dot');
  const micLabel        = document.getElementById('mic-label');
  const helpPanel       = document.getElementById('help-panel');
  const resetSection    = document.getElementById('reset-section');
  const toast           = document.getElementById('toast');

  // Recording card refs
  const recordingCard   = document.getElementById('recording-card');
  const waveformCanvas  = document.getElementById('waveform-canvas');
  const btnPlay         = document.getElementById('btn-play');
  const playIconPath    = document.getElementById('play-icon-path');
  const playerScrubber  = document.getElementById('player-scrubber');
  const playerCurrent   = document.getElementById('player-current');
  const playerDuration  = document.getElementById('player-duration');
  const btnDownload     = document.getElementById('btn-download');
  const recordingDenied = document.getElementById('recording-denied');

  // Help content refs
  const helpSummary     = document.getElementById('help-summary');
  const helpVocab       = document.getElementById('help-vocab');
  const helpIdeas       = document.getElementById('help-ideas');
  const helpExamples    = document.getElementById('help-examples');

  // ── Constants ──
  const PREP_SECS     = 5;
  const SPEAKING_SECS = 60;
  const CIRCUMFERENCE = 339.3; // 2π × 54

  // ── App State ──
  let state         = 'idle';
  let timerInterval = null;
  let currentTopic  = null;

  // ── Theme ──
  const savedTheme = localStorage.getItem('theme') ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  setTheme(savedTheme);

  function setTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    themeBtn.textContent = t === 'dark' ? '☀️' : '🌙';
    themeBtn.setAttribute('aria-label', t === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    localStorage.setItem('theme', t);
  }

  themeBtn.addEventListener('click', () => {
    setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });

  // ════════════════════════════════════════════
  //  RECORDER MODULE
  // ════════════════════════════════════════════
  const Recorder = (() => {
    let mediaRecorder  = null;
    let audioChunks    = [];
    let stream         = null;
    let audioBlobUrl   = null;
    let analyserNode   = null;
    let audioCtx       = null;
    let animFrameId    = null;
    let liveBarData    = []; // sampled amplitude frames during recording

    // ── Request mic & start recording ──
    async function start() {
      audioChunks  = [];
      liveBarData  = [];
      audioBlobUrl = null;

      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } catch (err) {
        console.warn('Microphone access denied:', err);
        return false; // caller handles UI
      }

      // Set up Web Audio analyser for live amplitude sampling
      audioCtx     = new (window.AudioContext || window.webkitAudioContext)();
      analyserNode = audioCtx.createAnalyser();
      analyserNode.fftSize = 256;
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyserNode);

      // Sample RMS amplitude ~20× per second for waveform bars
      const bufLen  = analyserNode.frequencyBinCount;
      const dataArr = new Uint8Array(bufLen);
      let lastSample = 0;

      function sampleLoop(ts) {
        animFrameId = requestAnimationFrame(sampleLoop);
        if (ts - lastSample < 50) return; // ~20fps sampling
        lastSample = ts;
        analyserNode.getByteTimeDomainData(dataArr);
        let sumSq = 0;
        for (let i = 0; i < bufLen; i++) {
          const norm = (dataArr[i] - 128) / 128;
          sumSq += norm * norm;
        }
        liveBarData.push(Math.sqrt(sumSq / bufLen)); // RMS
      }
      animFrameId = requestAnimationFrame(sampleLoop);

      // MediaRecorder — prefer webm/opus, fallback to browser default
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : '';
      mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
      mediaRecorder.start(250); // collect chunks every 250ms

      return true;
    }

    // ── Stop recording, return blob URL ──
    function stop() {
      return new Promise(resolve => {
        cancelAnimationFrame(animFrameId);

        if (!mediaRecorder || mediaRecorder.state === 'inactive') {
          resolve(null);
          return;
        }

        mediaRecorder.onstop = () => {
          const blob  = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
          audioBlobUrl = URL.createObjectURL(blob);

          // Stop all tracks
          stream.getTracks().forEach(t => t.stop());
          audioCtx.close();

          resolve({ url: audioBlobUrl, barData: [...liveBarData] });
        };

        mediaRecorder.stop();
      });
    }

    // ── Abort without saving ──
    function abort() {
      cancelAnimationFrame(animFrameId);
      if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
      if (stream) stream.getTracks().forEach(t => t.stop());
      if (audioCtx) audioCtx.close();
      if (audioBlobUrl) { URL.revokeObjectURL(audioBlobUrl); audioBlobUrl = null; }
      audioChunks  = [];
      liveBarData  = [];
    }

    return { start, stop, abort };
  })();


  // ════════════════════════════════════════════
  //  WAVEFORM PLAYER MODULE
  // ════════════════════════════════════════════
  const WaveformPlayer = (() => {
    let audioEl      = null;
    let barData      = [];
    let rafId        = null;
    let isDragging   = false;

    const PLAY_D  = 'M8 5v14l11-7z';
    const PAUSE_D = 'M6 19h4V5H6v14zm8-14v14h4V5h-4z';

    function init(url, bars) {
      // Clean up any previous instance
      destroy();

      barData  = bars && bars.length ? bars : [];
      audioEl  = new Audio(url);
      audioEl.preload = 'metadata';

      // Duration & scrubber range
      audioEl.addEventListener('loadedmetadata', () => {
        playerDuration.textContent = fmtTime(audioEl.duration);
        playerScrubber.max = audioEl.duration;
        drawWaveform(0);
      });

      // Scrubber sync
      audioEl.addEventListener('timeupdate', () => {
        if (!isDragging) {
          playerScrubber.value = audioEl.currentTime;
          playerCurrent.textContent = fmtTime(audioEl.currentTime);
          drawWaveform(audioEl.currentTime / (audioEl.duration || 1));
        }
      });

      // Ended → reset to play icon
      audioEl.addEventListener('ended', () => {
        playIconPath.setAttribute('d', PLAY_D);
        btnPlay.setAttribute('aria-label', 'Play recording');
        drawWaveform(1);
        cancelAnimationFrame(rafId);
      });

      // Play / pause button
      btnPlay.onclick = () => {
        if (audioEl.paused) {
          audioEl.play();
          playIconPath.setAttribute('d', PAUSE_D);
          btnPlay.setAttribute('aria-label', 'Pause recording');
          tickProgress();
        } else {
          audioEl.pause();
          playIconPath.setAttribute('d', PLAY_D);
          btnPlay.setAttribute('aria-label', 'Play recording');
          cancelAnimationFrame(rafId);
        }
      };

      // Scrubber drag
      playerScrubber.addEventListener('mousedown', () => { isDragging = true; });
      playerScrubber.addEventListener('touchstart', () => { isDragging = true; }, { passive: true });
      playerScrubber.addEventListener('input', () => {
        playerCurrent.textContent = fmtTime(+playerScrubber.value);
        drawWaveform(+playerScrubber.value / (audioEl.duration || 1));
      });
      playerScrubber.addEventListener('change', () => {
        audioEl.currentTime = +playerScrubber.value;
        isDragging = false;
      });
    }

    function tickProgress() {
      rafId = requestAnimationFrame(tickProgress);
      if (!isDragging) {
        playerScrubber.value = audioEl.currentTime;
        playerCurrent.textContent = fmtTime(audioEl.currentTime);
      }
    }

    // Draw the static waveform with a playhead overlay
    function drawWaveform(progress) {
      const canvas = waveformCanvas;
      const dpr    = window.devicePixelRatio || 1;
      const W      = canvas.offsetWidth;
      const H      = canvas.height;

      // Resize canvas to actual CSS size × dpr
      if (canvas.width !== W * dpr) {
        canvas.width  = W * dpr;
        canvas.height = H * dpr;
      }

      const ctx    = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.scale(dpr, dpr);

      const dark = document.documentElement.getAttribute('data-theme') === 'dark';
      const colorPlayed  = dark ? '#e07545' : '#d4622a';
      const colorPending = dark ? '#352b24' : '#e8dfd0';
      const barW  = 3;
      const gap   = 2;
      const cols  = Math.floor(W / (barW + gap));
      const playedCols = Math.round(cols * progress);

      // Resample barData to cols
      const source = barData.length ? barData : new Array(cols).fill(0.15);
      const resampled = Array.from({ length: cols }, (_, i) => {
        const idx = Math.floor((i / cols) * source.length);
        return source[idx] ?? 0.05;
      });

      // Normalise
      const maxVal = Math.max(...resampled, 0.01);

      for (let i = 0; i < cols; i++) {
        const x    = i * (barW + gap);
        const norm = resampled[i] / maxVal;
        const barH = Math.max(4, norm * (H - 8));
        const y    = (H - barH) / 2;
        ctx.fillStyle = i < playedCols ? colorPlayed : colorPending;
        ctx.beginPath();
        ctx.roundRect(x, y, barW, barH, 2);
        ctx.fill();
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0); // reset scale
    }

    function destroy() {
      if (audioEl) {
        audioEl.pause();
        audioEl.src = '';
        audioEl = null;
      }
      cancelAnimationFrame(rafId);
      isDragging = false;
      playerScrubber.value = 0;
      playerCurrent.textContent = '0:00';
      playerDuration.textContent = '0:00';
      playIconPath.setAttribute('d', PLAY_D);
      btnPlay.setAttribute('aria-label', 'Play recording');
    }

    function redraw() {
      if (audioEl) drawWaveform(audioEl.currentTime / (audioEl.duration || 1));
      else drawWaveform(0);
    }

    return { init, destroy, redraw };
  })();


  // ════════════════════════════════════════════
  //  MAIN APP FLOW
  // ════════════════════════════════════════════

  // ── Generate ──
  btnGenerate.addEventListener('click', async () => {
    if (state === 'loading') return;
    resetUI();
    setState('loading');

    try {
      const res = await fetch('/api/topic');
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      currentTopic = await res.json();
    } catch {
      showToast('Could not load a topic. Please try again.');
      setState('idle');
      return;
    }

    renderTopic(currentTopic);
    setState('topic');

    requestAnimationFrame(() => {
      topicCard.classList.add('visible');
      spawnBurst();
    });

    setTimeout(() => startPrep(), 600);
  });

  // ── Reset ──
  btnReset.addEventListener('click', () => {
    clearInterval(timerInterval);
    Recorder.abort();
    WaveformPlayer.destroy();
    resetUI();
    setState('idle');
  });

  // ── setState ──
  function setState(s) {
    state = s;
    btnGenerate.classList.toggle('loading', s === 'loading');
    btnGenerate.disabled = ['loading', 'prep', 'speaking'].includes(s);
    btnGenerate.querySelector('.btn-text').textContent =
      s === 'loading' ? 'Generating…' : 'Give me a topic';
  }

  // ── resetUI ──
  function resetUI() {
    topicCard.classList.remove('visible');
    topicCard.style.display = 'none';
    timerCard.classList.remove('visible', 'prep');
    recordingCard.classList.remove('visible');
    helpPanel.classList.remove('visible');
    resetSection.classList.remove('visible');
    burstEl.innerHTML = '';
    micStatus.classList.remove('recording');
    micDot.classList.remove('active');
    micLabel.textContent = '';
    recordingDenied.hidden = true;
    clearInterval(timerInterval);
    setRingProgress(1);
  }

  // ── Render Topic ──
  function renderTopic(topic) {
    topicTitle.textContent = topic.topic_title;
    topicHint.textContent  = topic.topic_hint;
    topicCard.style.display = 'block';
  }

  // ── Burst ──
  const BURST_COLORS = ['#d4622a','#e07545','#3d7a5e','#4e9b75','#f5c67b','#a0c4ff'];
  function spawnBurst() {
    burstEl.innerHTML = '';
    for (let i = 0; i < 8; i++) {
      const dot = document.createElement('div');
      dot.className = 'burst-dot';
      dot.style.background = BURST_COLORS[i % BURST_COLORS.length];
      dot.style.animationDelay = `${i * 55}ms`;
      burstEl.appendChild(dot);
    }
  }

  // ── Prep Countdown ──
  function startPrep() {
    timerCard.classList.add('visible', 'prep');
    timerPhase.innerHTML = 'Phase: <span>Prepare</span>';
    timerUnit.textContent = 'sec';
    timerMsg.textContent  = 'Get your thoughts ready…';
    micLabel.textContent  = '';
    micDot.classList.remove('active');

    let remaining = PREP_SECS;
    timerNumber.textContent = remaining;
    setRingProgress(1);

    timerInterval = setInterval(() => {
      remaining--;
      timerNumber.textContent = remaining;
      setRingProgress(remaining / PREP_SECS);

      if (remaining <= 0) {
        clearInterval(timerInterval);
        timerCard.classList.remove('prep');
        setTimeout(startSpeaking, 250);
      }
    }, 1000);
  }

  // ── Speaking Timer ──
  async function startSpeaking() {
    timerPhase.innerHTML  = 'Phase: <span>Speak!</span>';
    timerUnit.textContent = 'sec';
    timerMsg.textContent  = 'You\'re doing great — keep going!';

    // Start recording
    const started = await Recorder.start();
    if (started) {
      micDot.classList.add('active');
      micLabel.textContent = 'Recording…';
    } else {
      // Permission denied — show inline note but continue timer
      recordingDenied.hidden = false;
      micLabel.textContent = 'Mic unavailable';
    }

    let remaining = SPEAKING_SECS;
    timerNumber.textContent = remaining;
    setRingProgress(1);

    timerInterval = setInterval(() => {
      remaining--;
      timerNumber.textContent = remaining;
      setRingProgress(remaining / SPEAKING_SECS);

      if (remaining === 30) timerMsg.textContent = 'Halfway there!';
      if (remaining === 10) timerMsg.textContent = '10 seconds left — finish strong!';
      if (remaining === 0)  timerMsg.textContent = 'Time\'s up! Great effort 🎉';

      if (remaining <= 0) {
        clearInterval(timerInterval);
        micDot.classList.remove('active');
        micLabel.textContent = started ? 'Saved ✓' : '';
        setTimeout(() => finishSpeaking(started), 400);
      }
    }, 1000);
  }

  // ── Finish Speaking → stop recorder → show player ──
  async function finishSpeaking(wasRecording) {
    if (wasRecording) {
      const result = await Recorder.stop();
      if (result) {
        showRecordingCard(result.url, result.barData);
      }
    }
    setTimeout(revealHelp, wasRecording ? 300 : 500);
  }

  // ── Show Recording Card ──
  function showRecordingCard(url, barData) {
    recordingCard.classList.add('visible');
    btnDownload.href = url;

    // Small delay so card is visible before canvas draws
    requestAnimationFrame(() => {
      WaveformPlayer.init(url, barData);
    });

    recordingCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ── Ring Progress ──
  function setRingProgress(fraction) {
    const offset = CIRCUMFERENCE * (1 - Math.max(0, Math.min(1, fraction)));
    progressRing.style.strokeDashoffset = offset;
  }

  // ── Reveal Help ──
  function revealHelp() {
    const h = currentTopic.a2_german_help;

    helpSummary.innerHTML = h.summary
      .map(s => `<p class="summary-text">${escHtml(s)}</p>`).join('');

    helpVocab.innerHTML = h.vocabulary
      .map(v => `
        <div class="vocab-chip">
          <span class="vocab-de">${escHtml(v.de)}</span>
          <span class="vocab-en">${escHtml(v.en)}</span>
        </div>`).join('');

    helpIdeas.innerHTML = `<ul class="ideas-list">
      ${h.ideas.map(i => `<li>${escHtml(i)}</li>`).join('')}
    </ul>`;

    helpExamples.innerHTML = h.example
      .map(e => `<div class="example-item">${escHtml(e)}</div>`).join('');

    helpPanel.classList.add('visible');
    resetSection.classList.add('visible');
    setState('revealed');

    setTimeout(() => helpPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
  }

  // ── Toast ──
  let toastTimeout;
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.remove('show'), 4000);
  }

  // ── Helpers ──
  function escHtml(str) {
    return str
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function fmtTime(secs) {
    if (!isFinite(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  // Redraw waveform on theme change (colour swap)
  themeBtn.addEventListener('click', () => {
    setTimeout(() => WaveformPlayer.redraw(), 50);
  });

  // Keyboard shortcut
  btnGenerate.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); btnGenerate.click(); }
  });

  // Resize: redraw waveform if card is visible
  window.addEventListener('resize', () => {
    if (recordingCard.classList.contains('visible')) WaveformPlayer.redraw();
  });

})();
