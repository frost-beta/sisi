#!/usr/bin/env node

import {Builtins, Cli, Command, Option} from 'clipanion';

import {getPackageJson, shortPath} from './fs.js';
import {index, search, listIndex, removeIndex} from './sisi.js';
import {presentResults} from './search.js';

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
    await index(this.target);
  }
}

export class SearchCommand extends Command {
  static paths = [ [ 'search' ] ];
  static usage = Command.Usage({
    description: 'Search the query string from indexed images.',
    examples: [
      [
        'Search pictures from all indexed images:',
        '$0 search cat',
      ],
      [
        'Search from the ~/Pictures/ directory:',
        '$0 search cat --in ~/Pictures/',
      ],
      [
        'Search images with remote image:',
        '$0 search https://images.pexels.com/photos/45201/kitty-cat-kitten-pet-45201.jpeg',
      ],
      [
        'Search images with local image:',
        '$0 search file:///Users/Your/Pictures/cat.jpg',
      ],
    ]
  });

  query = Option.String();
  target = Option.String('--in', {description: 'The directory where images are searched.'});
  max = Option.String('--max', 20, {description: 'The maximum number of results to return.'});
  print = Option.Boolean('--print', {description: 'Print the results to stdout.'});

  async execute() {
    const results = await search(this.query, {
      maxResults: parseInt(this.max),
      targetDir: this.target,
    });
    if (!results) {
      const target = this.target ?? '<target>'
      console.error(`No images in index, please run "sisi index ${target}" first.`);
      return;
    }
    if (results.length == 0) {
      console.error('There is no matching images');
      return;
    }
    if (this.print) {
      console.log(results.map(r => `${shortPath(r.filePath)}\n${r.score.toFixed(2)}`).join('\n'));
      return;
    }
    console.log('Showing results in your browser...');
    presentResults(this.query, results);
  }
}

export class ListIndexCommand extends Command {
  static paths = [ [ 'list-index' ] ];
  static usage = Command.Usage({
    description: 'List the directories in the index.',
  });

  async execute() {
    const results = await listIndex();
    if (results.length > 0)
      console.log(results.map(shortPath).join('\n'));
  }
}

export class RemoveIndexCommand extends Command {
  static paths = [ [ 'remove-index' ] ];
  static usage = Command.Usage({
    description: 'Remove index for all items under target directory.',
    examples: [
      [
        'Remove index for everything under ~/Pictures/',
        '$0 remove-index ~/Pictures/',
      ],
    ]
  });

  target = Option.String();

  async execute() {
    const removed = await removeIndex(this.target);
    for (const dir of removed)
      console.log('Index deleted:', dir);
  }
}

const cli = new Cli({
  binaryName: 'sisi',
  binaryLabel: 'Semantic Image Search CLI',
  binaryVersion: getPackageJson().version,
});

cli.register(Builtins.HelpCommand);
cli.register(Builtins.VersionCommand);
cli.register(IndexCommand);
cli.register(SearchCommand);
cli.register(ListIndexCommand);
cli.register(RemoveIndexCommand);
cli.runExit(process.argv.slice(2)).then(() => process.exit());
