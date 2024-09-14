# Semantic Image Search CLI (sisi)

:construction:

CLI tool for semantic image search, locally without Internet.

Powered by [node-mlx](https://github.com/frost-beta/node-mlx), a machine
learning framework for Node.js.

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

```

## Examples

Build index for `~/Pictures/`:

```console
sisi index ~/Pictures/
```

Search images with text:

```console
sisi search 'cat pic'
```

Search images with image:

```console
sisi search https://images.pexels.com/photos/45201/kitty-cat-kitten-pet-45201.jpeg
```

## License

MIT
