import {parentPort, workerData} from 'node:worker_threads';
import {Clip} from '@frost-beta/clip';

import type {BatchMessage, BatchResponse} from './model.js';

const clip = new Clip(workerData.modelDir);

parentPort.on('message', async ({id, labels, images}: BatchMessage) => {
  if (id == 0)
    process.exit(0);
  const output = await clip.computeEmbeddings({labels, images});
  const response: BatchResponse = {id};
  if (labels)
    response.labelEmbeddings = output.labelEmbeddings.tolist() as number[][];
  if (images)
    response.imageEmbeddings = output.imageEmbeddings.tolist() as number[][];
  parentPort.postMessage(response);
});
