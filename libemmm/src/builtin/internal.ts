import { debug } from "../debug";
import { debugPrint } from "../debug-print";
import { BlockEntity, BlockShorthand, InlineEntity, InlineShorthand, Message, SystemModifierNode } from "../interface";
import { ParseContext, ModifierNode, BlockModifierDefinition, InlineModifierDefinition, ModifierFlags, NodeType } from "../interface";
import { InlineDefinitonInvalidEntityMessage } from "../messages";
import { checkArguments } from "../modifier-helper";
import { _Ent, _Def } from "../typing-helper";
import { cloneNodes, assert } from "../util";
import { ConfigDefinitions } from "./module";

export type ModifierSignature = {
    slotName: string,
    args: string[]
}

export type BlockInstantiationData = {
    mod: BlockModifierDefinition<any>
    slotContent: BlockEntity[]
    args: Map<string, string>
}

export type InlineInstantiationData = {
    mod: InlineModifierDefinition<any>
    slotContent: InlineEntity[]
    args: Map<string, string>
}

export const builtins = Symbol();

declare module '../interface' {
    export interface ParseContextStoreDefinitions {
        [builtins]?: {
            blockSlotDelayedStack: ModifierSignature[];
            inlineSlotDelayedStack: ModifierSignature[];
            blockSlotData: [string, BlockInstantiationData][];
            inlineSlotData: [string, InlineInstantiationData][];
            modules: Map<string, ConfigDefinitions>;
            usedModules: Set<string>;
            insideModule: string | undefined;
        };
    }
}

export function initParseContext(cxt: ParseContext) {
    cxt.init(builtins, {
        blockSlotDelayedStack: [],
        inlineSlotDelayedStack: [],
        blockSlotData: [],
        inlineSlotData: [],
        modules: new Map(),
        usedModules: new Set(),
        insideModule: undefined
    });
}

export function customModifier<T extends NodeType.InlineModifier | NodeType.BlockModifier>(
    type: T, name: string, flag: ModifierFlags, argNames: string[], slotName: string, content: _Ent<T>[])
{
    debug.info(`created custom ${NodeType[type]}:`, name);
    debug.info('args:', argNames, `with ${slotName == '' ? 'no slot name' : 'slot name: ' + slotName}`);
    debug.trace(() => 'content is\n' + debugPrint.node(...content));

    type State = {
        ok: boolean,
        args: Map<string, string>
    }

    const mod = (type == NodeType.BlockModifier
        ? new BlockModifierDefinition<State>(name, flag)
        : new InlineModifierDefinition<State>(name, flag)
    ) as _Def<T, State>;
    const isInline = type == NodeType.InlineModifier;

    mod.delayContentExpansion = true;
    mod.prepareExpand = (node: ModifierNode<State>, cxt: ParseContext) => {
        let check = checkArguments(node, argNames.length);
        if (check) return check;
        node.state = { 
            ok: true,
            args: new Map(node.arguments.map((x, i) => [argNames[i], x.expansion!]))
        } satisfies State;
        return [];
    };
    mod.expand = (node: ModifierNode<State>, cxt: ParseContext) => {
        if (!node.state?.ok) return [];
        const contentClone = cloneNodes(content) as any[];
        return contentClone;
    };
    mod.beforeProcessExpansion = (node: ModifierNode<State>, cxt: ParseContext) => {
        if (!node.state?.ok) return [];
        const store = cxt.get(builtins)!;
        const data = isInline ? store.inlineSlotData : store.blockSlotData;
        data.push([slotName, { 
            mod: mod as any, args: node.state.args, 
            slotContent: node.content as any 
        }]);
        debug.trace(`pushed ${NodeType[type]} slot data for`, name,
            slotName == '' ? '(unnamed)' : `= ${slotName}`);
        return [];
    };
    mod.afterProcessExpansion = (node: ModifierNode<State>, cxt: ParseContext) => {
        if (!node.state?.ok) return [];
        const store = cxt.get(builtins)!;
        const data = isInline ? store.inlineSlotData : store.blockSlotData;
        const pop = data.pop();
        assert(pop !== undefined && pop[0] == slotName);
        debug.trace(`popped ${NodeType[type]} slot data for`, name,
            slotName == '' ? '(unnamed)' : `= ${slotName}`);
        return [];
    };
    return mod;
}

export function makeInlineDefinition(node: SystemModifierNode<any>, msgs: Message[]) {
    let lastIsParagraph = false;
    let concat: InlineEntity[] = [];
    for (const n of node.content) {
        switch (n.type) {
            case NodeType.Paragraph:
                if (!lastIsParagraph) {
                    lastIsParagraph = true;
                    concat.push(...n.content);
                    continue;
                }
            case NodeType.Preformatted:
            case NodeType.BlockModifier:
                msgs.push(new InlineDefinitonInvalidEntityMessage(n.start, n.end));
                break;
            case NodeType.SystemModifier:
                lastIsParagraph = false;
                concat.push(n);
                break;
            default:
                debug.never(n);
        }
    }
    return concat;
}
