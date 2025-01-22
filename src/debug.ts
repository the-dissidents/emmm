import { assert } from "./util";

export enum DebugLevel {
    Trace,
    Info,
    Warning,
    Error,
    None
}

export const debug = {
    level: DebugLevel.Info,
    trace(arg0: any, ...args: any) {
        if (this.level > DebugLevel.Trace) return;
        if (typeof arg0 == 'function') arg0 = arg0();
        console.info('TRACE', arg0, ...args);
    },
    info(arg0: any, ...args: any) {
        if (this.level > DebugLevel.Info) return;
        if (typeof arg0 == 'function') arg0 = arg0();
        console.info(' INFO', arg0, ...args);
    },
    warning(arg0: any, ...args: any) {
        if (this.level > DebugLevel.Warning) return;
        if (typeof arg0 == 'function') arg0 = arg0();
        console.warn(' WARN', arg0, ...args);
    },
    error(arg0: any, ...args: any) {
        if (this.level > DebugLevel.Error) return;
        if (typeof arg0 == 'function') arg0 = arg0();
        console.error('ERROR', arg0, ...args);
    },
    never(_: never) {
        assert(false);
    }
}