import {parentPort, workerData} from 'node:worker_threads';
import {core as mx} from '@frost-beta/mlx';
import {Clip} from '@frost-beta/clip';

import type {BatchMessage, BatchResponse} from './model.js';

const clip = new Clip(workerData.modelDir);

parentPort.on('message', ({id, labels, images}: BatchMessage) => {
  if (id == 0)
    process.exit(0);
  mx.tidy(() => {
    const output = clip.computeEmbeddings({labels, images});
    const response: BatchResponse = {id};
    if (labels)
      response.labelEmbeddings = output.labelEmbeddings.tolist() as number[][];
    if (images)
      response.imageEmbeddings = output.imageEmbeddings.tolist() as number[][];
    parentPort.postMessage(response);
  });
});
