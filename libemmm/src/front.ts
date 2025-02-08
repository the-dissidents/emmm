import { Scanner } from "./interface";
import { assert } from "./util";

export class SimpleScanner implements Scanner {
    private pos = 0;
    constructor(private src: string) {}

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