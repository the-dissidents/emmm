# Introduction to the plugin system

> This is a guide for *plugin authors*. For technical notes about the internal architecture of the plugin system, see [TECHNICAL.md](./TECHNICAL.md).

Plugins for `emmui` are *plain Javascript files* that can be loaded into workspaces and communicate with the host via a set of plugin API. We have exposed the type definitions of the API as the package `@the_dissidents/emmui-plugin-sdk`; to add them to a TypeScript project, simply add the package and insert this line at the start of your code:

```typescript
import type {} from "@the_dissidents/emmui-plugin-sdk";
```

This gives you the `emmui` object in `globalThis`.

Note the `import type` prevents the bundler from attempting to compile the API along with your code. This won't work because it should be injected to the environment at runtime.

## Important concepts

Once loaded, the plugin should report to the host app and supply a *plugin manifest*:

```typescript
await emmui.init({
    // Plugin identifier.
    id: 'my-plugin',

    // Version of the plugin.
    version: '000001',

    // The target plugin API version of the host app.
    apiVersion: '000200',

    // Internationalized names of the plugin.
    names: {
        'en-us': 'Test plugin',
        'zh-cn': '测试插件',
    },

    // Define actions and configurable fields available in the host's UI.
    ui: []
});
```

Note that the plugin identifier must be unique and correspond to the plugin's file name, e.g. the example plugin above should have a file name of `my-plugin.js`. This is because workspace files store plugin IDs, and the app resolves an ID to its source file by just looking into the corresponding file in `${AppConfigDir}/plugins/`. Conversely, installing a plugin is just copying the source into that folder.

After `init` finishes, the plugin gains the ability to call commands to communicate with the host:
```typescript
await emmui.call('log', 'initialized');

let value = await emmui.call('config', 'path');
```

The plugin can also register hooks that influence the app's behavior:
```typescript
emmui.on('ping', async () => {
    return `ping ok`;
});

emmui.onAction('mybutton', async () => { ... });
```

> Note: the host waits up to 1000ms for each hook response. This means if you need to interact with the user in a blocking way (eg. displaying message boxes) you need to return from the hook handler early while letting the interaction continue running:
>  ```typescript
> emmui.onAction('mybutton', async () => {
>     /* ... */
>     const run = async () => { /* message box etc */ };
>     void run();
> });
> ```

Typically, the main part of a plugin is written as an `async` function that is immediately evaluated:

```typescript
void (async () => {
    // await init(...);
})();
```

## Command reference

## Hook reference
