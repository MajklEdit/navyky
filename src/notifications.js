import { LocalNotifications } from "@capacitor/local-notifications";

// our days are Monday-first: Po=0, Út=1, St=2, Čt=3, Pá=4, So=5, Ne=6
// Capacitor's `weekday` follows JS-style Sunday-first but 1-indexed: Ne=1 ... So=7
function toCapacitorWeekday(ourIndex) {
  const jsDay = (ourIndex + 1) % 7; // Sunday = 0
  return jsDay + 1;
}

// stable-ish numeric id from a string, so re-scheduling the same habit
// reuses (and overwrites) the same notification ids instead of piling up
function hashId(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h % 1000000;
}

// first future date/time this hour:minute (optionally locked to a Capacitor weekday, Sun=1..Sat=7) occurs —
// always strictly in the future, so the very first notification never fires immediately at schedule-time
function nextOccurrence(hour, minute, weekday) {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
  if (weekday == null) {
    if (next <= now) next.setDate(next.getDate() + 1);
  } else {
    const jsTargetDay = weekday - 1; // Capacitor Sun=1..Sat=7 -> JS Sun=0..Sat=6
    let diff = (jsTargetDay - next.getDay() + 7) % 7;
    if (diff === 0 && next <= now) diff = 7;
    next.setDate(next.getDate() + diff);
  }
  return next;
}

export async function requestPermissions() {
  const perm = await LocalNotifications.checkPermissions();
  if (perm.display !== "granted") {
    await LocalNotifications.requestPermissions();
  }
}

// cancels any notifications previously scheduled for this habit id — clears every
// possible id shape (weekly slots + the one-time slot) so switching between
// "opakovaný návyk" and "jednorázově" never leaves a stale notification behind
export async function cancelHabitNotifications(habit) {
  const keys = [null, 0, 1, 2, 3, 4, 5, 6, "once"];
  const ids = keys.map((d) => hashId(`${habit.id}-${d}`));
  await LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) });
}

// schedules a notification for a time-based habit
// (water/sleep are all-day goals, not a single fixed time, so they're skipped here)
export async function scheduleHabitNotifications(habit) {
  await cancelHabitNotifications(habit);
  if (habit.type !== "check" && habit.type !== "checklist") return;
  if (!habit.time || !/^\d{2}:\d{2}$/.test(habit.time)) return;

  const [hour, minute] = habit.time.split(":").map(Number);

  if (habit.once) {
    if (!habit.date) return;
    const [year, month, day] = habit.date.split("-").map(Number);
    const at = new Date(year, month - 1, day, hour, minute, 0, 0);
    if (at <= new Date()) return; // one-time date/time already passed — nothing to schedule
    await LocalNotifications.schedule({
      notifications: [{
        id: hashId(`${habit.id}-once`),
        title: "FireHabits",
        body: `Čas na: ${habit.name}`,
        schedule: { at, allowWhileIdle: true },
      }],
    });
    return;
  }

  const days = habit.days && habit.days.length > 0 ? habit.days : [null];
  const notifications = days.map((d) => {
    const weekday = d === null ? null : toCapacitorWeekday(d);
    return {
      id: hashId(`${habit.id}-${d}`),
      title: "FireHabits",
      body: `Čas na: ${habit.name}`,
      schedule: {
        at: nextOccurrence(hour, minute, weekday),
        every: weekday == null ? "day" : "week",
        allowWhileIdle: true,
      },
    };
  });

  await LocalNotifications.schedule({ notifications });
}

export async function scheduleAllNotifications(habits) {
  await requestPermissions();
  for (const h of habits) {
    await scheduleHabitNotifications(h);
  }
}
