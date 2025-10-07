"use strict";

const SECRET_CODE = "2410";

function getTargetMonthDay() {
  const attr = document.body.getAttribute("data-birthday");
  if (attr) {
    const d = new Date(attr);
    if (!isNaN(d)) return { month: d.getMonth(), day: d.getDate() };
  }
  return { month: 9, day: 14 }; // October 14 (0-based month)
}

function isOpenDay(now = new Date()) {
  const { month, day } = getTargetMonthDay();
  return now.getMonth() === month && now.getDate() === day;
}

function nextTarget(now = new Date()) {
  const { month, day } = getTargetMonthDay();
  const y = now.getFullYear();
  let t = new Date(y, month, day, 0, 0, 0, 0);
  if (isOpenDay(now) || now > t) t = new Date(y + 1, month, day, 0, 0, 0, 0);
  return t;
}

function fmtDiff(ms) {
  let s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  const sec = s;
  return `${d}d ${h}h ${m}m ${sec}s`;
}

function setupUnlockForm() {
  const form = document.getElementById("unlockForm");
  const input = document.getElementById("unlockCode");
  const status = document.getElementById("unlockStatus");
  if (!form || !input) return;

  const clearStatus = () => {
    if (!status) return;
    status.textContent = "";
    status.classList.remove("error");
    status.classList.remove("success");
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const code = (input.value || "").trim();
    if (!code) {
      if (status) {
        status.textContent = "Enter the four digits.";
        status.classList.remove("success");
        status.classList.add("error");
      }
      return;
    }
    if (code === SECRET_CODE) {
      if (status) {
        status.textContent = "Unlocked! Redirecting...";
        status.classList.remove("error");
        status.classList.add("success");
      }
      try {
        sessionStorage.setItem("r24-owner", "1");
        sessionStorage.removeItem("r24-prelude");
      } catch {}
      window.setTimeout(() => {
        window.location.href = "surprise.html";
      }, 320);
    } else {
      if (status) {
        status.textContent = "Almost. Try again.";
        status.classList.remove("success");
        status.classList.add("error");
      }
      input.value = "";
      input.focus();
    }
  });

  input.addEventListener("input", () => {
    input.value = input.value.replace(/[^0-9]/g, "").slice(0, 4);
    clearStatus();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setupUnlockForm();
  const chip = document.getElementById("countdown");
  const bypass = localStorage.getItem("bypass") === "true" || sessionStorage.getItem("r24-owner") === "1";
  const now = new Date();
  if (isOpenDay(now) || bypass) {
    window.location.href = "surprise.html";
    return;
  }
  const update = () => {
    const current = new Date();
    const target = nextTarget(current);
    if (!chip) return;
    if (isOpenDay(current)) {
      chip.textContent = "It's Raghad's day!";
    } else {
      chip.textContent = fmtDiff(target - current);
    }
  };
  update();
  setInterval(update, 1000);
  // Mobile block behavior for lock page
  (function initMobileBlockLocked(){
    try {
      const el = document.getElementById('mobileBlock');
      const btn = document.getElementById('mobileBlockDismiss');
      if (!el) return;
      const bypass = sessionStorage.getItem('mobileBypass') === '1';
      if (!bypass && window.innerWidth < 768) {
        el.removeAttribute('hidden'); el.setAttribute('aria-hidden','false');
        document.documentElement.style.overflow = 'hidden'; document.body.style.overflow = 'hidden';
      }
      if (btn) btn.addEventListener('click', () => { try { sessionStorage.setItem('mobileBypass','1'); } catch{}; el.setAttribute('hidden',''); el.setAttribute('aria-hidden','true'); document.documentElement.style.overflow=''; document.body.style.overflow=''; });
      window.addEventListener('resize', () => {
        if (!el) return;
  if (sessionStorage.getItem('mobileBypass') === '1') { el.setAttribute('hidden',''); el.setAttribute('aria-hidden','true'); return; }
  if (window.innerWidth < 768) { el.removeAttribute('hidden'); el.setAttribute('aria-hidden','false'); } else { el.setAttribute('hidden',''); el.setAttribute('aria-hidden','true'); }
      });
    } catch (e) {}
  })();
});





