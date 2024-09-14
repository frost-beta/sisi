#!/usr/bin/env node

import path from 'node:path';
import {Presets, SingleBar} from 'cli-progress';

import {loadModel} from './model.js';
import {buildIndex, listImageFiles} from './indexing.js';

main();

async function main() {
  const target = path.resolve(process.argv[2]);
  const totalFiles = {size: 0, count: 0};
  const items = await listImageFiles(target, totalFiles);
  if (!items) {
    console.error('No images under directory:', target);
    return;
  }

  const model = await loadModel();

  console.log(`Building index for ${totalFiles.count} images...`);
  const bar = new SingleBar({
    barsize: 30,
    format: '{bar} | ETA: {eta}s | {value}/{total}',
  }, Presets.shades_grey);
  bar.start(totalFiles.count, 0);

  const index = await buildIndex(model, target, items, (progress) => {
    bar.update(progress.count);
  });

  bar.stop();
  model.close();

  console.log(index);
}
