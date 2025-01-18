import { Message, MessageSeverity, FixSuggestion } from "./interface";


class AddThingMessage implements Message {
    constructor(
        public readonly code: number,
        public readonly severity: MessageSeverity, 
        public readonly position: number, 
        public readonly length: number,
        public readonly info: string, 
        private fixstr: string, private what: string){}
    get fixes(): readonly FixSuggestion[] {
        let [pos, what, fixstr] = [this.position, this.what, this.fixstr];
        return [{
            get info() { return fixstr; },
            apply(src: string, cursor: number) {
                let newCursor = (cursor < pos) 
                    ? cursor 
                    : cursor + what.length;
                return [src.substring(0, pos) + what + src.substring(pos), newCursor];
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

export class ExpectedMessage implements Message {
    constructor(
        public readonly position: number,
        private what: string) {}
    readonly code = 1;
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
    readonly code = 2;
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

export class UnclosedInlineModifierMessage implements Message {
    constructor(
        public readonly position: number,
        private what: string) {}
    readonly code = 3;
    readonly severity = MessageSeverity.Error;
    readonly length = 0;
    readonly fixes: readonly FixSuggestion[] = []
    get info(): string { return `unclosed inline modifier ${this.what}'` }
}

export class ArgumentsTooFewMessage implements Message {
    constructor(
        public readonly position: number,
        public readonly length: number,
        private expected?: number) {}
    readonly code = 4;
    readonly severity = MessageSeverity.Error;
    readonly fixes: readonly FixSuggestion[] = []
    get info(): string { return `too few argument(s)` 
        + (this.expected === undefined ? '' : `, ${this.expected} expected`) }
}

export class ArgumentsTooManyMessage extends RemoveThingMessage {
    constructor(pos: number, len: number, expected?: number) {
        super(5, MessageSeverity.Warning, pos, len, 
            'too many arguments' + (expected === undefined ? '' : `, ${expected} expected`), 
            'remove them');
    }
}

export class InvalidArgumentMessage implements Message {
    constructor(
        public readonly position: number,
        public readonly length: number) {}
    readonly code = 6;
    readonly severity = MessageSeverity.Error;
    readonly fixes: readonly FixSuggestion[] = []
    get info(): string { return `invalid argument` }
}

export class InlineDefinitonMustContainOneParaMessage implements Message {
    constructor(
        public readonly position: number,
        public readonly length: number) {}
    readonly code = 7;
    readonly severity = MessageSeverity.Error;
    readonly fixes: readonly FixSuggestion[] = []
    get info(): string { return `inline modifier definition must contain exactly one paragraph` }
}


// warnings

export class UnnecessaryNewlineMessage extends RemoveThingMessage {
    constructor(pos: number, len: number) {
        super(1, MessageSeverity.Warning, pos, len, 
            'more than one newlines have the same effect as one', 
            'remove the redundant newlines');
    }
}

export class NewBlockShouldBeOnNewlineMessage extends AddThingMessage {
    constructor(pos: number) {
        super(2, MessageSeverity.Warning, pos, 0, 
            'a new block should begin in a new line to avoid confusion', 
            'add a line break', '\n');
    }
}

export class ContentShouldBeOnNewlineMessage extends AddThingMessage {
    constructor(pos: number) {
        super(3, MessageSeverity.Warning, pos, 0, 
            'the content should begin in a new line to avoid confusion', 
            'add a line break', '\n');
    }
}

export class NameAlreadyDefinedMessage implements Message {
    constructor(
        public readonly position: number,
        public readonly length: number,
        private what: string) {}
    readonly code = 4;
    readonly severity = MessageSeverity.Warning;
    readonly fixes: readonly FixSuggestion[] = []
    get info(): string { return `name is already defined, will overwrite: ${this.what}` }
}

export class UndefinedVariableMessage implements Message {
    constructor(
        public readonly position: number,
        public readonly length: number,
        private what: string) {}
    readonly code = 5;
    readonly severity = MessageSeverity.Warning;
    readonly fixes: readonly FixSuggestion[] = []
    get info(): string { return `variable is undefined, will expand to empty string: ${this.what}` }
}