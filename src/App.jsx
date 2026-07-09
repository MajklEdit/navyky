import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Flame as FlameIcon, Check, ChevronLeft, ChevronRight,
  Plus, X, CalendarDays, BarChart3, Home, Trash2, Pencil, Minus, Share2, Sparkles, User, Fingerprint, ChevronDown,
} from "lucide-react";
import { BarChart, Bar, XAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import storage from "./storage";
import { scheduleAllNotifications } from "./notifications";

// ============================================================================
// DESIGN TOKENS
// ============================================================================
const COLORS = {
  bg: "#0E0A16",
  surface: "#1A1326",
  surface2: "#241A38",
  border: "#3A2C55",
  text: "#F3EEFC",
  textMuted: "#9A8FB5",
  primary: "#C13BFF",   // supplements — signature neon purple
  secondary: "#22E0D8", // training — neon teal
  water: "#2FA9FF",     // water — electric blue
  sleepC: "#FF4FD8",    // sleep — neon pink
  custom: "#FFA53D",    // custom activity — neon amber
  danger: "#E0527A",
};

function hexToRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}
function hexA(hex, a) { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; }
function mixHex(h1, h2, t) {
  const a = hexToRgb(h1), b = hexToRgb(h2);
  const r = Math.round(a[0] + (b[0] - a[0]) * t), g = Math.round(a[1] + (b[1] - a[1]) * t), bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r},${g},${bl})`;
}

// ============================================================================
// CATEGORY ICONS — native emoji, same reasoning as the flame: professionally
// drawn artwork beats another hand-rolled SVG attempt.
// ============================================================================
const CATS = {
  supplement: { color: COLORS.primary, icon: "💊", label: "Suplement" },
  training: { color: COLORS.secondary, icon: "🏋️", label: "Trénink" },
  water: { color: COLORS.water, icon: "💧", label: "Pitný režim" },
  sleep: { color: COLORS.sleepC, icon: "🌙", label: "Spánek" },
  custom: { color: COLORS.custom, icon: "🔔", label: "Aktivita" },
};

const DOW = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];
const MONTHS = ["leden","únor","březen","duben","květen","červen","červenec","srpen","září","říjen","listopad","prosinec"];

const LEVELS = [
  { min: 0, name: "Jiskra", desc: "Teprve začínáš. Každý den se počítá." },
  { min: 3, name: "Plamínek", desc: "Držíš tempo tři dny v kuse." },
  { min: 7, name: "Plamen", desc: "Celý týden bez výpadku." },
  { min: 30, name: "Vatra", desc: "Měsíc disciplíny. Silná série." },
  { min: 100, name: "Fénix", desc: "Legendární série. Odemčena nová aura." },
];
function getLevel(streak) {
  let cur = LEVELS[0], idx = 0;
  for (let i = 0; i < LEVELS.length; i++) if (streak >= LEVELS[i].min) { cur = LEVELS[i]; idx = i; }
  const next = LEVELS[idx + 1] || null;
  return { ...cur, next };
}

const DEFAULT_HABITS = [];
const THEME_VARIANTS = [
  { id: "ember", name: "Ember", accent: "#FF6A3D", background: "#12090A" },
  { id: "neon", name: "Neon", accent: "#C13BFF", background: "#0E0A16" },
  { id: "solar", name: "Solar", accent: "#FFC857", background: "#11100A" },
  { id: "magma", name: "Magma", accent: "#FF3D81", background: "#130811" },
  { id: "forge", name: "Forge", accent: "#FF8A1F", background: "#100C08" },
  { id: "plasma", name: "Plasma", accent: "#22E0D8", background: "#071212" },
  { id: "aurora", name: "Aurora", accent: "#7CFF6B", background: "#09120C" },
  { id: "arc", name: "Arc", accent: "#2FA9FF", background: "#07101A" },
  { id: "ruby", name: "Ruby", accent: "#E0527A", background: "#15080D" },
  { id: "ghost", name: "Ghost", accent: "#F3EEFC", background: "#0B0B10" },
];

// ============================================================================
// HELPERS
// ============================================================================
function fmt(d) { const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0"); return `${y}-${m}-${day}`; }
function parseDate(s) { const [y, m, day] = s.split("-").map(Number); return new Date(y, m - 1, day); }
function todayDate() { return new Date(); }
function dowIndex(d) { return (d.getDay() + 6) % 7; }
function isScheduled(habit, date) {
  if (habit.once) return habit.date === fmt(date);
  if (!habit.days || habit.days.length === 0) return true;
  return habit.days.includes(dowIndex(date));
}
function isDone(habit, raw) {
  if (habit.type === "check") return !!raw;
  if (habit.type === "checklist") {
    const items = habit.checklist || [];
    if (items.length === 0) return !!raw?.done;
    return items.every(item => !!raw?.items?.[item.id]);
  }
  return (raw || 0) >= habit.target;
}
function progressFrac(habit, raw) {
  if (habit.type === "check") return raw ? 1 : 0;
  if (habit.type === "checklist") {
    const items = habit.checklist || [];
    if (items.length === 0) return raw?.done ? 1 : 0;
    return items.filter(item => !!raw?.items?.[item.id]).length / items.length;
  }
  return Math.max(0, Math.min(1, (raw || 0) / habit.target));
}
function scheduleLabel(habit) {
  if (habit.once) return habit.date ? `konkrétní datum · ${parseDate(habit.date).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" })}` : "konkrétní datum";
  if (!habit.days || habit.days.length === 0 || habit.days.length === 7) return "každý den";
  return habit.days.map(i => DOW[i]).join(" · ");
}
function dueDateForHabit(habit, date) {
  if (!habit.time || !/^\d{2}:\d{2}$/.test(habit.time)) return null;
  if (habit.type !== "check" && habit.type !== "checklist") return null;
  const [hour, minute] = habit.time.split(":").map(Number);
  const base = habit.once && habit.date ? parseDate(habit.date) : date;
  return new Date(base.getFullYear(), base.getMonth(), base.getDate(), hour, minute, 0, 0);
}
function remainingLabel(habit, now) {
  const due = dueDateForHabit(habit, now);
  if (!due) return null;
  const diffSeconds = Math.ceil((due.getTime() - now.getTime()) / 1000);
  if (diffSeconds <= 0) return "po termínu";
  const hours = Math.floor(diffSeconds / 3600);
  const minutes = Math.floor((diffSeconds % 3600) / 60);
  const seconds = diffSeconds % 60;
  const clock = hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `zbývá ${clock}`;
}

// today's overall vitality score — partial credit, not all-or-nothing
function dayScore(habits, entries, date) {
  const scheduled = habits.filter(h => isScheduled(h, date));
  if (scheduled.length === 0) return null;
  const key = fmt(date);
  const sum = scheduled.reduce((s, h) => s + progressFrac(h, entries[key]?.[h.id]), 0);
  return sum / scheduled.length;
}

// per-habit streak (only counts days it was actually scheduled)
function getHabitStreak(habit, entries, today) {
  let streak = 0, cursor = new Date(today);
  if (isScheduled(habit, cursor) && !isDone(habit, entries[fmt(cursor)]?.[habit.id])) cursor.setDate(cursor.getDate() - 1);
  for (let g = 0; g < 3650; g++) {
    if (!isScheduled(habit, cursor)) { cursor.setDate(cursor.getDate() - 1); continue; }
    const key = fmt(cursor);
    if (isDone(habit, entries[key]?.[habit.id])) { streak++; cursor.setDate(cursor.getDate() - 1); }
    else break;
  }
  return streak;
}

// "perfect day" streak across ALL habits — drives the fire's level
function getPerfectStreak(habits, entries, today) {
  let streak = 0, cursor = new Date(today);
  const todayScheduled = habits.filter(h => isScheduled(h, cursor));
  const todayAllDone = todayScheduled.length > 0 && todayScheduled.every(h => isDone(h, entries[fmt(cursor)]?.[h.id]));
  if (!todayAllDone) cursor.setDate(cursor.getDate() - 1);
  for (let g = 0; g < 3650; g++) {
    const scheduled = habits.filter(h => isScheduled(h, cursor));
    if (scheduled.length === 0) { cursor.setDate(cursor.getDate() - 1); continue; }
    const key = fmt(cursor);
    const allDone = scheduled.every(h => isDone(h, entries[key]?.[h.id]));
    if (allDone) { streak++; cursor.setDate(cursor.getDate() - 1); } else break;
  }
  return streak;
}

