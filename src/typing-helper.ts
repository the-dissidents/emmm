import { InlineModifierNode, BlockModifierNode, InlineModifierDefinition, BlockModifierDefinition, InlineInstantiationData, BlockInstantiationData, InlineEntity, BlockEntity, SystemModifierNode, SystemModifierDefinition } from "./interface";


export type _Node<T extends 'inline' | 'block' | 'system', TState = unknown> = 
    T extends 'inline' ? InlineModifierNode<TState> : 
    T extends 'block' ? BlockModifierNode<TState> : 
    T extends 'system' ? SystemModifierNode<TState> : 
    never;

export type _Def<T extends 'inline' | 'block' | 'system', TState = unknown> = 
    T extends 'inline' ? InlineModifierDefinition<TState> : 
    T extends 'block' ? BlockModifierDefinition<TState> : 
    T extends 'system' ? SystemModifierDefinition<TState> : 
    never;
    
export type _Ent<T extends 'inline' | 'block' | 'system'> = 
    T extends 'inline' ? InlineEntity : 
    T extends 'block' ? BlockEntity : 
    T extends 'system' ? BlockEntity : 
    never;

export type _InstData<T extends 'inline' | 'block'> = 
    T extends 'inline' ? InlineInstantiationData : BlockInstantiationData;
