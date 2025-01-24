import { debug, DebugLevel } from './debug';

export * from './interface';
export * from './front';
export * from './parser';
export * as messages from './messages';
export * from './builtin/builtin';
export { DebugLevel } from './debug';

export function setDebugLevel(level: DebugLevel) {
    debug.level = level;
}