// ============================================================================
// THE FIRE — signature element
// Uses the platform's native fire emoji instead of a hand-drawn shape: it's
// professionally designed artwork that's guaranteed to render well on every
// device, so no custom path/gradient bugs to chase. Progress is expressed via
// size + a grayscale-to-full-color filter; the glow tints to the app accent.
// ============================================================================
function Flame({ score, size = 168 }) {
  const t = score == null ? 0 : score; // 0..1
  const scale = 0.12 + t * 0.88; // at 0% it's a tiny spark, growing to full size at 100%
  const opacity = 0.45 + t * 0.55;
  const grayscale = 1 - t;
  const brightness = 0.6 + t * 0.5;
  const saturate = 0.5 + t * 0.9;
  const glow = hexA(COLORS.primary, 0.15 + t * 0.55);

  return (
    <div style={{ position: "relative", width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className="fire-flicker" style={{
        fontSize: size * 0.72, lineHeight: 1, transform: `scale(${scale})`, opacity,
        filter: `grayscale(${grayscale}) brightness(${brightness}) saturate(${saturate}) drop-shadow(0 0 ${14 + t * 30}px ${glow})`,
        transition: "transform .6s ease, filter .6s ease, opacity .6s ease",
      }}>🔥</div>
      {t >= 0.98 && (
        <>
          <Sparkles size={16} color="#FFF3C4" style={{ position: "absolute", top: 6, right: 14 }} className="sparkle-a" />
          <Sparkles size={12} color="#FFFFFF" style={{ position: "absolute", top: 24, left: 8 }} className="sparkle-b" />
        </>
      )}
    </div>
  );
}

// ============================================================================
// SMALL UI ATOMS
// ============================================================================
function IconBadge({ cat, done }) {
  const C = CATS[cat];
  return (
    <div style={{
      width: 40, height: 40, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      background: done ? C.color : COLORS.surface2, border: `1px solid ${done ? C.color : COLORS.border}`,
      boxShadow: done ? `0 0 12px ${hexA(C.color, 0.5)}` : "none", transition: "all .2s ease",
    }}>
      <span style={{ fontSize: 18, lineHeight: 1, filter: done ? "none" : "grayscale(0.35) opacity(0.9)" }}>{C.icon}</span>
    </div>
  );
}

function ProgressBar({ frac, color }) {
  return (
    <div style={{ height: 5, background: COLORS.surface2, borderRadius: 3, overflow: "hidden", marginTop: 6 }}>
      <div style={{ height: "100%", width: `${frac * 100}%`, background: color, borderRadius: 3, transition: "width .3s ease" }} />
    </div>
  );
}

function DayPicker({ value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
      {DOW.map((d, i) => {
        const active = value.includes(i);
        return (
          <button key={i} type="button" onClick={() => onChange(active ? value.filter(x => x !== i) : [...value, i].sort())} style={{
            flex: 1, padding: "9px 0", borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: "pointer",
            background: active ? COLORS.primary : COLORS.surface2, color: active ? COLORS.bg : COLORS.textMuted,
            border: `1px solid ${active ? COLORS.primary : COLORS.border}`,
          }}>{d}</button>
        );
      })}
    </div>
  );
}

const TIME_PRESETS = [
  ["Ráno", "07:00"], ["Poledne", "12:00"], ["Odpoledne", "15:00"], ["Večer", "19:00"], ["Noc", "22:00"],
];

function TimeStepper({ label, value, onDec, onInc }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <button type="button" onClick={onInc} style={stepperBtn}><Plus size={14} color={COLORS.text} /></button>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 30, fontWeight: 700, color: COLORS.text, minWidth: 48, textAlign: "center" }}>
        {String(value).padStart(2, "0")}
      </div>
      <button type="button" onClick={onDec} style={stepperBtn}><Minus size={14} color={COLORS.text} /></button>
      <div style={{ fontSize: 9, letterSpacing: 1, color: COLORS.textMuted }}>{label}</div>
    </div>
  );
}

// 24h European time picker — no native <input type="time">, so no locale-dependent AM/PM
function TimeWheelValue({ label, value, max, step = 1, onChange }) {
  const dragStart = useRef(null);
  const settleTimer = useRef(null);
  const [rolling, setRolling] = useState(false);
  const wrap = (next) => ((next % (max + 1)) + (max + 1)) % (max + 1);
  const set = (next) => {
    const wrapped = wrap(next);
    if (wrapped !== value) {
      setRolling(true);
      if (settleTimer.current) window.clearTimeout(settleTimer.current);
      settleTimer.current = window.setTimeout(() => setRolling(false), 180);
    }
    onChange(wrapped);
  };
  const startDrag = (clientY) => { dragStart.current = { y: clientY, value }; };
  const moveDrag = (clientY) => {
    if (!dragStart.current) return;
    const deltaSteps = Math.trunc((dragStart.current.y - clientY) / 14);
    set(dragStart.current.value + deltaSteps * step);
  };
  useEffect(() => () => {
    if (settleTimer.current) window.clearTimeout(settleTimer.current);
  }, []);

  return (
    <div
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); startDrag(e.clientY); }}
      onPointerMove={(e) => moveDrag(e.clientY)}
      onPointerUp={() => { dragStart.current = null; }}
      onPointerCancel={() => { dragStart.current = null; }}
      onWheel={(e) => { e.preventDefault(); set(value + (e.deltaY > 0 ? -step : step)); }}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flex: 1, cursor: "ns-resize", touchAction: "none", userSelect: "none" }}
    >
      <div className="time-wheel-window" style={{ position: "relative", width: "100%", height: 132, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className={rolling ? "time-wheel-roll" : ""} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, width: "100%" }}>
          <div className="time-wheel-ghost">{String(wrap(value + step * 2)).padStart(2, "0")}</div>
          <div className="time-wheel-neighbor">{String(wrap(value + step)).padStart(2, "0")}</div>
          <div className="time-wheel-active">{String(value).padStart(2, "0")}</div>
          <div className="time-wheel-neighbor lower">{String(wrap(value - step)).padStart(2, "0")}</div>
          <div className="time-wheel-ghost lower">{String(wrap(value - step * 2)).padStart(2, "0")}</div>
        </div>
      </div>
      <div style={{ fontSize: 9, letterSpacing: 1, color: COLORS.textMuted }}>{label}</div>
    </div>
  );
}

function TimePicker({ value, onChange }) {
  const [h, m] = value.split(":").map(Number);
  const set = (nh, nm) => onChange(`${String(((nh % 24) + 24) % 24).padStart(2, "0")}:${String(((nm % 60) + 60) % 60).padStart(2, "0")}`);

  return (
    <div style={{ ...glassSurface(0.5), borderRadius: 16, padding: "18px 12px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
        <TimeWheelValue label="HODIN" value={h} max={23} onChange={(next) => set(next, m)} />
        <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 58, fontWeight: 800, color: COLORS.textMuted, marginTop: -22 }}>:</div>
        <TimeWheelValue label="MINUT" value={m} max={59} step={1} onChange={(next) => set(h, next)} />
      </div>
      <div style={{ display: "none", alignItems: "center", justifyContent: "center", gap: 16 }}>
        <TimeStepper label="HODIN" value={h} onInc={() => set(h + 1, m)} onDec={() => set(h - 1, m)} />
        <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 30, fontWeight: 700, color: COLORS.textMuted, marginTop: -18 }}>:</div>
        <TimeStepper label="MINUT" value={m} onInc={() => set(h, m + 5)} onDec={() => set(h, m - 5)} />
      </div>
      <div style={{ display: "none", gap: 6, marginTop: 14, flexWrap: "wrap", justifyContent: "center" }}>
        {TIME_PRESETS.map(([label, t]) => (
          <button key={t} type="button" onClick={() => onChange(t)} style={{
            padding: "6px 10px", borderRadius: 10, fontSize: 11, cursor: "pointer",
            background: value === t ? COLORS.primary : COLORS.surface, color: value === t ? COLORS.bg : COLORS.textMuted,
            border: `1px solid ${value === t ? COLORS.primary : COLORS.border}`,
          }}>{label} · {t}</button>
        ))}
      </div>
    </div>
  );
}

