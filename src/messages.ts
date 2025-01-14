import { Message, MessageSeverity, FixSuggestion } from "./interface";

export class ExpectedMessage implements Message {
    constructor(
        public readonly position: number,
        private what: string) {}
    readonly code = 0;
    readonly severity = MessageSeverity.Error;
    get length(): number { return this.what.length; }
    get info(): string { return `expected '${this.what}'` }
    get fixes(): readonly FixSuggestion[] {
        return [];
    }
}

export class UnknownModifierMessage implements Message {
    constructor(
        public readonly position: number, 
        public readonly length: number) {}
    readonly code = 0;
    readonly severity =  MessageSeverity.Error;
    readonly info = `unknown modifier; did you forget to escape it?`;
    get fixes(): readonly FixSuggestion[] {
        let [pos, len] = [this.position, this.length];
        return [{
            get info() { return 'this is not a modifier -- escape it'; },
            apply(src: string, cursor: number) {
                let newCursor = (cursor < pos) 
                    ? cursor 
                    : cursor + 1;
                return [src.substring(0, pos) + '\\' + src.substring(pos), newCursor];
            }
        }];
    }
}

class RemoveThingMessage implements Message {
    constructor(
        public readonly code: number,
        public readonly severity: MessageSeverity, 
        public readonly position: number, 
        public readonly length: number,
        public readonly info: string, private fixstr: string){}
    get fixes(): readonly FixSuggestion[] {
        let [pos, len, fixstr] = [this.position, this.length, this.fixstr];
        return [{
            get info() { return fixstr; },
            apply(src: string, cursor: number) {
                let newCursor = (cursor < pos + len && cursor >= pos) 
                    ? pos 
                    : cursor - len;
                return [src.substring(0, pos) + src.substring(pos + len), newCursor];
            }
        }];
    }
}

export class UnnecessaryNewlineMessage extends RemoveThingMessage {
    constructor(pos: number, len: number) {
        super(0, MessageSeverity.Warning, pos, len, 
            'more than one newlines have the same effect as one', 
            'remove the redundant newlines');
    }
}