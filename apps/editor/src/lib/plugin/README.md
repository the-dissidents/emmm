# Introduction to the plugin system

Plugins for `emmm` are *plain Javascript files* that can be loaded into workspaces.

A few functions are available in the enviroment where a plugin runs to enable communication with the host. Once loaded, the plugin should report to the host app and supply a *plugin manifest*:

```typescript
await init({
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
await call('log', 'initialized');

let value = await call('config', 'path');
```

The plugin can also register hooks that influence the app's behavior:
```typescript
on('ping', async () => {
    return `ping ok`;
});

onAction('mybutton', async () => { ... });
```

> Note: the host waits up to 1000ms for each hook response. This means if you need to interact with the user in a blocking way (eg. displaying message boxes) you need to return from the hook handler early while letting the interaction running:
>  ```typescript
> onAction('mybutton', async () => {
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
