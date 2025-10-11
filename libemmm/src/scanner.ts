import { ParseContext } from "./parser-config";
import { Source, SourceDescriptor, StringSource } from "./source";
import { assert } from "./util";

export type Inspector = {
    position: number,
    callback: (cxt: ParseContext, pos: number) => void
};

export class SimpleScanner implements Scanner {
    public readonly source: Source;
    #pos = 0;
    #inspectors: Inspector[];

    constructor(
        private src: string,
        sourceDesc: SourceDescriptor = {name: '<input>'},
        inspectors: Inspector[] = []
    ) {
        this.source = new StringSource(sourceDesc, src);
        this.#inspectors = inspectors.toSorted((a, b) => a.position - b.position);
    }

    position(): number {
        return this.#pos;
    }

    isEOF(): boolean {
        return this.#pos >= this.src.length;
    }

    inspectors(): Inspector[] {
        let result: Inspector[] = [];
        while (this.#inspectors.length > 0 && this.#inspectors[0].position <= this.#pos)
            result.push(this.#inspectors.shift()!);
        return result;
    }

    peek(str: string): boolean {
        assert(str !== '');
        let next = this.#pos + str.length;
        if (next > this.src.length) return false;
        return this.src.slice(this.#pos, this.#pos + str.length) == str;
    }

    acceptChar(): string {
        if (this.isEOF()) throw new RangeError('EOF');
        let char = this.src[this.#pos];
        this.#pos++;
        return char;
    }

    accept(str: string): boolean {
        if (!this.peek(str)) return false;
        this.#pos += str.length;
        return true;
    }

    acceptWhitespaceChar(): string | null {
        if (this.isEOF()) return null;
        let char = this.src[this.#pos];
        if (!' \t'.includes(char)) return null;
        this.#pos++;
        return char;
    }
}

// The scanner of any implementation should be capable of handling UTF-8 
// strings at least as well as Typescript.
export interface Scanner {
    readonly source: Source;

    position(): number;
    isEOF(): boolean;

    /** Sources can have inspectors in them, which are positions that trigger a callback when encounterede. This function returns the inspectors that lie between the current position and where this function was previously called (or the beginning for the first call). */
    inspectors(): Inspector[];

    /** return true if sees str immediately */
    peek(str: string): boolean;

    /** if sees str immediately, consumes it and returns true */
    accept(str: string): boolean;

    /** consumes a character and returns it; throws at EOF */
    acceptChar(): string;

    /** newlines are NOT whitespaces */
    acceptWhitespaceChar(): string | null;
}
