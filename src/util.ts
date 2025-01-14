
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