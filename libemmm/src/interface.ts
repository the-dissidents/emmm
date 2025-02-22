import { ParseContext } from "./parser-config";

export enum MessageSeverity {
    Info,
    Warning,
    Error
}

// Fixes are optional language-server features
export type FixSuggestion = {
    info: string,
    apply(src: string, cursor: number): [out_src: string, new_cursor: number]
}

export type Message = {
    readonly severity: MessageSeverity,
    readonly start: number,
    readonly end: number,
    readonly info: string,
    readonly code: number,
    readonly fixes: readonly FixSuggestion[]
}

export type PositionRange = {
    start: number,
    end: number,
    // eh...
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

export type ParagraphNode = PositionRange & {
    type: NodeType.Paragraph,
    content: InlineEntity[]
};

export type PreNode = PositionRange & {
    type: NodeType.Preformatted,
    content: PositionRange & {text: string}
};

export type TextNode = PositionRange & {
    type: NodeType.Text,
    content: string
};

export type EscapedNode = PositionRange & {
    type: NodeType.Escaped,
    content: string
}

export type SystemModifierNode<TState> = PositionRange & {
    type: NodeType.SystemModifier,
    mod: SystemModifierDefinition<TState>,
    state?: TState,
    head: PositionRange,
    arguments: ModifierArgument[],
    content: BlockEntity[],
    expansion?: never[]
};

export type BlockModifierNode<TState> = PositionRange & {
    type: NodeType.BlockModifier,
    mod: BlockModifierDefinition<TState>,
    state?: TState,
    head: PositionRange,
    arguments: ModifierArgument[],
    content: BlockEntity[],
    expansion?: BlockEntity[]
};

export type InlineModifierNode<TState> = PositionRange & {
    type: NodeType.InlineModifier,
    mod: InlineModifierDefinition<TState>,
    state?: TState,
    head: PositionRange,
    arguments: ModifierArgument[],
    content: InlineEntity[],
    expansion?: InlineEntity[]
};

export type RootNode = PositionRange & {
    type: NodeType.Root
    content: BlockEntity[]
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
export type InterpolationNode = PositionRange & {
    type: NodeType.Interpolation,
    definition: ArgumentInterpolatorDefinition,
    argument: ModifierArgument,
    expansion?: string
}

export type ModifierArgument = PositionRange & {
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
    delayContentExpansion = false;
    alwaysTryExpand = false;

    beforeParseContent?: (node: TNode, cxt: ParseContext, immediate: boolean) => Message[];
    afterParseContent?: (node: TNode, cxt: ParseContext, immediate: boolean) => Message[];

    beforeProcessExpansion?: (node: TNode, cxt: ParseContext, immediate: boolean) => Message[];
    afterProcessExpansion?: (node: TNode, cxt: ParseContext, immediate: boolean) => Message[];

    prepareExpand?: (node: TNode, cxt: ParseContext, immediate: boolean) => Message[];
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