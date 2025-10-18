# emmm

> *Legible, simple, consistent and extensible*

This is the monorepo for `emmm`, a better markup language for typesetting articles.

- `app/editor` – GUI editor and publisher. See [there](./apps/editor/README.md) for more instructions.
- `packages/libemmm` – the parser and language server for the language. See [there](packages/libemmm/README.md) for an overview of the language.
- `packages/minimal-jsx-runtime` - a private little wrapper for using JSX the above projects
- `packages/dom-css-inliner` - a CSS inliner based on DOM and CSSOM APIs

## Releases

The project is still in a very early stage, many things are very incomplete. We don't plan to publish any releases until it's got a basic level of user-friendliness.

However, you can build the project yourself.

## Building

Make sure you have [Rust](https://rust-lang.org/tools/install/) and [Node.js](https://nodejs.org/en/download) installed.

1. Install `pnpm` if you haven't yet.

   ```bash
   npm install -g pnpm@latest-10
   ```

2. Install dependencies. Go to the root folder, run:

   ```bash
   pnpm i
   ```

3. Run the editor in development mode. Compilation may take several minutes for the first time.

   ```bash
   pnpm dev
   ```

4. To build an executable bundle, run:
   
   ```bash
   pnpm build
   ```