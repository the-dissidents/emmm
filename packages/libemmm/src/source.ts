import { assert } from "./util";

export type SourceDescriptor = {
    readonly name: string
};

export interface Source extends SourceDescriptor {
    readonly nLines: number;
    /**
     * Return the row- and column-index corresponding to a given location. The indices are zero-based.
     */
    getRowCol(loc: number): [row: number, col: number];
    /**
     * Returns the position of the start of row `n` (zero-based). If `n` is zero, returns zero. If the source contains less than `n` rows, returns `Infinity`.
     */
    getRowStart(n: number): number;
    /**
     * Returns the content of the row `n` (zero-based). If the source contains less than `n` rows, returns `undefined`.
     */
    getRow(n: number): string | undefined;
}

export class StringSource implements Source {
    readonly name: string;
    readonly nLines: number;
    private readonly lineMap: number[];

    constructor(d: SourceDescriptor, private readonly src: string) {
        this.name = d.name;
        this.lineMap = [0];
        [...src].forEach((x, i) => {
            if (x == '\n') this.lineMap.push(i+1);
        });
        this.nLines = this.lineMap.length;
        this.lineMap.push(Infinity);
    }

    getRowCol(pos: number): [row: number, col: number] {
        let line = -1, linepos = 0;
        for (let i = 1; i < this.lineMap.length; i++) {
            if (this.lineMap[i] > pos) {
                line = i - 1;
                linepos = this.lineMap[i - 1];
                break;
            }
        }
        return [line, pos - linepos];
    }

    getRowStart(n: number): number {
        assert(n >= 0);
        if (n >= this.lineMap.length) return Infinity;
        return this.lineMap[n];
    }

    getRow(n: number): string | undefined {
        const start = this.getRowStart(n);
        const end = this.getRowStart(n + 1);
        if (start === Infinity) return undefined;
        return this.src.substring(start, end - 1);
    }    
}