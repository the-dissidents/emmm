import { Message, MessageSeverity, FixSuggestion } from "./interface";

export class ReferredMessage implements Message {
    constructor(
        public readonly original: Message,
        public readonly start: number, 
        public readonly end: number) {}
    get severity() { return this.original.severity; }
    get info() { return this.original.info; }
    get code() { return this.original.code; }
    readonly fixes: readonly FixSuggestion[] = [];
}

class AddThingMessage implements Message {
    constructor(
        public readonly code: number,
        public readonly severity: MessageSeverity, 
        public readonly start: number, 
        public readonly end: number,
        public readonly info: string, 
        private fixstr: string, private what: string){}
    get fixes(): readonly FixSuggestion[] {
        let [start, what, fixstr] = [this.start, this.what, this.fixstr];
        return [{
            get info() { return fixstr; },
            apply(src: string, cursor: number) {
                let newCursor = (cursor < start) 
                    ? cursor 
                    : cursor + what.length;
                return [src.substring(0, start) + what + src.substring(start), newCursor];
            }
        }];
    }
}

class RemoveThingMessage implements Message {
    constructor(
        public readonly code: number,
        public readonly severity: MessageSeverity, 
        public readonly start: number, 
        public readonly end: number,
        public readonly info: string, private fixstr: string){}
    get fixes(): readonly FixSuggestion[] {
        let [start, end, fixstr] = [this.start, this.end, this.fixstr];
        return [{
            get info() { return fixstr; },
            apply(src: string, cursor: number) {
                let newCursor = (cursor < end && cursor >= start) 
                    ? start 
                    : cursor; // Removing text, cursor shouldn't shift if it's outside the removed range
                return [src.substring(0, start) + src.substring(end), newCursor];
            }
        }];
    }
}

export class ExpectedMessage implements Message {
    constructor(
        public readonly start: number,
        private what: string) {}
    readonly code = 1;
    readonly severity = MessageSeverity.Error;
    get end(): number { return this.start; }
    get info(): string { return `expected '${this.what}'` }
    get fixes(): readonly FixSuggestion[] {
        return [];
    }
}

export class UnknownModifierMessage implements Message {
    constructor(
        public readonly start: number, 
        public readonly end: number,
        private what: string) {}
    readonly code = 2;
    readonly severity =  MessageSeverity.Error;
    get info() { return `unknown modifier '${this.what}'; did you forget to escape it?`; };
    get fixes(): readonly FixSuggestion[] {
        let [start, end] = [this.start, this.end];
        return [{
            get info() { return 'this is not a modifier -- escape it'; },
            apply(src: string, cursor: number) {
                let newCursor = (cursor < start) 
                    ? cursor 
                    : cursor + 1;
                return [src.substring(0, start) + '\\' + src.substring(start), newCursor];
            }
        }];
    }
}

export class UnclosedInlineModifierMessage implements Message {
    constructor(
        public readonly start: number,
        private what: string) {}
    readonly code = 3;
    readonly severity = MessageSeverity.Error;
    get end(): number { return this.start; }
    readonly fixes: readonly FixSuggestion[] = []
    get info(): string { return `unclosed inline modifier ${this.what}'` }
}

export class ArgumentCountMismatchMessage implements Message {
    constructor(
        public readonly start: number,
        public readonly end: number,
        min?: number, max?: number)
    {
        if (min !== undefined) {
            if (max == min) this.msg = `: ${min} expected`;
            else if (max !== undefined) this.msg = `: ${min} to ${max} expected`;
            else this.msg = `: at least ${min} expected`;
        } else {
            if (max !== undefined) this.msg = `: at most ${max} expected`;
        }
    }
    private msg = '';
    readonly code = 4;
    readonly severity = MessageSeverity.Error;
    readonly fixes: readonly FixSuggestion[] = []
    get info(): string { return `argument count mismatch` + this.msg; }
}

export class CannotExpandArgumentMessage implements Message {
    constructor(
        public readonly start: number,
        public readonly end: number,
        private what?: string) {}
    readonly code = 5;
    readonly severity = MessageSeverity.Error;
    readonly fixes: readonly FixSuggestion[] = []
    get info(): string { return `failed to expand argument` + (this.what === undefined ? '' : `: ${this.what}`) }
}

export class InvalidArgumentMessage implements Message {
    constructor(
        public readonly start: number,
        public readonly end: number,
        private what?: string) {}
    readonly code = 6;
    readonly severity = MessageSeverity.Error;
    readonly fixes: readonly FixSuggestion[] = []
    get info(): string { return `invalid argument` + (this.what === undefined ? '' : `: ${this.what}`) }
}

export class InlineDefinitonInvalidEntityMessage implements Message {
    constructor(
        public readonly start: number,
        public readonly end: number) {}
    readonly code = 7;
    readonly severity = MessageSeverity.Error;
    readonly fixes: readonly FixSuggestion[] = []
    get info(): string { return `Invalid entity in inline modifier definition` }
}

export class ReachedRecursionLimitMessage implements Message {
    constructor(
        public readonly start: number,
        public readonly end: number,
        private limit: number,
        private what: string) {}
    readonly code = 8;
    readonly severity = MessageSeverity.Error;
    readonly fixes: readonly FixSuggestion[] = []
    get info(): string { 
        return `Reached recursion limit ${this.limit} when expanding ${this.what}`
    };
}

export class SlotUsedOutsideDefinitionMessage implements Message {
    constructor(
        public readonly start: number,
        public readonly end: number) {}
    readonly code = 9;
    readonly severity = MessageSeverity.Error;
    readonly fixes: readonly FixSuggestion[] = []
    get info(): string { return `slot used outside a definition` }
}

export class CannotPopNotationMessage implements Message {
    constructor(
        public readonly start: number,
        public readonly end: number) {}
    readonly code = 10;
    readonly severity = MessageSeverity.Error;
    readonly fixes: readonly FixSuggestion[] = []
    get info(): string { return `cannot pop notation` }
}

// warnings

export class UnnecessaryNewlineMessage extends RemoveThingMessage {
    constructor(start: number, end: number) {
        super(1, MessageSeverity.Warning, start, end, 
            'more than one newlines have the same effect as one', 
            'remove the redundant newlines');
    }
}

export class NewBlockShouldBeOnNewlineMessage extends AddThingMessage {
    constructor(pos: number) {
        super(2, MessageSeverity.Warning, pos, pos,
            'a new block should begin in a new line to avoid confusion', 
            'add a line break', '\n');
    }
}

export class ContentShouldBeOnNewlineMessage extends AddThingMessage {
    constructor(pos: number) {
        super(3, MessageSeverity.Warning, pos, pos,
            'the content should begin in a new line to avoid confusion', 
            'add a line break', '\n');
    }
}

export class NameAlreadyDefinedMessage implements Message {
    constructor(
        public readonly start: number,
        public readonly end: number,
        private what: string) {}
    readonly code = 4;
    readonly severity = MessageSeverity.Warning;
    readonly fixes: readonly FixSuggestion[] = []
    get info(): string { return `name is already defined, will overwrite: ${this.what}` }
}

export class UndefinedVariableMessage implements Message {
    constructor(
        public readonly start: number,
        public readonly end: number,
        private what: string) {}
    readonly code = 5;
    readonly severity = MessageSeverity.Warning;
    readonly fixes: readonly FixSuggestion[] = []
    get info(): string { return `variable is undefined, will expand to empty string: ${this.what}` }
}
