import { Source } from "./source";
import { SystemModifierDefinition, BlockModifierDefinition, InlineModifierDefinition, ArgumentInterpolatorDefinition } from "./modifier";

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
};

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

export type RootNode = {
    type: NodeType.Root
    content: BlockEntity[],
    source: Source
};

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

export type ModifierArguments = {
    positional: ModifierArgument[],
    named: Map<string, ModifierArgument>,
    location: LocationRange,
}

type ModifierNodeBase<TState> = {
    location: LocationRange,
    state?: TState,
    head: LocationRange,
    arguments: ModifierArguments
}

export type SystemModifierNode<TState> = ModifierNodeBase<TState> & {
    type: NodeType.SystemModifier,
    mod: SystemModifierDefinition<TState>,
    content: BlockEntity[],
    expansion?: never[],
};

export type BlockModifierNode<TState> = ModifierNodeBase<TState> & {
    type: NodeType.BlockModifier,
    mod: BlockModifierDefinition<TState>,
    content: BlockEntity[],
    expansion?: BlockEntity[]
};

export type InlineModifierNode<TState> = ModifierNodeBase<TState> & {
    type: NodeType.InlineModifier,
    mod: InlineModifierDefinition<TState>,
    content: InlineEntity[],
    expansion?: InlineEntity[]
};

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
};

export type ModifierArgument = {
    location: LocationRange,
    content: ArgumentEntity[]
    expansion?: string
};

export type ArgumentEntity = TextNode | EscapedNode | InterpolationNode;
