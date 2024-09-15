import fs from 'node:fs';
import os from 'node:os';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {ImageInputType, ClipInput, Clip} from '@frost-beta/clip';
import {core as mx} from '@frost-beta/mlx';
import {open} from 'openurl2';

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

/**
 * Print the results in HTML and show it in a browser.
 */
export function presentResults(query: string, results: {filePath: string, score: number}[]) {
  const imgs = results.map(r => {
    return `
<div>
  <a target="_blank" href="${(pathToFileURL(r.filePath))}">
    <img src="${pathToFileURL(r.filePath)}">
  </a>
  <span>Score: ${r.score.toFixed(2)}</span>
</div>`;
  });
  const html =
`<head>
<title>sisi search "${query}"</title>
<style>
  body {
    column-count: ${Math.min(results.length, 5)};
    column-gap: 1em;
    margin: 1em;
  }
  div {
    box-shadow: 0px 1px 8px 0px rgba(0,0,0,0.1);
    display: inline-block;
    width: 100%;
    margin-bottom: 1em;
  }
  img {
    transition: box-shadow 0.3s ease-in-out;
    display: block;
    width: 100%;
  }
  span {
    line-height: 1.5em;
    font-family: system-ui;
    display: flex;
    justify-content: center
  }
</style>
</head>
<body>
${imgs.join('')}
</body>`;
  const tempDir = fs.mkdtempSync(`${os.tmpdir()}/sisi-result-`);
  const tempFile = `${tempDir}/index.html`;
  fs.writeFileSync(tempFile, html);
  open(pathToFileURL(tempFile));
}
