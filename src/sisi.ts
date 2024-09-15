import path from 'node:path';
import prettyMilliseconds from 'pretty-ms';
import {Presets, SingleBar} from 'cli-progress';
import {core as mx, nn} from '@frost-beta/mlx';

import {
  shortPath,
  listImageFiles,
} from './fs.js';
import {
  batchSize,
  loadModel,
  loadClip,
} from './model.js';
import {
  buildIndex,
  removeInvalidIndex,
  getIndexPath,
  writeIndexToDisk,
  readIndexFromDisk,
} from './indexing.js';
import {
  SearchResult,
  computeEmbeddingForQuery,
  presentResults,
} from './search.js';

/**
 * Build or update index for the dir.
 */
export async function index(targetDir: string) {
  // Read existing index.
  const indexPath = getIndexPath();
  const index = await readIndexFromDisk(indexPath);
  // Find files that need indexing.
  targetDir = path.resolve(targetDir);
  const totalFiles = {size: 0, count: 0};
  const items = await listImageFiles(targetDir, totalFiles, index);
  // Quit if building index for the first time and there is no images in target.
  if (totalFiles.count == 0 && index.size == 0) {
    console.error('No images under directory:', targetDir);
    return;
  }
  // Download and load model.
  const model = await loadModel();
  // Create progress bar for indexing.
  let bar: SingleBar | undefined;
  let progress = {size: 0, count: 0};
  if (totalFiles.count > 0) {
    console.log(`${index.has(targetDir) ? 'Build' : 'Updat'}ing index for ${totalFiles.count} images...`);
    let lastUpdate = Date.now() - 2000;
    let lastEta = '';
    bar = new SingleBar({
      etaBuffer: batchSize * 4,  // estimate eta on last 4 batches
      format: '{bar} | ETA: {eta_formatted} | {value}/{total}',
      formatTime(eta) {
        if (progress.size == 0)  // no eta when nothing has been processed
          return 'Waiting';
        if (Date.now() - lastUpdate < 5000)  // smooth eta updates
          return lastEta;
        lastUpdate = Date.now();
        return lastEta = prettyMilliseconds(eta * 1000, {compact: true});
      },
    }, Presets.shades_grey);
    bar.start(totalFiles.count, 0);
  }
  // Build index and save it.
  try {
    await buildIndex(model, targetDir, items, index, (p) => {
      bar?.update(p.count);
      progress = p;
    });
    await removeInvalidIndex(index);
    await writeIndexToDisk(index, indexPath);
  } catch (error) {
    // Stop bar before printing error.
    bar?.stop();
    console.error(error);
    process.exit(1);
  }
  bar?.stop();
  if (totalFiles.count == 0)
    console.log('Index is up to date.');
  else
    console.log(`Index saved to: ${shortPath(indexPath)}`);
  // Cleanup.
  model.close();
}

/**
 * Search the query string from index.
 */
export async function search(query: string, targetDir?: string): Promise<SearchResult[] | undefined> {
  if (targetDir)
    targetDir = path.resolve(targetDir);
  // List all the embeddings of images under targetDir from the index.
  const index = await readIndexFromDisk();
  const images: {filePath: string, embedding: number[]}[] = [];
  for (const [ dir, value ] of index.entries()) {
    if (targetDir && !dir.startsWith(targetDir))  // not match target dir
      continue;
    if (!value.files)  // dir contains no files
      continue;
    for (const file of value.files)
      images.push({filePath: `${dir}/${file.name}`, embedding: file.embedding});
  }
  if (images.length == 0)
    return;
  // As we are handling only one query, just load the model in main thread.
  const clip = await loadClip();
  // Compute cosine similaries between the query and all the images.
  const {isTextQuery, queryEmbeddings} = await computeEmbeddingForQuery(clip, query);
  const imageEmbeddings = mx.array(images.map(c => {
    // When embedding is not available for the file, use [ 0, ...., 0 ].
    return c.embedding ?? new Array(queryEmbeddings.shape[1]).fill(0);
  }));
  const scores = nn.losses.cosineSimilarityLoss(queryEmbeddings, imageEmbeddings);
  // Get the indices sorted by higher scores.
  const topIndices = mx.argsort(scores).index(mx.Slice(null, null, -1));
  // Settings for the results, should probably be made options.
  const maxResults = 20;
  const goodScore = isTextQuery ? 0.2 : 0.75;
  let bottomLineScore = isTextQuery ? 0.16 : 0.6;
  // Prepare the results.
  const results: SearchResult[] = [];
  for (let i = 0; i < Math.min(topIndices.size, maxResults); ++i) {
    const index = topIndices.index(i);
    const score = scores.index(index).item() as number;
    if (score > goodScore) {
      // When there is good result, we don't need the not-so-good results.
      bottomLineScore = goodScore;
    } else if (score < bottomLineScore) {
      // No need to continue after seeing a bad result.
      break;
    }
    results.push({
      filePath: images[index.item() as number].filePath,
      score: score * 100,
    });
  }
  return results;
}

/**
 * Return the items in the index.
 */
export async function listIndex() {
  const index = await readIndexFromDisk();
  return Array.from(index.keys());
}

/**
 * Remove items under the directory in index.
 */
export async function removeIndex(targetDir: string) {
  targetDir = path.resolve(targetDir);
  const removed: string[] = [];
  const indexPath = getIndexPath();
  const index = await readIndexFromDisk(indexPath);
  for (const key of index.keys()) {
    if (key.startsWith(targetDir)) {
      removed.push(key);
      index.delete(key);
    }
  }
  await writeIndexToDisk(index, indexPath);
  return removed;
}
