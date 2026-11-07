// electron/services/__tests__/ScreenshotQueueExternalImage2026_09_27.test.mjs
//
// Photos and screenshots sent from the Phone Mirror page join the desktop's
// screenshot queue through ScreenshotHelper.addExternalImage. Adding it pulled
// the queue's "push, cap at MAX_SCREENSHOTS, delete the oldest file" code out
// of takeScreenshot / takeSelectiveScreenshot into one enqueue() — so this
// also covers the queue behaviour every desktop capture now goes through
// (the capture itself needs a real screen and is not exercised here).
//
// Loads the REAL compiled ScreenshotHelper (or SCREENSHOT_HELPER_BUNDLE) with
// an electron stub whose userData is a temp dir. Platform-agnostic: node:path
// joins and fs only, same on macOS and Windows.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Module from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../');
const bundlePath = process.env.SCREENSHOT_HELPER_BUNDLE
  ? path.resolve(process.env.SCREENSHOT_HELPER_BUNDLE)
  : path.resolve(repoRoot, 'dist-electron/electron/ScreenshotHelper.js');

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'natively-shot-queue-'));
const electronStub = {
  app: { getPath: () => userDataDir, isReady: () => true, on: () => {} },
  desktopCapturer: { getSources: async () => [] },
  screen: { getPrimaryDisplay: () => ({}), getAllDisplays: () => [] },
  systemPreferences: { getMediaAccessStatus: () => 'granted' },
};
const originalLoad = Module._load;
let ScreenshotHelper;

before(async () => {
  Module._load = function (request, parent, isMain) {
    if (request === 'electron') return electronStub;
    return originalLoad.call(this, request, parent, isMain);
  };
  ({ ScreenshotHelper } = await import(pathToFileURL(bundlePath).href));
});

after(() => {
  Module._load = originalLoad;
  fs.rmSync(userDataDir, { recursive: true, force: true });
});

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 3), Buffer.from([0xff, 0xd9])]);

describe('external images join the screenshot queue', () => {
  test('saved under userData/screenshots with our name and extension, bytes intact', async () => {
    const helper = new ScreenshotHelper('queue');
    const p = await helper.addExternalImage(JPEG, 'jpg');
    assert.equal(path.dirname(p), path.join(userDataDir, 'screenshots'));
    assert.match(path.basename(p), /^[0-9a-f-]{36}\.jpg$/);
    assert.ok(fs.readFileSync(p).equals(JPEG));
    assert.deepEqual(helper.getScreenshotQueue(), [p]);
    const png = await helper.addExternalImage(JPEG, 'png');
    assert.ok(png.endsWith('.png'));
    helper.clearQueues();
  });

  test('the queue keeps the newest five and deletes the oldest file', async () => {
    const helper = new ScreenshotHelper('queue');
    const paths = [];
    for (let i = 0; i < 7; i++) paths.push(await helper.addExternalImage(JPEG, 'jpg'));
    assert.deepEqual(helper.getScreenshotQueue(), paths.slice(2));
    assert.equal(fs.existsSync(paths[0]), false, 'oldest deleted');
    assert.equal(fs.existsSync(paths[1]), false, 'second-oldest deleted');
    for (const p of paths.slice(2)) assert.ok(fs.existsSync(p), 'newest five kept');
    helper.clearQueues();
  });

  test('in the solutions view they go to extra_screenshots, not the main queue', async () => {
    const helper = new ScreenshotHelper('solutions');
    const p = await helper.addExternalImage(JPEG, 'webp');
    assert.equal(path.dirname(p), path.join(userDataDir, 'extra_screenshots'));
    assert.deepEqual(helper.getExtraScreenshotQueue(), [p]);
    assert.deepEqual(helper.getScreenshotQueue(), []);
    for (let i = 0; i < 6; i++) await helper.addExternalImage(JPEG, 'jpg');
    assert.equal(helper.getExtraScreenshotQueue().length, 5, 'extra queue capped too');
    assert.equal(fs.existsSync(p), false);
    helper.clearQueues();
  });

  test('a name prefix marks where the image came from; anything path-like is refused', async () => {
    const helper = new ScreenshotHelper('queue');
    const p = await helper.addExternalImage(JPEG, 'jpg', { namePrefix: 'phone-' });
    assert.match(path.basename(p), /^phone-[0-9a-f-]{36}\.jpg$/);
    assert.equal(path.dirname(p), path.join(userDataDir, 'screenshots'));
    for (const bad of ['../', 'a/b', 'x\\y', 'phone .']) {
      await assert.rejects(helper.addExternalImage(JPEG, 'jpg', { namePrefix: bad }), /Invalid image name prefix/);
    }
    assert.deepEqual(helper.getScreenshotQueue(), [p]);
    helper.clearQueues();
  });

  test('deleting one leaves the rest of the queue in order', async () => {
    const helper = new ScreenshotHelper('queue');
    const a = await helper.addExternalImage(JPEG, 'jpg');
    const b = await helper.addExternalImage(JPEG, 'jpg');
    const c = await helper.addExternalImage(JPEG, 'jpg');
    assert.deepEqual(await helper.deleteScreenshot(b), { success: true });
    assert.deepEqual(helper.getScreenshotQueue(), [a, c]);
    helper.clearQueues();
  });
});

