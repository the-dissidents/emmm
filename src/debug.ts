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
        if (typeof arg0 == 'function') arg0 = arg0();
        if (this.level <= DebugLevel.Trace) console.info('TRACE', arg0, ...args);
    },
    info(arg0: any, ...args: any) {
        if (typeof arg0 == 'function') arg0 = arg0();
        if (this.level <= DebugLevel.Info) console.info('INFO ', arg0, ...args);
    },
    warning(arg0: any, ...args: any) {
        if (typeof arg0 == 'function') arg0 = arg0();
        if (this.level <= DebugLevel.Warning) console.warn('WARN ', arg0, ...args);
    },
    error(arg0: any, ...args: any) {
        if (typeof arg0 == 'function') arg0 = arg0();
        if (this.level <= DebugLevel.Error) console.error('ERROR', arg0, ...args);
    },
    never(_: never) {
        assert(false);
    }
}