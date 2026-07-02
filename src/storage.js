// Drop-in replacement for the artifact's window.storage, backed by
// @capacitor/preferences so data survives real app restarts on the phone.
import { Preferences } from "@capacitor/preferences";

const storage = {
  async get(key) {
    const { value } = await Preferences.get({ key });
    if (value === null || value === undefined) return null;
    return { key, value };
  },
  async set(key, value) {
    await Preferences.set({ key, value });
    return { key, value };
  },
  async delete(key) {
    await Preferences.remove({ key });
    return { key, deleted: true };
  },
};

export default storage;
