"use strict";

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

document.addEventListener("DOMContentLoaded", () => {
  const chip = document.getElementById("countdown");
  const update = () => {
    const now = new Date();
    const target = nextTarget(now);
    if (!chip) return;
    if (isOpenDay(now)) chip.textContent = "🎉 It’s Raghad’s day!";
    else chip.textContent = fmtDiff(target - now);
  };
  update();
  setInterval(update, 1000);
});

