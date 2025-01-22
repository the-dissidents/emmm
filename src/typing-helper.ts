import { InlineModifierNode, BlockModifierNode, InlineModifierDefinition, BlockModifierDefinition, InlineInstantiationData, BlockInstantiationData, InlineEntity, BlockEntity, SystemModifierNode, SystemModifierDefinition, NodeType } from "./interface";


export type _Node<T extends NodeType.InlineModifier | NodeType.BlockModifier | NodeType.SystemModifier, TState = unknown> = 
    T extends NodeType.InlineModifier ? InlineModifierNode<TState> : 
    T extends NodeType.BlockModifier ? BlockModifierNode<TState> : 
    T extends NodeType.SystemModifier ? SystemModifierNode<TState> : 
    never;

export type _Def<T extends NodeType.InlineModifier | NodeType.BlockModifier | NodeType.SystemModifier, TState = unknown> = 
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
