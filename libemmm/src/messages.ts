import { Message, MessageSeverity, LocationRange } from "./interface";
import { assert } from "./util";

class AddThingMessage implements Message {
    constructor(
        public readonly code: number,
        public readonly severity: MessageSeverity, 
        public readonly location: LocationRange, 
        public readonly info: string){}
    // get fixes(): readonly FixSuggestion[] {
    //     let [start, what, fixstr] = [this.location.start, this.what, this.fixstr];
    //     return [{
    //         get info() { return fixstr; },
    //         apply(src: string, cursor: number) {
    //             let newCursor = (cursor < start) 
    //                 ? cursor 
    //                 : cursor + what.length;
    //             return [src.substring(0, start) + what + src.substring(start), newCursor];
    //         }
    //     }];
    // }
}

class RemoveThingMessage implements Message {
    constructor(
        public readonly code: number,
        public readonly severity: MessageSeverity, 
        public readonly location: LocationRange, 
        // private fixstr: string,
        public readonly info: string){}
    // get fixes(): readonly FixSuggestion[] {
    //     let [start, end, fixstr] = [this.start, this.end, this.fixstr];
    //     return [{
    //         get info() { return fixstr; },
    //         apply(src: string, cursor: number) {
    //             let newCursor = (cursor < end && cursor >= start) 
    //                 ? start 
    //                 : cursor; // Removing text, cursor shouldn't shift if it's outside the removed range
    //             return [src.substring(0, start) + src.substring(end), newCursor];
    //         }
    //     }];
    // }
}

export class ExpectedMessage implements Message {
    constructor(
        public readonly location: LocationRange, 
        private what: string)
    {
        assert(location.end == location.start);
    }
    readonly code = 1;
    readonly severity = MessageSeverity.Error;
    get info(): string { return `expected '${this.what}'` }
}

export class UnknownModifierMessage implements Message {
    constructor(
        public readonly location: LocationRange, 
        private what: string) {}
    readonly code = 2;
    readonly severity =  MessageSeverity.Error;
    get info() { return `unknown modifier '${this.what}'; did you forget to escape it?`; };
    // get fixes(): readonly FixSuggestion[] {
    //     let [start, end] = [this.start, this.end];
    //     return [{
    //         get info() { return 'this is not a modifier -- escape it'; },
    //         apply(src: string, cursor: number) {
    //             let newCursor = (cursor < start) 
    //                 ? cursor 
    //                 : cursor + 1;
    //             return [src.substring(0, start) + '\\' + src.substring(start), newCursor];
    //         }
    //     }];
    // }
}

export class UnclosedInlineModifierMessage implements Message {
    constructor(
        public readonly location: LocationRange, 
        private what: string)
    {
        assert(location.end == location.start);
    }
    readonly code = 3;
    readonly severity = MessageSeverity.Error;
    get info(): string { return `unclosed inline modifier ${this.what}'` }
}

export class ArgumentCountMismatchMessage implements Message {
    constructor(
        public readonly location: LocationRange, 
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
    get info(): string { return `argument count mismatch` + this.msg; }
}

export class CannotExpandArgumentMessage implements Message {
    constructor(
        public readonly location: LocationRange, 
        private what?: string) {}
    readonly code = 5;
    readonly severity = MessageSeverity.Error;
    get info(): string { return `failed to expand argument` + (this.what === undefined ? '' : `: ${this.what}`) }
}

export class InvalidArgumentMessage implements Message {
    constructor(
        public readonly location: LocationRange, 
        private what?: string) {}
    readonly code = 6;
    readonly severity = MessageSeverity.Error;
    get info(): string { return `invalid argument` + (this.what === undefined ? '' : `: ${this.what}`) }
}

export class EntityNotAllowedMessage implements Message {
    constructor(
        public readonly location: LocationRange,
        private what?: string) {}
    readonly code = 7;
    readonly severity = MessageSeverity.Error;
    get info(): string { return 'This entity is not allowed here' + 
        (this.what ? `: ${this.what}` : '') }
}

export class ReachedRecursionLimitMessage implements Message {
    constructor(
        public readonly location: LocationRange, 
        private limit: number,
        private what: string) {}
    readonly code = 8;
    readonly severity = MessageSeverity.Error;
    get info(): string { 
        return `Reached recursion limit ${this.limit} when expanding ${this.what}`
    };
}

export class SlotUsedOutsideDefinitionMessage implements Message {
    constructor(
        public readonly location: LocationRange) {}
    readonly code = 9;
    readonly severity = MessageSeverity.Error;
    get info(): string { return `slot used outside a definition` }
}

export class NoNestedModuleMessage implements Message {
    constructor(
        public readonly location: LocationRange) {}
    readonly code = 10;
    readonly severity = MessageSeverity.Error;
    get info(): string { return `nested module definitions not allowed` }
}

export class CannotUseModuleInSelfMessage implements Message {
    constructor(
        public readonly location: LocationRange) {}
    readonly code = 11;
    readonly severity = MessageSeverity.Error;
    get info(): string { return `cannot use the same module inside its definition` }
}

export class EitherNormalOrPreMessage implements Message {
    constructor(
        public readonly location: LocationRange) {}
    readonly code = 12;
    readonly severity = MessageSeverity.Error;
    get info(): string { return `a definition cannot be at once normal and preformatted` }
}

export class MultipleBlocksNotPermittedMessage implements Message {
    constructor(
        public readonly location: LocationRange) {}
    readonly code = 13;
    readonly severity = MessageSeverity.Error;
    get info(): string { return `multiple blocks are not permitted here` }
}

export class OnlySimpleParagraphsPermittedMessage implements Message {
    constructor(
        public readonly location: LocationRange) {}
    readonly code = 14;
    readonly severity = MessageSeverity.Error;
    get info(): string { return `Only simple paragraphs are permitted here` }
}


// warnings

export class UnnecessaryNewlineMessage extends RemoveThingMessage {
    constructor(location: LocationRange) {
        super(1, MessageSeverity.Warning, location, 
            'more than one newlines have the same effect as one');
    }
}

export class NewBlockShouldBeOnNewlineMessage extends AddThingMessage {
    constructor(location: LocationRange) {
        super(2, MessageSeverity.Warning, location, 
            'a new block should begin in a new line to avoid confusion');
    }
}

export class ContentShouldBeOnNewlineMessage extends AddThingMessage {
    constructor(location: LocationRange) {
        super(3, MessageSeverity.Warning, location, 
            'the content should begin in a new line to avoid confusion');
    }
}

export class NameAlreadyDefinedMessage implements Message {
    constructor(
        public readonly location: LocationRange,
        private what: string) {}
    readonly code = 4;
    readonly severity = MessageSeverity.Warning;
    get info(): string { return `name is already defined, will overwrite: ${this.what}` }
}

export class UndefinedVariableMessage implements Message {
    constructor(
        public readonly location: LocationRange,
        private what: string) {}
    readonly code = 5;
    readonly severity = MessageSeverity.Warning;
    get info(): string { return `variable is undefined, will expand to empty string: ${this.what}` }
}

export class OverwriteDefinitionsMessage implements Message {
    constructor(
        public readonly location: LocationRange,
        private what: string) {}
    readonly code = 6;
    readonly severity = MessageSeverity.Warning;
    get info(): string { return `using this module will overwrite: ${this.what}` }
}
