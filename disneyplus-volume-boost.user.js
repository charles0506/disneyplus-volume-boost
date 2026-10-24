// ==UserScript==
// @name         Disney+ 音量增強
// @namespace    https://github.com/charles0506/disneyplus-volume-boost
// @version      1.0.0
// @description  Disney+ 播放音量放大（可調 100%~600%）＋壓縮器防爆音、拉近對白與爆炸聲差距
// @homepageURL  https://github.com/charles0506/disneyplus-volume-boost
// @supportURL   https://github.com/charles0506/disneyplus-volume-boost/issues
// @updateURL    https://raw.githubusercontent.com/charles0506/disneyplus-volume-boost/main/disneyplus-volume-boost.user.js
// @downloadURL  https://raw.githubusercontent.com/charles0506/disneyplus-volume-boost/main/disneyplus-volume-boost.user.js
// @match        https://www.disneyplus.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // 做法：<video> → GainNode（放大）→ DynamicsCompressor（壓住大聲處，避免破音）→ 喇叭。
  // Disney+ 的 <video> 可能藏在 shadow DOM 裡，所以除了掃 DOM 也攔 play() 抓元素。
  //
  // 保險：createMediaElementSource 一接上就拔不掉。若瀏覽器對 DRM 影片的 Web Audio
  // 只輸出靜音，影片會變無聲。偵測到「正在播放卻連續全零」就記下停用並重新整理。

  const KEY_GAIN = 'dpvb-gain';
  const KEY_OFF = 'dpvb-disabled';
  const STEP = 0.25, MIN = 1, MAX = 6, DEF = 2.5;

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };

  let gainVal = parseFloat(store.get(KEY_GAIN));
  if (!(gainVal >= MIN && gainVal <= MAX)) gainVal = DEF;
  let enabled = true;
  const disabled = store.get(KEY_OFF) === '1';

  let ctx = null;
  const chains = new WeakMap(); // video -> {gain, comp, analyser}
  const all = new Set();

  function applyAll() {
    for (const c of all) {
      const g = enabled ? gainVal : 1;
      c.gain.gain.setTargetAtTime(g, ctx.currentTime, 0.05);
      c.comp.ratio.setTargetAtTime(enabled ? 12 : 1, ctx.currentTime, 0.05);
    }
  }

  function hook(video) {
    if (disabled || chains.has(video)) return;
    try {
      ctx = ctx || new AudioContext();
      const src = ctx.createMediaElementSource(video);
      const gain = ctx.createGain();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -12;
      comp.knee.value = 10;
      comp.attack.value = 0.003;
      comp.release.value = 0.25;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(gain).connect(comp).connect(ctx.destination);
      src.connect(analyser);
      const c = { gain, comp, analyser };
      chains.set(video, c);
      all.add(c);
      applyAll();
      watchSilence(video, c);
      video.addEventListener('play', () => ctx.state === 'suspended' && ctx.resume());
      if (!video.paused) ctx.resume();
    } catch (e) {
      console.warn('[Disney+ 音量增強] 接不上', e);
    }
  }

  function watchSilence(video, c) {
    const buf = new Float32Array(c.analyser.fftSize);
    let silentSince = 0, lastT = -1;
    const timer = setInterval(() => {
      const playing = !video.paused && !video.muted && video.volume > 0 &&
        video.currentTime !== lastT && ctx.state === 'running';
      lastT = video.currentTime;
      if (!playing) { silentSince = 0; return; }
      c.analyser.getFloatTimeDomainData(buf);
      let peak = 0;
      for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
      if (peak > 0) { clearInterval(timer); return; } // 有聲音，確認可用
      silentSince = silentSince || Date.now();
      if (Date.now() - silentSince > 8000) {
        clearInterval(timer);
        store.set(KEY_OFF, '1');
        toast('此瀏覽器對 Disney+ 影片輸出靜音，音量增強已停用，重新整理中…', 3000);
        setTimeout(() => location.reload(), 3000);
      }
    }, 500);
  }

  // 攔 play()：shadow DOM 裡的 video 也抓得到
  const origPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    if (this instanceof HTMLVideoElement) hook(this);
    return origPlay.apply(this, arguments);
  };
  new MutationObserver(() => document.querySelectorAll('video').forEach(hook))
    .observe(document, { childList: true, subtree: true });

  // ---- 介面：右上角小膠囊，滑鼠動才出現；點一下開關、滾輪調整 ----
  let pill, hideTimer, toastTimer;
  function ensurePill() {
    if (pill || !document.body) return pill;
    pill = document.createElement('div');
    pill.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;' +
      'padding:6px 12px;border-radius:16px;background:rgba(0,0,0,.65);color:#fff;' +
      'font:14px/1.2 system-ui,sans-serif;cursor:pointer;user-select:none;opacity:0;' +
      'transition:opacity .2s;max-width:60vw';
    pill.title = '點一下：開/關　滾輪：調整　Alt+↑↓：調整　Alt+0：開/關';
    pill.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
    pill.addEventListener('wheel', (e) => {
      e.preventDefault(); e.stopPropagation();
      adjust(e.deltaY < 0 ? STEP : -STEP);
    }, { passive: false });
    pill.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    pill.addEventListener('mouseleave', () => show());
    document.body.appendChild(pill);
    return pill;
  }

  function label() {
    if (disabled) return '🔈 音量增強已停用（此瀏覽器不支援）— 點此重新啟用';
    return enabled ? `🔊 ${Math.round(gainVal * 100)}%` : '🔈 原音量';
  }

  function show(ms = 2000) {
    if (toastTimer || (!all.size && !disabled) || !ensurePill()) return; // 沒在播影片就不打擾
    pill.textContent = label();
    pill.style.opacity = '1';
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { pill.style.opacity = '0'; }, ms);
  }

  function toast(msg, ms) {
    if (!ensurePill()) return;
    pill.textContent = msg;
    pill.style.opacity = '1';
    clearTimeout(hideTimer);
    toastTimer = setTimeout(() => { toastTimer = null; pill.style.opacity = '0'; }, ms);
  }

  function toggle() {
    if (disabled) { store.del(KEY_OFF); location.reload(); return; }
    enabled = !enabled;
    if (ctx) applyAll();
    show();
  }

  function adjust(d) {
    if (disabled) return;
    enabled = true;
    gainVal = Math.min(MAX, Math.max(MIN, Math.round((gainVal + d) / STEP) * STEP));
    store.set(KEY_GAIN, String(gainVal));
    if (ctx) applyAll();
    show();
  }

  document.addEventListener('mousemove', () => show(), { passive: true });
  document.addEventListener('keydown', (e) => {
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'ArrowUp') adjust(STEP);
    else if (e.key === 'ArrowDown') adjust(-STEP);
    else if (e.key === '0') toggle();
    else return;
    e.preventDefault(); e.stopPropagation();
  }, true);
})();
