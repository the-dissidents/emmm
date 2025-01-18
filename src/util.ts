import { Node, PositionRange } from "./interface";

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

export function linePositions(src: string): number[] {
    let result = [0];
    [...src].forEach((x, i) => {
        if (x == '\n') result.push(i+1);
    });
    result.push(Infinity);
    return result;
}

export function cloneNode(node: Node, referring?: PositionRange): Node {
    switch (node.type) {
        case "block":
        case "inline":
            return {
                type: node.type as any,
                start: node.start,
                end: node.end,
                mod: node.mod,
                head: structuredClone(node.head),
                arguments: structuredClone(node.arguments),
                content: node.content.map((x) => cloneNode(x, referring) as any),
                state: undefined,
                expansion: undefined
            };
        case "root":
        case "paragraph":
            return {
                type: node.type as any,
                start: node.start,
                end: node.end,
                content: node.content.map((x) => cloneNode(x) as any)
            }
        case "pre":
        case "text":
        case "escaped":
            return structuredClone(node);
        default:
            assert(false);
    }
}

export function cloneNodes(nodes: Node[]): Node[] {
    return nodes.map((x) => cloneNode(x));
}