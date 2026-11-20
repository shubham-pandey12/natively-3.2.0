export const id = 'modes';

export async function run(app) {
  return app.windows.get('launcher').evaluate(async () => {
    async function read(name, ...args) {
      try {
        const fn = window.electronAPI[name];
        if (typeof fn !== 'function') return { status: 'missing' };
        return await fn(...args);
      } catch (error) {
        return { status: 'error', message: error.message };
      }
    }
    const all = await read('modesGetAll');
    const active = await read('modesGetActive');
    const sections = [];
    if (Array.isArray(all)) {
      for (const { id: modeId, name, templateType } of all) {
        sections.push({
          modeId, name, templateType,
          notes: await read('modesGetNoteSections', modeId),
          defaults: await read('modesGetDefaultNoteSections', modeId),
        });
      }
    }
    return { all, active, sections };
  });
}
