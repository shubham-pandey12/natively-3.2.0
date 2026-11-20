const container = (value) => value !== null && typeof value === 'object';
const escape = (key) => key.replaceAll('~', '~0').replaceAll('/', '~1');

function difference(path, installed, local) {
  return {
    path, installed, local,
    installedPresent: installed !== undefined, localPresent: local !== undefined,
  };
}

export function diff(installed, local, path = '') {
  if (Object.is(installed, local)) return [];
  if (container(installed) && container(local) && Array.isArray(installed) === Array.isArray(local)) {
    const keys = [...new Set([...Object.keys(installed), ...Object.keys(local)])].sort();
    return keys.flatMap((key) => diff(
      Object.hasOwn(installed, key) ? installed[key] : undefined,
      Object.hasOwn(local, key) ? local[key] : undefined,
      `${path}/${escape(key)}`,
    ));
  }
  return [difference(path, installed, local)];
}

export function compare(ids, installed, local) {
  return ids.map((id) => {
    const differences = diff(installed[id], local[id]);
    return { id, status: differences.length ? 'DIFF' : 'MATCH', differences };
  });
}

export function summary(rows) {
  return [
    '| Scenario | Result | Differences |',
    '| --- | --- | ---: |',
    ...rows.map(({ id, status, differences }) => `| ${id} | ${status} | ${differences.length} |`),
  ].join('\n');
}
