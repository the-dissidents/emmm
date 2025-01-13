import { Message, MessageSeverity, FixSuggestion } from "./interface";

export class UnknownModifierMessage implements Message {
    constructor(private pos: number, private len: number) {}
    severity() { return MessageSeverity.Error; }
    position() { return this.pos; }
    length() { return this.len; }
    info() { return `unknown modifier; did you forget to escape it?` }
    fixes(): readonly FixSuggestion[] {
        let [pos, len] = [this.pos, this.len];
        return [{
            info() { return 'this is not a modifier -- escape it'; },
            apply(src: string, cursor: number) {
                let newCursor = (cursor < pos) 
                    ? cursor 
                    : cursor + 1;
                return [src.substring(0, pos) + '\\' + src.substring(pos), newCursor];
            }
        }];
    }
}

export class RemoveThingMessage implements Message {
    constructor(private level: MessageSeverity, private pos: number, private len: number, 
        private infostr: string, private fixstr: string) {}
    severity(): MessageSeverity { return this.level; }
    position(): number { return this.pos; }
    length() { return this.len; }
    info(): string { return this.infostr; }
    fixes(): readonly FixSuggestion[] {
        let [pos, len, fixstr] = [this.pos, this.len, this.fixstr];
        return [{
            info() { return fixstr; },
            apply(src: string, cursor: number) {
                let newCursor = (cursor < pos + len && cursor >= pos) 
                    ? pos 
                    : cursor - len;
                return [src.substring(0, pos) + src.substring(pos + len), newCursor];
            }
        }];
    }
}

export class ExpectedMessage implements Message {
    constructor(private pos: number, private what: string) {}
    severity(): MessageSeverity { return MessageSeverity.Error; }
    position(): number { return this.pos; }
    length() { return 0; }
    info(): string { return `expected '${this.what}'` }
    fixes(): readonly FixSuggestion[] {
        return [];
    }
}