import path from 'node:path';
import sharp from 'sharp';

const DISTANCE_SQUARED = 48 ** 2;
const PANEL_GAP = 8;

async function readPixels(file) {
  const { data, info } = await sharp(file)
    .toColourspace('srgb').flatten({ background: '#111111' }).removeAlpha()
    .raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

export async function comparePngs(installedFile, localFile, outputFile) {
  const [installed, local] = await Promise.all([installedFile, localFile].map(readPixels));
  const width = Math.max(installed.width, local.width);
  const height = Math.max(installed.height, local.height);
  const mask = Buffer.alloc(width * height * 3);
  let changed = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inInstalled = x < installed.width && y < installed.height;
      const inLocal = x < local.width && y < local.height;
      let differs = inInstalled !== inLocal;
      if (inInstalled && inLocal) {
        const a = (y * installed.width + x) * 3;
        const b = (y * local.width + x) * 3;
        const dr = installed.data[a] - local.data[b];
        const dg = installed.data[a + 1] - local.data[b + 1];
        const db = installed.data[a + 2] - local.data[b + 2];
        differs = dr * dr + dg * dg + db * db > DISTANCE_SQUARED;
      }
      if (differs) {
        const pixel = (y * width + x) * 3;
        mask[pixel] = 255;
        mask[pixel + 2] = 160;
        changed++;
      }
    }
  }

  const panels = [installed, local, { data: mask, width, height }];
  await sharp({ create: { width: 3 * width + 2 * PANEL_GAP, height, channels: 3, background: '#252525' } })
    .composite(panels.map((panel, index) => ({
      input: panel.data,
      raw: { width: panel.width, height: panel.height, channels: 3 },
      top: 0, left: index * (width + PANEL_GAP),
    }))).png().toFile(outputFile);
  return changed / (width * height) * 100;
}

export function screenshotDiffPath(directory) {
  return path.join(directory, 'side-by-side-diff.png');
}
