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

export async function requestPermissions() {
  const perm = await LocalNotifications.checkPermissions();
  if (perm.display !== "granted") {
    await LocalNotifications.requestPermissions();
  }
}

// cancels any notifications previously scheduled for this habit id
export async function cancelHabitNotifications(habit) {
  const days = habit.days && habit.days.length > 0 ? habit.days : [null];
  const ids = days.map((d) => hashId(`${habit.id}-${d}`));
  await LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) });
}

// schedules a repeating notification for a single "check" type habit
// (water/sleep are all-day goals, not a single fixed time, so they're skipped here)
export async function scheduleHabitNotifications(habit) {
  await cancelHabitNotifications(habit);
  if (habit.type !== "check") return;
  if (!habit.time || !/^\d{2}:\d{2}$/.test(habit.time)) return;

  const [hour, minute] = habit.time.split(":").map(Number);
  const days = habit.days && habit.days.length > 0 ? habit.days : [null];

  const notifications = days.map((d) => ({
    id: hashId(`${habit.id}-${d}`),
    title: "Ohýnek",
    body: `Čas na: ${habit.name}`,
    schedule: {
      on: d === null ? { hour, minute } : { hour, minute, weekday: toCapacitorWeekday(d) },
      repeats: true,
      allowWhileIdle: true,
    },
  }));

  await LocalNotifications.schedule({ notifications });
}

export async function scheduleAllNotifications(habits) {
  await requestPermissions();
  for (const h of habits) {
    await scheduleHabitNotifications(h);
  }
}
