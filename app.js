/* app.js — 365DAY (без фото дня, swipe карточки, прогресс бары, 60+ достижений, mobile-first)
   ВАЖНО: использую те же id/классы/атрибуты что ты просила.
*/

(() => {
  "use strict";

  /* =========================
     0) Helpers
  ========================== */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const pad2 = (n) => String(n).padStart(2, "0");
  const toInt = (v, fallback = 0) => {
    const n = Number.parseInt(String(v), 10);
    return Number.isFinite(n) ? n : fallback;
  };

  const uid = () =>
    (globalThis.crypto?.randomUUID
      ? globalThis.crypto.randomUUID()
      : `id_${Date.now()}_${Math.random().toString(16).slice(2)}`);

  const show = (el) => { if (el) el.hidden = false; };
  const hide = (el) => { if (el) el.hidden = true; };

  // iPhone-safe local date string (NO UTC shift)
  const localISO = (d = new Date()) => {
    const y = d.getFullYear();
    const m = pad2(d.getMonth() + 1);
    const day = pad2(d.getDate());
    return `${y}-${m}-${day}`;
  };

  const addDaysISO = (iso, days) => {
    const [y, m, d] = iso.split("-").map((x) => toInt(x, 0));
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + days);
    return localISO(dt);
  };

  const diffDays = (isoA, isoB) => {
    const [y1, m1, d1] = isoA.split("-").map((x) => toInt(x, 0));
    const [y2, m2, d2] = isoB.split("-").map((x) => toInt(x, 0));
    const a = new Date(y1, m1 - 1, d1).getTime();
    const b = new Date(y2, m2 - 1, d2).getTime();
    return Math.floor((a - b) / 86400000);
  };

  const monthIndexFromStart = (startISO, currentISO) => {
    const [sy, sm] = startISO.split("-").map((x) => toInt(x, 0));
    const [cy, cm] = currentISO.split("-").map((x) => toInt(x, 0));
    const m = (cy - sy) * 12 + (cm - sm);
    return clamp(m, 0, 11);
  };

  const formatDateFancy = (iso) => {
    const [y, m, d] = iso.split("-").map((x) => toInt(x, 0));
    const dt = new Date(y, m - 1, d);

    const dd = pad2(dt.getDate());
    const mm = pad2(dt.getMonth() + 1);
    const yyyy = dt.getFullYear();

    const months = [
      "января","февраля","марта","апреля","мая","июня",
      "июля","августа","сентября","октября","ноября","декабря"
    ];
    const weekdays = ["вс","пн","вт","ср","чт","пт","сб"];
    const pretty = `${dt.getDate()} ${months[dt.getMonth()]} (${weekdays[dt.getDay()]})`;
    return `${dd}.${mm}.${yyyy} — ${pretty}`;
  };

  const escapeHTML = (s) =>
    String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const toast = (msg) => { if (msg) alert(msg); };

  /* =========================
     0.1) Sounds (optional)
  ========================== */
  const audio = {
    click: new Audio("./assets/click.mp3"),
    success: new Audio("success.mp3"),
    error: new Audio("./assets/error.mp3"),
  };
  let soundUnlocked = false;

  const playSound = async (which = "click") => {
    const a = audio[which];
    if (!a) return;
    try {
      a.currentTime = 0;
      await a.play();
    } catch {
      // ignore (iOS блок до жеста)
    }
  };

  const unlockSound = async () => {
    if (soundUnlocked) return;
    soundUnlocked = true;
    try {
      await playSound("click");
      audio.click.pause();
      audio.click.currentTime = 0;
    } catch {}
  };

  /* =========================
     1) Storage / State
  ========================== */
  const STORAGE_KEY = "challenge365_state_v6_nophoto";

  const DEFAULT_RANKS = [
    "Начало 🚀","Уверенность 💪","Дисциплина 🧠","Сила 🔥",
    "Стабильность 🧱","Фокус 🎯","Скорость ⚡","Мастерство 🛠️",
    "Победа 🏆","Легенда 🐉","Совершенство 💎","Идеал 🌟"
  ];

  const DEFAULT_START_DATE = "2026-01-20";
  const DEFAULT_LEVEL = 20;

  const defaultState = () => {
    const today = localISO(new Date());
    return {
      version: 6,
      createdAt: Date.now(),

      settings: {
        startDate: DEFAULT_START_DATE,
        dailyBonus: 20,
        waterGoalMl: 2500,
        caloriesGoal: 2500,
        
        // чтобы старт был "День 20/365"
        dayOffset: 19,
      },

      economy: { STAR: 0 },

      streak: { current: 0, best: 0, lastClosedISO: "" },
      level: { value: DEFAULT_LEVEL, lastLevelCheckISO: "" },
      rank: { currentIndex: 0, names: DEFAULT_RANKS.slice(), awarded: Array(12).fill(false) },

      days: {}, // iso -> day

      goals: [],     // [{id,title,total,current}]
      templates: [], // [{id,name,tasks:[{title,reward}]}]

      shop: {
        items: [
          { id: uid(), emoji: "🍩", name: "Покушать сладкое", price: 700, photo: "" },
          { id: uid(), emoji: "🍕", name: "Любимая еда", price: 100, photo: "" },
          { id: uid(), emoji: "📱", name: "Залипнуть в телефон", price: 900, photo: "" },
          { id: uid(), emoji: "🧁", name: "Любой десерт", price: 500, photo: "" },
          { id: uid(), emoji: "🛌", name: "Полный чилл без чувства вины", price: 2000, photo: "" },
        ],
        currentIndex: 0,
        history: [],
      },

      achievementsState: {}, // id -> {unlocked, ts}
      audit: [],

      meta: { lastOpenISO: today },
    };
  };

  let state = null;

  const loadState = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return defaultState();

      const base = defaultState();
      const s = parsed;

      s.version ??= base.version;
      s.createdAt ??= base.createdAt;

      s.settings ??= base.settings;
      s.settings.startDate ??= base.settings.startDate;
      s.settings.dailyBonus ??= base.settings.dailyBonus;
      s.settings.waterGoalMl ??= base.settings.waterGoalMl;
      s.settings.caloriesGoal ??= base.settings.caloriesGoal;
      s.settings.dayOffset ??= base.settings.dayOffset ?? 19;


      s.economy ??= base.economy;
      s.economy.STAR ??= 0;

      s.streak ??= base.streak;

      s.level ??= base.level;
      s.level.value ??= base.level.value;
      s.level.lastLevelCheckISO ??= "";

      s.rank ??= base.rank;
      s.rank.names ??= DEFAULT_RANKS.slice();
      s.rank.awarded ??= Array(12).fill(false);
      s.rank.currentIndex ??= 0;

      s.days ??= {};
      s.goals ??= [];
      s.templates ??= [];

      s.shop ??= base.shop;
      s.shop.items ??= base.shop.items.slice();
      s.shop.history ??= [];
      s.shop.currentIndex ??= 0;

      s.achievementsState ??= {};
      s.audit ??= [];

      s.meta ??= base.meta;
      s.meta.lastOpenISO ??= base.meta.lastOpenISO;

      if (toInt(s.level.value, 0) < 20) s.level.value = 20;

      return s;
    } catch {
      return defaultState();
    }
  };

  const saveState = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error(e);
      toast("⚠️ Не удалось сохранить данные (переполнено хранилище?).");
    }
  };

  const pushAudit = ({ type, amount = 0, reason = "", meta = {} }) => {
    const iso = localISO(new Date());
    state.audit.unshift({
      id: uid(),
      ts: Date.now(),
      iso,
      type,
      amount: toInt(amount, 0),
      reason,
      meta,
    });
    if (state.audit.length > 600) state.audit.length = 600;
  };

  /* =========================
     2) Day model
  ========================== */
  const makeEmptyDay = (iso, dayNumber) => ({
    iso,
    dayNumber,
    tasks: [], // [{id,title,reward,status}]
    closed: false,
    dailyBonusTaken: false,
    levelGranted: false,

    waterMl: 0,
    calories: { log: [] }, // [{id,kcal,ts}]
  });

  const getCurrentISO = () => localISO(new Date());

  const getDayNumberForISO = (iso) => {
    const start = state.settings.startDate;
     // смещение (чтобы старт был не 1, а 20)
  const offset = toInt(state.settings.dayOffset, 19);

  let n = diffDays(iso, start) + 1 + offset;
  return clamp(n, 1, 365);
  };

  const ensureDay = (iso) => {
    const n = getDayNumberForISO(iso);
    if (!state.days[iso]) {
      state.days[iso] = makeEmptyDay(iso, n);
    } else {
      const d = state.days[iso];
      d.iso ??= iso;
      d.dayNumber = n;
      d.tasks ??= [];
      d.closed ??= false;
      d.dailyBonusTaken ??= !!d.dailyBonusTaken;
      d.levelGranted ??= !!d.levelGranted;
      d.waterMl ??= 0;
      d.calories ??= { log: [] };
      d.calories.log ??= [];
    }
    return state.days[iso];
  };

  const getTodayDay = () => ensureDay(getCurrentISO());

  /* =========================
     3) Economy
  ========================== */
  const addStars = (amount, reason, meta = {}) => {
    amount = toInt(amount, 0);
    if (amount <= 0) return;
    state.economy.STAR = Math.max(0, toInt(state.economy.STAR, 0) + amount);
    pushAudit({ type: "earn", amount, reason, meta });
  };

  const spendStars = (amount, reason, meta = {}) => {
    amount = toInt(amount, 0);
    if (amount <= 0) return true;
    const bal = toInt(state.economy.STAR, 0);
    if (bal < amount) return false;
    state.economy.STAR = bal - amount;
    pushAudit({ type: "spend", amount, reason, meta });
    return true;
  };

  /* =========================
     4) Rank / Level / Day header
  ========================== */
  const updateRankIfNeeded = () => {
    const todayISO = getCurrentISO();
    const idx = monthIndexFromStart(state.settings.startDate, todayISO);
    const prev = toInt(state.rank.currentIndex, 0);

    if (idx !== prev) {
      state.rank.currentIndex = idx;
      if (!state.rank.awarded[idx]) {
        state.rank.awarded[idx] = true;
        addStars(500, "Новый ранг", { rankIndex: idx, rankName: state.rank.names[idx] });
      }
    }
  };

  const grantLevelIfClosedDay = (isoClosed) => {
    const d = ensureDay(isoClosed);
    if (d.closed && !d.levelGranted) {
      state.level.value = clamp(toInt(state.level.value, 20) + 1, 1, 365);
      d.levelGranted = true;
      pushAudit({ type: "level_up", amount: 0, reason: "Уровень повышен (закрыт день)", meta: { iso: isoClosed } });
    }
  };

  const checkMidnightLevel = () => {
    const todayISO = getCurrentISO();
    const lastCheck = state.level.lastLevelCheckISO || state.meta.lastOpenISO || todayISO;
    if (lastCheck === todayISO) return;

    let cur = lastCheck;
    let safety = 0;
    while (cur !== todayISO) {
      // если день cur был закрыт, но levelGranted не поставили — выдать
      grantLevelIfClosedDay(cur);
      cur = addDaysISO(cur, 1);
      if (++safety > 400) break;
    }
    state.level.lastLevelCheckISO = todayISO;
  };

  /* =========================
     5) Tasks / Bonus / Progress
  ========================== */
  const statusEmoji = (status) => {
    if (status === "done") return "✅";
    if (status === "fail") return "🚫";
    return "⬜";
  };

  const calcTasksDone = (day) => {
    const total = day.tasks.length;
    const done = day.tasks.filter((t) => t.status === "done").length;
    return { done, total };
  };

  const calcEarnedToday = (day) => {
    const fromTasks = day.tasks.reduce((s, t) => s + (t.status === "done" ? toInt(t.reward, 0) : 0), 0);
    const bonus = day.dailyBonusTaken ? toInt(state.settings.dailyBonus, 20) : 0;
    return { fromTasks, bonus, total: fromTasks + bonus };
  };

  const calcPotentialToday = (day) => {
    const tasksPotential = day.tasks.reduce((s, t) => s + toInt(t.reward, 0), 0);
    const bonus = toInt(state.settings.dailyBonus, 20);
    return { tasksPotential, bonus, total: tasksPotential + bonus };
  };

  const shouldShowClaimBonus = (day) => {
    if (day.dailyBonusTaken) return false;
    if (!day.tasks.length) return false;
    return day.tasks.every((t) => t.status === "done");
  };

  const applyTaskStatusChangeEconomy = (day, task, newStatus) => {
    const old = task.status;
    if (old === newStatus) return;

    const reward = toInt(task.reward, 0);

    if (newStatus === "done" && old !== "done") {
      addStars(reward, "Задача выполнена", { iso: day.iso, taskId: task.id });
    }

    if (old === "done" && newStatus !== "done") {
      const ok = spendStars(reward, "Откат: задача больше не выполнена", { iso: day.iso, taskId: task.id });
      if (!ok) {
        // мягкая коррекция
        state.economy.STAR = Math.max(0, toInt(state.economy.STAR, 0) - reward);
        pushAudit({ type: "adjust", amount: -reward, reason: "Коррекция отката", meta: { iso: day.iso, taskId: task.id } });
      }
    }

    task.status = newStatus;
  };

  const deleteTaskWithRollback = (day, taskId) => {
    const idx = day.tasks.findIndex((t) => t.id === taskId);
    if (idx < 0) return;
    const task = day.tasks[idx];
    const reward = toInt(task.reward, 0);

    if (task.status === "done") {
      const ok = spendStars(reward, "Откат: удалена выполненная задача", { iso: day.iso, taskId });
      if (!ok) {
        state.economy.STAR = Math.max(0, toInt(state.economy.STAR, 0) - reward);
        pushAudit({ type: "adjust", amount: -reward, reason: "Коррекция удаления", meta: { iso: day.iso, taskId } });
      }
    }

    day.tasks.splice(idx, 1);
  };

  const claimDailyBonus = (day) => {
    if (!shouldShowClaimBonus(day)) return false;

    const bonus = toInt(state.settings.dailyBonus, 20);
    addStars(bonus, "Бонус дня", { iso: day.iso });

    day.dailyBonusTaken = true;
    day.closed = true;

    // streak
    const yesterdayISO = addDaysISO(day.iso, -1);
    if (state.streak.lastClosedISO === yesterdayISO || state.streak.lastClosedISO === "") {
      state.streak.current = toInt(state.streak.current, 0) + 1;
    } else {
      state.streak.current = 1;
    }
    state.streak.best = Math.max(toInt(state.streak.best, 0), state.streak.current);
    state.streak.lastClosedISO = day.iso;

    pushAudit({ type: "day_closed", amount: bonus, reason: "День закрыт", meta: { iso: day.iso, streak: state.streak.current } });

    // level up immediately (once per day)
    if (!day.levelGranted) {
      state.level.value = clamp(toInt(state.level.value, 20) + 1, 1, 365);
      day.levelGranted = true;
      pushAudit({ type: "level_up", amount: 0, reason: "Уровень повышен", meta: { iso: day.iso, newLevel: state.level.value } });
    }

    return true;
  };

  /* =========================
     6) Water / Calories
  ========================== */
  const addWater = (day, ml) => {
    ml = toInt(ml, 0);
    if (ml <= 0) return;
    day.waterMl = Math.max(0, toInt(day.waterMl, 0) + ml);
  };

  const resetWater = (day) => { day.waterMl = 0; };

  const caloriesTotal = (day) => (day.calories.log || []).reduce((s, e) => s + toInt(e.kcal, 0), 0);

  const addCalories = (day, kcal) => {
    kcal = toInt(kcal, 0);
    if (kcal <= 0) return;
    day.calories.log.unshift({ id: uid(), kcal, ts: Date.now() });
    if (day.calories.log.length > 250) day.calories.log.length = 250;
  };

  const editCalories = (day, entryId, newKcal) => {
    newKcal = toInt(newKcal, 0);
    if (newKcal <= 0) return false;
    const e = day.calories.log.find((x) => x.id === entryId);
    if (!e) return false;
    e.kcal = newKcal;
    return true;
  };

  const deleteCalories = (day, entryId) => {
    const idx = day.calories.log.findIndex((x) => x.id === entryId);
    if (idx < 0) return false;
    day.calories.log.splice(idx, 1);
    return true;
  };

  const resetCalories = (day) => { day.calories.log = []; };

  /* =========================
     7) Goals
  ========================== */
  const createGoal = (title, total, current) => {
    title = String(title || "").trim();
    total = toInt(total, 0);
    current = toInt(current, 0);
    if (!title) return false;
    if (total <= 0) return false;
    current = clamp(current, 0, total);

    state.goals.unshift({ id: uid(), title, total, current });
    if (state.goals.length > 300) state.goals.length = 300;
    return true;
  };

  const editGoal = (goalId, title, total, current) => {
    const g = state.goals.find((x) => x.id === goalId);
    if (!g) return false;

    title = String(title || "").trim() || g.title;
    total = toInt(total, g.total);
    if (total <= 0) total = g.total;
    current = clamp(toInt(current, g.current), 0, total);

    g.title = title;
    g.total = total;
    g.current = current;
    return true;
  };

  const deleteGoal = (goalId) => {
    const before = state.goals.length;
    state.goals = state.goals.filter((g) => g.id !== goalId);
    return state.goals.length !== before;
  };

  /* =========================
     8) Templates
  ========================== */
  const createTemplate = (name, tasksText) => {
    name = String(name || "").trim();
    const lines = String(tasksText || "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    if (!name || !lines.length) return false;

    const tasks = lines.map((title) => ({ title, reward: 10 }));
    state.templates.unshift({ id: uid(), name, tasks });
    if (state.templates.length > 250) state.templates.length = 250;
    return true;
  };

  const applyTemplateToISO = (templateId, iso) => {
    const tpl = state.templates.find((t) => t.id === templateId);
    if (!tpl) return false;
    const day = ensureDay(iso);

    for (const t of tpl.tasks) {
      day.tasks.push({ id: uid(), title: t.title, reward: toInt(t.reward, 10), status: "progress" });
    }
    return true;
  };

  /* =========================
     9) Shop
  ========================== */
  const shopCurrentItem = () => {
    const items = state.shop.items || [];
    if (!items.length) return null;
    const idx = clamp(toInt(state.shop.currentIndex, 0), 0, items.length - 1);
    state.shop.currentIndex = idx;
    return items[idx];
  };

  const shopNext = () => {
    const items = state.shop.items || [];
    if (!items.length) return;
    state.shop.currentIndex = (toInt(state.shop.currentIndex, 0) + 1) % items.length;
  };

  const shopPrev = () => {
    const items = state.shop.items || [];
    if (!items.length) return;
    const n = items.length;
    state.shop.currentIndex = (toInt(state.shop.currentIndex, 0) - 1 + n) % n;
  };

  const shopBuy = () => {
    const item = shopCurrentItem();
    if (!item) return { ok: false, msg: "Нет товаров" };

    const price = toInt(item.price, 0);
    const ok = spendStars(price, "Обмен в магазине", { itemId: item.id, name: item.name });
    if (!ok) return { ok: false, msg: "Недостаточно бонусов ⭐" };

    state.shop.history.unshift({
      id: uid(),
      itemId: item.id,
      name: item.name,
      price,
      iso: getCurrentISO(),
      ts: Date.now(),
    });
    if (state.shop.history.length > 80) state.shop.history.length = 80;

    return { ok: true, msg: "✅ Обмен успешен" };
  };

  /* =========================
     10) Drawer nav + Cards + Swipe
  ========================== */
  const drawer = $("#drawer");
  const backdrop = $("#backdrop");

  const openDrawer = () => {
    drawer?.classList.add("is-open");
    if (backdrop) {
      backdrop.hidden = false;
      backdrop.setAttribute("aria-hidden", "false");
    }
    drawer?.setAttribute("aria-hidden", "false");
  };

  const closeDrawer = () => {
    drawer?.classList.remove("is-open");
    if (backdrop) {
      backdrop.hidden = true;
      backdrop.setAttribute("aria-hidden", "true");
    }
    drawer?.setAttribute("aria-hidden", "true");
  };

  const allCards = () => $$(".card");
  let cardKeys = [];
  let activeKey = "home";

  const rebuildCardKeys = () => {
    cardKeys = allCards()
      .map((c) => c.getAttribute("data-screen"))
      .filter(Boolean);

    if (!cardKeys.length) cardKeys = ["home"];
    if (!cardKeys.includes(activeKey)) activeKey = cardKeys[0];
  };

  const showOnlyKey = (key) => {
    for (const c of allCards()) {
      const k = c.getAttribute("data-screen");
      c.classList.toggle("is-active", k === key);
      c.hidden = k !== key;
    }
  };

  const animateSwitch = (nextKey, dir /* "left" | "right" */) => {
    if (!nextKey || nextKey === activeKey) return;

    const cards = allCards();
    const current = cards.find((c) => c.getAttribute("data-screen") === activeKey);
    const next = cards.find((c) => c.getAttribute("data-screen") === nextKey);
    if (!next) return;

    next.hidden = false;
    next.classList.add("is-active");

    const wipe = (el) => {
      if (!el) return;
      el.classList.remove("anim-out-left","anim-out-right","anim-in-left","anim-in-right");
    };
    wipe(current); wipe(next);

    const outClass = dir === "left" ? "anim-out-left" : "anim-out-right";
    const inClass  = dir === "left" ? "anim-in-right" : "anim-in-left";

    current?.classList.add(outClass);
    next.classList.add(inClass);

    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;

      current?.classList.remove("is-active");
      if (current) current.hidden = true;
      wipe(current); wipe(next);

      activeKey = nextKey;
      showOnlyKey(activeKey);
      renderAll();
      saveState();
      updateArrowDisabled();
    };

    const t = setTimeout(done, 320);
    next.addEventListener("animationend", () => {
      clearTimeout(t);
      done();
    }, { once: true });
  };

  const indexOfKey = (key) => {
    const i = cardKeys.indexOf(key);
    return i >= 0 ? i : 0;
  };

  const goPrev = () => {
    const i = indexOfKey(activeKey);
    const nextI = clamp(i - 1, 0, cardKeys.length - 1);
    animateSwitch(cardKeys[nextI], "left");
  };

  const goNext = () => {
    const i = indexOfKey(activeKey);
    const nextI = clamp(i + 1, 0, cardKeys.length - 1);
    animateSwitch(cardKeys[nextI], "right");
  };

  const goToKey = (key) => {
    if (!cardKeys.includes(key)) key = cardKeys[0] || "home";
    const from = indexOfKey(activeKey);
    const to = indexOfKey(key);
    const dir = to >= from ? "right" : "left";
    animateSwitch(key, dir);
  };

  const updateArrowDisabled = () => {
    const i = indexOfKey(activeKey);
    const prevBtn = $("#btnPrevCard");
    const nextBtn = $("#btnNextCard");
    if (prevBtn) prevBtn.disabled = i <= 0;
    if (nextBtn) nextBtn.disabled = i >= cardKeys.length - 1;
  };

  const setupSwipe = () => {
    let startX = 0;
    let startY = 0;
    let isDown = false;

    const stage = $(".cardstage") || document.body;

    const onDown = (ev) => {
      const t = ev.touches ? ev.touches[0] : ev;
      startX = t.clientX;
      startY = t.clientY;
      isDown = true;
    };

    const onUp = (ev) => {
      if (!isDown) return;
      isDown = false;

      const t = ev.changedTouches ? ev.changedTouches[0] : ev;
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;

      if (Math.abs(dy) > Math.abs(dx)) return;

      const TH = 40;
      if (dx > TH) { playSound("click"); goPrev(); }
      else if (dx < -TH) { playSound("click"); goNext(); }
    };

    stage.addEventListener("touchstart", onDown, { passive: true });
    stage.addEventListener("touchend", onUp, { passive: true });
    stage.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
  };

  /* =========================
     11) Progress helpers
========================= */
  const setFillWidth = (sel, pct) => {
    const el = $(sel);
    if (el) el.style.width = `${clamp(pct, 0, 100)}%`;
  };

  const setFillByData = (key, pct) => {
    const el = $(`.fill[data-fill="${key}"]`);
    if (el) el.style.width = `${clamp(pct, 0, 100)}%`;
  };

  const setText = (sel, text) => {
    const el = $(sel);
    if (el) el.textContent = String(text ?? "");
  };

  /* =========================
     12) Achievements 60+ (как было: простые карточки)
========================= */
  const totalEarned = () => (state.audit || []).filter((a) => a.type === "earn").reduce((s, a) => s + toInt(a.amount, 0), 0);
  const totalSpent = () => (state.audit || []).filter((a) => a.type === "spend").reduce((s, a) => s + toInt(a.amount, 0), 0);

  const countTotalTasksDone = () => {
    let sum = 0;
    for (const iso in state.days) {
      const d = state.days[iso];
      sum += (d?.tasks || []).filter((t) => t.status === "done").length;
    }
    return sum;
  };

  const countClosedDays = () => Object.values(state.days || {}).filter((d) => !!d?.closed).length;

  const bestStreak = () => toInt(state.streak.best, 0);

  const achievementsFactory = () => {
    // 12 * 6 = 72 + общие (будет >60)
    const monthArr = [];
    for (let m = 1; m <= 12; m++) {
      const mm = m - 1;
      monthArr.push(
        {
          id: `m${m}_open`,
          title: `📅 Месяц ${m}: старт`,
          desc: `Открой приложение в ${m}-м месяце марафона`,
          check: () => monthIndexFromStart(state.settings.startDate, getCurrentISO()) >= mm,
        },
        {
          id: `m${m}_closed3`,
          title: `✅ Месяц ${m}: 3 закрытых дня`,
          desc: `Закрой 3 дня суммарно (в течение месяца)`,
          check: () => countClosedDays() >= m * 3,
        },
        {
          id: `m${m}_tasks30`,
          title: `⭐ Месяц ${m}: 30 задач`,
          desc: `Выполни суммарно ${m * 30} задач`,
          check: () => countTotalTasksDone() >= m * 30,
        },
        {
          id: `m${m}_stars1000`,
          title: `💰 Месяц ${m}: 1000⭐`,
          desc: `Заработай суммарно ${m * 1000}⭐`,
          check: () => totalEarned() >= m * 1000,
        },
        {
          id: `m${m}_streak5`,
          title: `🔥 Месяц ${m}: streak 5+`,
          desc: `Достигни streak 5+`,
          check: () => bestStreak() >= 5,
        },
        {
          id: `m${m}_waterGoal`,
          title: `💧 Месяц ${m}: вода`,
          desc: `Хотя бы раз выпей норму воды`,
          check: () => {
            const goal = toInt(state.settings.waterGoalMl, 2500);
            return Object.values(state.days || {}).some((d) => toInt(d?.waterMl, 0) >= goal);
          },
        }
      );
    }

    const common = [
      { id: "closed_1", title: "🎁 Первый закрытый день", desc: "Закрой 1 день", check: () => countClosedDays() >= 1 },
      { id: "closed_10", title: "🎁 10 закрытых дней", desc: "Закрой 10 дней", check: () => countClosedDays() >= 10 },
      { id: "closed_30", title: "🏆 30 закрытых дней", desc: "Закрой 30 дней", check: () => countClosedDays() >= 30 },
      { id: "closed_60", title: "🏆 60 закрытых дней", desc: "Закрой 60 дней", check: () => countClosedDays() >= 60 },

      { id: "tasks_10", title: "✅ 10 задач", desc: "Выполни 10 задач", check: () => countTotalTasksDone() >= 10 },
      { id: "tasks_50", title: "✅ 50 задач", desc: "Выполни 50 задач", check: () => countTotalTasksDone() >= 50 },
      { id: "tasks_100", title: "✅ 100 задач", desc: "Выполни 100 задач", check: () => countTotalTasksDone() >= 100 },
      { id: "tasks_300", title: "✅ 300 задач", desc: "Выполни 300 задач", check: () => countTotalTasksDone() >= 300 },

      { id: "stars_1000", title: "⭐ 1000 бонусов", desc: "Заработай 1000⭐", check: () => totalEarned() >= 1000 },
      { id: "stars_5000", title: "⭐ 5000 бонусов", desc: "Заработай 5000⭐", check: () => totalEarned() >= 5000 },
      { id: "stars_10000", title: "⭐ 10000 бонусов", desc: "Заработай 10000⭐", check: () => totalEarned() >= 10000 },

      { id: "streak_3", title: "🔥 Streak 3", desc: "Закрой 3 дня подряд", check: () => bestStreak() >= 3 },
      { id: "streak_7", title: "🔥 Streak 7", desc: "Закрой 7 дней подряд", check: () => bestStreak() >= 7 },
      { id: "streak_21", title: "🔥 Streak 21", desc: "Закрой 21 день подряд", check: () => bestStreak() >= 21 },

      { id: "level_25", title: "🆙 Уровень 25", desc: "Достигни уровня 25", check: () => toInt(state.level.value, 20) >= 25 },
      { id: "level_50", title: "🆙 Уровень 50", desc: "Достигни уровня 50", check: () => toInt(state.level.value, 20) >= 50 },

      { id: "goal_1", title: "🎯 Первая цель", desc: "Создай 1 цель", check: () => (state.goals || []).length >= 1 },
      { id: "goal_done", title: "🏁 Цель достигнута", desc: "Доведи любую цель до 100%", check: () => (state.goals || []).some((g) => toInt(g.current, 0) >= toInt(g.total, 1)) },

      { id: "shop_1", title: "🛍 Первый обмен", desc: "Сделай 1 обмен в магазине", check: () => (state.shop.history || []).length >= 1 },
      { id: "shop_10", title: "🛍 10 обменов", desc: "Сделай 10 обменов", check: () => (state.shop.history || []).length >= 10 },

      { id: "water_today", title: "💧 Вода сегодня", desc: "Выпей дневную норму воды сегодня", check: () => toInt(getTodayDay().waterMl, 0) >= toInt(state.settings.waterGoalMl, 2500) },
    ];

    return [...common, ...monthArr];
  };

  let ACHIEVEMENTS = [];

  const updateAchievements = () => {
    state.achievementsState ??= {};
    ACHIEVEMENTS = achievementsFactory();

    for (const a of ACHIEVEMENTS) {
      const unlockedNow = !!a.check();
      const prev = !!state.achievementsState[a.id]?.unlocked;

      if (unlockedNow && !prev) {
        state.achievementsState[a.id] = { unlocked: true, ts: Date.now() };
        pushAudit({ type: "achievement", amount: 0, reason: "Достижение", meta: { id: a.id, title: a.title } });
        playSound("success");
      } else if (!state.achievementsState[a.id]) {
        state.achievementsState[a.id] = { unlocked: false, ts: 0 };
      }
    }
  };

  /* =========================
     13) Render (Part 1 finish)
========================= */
  const renderHeader = () => {
    const day = getTodayDay();
    setText("#headerDayText", `День ${day.dayNumber}/365`);
  };

  const renderMiniStats = () => {
    setText("#miniBalance", toInt(state.economy.STAR, 0));
    setText("#miniStreak", toInt(state.streak.current, 0));
    setText("#miniRank", toInt(state.rank.currentIndex, 0) + 1);
  };

  const renderHome = () => {
    const iso = getCurrentISO();
    const day = getTodayDay();

    setText("#uiDayFull", formatDateFancy(iso));
    setText("#uiLevel", `${toInt(state.level.value, 20)} / 365`);
    setText("#uiRank", `${toInt(state.rank.currentIndex, 0) + 1} — ${state.rank.names[toInt(state.rank.currentIndex, 0)]}`);
    setText("#uiBalance", toInt(state.economy.STAR, 0));
    setText("#uiStreak", `${toInt(state.streak.current, 0)} дней`);
    setText("#uiDailyBonus", `+${toInt(state.settings.dailyBonus, 20)} (за 100% выполнено)`);

    const { done, total } = calcTasksDone(day);
    setText("#uiTasksDone", `${done} / ${total}`);

    const earned = calcEarnedToday(day);
    setText("#uiEarnedToday", `+${earned.total}`);

    const pot = calcPotentialToday(day);
    setText("#uiPotential", `+${pot.total} (задачи + бонус дня)`);

    // мини-данные
    setText("#uiWaterMini", `${toInt(day.waterMl, 0)} мл / ${toInt(state.settings.waterGoalMl, 2500)} мл`);
    setText("#uiCaloriesMini", `${caloriesTotal(day)} ккал`);

    // прогресс на Home
    const tasksPct = total ? Math.round((done / total) * 100) : 0;
    const waterGoal = toInt(state.settings.waterGoalMl, 2500);
    const waterPct = waterGoal ? Math.round((toInt(day.waterMl, 0) / waterGoal) * 100) : 0;

    const kcalGoal = toInt(state.settings.caloriesGoal, 2500);
    const kcalPct = kcalGoal ? Math.round((caloriesTotal(day) / kcalGoal) * 100) : 0;

    setFillWidth("#homeTasksFill", tasksPct);
    setFillWidth("#homeWaterFill", waterPct);
    setFillWidth("#homeCaloriesFill", kcalPct);

    setFillByData("homeTasks", tasksPct);
    setFillByData("homeWater", waterPct);
    setFillByData("homeCalories", kcalPct);
  };

  const renderToday = () => {
    const iso = getCurrentISO();
    const day = getTodayDay();

    setText("#todayDateLine", formatDateFancy(iso));

    const { done, total } = calcTasksDone(day);
    const pct = total ? Math.round((done / total) * 100) : 0;
    setText("#todayProgressText", `${pct}%`);

    const fill = $(".progressbar-fill", $("#screenToday") || document);
    if (fill) fill.style.width = `${clamp(pct, 0, 100)}%`;

    const ul = $("#todayTaskList");
    if (ul) {
      ul.innerHTML = "";
      for (const t of day.tasks) {
        const li = document.createElement("li");
        li.className = "task-item";
        li.dataset.taskId = t.id;

        li.innerHTML = `
          <div class="task-main">
            <p class="task-title">${escapeHTML(t.title)}</p>
            <p class="task-meta muted small">
              ⭐ <span class="task-reward">${toInt(t.reward, 0)}</span> · <strong>${statusEmoji(t.status)}</strong>
            </p>
          </div>
          <div class="task-controls">
            <button type="button" class="btn-status" data-status="done" aria-label="Выполнено">✅</button>
            <button type="button" class="btn-status" data-status="fail" aria-label="Не выполнено">🚫</button>
            <button type="button" class="btn-status" data-status="progress" aria-label="В процессе">⬜</button>
            <button type="button" class="btn-edit" aria-label="Редактировать">✏️</button>
            <button type="button" class="btn-delete" aria-label="Удалить">❌</button>
          </div>
        `;
        ul.appendChild(li);
      }
    }

    const btnClaim = $("#btnClaimDailyBonus");
    if (btnClaim) {
      if (shouldShowClaimBonus(day)) show(btnClaim);
      else hide(btnClaim);
    }
  };

  const renderWater = () => {
    const day = getTodayDay();
    const goal = toInt(state.settings.waterGoalMl, 2500);
    const drank = toInt(day.waterMl, 0);
    const pct = goal ? clamp(Math.round((drank / goal) * 100), 0, 999) : 0;
    const glasses = Math.floor(drank / 200);

    setText("#waterDrank", `${drank} мл`);
    setText("#waterGoal", `${goal} мл`);
    setText("#waterPercent", `${pct}%`);
    setText("#waterGlasses", `${glasses}`);

    setFillByData("water", pct);

    const inp = $("#waterGoalInput");
    if (inp && !inp.value) inp.placeholder = String(goal);
  };

  const renderCalories = () => {
    const day = getTodayDay();
    const total = caloriesTotal(day);
    setText("#caloriesToday", `${total} ккал`);

    const kcalGoal = toInt(state.settings.caloriesGoal, 2500);
    const pct = kcalGoal ? Math.round((total / kcalGoal) * 100) : 0;
    setFillByData("calories", pct);

    const ul = $("#caloriesLog");
    if (!ul) return;

    ul.innerHTML = "";
    for (const e of day.calories.log) {
      const li = document.createElement("li");
      li.className = "cal-item";
      li.dataset.entryId = e.id;

      const dt = new Date(e.ts);
      const time = `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;

      li.innerHTML = `
        <div class="cal-main">
          <strong>+${toInt(e.kcal, 0)} ккал</strong>
          <span class="muted small">${time}</span>
        </div>
        <div class="cal-controls">
          <button type="button" class="btn-edit" aria-label="Редактировать">✏️</button>
          <button type="button" class="btn-delete" aria-label="Удалить">❌</button>
        </div>
      `;
      ul.appendChild(li);
    }
  };

  const renderGoals = () => {
    const ul = $("#goalsList");
    const tpl = $("#goalItemTemplate");
    if (!ul || !tpl) return;

    ul.innerHTML = "";
    for (const g of state.goals) {
      const node = tpl.content.cloneNode(true);
      const li = node.querySelector("li");
      if (!li) continue;

      li.setAttribute("data-goal-id", g.id);
      const pct = g.total ? Math.round((toInt(g.current, 0) / toInt(g.total, 1)) * 100) : 0;

      const tTitle = li.querySelector(".goal-title");
      const tPct = li.querySelector(".goal-progress-text");
      const tMeta = li.querySelector(".goal-meta");
      const fill = li.querySelector(".progressbar-fill");

      if (tTitle) tTitle.textContent = g.title;
      if (tPct) tPct.textContent = `${clamp(pct, 0, 100)}%`;
      if (tMeta) tMeta.textContent = `${toInt(g.current, 0)} / ${toInt(g.total, 0)}`;
      if (fill) fill.style.width = `${clamp(pct, 0, 100)}%`;

      ul.appendChild(node);
    }
  };

  // дальше будет Part 2
  /* =========================
     13) Render (Part 2)
  ========================== */
  const renderTemplates = () => {
    const ul = $("#templatesList");
    const tpl = $("#templateItemTemplate");
    if (!ul || !tpl) return;

    ul.innerHTML = "";
    for (const t of state.templates) {
      const node = tpl.content.cloneNode(true);
      const li = node.querySelector("li");
      if (!li) continue;

      li.setAttribute("data-template-id", t.id);

      const titleEl = li.querySelector(".template-title");
      const countEl = li.querySelector(".template-count");
      if (titleEl) titleEl.textContent = t.name;
      if (countEl) countEl.textContent = String((t.tasks || []).length);

      // если в шаблоне кнопки ожидают data-template-id — проставим
      li.querySelectorAll("[data-template-id]").forEach((b) => b.setAttribute("data-template-id", t.id));

      ul.appendChild(node);
    }
  };

  const renderShop = () => {
    setText("#shopBalance", toInt(state.economy.STAR, 0));

    const item = shopCurrentItem();
    setText("#shopItemEmoji", item ? (item.emoji || "🎁") : "🎁");
    setText("#shopItemName", item ? (item.name || "—") : "Нет товаров");
    setText("#shopItemPrice", item ? toInt(item.price, 0) : 0);
    setText("#shopItemCurrency", "⭐");

    const img = $("#shopItemPhoto");
    if (img) {
      // если у тебя в HTML нет картинок — будет просто пусто (без ошибок)
      img.src = item?.photo ? item.photo : (img.getAttribute("data-default") || img.getAttribute("src") || "");
    }

    const hist = $("#shopHistory");
    if (hist) {
      hist.innerHTML = "";
      for (const h of (state.shop.history || [])) {
        const li = document.createElement("li");
        li.className = "muted small";
        li.textContent = `${h.iso}: ${h.name} — ${h.price}⭐`;
        hist.appendChild(li);
      }
    }
  };

  const renderAchievements = () => {
    updateAchievements();

    const ul = $("#achievementsList");
    if (!ul) return;

    ul.innerHTML = "";
    for (const a of ACHIEVEMENTS) {
      const st = state.achievementsState[a.id];
      const unlocked = !!st?.unlocked;

      const li = document.createElement("li");
      li.className = unlocked ? "ach unlocked" : "ach locked";
      li.innerHTML = `
        <div class="ach-main">
          <strong>${escapeHTML(a.title)}</strong>
          <p class="muted small">${escapeHTML(a.desc)}</p>
        </div>
        <div class="ach-badge">${unlocked ? "✅" : "🔒"}</div>
      `;
      ul.appendChild(li);
    }
  };
  /* =========================
     14) Calendar (view-only, rings)
  ========================== */

  // helpers for calendar dates
  const isoToDate = (iso) => {
    const [y,m,d] = iso.split("-").map((x)=>toInt(x,0));
    return new Date(y, m-1, d);
  };

  const dateToISO = (dt) => localISO(dt);

  const startISO = () => state.settings.startDate;
  const endISO = () => addDaysISO(startISO(), 364);

  const inRangeISO = (iso) => {
    return diffDays(iso, startISO()) >= 0 && diffDays(iso, endISO()) <= 0;
  };

  const isFutureISO = (iso) => diffDays(iso, getCurrentISO()) > 0;

  const dayDataForISO = (iso) => {
    // для прошлых дней: если их нет в state.days — считаем пустыми
    const d = state.days?.[iso] ? ensureDay(iso) : makeEmptyDay(iso, getDayNumberForISO(iso));
    return d;
  };

  const dayProgress = (iso) => {
    const d = dayDataForISO(iso);

    // Tasks
    const { done, total } = calcTasksDone(d);
    const tasksPct = total ? Math.round((done / total) * 100) : 0;

    // Water
    const wGoal = toInt(state.settings.waterGoalMl, 2500);
    const waterPct = wGoal ? Math.round((toInt(d.waterMl, 0) / wGoal) * 100) : 0;

    // Calories
    const cGoal = toInt(state.settings.caloriesGoal, 2500);
    const kcal = caloriesTotal(d);
    const calPct = cGoal ? Math.round((kcal / cGoal) * 100) : 0;

    // "активность дня" (для подсветки):
    const activeScore = clamp(Math.round((tasksPct + clamp(waterPct,0,100) + clamp(calPct,0,100)) / 3), 0, 100);

    return {
      tasksPct: clamp(tasksPct, 0, 100),
      waterPct: clamp(waterPct, 0, 100),
      calPct: clamp(calPct, 0, 100),
      done, total,
      kcal,
      water: toInt(d.waterMl, 0),
      closed: !!d.closed,
      bonus: !!d.dailyBonusTaken,
      activeScore,
    };
  };

  // SVG rings generator
  const ringSVG = (p1, p2, p3) => {
    const r = 16;                    // radius
    const c = 2 * Math.PI * r;       // circumference
    const dash = (pct) => `${(c * pct) / 100} ${c}`;
    // 3 rings slightly different radius
    return `
      <svg class="cal-ring" viewBox="0 0 44 44" aria-hidden="true">
        <circle class="bg" cx="22" cy="22" r="16"></circle>

        <circle class="r1" cx="22" cy="22" r="16"
          stroke-dasharray="${dash(p1)}"></circle>

        <circle class="r2" cx="22" cy="22" r="12.5"
          stroke-dasharray="${dash(p2)}"></circle>

        <circle class="r3" cx="22" cy="22" r="9"
          stroke-dasharray="${dash(p3)}"></circle>
      </svg>
    `;
  };

  let calendarModalEl = null;
  let calMonth = null; // Date set to first day of month

  const ensureCalendarModal = () => {
    if (calendarModalEl) return calendarModalEl;

    const modal = document.createElement("div");
    modal.id = "calendarModal";
    modal.hidden = true;

    modal.innerHTML = `
      <div id="calendarPanel" role="dialog" aria-modal="true" aria-label="Календарь">
        <div id="calendarHeader">
          <button type="button" class="cal-btn" id="calClose">Cancel</button>
          <div style="display:flex; align-items:center; gap:10px;">
            <button type="button" class="cal-btn" id="calPrev">‹</button>
            <div id="calMonthLabel">—</div>
            <button type="button" class="cal-btn" id="calNext">›</button>
          </div>
          <div style="width:64px;"></div>
        </div>

        <div id="calendarWeekdays">
          <div>M</div><div>T</div><div>W</div><div>T</div><div>F</div><div>S</div><div>S</div>
        </div>

        <div id="calendarGrid"></div>

        <div id="calendarSummary">
          <div><strong>Нажми на день</strong></div>
          <div class="muted">Здесь покажу краткую статистику (без редактирования).</div>
        </div>
      </div>
    `;

    // close by backdrop tap
    modal.addEventListener("click", (ev) => {
      if (ev.target === modal) closeCalendarModal();
    });

    document.body.appendChild(modal);
    calendarModalEl = modal;

    $("#calClose", modal)?.addEventListener("click", () => { playSound("click"); closeCalendarModal(); });
    $("#calPrev", modal)?.addEventListener("click", () => { playSound("click"); shiftCalendarMonth(-1); });
    $("#calNext", modal)?.addEventListener("click", () => { playSound("click"); shiftCalendarMonth(+1); });

    // day click (delegate)
    $("#calendarGrid", modal)?.addEventListener("click", (ev) => {
      const btn = ev.target.closest("button[data-iso]");
      if (!btn) return;
      const iso = btn.getAttribute("data-iso");
      if (!iso) return;
      playSound("click");
      renderCalendarSummary(iso);
    });

    return modal;
  };

  const monthLabelRU = (dt) => {
    const months = [
      "January","February","March","April","May","June",
      "July","August","September","October","November","December"
    ];
    // можно и RU сделать, но на скрине iOS англ.
    return `${months[dt.getMonth()]} ${dt.getFullYear()}`;
  };

  const firstDayOfMonth = (dt) => new Date(dt.getFullYear(), dt.getMonth(), 1);
  const daysInMonth = (dt) => new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();

  // Monday-first index 0..6
  const weekdayMon0 = (dt) => {
    const js = dt.getDay(); // 0 Sun..6 Sat
    return (js + 6) % 7;    // Mon=0 ... Sun=6
  };

  const renderCalendarMonth = () => {
    const modal = ensureCalendarModal();
    const grid = $("#calendarGrid", modal);
    const label = $("#calMonthLabel", modal);
    if (!grid || !label) return;

    const monthStart = firstDayOfMonth(calMonth);
    label.textContent = monthLabelRU(monthStart);

    grid.innerHTML = "";

    const offset = weekdayMon0(monthStart); // empty cells before day 1
    const dim = daysInMonth(monthStart);

    // build empty placeholders
    for (let i = 0; i < offset; i++) {
      const cell = document.createElement("div");
      cell.className = "cal-cell";
      cell.innerHTML = `<button type="button" aria-hidden="true" tabindex="-1" style="opacity:.0; pointer-events:none;"></button>`;
      grid.appendChild(cell);
    }

    const todayISO = getCurrentISO();

    for (let dayNum = 1; dayNum <= dim; dayNum++) {
      const dt = new Date(monthStart.getFullYear(), monthStart.getMonth(), dayNum);
      const iso = dateToISO(dt);

      const cell = document.createElement("div");
      cell.className = "cal-cell";

      // only within challenge range is enabled
      const inRange = inRangeISO(iso);
      const future = isFutureISO(iso);

      const p = dayProgress(iso);

      const incomplete = inRange && !future && p.activeScore < 30; // порог “плохой день”
      const isToday = iso === todayISO;

      if (!inRange || future) cell.classList.add("cal-disabled");
      if (incomplete) cell.classList.add("cal-incomplete");
      if (isToday) cell.classList.add("cal-today");

      // small dot for "closed day"
      const dot = (p.closed && inRange && !future) ? `<span class="cal-dot" title="день закрыт"></span>` : "";

      cell.innerHTML = `
        <button type="button" data-iso="${iso}" aria-label="День ${dayNum}">
          <span class="cal-daynum">${dayNum}</span>
          ${ringSVG(p.tasksPct, p.waterPct, p.calPct)}
          ${dot}
        </button>
      `;

      grid.appendChild(cell);
    }
  };

  const renderCalendarSummary = (iso) => {
    const modal = ensureCalendarModal();
    const box = $("#calendarSummary", modal);
    if (!box) return;

    const d = dayDataForISO(iso);
    const p = dayProgress(iso);

    const dayLine = formatDateFancy(iso);
    const status = !inRangeISO(iso) ? "Вне марафона" : (isFutureISO(iso) ? "Будущий день" : (p.closed ? "✅ Закрыт" : "⏳ Не закрыт"));

    box.innerHTML = `
      <div><strong>${escapeHTML(dayLine)}</strong></div>
      <div class="muted">${escapeHTML(status)}</div>
      <div style="margin-top:8px;">
        ✅ Задачи: <strong>${p.done}/${p.total}</strong> (${p.tasksPct}%)
        <br>💧 Вода: <strong>${p.water}</strong> мл (${p.waterPct}%)
        <br>🍽 Калории: <strong>${p.kcal}</strong> ккал (${p.calPct}%)
        <br>🎁 Бонус: <strong>${p.bonus ? "взят" : "не взят"}</strong>
      </div>
      <div class="muted" style="margin-top:8px;">
        (Только просмотр — редактирование отключено)
      </div>
    `;
  };

  const openCalendarModal = () => {
    const m = ensureCalendarModal();

    // по умолчанию открываем месяц текущего дня
    const now = isoToDate(getCurrentISO());
    calMonth = firstDayOfMonth(now);

    renderCalendarMonth();
    renderCalendarSummary(getCurrentISO());

    m.hidden = false;
  };

  const closeCalendarModal = () => {
    if (!calendarModalEl) return;
    calendarModalEl.hidden = true;
  };

  const shiftCalendarMonth = (delta) => {
    if (!calMonth) calMonth = firstDayOfMonth(new Date());
    calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + delta, 1);
    renderCalendarMonth();
  };

  /* =========================
     14) Analytics (7 days / month / 12 months)
  ========================== */
  const countDaysClosed = () => Object.values(state.days || {}).filter((d) => !!d?.closed).length;

  const collectRange = (startISO, endISO) => {
    const rows = [];
    let cur = startISO;
    let safety = 0;

    while (true) {
      const d = state.days[cur] ? ensureDay(cur) : null;
      const tasks = d ? (d.tasks || []).length : 0;
      const done = d ? (d.tasks || []).filter((t) => t.status === "done").length : 0;

      rows.push({
        iso: cur,
        tasks,
        done,
        closed: d ? !!d.closed : false,
        water: d ? toInt(d.waterMl, 0) : 0,
        kcal: d ? caloriesTotal(d) : 0,
      });

      if (cur === endISO) break;
      cur = addDaysISO(cur, 1);

      safety++;
      if (safety > 420) break;
    }

    return rows;
  };

  const rowsToHTML = (rows) => {
    const list = rows.map((r) => {
      const pct = r.tasks ? Math.round((r.done / r.tasks) * 100) : 0;
      return `
        <div class="an-row">
          <div class="an-date">${escapeHTML(r.iso)}</div>
          <div class="an-item">✅ ${r.done}/${r.tasks} (${pct}%)</div>
          <div class="an-item">💧 ${r.water} мл</div>
          <div class="an-item">🍽 ${r.kcal} ккал</div>
          <div class="an-item">${r.closed ? "🎁 закрыт" : ""}</div>
        </div>
      `;
    }).join("");

    return `<div class="analytics">${list || `<p class="muted">Нет данных</p>`}</div>`;
  };

  const renderAnalyticsSummary = () => {
    // optional ids (если у тебя есть такие — заполнится, если нет — просто пропустит)
    setText("#anTasksDone", countTotalTasksDone());
    setText("#anDaysClosed", countDaysClosed());
    setText("#anEarnedTotal", totalEarned());
    setText("#anSpentTotal", totalSpent());
    setText("#anBalance", toInt(state.economy.STAR, 0));
    setText("#anStreak", toInt(state.streak.current, 0));
  };

  const renderAnalyticsPeriod = (mode) => {
    const out = $("#analyticsOutput");
    if (!out) return;

    const todayISO = getCurrentISO();

    if (mode === "week") {
      const startISO = addDaysISO(todayISO, -6);
      const rows = collectRange(startISO, todayISO);
      out.innerHTML = `<div class="mutedline">Период: ${startISO} → ${todayISO}</div>${rowsToHTML(rows)}`;
      return;
    }

    if (mode === "month") {
      const [y, m] = todayISO.split("-").map((x) => toInt(x, 0));
      const start = localISO(new Date(y, m - 1, 1));
      const end = localISO(new Date(y, m, 0));
      const rows = collectRange(start, end);
      out.innerHTML = `<div class="mutedline">Месяц: ${start} → ${end}</div>${rowsToHTML(rows)}`;
      return;
    }

    if (mode === "year") {
      const start = state.settings.startDate;
      const end = addDaysISO(start, 364);
      const rows = collectRange(start, end);
      out.innerHTML = `<div class="mutedline">12 месяцев: ${start} → ${end}</div>${rowsToHTML(rows)}`;
    }
  };

  /* =========================
     15) Settings + Reset progress
  ========================== */
  const renderSettings = () => {
    const sd = $("#setStartDate");
    const db = $("#setDailyBonus");
    const wg = $("#setWaterGoal");
    const cg = $("#setCaloriesGoal");

    if (sd) sd.value = state.settings.startDate || DEFAULT_START_DATE;
    if (db) db.value = String(toInt(state.settings.dailyBonus, 20));
    if (wg) wg.value = String(toInt(state.settings.waterGoalMl, 2500));
    if (cg) cg.value = String(toInt(state.settings.caloriesGoal, 2500));
  };

  const saveSettingsFromUI = () => {
    const sd = $("#setStartDate")?.value;
    const db = $("#setDailyBonus")?.value;
    const wg = $("#setWaterGoal")?.value;
    const cg = $("#setCaloriesGoal")?.value;

    if (sd && /^\d{4}-\d{2}-\d{2}$/.test(sd)) state.settings.startDate = sd;

    state.settings.dailyBonus = clamp(toInt(db, 20), 0, 999999);
    state.settings.waterGoalMl = clamp(toInt(wg, 2500), 100, 20000);
    state.settings.caloriesGoal = clamp(toInt(cg, 2500), 100, 20000);

    // пересчитать dayNumber для всех сохранённых дней
    for (const iso in state.days) {
      state.days[iso].dayNumber = getDayNumberForISO(iso);
    }

    updateRankIfNeeded();
    updateAchievements();

    saveState();
    renderAll();
    playSound("success");
    toast("✅ Настройки сохранены");
  };

  const resetProgress = () => {
    if (!confirm("Точно обнулить весь прогресс? Это удалит все данные.")) return;
    localStorage.removeItem(STORAGE_KEY);
    state = defaultState();
    saveState();

    rebuildCardKeys();
    activeKey = cardKeys.includes("home") ? "home" : (cardKeys[0] || "home");
    showOnlyKey(activeKey);

    renderAll();
    updateArrowDisabled();
    playSound("success");
    toast("✅ Прогресс сброшен");
  };

  /* =========================
     16) Render all
  ========================== */
  const renderAll = () => {
    renderHeader();
    renderMiniStats();
    renderHome();
    renderToday();
    renderWater();
    renderCalories();
    renderGoals();
    renderTemplates();
    renderShop();
    renderAchievements();
    renderAnalyticsSummary();
    renderSettings();
  };

  /* =========================
     17) Actions dispatcher
  ========================== */
  const handleAction = (action, el) => {
    const day = getTodayDay();

    // drawer / nav
    if (action === "open-menu") { openDrawer(); return; }
    if (action === "close-menu") { closeDrawer(); return; }

    if (action === "nav") {
      const key = el?.getAttribute("data-nav") || "home";
      goToKey(key);
      closeDrawer();
      return;
    }

    // cards
    if (action === "prev-card") { goPrev(); return; }
    if (action === "next-card") { goNext(); return; }

    // today
    if (action === "claim-bonus") {
      const ok = claimDailyBonus(day);
      if (ok) { playSound("success"); toast("✅ День закрыт! Бонус получен."); }
      else { playSound("error"); toast("Сначала выполни все задачи ✅"); }
      updateAchievements();
      renderAll();
      saveState();
      return;
    }

    if (action === "add-task") {
      const title = prompt("Название задачи?");
      if (!title) return;
      const reward = clamp(toInt(prompt("Награда ⭐ за выполнение?", "10"), 10), 0, 999999);
      day.tasks.push({ id: uid(), title: title.trim(), reward, status: "progress" });
      updateAchievements();
      renderAll();
      saveState();
      playSound("success");
      return;
    }

    // water
    if (action === "water-add") {
      const ml = toInt(el?.getAttribute("data-ml"), 0);
      addWater(day, ml);
      updateAchievements();
      renderAll();
      saveState();
      return;
    }
    if (action === "water-reset") {
      resetWater(day);
      renderAll();
      saveState();
      return;
    }

    // calories
    if (action === "cal-add") {
      const inp = $("#caloriesInput");
      const kcal = toInt(inp?.value, 0);
      if (kcal <= 0) { playSound("error"); return toast("Введите калории"); }
      addCalories(day, kcal);
      if (inp) inp.value = "";
      updateAchievements();
      renderAll();
      saveState();
      playSound("success");
      return;
    }
    if (action === "cal-reset") {
      resetCalories(day);
      renderAll();
      saveState();
      return;
    }

    // goals
    if (action === "goal-add") {
      const title = prompt("Название цели?");
      if (!title) return;
      const total = toInt(prompt("Сколько всего нужно?", "10"), 0);
      const current = toInt(prompt("Сколько уже есть?", "0"), 0);
      const ok = createGoal(title, total, current);
      if (!ok) { playSound("error"); return toast("Проверь данные цели"); }
      updateAchievements();
      renderAll();
      saveState();
      playSound("success");
      return;
    }

    // templates
    if (action === "tpl-create") {
      const name = ($("#tplName")?.value || "").trim();
      const tasksText = ($("#tplTasks")?.value || "").trim();
      const ok = createTemplate(name, tasksText);
      if (!ok) { playSound("error"); return toast("Введи имя и задачи"); }
      if ($("#tplName")) $("#tplName").value = "";
      if ($("#tplTasks")) $("#tplTasks").value = "";
      renderAll();
      saveState();
      playSound("success");
      return;
    }

    // shop
    if (action === "shop-prev") { shopPrev(); renderShop(); saveState(); return; }
    if (action === "shop-next") { shopNext(); renderShop(); saveState(); return; }

    if (action === "shop-buy") {
      const res = shopBuy();
      if (res.ok) playSound("success"); else playSound("error");
      toast(res.msg);
      renderAll();
      saveState();
      return;
    }

    if (action === "shop-add") {
      const emoji = ($("#shopEmoji")?.value || "").trim() || "🎁";
      const name = ($("#shopName")?.value || "").trim();
      const price = toInt($("#shopPrice")?.value, 0);
      if (!name || price <= 0) { playSound("error"); return toast("Введи название и цену"); }
      state.shop.items.push({ id: uid(), emoji, name, price, photo: "" });

      if ($("#shopEmoji")) $("#shopEmoji").value = "";
      if ($("#shopName")) $("#shopName").value = "";
      if ($("#shopPrice")) $("#shopPrice").value = "";

      state.shop.currentIndex = state.shop.items.length - 1;
      renderShop();
      saveState();
      playSound("success");
      return;
    }

    if (action === "shop-edit") {
      const line = ($("#shopEditLineInput")?.value || "").trim();
      const item = shopCurrentItem();
      if (!item) return;
      if (!line) { playSound("error"); return toast("Формат: эмодзи | имя | цена"); }
      const parts = line.split("|").map((x) => x.trim());
      if (parts.length < 3) { playSound("error"); return toast("Формат: эмодзи | имя | цена"); }

      item.emoji = parts[0] || item.emoji;
      item.name = parts[1] || item.name;
      item.price = clamp(toInt(parts[2], item.price), 0, 999999);

      if ($("#shopEditLineInput")) $("#shopEditLineInput").value = "";
      renderShop();
      saveState();
      playSound("success");
      return;
    }

    if (action === "shop-delete") {
      const item = shopCurrentItem();
      if (!item) return;
      if (!confirm(`Удалить "${item.name}"?`)) return;
      state.shop.items.splice(state.shop.currentIndex, 1);
      if (state.shop.currentIndex >= state.shop.items.length) {
        state.shop.currentIndex = Math.max(0, state.shop.items.length - 1);
      }
      renderShop();
      saveState();
      playSound("success");
      return;
    }

    // analytics
    if (action === "analytics-week") { renderAnalyticsPeriod("week"); playSound("success"); return; }
    if (action === "analytics-month") { renderAnalyticsPeriod("month"); playSound("success"); return; }
    if (action === "analytics-year") { renderAnalyticsPeriod("year"); playSound("success"); return; }

    // settings
    if (action === "save-settings") { saveSettingsFromUI(); return; }
    if (action === "reset-progress") { resetProgress(); return; }
  };

  /* =========================
     18) Delegated listeners
  ========================== */
  const bindDelegates = () => {
    // unlock sounds on first gesture
    document.addEventListener("click", unlockSound, { once: true });

    // topbar / arrows
    $("#btnOpenMenu")?.addEventListener("click", () => { playSound("click"); handleAction("open-menu"); });
    $("#btnCloseMenu")?.addEventListener("click", () => { playSound("click"); handleAction("close-menu"); });
    $("#backdrop")?.addEventListener("click", () => { playSound("click"); handleAction("close-menu"); });

    $("#btnPrevCard")?.addEventListener("click", () => { playSound("click"); handleAction("prev-card"); });
    $("#btnNextCard")?.addEventListener("click", () => { playSound("click"); handleAction("next-card"); });

    // drawer items
    $$(".drawer-item[data-nav]").forEach((b) => {
      b.addEventListener("click", () => {
        playSound("click");
        handleAction("nav", b);
      });
      // === ВОТ ЭТО КАЛЕНДАРЬ ===
  $("#btnCalendar")?.addEventListener("click", () => {
    playSound("click");
    openCalendarModal();
  });
    });

    // today actions
    $("[data-action='add-task']")?.addEventListener("click", () => { playSound("click"); handleAction("add-task"); });
    $("#btnClaimDailyBonus")?.addEventListener("click", () => { playSound("click"); handleAction("claim-bonus"); });

    // water buttons
    $$("[data-action='water-add'][data-ml]").forEach((b) => {
      b.addEventListener("click", () => { playSound("click"); handleAction("water-add", b); });
    });
    $("[data-action='water-reset']")?.addEventListener("click", () => { playSound("click"); handleAction("water-reset"); });

    // calories buttons
    $("[data-action='cal-add']")?.addEventListener("click", () => { playSound("click"); handleAction("cal-add"); });
    $("[data-action='cal-reset']")?.addEventListener("click", () => { playSound("click"); handleAction("cal-reset"); });

    // goals
    $("[data-action='goal-add']")?.addEventListener("click", () => { playSound("click"); handleAction("goal-add"); });

    // templates create
    $("[data-action='tpl-create']")?.addEventListener("click", () => { playSound("click"); handleAction("tpl-create"); });

    // templates list delegate: apply/delete
    $("#templatesList")?.addEventListener("click", (ev) => {
      const btn = ev.target.closest("button");
      if (!btn) return;

      const a = btn.getAttribute("data-action");
      const tid = btn.getAttribute("data-template-id");
      if (!a || !tid) return;

      playSound("click");

      if (a === "tpl-apply") {
        const ok = applyTemplateToISO(tid, getCurrentISO());
        if (!ok) { playSound("error"); return toast("Не удалось применить шаблон"); }
        updateAchievements();
        renderAll();
        saveState();
        playSound("success");
        toast("✅ Шаблон применён");
        return;
      }

      if (a === "tpl-delete") {
        if (!confirm("Удалить шаблон?")) return;
        state.templates = (state.templates || []).filter((t) => t.id !== tid);
        renderAll();
        saveState();
        playSound("success");
      }
    });

    // shop
    $("[data-action='shop-prev']")?.addEventListener("click", () => { playSound("click"); handleAction("shop-prev"); });
    $("[data-action='shop-next']")?.addEventListener("click", () => { playSound("click"); handleAction("shop-next"); });
    $("[data-action='shop-buy']")?.addEventListener("click", () => { playSound("click"); handleAction("shop-buy"); });

    $("[data-action='shop-add']")?.addEventListener("click", () => { playSound("click"); handleAction("shop-add"); });
    $("[data-action='shop-edit']")?.addEventListener("click", () => { playSound("click"); handleAction("shop-edit"); });
    $("[data-action='shop-delete']")?.addEventListener("click", () => { playSound("click"); handleAction("shop-delete"); });

    // analytics
    $$("[data-action='analytics-week'],[data-action='analytics-month'],[data-action='analytics-year']").forEach((b) => {
      b.addEventListener("click", () => {
        playSound("click");
        handleAction(b.getAttribute("data-action"));
      });
    });

    // settings
    $("#btnSaveSettings")?.addEventListener("click", () => { playSound("click"); handleAction("save-settings"); });
    $("#btnResetProgress")?.addEventListener("click", () => { playSound("click"); handleAction("reset-progress"); });

    // today task list delegate: status/edit/delete
    $("#todayTaskList")?.addEventListener("click", (ev) => {
      const btn = ev.target.closest("button");
      const li = ev.target.closest(".task-item");
      if (!btn || !li) return;

      const taskId = li.dataset.taskId;
      if (!taskId) return;

      const day = getTodayDay();
      const task = (day.tasks || []).find((t) => t.id === taskId);
      if (!task) return;

      const st = btn.getAttribute("data-status");
      if (st) {
        playSound("click");
        applyTaskStatusChangeEconomy(day, task, st);
        updateAchievements();
        renderAll();
        saveState();
        return;
      }

      if (btn.classList.contains("btn-edit")) {
        playSound("click");
        const title = prompt("Новое название задачи:", task.title);
        if (title === null) return;
        const reward = clamp(toInt(prompt("Новая награда ⭐:", String(task.reward)), task.reward), 0, 999999);

        task.title = String(title).trim() || task.title;
        task.reward = reward;

        renderAll();
        saveState();
        playSound("success");
        return;
      }

      if (btn.classList.contains("btn-delete")) {
        playSound("click");
        if (!confirm("Удалить задачу?")) return;
        deleteTaskWithRollback(day, taskId);
        updateAchievements();
        renderAll();
        saveState();
        playSound("success");
      }
    });

    // calories log delegate: edit/delete
    $("#caloriesLog")?.addEventListener("click", (ev) => {
      const btn = ev.target.closest("button");
      const li = ev.target.closest(".cal-item");
      if (!btn || !li) return;

      const entryId = li.dataset.entryId;
      if (!entryId) return;

      const day = getTodayDay();

      if (btn.classList.contains("btn-edit")) {
        playSound("click");
        const cur = (day.calories.log || []).find((x) => x.id === entryId);
        if (!cur) return;

        const next = toInt(prompt("Сколько ккал?", String(cur.kcal)), 0);
        if (next <= 0) { playSound("error"); return; }
        editCalories(day, entryId, next);

        updateAchievements();
        renderAll();
        saveState();
        playSound("success");
        return;
      }

      if (btn.classList.contains("btn-delete")) {
        playSound("click");
        if (!confirm("Удалить запись?")) return;
        deleteCalories(day, entryId);

        renderAll();
        saveState();
        playSound("success");
      }
    });

    // goals list delegate: plus/minus/edit/delete (если кнопки есть)
    $("#goalsList")?.addEventListener("click", (ev) => {
      const btn = ev.target.closest("button");
      const li = ev.target.closest("li");
      if (!btn || !li) return;

      const goalId = li.getAttribute("data-goal-id");
      if (!goalId) return;

      const g = (state.goals || []).find((x) => x.id === goalId);
      if (!g) return;

      const a = btn.getAttribute("data-action");

      if (a === "goal-plus") {
        playSound("click");
        g.current = clamp(toInt(g.current, 0) + 1, 0, toInt(g.total, 1));
        updateAchievements();
        renderAll();
        saveState();
        return;
      }

      if (a === "goal-minus") {
        playSound("click");
        g.current = clamp(toInt(g.current, 0) - 1, 0, toInt(g.total, 1));
        renderAll();
        saveState();
        return;
      }

      if (a === "goal-edit") {
        playSound("click");
        const title = prompt("Название цели:", g.title);
        if (title === null) return;
        const total = toInt(prompt("Всего нужно:", String(g.total)), g.total);
        const current = toInt(prompt("Текущее значение:", String(g.current)), g.current);

        editGoal(goalId, title, total, current);
        updateAchievements();
        renderAll();
        saveState();
        playSound("success");
        return;
      }

      if (a === "goal-delete") {
        playSound("click");
        if (!confirm("Удалить цель?")) return;
        deleteGoal(goalId);
        updateAchievements();
        renderAll();
        saveState();
        playSound("success");
      }
    });
  };

  /* =========================
     19) Boot / Init
  ========================== */
  const onAppWake = () => {
    const todayISO = getCurrentISO();
    const lastOpen = state.meta.lastOpenISO || todayISO;

    // просто гарантируем день
    ensureDay(todayISO);

    // если дата перескочила — проверим уровни/ранг/ачивки
    if (lastOpen !== todayISO) {
      checkMidnightLevel();
      updateRankIfNeeded();
      updateAchievements();
      state.meta.lastOpenISO = todayISO;
    } else {
      updateRankIfNeeded();
      updateAchievements();
    }

    renderAll();
    saveState();
  };

  const initUI = () => {
    rebuildCardKeys();
    activeKey = cardKeys.includes("home") ? "home" : (cardKeys[0] || "home");
    showOnlyKey(activeKey);
    updateArrowDisabled();
    setupSwipe();
  };

  const boot = () => {
    state = loadState();
    ensureDay(getCurrentISO());

    bindDelegates();
    initUI();

    // по умолчанию аналитика: 7 дней
    renderAnalyticsPeriod("week");

    closeDrawer();
    onAppWake();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