function DatePickerCard({ value, onChange }) {
  const selected = parseDate(value);
  const year = selected.getFullYear();
  const month = selected.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const setMonth = (delta) => {
    const next = new Date(year, month + delta, Math.min(selected.getDate(), new Date(year, month + delta + 1, 0).getDate()));
    onChange(fmt(next));
  };
  const setDay = (day) => onChange(fmt(new Date(year, month, day)));

  return (
    <div style={{
      background: `linear-gradient(145deg, ${hexA(COLORS.primary, 0.12)}, ${hexA(COLORS.surface2, 0.8)})`,
      border: `1px solid ${hexA(COLORS.primary, 0.22)}`,
      borderRadius: 16,
      padding: 14,
      marginBottom: 16,
      boxShadow: `inset 0 1px 0 ${hexA("#FFFFFF", 0.08)}, 0 0 24px ${hexA(COLORS.primary, 0.08)}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
        <button type="button" onClick={() => setMonth(-1)} style={navBtn}><ChevronLeft size={18} color={COLORS.text} /></button>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 15, fontWeight: 700, textTransform: "capitalize" }}>
            {selected.toLocaleDateString("cs-CZ", { month: "long", year: "numeric" })}
          </div>
          <div style={{ color: COLORS.textMuted, fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", marginTop: 3 }}>
            {selected.toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "long" })}
          </div>
        </div>
        <button type="button" onClick={() => setMonth(1)} style={navBtn}><ChevronRight size={18} color={COLORS.text} /></button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
        {days.map(day => {
          const active = day === selected.getDate();
          return (
            <button
              key={day}
              type="button"
              onClick={() => setDay(day)}
              style={{
                aspectRatio: "1",
                borderRadius: 10,
                border: `1px solid ${active ? COLORS.primary : COLORS.border}`,
                background: active ? COLORS.primary : hexA(COLORS.surface2, 0.75),
                color: active ? COLORS.bg : COLORS.text,
                fontFamily: "'IBM Plex Mono', monospace",
                fontWeight: active ? 800 : 600,
                cursor: "pointer",
                boxShadow: active ? `0 0 18px ${hexA(COLORS.primary, 0.35)}` : "none",
              }}
            >{day}</button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// SCREENS
// ============================================================================
function TodayScreen({ habits, entries, onAdjust, onComplete, onToggleChecklistItem, todayKey, onEdit, onDelete, settings }) {
  const [actionHabit, setActionHabit] = useState(null);
  const [actionAnchor, setActionAnchor] = useState(null);
  const [justCompleted, setJustCompleted] = useState(null);
  const [expandedChecklist, setExpandedChecklist] = useState(null);
  const [now, setNow] = useState(() => new Date());
  const longPressTimer = useRef(null);
  const longPressOpened = useRef(false);
  const scheduled = habits.filter(h => isScheduled(h, todayDate()));
  const score = dayScore(habits, entries, todayDate()) ?? 0;
  const perfectStreak = getPerfectStreak(habits, entries, todayDate());
  const level = getLevel(perfectStreak);
  const pct = Math.round(score * 100);
  const doneCount = scheduled.filter(h => isDone(h, entries[todayKey]?.[h.id])).length;
  const headline = settings?.name?.trim() || level.name;
  const pendingHabits = scheduled.filter(h => !isDone(h, entries[todayKey]?.[h.id]));
  const doneHabits = scheduled.filter(h => isDone(h, entries[todayKey]?.[h.id]));

  const heroMsg = scheduled.length === 0 ? "Dnes nic naplánováno." : pct === 100 ? "Vše splněno. Oheň hoří naplno." : pct === 0 ? "Ještě jsi nezačal. Zapal ho." : "Oheň roste s každým splněným úkolem.";

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const clearLongPress = () => {
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  };

  const openActions = (habit, target) => {
    clearLongPress();
    longPressOpened.current = true;
    if (target) {
      const rect = target.getBoundingClientRect();
      setActionAnchor({ top: rect.bottom + 8, left: rect.left, width: rect.width });
    }
    setActionHabit(habit);
  };

  const handleTileClick = (habit) => {
    if (longPressOpened.current) {
      longPressOpened.current = false;
      return;
    }
    const wasDone = isDone(habit, entries[todayKey]?.[habit.id]);
    if (!wasDone) {
      setJustCompleted(habit.id);
      window.setTimeout(() => setJustCompleted(id => id === habit.id ? null : id), 760);
    }
    onComplete(habit);
  };

  const habitTile = (h) => {
    const raw = entries[todayKey]?.[h.id];
    const done = isDone(h, raw);
    const C = CATS[h.cat];
    const isChecklist = h.type === "checklist";
    const isQuantified = h.type === "counter" || h.type === "sleep";
    const checklistDone = (h.checklist || []).filter(item => !!raw?.items?.[item.id]).length;
    const checklistTotal = (h.checklist || []).length;
    const checklistOpen = expandedChecklist === h.id;
    const timeStatus = (h.type === "check" || isChecklist) ? (done ? "splněno" : remainingLabel(h, now)) : null;
    const baseDetail = h.type === "check"
      ? h.time
      : isChecklist
        ? `${checklistDone} / ${checklistTotal} bodů`
        : h.type === "sleep" ? `${(raw || 0)} / ${h.target} h` : `${(raw || 0)} / ${h.target} sklenic`;
    const timeUrgent = !!timeStatus && timeStatus !== "splněno";
    return (
      <div
        key={h.id}
        role="button"
        tabIndex={0}
        className={done && justCompleted === h.id ? "habit-completed-arrival" : ""}
        onClick={() => handleTileClick(h)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleTileClick(h); } }}
        onContextMenu={(e) => { e.preventDefault(); openActions(h, e.currentTarget); }}
        onPointerDown={(e) => {
          clearLongPress();
          longPressOpened.current = false;
          const target = e.currentTarget;
          longPressTimer.current = window.setTimeout(() => openActions(h, target), 560);
        }}
        onPointerUp={clearLongPress}
        onPointerCancel={clearLongPress}
        onPointerLeave={clearLongPress}
        style={{
          display: "flex", flexDirection: "column", gap: 10, padding: 12, borderRadius: 16, cursor: "pointer",
          ...glassSurface(done ? 0.72 : 0.52),
          background: done ? `linear-gradient(135deg, ${hexA(C.color, 0.2)}, ${hexA(COLORS.surface, 0.68)})` : glassSurface(0.52).background,
          border: `1px solid ${done ? hexA(C.color, 0.75) : hexA("#FFFFFF", 0.11)}`,
          boxShadow: done ? `inset 0 1px 0 ${hexA("#FFFFFF", 0.1)}, 0 0 26px ${hexA(C.color, 0.2)}` : glassSurface(0.52).boxShadow,
          transition: "border-color .22s ease, background .22s ease, box-shadow .22s ease, transform .22s ease",
          touchAction: "manipulation",
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%" }}>
          <IconBadge cat={h.cat} done={done} />

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#FFFFFF", textDecoration: done ? "line-through" : "none", opacity: done ? 0.72 : 1 }}>{h.name}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginTop: 2 }}>
              <span style={{ fontSize: 12, color: COLORS.textMuted, fontFamily: "'IBM Plex Mono', monospace" }}>{baseDetail}</span>
              {timeStatus && (
                <span className={timeUrgent ? "live-countdown" : ""} style={{
                  fontFamily: "'Unbounded', sans-serif",
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: 0.2,
                  color: timeUrgent ? "#FF3B30" : COLORS.textMuted,
                  padding: timeUrgent ? "3px 7px" : 0,
                  borderRadius: 999,
                  background: timeUrgent ? "rgba(255,59,48,0.1)" : "transparent",
                  border: timeUrgent ? "1px solid rgba(255,59,48,0.28)" : "none",
                  boxShadow: timeUrgent ? "0 0 14px rgba(255,59,48,0.18)" : "none",
                }}>
                  {timeStatus}
                </span>
              )}
            </div>
            {h.type !== "check" && <ProgressBar frac={progressFrac(h, raw)} color={C.color} />}
          </div>

          {(h.type === "check" || isChecklist) && (
            <div style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {done ? <Check size={22} color={C.color} strokeWidth={3} /> : <Fingerprint size={22} color={C.color} strokeWidth={2.1} />}
            </div>
          )}

          {isChecklist && (
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); setExpandedChecklist(checklistOpen ? null : h.id); }}
              style={{ ...stepperBtn, background: checklistOpen ? C.color : COLORS.surface2, flexShrink: 0 }}
            >
              <ChevronDown size={16} color={checklistOpen ? COLORS.bg : COLORS.textMuted} style={{ transform: checklistOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform .2s ease" }} />
            </button>
          )}

          {isQuantified && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onAdjust(h.id, h.type === "sleep" ? -0.5 : -1, h.target); }}
                style={stepperBtn}
              ><Minus size={13} color={COLORS.text} /></button>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onAdjust(h.id, h.type === "sleep" ? 0.5 : 1, h.target); }}
                style={{ ...stepperBtn, background: C.color }}
              ><Plus size={13} color={COLORS.bg} /></button>
            </div>
          )}
        </div>

        {isChecklist && checklistOpen && (
          <div style={{ display: "flex", flexDirection: "column", gap: 7, width: "100%", padding: "4px 0 2px 50px" }}>
            {(h.checklist || []).map(item => {
              const itemDone = !!raw?.items?.[item.id];
              return (
                <button
                  key={item.id}
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); onToggleChecklistItem(h.id, item.id); }}
                  style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", padding: "2px 0", color: itemDone ? COLORS.textMuted : COLORS.text, textAlign: "left", cursor: "pointer" }}
                >
                  <Check size={14} color={itemDone ? C.color : COLORS.border} strokeWidth={3} />
                  <span style={{ fontSize: 12, textDecoration: itemDone ? "line-through" : "none" }}>{item.text}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ padding: "22px 18px 8px" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "6px 0 18px" }}>
        <Flame score={score} />
        <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 15, fontWeight: 700, color: COLORS.primary, marginTop: 4, letterSpacing: 0.3 }}>{headline}</div>
        <div style={{ fontSize: 12, color: COLORS.textMuted, textAlign: "center", marginTop: 2, maxWidth: 230 }}>{heroMsg}</div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", ...glassSurface(0.56), borderRadius: 18, padding: "14px 16px", marginBottom: 22 }}>
        <div style={{ textAlign: "center", flex: 1 }}>
          <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 18, fontWeight: 700 }}>{doneCount}/{scheduled.length}</div>
          <div style={{ fontSize: 10, color: COLORS.textMuted, letterSpacing: 0.5 }}>DNES</div>
        </div>
        <div style={{ width: 1, height: 28, background: COLORS.border }} />
        <div style={{ textAlign: "center", flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, fontFamily: "'Unbounded', sans-serif", fontSize: 18, fontWeight: 700, color: COLORS.primary }}>
            <FlameIcon size={15} fill={COLORS.primary} /> {perfectStreak}
          </div>
          <div style={{ fontSize: 10, color: COLORS.textMuted, letterSpacing: 0.5 }}>SÉRIE DNÍ</div>
        </div>
        <div style={{ width: 1, height: 28, background: COLORS.border }} />
        <div style={{ textAlign: "center", flex: 1 }}>
          <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 18, fontWeight: 700 }}>{pct}%</div>
          <div style={{ fontSize: 10, color: COLORS.textMuted, letterSpacing: 0.5 }}>VITALITA</div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10, fontFamily: "'IBM Plex Mono', monospace" }}>
        <div style={{ fontSize: 12, letterSpacing: 1, color: COLORS.textMuted }}>PŘIPOMÍNKY</div>
        <div style={{ fontSize: 12, color: COLORS.textMuted, textAlign: "right", whiteSpace: "nowrap" }}>
          {todayDate().toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "long" })}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingBottom: 90 }}>
        {pendingHabits.map(habitTile)}
        {doneHabits.length > 0 && (
          <div style={{ fontSize: 12, letterSpacing: 1, color: COLORS.textMuted, margin: "8px 0 0", fontFamily: "'IBM Plex Mono', monospace" }}>SPLNĚNO</div>
        )}
        {doneHabits.map(habitTile)}
        {scheduled.length === 0 && (
          <div style={{ color: COLORS.textMuted, fontSize: 13, textAlign: "center", padding: 30 }}>Na dnešek nic nemáš naplánované.</div>
        )}
      </div>

      {actionHabit && (
        <div onClick={() => setActionHabit(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.24)", zIndex: 25, padding: 14 }}>
          <div className="tile-action-popover" onClick={(e) => e.stopPropagation()} style={{
            position: "fixed",
            top: actionAnchor?.top ?? 80,
            left: actionAnchor?.left ?? 14,
            width: actionAnchor?.width ?? "calc(100% - 28px)",
            ...glassSurface(0.72), borderRadius: 20, padding: 14
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, margin: "2px 4px 12px" }}>{actionHabit.name}</div>
            <button onClick={() => { onEdit(actionHabit); setActionHabit(null); }} style={actionSheetBtn}>
              <Pencil size={17} color={COLORS.text} /> Upravit
            </button>
            <button onClick={() => { onDelete(actionHabit.id); setActionHabit(null); }} style={{ ...actionSheetBtn, color: COLORS.danger }}>
              <Trash2 size={17} color={COLORS.danger} /> Odebrat
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CalendarScreen({ habits, entries }) {
  const [cursor, setCursor] = useState(new Date());
  const year = cursor.getFullYear(), month = cursor.getMonth();
  const startOffset = dowIndex(new Date(year, month, 1));
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [...Array(startOffset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  return (
    <div style={{ minHeight: "calc(100vh - 78px)", padding: "22px 18px 90px", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 430 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <button onClick={() => setCursor(new Date(year, month - 1, 1))} style={navBtn}><ChevronLeft size={18} color={COLORS.text} /></button>
        <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 18, fontWeight: 600, textTransform: "capitalize", textAlign: "center", flex: 1 }}>{MONTHS[month]} {year}</div>
        <button onClick={() => setCursor(new Date(year, month + 1, 1))} style={navBtn}><ChevronRight size={18} color={COLORS.text} /></button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6, marginBottom: 8 }}>
        {DOW.map(d => <div key={d} style={{ textAlign: "center", fontSize: 11, color: COLORS.textMuted, fontFamily: "'IBM Plex Mono', monospace" }}>{d}</div>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6 }}>
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const date = new Date(year, month, d);
          const key = fmt(date);
          const frac = dayScore(habits, entries, date);
          const isToday = fmt(todayDate()) === key;
          return (
            <div key={i} style={{
              aspectRatio: "1", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
              ...glassSurface(0.42),
              background: frac == null ? glassSurface(0.38).background : frac === 0 ? glassSurface(0.46).background : `linear-gradient(145deg, ${hexA(COLORS.primary, 0.18 + frac * 0.42)}, ${hexA(COLORS.surface, 0.54)})`,
              border: isToday ? `1.5px solid ${COLORS.primary}` : `1px solid ${hexA("#FFFFFF", 0.1)}`,
            }}>
              <div style={{ fontSize: 12, color: frac > 0.6 ? COLORS.bg : COLORS.text, fontWeight: isToday ? 700 : 400 }}>{d}</div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 24, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 12, color: COLORS.textMuted }}>
        <div style={{ width: 12, height: 12, borderRadius: 4, background: hexA(COLORS.primary, 0.25) }} /> málo
        <div style={{ width: 12, height: 12, borderRadius: 4, background: hexA(COLORS.primary, 0.85) }} /> vše splněno
      </div>
      </div>
    </div>
  );
}

function StatsScreen({ habits, entries, onShare, settings }) {
  const last14 = useMemo(() => {
    const arr = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const s = dayScore(habits, entries, d);
      arr.push({ label: d.toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" }), vitalita: s == null ? 0 : Math.round(s * 100) });
    }
    return arr;
  }, [habits, entries]);
  const perfectStreak = getPerfectStreak(habits, entries, todayDate());
  const level = getLevel(perfectStreak);
  const headline = settings?.name?.trim() || level.name;

  return (
    <div style={{ padding: "22px 18px 90px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 20, fontWeight: 600 }}>Statistiky</div>
        <button onClick={onShare} style={{ display: "flex", alignItems: "center", gap: 6, ...glassSurface(0.48), borderRadius: 10, padding: "7px 12px", color: COLORS.text, fontSize: 12, cursor: "pointer" }}>
          <Share2 size={13} /> Sdílet
        </button>
      </div>

      <div style={{ ...glassSurface(0.54), borderRadius: 16, padding: 16, marginBottom: 20, display: "flex", alignItems: "center", gap: 14 }}>
        <Flame score={Math.min(1, 0.4 + perfectStreak / 40)} size={72} />
        <div>
          <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 16, fontWeight: 700, color: COLORS.primary }}>{headline}</div>
          <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 2 }}>{level.desc}</div>
          {level.next && <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 4 }}>Ještě {level.next.min - perfectStreak} dní do „{level.next.name}“</div>}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
        {habits.map(h => {
          const streak = getHabitStreak(h, entries, todayDate());
          const C = CATS[h.cat];
          return (
            <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 12, ...glassSurface(0.5), borderRadius: 14, padding: 12 }}>
              <IconBadge cat={h.cat} done={false} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{h.name}</div>
                <div style={{ fontSize: 11, color: COLORS.textMuted }}>{C.label} · {scheduleLabel(h)}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, color: C.color, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 15 }}>
                <FlameIcon size={14} fill={C.color} /> {streak}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 12, letterSpacing: 1, color: COLORS.textMuted, marginBottom: 10, fontFamily: "'IBM Plex Mono', monospace" }}>VITALITA · POSLEDNÍCH 14 DNÍ</div>
      <div style={{ ...glassSurface(0.54), borderRadius: 16, padding: "14px 8px 4px", height: 170 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={last14} margin={{ top: 0, right: 4, left: -22, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={COLORS.border} />
            <XAxis dataKey="label" tick={{ fill: COLORS.textMuted, fontSize: 9 }} axisLine={{ stroke: COLORS.border }} tickLine={false} interval={1} />
            <Tooltip contentStyle={{ background: COLORS.surface2, border: `1px solid ${COLORS.border}`, borderRadius: 8, fontSize: 12 }} labelStyle={{ color: COLORS.text }} cursor={{ fill: COLORS.surface2 }} formatter={(v) => [`${v}%`, "vitalita"]} />
            <Bar dataKey="vitalita" fill={COLORS.primary} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ProfileScreen({ habits, entries, settings, onSaveSettings }) {
  const perfectStreak = getPerfectStreak(habits, entries, todayDate());
  const level = getLevel(perfectStreak);
  const score = dayScore(habits, entries, todayDate()) ?? 0;
  const headline = settings.name?.trim() || level.name;
  const [nameInput, setNameInput] = useState(settings.name || "");

  const commitName = () => {
    if (nameInput.trim() !== (settings.name || "")) onSaveSettings({ ...settings, name: nameInput.trim() });
  };
  const activeTheme = settings.theme || THEME_VARIANTS.find(t => t.accent === settings.accent && t.background === settings.background)?.id || DEFAULT_SETTINGS.theme;

  return (
    <div style={{ padding: "22px 18px 90px" }}>
      <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 20, fontWeight: 600, marginBottom: 18 }}>Profil</div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", ...glassSurface(0.54), borderRadius: 20, padding: "24px 16px", marginBottom: 20 }}>
        <Flame score={score} size={110} />
        <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 18, fontWeight: 700, color: COLORS.primary, marginTop: 8 }}>{headline}</div>
        <div style={{ fontSize: 12, color: COLORS.textMuted, textAlign: "center", marginTop: 4, maxWidth: 240 }}>{level.desc}</div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <div style={{ flex: 1, textAlign: "center", ...glassSurface(0.5), borderRadius: 16, padding: "16px 8px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, fontFamily: "'Unbounded', sans-serif", fontSize: 20, fontWeight: 700, color: COLORS.primary }}>
            <FlameIcon size={16} fill={COLORS.primary} /> {perfectStreak}
          </div>
          <div style={{ fontSize: 10, color: COLORS.textMuted, letterSpacing: 0.5, marginTop: 4 }}>SÉRIE DNÍ</div>
        </div>
        <div style={{ flex: 1, textAlign: "center", ...glassSurface(0.5), borderRadius: 16, padding: "16px 8px" }}>
          <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 20, fontWeight: 700 }}>{habits.length}</div>
          <div style={{ fontSize: 10, color: COLORS.textMuted, letterSpacing: 0.5, marginTop: 4 }}>NÁVYKŮ</div>
        </div>
      </div>

      <div style={{ fontSize: 12, letterSpacing: 1, color: COLORS.textMuted, marginBottom: 10, fontFamily: "'IBM Plex Mono', monospace" }}>NASTAVENÍ</div>

      <div style={{ ...glassSurface(0.52), borderRadius: 16, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 6 }}>TVOJE JMÉNO</div>
        <input
          value={nameInput}
          onChange={e => setNameInput(e.target.value)}
          onBlur={commitName}
          placeholder="Zobrazí se místo názvu levelu"
          style={{ ...inputStyle, marginBottom: 0 }}
        />
      </div>

      <div style={{ ...glassSurface(0.52), borderRadius: 16, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 10 }}>BAREVNÝ MOTIV</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
          {THEME_VARIANTS.map(theme => {
            const active = activeTheme === theme.id;
            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => onSaveSettings({ ...settings, theme: theme.id, accent: theme.accent, background: theme.background })}
                style={{
                  display: "flex", alignItems: "center", gap: 9, minHeight: 46, padding: "8px 10px", borderRadius: 12, cursor: "pointer",
                  ...glassSurface(active ? 0.62 : 0.42),
                  background: active ? `linear-gradient(145deg, ${hexA(theme.accent, 0.18)}, ${hexA(COLORS.surface2, 0.42)})` : glassSurface(0.42).background,
                  border: `1px solid ${active ? theme.accent : hexA("#FFFFFF", 0.1)}`,
                  color: COLORS.text,
                  boxShadow: active ? `0 0 18px ${hexA(theme.accent, 0.22)}` : "none",
                }}
              >
                <span style={{
                  width: 26, height: 26, borderRadius: 8, flexShrink: 0,
                  background: `linear-gradient(135deg, ${theme.accent}, ${theme.background})`,
                  border: `1px solid ${hexA("#FFFFFF", 0.18)}`,
                  boxShadow: `0 0 12px ${hexA(theme.accent, 0.25)}`,
                }} />
                <span style={{ fontSize: 12, fontWeight: 700, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{theme.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ ...glassSurface(0.52), borderRadius: 16, padding: 16, marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 4 }}>BARVA APLIKACE</div>
          <div style={{ fontSize: 12, fontFamily: "'IBM Plex Mono', monospace", color: COLORS.textMuted }}>{(settings.accent || DEFAULT_SETTINGS.accent).toUpperCase()}</div>
        </div>
        <input
          type="color"
          value={settings.accent || DEFAULT_SETTINGS.accent}
          onChange={e => onSaveSettings({ ...settings, theme: "custom", accent: e.target.value })}
          style={{ width: 48, height: 48, borderRadius: 12, border: `1px solid ${COLORS.border}`, background: "none", padding: 0, cursor: "pointer" }}
        />
      </div>

      <div style={{ ...glassSurface(0.52), borderRadius: 16, padding: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 4 }}>BARVA POZADÍ</div>
          <div style={{ fontSize: 12, fontFamily: "'IBM Plex Mono', monospace", color: COLORS.textMuted }}>{(settings.background || DEFAULT_SETTINGS.background).toUpperCase()}</div>
        </div>
        <input
          type="color"
          value={settings.background || DEFAULT_SETTINGS.background}
          onChange={e => onSaveSettings({ ...settings, theme: "custom", background: e.target.value })}
          style={{ width: 48, height: 48, borderRadius: 12, border: `1px solid ${COLORS.border}`, background: "none", padding: 0, cursor: "pointer" }}
        />
      </div>
    </div>
  );
}

function ShareCard({ onClose, score, streak, level, settings }) {
  const headline = settings?.name?.trim() || level.name;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 30, padding: 24 }}>
      <div style={{
        width: "100%", aspectRatio: "9/16", maxHeight: "78%", borderRadius: 24, overflow: "hidden", position: "relative",
        background: `radial-gradient(circle at 50% 30%, ${hexA(COLORS.primary, 0.35)} 0%, ${COLORS.bg} 65%)`,
        border: `1px solid ${COLORS.border}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8,
      }}>
        <Flame score={score} size={140} />
        <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 22, fontWeight: 700, color: COLORS.primary, marginTop: 6 }}>{headline}</div>
        <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 40, fontWeight: 700 }}>{streak} dní</div>
        <div style={{ fontSize: 13, color: COLORS.textMuted }}>série bez výpadku</div>
        <div style={{ position: "absolute", bottom: 16, fontSize: 11, letterSpacing: 2, color: COLORS.textMuted, fontFamily: "'IBM Plex Mono', monospace" }}>FIREHABITS</div>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 18, width: "100%" }}>
        <button onClick={onClose} style={{ flex: 1, background: COLORS.surface2, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: "12px 0", color: COLORS.text, fontSize: 13, cursor: "pointer" }}>Zavřít</button>
        <button style={{ flex: 1, background: COLORS.primary, border: "none", borderRadius: 12, padding: "12px 0", color: COLORS.bg, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Sdílet na IG</button>
      </div>
    </div>
  );
}

