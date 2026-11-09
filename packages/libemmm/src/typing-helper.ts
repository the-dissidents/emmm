import { InlineInstantiationData, BlockInstantiationData } from "./builtin/internal";
import { InlineModifierNode, BlockModifierNode, InlineEntity, BlockEntity, SystemModifierNode, NodeType } from "./interface";
import { InlineShorthand, BlockShorthand } from "./parser-config";
import { InlineModifierDefinition, BlockModifierDefinition, SystemModifierDefinition } from "./modifier";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type _Node<T extends NodeType.InlineModifier | NodeType.BlockModifier | NodeType.SystemModifier, TState = any> =
    T extends NodeType.InlineModifier ? InlineModifierNode<TState> :
    T extends NodeType.BlockModifier ? BlockModifierNode<TState> :
    T extends NodeType.SystemModifier ? SystemModifierNode<TState> :
    never;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type _Def<T extends NodeType.InlineModifier | NodeType.BlockModifier | NodeType.SystemModifier, TState = any> =
    T extends NodeType.InlineModifier ? InlineModifierDefinition<TState> :
    T extends NodeType.BlockModifier ? BlockModifierDefinition<TState> :
    T extends NodeType.SystemModifier ? SystemModifierDefinition<TState> :
    never;

export type _Ent<T extends NodeType.InlineModifier | NodeType.BlockModifier | NodeType.SystemModifier> =
    T extends NodeType.InlineModifier ? InlineEntity :
    T extends NodeType.BlockModifier ? BlockEntity :
    T extends NodeType.SystemModifier ? BlockEntity :
    never;

export type _InstData<T extends NodeType.InlineModifier | NodeType.BlockModifier> =
    T extends NodeType.InlineModifier ? InlineInstantiationData : BlockInstantiationData;

export type _Shorthand<T extends NodeType.InlineModifier | NodeType.BlockModifier> =
    T extends NodeType.InlineModifier ? InlineShorthand<T> : BlockShorthand<T>;
