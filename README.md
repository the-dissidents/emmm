<h1 align="center">
emmm
<img alt="image" src="https://img.shields.io/github/v/release/the-dissidents/emmm?include_prereleases&label=emmui">
</h1>

> *Legible, simple, consistent and extensible*

This is the monorepo for `emmm`, a better markup language for typesetting articles.

- `app/editor` – the GUI editor and publisher `emmui`. See [there](./apps/editor/README.md) for more instructions.
- `packages/libemmm` – parser for the language. See [there](packages/libemmm/README.md) for an overview of the language.
- `packages/minimal-jsx-runtime` - a private little wrapper for using JSX the above projects
- `packages/dom-css-inliner` - a CSS inliner based on DOM and CSSOM APIs
- `packages/emmui-plugin-sdk` - type definitions for `emmui` plugin development; auto-generated
- `packages/weixin-dark-mode` - a custom port of WeChat's official [`mp-darkmode`](https://github.com/wechatjs/mp-darkmode) package, emulating the platform's dark mode transformation logic

Plugins for the editor are structured as individual packages in `plugins/` (see more below).

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

3. You can now run the editor in development mode. Compilation may take several minutes for the first time.
   ```bash
   pnpm run dev
   ```

4. To build an executable bundle, run `pnpm run build-win` or `pnpm run build-mac`.

### Building the plugins

To build existing plugins from source, run:
```bash
pnpm run build:plugins
```

The compiled `.js` plugin files can be found in `plugins/dist/`.

For instructions about plugin development, see the relevant [documentation](apps/editor/src/lib/plugin/README.md) and the [example plugin](plugins/get-ip) which you can use as a template for new plugins.