function HabitModal({ habit, onClose, onSave, onDelete }) {
  const isEdit = !!habit;
  const [name, setName] = useState(habit?.name || "");
  const [time, setTime] = useState(habit?.time || "08:00");
  const [cat, setCat] = useState(habit?.cat || "supplement");
  const [days, setDays] = useState(habit?.days || []);
  const [target, setTarget] = useState(habit?.target || (habit?.cat === "sleep" ? 7 : 8));
  const [once, setOnce] = useState(habit?.once || false);
  const [onceDate, setOnceDate] = useState(habit?.date || fmt(todayDate()));
  const [checklist, setChecklist] = useState(habit?.checklist || [{ id: `${Date.now()}`, text: "" }]);
  const [saved, setSaved] = useState(false);
  const saveTimer = useRef(null);

  const type = cat === "water" ? "counter" : cat === "sleep" ? "sleep" : cat === "custom" ? "checklist" : "check";
  const cleanChecklist = checklist.map(item => ({ ...item, text: item.text.trim() })).filter(item => item.text);
  const buildHabitPayload = () => ({
    id: habit?.id || `${Date.now()}`,
    name: name.trim(),
    time,
    cat,
    type,
    target,
    checklist: type === "checklist" ? cleanChecklist : [],
    once,
    days: once ? [] : days,
    date: once ? onceDate : null,
  });

  const handleSave = () => {
    if (!name.trim() || saved) return;
    const nextHabit = buildHabitPayload();
    if (isEdit) {
      onSave(nextHabit);
      return;
    }
    setSaved(true);
    saveTimer.current = window.setTimeout(() => onSave(nextHabit), 760);
  };

  useEffect(() => () => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
  }, []);

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: `linear-gradient(180deg, ${hexA(COLORS.bg, 0.58)}, rgba(0,0,0,0.72))`,
      backdropFilter: "blur(14px)",
      WebkitBackdropFilter: "blur(14px)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 20, padding: 16
    }}>
      <div className="habit-modal-card" style={{
        width: "100%",
        maxWidth: 430,
        background: `linear-gradient(145deg, ${hexA(COLORS.surface, 0.86)}, ${hexA(COLORS.bg, 0.72)})`,
        backdropFilter: "blur(22px)",
        WebkitBackdropFilter: "blur(22px)",
        borderRadius: 26,
        border: `1px solid ${hexA(COLORS.primary, 0.22)}`,
        boxShadow: `0 24px 80px rgba(0,0,0,0.55), inset 0 1px 0 ${hexA("#FFFFFF", 0.08)}`,
        maxHeight: "88vh",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        position: "relative"
      }}>
        <div style={{ position: "sticky", top: 0, zIndex: 2, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 18px 14px", borderBottom: `1px solid ${hexA("#FFFFFF", 0.08)}`, background: `linear-gradient(180deg, ${hexA(COLORS.surface, 0.74)}, ${hexA(COLORS.surface, 0.48)})`, backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)" }}>
          <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 17, fontWeight: 600 }}>{isEdit ? "Upravit návyk" : "Nový návyk"}</div>
          <button onClick={onClose} style={{ ...stepperBtn, width: 36, height: 36, borderRadius: 12 }}><X size={19} color={COLORS.textMuted} /></button>
        </div>

        {saved && (
          <div className="habit-save-success">
            <div className="habit-save-success-orb">
              <Check size={42} color="#FFFFFF" strokeWidth={3} />
            </div>
            <div className="habit-save-success-title">Návyk přidán</div>
            <div className="habit-save-success-subtitle">FireHabits ho rovnou zařadil do plánu.</div>
          </div>
        )}

        <div className="hide-scrollbar" style={{ overflowY: "auto", padding: "18px 20px 20px" }}>

        <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 6 }}>NÁZEV</div>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Např. Vitamín D"
          style={inputStyle} />

        <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 6 }}>TYP</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {Object.entries(CATS).map(([key, C]) => (
            <button key={key} onClick={() => setCat(key)} style={{
              flex: "1 1 40%", padding: "10px 0", borderRadius: 12, display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
              background: cat === key ? C.color : COLORS.surface2, border: `1px solid ${cat === key ? C.color : COLORS.border}`, cursor: "pointer",
            }}>
              <span style={{ fontSize: 18, lineHeight: 1 }}>{C.icon}</span>
              <span style={{ fontSize: 11, color: cat === key ? COLORS.bg : COLORS.textMuted }}>{C.label}</span>
            </button>
          ))}
        </div>

        {type === "check" || type === "checklist" ? (
          <>
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 6 }}>ČAS</div>
            <div style={{ marginBottom: 16 }}>
              <TimePicker value={time} onChange={setTime} />
            </div>
            {type === "checklist" && (
              <>
                <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 6 }}>CHECKLIST</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                  {checklist.map((item, index) => (
                    <div key={item.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input
                        value={item.text}
                        onChange={e => setChecklist(checklist.map(x => x.id === item.id ? { ...x, text: e.target.value } : x))}
                        placeholder={`Bod ${index + 1}`}
                        style={{ ...inputStyle, marginBottom: 0 }}
                      />
                      <button
                        type="button"
                        onClick={() => setChecklist(checklist.length === 1 ? [{ id: `${Date.now()}`, text: "" }] : checklist.filter(x => x.id !== item.id))}
                        style={{ ...stepperBtn, width: 38, height: 38, flexShrink: 0 }}
                      ><X size={15} color={COLORS.textMuted} /></button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setChecklist([...checklist, { id: `${Date.now()}-${checklist.length}`, text: "" }])}
                    style={{ ...actionSheetBtn, justifyContent: "center", marginTop: 2 }}
                  ><Plus size={16} color={COLORS.text} /> Přidat bod</button>
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 6 }}>DENNÍ CÍL ({type === "sleep" ? "hodin" : "sklenic"})</div>
            <input type="number" min="1" value={target} onChange={e => setTarget(Number(e.target.value))} style={inputStyle} />
          </>
        )}

        <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 6, marginTop: 4 }}>PLÁN</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button type="button" onClick={() => setOnce(false)} style={{
            flex: 1, padding: "10px 0", borderRadius: 12, fontSize: 12, fontWeight: 600, cursor: "pointer",
            background: !once ? COLORS.primary : COLORS.surface2, color: !once ? COLORS.bg : COLORS.textMuted,
            border: `1px solid ${!once ? COLORS.primary : COLORS.border}`,
          }}>Opakovaně</button>
          <button type="button" onClick={() => setOnce(true)} style={{
            flex: 1, padding: "10px 0", borderRadius: 12, fontSize: 12, fontWeight: 600, cursor: "pointer",
            background: once ? COLORS.primary : COLORS.surface2, color: once ? COLORS.bg : COLORS.textMuted,
            border: `1px solid ${once ? COLORS.primary : COLORS.border}`,
          }}>Konkrétní datum</button>
        </div>

        {once ? (
          <>
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 6 }}>DATUM</div>
            <DatePickerCard value={onceDate} onChange={setOnceDate} />
          </>
        ) : (
          <>
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 6 }}>DNY (prázdné = každý den)</div>
            <DayPicker value={days} onChange={setDays} />
          </>
        )}

        <button onClick={handleSave} disabled={saved}
          style={{ width: "100%", background: COLORS.primary, border: "none", borderRadius: 14, padding: "13px 0", color: COLORS.bg, fontWeight: 700, fontSize: 14, cursor: saved ? "default" : "pointer", boxShadow: `0 0 20px ${hexA(COLORS.primary, 0.4)}`, opacity: saved ? 0.76 : 1, transition: "opacity .18s ease, transform .18s ease" }}>
          {saved ? "Přidáno" : isEdit ? "Uložit změny" : "Přidat návyk"}
        </button>

        {isEdit && (
          <button onClick={() => onDelete(habit.id)} style={{ width: "100%", background: "none", border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: "11px 0", color: COLORS.danger, fontWeight: 600, fontSize: 13, cursor: "pointer", marginTop: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <Trash2 size={14} /> Smazat návyk
          </button>
        )}
        </div>
      </div>
    </div>
  );
}