describe('request-scoped screenshot retention', () => {
  test('an evicted screenshot survives until its final request owner releases it', async () => {
    const helper = new ScreenshotHelper('queue');
    const image = await helper.addExternalImage(JPEG, 'jpg');
    const first = helper.retainScreenshots([image, image]);
    const second = helper.retainScreenshots([image]);
    for (let i = 0; i < 6; i++) await helper.addExternalImage(JPEG, 'jpg');
    assert.equal(helper.getScreenshotQueue().length, 5);
    assert.ok(!helper.getScreenshotQueue().includes(image));
    assert.ok(fs.existsSync(image), 'retry image must survive normal queue eviction');
    await helper.releaseScreenshots(first);
    await helper.releaseScreenshots(first);
    assert.ok(fs.existsSync(image), 'another owner still needs the image');
    await helper.releaseScreenshots(second);
    assert.equal(fs.existsSync(image), false);
    helper.clearQueues();
  });

  test('releasing an image still in the queue does not delete the attachment', async () => {
    const helper = new ScreenshotHelper('solutions');
    const image = await helper.addExternalImage(JPEG, 'jpg');
    const token = helper.retainScreenshots([image]);
    await helper.releaseScreenshots(token);
    assert.ok(fs.existsSync(image));
    for (let i = 0; i < 6; i++) await helper.addExternalImage(JPEG, 'jpg');
    assert.equal(fs.existsSync(image), false, 'normal cleanup resumes after release');
    helper.clearQueues();
  });

  test('formula rollover respects request ownership too', async () => {
    const helper = new ScreenshotHelper('queue');
    const [image] = await helper.addFormulaImages([{ data: JPEG, ext: 'jpg' }]);
    const token = helper.retainScreenshots([image]);
    for (let i = 0; i < 3; i++) await helper.addFormulaImages([{ data: JPEG, ext: 'jpg' }]);
    assert.ok(fs.existsSync(image));
    await helper.releaseScreenshots(token);
    assert.equal(fs.existsSync(image), false);
    helper.clearQueues();
  });

  test('clearQueues invalidates leases and removes deferred retry images', async () => {
    const helper = new ScreenshotHelper('queue');
    const image = await helper.addExternalImage(JPEG, 'jpg');
    const token = helper.retainScreenshots([image]);
    for (let i = 0; i < 6; i++) await helper.addExternalImage(JPEG, 'jpg');
    const unlink = fs.promises.unlink;
    const deleted = [];
    fs.promises.unlink = (file) => {
      const operation = unlink.call(fs.promises, file);
      deleted.push(operation);
      return operation;
    };
    try {
      helper.clearQueues();
      await Promise.all(deleted);
      assert.equal(fs.existsSync(image), false);
      await helper.releaseScreenshots(token);
    } finally {
      fs.promises.unlink = unlink;
    }
  });

  test('explicit deletion remains possible and a missing file cannot be newly retained', async () => {
    const helper = new ScreenshotHelper('queue');
    const image = await helper.addExternalImage(JPEG, 'jpg');
    const token = helper.retainScreenshots([image]);
    assert.deepEqual(await helper.deleteScreenshot(image), { success: true });
    assert.equal(fs.existsSync(image), false);
    assert.throws(() => helper.retainScreenshots([image]));
    await helper.releaseScreenshots(token);
    helper.clearQueues();
  });

  test('a locked evicted file remains tracked for reset cleanup', async () => {
    const helper = new ScreenshotHelper('queue');
    const image = await helper.addExternalImage(JPEG, 'jpg');
    const token = helper.retainScreenshots([image]);
    for (let i = 0; i < 6; i++) await helper.addExternalImage(JPEG, 'jpg');
    const unlink = fs.promises.unlink;
    fs.promises.unlink = async (file) => {
      if (file === image) throw Object.assign(new Error('File is locked'), { code: 'EBUSY' });
      return unlink.call(fs.promises, file);
    };
    try {
      await helper.releaseScreenshots(token);
      assert.ok(fs.existsSync(image));
      assert.ok(helper.deferredScreenshotDeletes.has(image));
    } finally {
      fs.promises.unlink = unlink;
    }
    const deleted = [];
    fs.promises.unlink = (file) => {
      const operation = unlink.call(fs.promises, file);
      deleted.push(operation);
      return operation;
    };
    try {
      helper.clearQueues();
      await Promise.all(deleted);
      assert.equal(fs.existsSync(image), false);
    } finally {
      fs.promises.unlink = unlink;
    }
  });

  test('retaining a file already scheduled for eviction is rejected', async () => {
    const helper = new ScreenshotHelper('queue');
    const image = await helper.addExternalImage(JPEG, 'jpg');
    for (let i = 0; i < 4; i++) await helper.addExternalImage(JPEG, 'jpg');
    const unlink = fs.promises.unlink;
    let finish;
    fs.promises.unlink = async (file) => {
      if (file === image) await new Promise((resolve) => { finish = resolve; });
      return unlink.call(fs.promises, file);
    };
    try {
      const evict = helper.addExternalImage(JPEG, 'jpg');
      while (!finish) await new Promise((resolve) => setImmediate(resolve));
      assert.throws(() => helper.retainScreenshots([image]), /no longer available/);
      finish();
      await evict;
    } finally {
      fs.promises.unlink = unlink;
      helper.clearQueues();
    }
  });
});
