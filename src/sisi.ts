import path from 'node:path';
import {Presets, SingleBar} from 'cli-progress';
import {core as mx, nn} from '@frost-beta/mlx';

import {shortPath, listImageFiles} from './fs.js';
import {loadModel, loadClip} from './model.js';
import {buildIndex, getIndexPath, writeIndexToDisk, readIndexFromDisk} from './indexing.js';
import {computeEmbeddingForQuery, presentResults} from './search.js';

/**
 * Build index for the dir.
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
  console.log(`${index.has(targetDir) ? 'Build' : 'Updat'}ing index for ${totalFiles.count} images...`);
  const bar = new SingleBar({
    format: '{bar} | ETA: {eta}s | {value}/{total}',
  }, Presets.shades_grey);
  bar.start(totalFiles.count, 0);
  // Build index and save it.
  try {
    await buildIndex(model, targetDir, items, ({count}) => bar.update(count), index);
    await writeIndexToDisk(index, indexPath);
  } catch (error) {
    // Stop bar before printing error.
    bar.stop();
    console.error(error);
    process.exit(1);
  }
  bar.stop();
  console.log(`Index saved to: ${shortPath(indexPath)}`);
  // Cleanup.
  model.close();
}

/**
 * Search the query string from index.
 */
export async function search(query: string, targetDir?: string) {
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
  const results: {filePath: string, score: number}[] = [];
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
    results.push({filePath: images[index.item() as number].filePath, score});
  }
  return results;
}
