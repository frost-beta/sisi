import fs from 'node:fs/promises';
import path from 'node:path';
import bser from 'bser';

import {Model} from './model.js';
import type {FSItem, TotalFilesInfo} from './fs.js';

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
  dirs?: string[];
  files?: IndexFileEntry[];
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
 * @param report - Callback for receiving the indexing progress.
 * @param index - When specified, the passed index will be updated.
 */
export async function buildIndex(model: Model,
                                 target: string,
                                 items: FSItem[],
                                 report: (progress: TotalFilesInfo) => void,
                                 index: IndexMap = new Map()) {
  // Record progress.
  const progress: TotalFilesInfo = {size: 0, count: 0};
  // Handle files in dir recursively.
  const buildIndexForDir = async (dir: string, items: FSItem[]) => {
    // Get old entry from index and prepare for new.
    const dirEntry: IndexDirEntry = index.get(dir) ?? {};
    let dirs: string[] = [];
    let files: IndexFileEntry[] = [];
    // Iterate all files.
    await Promise.all(items.map(async ({name, size, mtimeMs, needsUpdate, children}) => {
      // Handle directories recursively.
      if (children) {
        // Add directory to entry if it contains images.
        if (await buildIndexForDir(`${dir}/${name}`, children))
          dirs.push(name);
        return;
      }
      // Reuse the existing entry if it is not out-dated.
      if (!needsUpdate) {
        files.push(dirEntry.files!.find(i => i.name == name)!);
        return;
      }
      // Compute image's embedding and save it.
      const embedding = await model.computeImageEmbedding(`${dir}/${name}`);
      files.push({name, mtimeMs, embedding});
      progress.size += size;
      progress.count += 1;
      report(progress);
    }));
    // Remove entries from index if they no longer exist.
    if (dirEntry.dirs) {
      for (const old of dirEntry.dirs) {
        if (!dirs.includes(old))
          index.delete(`${dir}/${old}`);
      }
    }
    // Add dir to index if it contains image files or its subdir does.
    if (dirs.length > 0 || files.length > 0) {
      const newEntry: IndexDirEntry = {};
      if (dirs.length > 0)
        newEntry.dirs = dirs;
      if (files.length > 0)
        newEntry.files = files;
      index.set(dir, newEntry);
      return true;
    } else {
      index.delete(dir);
      return false;
    }
  };
  await buildIndexForDir(target, items);
  return index;
}

/**
 * Write the index to a BSER file on disk.
 * @param index
 * @param indexPath - The BSER file to write to.
 */
export async function writeIndexToDisk(index: IndexMap, indexPath: string) {
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
export async function readIndexFromDisk(indexPath: string): Promise<IndexMap> {
  try {
    const buffer = await fs.readFile(indexPath);
    const json = bser.loadFromBuffer(buffer);
    return new Map(json.index);
  } catch {
    return new Map();
  }
}
