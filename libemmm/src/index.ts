import { debug, DebugLevel } from './debug';

export * from './source';
export * from './interface';
export * from './scanner';
export * from './parser';
export * from './parser-config';
export * from './renderer';
export * as messages from './messages';
export * from './builtin/builtin';
export * from './default/default';
export * from './default/html-renderer';
export { DebugLevel } from './debug';
export { debugPrint } from './debug-print';

export const emmmVersion = '0.0.6';

export function setDebugLevel(level: DebugLevel) {
    debug.level = level;
}