#!/usr/bin/env node

import {Builtins, Cli, Command, Option} from 'clipanion';

import {index, search} from './sisi.js';
import packageJson from '../package.json' with {type: 'json'};

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
        'Search "cat" in all files in the index',
        '$0 search cat',
      ],
    ]
  });

  query = Option.String();
  target = Option.String('--in', {description: 'The directory where images are searched'});

  async execute() {
    await search(this.query, this.target);
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
cli.register(SearchCommand);
cli.runExit(process.argv.slice(2)).then(() => process.exit());
