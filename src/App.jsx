import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Flame as FlameIcon, Check, ChevronLeft, ChevronRight,
  Plus, X, CalendarDays, BarChart3, Home, Trash2, Pencil, Minus, Share2, Sparkles, User,
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
  return (raw || 0) >= habit.target;
}
function progressFrac(habit, raw) {
  if (habit.type === "check") return raw ? 1 : 0;
  return Math.max(0, Math.min(1, (raw || 0) / habit.target));
}
function scheduleLabel(habit) {
  if (habit.once) return habit.date ? `jednorázově · ${parseDate(habit.date).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" })}` : "jednorázově";
  if (!habit.days || habit.days.length === 0 || habit.days.length === 7) return "každý den";
  return habit.days.map(i => DOW[i]).join(" · ");
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
function TimePicker({ value, onChange }) {
  const [h, m] = value.split(":").map(Number);
  const set = (nh, nm) => onChange(`${String(((nh % 24) + 24) % 24).padStart(2, "0")}:${String(((nm % 60) + 60) % 60).padStart(2, "0")}`);

  return (
    <div style={{ background: COLORS.surface2, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: "16px 16px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16 }}>
        <TimeStepper label="HODIN" value={h} onInc={() => set(h + 1, m)} onDec={() => set(h - 1, m)} />
        <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 30, fontWeight: 700, color: COLORS.textMuted, marginTop: -18 }}>:</div>
        <TimeStepper label="MINUT" value={m} onInc={() => set(h, m + 5)} onDec={() => set(h, m - 5)} />
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 14, flexWrap: "wrap", justifyContent: "center" }}>
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

// ============================================================================
// SCREENS
// ============================================================================
function TodayScreen({ habits, entries, onCheck, onAdjust, todayKey, onEdit, settings }) {
  const scheduled = habits.filter(h => isScheduled(h, todayDate()));
  const score = dayScore(habits, entries, todayDate()) ?? 0;
  const perfectStreak = getPerfectStreak(habits, entries, todayDate());
  const level = getLevel(perfectStreak);
  const pct = Math.round(score * 100);
  const doneCount = scheduled.filter(h => isDone(h, entries[todayKey]?.[h.id])).length;
  const headline = settings?.name?.trim() || level.name;

  const heroMsg = scheduled.length === 0 ? "Dnes nic naplánováno." : pct === 100 ? "Vše splněno. Oheň hoří naplno." : pct === 0 ? "Ještě jsi nezačal. Zapal ho." : "Oheň roste s každým splněným úkolem.";

  return (
    <div style={{ padding: "22px 18px 8px" }}>
      <div style={{ textAlign: "center", color: COLORS.textMuted, fontSize: 13, fontFamily: "'IBM Plex Mono', monospace" }}>
        {todayDate().toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "long" })}
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "6px 0 18px" }}>
        <Flame score={score} />
        <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 15, fontWeight: 700, color: COLORS.primary, marginTop: 4, letterSpacing: 0.3 }}>{headline}</div>
        <div style={{ fontSize: 12, color: COLORS.textMuted, textAlign: "center", marginTop: 2, maxWidth: 230 }}>{heroMsg}</div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: "14px 16px", marginBottom: 22 }}>
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

      <div style={{ fontSize: 12, letterSpacing: 1, color: COLORS.textMuted, marginBottom: 10, fontFamily: "'IBM Plex Mono', monospace" }}>PŘIPOMÍNKY</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingBottom: 90 }}>
        {scheduled.map(h => {
          const raw = entries[todayKey]?.[h.id];
          const done = isDone(h, raw);
          const C = CATS[h.cat];
          return (
            <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: 12, borderRadius: 16, background: COLORS.surface, border: `1px solid ${done ? C.color : COLORS.border}` }}>
              {h.type === "check" ? (
                <button onClick={() => onCheck(h.id)} style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}>
                  <IconBadge cat={h.cat} done={done} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "#FFFFFF", textDecoration: done ? "line-through" : "none", opacity: done ? 0.6 : 1 }}>{h.name}</div>
                    <div style={{ fontSize: 12, color: COLORS.textMuted, fontFamily: "'IBM Plex Mono', monospace" }}>{h.time}</div>
                  </div>
                  <div style={{ width: 26, height: 26, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: done ? C.color : "transparent", border: `1.5px solid ${done ? C.color : COLORS.border}` }}>
                    {done && <Check size={16} color={COLORS.bg} strokeWidth={3} />}
                  </div>
                </button>
              ) : (
                <>
                  <IconBadge cat={h.cat} done={done} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "#FFFFFF" }}>{h.name}</div>
                    <div style={{ fontSize: 12, color: COLORS.textMuted, fontFamily: "'IBM Plex Mono', monospace" }}>
                      {h.type === "sleep" ? `${(raw || 0)} / ${h.target} h` : `${(raw || 0)} / ${h.target} sklenic`}
                    </div>
                    <ProgressBar frac={progressFrac(h, raw)} color={C.color} />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                    <button onClick={() => onAdjust(h.id, h.type === "sleep" ? -0.5 : -1, h.target)} style={stepperBtn}><Minus size={13} color={COLORS.text} /></button>
                    <button onClick={() => onAdjust(h.id, h.type === "sleep" ? 0.5 : 1, h.target)} style={{ ...stepperBtn, background: C.color }}><Plus size={13} color={COLORS.bg} /></button>
                  </div>
                </>
              )}
              <button onClick={() => onEdit(h)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, flexShrink: 0 }}>
                <Pencil size={14} color={COLORS.textMuted} />
              </button>
            </div>
          );
        })}
        {scheduled.length === 0 && (
          <div style={{ color: COLORS.textMuted, fontSize: 13, textAlign: "center", padding: 30 }}>Na dnešek nic nemáš naplánované.</div>
        )}
      </div>
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
    <div style={{ padding: "22px 18px 90px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <button onClick={() => setCursor(new Date(year, month - 1, 1))} style={navBtn}><ChevronLeft size={18} color={COLORS.text} /></button>
        <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 18, fontWeight: 600, textTransform: "capitalize" }}>{MONTHS[month]} {year}</div>
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
              background: frac == null ? COLORS.surface : frac === 0 ? COLORS.surface2 : hexA(COLORS.primary, 0.22 + frac * 0.62),
              border: isToday ? `1.5px solid ${COLORS.primary}` : `1px solid ${COLORS.border}`,
            }}>
              <div style={{ fontSize: 12, color: frac > 0.6 ? COLORS.bg : COLORS.text, fontWeight: isToday ? 700 : 400 }}>{d}</div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 24, display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: COLORS.textMuted }}>
        <div style={{ width: 12, height: 12, borderRadius: 4, background: hexA(COLORS.primary, 0.25) }} /> málo
        <div style={{ width: 12, height: 12, borderRadius: 4, background: hexA(COLORS.primary, 0.85) }} /> vše splněno
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
        <button onClick={onShare} style={{ display: "flex", alignItems: "center", gap: 6, background: COLORS.surface2, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "7px 12px", color: COLORS.text, fontSize: 12, cursor: "pointer" }}>
          <Share2 size={13} /> Sdílet
        </button>
      </div>

      <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 16, marginBottom: 20, display: "flex", alignItems: "center", gap: 14 }}>
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
            <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 12, background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 12 }}>
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
      <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: "14px 8px 4px", height: 170 }}>
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

  return (
    <div style={{ padding: "22px 18px 90px" }}>
      <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 20, fontWeight: 600, marginBottom: 18 }}>Profil</div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 20, padding: "24px 16px", marginBottom: 20 }}>
        <Flame score={score} size={110} />
        <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 18, fontWeight: 700, color: COLORS.primary, marginTop: 8 }}>{headline}</div>
        <div style={{ fontSize: 12, color: COLORS.textMuted, textAlign: "center", marginTop: 4, maxWidth: 240 }}>{level.desc}</div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <div style={{ flex: 1, textAlign: "center", background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: "16px 8px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, fontFamily: "'Unbounded', sans-serif", fontSize: 20, fontWeight: 700, color: COLORS.primary }}>
            <FlameIcon size={16} fill={COLORS.primary} /> {perfectStreak}
          </div>
          <div style={{ fontSize: 10, color: COLORS.textMuted, letterSpacing: 0.5, marginTop: 4 }}>SÉRIE DNÍ</div>
        </div>
        <div style={{ flex: 1, textAlign: "center", background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: "16px 8px" }}>
          <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 20, fontWeight: 700 }}>{habits.length}</div>
          <div style={{ fontSize: 10, color: COLORS.textMuted, letterSpacing: 0.5, marginTop: 4 }}>NÁVYKŮ</div>
        </div>
      </div>

      <div style={{ fontSize: 12, letterSpacing: 1, color: COLORS.textMuted, marginBottom: 10, fontFamily: "'IBM Plex Mono', monospace" }}>NASTAVENÍ</div>

      <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 6 }}>TVOJE JMÉNO</div>
        <input
          value={nameInput}
          onChange={e => setNameInput(e.target.value)}
          onBlur={commitName}
          placeholder="Zobrazí se místo názvu levelu"
          style={{ ...inputStyle, marginBottom: 0 }}
        />
      </div>

      <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 16, marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 4 }}>BARVA APLIKACE</div>
          <div style={{ fontSize: 12, fontFamily: "'IBM Plex Mono', monospace", color: COLORS.textMuted }}>{(settings.accent || DEFAULT_SETTINGS.accent).toUpperCase()}</div>
        </div>
        <input
          type="color"
          value={settings.accent || DEFAULT_SETTINGS.accent}
          onChange={e => onSaveSettings({ ...settings, accent: e.target.value })}
          style={{ width: 48, height: 48, borderRadius: 12, border: `1px solid ${COLORS.border}`, background: "none", padding: 0, cursor: "pointer" }}
        />
      </div>

      <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 4 }}>BARVA POZADÍ</div>
          <div style={{ fontSize: 12, fontFamily: "'IBM Plex Mono', monospace", color: COLORS.textMuted }}>{(settings.background || DEFAULT_SETTINGS.background).toUpperCase()}</div>
        </div>
        <input
          type="color"
          value={settings.background || DEFAULT_SETTINGS.background}
          onChange={e => onSaveSettings({ ...settings, background: e.target.value })}
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
        <div style={{ position: "absolute", bottom: 16, fontSize: 11, letterSpacing: 2, color: COLORS.textMuted, fontFamily: "'IBM Plex Mono', monospace" }}>OHÝNEK</div>
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

  const type = cat === "water" ? "counter" : cat === "sleep" ? "sleep" : "check";

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "flex-end", zIndex: 20 }}>
      <div style={{ width: "100%", background: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, border: `1px solid ${COLORS.border}`, maxHeight: "88%", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 17, fontWeight: 600 }}>{isEdit ? "Upravit návyk" : "Nový návyk"}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={20} color={COLORS.textMuted} /></button>
        </div>

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

        {type === "check" ? (
          <>
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 6 }}>ČAS</div>
            <div style={{ marginBottom: 16 }}>
              <TimePicker value={time} onChange={setTime} />
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 6 }}>DENNÍ CÍL ({type === "sleep" ? "hodin" : "sklenic"})</div>
            <input type="number" min="1" value={target} onChange={e => setTarget(Number(e.target.value))} style={inputStyle} />
          </>
        )}

        <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 6, marginTop: 4 }}>OPAKOVÁNÍ</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button type="button" onClick={() => setOnce(false)} style={{
            flex: 1, padding: "10px 0", borderRadius: 12, fontSize: 12, fontWeight: 600, cursor: "pointer",
            background: !once ? COLORS.primary : COLORS.surface2, color: !once ? COLORS.bg : COLORS.textMuted,
            border: `1px solid ${!once ? COLORS.primary : COLORS.border}`,
          }}>Opakovaný návyk</button>
          <button type="button" onClick={() => setOnce(true)} style={{
            flex: 1, padding: "10px 0", borderRadius: 12, fontSize: 12, fontWeight: 600, cursor: "pointer",
            background: once ? COLORS.primary : COLORS.surface2, color: once ? COLORS.bg : COLORS.textMuted,
            border: `1px solid ${once ? COLORS.primary : COLORS.border}`,
          }}>Jednorázově</button>
        </div>

        {once ? (
          <>
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 6 }}>DATUM</div>
            <input type="date" value={onceDate} onChange={e => setOnceDate(e.target.value)} style={inputStyle} />
          </>
        ) : (
          <>
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 6 }}>DNY (prázdné = každý den)</div>
            <DayPicker value={days} onChange={setDays} />
          </>
        )}

        <button onClick={() => { if (name.trim()) onSave({ id: habit?.id || `${Date.now()}`, name: name.trim(), time, cat, type, target, once, days: once ? [] : days, date: once ? onceDate : null }); }}
          style={{ width: "100%", background: COLORS.primary, border: "none", borderRadius: 14, padding: "13px 0", color: COLORS.bg, fontWeight: 700, fontSize: 14, cursor: "pointer", boxShadow: `0 0 20px ${hexA(COLORS.primary, 0.4)}` }}>
          {isEdit ? "Uložit změny" : "Přidat návyk"}
        </button>

        {isEdit && (
          <button onClick={() => onDelete(habit.id)} style={{ width: "100%", background: "none", border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: "11px 0", color: COLORS.danger, fontWeight: 600, fontSize: 13, cursor: "pointer", marginTop: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <Trash2 size={14} /> Smazat návyk
          </button>
        )}
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
const DEFAULT_SETTINGS = { name: "", accent: "#C13BFF", background: "#0E0A16" };

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

  const onCheck = (habitId) => {
    const day = entries[todayKey] || {};
    saveEntries({ ...entries, [todayKey]: { ...day, [habitId]: !day[habitId] } });
  };
  const onAdjust = (habitId, delta, target) => {
    const day = entries[todayKey] || {};
    const cur = day[habitId] || 0;
    const next = Math.max(0, Math.min(target * 1.5, Math.round((cur + delta) * 10) / 10));
    saveEntries({ ...entries, [todayKey]: { ...day, [habitId]: next } });
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
    <div style={{ minHeight: "100vh", background: `radial-gradient(circle at 30% 0%, #241338 0%, ${COLORS.bg} 60%)`, color: COLORS.text, fontFamily: "'Manrope', sans-serif", position: "relative" }}>
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
      `}</style>

      <div style={{ minHeight: "100vh" }}>
        {ready && tab === "today" && <TodayScreen habits={habits} entries={entries} onCheck={onCheck} onAdjust={onAdjust} todayKey={todayKey} onEdit={(h) => setModal(h)} settings={settings} />}
        {ready && tab === "calendar" && <CalendarScreen habits={habits} entries={entries} />}
        {ready && tab === "stats" && <StatsScreen habits={habits} entries={entries} onShare={() => setShowShare(true)} settings={settings} />}
        {ready && tab === "profile" && <ProfileScreen habits={habits} entries={entries} settings={settings} onSaveSettings={saveSettings} />}
      </div>

      {modal && <HabitModal habit={modal === "add" ? null : modal} onClose={() => setModal(null)} onSave={saveHabit} onDelete={deleteHabit} />}
      {showShare && <ShareCard onClose={() => setShowShare(false)} score={score} streak={perfectStreak} level={level} settings={settings} />}
      {levelUp && <LevelUpBanner level={levelUp} onClose={() => setLevelUp(null)} settings={settings} />}

      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, height: 78, background: "rgba(26,19,38,0.92)", backdropFilter: "blur(8px)", borderTop: `1px solid ${COLORS.border}`, display: "flex", alignItems: "center", justifyContent: "space-around", padding: "0 6px" }}>
        <TabBtn icon={Home} label="Dnes" active={tab === "today"} onClick={() => setTab("today")} />
        <TabBtn icon={CalendarDays} label="Kalendář" active={tab === "calendar"} onClick={() => setTab("calendar")} />
        <button onClick={() => setModal("add")} style={{
          width: 62, height: 62, borderRadius: "50%", border: `1.5px solid ${hexA("#FFFFFF", 0.22)}`,
          background: `linear-gradient(145deg, ${COLORS.secondary} 0%, ${COLORS.primary} 55%, ${COLORS.sleepC} 100%)`,
          display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", marginTop: -34, flexShrink: 0,
          boxShadow: `0 0 0 6px ${COLORS.surface}, 0 10px 24px rgba(0,0,0,0.4), 0 0 26px ${hexA(COLORS.primary, 0.55)}, inset 0 1px 0 ${hexA("#FFFFFF", 0.35)}`,
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

const navBtn = { width: 34, height: 34, borderRadius: 10, background: COLORS.surface, border: `1px solid ${COLORS.border}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" };
const stepperBtn = { width: 26, height: 26, borderRadius: 8, background: COLORS.surface2, border: `1px solid ${COLORS.border}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" };
const inputStyle = { width: "100%", background: COLORS.surface2, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: "10px 12px", color: COLORS.text, fontSize: 14, marginBottom: 16, outline: "none" };
