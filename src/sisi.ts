#!/usr/bin/env node

import path from 'node:path';
import {Builtins, Cli, Command, Option} from 'clipanion';
import {Presets, SingleBar} from 'cli-progress';

import packageJson from '../package.json' with {type: 'json'};
import {getCacheDir, shortPath, listImageFiles} from './fs.js';
import {loadModel} from './model.js';
import {buildIndex, writeIndexToDisk, readIndexFromDisk} from './indexing.js';

export class IndexCommand extends Command {
  static paths = [ [ 'index' ] ];
  static usage = Command.Usage({
    description: 'Build or update index for images under target directory.',
    examples: [
      [
        'Build index for ~/Pictures/',
        '$0 index ~/Pictures/',
      ],
    ]
  });

  target = Option.String();

  async execute() {
    // Read existing index.
    const indexPath = `${getCacheDir()}/index.bser`;
    const index = await readIndexFromDisk(indexPath);
    // Find files that need indexing.
    const target = path.resolve(this.target);
    const totalFiles = {size: 0, count: 0};
    const items = await listImageFiles(target, totalFiles, index);
    // Quit if there is nothing to do.
    if (totalFiles.count == 0) {
      if (!index.has(target)) {
        console.error('No images under directory:', target);
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
    await buildIndex(model, target, items, ({count}) => bar.update(count), index);
    await writeIndexToDisk(index, indexPath);
    bar.stop();
    console.log(`Index saved to: ${shortPath(indexPath)}`);
    // Cleanup.
    model.close();
  }
}

const cli = new Cli({
  binaryName: 'sisi',
  binaryLabel: 'Semantic Image Search CLI',
  binaryVersion: packageJson.version,
});

cli.register(Builtins.HelpCommand);
cli.register(Builtins.VersionCommand);
cli.register(IndexCommand);
cli.runExit(process.argv.slice(2)).then(() => process.exit());
