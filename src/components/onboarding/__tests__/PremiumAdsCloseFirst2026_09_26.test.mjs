// The premium cards are recovered compiled components. Check the exported code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../premium/src');
const source = readFileSync(resolve(root, 'recovered/App-h7VwvpAg.js'), 'utf8');
const runtime = await import(resolve(root, 'recovered/App-h7VwvpAg.js'));
const markers = {
  ProfileFeatureToaster: 'fP = ({ className:',
  JDAwarenessToaster: '_P = ({ className:',
  MaxUltraUpgradeToaster: 'p7 = ({ isOpen:',
  NativelyApiPromoToaster: 'QP = ({ isOpen:',
};
const card = name => {
  const start = source.indexOf(markers[name]);
  const label = source.indexOf(`label: "${name}"`, start);
  assert.ok(start >= 0 && label > start, `${name} is in the recovered bundle`);
  assert.ok(readFileSync(resolve(root, `${name}.tsx`), 'utf8').includes(`export { ${name} } from './recovered/App-h7VwvpAg.js'`));
  return source.slice(start, label + 200);
};

for (const name of Object.keys(markers)) {
  test(`${name}: plain close waits for the genie`, () => {
    assert.equal(typeof runtime[name], 'function');
    const body = card(name);
    assert.match(body, /onClosed: \(\) => \{/);
    assert.match(body, /closeInstantly:/);
    assert.match(body, /\.current \|\| \([^\n]*\.current = [^,]+, [^\n]*\(!0\)\)/);
  });
}

test('Max and Natively API decline defer the report; handovers remain instant', () => {
  const max = card('MaxUltraUpgradeToaster');
  const api = card('NativelyApiPromoToaster');
  assert.match(max, /j\(\(\) => n\("never"\)\)/);
  assert.match(max, /h\(!0\), n\("acted"\), s\(\)/);
  assert.match(api, /w\(\(\) => n\("never"\)\)/);
  assert.match(api, /u\(!0\), n\("acted"\), s\("natively-api"\)/);
});
