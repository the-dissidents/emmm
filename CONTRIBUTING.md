# `emmm` Contributing Guide

Welcome aboard! This is a guide to help you contribute to the `emmm` project.

## Getting Started

To develop locally, we suggest forking this repository and clone it in your local machine. The `emmm` repo is a monorepo using `pnpm` workspaces. The package manager used to install and link dependencies must be [pnpm](https://pnpm.io/). You can find the required pnpm version in `package.json` under the `packageManager` key.

To develop and test the `emmm` editor:

Install dependencies in the root folder:

```bash
pnpm i
```

Run the editor in development and watch mode:

```bash
pnpm dev
```

Test and run the product build:

```bash
pnpm build
```

## How to Onboard the Project

More documentations can be found in the GitHub [wiki page](https://github.com/the-dissidents/emmm/wiki). If you still find anything that is unclear or unsound, please open an issue on GitHub or directly contact The Dissidents team.
