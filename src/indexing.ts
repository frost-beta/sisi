import fs from 'node:fs/promises';
import path from 'node:path';

import {Model} from './model.js';

// We assume pictures are stored in flat style, i.e. a single directory usually
// contains lots of pictures and the depth of directories is rarely very deep.
// In this way the index is a flat map where key is directory name and value is
// the files under it.
type IndexMap = Map<string, IndexDirItem>;

interface IndexDirItem {
  dirs?: string[];
  files?: IndexFileItem[];
}

interface IndexFileItem {
  name: string;
  mtimeMs: number;
  // Sometimes a file seems to be an image but parsing fails, we keep it in the
  // record to simplify the code.
  embedding?: number[];
}


/**
 * Create index for the target directory.
 */
export async function buildIndex(model: Model, target: string, index: IndexMap = new Map()) {
  const buildIndexForDir = async (dir: string) => {
    // Read stats of all files under the dir in parallel.
    const fileNames = await fs.readdir(dir);
    const stats = await Promise.all(fileNames.map(n => fs.stat(`${dir}/${n}`)));
    // Get old item from index and prepare for new.
    const dirItem: IndexDirItem = index.get(dir) ?? {};
    let dirs: string[] | undefined;
    let files: IndexFileItem[] | undefined;
    // Iterate all files in parallel.
    await Promise.all(fileNames.map(async (name, i) => {
      const stat = stats[i];
      if (stat.isDirectory()) {
        // Keep the subdir in current index if it contains image files.
        if (await buildIndexForDir(`${dir}/${name}`)) {
          if (!dirs)
            dirs = [ name ];
          else
            dirs.push(name);
        }
      } else if (stat.isFile() && isFileNameImage(name)) {
        if (!files)
          files = [];
        // If the file is already in index and its modified time is not newer,
        // then just keep it in index, otherwise recompute its embedding.
        const fileItem = dirItem.files?.find(i => i.name == name);
        if (fileItem && stat.mtimeMs <= fileItem.mtimeMs) {
          files.push(fileItem);
        } else {
          files.push({
            name,
            mtimeMs: stat.mtimeMs,
            embedding: await model.computeImageEmbedding(`${dir}/${name}`),
          });
        }
      }
    }));
    // Remove entries from index if they no longer exist.
    if (dirItem.dirs) {
      for (const old of dirItem.dirs) {
        if (!dirs.includes(old))
          index.delete(old);
      }
    }
    // Add dir to index if it contains image files or its subdir does.
    if (dirs || files) {
      index.set(dir, {dirs, files});
      return true;
    } else {
      index.delete(dir);
      return false;
    }
  };
  await buildIndexForDir(path.resolve(target));
  return index;
}

/**
 * The file extensions we consider as images.
 */
const imageExtensions = [ 'jpg', 'jpeg', 'png', 'gif', 'webp', 'heic' ];

/**
 * Determine if a fileName is image.
 */
function isFileNameImage(fileName: string) {
  return imageExtensions.includes(path.extname(fileName).substr(1)
                                                        .toLowerCase());
}
