import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {existsSync} from 'node:fs';
import {Worker} from 'node:worker_threads';
import {ProcessedImage, ClipImageProcessor, Clip, loadImageProcessor} from '@frost-beta/clip';
import * as hub from '@frost-beta/huggingface';
import * as queue from '@henrygd/queue';

import {getCacheDir, shortPath} from './fs.js';

const batchSize = 5;

/**
 * Each item kept in batch.
 */
export interface BatchItem {
  image: ProcessedImage;
  resolver: PromiseWithResolvers<number[]>;
}

/**
 * The message sent to worker.
 */
export interface BatchMessage {
  id: number;
  labels?: string[];
  images?: ProcessedImage[];
}

/**
 * The response received from worker.
 */
export interface BatchResponse {
  id: number;
  labelEmbeddings?: number[][];
  imageEmbeddings?: number[][];
}

/**
 * A pipeline that does image processing in current thread and embedding
 * computation in the worker.
 */
export class Model {
  private worker: Worker;
  private imageProcessor: ClipImageProcessor;
  // Images are passed to model by batch, which is more efficient.
  private batch: BatchItem[] = [];
  // Images are processed in parallel, but there is no need to go over what one
  // batch can handle.
  private queueProcessImage = queue.newQueue(batchSize);
  // This queue holds 2 batches: one being processed and one to be.
  private queueComputeEmbeddings = queue.newQueue(batchSize * 2);
  // This queue ensures only one batch is sent at one time.
  private queueFlush = queue.newQueue(1);
  // The ID is used for marking the message for communication.
  private nextId = 0;

  /**
   * @param modelDir - Path to the CLIP model.
   */
  constructor(modelDir: string) {
    const options = {workerData: {modelDir}};
    if ((process as any)._preload_modules.length > 0) {
      // Hack for tsx, can be removed when tsx supports worker in future.
      this.worker = new Worker(`${import.meta.dirname}/../dist/worker.js`, options);
    } else {
      this.worker = new Worker(`${import.meta.dirname}/worker.js`, options);
    }
    this.imageProcessor = loadImageProcessor(modelDir);
  }

  /**
   * Get the embeddings for the image file located at filePath.
   * @param filePath - Path of the image file.
   */
  async computeImageEmbeddings(filePath: string): Promise<number[]> {
    const image = await this.queueProcessImage.add(() => this.imageProcessor.processImage(filePath));
    return await this.queueComputeEmbeddings.add(() => this.addToBatch(image));
  }

  /**
   * Stop the worker and close the model.
   */
  close() {
    if (this.batch.length > 0 || this.queueFlush.size() > 0)
      throw new Error('Can not close model as there are still works to do');
    this.worker.postMessage({id: 0});
  }

  private async addToBatch(image: ProcessedImage): Promise<number[]> {
    // The promise will be resolved when received its embeddings from worker.
    const resolver = Promise.withResolvers<number[]>();
    // Push the file and promise in batch.
    this.batch.push({image, resolver});
    // Send the batch to model when:
    // 1. There is enough items in the batch;
    // 2. There is no more files coming and there is no batch being processed.
    if (this.batch.length >= batchSize ||
        (this.queueFlush.size() == 0 && this.queueProcessImage.size() == 0))
      this.flush();
    // The caller will wait until the batch is handled.
    return resolver.promise;
  }

  private flush() {
    // If there is already a batch being processed, this call will wait.
    this.queueFlush.add(() => this.sendBatch());
  }

  private sendBatch(): Promise<void> {
    if (this.batch.length == 0)
      throw new Error('There is no batch to send');
    // Get and reset current batch.
    const id = ++this.nextId;
    const batch = this.batch;
    this.batch = [];
    // Send images in the batch to the worker.
    this.worker.postMessage({id, images: batch.map(b => b.image)});
    // Wait until worker replies.
    return new Promise<void>((resolve, reject) => {
      this.worker.once('message', (response: BatchResponse) => {
        let error: Error | undefined;
        if (response.id != id)
          reject(new Error(`Worker's response ID (${response.id}) does not match message ID (${id})`));
        if (!response.imageEmbeddings)
          reject(new Error('No image embeddings are received'));
        if (response.imageEmbeddings.length != batch.length)
          reject(new Error('Returned embeddings have wrong length'));
        // Send the results for the batch.
        for (let i = 0; i < batch.length; ++i)
          batch[i].resolver.resolve(response.imageEmbeddings[i]);
        // If there is no more flush being queued and there are remaining items
        // in the pending batch, flush it.
        if (this.queueFlush.size() == 1 && this.batch.length > 0)
          this.flush();
        // Go back to caller.
        resolve();
      });
    });
  }
}

/**
 * Create the proxy model.
 */
export async function loadModel() {
  return new Model(await getModelDir());
}

/**
 * Create the CLIP model.
 */
export async function loadClip() {
  return new Clip(await getModelDir());
}

/**
 * Return the model's directory, will download one if not exist.
 */
async function getModelDir(model = 'openai/clip-vit-large-patch14'): Promise<string> {
  const modelDir = `${getCacheDir()}/${path.basename(model)}`;
  if (!existsSync(modelDir)) {
    console.log(`Downloading CLIP model "${model}"...`);
    await hub.download(model, modelDir, {
      showProgress: true,
      filters: [ '*.json', '*.safetensors' ],
    });
    console.log(`Model saved to: ${shortPath(modelDir)}/`);
  }
  return modelDir;
}
