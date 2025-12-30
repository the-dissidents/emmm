import { debug } from "./debug";
import { LocationRange, ModifierArgument, NodeType, DocumentNode } from "./interface";


export type CloneNodeOptions = {
    newLocation?: LocationRange;
    withState?: boolean;
};
const cloneArgument = (arg: ModifierArgument, options: CloneNodeOptions): ModifierArgument => ({
    location: cloneLocation(arg.location, options),
    content: arg.content.map((ent) => {
        switch (ent.type) {
            case NodeType.Text:
            case NodeType.Escaped:
                return cloneNode(ent, options);
            case NodeType.Interpolation:
                return {
                    type: ent.type,
                    location: cloneLocation(arg.location, options),
                    definition: ent.definition,
                    argument: cloneArgument(ent.argument, options),
                    expansion: ent.expansion
                };
            default:
                return debug.never(ent);
        }
    })
});
function cloneLocation(pos: LocationRange, options: CloneNodeOptions): LocationRange {
    let base = options.newLocation ?? pos;
    return {
        start: base.start,
        end: base.end,
        actualEnd: base.actualEnd,
        original: options.newLocation ? pos : pos.original,
        source: base.source
    };
}

export function cloneNode<T extends DocumentNode>(
    node: T, options: CloneNodeOptions = {}
): T {
    switch (node.type) {
        case NodeType.BlockModifier:
        case NodeType.InlineModifier:
        case NodeType.SystemModifier:
            return {
                location: cloneLocation(node.location, options),
                type: node.type,
                mod: node.mod,
                state: options.withState ? node.state : undefined,
                head: cloneLocation(node.head, options), // TODO: options or {}?
                arguments: {
                    positional: node.arguments.positional.map((x) => cloneArgument(x, options)),
                    named: new Map([...node.arguments.named].map(
                        ([x, y]) => [x, cloneArgument(y, options)])),
                },
                content: node.content.map((x) => cloneNode(x, options)),
                expansion: node.expansion ? cloneNodes(node.expansion, options) : undefined
            } as T;
        case NodeType.Root:
            return {
                type: node.type,
                source: node.source,
                content: node.content.map((x) => cloneNode(x, options))
            } as T;
        case NodeType.Group:
            return {
                type: node.type,
                location: cloneLocation(node.location, options),
                content: node.content.map((x) => cloneNode(x, options))
            } as T;
        case NodeType.Paragraph:
            return {
                type: node.type,
                location: cloneLocation(node.location, options),
                content: node.content.map((x) => cloneNode(x, options))
            } as T;
        case NodeType.Preformatted:
            return {
                type: node.type,
                location: cloneLocation(node.location, options),
                content: { ...node.content }
            } as T;
        case NodeType.Text:
        case NodeType.Escaped:
            return {
                type: node.type,
                location: cloneLocation(node.location, options),
                content: node.content
            } as T;
        default:
            return debug.never(node);
    }
}

export function cloneNodes<T extends readonly DocumentNode[]>(
    nodes: T, options: CloneNodeOptions = {}
): T {
    return nodes.map((x) => cloneNode(x, options)) as unknown as T;
}
/** Warning: modifies the original nodes */

export function stripNode(...nodes: DocumentNode[]): DocumentNode[] {
    return nodes.flatMap((node) => {
        switch (node.type) {
            case NodeType.Preformatted:
            case NodeType.Text:
            case NodeType.Escaped:
                return [node];
            case NodeType.BlockModifier:
            case NodeType.InlineModifier:
                if (node.expansion !== undefined)
                    return node.expansion.flatMap((x) => stripNode(x));
            // else fallthrough!
            case NodeType.Root:
            case NodeType.Group:
            case NodeType.Paragraph:
                node.content = node.content.flatMap((x) => stripNode(x)) as any;
                return [node];
            case NodeType.SystemModifier:
                return [];
            default:
                return debug.never(node);
        }
    });
}
