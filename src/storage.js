// Lightweight persistence shim backed by localStorage.
// Mirrors the async { value } shape the original component expected from
// its host environment so the component logic stays unchanged.
export const storage = {
  async get(key) {
    const value = localStorage.getItem(key);
    return value == null ? null : { value };
  },
  async set(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },
};
