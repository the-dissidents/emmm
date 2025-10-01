import { debug } from "./debug";
import { DocumentNode, LocationRange, ModifierArgument, NodeType, RootNode } from "./interface";

// TODO: use a prefix tree to find names?
export class NameManager<T extends {name: string}> {
    private array: {k: string, v: T}[] = [];
    private data = new Map<string, T>();
    
    constructor(from?: ReadonlyNameManager<T> | readonly T[] | ReadonlySet<T>) {
        if (from === undefined) return;
        if (from instanceof NameManager) {
            this.array = [...from.array];
            this.data = new Map(from.data);
        } else {
            const array = [...from as (readonly T[] | ReadonlySet<T>)];
            assert((from instanceof Set ? from : new Set(array)).size == array.length);
            this.array = array.map((x) => ({k: x.name, v: x}));
            this.array.sort((a, b) => b.k.length - a.k.length);
            this.data = new Map(array.map((x) => [x.name, x]));
        }
    }

    toArray(): T[] {
        return this.array.map(({v}) => v);
    }

    toSet(): Set<T> {
        return new Set(this.toArray());
    }

    get(name: string) {
        return this.data.get(name);
    }

    has(name: string) {
        return this.data.has(name);
    }

    remove(name: string) {
        let i = this.data.get(name);
        assert(i !== undefined);
        this.data.delete(name);
        this.array.splice(this.array.findIndex((x) => x.k == name), 1);
    }

    add(...elems: T[]) {
        for (const elem of elems) {
            assert(!this.has(elem.name));
            this.data.set(elem.name, elem);
            const len = elem.name.length;
            let i = 0;
            while (i < this.array.length && this.array[i].k.length > len) i++;
            this.array.splice(i, 0, {k: elem.name, v: elem});
        }
    }

    find(predicate: (x: T) => boolean): T | undefined {
        const result = this.array.find((x) => predicate(x.v));
        return result ? result.v : undefined;
    }
}

export type ReadonlyNameManager<T extends {name: string}> = Omit<NameManager<T>, 'add' | 'remove'>;

export function assert(x: boolean): asserts x {
    if (!!!x) {
        let error = new Error('assertion failed');
        console.log(error.stack);
        throw error; 
    }
}

export function has(v: number, f: number): boolean {
    return (v & f) === f;
}

export type CloneNodeOptions = {
    newLocation?: LocationRange,
    withState?: boolean
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

export function cloneNode<T extends DocumentNode>(node: T, options: CloneNodeOptions = {}): T 
{
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
                arguments: node.arguments.map((x) => cloneArgument(x, options)),
                content: node.content.map((x) => cloneNode(x, options)),
                expansion: node.expansion ? cloneNodes(node.expansion, options) : undefined
            } as T;
        case NodeType.Root:
            return {
                type: node.type,
                source: node.source,
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
                content: {...node.content}
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

export function cloneNodes(
    nodes: readonly DocumentNode[], options: CloneNodeOptions = {}
): DocumentNode[] {
    return nodes.map((x) => cloneNode(x, options));
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
            case NodeType.Paragraph:
            case NodeType.Root:
                node.content = node.content.flatMap((x) => stripNode(x)) as any;
                return [node];
            case NodeType.SystemModifier:
                return [];
            default:
                return debug.never(node);
        }
    });
}
