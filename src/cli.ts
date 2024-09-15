#!/usr/bin/env node

import {Builtins, Cli, Command, Option} from 'clipanion';

import {getPackageJson} from './fs.js';
import {index, search} from './sisi.js';
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
  target = Option.String('--in', {description: 'The directory where images are searched'});

  async execute() {
    presentResults(await search(this.query, this.target));
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
cli.runExit(process.argv.slice(2)).then(() => process.exit());
