export function assert(x: boolean): asserts x {
    if (!!!x) {
        let error = new Error('assertion failed');
        console.log(error.stack);
        throw error;
    }
}

export const Debug: {
    assert(cond: boolean, what?: string): asserts cond,
    early(reason?: string): void,
    never(value?: never): never
} = {
    assert(x: boolean, what?: string): asserts x {
        if (!!!x) {
            let error = new Error('assertion failed' + (what ? `: ${what}` : ''));
            console.log(error.stack);
            throw error;
        }
    },
    early(reason?: string) {
        let error = new Error(`Function returned early` + (reason ? `: ${reason}` : ''));
        console.log(error.stack);
        throw error;
    },
    never(x?: never): never {
        let error = new Error(`Unreachable code reached (never=${x})`);
        console.log(error.stack);
        throw error;
    }
};
