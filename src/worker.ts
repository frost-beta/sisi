import {parentPort, workerData} from 'node:worker_threads';
import {Clip} from '@frost-beta/clip';

import type {BatchMessage, BatchResponse} from './model.js';

const clip = new Clip(workerData.modelDir);

parentPort.on('message', ({id, labels, images}: BatchMessage) => {
  if (id == 0)
    process.exit(0);
  const response: BatchResponse = {id};
  if (labels)
    response.labelEmbeddings = clip.computeLabelEmbeddingsJs(labels);
  if (images)
    response.imageEmbeddings = clip.computeImageEmbeddingsJs(images);
  parentPort.postMessage(response);
});
