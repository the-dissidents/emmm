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
        const result: Inspector[] = [];
        while (this.#inspectors.length > 0 && this.#inspectors[0].position <= this.#pos)
            result.push(this.#inspectors.shift()!);
        return result;
    }

    private matchLength(str: string): number {
        if (!str.includes('\n')) {
            return this.src.startsWith(str, this.#pos) ? str.length : -1;
        }
        let sPos = this.#pos;
        for (let i = 0; i < str.length; i++) {
            if (sPos >= this.src.length) return -1;
            const target = str[i];
            if (target === '\n') {
                if (this.src[sPos] === '\r' && this.src[sPos + 1] === '\n') {
                    sPos += 2;
                } else if (this.src[sPos] === '\n') {
                    sPos += 1;
                } else {
                    return -1;
                }
            } else {
                if (this.src[sPos] !== target) return -1;
                sPos += 1;
            }
        }
        return sPos - this.#pos;
    }

    peek(str: string): boolean {
        assert(str !== '');
        return this.matchLength(str) !== -1;
    }

    acceptChar(): string {
        if (this.isEOF()) throw new RangeError('EOF');
        const char = this.src[this.#pos];
        if (char === '\r' && this.src[this.#pos + 1] === '\n') {
            this.#pos += 2;
            return '\n';
        }
        this.#pos++;
        return char;
    }

    accept(str: string): boolean {
        const len = this.matchLength(str);
        if (len === -1) return false;
        this.#pos += len;
        return true;
    }

    acceptWhitespaceChar(): string | null {
        if (this.isEOF()) return null;
        const char = this.src[this.#pos];
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

    /** Sources can have inspectors in them, which are positions that trigger a callback when encountered. This function returns the inspectors that lie between the current position and where this function was previously called (or the beginning for the first call). */
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
