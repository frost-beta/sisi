import fs from 'node:fs/promises';
import path from 'node:path';

import {Model} from './model.js';

// We assume pictures are stored in flat style, i.e. a single directory usually
// contains lots of pictures and the depth of directories is rarely very deep.
// In this way the index is a flat map where key is directory name and value is
// the files under it.
type IndexMap = Map<string, IndexDirEntry>;

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
    await Promise.all(items.map(async ({name, size, mtimeMs, children}) => {
      if (children) {
        await buildIndexForDir(`${dir}/${name}`, children);
        dirs.push(name);
      } else {
        // If the file is already in index and its modified time is not newer,
        // then just keep it in index, otherwise recompute its embedding.
        const fileItem = dirEntry.files?.find(i => i.name == name);
        if (fileItem && mtimeMs <= fileItem.mtimeMs) {
          files.push(fileItem);
        } else {
          const embedding = await model.computeImageEmbedding(`${dir}/${name}`);
          files.push({name, mtimeMs, embedding});
          progress.size += size;
          progress.count += 1;
          report(progress);
        }
      }
    }));
    // Remove entries from index if they no longer exist.
    if (dirEntry.dirs) {
      for (const old of dirEntry.dirs) {
        if (!dirs.includes(old))
          index.delete(old);
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
 * Record total file sizes and numbers.
 */
export interface TotalFilesInfo {
  size: number;
  count: number;
}

/**
 * A simple representation of filesystem.
 */
export interface FSItem {
  name: string;
  size: number;
  mtimeMs: number;
  children?: FSItem[];
}

/**
 * Get all image files under the directory.
 */
export async function listImageFiles(dir: string, info: TotalFilesInfo): Promise<FSItem[] | undefined> {
  // Read stats of all files under the dir in parallel.
  const fileNames = await fs.readdir(dir);
  const stats = await Promise.all(fileNames.map(n => fs.stat(`${dir}/${n}`)));
  let items: FSItem[] = [];
  // Iterate all files in parallel.
  await Promise.all(fileNames.map(async (name, i) => {
    const stat = stats[i];
    const item = {name, size: stat.size, mtimeMs: stat.mtimeMs};
    if (stat.isDirectory()) {
      // Ignore the subdir if it contains no image files.
      const children = await listImageFiles(`${dir}/${name}`, info);
      if (children)
        items.push({children, ...item});
    } else if (stat.isFile() && isFileNameImage(name)) {
      info.size += stat.size;
      info.count += 1;
      items.push(item);
    }
  }));
  return items.length > 0 ? items : undefined;
}

// The file extensions we consider as images.
const imageExtensions = [ 'jpg', 'jpeg', 'png', 'gif', 'webp', 'heic' ];

// Determine if a fileName is image.
function isFileNameImage(fileName: string) {
  return imageExtensions.includes(path.extname(fileName).substr(1)
                                                        .toLowerCase());
}
