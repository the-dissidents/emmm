import * as z from "zod/v4-mini";

export const PluginUIConfigItem = z.union([
    z.object({
        input: z.literal('checkbox'),
        key: z.string(),
        names: z.record(z.string(), z.string()),
        defaultValue: z.boolean(),
        readonly: z.optional(z.boolean()),
    }),
    z.object({
        input: z.literal('textbox'),
        key: z.string(),
        names: z.record(z.string(), z.string()),
        defaultValue: z.string(),
        readonly: z.optional(z.boolean()),
    }),
    z.object({
        input: z.literal('textarea'),
        key: z.string(),
        names: z.record(z.string(), z.string()),
        defaultValue: z.string(),
        readonly: z.optional(z.boolean()),
    }),
    z.object({
        input: z.literal('path'),
        key: z.string(),
        names: z.record(z.string(), z.string()),
        defaultValue: z.string(),
        readonly: z.optional(z.boolean()),
    }),
]);

export const PluginUIActionItem = z.union([
    z.object({
        action: z.literal('button'),
        key: z.string(),
        names: z.record(z.string(), z.string()),
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
    'path': z.string()
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
