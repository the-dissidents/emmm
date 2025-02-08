import { debug, DebugLevel } from './debug';

export * from './interface';
export * from './front';
export * from './parser';
export * as messages from './messages';
export * from './builtin/builtin';
export * from './default/default';
export { DebugLevel } from './debug';
export { debugPrint } from './debug-print';

export function setDebugLevel(level: DebugLevel) {
    debug.level = level;
}