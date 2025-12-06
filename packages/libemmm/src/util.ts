
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
