import { ParseContext } from "./parser-config";
import { Source } from "./source";

export enum MessageSeverity {
    Info,
    Warning,
    Error
}

export type Message = {
    readonly severity: MessageSeverity,
    readonly location: LocationRange,
    readonly info: string,
    readonly code: number
}

export type LocationRange = {
    original?: LocationRange
    source: Source,
    start: number,
    end: number,

    // FIXME: eh...
    actualEnd?: number
};

export enum NodeType {
    Root,
    Paragraph,
    Preformatted,
    Text,
    Escaped,
    SystemModifier,
    InlineModifier,
    BlockModifier,
    Interpolation
}

export type ParagraphNode = {
    location: LocationRange,
    type: NodeType.Paragraph,
    content: InlineEntity[]
};

export type PreNode = {
    location: LocationRange,
    type: NodeType.Preformatted,
    content: {
        start: number,
        end: number,
        text: string
    }
};

export type TextNode = {
    location: LocationRange,
    type: NodeType.Text,
    content: string
};

export type EscapedNode = {
    location: LocationRange,
    type: NodeType.Escaped,
    content: string
}

export type SystemModifierNode<TState> = {
    location: LocationRange,
    type: NodeType.SystemModifier,
    mod: SystemModifierDefinition<TState>,
    state?: TState,
    head: LocationRange,
    arguments: ModifierArgument[],
    content: BlockEntity[],
    expansion?: never[]
};

export type BlockModifierNode<TState> = {
    location: LocationRange,
    type: NodeType.BlockModifier,
    mod: BlockModifierDefinition<TState>,
    state?: TState,
    head: LocationRange,
    arguments: ModifierArgument[],
    content: BlockEntity[],
    expansion?: BlockEntity[]
};

export type InlineModifierNode<TState> = {
    location: LocationRange,
    type: NodeType.InlineModifier,
    mod: InlineModifierDefinition<TState>,
    state?: TState,
    head: LocationRange,
    arguments: ModifierArgument[],
    content: InlineEntity[],
    expansion?: InlineEntity[]
};

export type RootNode = {
    type: NodeType.Root
    content: BlockEntity[],
    source: Source
}

export type ModifierNode<T = any> = 
    BlockModifierNode<T> | InlineModifierNode<T> | SystemModifierNode<T>;
export type BlockEntity = 
    ParagraphNode | PreNode | BlockModifierNode<any> | SystemModifierNode<any>;
export type InlineEntity = 
    TextNode | EscapedNode | InlineModifierNode<any> | SystemModifierNode<any>;
export type DocumentNode = 
    BlockEntity | InlineEntity | RootNode;

// used in arguments only
export type InterpolationNode = {
    location: LocationRange,
    type: NodeType.Interpolation,
    definition: ArgumentInterpolatorDefinition,
    argument: ModifierArgument,
    expansion?: string
}

export type ModifierArgument = {
    location: LocationRange,
    content: ArgumentEntity[]
    expansion?: string
}

export type ArgumentEntity = TextNode | EscapedNode | InterpolationNode;

export enum ModifierSlotType {
    Normal,
    /** Content is preformatted: no escaping, no inner tags */
    Preformatted,
    /** No content slot */
    None
}

class ModifierBase<TNode, TEntity> {
    constructor(
        public readonly name: string, 
        public readonly slotType = ModifierSlotType.Normal,
        args?: Partial<ModifierBase<TNode, TEntity>>) 
    {
        if (args) Object.assign(this, args);
    }

    roleHint?: string;
    /**
     * If true, any modifier encountered inside it will *not* be expanded *during parse-content*, 
     * *unless* that modifier is `alwaysTryExpand`. In the vast majority of cases, you shouldn't 
     * be using this.
     */
    delayContentExpansion = false;
    /**
     * If true, such a modifier will always be expanded whenever it is encountered, *even if* 
     * contained in a modifier with `delayContentExpansion`. In the vast majority of cases, 
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
    extends ModifierBase<BlockModifierNode<TState>, BlockEntity> {}

export class InlineModifierDefinition<TState> 
    extends ModifierBase<InlineModifierNode<TState>, InlineEntity> {}

export class SystemModifierDefinition<TState> 
    extends ModifierBase<SystemModifierNode<TState>, never> {}

export class ArgumentInterpolatorDefinition {
    constructor(
        public readonly name: string,
        public readonly postfix: string,
        args?: Partial<ArgumentInterpolatorDefinition>) 
    {
        if (args) Object.assign(this, args);
    }

    alwaysTryExpand = false;
    expand?: (content: string, cxt: ParseContext, immediate: boolean) => string | undefined;
}

type Shorthand<TMod> = {
    name: string,
    parts: readonly string[],
    postfix: string | undefined,
    mod: TMod
};

export type BlockShorthand<TState> = Shorthand<BlockModifierDefinition<TState>>;
export type InlineShorthand<TState> = Shorthand<InlineModifierDefinition<TState>>;