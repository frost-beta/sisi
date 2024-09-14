#!/usr/bin/env node

import {loadModel} from './model.js';
import {buildIndex} from './indexing.js';

main();

async function main() {
  const model = await loadModel();
  const index = await buildIndex(model, process.argv[2]);
  console.log(index);
  model.close();
}
