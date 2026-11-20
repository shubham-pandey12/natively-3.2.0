const volatileKeys = /^(?:createdAt|created_at|updatedAt|updated_at|lastCheckedAt|fetchedAt|timestamp|timeStamp|expiresAt|expires_at|startedAt|endsAt|requestId|processId|pid|cdpPort)$/;
const rendererUrl = /file:\/\/\/[^\s)"']*?\/app\.asar\/dist\/|https?:\/\/(?:localhost|127\.0\.0\.1):\d+\//gi;

function normalizeValue(value, context) {
  if (typeof value === 'string') {
    let text = value;
    for (const folder of context.paths ?? []) {
      const normalized = folder.replaceAll('\\', '/').replace(/\/$/, '');
      text = text.replaceAll(normalized, '<workspace>');
      text = text.replaceAll(encodeURI(normalized), '<workspace>');
      text = text.replaceAll(normalized.replaceAll('/', '\\'), '<workspace>');
    }
    text = text.replace(/<workspace>(?:[\\/][^\s"'<>|:]+)+/g, (file) => file.replaceAll('\\', '/'));
    return text.replace(rendererUrl, 'app:///');
  }
  if (Array.isArray(value)) return value.map((item) => normalizeValue(item, context));
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).flatMap(([key, child]) => {
      if (volatileKeys.test(key)) return [];
      if (context.modeIds && /^(id|modeId)$/.test(key)) {
        if (context.modeIds.has(child)) return [[key, context.modeIds.get(child)]];
        return [];
      }
      return [[key, normalizeValue(child, context)]];
    });
    return Object.fromEntries(entries);
  }
  return value;
}

export function normalize(id, result, paths = []) {
  if (id === 'api-surface' && result.windows) {
    // Represent sets by key to report an added API once, regardless of its index.
    return { windows: Object.fromEntries(Object.entries(result.windows).map(([window, keys]) =>
      [window, Object.fromEntries([...new Set(keys)].sort().map((key) => [key, true]))])) };
  }
  if (id === 'console-errors' && !result.harnessError) {
    return Object.fromEntries(Object.entries(result).map(([name, events]) => [name, events.map(
      ({ type, message }) => ({
        type,
        // The first line of an Error description is the message; build-specific
        // stack frames are available in the raw data.
        message: normalizeValue(message, { paths }).replace(/\n\s+at [\s\S]*/, ''),
      }),
    ).sort((a, b) => {
      const key = (event) => JSON.stringify(event);
      return key(a) < key(b) ? -1 : Number(key(a) > key(b));
    })]));
  }
  if (id === 'modes' && Array.isArray(result.all)) {
    const occurrences = new Map();
    const modeIds = new Map(result.all.map(({ id: modeId, templateType, name }) => {
      const label = `${templateType}: ${name}`;
      const occurrence = (occurrences.get(label) ?? 0) + 1;
      occurrences.set(label, occurrence);
      return [modeId, occurrence === 1 ? label : `${label} (#${occurrence})`];
    }));
    const { all, sections, ...rest } = result;
    return normalizeValue({
      ...rest,
      order: all.map((mode) => modeIds.get(mode.id)),
      all: Object.fromEntries(all.map((mode) => [modeIds.get(mode.id), mode])),
      sections: Object.fromEntries(sections.map((section) => [modeIds.get(section.modeId), section])),
    }, { paths, modeIds });
  }
  const { skipped: _skipped, ...compared } = result;
  return normalizeValue(compared, { paths });
}