function LevelUpBanner({ level, onClose, settings }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 40, padding: 30 }} onClick={onClose}>
      <div style={{ textAlign: "center" }}>
        <Flame score={0.95} size={150} />
        <div style={{ fontSize: 12, letterSpacing: 2, color: COLORS.textMuted, marginTop: 8 }}>NOVÝ LEVEL</div>
        <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 28, fontWeight: 700, color: COLORS.primary, marginTop: 4 }}>{level.name}</div>
        <div style={{ fontSize: 13, color: COLORS.textMuted, marginTop: 6, maxWidth: 240 }}>{level.desc}</div>
        <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 18 }}>ťukni pro pokračování</div>
      </div>
    </div>
  );
}

// ============================================================================
// ROOT
// ============================================================================
const DEFAULT_SETTINGS = { name: "", theme: "neon", accent: "#C13BFF", background: "#0E0A16" };

export default function HabitApp() {
  const [tab, setTab] = useState("today");
  const [habits, setHabits] = useState(DEFAULT_HABITS);
  const [entries, setEntries] = useState({});
  const [modal, setModal] = useState(null);
  const [showShare, setShowShare] = useState(false);
  const [levelUp, setLevelUp] = useState(null);
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const todayKey = fmt(todayDate());
  COLORS.primary = settings.accent || DEFAULT_SETTINGS.accent; // app-wide accent, chosen in Profil
  COLORS.bg = settings.background || DEFAULT_SETTINGS.background; // app background, chosen in Profil

  useEffect(() => {
    (async () => {
      let h = DEFAULT_HABITS, e = {}, lastLevel = null, s = DEFAULT_SETTINGS;
      try { const r = await storage.get("habits", false); if (r) h = JSON.parse(r.value); } catch {}
      try { const r = await storage.get("entries", false); if (r) e = JSON.parse(r.value); } catch {}
      try { const r = await storage.get("lastLevel", false); if (r) lastLevel = JSON.parse(r.value); } catch {}
      try { const r = await storage.get("settings", false); if (r) s = { ...DEFAULT_SETTINGS, ...JSON.parse(r.value) }; } catch {}
      setHabits(h); setEntries(e); setSettings(s);
      scheduleAllNotifications(h).catch(() => {});
      const lvl = getLevel(getPerfectStreak(h, e, todayDate()));
      if (lastLevel && lastLevel !== lvl.name && LEVELS.findIndex(l => l.name === lvl.name) > LEVELS.findIndex(l => l.name === lastLevel)) {
        setLevelUp(lvl);
      }
      try { await storage.set("lastLevel", JSON.stringify(lvl.name), false); } catch {}
      setReady(true);
    })();
  }, []);

  const saveSettings = useCallback(async (next) => {
    setSettings(next);
    try { await storage.set("settings", JSON.stringify(next), false); } catch {}
  }, []);

  const saveHabits = useCallback(async (next) => {
    setHabits(next);
    try { await storage.set("habits", JSON.stringify(next)); } catch {}
    scheduleAllNotifications(next).catch(() => {});
  }, []);
  const saveEntries = useCallback(async (next) => {
    setEntries(next);
    try { await storage.set("entries", JSON.stringify(next), false); } catch {}
    const lvl = getLevel(getPerfectStreak(habits, next, todayDate()));
    try {
      const r = await storage.get("lastLevel", false);
      const last = r ? JSON.parse(r.value) : null;
      if (last !== lvl.name && (!last || LEVELS.findIndex(l => l.name === lvl.name) > LEVELS.findIndex(l => l.name === last))) {
        setLevelUp(lvl);
        await storage.set("lastLevel", JSON.stringify(lvl.name), false);
      }
    } catch {}
  }, [habits]);

  const onAdjust = (habitId, delta, target) => {
    const day = entries[todayKey] || {};
    const cur = day[habitId] || 0;
    const next = Math.max(0, Math.min(target * 1.5, Math.round((cur + delta) * 10) / 10));
    saveEntries({ ...entries, [todayKey]: { ...day, [habitId]: next } });
  };
  const onComplete = (habit) => {
    const day = entries[todayKey] || {};
    const raw = day[habit.id];
    const nextValue = habit.type === "check"
      ? !raw
      : habit.type === "checklist"
        ? (habit.checklist || []).length > 0
          ? { items: Object.fromEntries((habit.checklist || []).map(item => [item.id, !isDone(habit, raw)])) }
          : { done: !isDone(habit, raw) }
        : isDone(habit, raw) ? 0 : habit.target;
    saveEntries({ ...entries, [todayKey]: { ...day, [habit.id]: nextValue } });
  };
  const onToggleChecklistItem = (habitId, itemId) => {
    const day = entries[todayKey] || {};
    const raw = day[habitId] || { items: {} };
    saveEntries({
      ...entries,
      [todayKey]: {
        ...day,
        [habitId]: { ...raw, items: { ...(raw.items || {}), [itemId]: !raw.items?.[itemId] } },
      },
    });
  };
  const saveHabit = (h) => {
    const exists = habits.some(x => x.id === h.id);
    saveHabits(exists ? habits.map(x => x.id === h.id ? h : x) : [...habits, h]);
    setModal(null);
  };
  const deleteHabit = (id) => { saveHabits(habits.filter(h => h.id !== id)); setModal(null); };

  const score = dayScore(habits, entries, todayDate()) ?? 0;
  const perfectStreak = getPerfectStreak(habits, entries, todayDate());
  const level = getLevel(perfectStreak);

  return (
    <div style={{
      minHeight: "100vh",
      background: `
        radial-gradient(circle at 20% -10%, ${hexA(COLORS.primary, 0.34)} 0%, transparent 34%),
        radial-gradient(circle at 90% 8%, ${hexA(COLORS.secondary, 0.12)} 0%, transparent 28%),
        radial-gradient(circle at 50% 100%, ${hexA(COLORS.sleepC, 0.16)} 0%, transparent 34%),
        linear-gradient(180deg, ${hexA(COLORS.bg, 0.96)} 0%, ${COLORS.bg} 100%)
      `,
      color: COLORS.text, fontFamily: "'Manrope', sans-serif", position: "relative"
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Unbounded:wght@500;600;700;800&family=Manrope:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        html, body, #root { min-height: 100%; }
        button { font-family: inherit; }
        @keyframes flicker { 0%,100% { transform: scale(1) rotate(-1deg); } 50% { transform: scale(1.035) rotate(1deg); } }
        .fire-flicker { animation: flicker 2.6s ease-in-out infinite; }
        @keyframes sparkleFloat { 0%,100% { opacity: 0.4; transform: translateY(0) scale(0.9); } 50% { opacity: 1; transform: translateY(-4px) scale(1.15); } }
        .sparkle-a { animation: sparkleFloat 1.8s ease-in-out infinite; }
        .sparkle-b { animation: sparkleFloat 1.8s ease-in-out infinite .5s; }
        @keyframes completedArrival {
          0% { transform: translateY(-18px) scale(0.98); box-shadow: 0 0 0 rgba(193,59,255,0); filter: brightness(1); }
          38% { transform: translateY(4px) scale(1.015); box-shadow: 0 0 34px rgba(193,59,255,0.58); filter: brightness(1.35); }
          100% { transform: translateY(0) scale(1); filter: brightness(1); }
        }
        .habit-completed-arrival { animation: completedArrival .72s cubic-bezier(.2,.9,.25,1); }
        @keyframes tileActionPopover {
          0% { opacity: 0; transform: translateY(-8px) scale(0.98); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        .tile-action-popover { animation: tileActionPopover .18s ease-out; transform-origin: top center; }
        .time-wheel-window {
          mask-image: linear-gradient(to bottom, transparent 0%, #000 24%, #000 76%, transparent 100%);
          -webkit-mask-image: linear-gradient(to bottom, transparent 0%, #000 24%, #000 76%, transparent 100%);
        }
        .time-wheel-active {
          font-family: 'Unbounded', sans-serif;
          font-size: 66px;
          font-weight: 800;
          color: ${COLORS.text};
          min-width: 116px;
          text-align: center;
          line-height: .92;
          text-shadow: 0 0 18px ${hexA(COLORS.primary, 0.28)};
        }
        .time-wheel-neighbor {
          font-family: 'Unbounded', sans-serif;
          font-size: 27px;
          font-weight: 700;
          color: ${COLORS.textMuted};
          opacity: .34;
          line-height: 1;
          filter: blur(.15px);
        }
        .time-wheel-neighbor.lower { opacity: .24; filter: blur(.45px); }
        .time-wheel-ghost {
          font-family: 'Unbounded', sans-serif;
          font-size: 18px;
          font-weight: 700;
          color: ${COLORS.textMuted};
          opacity: .1;
          line-height: 1;
          filter: blur(.7px);
        }
        .time-wheel-ghost.lower { opacity: .07; }
        @keyframes rouletteTick {
          0% { transform: translateY(-18px); filter: blur(1.2px); opacity: .72; }
          62% { transform: translateY(4px); filter: blur(.2px); opacity: 1; }
          100% { transform: translateY(0); filter: blur(0); opacity: 1; }
        }
        .time-wheel-roll { animation: rouletteTick .18s cubic-bezier(.22,.85,.28,1); }
        @keyframes liveCountdownPulse {
          0%, 100% { transform: translateY(0); filter: brightness(1); }
          50% { transform: translateY(-1px); filter: brightness(1.25); }
        }
        .live-countdown { animation: liveCountdownPulse 1s ease-in-out infinite; }
        @keyframes habitModalIn {
          0% { opacity: 0; transform: translateY(28px) scale(.94); filter: blur(8px); }
          62% { opacity: 1; transform: translateY(-4px) scale(1.01); filter: blur(0); }
          100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
        .habit-modal-card { animation: habitModalIn .34s cubic-bezier(.2,.9,.25,1); transform-origin: center; }
        @keyframes habitSaveSuccessIn {
          0% { opacity: 0; transform: scale(.92); backdrop-filter: blur(2px); }
          36% { opacity: 1; transform: scale(1.015); backdrop-filter: blur(18px); }
          100% { opacity: 1; transform: scale(1); backdrop-filter: blur(18px); }
        }
        @keyframes habitSuccessOrb {
          0% { transform: translateY(16px) scale(.48) rotate(-14deg); opacity: 0; box-shadow: 0 0 0 0 rgba(52, 199, 89, 0); }
          55% { transform: translateY(-3px) scale(1.12) rotate(4deg); opacity: 1; box-shadow: 0 0 0 18px rgba(52, 199, 89, .14); }
          100% { transform: translateY(0) scale(1) rotate(0deg); opacity: 1; box-shadow: 0 0 0 9px rgba(52, 199, 89, .04); }
        }
        @keyframes habitSuccessText {
          0% { opacity: 0; transform: translateY(12px); filter: blur(6px); }
          100% { opacity: 1; transform: translateY(0); filter: blur(0); }
        }
        .habit-save-success {
          position: absolute;
          inset: 0;
          z-index: 5;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 28px;
          text-align: center;
          background: linear-gradient(145deg, ${hexA(COLORS.surface, 0.82)}, ${hexA(COLORS.bg, 0.72)}), radial-gradient(circle at 50% 38%, rgba(52, 199, 89, .24), transparent 42%);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          animation: habitSaveSuccessIn .36s cubic-bezier(.2,.9,.25,1) both;
        }
        .habit-save-success-orb {
          width: 86px;
          height: 86px;
          border-radius: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(145deg, #34C759, #15B86A);
          border: 1px solid rgba(255,255,255,.35);
          animation: habitSuccessOrb .52s cubic-bezier(.16,1,.3,1) both;
        }
        .habit-save-success-title {
          margin-top: 20px;
          font-family: 'Unbounded', sans-serif;
          font-size: 22px;
          font-weight: 700;
          color: ${COLORS.text};
          animation: habitSuccessText .36s ease .12s both;
        }
        .habit-save-success-subtitle {
          margin-top: 8px;
          max-width: 260px;
          color: ${COLORS.textMuted};
          font-size: 13px;
          line-height: 1.45;
          animation: habitSuccessText .36s ease .2s both;
        }
        .hide-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
        .hide-scrollbar::-webkit-scrollbar { display: none; width: 0; height: 0; }
      `}</style>

      <div style={{ minHeight: "100vh" }}>
        {ready && tab === "today" && <TodayScreen habits={habits} entries={entries} onAdjust={onAdjust} onComplete={onComplete} onToggleChecklistItem={onToggleChecklistItem} todayKey={todayKey} onEdit={(h) => setModal(h)} onDelete={deleteHabit} settings={settings} />}
        {ready && tab === "calendar" && <CalendarScreen habits={habits} entries={entries} />}
        {ready && tab === "stats" && <StatsScreen habits={habits} entries={entries} onShare={() => setShowShare(true)} settings={settings} />}
        {ready && tab === "profile" && <ProfileScreen habits={habits} entries={entries} settings={settings} onSaveSettings={saveSettings} />}
      </div>

      {modal && <HabitModal habit={modal === "add" ? null : modal} onClose={() => setModal(null)} onSave={saveHabit} onDelete={deleteHabit} />}
      {showShare && <ShareCard onClose={() => setShowShare(false)} score={score} streak={perfectStreak} level={level} settings={settings} />}
      {levelUp && <LevelUpBanner level={levelUp} onClose={() => setLevelUp(null)} settings={settings} />}

      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, height: 78, ...glassSurface(0.58), borderRadius: "24px 24px 0 0", borderLeft: "none", borderRight: "none", borderBottom: "none", display: "flex", alignItems: "center", justifyContent: "space-around", padding: "0 6px" }}>
        <TabBtn icon={Home} label="Dnes" active={tab === "today"} onClick={() => setTab("today")} />
        <TabBtn icon={CalendarDays} label="Kalendář" active={tab === "calendar"} onClick={() => setTab("calendar")} />
        <button onClick={() => setModal("add")} style={{
          width: 62, height: 62, borderRadius: "50%", border: `1.5px solid ${hexA("#FFFFFF", 0.22)}`,
          background: `linear-gradient(145deg, ${COLORS.secondary} 0%, ${COLORS.primary} 55%, ${COLORS.sleepC} 100%)`,
          display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", marginTop: -34, flexShrink: 0,
          boxShadow: `0 0 0 6px ${hexA(COLORS.surface, 0.52)}, 0 10px 24px rgba(0,0,0,0.4), 0 0 26px ${hexA(COLORS.primary, 0.55)}, inset 0 1px 0 ${hexA("#FFFFFF", 0.35)}`,
        }}>
          <Plus size={24} color="#FFFFFF" strokeWidth={2.6} />
        </button>
        <TabBtn icon={BarChart3} label="Statistiky" active={tab === "stats"} onClick={() => setTab("stats")} />
        <TabBtn icon={User} label="Profil" active={tab === "profile"} onClick={() => setTab("profile")} />
      </div>
    </div>
  );
}

function TabBtn({ icon: Icon, label, active, onClick }) {
  return (
    <button onClick={onClick} style={{ background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, cursor: "pointer", padding: 6 }}>
      <Icon size={20} color={active ? COLORS.primary : COLORS.textMuted} strokeWidth={2.2} />
      <span style={{ fontSize: 10, color: active ? COLORS.primary : COLORS.textMuted }}>{label}</span>
    </button>
  );
}

const glassSurface = (opacity = 0.58) => ({
  background: `linear-gradient(145deg, ${hexA(COLORS.surface, opacity)}, ${hexA(COLORS.bg, opacity * 0.8)})`,
  border: `1px solid ${hexA("#FFFFFF", 0.11)}`,
  backdropFilter: "blur(20px) saturate(1.35)",
  WebkitBackdropFilter: "blur(20px) saturate(1.35)",
  boxShadow: `inset 0 1px 0 ${hexA("#FFFFFF", 0.08)}, 0 14px 38px rgba(0,0,0,0.22)`,
});
const navBtn = { width: 34, height: 34, borderRadius: 10, ...glassSurface(0.5), display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" };
const stepperBtn = { width: 26, height: 26, borderRadius: 8, ...glassSurface(0.48), display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" };
const actionSheetBtn = { width: "100%", minHeight: 48, ...glassSurface(0.56), borderRadius: 14, color: COLORS.text, display: "flex", alignItems: "center", gap: 10, padding: "0 14px", marginTop: 8, fontSize: 14, fontWeight: 700, cursor: "pointer" };
const inputStyle = { width: "100%", ...glassSurface(0.46), borderRadius: 12, padding: "10px 12px", color: COLORS.text, fontSize: 14, marginBottom: 16, outline: "none" };
