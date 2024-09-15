import fs from 'node:fs/promises';
import path from 'node:path';
import bser from 'bser';

import {Model} from './model.js';
import {FSItem, TotalFilesInfo, getCacheDir} from './fs.js';

// The JSON format for storing the index on disk.
interface IndexDatabase {
  version: number,
  index: [string, IndexDirEntry][];
}

// We assume pictures are stored in flat style, i.e. a single directory usually
// contains lots of pictures and the depth of directories is rarely very deep.
// In this way the index is a flat map where key is directory name and value is
// the files under it.
export type IndexMap = Map<string, IndexDirEntry>;

interface IndexDirEntry {
  files: IndexFileEntry[];
}

interface IndexFileEntry {
  name: string;
  mtimeMs: number;
  // Sometimes a file seems to be an image but parsing fails, we keep it in the
  // record to simplify the code.
  embedding?: number[];
}

/**
 * Create index for the target directory.
 * @param model - The CLIP model.
 * @param target - Target directory which contains images.
 * @param items - The items under the target directory.
 * @param index - When specified, the passed index will be updated.
 * @param report - Callback for receiving the indexing progress.
 */
export async function buildIndex(model: Model,
                                 target: string,
                                 items: FSItem[],
                                 index: IndexMap = new Map(),
                                 report?: (progress: TotalFilesInfo) => void) {
  // Record progress.
  const progress: TotalFilesInfo = {size: 0, count: 0};
  // Handle files in dir recursively.
  const buildIndexForDir = async (dir: string, items: FSItem[]) => {
    // Get old entry from index and prepare for new.
    const existingEntry = index.get(dir);
    let files: IndexFileEntry[] = [];
    // Iterate all files.
    await Promise.all(items.map(async ({name, size, mtimeMs, needsUpdate, children}) => {
      // Handle directories recursively.
      if (children) {
        await buildIndexForDir(`${dir}/${name}`, children);
        return;
      }
      // Reuse the existing entry if it is not out-dated.
      if (!needsUpdate) {
        files.push(existingEntry!.files.find(i => i.name == name)!);
        return;
      }
      // Compute image's embedding and save it.
      let embedding: number[] | undefined;
      try {
        embedding = await model.computeImageEmbeddings(`${dir}/${name}`);
      } catch {
        // Failed to process image, should probably log error somewhere.
      }
      files.push({name, mtimeMs, embedding});
      if (report) {
        progress.size += size;
        progress.count += 1;
        report(progress);
      }
    }));
    // Add dir to index if it contains image files.
    if (files.length > 0) {
      index.set(dir, {files});
      return true;
    } else {
      index.delete(dir);
      return false;
    }
  };
  await buildIndexForDir(path.resolve(target), items);
  return index;
}

/**
 * Remove non-exist directories from index.
 */
export async function removeInvalidIndex(index: IndexMap) {
  const invalidKeys: string[] = [];
  await Promise.all(Array.from(index.keys()).map(async (dir) => {
    try {
      await fs.access(dir, fs.constants.R_OK | fs.constants.X_OK);
    } catch (error) {
      invalidKeys.push(dir);
    }
  }));
  for (const key of invalidKeys) {
    index.delete(key);
  }
}

/**
 * Return the path to the index file.
 */
export function getIndexPath() {
  return `${getCacheDir()}/index.bser`;
}

/**
 * Write the index to a BSER file on disk.
 * @param index
 * @param indexPath - The BSER file to write to.
 */
export async function writeIndexToDisk(index: IndexMap, indexPath = getIndexPath()) {
  await fs.mkdir(path.dirname(indexPath), {recursive: true});
  const buffer = bser.dumpToBuffer({
    version: 1,
    index: Array.from(index.entries()),
  });
  await fs.writeFile(indexPath, buffer);
}

/**
 * Read the index from BSER file on disk.
 * @param indexPath - The BSER file to read from.
 */
export async function readIndexFromDisk(indexPath = getIndexPath()): Promise<IndexMap> {
  try {
    const buffer = await fs.readFile(indexPath);
    const json = bser.loadFromBuffer(buffer);
    return new Map(json.index);
  } catch {
    return new Map();
  }
}
