# `emmm` plugin system

Plugins for `emmm` are plain JS files that can be loaded into projects. Once loaded, they can register hooks that influence the app's behavior and invoke commands.

Although they live in sandboxed `<iframe>`s, plugins are currently treated as trusted code. In the future we may introduce a kind of signing process where a plugin is signed with a comment line containing the hash of the code combined with a private key, and verified with a public key.

```text
 [ Plugin script file (simple JS) ]          [ Fixed bootstrap script ]
         |                                             |
         | load                                        | load
 [       |                    <iframe>                 |              ]
 [       v                                             v              ]
 [     [          ]       call registered hooks      [          ]     ]
 [     [          ]    async command abstractions    [          ]     ]
 [     [ <script> ]  <-----------------------------  [ <script> ]     ]
 [     [          ]  ----------------------------->  [          ]     ]
 [     [          ]         register hooks           [          ]     ]
                                                          ^ |
                                                          | |
                                            `onmessage` - x x - `postMessage`
                                                          | |
 Command API  ··························  command result  | |  command request
 Hook API  ··························  hook notification  | |  hook result
                                                          | |
                                          `postMessage` - x x - `onmessage`
                                                          | |
              [ ... ]              [ ... ]                | x - verified with `zod`
                ^ |                  ^ |                  | |
                | |                  | |                  | |
      [         | v                  | v                  | v              ]
      [ [ `PluginInstance` ] [ `PluginInstance` ] [ `PluginInstance` ] ... ]
      [                                                                    ]
      [                        `PluginManager`                             ]
                                     ^
                                     |
                                     v
                             [ emmm main app ]
```

## Message reference

> Note: the host waits up to 1000ms for the initial `plugin:ready` and for each hook response. Timing out results in an error.

### Sent by the plugin

#### ready

```typescript
{
    type: 'plugin:ready',
    id: string, // plugin identifier
    names: Record<string, string>, // i18n'ed name
    apiVersion: string, // target host API version
    ui?: PluginUiItem[],
}
```

This should be sent as soon as the plugin is loaded. Invocations and hooks are not available until the host has acknowledged this message.

#### command invocation

```typescript
{
    type: `plugin:command:${name}`,
    id: string, // plugin identifier
    args: CommandParam<C>
}
```

where `name: C extends CommandName`.

#### hook return

```typescript
{
    type: `plugin:hook:${name}`,
    id: string, // plugin identifier
    result: HookResult<C> | null
}
```

where `name: H extends HookName`. A plugin must answer *all* hook notifications. If no handler exists, a `null` result should be returned.

### Sent by the host

#### ready

```typescript
{
    type: 'host:ready'
}
```

#### generic error

```typescript
{
    type: 'host:error',
    message: string,
    payload: any
}
```

#### command result

```typescript
{
    type: `host:command:${name}`,
    status: 'ok',
    result: CommandResult<C>
}
```

where `name: C extends CommandName`.

#### command error

```typescript
{
    type: `host:command:${name}`,
    status: 'error',
    message: string,
    payload: any
}
```

where `name: C extends CommandName`.

#### hook notification

```typescript
{
    type: `host:hook:${name}`,
    args: HookParam<C>
}
```

where `name: H extends HookName`.
