import * as z from "zod/v4-mini";

// export const HostManifest = z.object({
//     appVersion: z.string(),
//     apiVersion: z.string(),
//     apiCompatibleVersion: z.string(),
// });

// export type HostManifest = z.infer<typeof HostManifest>;

export const PluginManifest = z.object({
    id: z.string(),
    version: z.string(),
    names: z.record(z.string(), z.string()),
    apiVersion: z.string()
});

export type PluginManifest = z.infer<typeof PluginManifest>;

export const PluginConfigItem = z.union([
    z.object({
        type: z.literal('checkbox'),
        id: z.string(),
        names: z.record(z.string(), z.string()),
        defaultValue: z.boolean()
    }),
    z.object({
        type: z.literal('string'),
        id: z.string(),
        names: z.record(z.string(), z.string()),
        defaultValue: z.string()
    }),
]);

export const PluginAction = z.union([
    z.object({
        type: z.literal('button'),
        id: z.string(),
        names: z.record(z.string(), z.string()),
    }),
]);

export const CommandDefinitions = {
    'counter': z.object({
        param: z.void(),
        return: z.number()
    }),
    'log': z.object({
        param: z.any(),
        return: z.void()
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
};

export type HookName = keyof typeof HookDefinitions;
export type HookParam<N extends HookName> = z.infer<typeof HookDefinitions[N]>['param'];
export type HookReturn<N extends HookName> = z.infer<typeof HookDefinitions[N]>['return'];
