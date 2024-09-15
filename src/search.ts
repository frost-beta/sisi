import {fileURLToPath} from 'node:url';
import {ImageInputType, ClipInput, Clip} from '@frost-beta/clip';
import {core as mx} from '@frost-beta/mlx';

/**
 * Compute the embedding for text or image depending on the query.
 */
export async function computeEmbeddingForQuery(clip: Clip, query: string) {
  const input: ClipInput = {};
  try {
    // If the query is an URL, treat it as image.
    const url = new URL(query);
    let image: ImageInputType;
    if (url.protocol == 'file:') {
      image = fileURLToPath(url);
    } else {
      const response = await fetch(url);
      image = await response.arrayBuffer();
    }
    input.images = await clip.processImages([ image ]);
  } catch (error) {
    if (error instanceof TypeError && error.message == 'Invalid URL') {
      // Expected error when query is not an URL.
    } else {
      throw new Error(`Can not get image from the query URL: ${error.message}`);
    }
  }
  if (!input.images)
    input.labels = [ query ];
  const output = clip.computeEmbeddings(input);
  return {
    isTextQuery: !input.images,
    queryEmbeddings: input.images ? output.imageEmbeddings
                                  : output.labelEmbeddings,
  };
}
