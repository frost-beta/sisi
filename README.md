# Semantic Image Search CLI (sisi)

CLI tool for semantic image search, locally without using third party APIs.

Powered by [node-mlx](https://github.com/frost-beta/node-mlx), a machine
learning framework for Node.js.

https://github.com/user-attachments/assets/66e6e437-c27b-48cf-80cc-a5a0c8c0bdfb

## Supported platforms

GPU support:

* Macs with Apple Silicon

CPU support:

* x64 Macs
* x64/arm64 Linux

(No support for Windows yet, but I might try to make MLX work on it in future)

For platforms without GPU support, the index command will be much slower, and
will take many hours indexing tens of thousands of images. The index is only
built for new and modified files, so once your have done the initial building,
updating index for new images will be much easier.

## Usage

Install:

```console
npm install -g @frost-beta/sisi
```

CLI:

```console
━━━ Semantic Image Search CLI - 0.0.1-dev ━━━━━━━━━━━━━━━━

  $ sisi <command>

━━━ General commands ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  sisi index <target>
    Build or update index for images under target directory.

  sisi list-index
    List the directories in the index.

  sisi remove-index <target>
    Remove index for all items under target directory.

  sisi search [--in #0] [--max #0] [--print] <query>
    Search the query string from indexed images.
```

## Examples

Build index for `~/Pictures/`:

```console
sisi index ~/Pictures/
```

Search pictures from all indexed images:

```console
sisi search 'cat jumping'
```

Search from the `~/Pictures/` directory:

```console
sisi search cat --in ~/Pictures/
```

Search images with image:

```console
sisi search https://images.pexels.com/photos/45201/kitty-cat-kitten-pet-45201.jpeg
```

It works with local files too:

```console
sisi search file:///Users/Your/Pictures/cat.jpg
```

## Under the hood

The index is built by computing the embeddings of images using the [CLIP
model](https://github.com/openai/CLIP), and then stored in a binary JSON file.

Searching the images is computing cosine similarities between the query string
and the indexed embeddings. There is no database involved here, everytime you do
a search the computation is done for all the embeddings stored, which is very
fast even when you have tens of thousands of pictures.

The JavaScript implementation of the CLIP model is in a separate module:
[frost-beta/clip](https://github.com/frost-beta/clip).

## License

MIT
