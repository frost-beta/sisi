import path from 'node:path';
import {Presets, SingleBar} from 'cli-progress';
import {core as mx, nn} from '@frost-beta/mlx';

import {shortPath, listImageFiles} from './fs.js';
import {loadModel, loadClip} from './model.js';
import {buildIndex, getIndexPath, writeIndexToDisk, readIndexFromDisk} from './indexing.js';

/**
 * The `sisi index` command.
 */
export async function index(targetDir: string) {
  // Read existing index.
  const indexPath = getIndexPath();
  const index = await readIndexFromDisk(indexPath);
  // Find files that need indexing.
  targetDir = path.resolve(targetDir);
  const totalFiles = {size: 0, count: 0};
  const items = await listImageFiles(targetDir, totalFiles, index);
  // Quit if there is nothing to do.
  if (totalFiles.count == 0) {
    if (!index.has(targetDir)) {
      console.error('No images under directory:', targetDir);
      return;
    }
    console.log('Index is up to date.');
    return;
  }
  // Download and load model.
  const model = await loadModel();
  // Create progress bar for indexing.
  console.log(`${index.size == 0 ? 'Building' : 'Updating'} index for ${totalFiles.count} images...`);
  const bar = new SingleBar({
    format: '{bar} | ETA: {eta}s | {value}/{total}',
  }, Presets.shades_grey);
  bar.start(totalFiles.count, 0);
  // Build index and save it.
  await buildIndex(model, targetDir, items, ({count}) => bar.update(count), index);
  await writeIndexToDisk(index, indexPath);
  bar.stop();
  console.log(`Index saved to: ${shortPath(indexPath)}`);
  // Cleanup.
  model.close();
}

/**
 * The `sisi search` command.
 */
export async function search(query: string, targetDir?: string) {
  // List all the embeddings of images under targetDir from the index.
  const index = await readIndexFromDisk();
  const choices: {filePath: string, embedding: number[]}[] = [];
  for (const [ dir, value ] of index.entries()) {
    if (targetDir && !dir.startsWith(targetDir))  // not match target dir
      continue;
    if (!value.files)  // dir contains no files
      continue;
    for (const file of value.files)
      choices.push({filePath: `${dir}/${file.name}`, embedding: file.embedding});
  }
  // Find the matching ones.
  const clip = await loadClip();
  const {labelEmbeddings} = clip.computeEmbeddings({labels: [ query ]});
  const imageEmbeddings = mx.array(choices.map(c => c.embedding));
  const scores = nn.losses.cosineSimilarityLoss(labelEmbeddings, imageEmbeddings);
  const topIndices = mx.argsort(scores).index(mx.Slice(null, null, -1));
  const results: {filePath: string, score: number}[] = [];
  for (let i = 0; i < topIndices.size; ++i) {
    const score = scores.index(topIndices.index(i));
    results.push({filePath: choices[i].filePath, score});
  }
  console.log(results);
}
