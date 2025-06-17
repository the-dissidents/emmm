import { debug } from "./debug";
import { BlockEntity, InlineEntity, NodeType, ParagraphNode, TextNode, PreNode, EscapedNode, BlockModifierNode, InlineModifierNode, BlockModifierDefinition, InlineModifierDefinition } from "./interface";
import { Document, ParseContext } from "./parser-config";

export type RendererType<TState, TReturn, TDocument, TOptions = undefined> = {
    state: TState;
    return: TReturn;
    document: TDocument;
    options: TOptions;
};

type AnyRendererType = RendererType<any, any, any, any>;

type getState<Type> = Type extends RendererType<infer T, any, any, any> ? T : never;
type getReturn<Type> = Type extends RendererType<any, infer T, any, any> ? T : never;
type getDocument<Type> = Type extends RendererType<any, any, infer T, any> ? T : never;
type getOptions<Type> = Type extends RendererType<any, any, any, infer T> ? T : never;

export type NodeRenderer<Type extends AnyRendererType, TNode> = 
    (node: TNode, cxt: RenderContext<Type>) => getReturn<Type>;

export type NodeRendererDefinition<Type extends AnyRendererType, TNode, TDef> = 
    [def: TDef, renderer: NodeRenderer<Type, TNode>];

export class RenderContext<Type extends AnyRendererType> {
    renderEntity(node: BlockEntity | InlineEntity): getReturn<Type> | undefined {
        switch (node.type) {
            case NodeType.Paragraph:
                return this.config.paragraphRenderer?.(node, this);
            case NodeType.Preformatted:
            case NodeType.Text:
            case NodeType.Escaped:
                return this.config.textRenderer?.(node, this);
            case NodeType.InlineModifier:
                let ir = this.config.inlineRenderers.get(node.mod);
                if (ir) return ir(node, this);
                return this.config.undefinedInlineRenderer?.(node, this);
            case NodeType.BlockModifier:
                let br = this.config.blockRenderers.get(node.mod);
                if (br) return br(node, this);
                return this.config.undefinedBlockRenderer?.(node, this);
            case NodeType.SystemModifier:
                return undefined;
            default:
                return debug.never(node);
        }
    }

    constructor(
        public readonly config: RenderConfiguration<Type>,
        public readonly parsedDocument: Document,
        public state: getState<Type>) { }
}

export interface ReadonlyRenderConfiguration<Type extends AnyRendererType> {
    readonly options: getOptions<Type>;

    readonly paragraphRenderer?: NodeRenderer<Type, ParagraphNode>;
    readonly textRenderer?: NodeRenderer<Type, TextNode | PreNode | EscapedNode>;

    readonly undefinedBlockRenderer?: NodeRenderer<Type, BlockModifierNode<any>>;
    readonly undefinedInlineRenderer?: NodeRenderer<Type, InlineModifierNode<any>>;

    readonly blockRenderers: ReadonlyMap<
        BlockModifierDefinition<any>, NodeRenderer<Type, BlockModifierNode<any>>>;
    readonly inlineRenderers: ReadonlyMap<
        InlineModifierDefinition<any>, NodeRenderer<Type, InlineModifierNode<any>>>;

    readonly postprocessor: (results: getReturn<Type>[], cxt: RenderContext<Type>) => getDocument<Type>;

    render(doc: Document, state: getState<Type>): getDocument<Type>;
}

export type BlockRendererDefiniton<Type extends AnyRendererType, ModState = any> = NodeRendererDefinition<Type, BlockModifierNode<ModState>, BlockModifierDefinition<ModState>>;

export type InlineRendererDefiniton<Type extends AnyRendererType, ModState = any> = NodeRendererDefinition<Type, InlineModifierNode<ModState>, InlineModifierDefinition<ModState>>;

export class RenderConfiguration<Type extends AnyRendererType>
    implements ReadonlyRenderConfiguration<Type>
{
    paragraphRenderer?: NodeRenderer<Type, ParagraphNode>;
    textRenderer?: NodeRenderer<Type, TextNode | PreNode | EscapedNode>;

    undefinedBlockRenderer?: NodeRenderer<Type, BlockModifierNode<any>>;
    undefinedInlineRenderer?: NodeRenderer<Type, InlineModifierNode<any>>;

    blockRenderers = new Map<
        BlockModifierDefinition<any>,
        NodeRenderer<Type, BlockModifierNode<any>>>;
    inlineRenderers = new Map<
        InlineModifierDefinition<any>,
        NodeRenderer<Type, InlineModifierNode<any>>>;

    constructor(
        public options: getOptions<Type>,
        public postprocessor: 
            (results: getReturn<Type>[], cxt: RenderContext<Type>) => getDocument<Type>
    ) { }

    render(doc: Document, state: getState<Type>): getDocument<Type> {
        let cxt = new RenderContext(this, doc, state);
        let results = doc.toStripped()
            .root.content
            .map((x) => cxt.renderEntity(x))
            .filter((x) => (x !== undefined)) as getReturn<Type>[];
        return this.postprocessor(results, cxt);
    }

    addBlockRenderer(...rs: BlockRendererDefiniton<Type>[]) {
        rs.forEach(([x, y]) => this.blockRenderers.set(x, y));
    }

    addInlineRenderer(...rs: InlineRendererDefiniton<Type>[]) {
        rs.forEach(([x, y]) => this.inlineRenderers.set(x, y));
    }

    static from<Type extends AnyRendererType>(from: ReadonlyRenderConfiguration<Type>) {
        let config = new RenderConfiguration(from.options, from.postprocessor);
        config.paragraphRenderer = from.paragraphRenderer;
        config.textRenderer = from.textRenderer;
        config.undefinedBlockRenderer = from.undefinedBlockRenderer;
        config.undefinedInlineRenderer = from.undefinedInlineRenderer;
        config.inlineRenderers = new Map(from.inlineRenderers);
        config.blockRenderers = new Map(from.blockRenderers);
        return config;
    }
}
