#!/usr/bin/env node

import path from 'node:path';
import {Presets, SingleBar} from 'cli-progress';

import {getCacheDir, shortPath, listImageFiles} from './fs.js';
import {loadModel} from './model.js';
import {buildIndex, writeIndexToDisk, readIndexFromDisk} from './indexing.js';

index();

async function index() {
  const target = path.resolve(process.argv[2]);

  const indexPath = `${getCacheDir()}/index.bser`;
  const index = await readIndexFromDisk(indexPath);

  const totalFiles = {size: 0, count: 0};
  const items = await listImageFiles(target, totalFiles, index);
  if (!items) {
    console.error('No images under directory:', target);
    return;
  }

  if (totalFiles.count == 0) {
    console.log('Index is up to date.');
    return;
  }

  const model = await loadModel();

  console.log(`${index.size == 0 ? 'Building' : 'Updating'} index for ${totalFiles.count} images...`);
  const bar = new SingleBar({
    format: '{bar} | ETA: {eta}s | {value}/{total}',
  }, Presets.shades_grey);
  bar.start(totalFiles.count, 0);

  await buildIndex(model, target, items, ({count}) => bar.update(count), index);
  bar.stop();
  await writeIndexToDisk(index, indexPath);
  console.log(`Index saved to: ${shortPath(indexPath)}`);
  model.close();
}
