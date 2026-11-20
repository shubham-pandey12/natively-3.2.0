export const id = 'licence';

export async function run(app) {
  return app.windows.get('launcher').evaluate(async () => {
    const api = window.electronAPI;
    const results = {};
    for (const name of ['licenseGetDetails', 'licenseCheckPremium', 'getTrialStatus']) {
      try {
        if (typeof api[name] !== 'function') {
          results[name] = { status: 'missing' };
          continue;
        }
        const value = await api[name]();
        results[name] = name === 'licenseGetDetails' && value
          ? { plan: value.plan, provider: value.provider, isPremium: value.isPremium }
          : value;
      } catch (error) {
        results[name] = { status: 'error', message: error.message };
      }
    }
    return results;
  });
}
