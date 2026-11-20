export const id = 'settings-roundtrip';

// Saves each setting back with the value it already has, so the profile ends
// unchanged but every setter still runs. Reads alone missed a merge regression
// where these three handlers called a function the merge had removed: the
// value saved, yet the UI was told the save failed (or the IPC threw).
// Add a pair only after reading its handler: the setter must accept the
// getter's value unchanged and have no effect beyond storing it.
const pairs = [
  { get: 'getFastModel', set: 'setFastModel', value: 'model' },
  { get: 'getDefaultModel', set: 'setDefaultModel', value: 'model' },
  { get: 'getSttProvider', set: 'setSttProvider', value: null },
];

export async function run(app) {
  const page = app.windows.get('launcher');
  const results = {};
  for (const pair of pairs) {
    results[pair.set] = await page.evaluate(async ({ get, set, value }) => {
      const api = window.electronAPI;
      if (typeof api[get] !== 'function' || typeof api[set] !== 'function') return { status: 'missing' };
      const current = await api[get]();
      const arg = value && current && typeof current === 'object' ? current[value] : current;
      // A setter refusing undefined is not what this checks; null is a legal "unset" for these.
      if (arg === undefined) return { status: 'no current value' };
      try {
        const saved = await api[set](arg);
        const after = await api[get]();
        return { saved, unchanged: JSON.stringify(after) === JSON.stringify(current) };
      } catch (error) {
        return { status: 'threw', message: String(error?.message ?? error).split('\n')[0] };
      }
    }, pair);
  }
  return results;
}
