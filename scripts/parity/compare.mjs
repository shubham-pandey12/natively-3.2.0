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

// Differences that exist only because the reference is a packaged install and
// the candidate runs from source. They stay in the report under "expected" with
// their reason; they never count as a product gap. Keep every rule narrow: a
// rule that matches a real regression hides it.
export const EXPECTED_DIFFERENCES = [
  {
    scenario: 'settings-defaults',
    path: /^\/values\/getCanAutoUpdate\/canAutoUpdate$/,
    reason: 'The updater only installs into a packaged app; it is off when running from source.',
  },
  {
    scenario: 'settings-defaults',
    path: /^\/values\/(?:getLocalFallbackPreflight\/checks|getProviderStatuses\/\d+\/details\/checks)\/\d+\/message$/,
    // Only the wording: the same checks' ok/health/recoverable flags are still compared.
    when: ({ installed, local }) => typeof installed === 'string' && typeof local === 'string'
      && /^(?:Found |Native audio module loaded)/.test(installed)
      && /^(?:Found <workspace>\/|Dev mode: )/.test(local),
    reason: 'Packaged builds report the unpacked file they found; dev builds report the source path or skip the unpacked check.',
  },
];

export function classify(id, difference, rules = EXPECTED_DIFFERENCES) {
  return rules.find((rule) => rule.scenario === id && rule.path.test(difference.path)
    && (!rule.when || rule.when(difference)));
}

export function compare(ids, installed, local, rules = EXPECTED_DIFFERENCES) {
  return ids.map((id) => {
    const differences = [];
    const expected = [];
    for (const difference of diff(installed[id], local[id])) {
      const rule = classify(id, difference, rules);
      if (rule) expected.push({ ...difference, reason: rule.reason });
      else differences.push(difference);
    }
    return { id, status: differences.length ? 'DIFF' : 'MATCH', differences, expected };
  });
}

export function summary(rows) {
  return [
    '| Scenario | Result | Differences | Expected (installed vs dev) |',
    '| --- | --- | ---: | ---: |',
    ...rows.map(({ id, status, differences, expected = [] }) =>
      `| ${id} | ${status} | ${differences.length} | ${expected.length} |`),
  ].join('\n');
}
