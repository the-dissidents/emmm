export enum DebugLevel {
    Trace,
    Info,
    Warning,
    Error,
    None
}

export const debug = {
    level: DebugLevel.Info,
    trace(...args: any) {
        if (this.level <= DebugLevel.Trace) console.info('TRACE', ...args);
    },
    info(...args: any) {
        if (this.level <= DebugLevel.Info) console.info('INFO', ...args);
    },
    warning(...args: any) {
        if (this.level <= DebugLevel.Warning) console.warn('WARNING', ...args);
    },
    error(...args: any) {
        if (this.level <= DebugLevel.Error) console.error('ERROR', ...args);
    }
}