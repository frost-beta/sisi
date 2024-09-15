import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {readFileSync} from 'node:fs';

import type {IndexMap} from './indexing.js';

/**
 * require('../package.json')
 */
export function getPackageJson(): {version: string} {
  return JSON.parse(String(readFileSync(`${import.meta.dirname}/../package.json`)));
}

/**
 * Return the user's cache directory.
 */
export function getCacheDir(): string {
  const {env, platform} = process;
  if (env.XDG_CACHE_HOME)
    return `${env.XDG_CACHE_HOME}/sisi`;
  if (platform == 'darwin')
    return `${os.homedir()}/Library/Caches/sisi`;
  if (platform != 'win32')
    return `${os.homedir()}/.cache/sisi`;
  if (env.LOCALAPPDATA)
    return `${env.LOCALAPPDATA}/sisi-cache`;
  return `${os.homedir()}/.sisi-cache`;
}

/**
 * Replace the home dir in path with ~ when possible.
 */
export function shortPath(longPath: string): string {
  return longPath.replace(os.homedir(), '~');
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
  needsUpdate: boolean;
  children?: FSItem[];
}

/**
 * Get all files under the directory.
 * @param dir - The target directory to search for files.
 * @param info - Record the size and count of found files.
 * @param index - Used for marking if an item needs update.
 */
export async function listImageFiles(dir: string, info: TotalFilesInfo, index?: IndexMap): Promise<FSItem[]> {
  const dirEntry = index?.get(dir);
  // Read stats of all files under the dir in parallel.
  const fileNames = await fs.readdir(dir);
  const stats = await Promise.all(fileNames.map(n => fs.stat(`${dir}/${n}`)));
  let items: FSItem[] = [];
  // Iterate all files in parallel.
  await Promise.all(fileNames.map(async (name, i) => {
    const stat = stats[i];
    const item: FSItem = {
      name,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      needsUpdate: true,
    };
    if (stat.isDirectory()) {
      // Directories are always kept in results even if they contain no images,
      // because we need the directory structure for updating index.
      const children = await listImageFiles(`${dir}/${name}`, info, index);
      items.push({children, ...item});
    } else if (stat.isFile() && isFileNameImage(name)) {
      // Find out if the file has been modified since last indexing.
      if (dirEntry?.files?.find(i => i.name == name)?.mtimeMs >= stat.mtimeMs)
        item.needsUpdate = false;
      if (item.needsUpdate) {
        info.size += stat.size;
        info.count += 1;
      }
      items.push(item);
    }
  }));
  return items;
}

// The file extensions we consider as images.
const imageExtensions = [ 'jpg', 'jpeg', 'png', 'gif', 'webp', 'heic' ];

// Determine if a fileName is image.
function isFileNameImage(fileName: string) {
  return imageExtensions.includes(path.extname(fileName).substr(1)
                                                        .toLowerCase());
}
