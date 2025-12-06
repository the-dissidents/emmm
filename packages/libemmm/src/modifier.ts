import { Message, BlockModifierNode, BlockEntity, InlineModifierNode, InlineEntity, SystemModifierNode } from "./interface";
import { ParseContext } from "./parser-config";

export enum ModifierSlotType {
    Normal,
    /** Content is preformatted: no escaping, no inner tags */
    Preformatted,
    /** No content slot */
    None
}

export type ModifierMetadata = {
    // TODO
};

class ModifierBase<TNode, TEntity> {
    constructor(
        public readonly name: string,
        public readonly slotType = ModifierSlotType.Normal,
        args?: Partial<ModifierBase<TNode, TEntity>>) {
        if (args) Object.assign(this, args);
    }

    metadata: ModifierMetadata = {};

    /**
     * Common values: heading, emphasis, keyword, highlight, commentary, comment, link, quote
     */
    roleHint?: string;
    /**
     * If true, any modifier encountered inside it will *not* be expanded *during parse-content*,
     * *unless* that modifier is `alwaysTryExpand`. In the vast majority of cases, you shouldn't
     * be using this.
     */
    delayContentExpansion = false;
    /**
     * If true, such a modifier will always be expanded whenever it is encountered, *even if*
     * it is contained in a modifier with `delayContentExpansion`. In the vast majority of cases,
     * you shouldn't be using this.
     */
    alwaysTryExpand = false;

    /** Called before the modifier's content is parsed.
     * @param immediate False when the node is inside a `delayContentExpansion` modifier, but it is `alwaysTryExpand`; otherwise true.
    */
    beforeParseContent?: (node: TNode, cxt: ParseContext, immediate: boolean) => Message[];
    /** Called after the modifier's content is parsed.
     * @param immediate False when the node is inside a `delayContentExpansion` modifier, but it is `alwaysTryExpand`; otherwise true.
    */
    afterParseContent?: (node: TNode, cxt: ParseContext, immediate: boolean) => Message[];

    /** Called before reparsing of the expansion.
     * @param immediate False when the node is inside a `delayContentExpansion` modifier, but it is `alwaysTryExpand`; otherwise true.*/
    beforeProcessExpansion?: (node: TNode, cxt: ParseContext, immediate: boolean) => Message[];
    /** Called before reparsing of the expansion.
     * @param immediate False when the node is inside a `delayContentExpansion` modifier, but it is `alwaysTryExpand`; otherwise true.*/
    afterProcessExpansion?: (node: TNode, cxt: ParseContext, immediate: boolean) => Message[];

    /**
     * @param immediate False when the node is inside a `delayContentExpansion` modifier, but it is `alwaysTryExpand`; otherwise true.
     */
    prepareExpand?: (node: TNode, cxt: ParseContext, immediate: boolean) => Message[];
    /**
     * @param immediate False when the node is inside a `delayContentExpansion` modifier, but it is `alwaysTryExpand`; otherwise true.
     */
    expand?: (node: TNode, cxt: ParseContext, immediate: boolean) => TEntity[] | undefined;
}

export class BlockModifierDefinition<TState>
    extends ModifierBase<BlockModifierNode<TState>, BlockEntity> {
}

export class InlineModifierDefinition<TState>
    extends ModifierBase<InlineModifierNode<TState>, InlineEntity> {
}

export class SystemModifierDefinition<TState>
    extends ModifierBase<SystemModifierNode<TState>, never> {
}

export class ArgumentInterpolatorDefinition {
    constructor(
        public readonly name: string,
        public readonly postfix: string,
        args?: Partial<ArgumentInterpolatorDefinition>) {
        if (args) Object.assign(this, args);
    }

    alwaysTryExpand = false;
    expand?: (content: string, cxt: ParseContext, immediate: boolean) => string | undefined;
}
