"use strict";
// Constants
const HOLD_MS = 1200;
const OWNER_FLAG = "r24-owner";
const TOTAL_PHOTOS = 16;
const PRELUDE_FLAG = "r24-prelude";
// Elements
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
const byId = (id) => document.getElementById(id);
const reduceMotionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
let prefersReducedMotion = reduceMotionQuery ? reduceMotionQuery.matches : false;
if (reduceMotionQuery) {
  const updateMotionPreference = (event) => { prefersReducedMotion = !!event.matches; };
  if (typeof reduceMotionQuery.addEventListener === 'function') {
    reduceMotionQuery.addEventListener('change', updateMotionPreference);
  } else if (typeof reduceMotionQuery.addListener === 'function') {
    reduceMotionQuery.addListener(updateMotionPreference);
  }
}
const CAT_MESSAGES = {
  constellation: "See those stars? They shine for you. Let's go.",
  cake: "Mmm, that was delicious!",
  gift: "Beautiful, you deserve this."
};
const BALLOON_TARGET = 24;
const BALLOON_GOLD_MIN = 1;
const constellationState = {
  overlay: null,
  sparkles: null,
  active: false,
  done: false,
  sparkleTimer: null,
  hideTimer: null,
  keyHandler: null
};
const balloonState = {
  stage: null,
  field: null,
  counter: null,
  message: null,
  announcer: null,
  skipBtn: null,
  active: false,
  popped: 0,
  goldenPopped: false,
  spawnCount: 0,
  spawnTimer: null,
  skipTimer: null,
  reduce: false,
  goldSpawned: false
};
/* Mobile-block: prevent phone visitors from using the site */
function shouldBlockMobile() {
  try {
    const bypass = sessionStorage.getItem('mobileBypass') === '1';
    if (bypass) return false;
  } catch(e){}
  // Block if viewport width is narrow (phones). 768px is the threshold for tablet/desktop.
  if (window.innerWidth < 768) return true;
  return false;
}
function initMobileBlock() {
  const el = document.getElementById('mobileBlock');
  const btn = document.getElementById('mobileBlockDismiss');
  if (!el) return;
  const show = shouldBlockMobile();
  if (show) {
    el.removeAttribute('hidden');
    el.setAttribute('aria-hidden', 'false');
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    // trap focus
    el.addEventListener('keydown', (ev) => {
      if (ev.key === 'Tab') ev.preventDefault();
      if (ev.key === 'Escape') ev.preventDefault();
    });
  }
  if (btn) {
    btn.addEventListener('click', () => {
      try { sessionStorage.setItem('mobileBypass', '1'); } catch(e){}
      el.setAttribute('hidden', '');
      el.setAttribute('aria-hidden', 'true');
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    });
  }
  // re-evaluate on resize/orientationchange
  window.addEventListener('resize', () => {
    if (!el) return;
    if (shouldBlockMobile()) {
      el.removeAttribute('hidden'); el.setAttribute('aria-hidden', 'false');
    } else {
      el.setAttribute('hidden', ''); el.setAttribute('aria-hidden', 'true');
    }
  });
}
let catCompanionEl = null;
let catBubbleEl = null;
let catMessageTimer = null;
// Countdown helpers
function getTargetMonthDay() {
  const attr = document.body.getAttribute("data-birthday");
  if (attr) {
    const d = new Date(attr);
    if (!isNaN(d)) {
      return { month: d.getMonth(), day: d.getDate() }; // month is 0-based
    }
  }
  // Fallback: 14 October yearly
  return { month: 9, day: 14 }; // Oct=9 (0-based)
}
function isOpenDay(now = new Date()) {
  const { month, day } = getTargetMonthDay();
  return now.getMonth() === month && now.getDate() === day;
}
function nextBirthdayFromAttrOrFallback(now = new Date()) {
  const { month, day } = getTargetMonthDay();
  const y = now.getFullYear();
  let target = new Date(y, month, day, 0, 0, 0, 0);
  // If today is the day, return next year's occurrence for countdown contexts
  if (isOpenDay(now) || now > target) {
    target = new Date(y + 1, month, day, 0, 0, 0, 0);
  }
  return target;
}
function fmtDiff(ms) {
  let s = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(s / 86400); s -= days * 86400;
  const hours = Math.floor(s / 3600); s -= hours * 3600;
  const mins = Math.floor(s / 60); s -= mins * 60;
  const secs = s;
  return `${days}d ${hours}h ${mins}m ${secs}s`;
}
// Lock overlay
function showLockout() {
  const lock = byId("lockout");
  if (!lock) return;
  lock.removeAttribute("hidden");
  lock.setAttribute("aria-hidden", "false");
}
function hideLockout() {
  const lock = byId("lockout");
  if (!lock) return;
  lock.setAttribute("hidden", "");
  lock.setAttribute("aria-hidden", "true");
}
function ownerBypassActive() {
  try { return sessionStorage.getItem(OWNER_FLAG) === "1"; } catch { return false; }
}
function setOwnerBypass() {
  try { sessionStorage.setItem(OWNER_FLAG, "1"); } catch { }
  hideLockout();
  // If unlocked via owner, kick off prelude if applicable
  kickoffPreludeIfApplicable();
}
function checkOwnerParam() {
  try {
    const url = new URL(location.href);
    const owner = url.searchParams.get("owner");
    if (owner === "1") {
      setOwnerBypass();
      url.searchParams.delete("owner");
      history.replaceState({}, "", url);
    } else if (owner === "0") {
      try { sessionStorage.removeItem(OWNER_FLAG); } catch { }
      ensureLockout();
      url.searchParams.delete("owner");
      history.replaceState({}, "", url);
    }
    const replay = url.searchParams.get("replay");
    if (replay === "1") {
      try { sessionStorage.removeItem(PRELUDE_FLAG); } catch { }
      url.searchParams.delete("replay");
      history.replaceState({}, "", url);
    }
  } catch { }
}
function enableOwnerBypass() {
  // Secret code: 2,4,1,0 within 5 seconds
  const sequence = ["2", "4", "1", "0"];
  let buffer = [];
  let timer = null;
  const reset = () => { buffer = []; if (timer) { clearTimeout(timer); timer = null; } };
  document.addEventListener("keydown", (e) => {
    // Ignore if typing in form controls (not present here, but safe)
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : "";
    if (["input", "textarea", "select"].includes(tag)) return;
    if (!/^[0-9]$/.test(e.key)) return;
    buffer.push(e.key);
    if (!timer) {
      timer = setTimeout(() => reset(), 5000);
    }
    if (buffer.length > sequence.length) buffer.shift();
    if (sequence.every((v, i) => buffer[i] === v)) {
      reset();
      setOwnerBypass();
    }
  });
}
function ensureLockout() {
  if (isOpenDay() || ownerBypassActive()) {
    hideLockout();
  } else {
    showLockout();
  }
}
// Heart press & hold
function setupPressHold() {
  const heart = byId("revealHeart");
  const article = byId("letterBody");
  const hint = byId("holdHint");
  if (!heart || !article) return;
  let timer = null;
  let armed = false;
  let revealed = false;
  const start = (e) => {
    if (revealed) return;
    if (e.type === "keydown" && !(e.key === " " || e.key === "Enter")) return;
    armed = true;
    // Prevent scroll on space
    if (e.type === "keydown") e.preventDefault();
    timer = setTimeout(() => {
      reveal();
    }, HOLD_MS);
  };
  const cancel = () => {
    armed = false;
    if (timer) { clearTimeout(timer); timer = null; }
  };
  const reveal = () => {
    if (revealed) return;
    revealed = true;
    cancel();
    article.removeAttribute("hidden");
    heart.setAttribute("aria-expanded", "true");
    heart.setAttribute("aria-pressed", "true");
    heart.setAttribute("disabled", "true");
    heart.classList.add("opened");
    if (hint) hint.style.display = "none";
    confettiBurst(heart);
    startTypingLetter();
    // Enhance letter visuals
    const txt = byId("letterText");
    if (txt) txt.classList.add("ink-appear");
  };
  // Pointer events (preferred)
  if (window.PointerEvent) {
    heart.addEventListener("pointerdown", start);
    heart.addEventListener("pointerup", cancel);
    heart.addEventListener("pointercancel", cancel);
    heart.addEventListener("pointerleave", cancel);
  } else {
    // Fallback mouse/touch
    heart.addEventListener("mousedown", start);
    heart.addEventListener("mouseup", cancel);
    heart.addEventListener("mouseleave", cancel);
    heart.addEventListener("touchstart", start, { passive: true });
    heart.addEventListener("touchend", cancel);
    heart.addEventListener("touchcancel", cancel);
  }
  // Keyboard
  heart.addEventListener("keydown", start);
  heart.addEventListener("keyup", cancel);
}
// Confetti
function confettiBurst(originEl) {
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const count = reduce ? 8 : 28;
  const rect = originEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const colors = ["#f9f3e8", "#d9b892", "#b94545", "#f1ccc3"]; // beige, sand, red, blush
  for (let i = 0; i < count; i++) {
    const piece = document.createElement("i");
    piece.className = "confetti-piece";
    const dx = (Math.random() - 0.5) * 240; // horizontal spread
    const startX = Math.round(cx + dx);
    const startY = Math.round(cy);
    const dur = Math.round(900 + Math.random() * 900);
    piece.style.setProperty("--x", startX + "px");
    piece.style.setProperty("--y", startY + "px");
    piece.style.setProperty("--dur", dur + "ms");
    piece.style.left = "0px";
    piece.style.top = "0px";
    piece.style.width = (6 + Math.random() * 6) + "px";
    piece.style.height = (8 + Math.random() * 10) + "px";
    piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    piece.style.transform = `translate(${startX}px, ${startY}px)`;
    document.body.appendChild(piece);
    setTimeout(() => piece.remove(), dur + 400);
  }
}
// Gallery
function setupGallery() {
  const prev = byId("prevPhoto");
  const next = byId("nextPhoto");
  const img = byId("photo");
  const section = byId("gallery");
  if (!prev || !next || !img || !section) return;
  let index = 1;
  let galleryActive = false;
  const renderPhoto = () => {
    const src = `Pictures/Rainu_${index}.png`;
    img.src = src;
    img.alt = `Rainu ${index}`;
  };
  const go = (delta) => {
    index += delta;
    if (index < 1) index = TOTAL_PHOTOS;
    if (index > TOTAL_PHOTOS) index = 1;
    renderPhoto();
  };
  prev.addEventListener("click", () => go(-1));
  next.addEventListener("click", () => go(1));
  // Keyboard when gallery is visible/active
  document.addEventListener("keydown", (e) => {
    if (!galleryActive) return;
    if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
  });
  // Visibility via IntersectionObserver (+ focus heuristics)
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { galleryActive = en.isIntersecting; });
    }, { threshold: 0.2 });
    io.observe(section);
  }
  section.addEventListener("focusin", () => { galleryActive = true; });
  section.addEventListener("focusout", () => { galleryActive = false; });
  section.addEventListener("mouseenter", () => { galleryActive = true; });
  section.addEventListener("mouseleave", () => { galleryActive = false; });
  renderPhoto();
}
// Mobile nav toggle
function setupNav() {
  const btn = $(".nav-toggle");
  const list = byId("nav");
  if (!btn || !list) return;
  const setOpen = (open) => {
    btn.setAttribute("aria-expanded", String(open));
    if (open) list.setAttribute("data-open", "true"); else list.removeAttribute("data-open");
  };
  btn.addEventListener("click", () => setOpen(btn.getAttribute("aria-expanded") !== "true"));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setOpen(false);
  });
  $$("#nav a").forEach(a => a.addEventListener("click", () => setOpen(false)));
}
// Countdown wiring
function setupCountdowns() {
  const heroChip = byId("countdown");
  const lockChip = byId("lock-countdown");
  const update = () => {
    const now = new Date();
    const target = nextBirthdayFromAttrOrFallback(now);
    if (isOpenDay(now)) {
      if (heroChip) heroChip.textContent = "ðŸŽ‰ Itâ€™s Raghadâ€™s day!";
      if (lockChip) lockChip.textContent = fmtDiff(target - now); // for consistency if ever shown
    } else {
      if (heroChip) heroChip.textContent = fmtDiff(target - now);
      if (lockChip) lockChip.textContent = fmtDiff(target - now);
    }
    maybeTriggerConstellation(now);
  };
  update();
  setInterval(update, 1000);
}
// Smooth focus on anchor jumps for sections with tabindex
function focusTargetOnAnchor() {
  $$("a[href^='#']").forEach(a => {
    a.addEventListener("click", (e) => {
      const id = a.getAttribute("href").slice(1);
      const el = byId(id);
      if (el) {
        setTimeout(() => el.focus({ preventScroll: true }), 0);
      }
    });
  });
}
// Init
document.addEventListener("DOMContentLoaded", () => {
  checkOwnerParam();
  enableOwnerBypass();
  initConstellationOverlay();
  initCatCompanion();
  initBalloonGame();
  ensureLockout();
  setupCountdowns();
  setupPressHold();
  setupGallery();
  setupNav();
  focusTargetOnAnchor();
  applyNameShimmer();
  kickoffPreludeIfApplicable();
  // Mobile-block initialization (show overlay on narrow screens)
  try { if (typeof initMobileBlock === 'function') initMobileBlock(); } catch (e) { }
});
// Constellation overlay (post-lock celebration)
function initConstellationOverlay() {
  const overlay = byId("constellationOverlay");
  if (!overlay) {
    constellationState.done = true;
    return;
  }
  constellationState.overlay = overlay;
  constellationState.sparkles = byId("constellationSparkles");
  if (!overlay.hasAttribute("hidden")) {
    overlay.setAttribute("hidden", "");
  }
  overlay.setAttribute("aria-hidden", "true");
  constellationState.done = ownerBypassActive() || !isOpenDay();
}
function maybeTriggerConstellation(now = new Date()) {
  if (!constellationState.overlay || constellationState.done || constellationState.active) return;
  if (!isOpenDay(now)) return;
  const lock = byId("lockout");
  const lockHidden = !lock || lock.hasAttribute("hidden");
  if (!lockHidden) return;
  showConstellationOverlay();
}
function showConstellationOverlay() {
  const overlay = constellationState.overlay;
  if (!overlay || constellationState.active) return;
  constellationState.active = true;
  overlay.classList.remove("is-fading");
  overlay.removeAttribute("hidden");
  overlay.setAttribute("aria-hidden", "false");
  overlay.classList.add("is-open");
  hideCatMessage();
  try { overlay.focus(); } catch { }
  if (constellationState.sparkles && !prefersReducedMotion) {
    constellationState.sparkleTimer = window.setInterval(spawnConstellationSparkle, 340);
  }
  const keyHandler = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      hideConstellationOverlay(true);
    }
  };
  document.addEventListener("keydown", keyHandler);
  constellationState.keyHandler = keyHandler;
  const duration = prefersReducedMotion ? 5200 : 9200;
  constellationState.hideTimer = window.setTimeout(() => hideConstellationOverlay(false), duration);
}
function hideConstellationOverlay(immediate = false) {
  const overlay = constellationState.overlay;
  if (!overlay) return;
  if (constellationState.hideTimer) {
    clearTimeout(constellationState.hideTimer);
    constellationState.hideTimer = null;
  }
  if (constellationState.sparkleTimer) {
    clearInterval(constellationState.sparkleTimer);
    constellationState.sparkleTimer = null;
  }
  if (constellationState.keyHandler) {
    document.removeEventListener("keydown", constellationState.keyHandler);
    constellationState.keyHandler = null;
  }
  const finish = () => {
    overlay.classList.remove("is-open", "is-fading");
    overlay.setAttribute("aria-hidden", "true");
    overlay.setAttribute("hidden", "");
    if (constellationState.sparkles) {
      constellationState.sparkles.innerHTML = "";
    }
  };
  if (immediate) {
    finish();
  } else {
    overlay.classList.add("is-fading");
    window.setTimeout(finish, 500);
  }
  const wasPending = !constellationState.done;
  constellationState.active = false;
  constellationState.done = true;
  if (wasPending) {
    window.setTimeout(() => showCatMessage(CAT_MESSAGES.constellation, 5200), immediate ? 120 : 640);
    window.setTimeout(() => kickoffPreludeIfApplicable(), 160);
  }
}
function spawnConstellationSparkle() {
  const container = constellationState.sparkles;
  if (!container || constellationState.done) return;
  const sparkle = document.createElement("span");
  sparkle.className = "sparkle";
  sparkle.style.left = (Math.random() * 100) + '%';
  sparkle.style.animationDuration = (2.6 + Math.random() * 1.4) + 's';
  sparkle.addEventListener("animationend", () => sparkle.remove());
}
// Cat companion helper bubble
function initCatCompanion() {
  catCompanionEl = byId("catCompanion");
  if (!catCompanionEl) return;
  catBubbleEl = catCompanionEl.querySelector(".cat-companion__bubble");
  catCompanionEl.removeAttribute("hidden");
  catCompanionEl.setAttribute("aria-hidden", "true");
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && catCompanionEl.classList.contains("shown")) {
      hideCatMessage();
    }
  });
}
function showCatMessage(message, duration = 6000) {
  if (!catCompanionEl || !catBubbleEl) return;
  catBubbleEl.textContent = message;
  catCompanionEl.classList.add("shown");
  catCompanionEl.setAttribute("aria-hidden", "false");
  if (catMessageTimer) {
    clearTimeout(catMessageTimer);
  }
  catMessageTimer = window.setTimeout(() => hideCatMessage(), duration);
}
function hideCatMessage() {
  if (!catCompanionEl) return;
  if (catMessageTimer) {
    clearTimeout(catMessageTimer);
    catMessageTimer = null;
  }
  catCompanionEl.classList.remove("shown");
  catCompanionEl.setAttribute("aria-hidden", "true");
}
// Balloon mini-game before cat stage
function initBalloonGame() {
  const stage = byId("balloonGame");
  const field = byId("balloonField");
  const counter = byId("balloonCounter");
  if (!stage || !field || !counter) return;
  if (stage.dataset.ready === "1") return;
  stage.dataset.ready = "1";
  balloonState.stage = stage;
  balloonState.field = field;
  balloonState.counter = counter;
  balloonState.message = byId("balloonMessage");
  balloonState.announcer = byId("balloonAnnouncer");
  balloonState.skipBtn = byId("balloonSkip");
  stage.setAttribute("aria-hidden", "true");
  if (balloonState.skipBtn) {
    balloonState.skipBtn.addEventListener("click", (event) => {
      event.preventDefault();
      finishBalloonGame({ skipped: true });
    });
  }
  stage.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && balloonState.active) {
      event.preventDefault();
      finishBalloonGame({ skipped: true });
    }
  });
}
function startBalloonGame() {
  if (!balloonState.stage) {
    moveToCatStage();
    return;
  }
  stopBalloonGame();
  balloonState.active = true;
  balloonState.popped = 0;
  balloonState.goldenPopped = false;
  balloonState.goldSpawned = false;
  balloonState.spawnCount = 0;
  balloonState.reduce = prefersReducedMotion;
  if (balloonState.field) {
    balloonState.field.innerHTML = "";
  }
  if (balloonState.counter) {
    balloonState.counter.textContent = 'Balloons: 0/' + BALLOON_TARGET;
  }
  if (balloonState.message) {
    balloonState.message.textContent = "";
    balloonState.message.setAttribute("hidden", "");
  }
  if (balloonState.announcer) {
    balloonState.announcer.textContent = "";
  }
  balloonState.stage.classList.remove("success");
  balloonState.stage.removeAttribute("hidden");
  balloonState.stage.setAttribute("aria-hidden", "false");
  balloonState.stage.setAttribute("tabindex", "-1");
  try { balloonState.stage.focus({ preventScroll: true }); } catch { }
  if (balloonState.skipBtn) {
    balloonState.skipBtn.setAttribute("hidden", "");
    balloonState.skipBtn.setAttribute("aria-hidden", "true");
  }
  spawnBalloon();
  if (!balloonState.reduce) {
    spawnBalloon();
    balloonState.spawnTimer = window.setInterval(() => spawnBalloon(), 1400);
  } else {
    for (let i = 0; i < BALLOON_TARGET + 3; i += 1) {
      spawnBalloon(i === 0);
    }
  }
  if (balloonState.skipBtn) {
    balloonState.skipTimer = window.setTimeout(() => {
      if (!balloonState.active) return;
      balloonState.skipBtn.removeAttribute("hidden");
      balloonState.skipBtn.setAttribute("aria-hidden", "false");
      if (balloonState.announcer) balloonState.announcer.textContent = "Skip available.";
    }, 20000);
  }
}
function stopBalloonGame() {
  if (balloonState.spawnTimer) {
    clearInterval(balloonState.spawnTimer);
    balloonState.spawnTimer = null;
  }
  if (balloonState.skipTimer) {
    clearTimeout(balloonState.skipTimer);
    balloonState.skipTimer = null;
  }
  if (balloonState.field) {
    balloonState.field.querySelectorAll(".balloon, .balloon-sparkle").forEach((node) => node.remove());
  }
  if (balloonState.skipBtn) {
    balloonState.skipBtn.setAttribute("hidden", "");
    balloonState.skipBtn.setAttribute("aria-hidden", "true");
  }
  balloonState.active = false;
}
function spawnBalloon(forceGolden = false) {
  if (!balloonState.active || !balloonState.field) return null;
  if (!forceGolden && balloonState.reduce && balloonState.field.querySelectorAll(".balloon").length >= BALLOON_TARGET + 2) {
    return null;
  }
  let isGold = forceGolden;
  if (!isGold) {
    const needsGold = !balloonState.goldSpawned || (!balloonState.goldenPopped && BALLOON_TARGET - balloonState.popped <= 2);
    const chance = needsGold ? (balloonState.goldSpawned ? 0.25 : 0.4) : 0.18;
    if (Math.random() < chance) {
      isGold = true;
    }
  }
  if (!balloonState.goldSpawned && !isGold && balloonState.spawnCount > 6 && (BALLOON_TARGET - balloonState.popped) <= 3) {
    isGold = true;
  }
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = isGold ? "balloon gold" : "balloon";
  btn.setAttribute("aria-label", isGold ? "Golden balloon" : "Balloon");
  const leftPercent = Math.random() * 80 + 10;
  btn.style.left = leftPercent + '%';
  btn.style.bottom = "auto";
  btn.style.top = (Math.random() * 45 + 15) + '%';
  const drift = (Math.random() * 28 + 12) * (Math.random() > 0.5 ? 1 : -1);
  const duration = Math.random() * 4 + 11;
  btn.style.setProperty('--drift', drift + 'px');
  btn.style.setProperty('--rise-duration', duration + 's');
  btn.addEventListener("click", (event) => {
    event.preventDefault();
    popBalloon(btn);
  });
  btn.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      popBalloon(btn);
    }
  });
  balloonState.field.appendChild(btn);
  balloonState.spawnCount += 1;
  if (isGold) balloonState.goldSpawned = true;
  return btn;
}
function popBalloon(balloonEl) {
  if (!balloonState.active || !balloonEl || balloonEl.dataset.popped === "1") return;
  balloonEl.dataset.popped = "1";
  const isGold = balloonEl.classList.contains("gold");
  const fieldRect = balloonState.field.getBoundingClientRect();
  const rect = balloonEl.getBoundingClientRect();
  const left = rect.left - fieldRect.left;
  const top = rect.top - fieldRect.top;
  balloonEl.style.left = left + 'px';
  balloonEl.style.top = top + 'px';
  balloonEl.style.transform = "scale(1)";
  balloonEl.style.animation = "none";
  balloonEl.classList.add("popping");
  window.setTimeout(() => {
    if (balloonEl.parentElement) balloonEl.remove();
  }, 280);
  const centerX = left + rect.width / 2;
  const centerY = top + rect.height / 2;
  const sparkleTotal = isGold ? 5 : 4;
  for (let i = 0; i < sparkleTotal; i += 1) {
    createBalloonSparkle(centerX, centerY, isGold);
  }
  // Golden balloons count as two pops; clamp to the target so we don't exceed it
  const inc = isGold ? 2 : 1;
  balloonState.popped = Math.min(BALLOON_TARGET, balloonState.popped + inc);
  if (isGold) balloonState.goldenPopped = true;
  updateBalloonProgress();
  if (balloonState.reduce) {
    spawnBalloon(!balloonState.goldSpawned);
  }
}
function createBalloonSparkle(x, y, isGold) {
  if (prefersReducedMotion) return;
  if (!balloonState.field) return;
  const sparkle = document.createElement("span");
  sparkle.className = isGold ? "balloon-sparkle gold" : "balloon-sparkle";
  const jitterX = (Math.random() - 0.5) * 60;
  const jitterY = (Math.random() - 0.5) * 30;
  sparkle.style.left = (x + jitterX) + 'px';
  sparkle.style.top = (y + jitterY) + 'px';
  balloonState.field.appendChild(sparkle);
  sparkle.addEventListener("animationend", () => sparkle.remove());
}
function updateBalloonProgress() {
  if (balloonState.counter) {
    balloonState.counter.textContent = 'Balloons: ' + balloonState.popped + '/' + BALLOON_TARGET;
  }
  if (balloonState.announcer) {
    const goldenNote = balloonState.goldenPopped ? "" : " Need a golden balloon.";
    balloonState.announcer.textContent = 'Balloons popped ' + balloonState.popped + ' of ' + BALLOON_TARGET + '.' + goldenNote;
  }
  if (balloonState.popped >= BALLOON_TARGET) {
    if (balloonState.goldenPopped) {
      if (balloonState.message) {
        balloonState.message.textContent = "Nice! All balloons (and a golden one) are popped.";
        balloonState.message.removeAttribute("hidden");
      }
      finishBalloonGame({ skipped: false });
    } else {
      if (balloonState.message) {
        balloonState.message.textContent = "Almost there! Catch a golden balloon to continue.";
        balloonState.message.removeAttribute("hidden");
      }
      if (!balloonState.goldSpawned) {
        spawnBalloon(true);
      }
    }
  }
}
function finishBalloonGame({ skipped = false } = {}) {
  if (!balloonState.stage) return;
  const wasActive = balloonState.active;
  stopBalloonGame();
  if (skipped) {
    if (balloonState.message) {
      balloonState.message.textContent = "Mini-game skipped. Straight to the cat!";
      balloonState.message.removeAttribute("hidden");
    }
    if (balloonState.announcer) balloonState.announcer.textContent = "Mini-game skipped.";
  } else if (wasActive) {
    if (balloonState.announcer) balloonState.announcer.textContent = "Balloons cleared. Onward!";
    if (!prefersReducedMotion) {
      confettiBurst(balloonState.stage);
    }
    balloonState.stage.classList.add("success");
  }
  const delay = skipped ? 120 : 820;
  window.setTimeout(() => moveToCatStage(), delay);
}
function moveToCatStage() {
  if (balloonState.stage) {
    balloonState.stage.setAttribute("hidden", "");
    balloonState.stage.setAttribute("aria-hidden", "true");
  }
  const catStage = byId("catStage");
  if (catStage) {
    catStage.removeAttribute("hidden");
    catStage.setAttribute("aria-hidden", "false");
    catStage.setAttribute("tabindex", "-1");
    try { catStage.focus({ preventScroll: true }); } catch { }
  }
}
// Prelude (cake -> gift)
function preludeDone() {
  try { return sessionStorage.getItem(PRELUDE_FLAG) === "1"; } catch { return false; }
}
function markPreludeDone() {
  try { sessionStorage.setItem(PRELUDE_FLAG, "1"); } catch { }
}
function showPrelude() {
  const p = byId("prelude");
  if (!p) return;
  p.removeAttribute("hidden");
  p.setAttribute("aria-hidden", "false");
  startBalloonGame();
}
function hidePrelude() {
  const p = byId("prelude");
  if (!p) return;
  stopBalloonGame();
  hideCatMessage();
  p.setAttribute("hidden", "");
  p.setAttribute("aria-hidden", "true");
}
function kickoffPreludeIfApplicable() {
  const lock = byId("lockout");
  const locked = lock && !lock.hasAttribute("hidden");
  if (locked) return;
  if (!constellationState.done && !ownerBypassActive()) return;
  if (preludeDone()) return;
  if (isOpenDay() || ownerBypassActive()) {
    initBalloonGame();
    setupCatStage();
    setupGiftStage();
    showPrelude();
  }
}
// Cake stage (hold to blow)
const BLOW_HOLD_MS = 700; // hold duration to "blow"
function setupCakeStage() {
  const cakeStage = byId("cakeStage");
  if (!cakeStage) return;
  if (cakeStage.dataset.ready === "1") return;
  cakeStage.dataset.ready = "1";
  // Enable Space and Pointer hold while cake stage is active
  function enableFallbacks() {
    let spaceTimer = 0;
    let pointerTimer = 0;
    let active = true;
    const cakeEl = $("#cakeStage .cake") || cakeStage;
    const cleanup = () => {
      active = false;
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("keyup", onKey);
      if (cakeEl) {
        cakeEl.removeEventListener("pointerdown", onPointerDown);
        cakeEl.removeEventListener("pointerup", onPointerUp);
        cakeEl.removeEventListener("pointercancel", onPointerUp);
        cakeEl.removeEventListener("pointerleave", onPointerUp);
      }
    };
    const onKey = (e) => {
      if (!active) return;
      if (e.key !== " ") return;
      if (e.type === "keydown") {
        e.preventDefault();
        if (!spaceTimer) spaceTimer = window.setTimeout(() => { onCandlesBlown(); cleanup(); }, BLOW_HOLD_MS);
      } else if (e.type === "keyup") {
        if (spaceTimer) { clearTimeout(spaceTimer); spaceTimer = 0; }
      }
    };
    const onPointerDown = () => {
      if (!active) return;
      if (!pointerTimer) pointerTimer = window.setTimeout(() => { onCandlesBlown(); cleanup(); }, BLOW_HOLD_MS);
    };
    const onPointerUp = () => {
      if (pointerTimer) { clearTimeout(pointerTimer); pointerTimer = 0; }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("keyup", onKey);
    if (cakeEl) {
      cakeEl.addEventListener("pointerdown", onPointerDown);
      cakeEl.addEventListener("pointerup", onPointerUp);
      cakeEl.addEventListener("pointercancel", onPointerUp);
      cakeEl.addEventListener("pointerleave", onPointerUp);
    }
    // Return cleanup in case stage switches early
    return cleanup;
  }
  let cleanupFallbacks = null;
  function onCandlesBlown() {
    if (cleanupFallbacks) { try { cleanupFallbacks(); } catch { } }
    cakeStage.classList.add("blown");
    // After blown, progress by clicking the cake: Off -> Cut -> Gift
    const cakeEl = $("#cakeStage .cake") || cakeStage;
    const advance = () => {
      if (!cakeStage.classList.contains("cut")) {
        cakeStage.classList.add("cut");
      } else {
        if (cakeEl) cakeEl.removeEventListener("click", advance);
        gotoGiftStage();
      }
    };
    if (cakeEl) cakeEl.addEventListener("click", advance);
  }
  cleanupFallbacks = enableFallbacks();
}
function gotoGiftStage() {
  const cake = byId("cakeStage");
  const gift = byId("giftStage");
  if (cake && gift) {
    cake.setAttribute("hidden", "");
    cake.setAttribute("aria-hidden", "true");
    gift.removeAttribute("hidden");
    gift.setAttribute("aria-hidden", "false");
    gift.setAttribute("tabindex", "-1");
    try { gift.focus({ preventScroll: true }); } catch { }
    showCatMessage(CAT_MESSAGES.cake, 5200);
  }
}
function setupGiftStage() {
  const gift = byId("giftBox");
  if (!gift) return;
  if (gift.dataset.ready === "1") return;
  gift.dataset.ready = "1";
  const step = () => {
    if (!gift.classList.contains("open")) {
      gift.classList.add("open");
      try { confettiBurst(gift); } catch { }
      return;
    }
    if (!gift.classList.contains("view")) {
      gift.classList.add("view");
      return;
    }
    // finish
    markPreludeDone();
    hidePrelude();
    showCatMessage(CAT_MESSAGES.gift, 6200);
  };
  gift.addEventListener("click", step);
  gift.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); step(); } });
}
// Switch from cat stage to cake stage
function gotoCakeStage() {
  const cat = byId("catStage");
  const cake = byId("cakeStage");
  if (cat && cake) {
    cat.setAttribute("hidden", "");
    cake.removeAttribute("hidden");
    cake.setAttribute("tabindex", "-1");
    cake.focus();
    setupCakeStage();
  }
}
// Cat story (prelude first stage, static portrait only)
const CAT_DIALOGUE = [
  { t: "Meow! Hello Raghad Sulfuro asked me to guide you through this little birthday surprise." },
  { t: "I know today means a lot for you and so do you." },
  { t: "Twenty-four looks radiant on you, like gold wrapped in pink." },
  { t: "Take a second to feel it, this day is yours, shining brighter than ever." },
  { t: "Sulfuro tried his best to make something good for you so enjoy it!" },
  { t: "Alright, shall we wander over to the next step?" }
];
function setupCatStage() {
  const portrait = byId("catPortraitPrelude");
  const text = byId("storyTextPrelude");
  const nextBtn = byId("storyNextPrelude");
  const card = document.querySelector("#catStage .story-card");
  if (!portrait || !text || !nextBtn || !card) return;
  if (card.dataset.ready === "1") return;
  card.dataset.ready = "1";
  let idx = 0;
  const render = () => {
    const line = CAT_DIALOGUE[idx] || CAT_DIALOGUE[CAT_DIALOGUE.length - 1];
    text.textContent = line.t;
    portrait.src = "Pictures/Cat_Neutral.png";
    nextBtn.textContent = idx < CAT_DIALOGUE.length - 1 ? "Continue" : "To the cake";
  };
  const advance = () => {
    if (idx < CAT_DIALOGUE.length - 1) {
      idx++;
      render();
    } else {
      gotoCakeStage();
    }
  };
  render();
  nextBtn.addEventListener("click", advance);
  card.addEventListener("click", (e) => {
    if ((e.target instanceof HTMLElement) && e.target.id === "storyNextPrelude") return;
    advance();
  });
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); advance(); }
  });
}
// Typewriter for the letter
const LETTER_MESSAGE = `Dear Raghad,


Today is a special day — your day.
Finally 24, and it feels unreal how time has flown.
I may not be the best writer, but for you, on this day, I’ll do my best to find the right words.

It’s funny to think that just three months ago, I didn't know you about your existence.

At first, you seemed like just another person crossing my path.
But I quickly realized I was wrong.
Behind that first impression was someone different — someone special.
Someone kind, welcoming, caring, mature, sincere, funny...
A person who has this rare ability to make people feel comfortable and seen.
You trusted me, opened up to me, and made space for me in your world — and that means more than you probably realize. 
You're really amazing, and if I shared a lot of my life with you, it's because I felt safe and comfortable with you.
Every day, hour, second we spent talking, sharing and laughing has been a gift for me - so here mine to you.


I met you at 23, and now here you are, already stepping into 24 — another year of your life, full of new goals, new memories, and new adventures.
I hope this little surprise brings you some happiness today.
I wish I could’ve done more — but sometimes, words are the best gift we can offer.


And with these words, I just want you to know how much I appreciate you, and how grateful I am that our paths crossed.
You have this warmth that makes people feel at ease, and this light that brightens even the simplest conversations.
Thank you for your kindness, your humor, and the way you care so naturally.
You’ve made these past months so much better just by being yourself.

Happy birthday, Raghad 🎂❤️
May your 24th year be full of laughter, peace, and moments that make you feel as special as you truly are.
Keep smiling, keep being you — because that’s already more than enough.

PS: Forget all the bad stuff, you’re perfect just the way you are.

- فضيل -`;
let typingState = { running: false, idx: 0, timer: 0 };
function startTypingLetter() {
  const area = byId("letterText") || byId("letterBody");
  if (!area) return;
  // Respect motion preferences
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) {
    area.textContent = LETTER_MESSAGE;
    return;
  }
  area.textContent = "";
  typingState = { running: true, idx: 0, timer: 0 };
  const tick = () => {
    if (!typingState.running) return;
    // Type one char at a time with natural pauses
    const next = Math.min(LETTER_MESSAGE.length, typingState.idx + 1);
    area.textContent = LETTER_MESSAGE.slice(0, next);
    const ch = LETTER_MESSAGE[typingState.idx];
    typingState.idx = next;
    if (typingState.idx >= LETTER_MESSAGE.length) {
      typingState.running = false;
      return;
    }
    let delay;
    if (ch === "\n") {
      delay = 260 + Math.floor(Math.random() * 160); // paragraph pause
    } else if (/[\.\!\?]/.test(ch)) {
      delay = 160 + Math.floor(Math.random() * 120); // sentence pause
    } else if (/[\,\;\:]/.test(ch)) {
      delay = 100 + Math.floor(Math.random() * 80); // clause pause
    } else {
      delay = 35 + Math.floor(Math.random() * 35); // base pace ~14â€“29 cps
    }
    typingState.timer = window.setTimeout(tick, delay);
  };
  tick();
}
function applyNameShimmer() {
  const h = byId('hero-title');
  if (!h) return;
  if (!h.querySelector('.shimmer-name')) {
    h.innerHTML = h.innerHTML.replace('Raghad', '<span class="shimmer-name">Raghad</span>');
  }
}