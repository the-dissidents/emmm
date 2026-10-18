import * as z from "zod/v4-mini";

const I18nString = z.record(z.string(), z.string());

export const PluginUIConfigItem = z.union([
    z.object({
        input: z.literal('checkbox'),
        key: z.string(),
        names: I18nString,
        defaultValue: z.boolean(),
        readonly: z.optional(z.boolean()),
    }),
    z.object({
        input: z.literal('textbox'),
        key: z.string(),
        names: I18nString,
        defaultValue: z.string(),
        readonly: z.optional(z.boolean()),
    }),
    z.object({
        input: z.literal('textarea'),
        key: z.string(),
        names: I18nString,
        defaultValue: z.string(),
        readonly: z.optional(z.boolean()),
    }),
    z.object({
        input: z.literal('folder'),
        key: z.string(),
        names: I18nString,
        defaultValue: z.string(),
        readonly: z.optional(z.boolean()),
    }),
    z.object({
        input: z.literal('file'),
        key: z.string(),
        names: I18nString,
        defaultValue: z.string(),
        readonly: z.optional(z.boolean()),
    }),
    z.object({
        input: z.literal('select'),
        key: z.string(),
        names: I18nString,
        options: z.array(z.union([z.string(), z.tuple([z.string(), I18nString])])),
        defaultValue: z.string(),
    }),
]);

export const PluginUIActionItem = z.union([
    z.object({
        action: z.literal('button'),
        key: z.string(),
        names: I18nString,
    }),
]);

export const PluginUIItem = z.union([
    PluginUIActionItem,
    PluginUIConfigItem,
]);

export const PluginUIValueType = {
    'checkbox': z.boolean(),
    'textbox': z.string(),
    'textarea': z.string(),
    'folder': z.string(),
    'file': z.string(),
    'select': z.string(),
};

export type PluginUIActionItem = z.infer<typeof PluginUIActionItem>;
export type PluginUIConfigItem = z.infer<typeof PluginUIConfigItem>;
export type PluginUIItem = z.infer<typeof PluginUIItem>;
export type PluginUIItemType = keyof typeof PluginUIValueType;

export const PluginManifest = z.object({
    id: z.string(),
    version: z.string(),
    names: z.record(z.string(), z.string()),
    apiVersion: z.string(),
    ui: z._default(z.array(PluginUIItem), [])
});

export type PluginManifest = z.infer<typeof PluginManifest>;

export const CommandDefinitions = {
    'get': z.object({
        param: z.string(),
        return: z.unknown()
    }),
    'set': z.object({
        param: z.object({
            key: z.string(),
            value: z.unknown()
        }),
        return: z.void()
    }),
    'counter': z.object({
        param: z.void(),
        return: z.number()
    }),
    'log': z.object({
        param: z.any(),
        return: z.void()
    }),
    'warn': z.object({
        param: z.any(),
        return: z.void()
    }),
    'error': z.object({
        param: z.any(),
        return: z.void()
    }),
    'read-text-file': z.object({
        param: z.string(),
        return: z.nullable(z.string())
    }),
    'read-binary-file': z.object({
        param: z.string(),
        return: z.nullable(z.instanceof(Uint8Array))
    }),
    'messagebox': z.object({
        param: z.object({
            msg: z.string(),
            title: z.optional(z.string()),
            kind: z.optional(z.enum(['info', 'warning', 'error']))
        }),
        return: z.string()
    }),
};

export type CommandName = keyof typeof CommandDefinitions;
export type CommandParam<N extends CommandName> = z.infer<typeof CommandDefinitions[N]>['param'];
export type CommandReturn<N extends CommandName> = z.infer<typeof CommandDefinitions[N]>['return'];
export type CommandReturnData<N extends CommandName> = {
    data: z.infer<typeof CommandDefinitions[N]>['return'],
    transfer?: Transferable[]
}

export const HookDefinitions = {
    'finalize': z.object({
        param: z.void(),
        return: z.void()
    }),
    'ping': z.object({
        param: z.void(),
        return: z.string()
    }),
    'action': z.object({
        param: z.string(),
        return: z.void()
    }),
};

export type HookName = keyof typeof HookDefinitions;
export type HookParam<N extends HookName> = z.infer<typeof HookDefinitions[N]>['param'];
export type HookReturn<N extends HookName> = z.infer<typeof HookDefinitions[N]>['return'];

export type HookArgs<N extends HookName> = {
    args: HookParam<N>,
    transfer?: Transferable[]
};
