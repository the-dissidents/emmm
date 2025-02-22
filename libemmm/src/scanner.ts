import { SourceDescriptor } from "./interface";
import { assert } from "./util";

export class SimpleScanner implements Scanner {
    private pos = 0;
    constructor(
        private src: string,
        public readonly source: SourceDescriptor = {name: '<input>'}) {}

    position(): number {
        return this.pos;
    }

    isEOF(): boolean {
        return this.pos >= this.src.length;
    }

    peek(str: string): boolean {
        assert(str !== '');
        let next = this.pos + str.length;
        if (next > this.src.length) return false;
        return this.src.slice(this.pos, this.pos + str.length) == str;
    }

    acceptChar(): string {
        if (this.isEOF()) throw new RangeError('EOF');
        let char = this.src[this.pos];
        this.pos++;
        return char;
    }

    accept(str: string): boolean {
        if (!this.peek(str)) return false;
        this.pos += str.length;
        return true;
    }

    acceptWhitespaceChar(): string | null {
        if (this.isEOF()) return null;
        let char = this.src[this.pos];
        if (!' \t'.includes(char)) return null;
        this.pos++;
        return char;
    }
}

// The scanner of any implementation should be capable of handling UTF-8 
// strings at least as well as Typescript.
export interface Scanner {
    readonly source: SourceDescriptor;

    position(): number;
    isEOF(): boolean;

    // return true if sees str immediately
    peek(str: string): boolean;

    // if sees str immediately, consumes it and returns true
    accept(str: string): boolean;

    // consumes a character and returns it; throws at EOF
    acceptChar(): string;

    // newlines are NOT whitespaces
    acceptWhitespaceChar(): string | null;
}
