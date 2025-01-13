import { EmitEnvironment, FixSuggestion, Message, MessageSeverity, Scanner } from "./interface";
import { ExpectedMessage, RemoveThingMessage, UnknownModifierMessage } from "./messages";
import { assert } from "./util";

const MODIFIER_BLOCK_OPEN = '[.';
const MODIFIER_BLOCK_CLOSE = ']';
const MODIFIER_INLINE_OPEN = '[/';
const MODIFIER_INLINE_CLOSE = ']';
const MODIFIER_INLINE_POP = '[/]';
const GROUP_BEGIN = ':--';
const GROUP_END = '--:';

export class Parser {
    private emit: EmitEnvironment;
    private groupDepth = 0;

    constructor(private scanner: Scanner) {
        this.emit = new EmitEnvironment(scanner);
    }

    parse() {
        this.DOCUMENT();
        return this.emit.tree;
    }

    private WHITESPACES_OR_NEWLINES() {
        while (this.scanner.acceptWhitespaceChar() !== null
            || this.scanner.accept('\n')) {};
    }

    private WARN_IF_MORE_NEWLINES() {
        let warn = false;
        const start = this.scanner.position();
        while (true) {
            if (this.scanner.accept('\n')) {
                warn = true;
                continue;
            }
            if (this.scanner.acceptWhitespaceChar() == null) break;
        }
        const end = this.scanner.position();
        if (warn) this.emit.message(new RemoveThingMessage(
            MessageSeverity.Warning, start, end - start, 
            'more than one newlines have the same effect as one', 
            'remove the redundant newlines'));
    }

    private DOCUMENT() {
        while (!this.scanner.isEOF()) {
            this.BLOCK();
            this.WHITESPACES_OR_NEWLINES();
        }
    }

    // private called = 0;

    private BLOCK() {
        assert(!this.scanner.isEOF());
        // this.called += 1;
        // if (this.called > 100) {
        //     console.log(this.emit.tree.debugDump());
        //     throw new Error();
        // }
        // block tag
        this.WHITESPACES_OR_NEWLINES();
        if (this.scanner.peek(MODIFIER_BLOCK_OPEN)) {
            this.MODIFIER_BLOCK();
            return;
        }
        // simple paragraph
        this.MAYBE_GROUPED_PARAGRAPH();
    }

    private MODIFIER_BLOCK() {
        const a = this.scanner.accept(MODIFIER_BLOCK_OPEN);
        assert(a);

        if (this.scanner.accept('eq')) {
            if (!this.scanner.accept(MODIFIER_BLOCK_CLOSE))
                this.emit.message(new ExpectedMessage(
                    this.scanner.position(), MODIFIER_BLOCK_CLOSE));
            this.WHITESPACES_OR_NEWLINES();
            this.emit.startNode('eq');
            this.PRE_PARAGRAPH();
            this.emit.endNode('eq');
            return;
        }
        if (this.scanner.accept('quote')) {
            if (!this.scanner.accept(MODIFIER_BLOCK_CLOSE))
                this.emit.message(new ExpectedMessage(
                    this.scanner.position(), MODIFIER_BLOCK_CLOSE));
            this.WHITESPACES_OR_NEWLINES();
            this.emit.startNode('quote');
            this.BLOCK();
            this.emit.endNode('quote');
            return;
        }

        // unknown modifier
        const startPos = this.scanner.position();
        const args = this.scanner.acceptUntil(MODIFIER_BLOCK_CLOSE);
        if (args === null) {
            this.emit.message(new ExpectedMessage(
                this.scanner.position(), MODIFIER_BLOCK_CLOSE));
        }
        this.emit.message(
            new UnknownModifierMessage(startPos, this.scanner.position()));
        // fall back
        this.PARAGRAPH();
    }

    // also handles "grouped" (delimited) pre-paragraphs
    private PRE_PARAGRAPH() {
        assert(!this.scanner.isEOF());
        const grouped = this.scanner.accept(GROUP_BEGIN);
        if (grouped) this.WHITESPACES_OR_NEWLINES();

        this.emit.startNode('pre');
        while (!this.scanner.isEOF()) {
            if (this.scanner.accept('\n')) {
                let white = "\n";
                let char: string | null = "";
                while ((char = this.scanner.acceptWhitespaceChar()) !== null)
                    white += char;
                    
                if  ((grouped && this.scanner.accept(GROUP_END)) 
                 || (!grouped && this.scanner.accept('\n'))) break;

                if (this.scanner.isEOF()) {
                    if (grouped) this.emit.message(new ExpectedMessage(
                        this.scanner.position(), GROUP_END));
                    break;
                }
                this.emit.addString(white);
            } else {
                this.emit.addString(this.scanner.acceptChar());
            }
        }
        this.emit.endNode('pre');
    }

    private MAYBE_GROUPED_PARAGRAPH() {
        assert(!this.scanner.isEOF());
        if (this.scanner.accept(GROUP_BEGIN)) {
            this.groupDepth++;
            while (!this.scanner.isEOF()) {
                if (this.scanner.accept(GROUP_END)) {
                    this.groupDepth--;
                    return;
                }
                this.BLOCK();
                this.WHITESPACES_OR_NEWLINES();
            }
            // EOF
            this.emit.message(new ExpectedMessage(
                this.scanner.position(), GROUP_END))
        } else {
            this.PARAGRAPH();
        }
    }

    private PARAGRAPH() {
        assert(!this.scanner.isEOF());
        // this.WHITESPACES_OR_NEWLINES();
        this.emit.startNode('paragraph');
        while (!this.scanner.isEOF()) {
            if (this.scanner.accept('\n')) {
                while (this.scanner.acceptWhitespaceChar() !== null) {}
                if  (this.scanner.peek(MODIFIER_BLOCK_OPEN)
                 || (this.scanner.peek(GROUP_END) && this.groupDepth > 0)
                 ||  this.scanner.isEOF()) break;

                if (this.scanner.accept('\n')) {
                    this.WARN_IF_MORE_NEWLINES();
                    break;
                }
                this.emit.addString('\n');
            } else {
                this.INLINE_ENTITY();
            }
        }
        this.emit.endNode('paragraph');
    }

    private INLINE_ENTITY() {
        // if (this.scanner.peek(MODIFIER_INLINE_OPEN)) {
        //     // inline tag
        //     throw new Error('not implemented');
        // }
        // TODO: don't know if this is enough
        if (this.scanner.accept('\\')) {
            if (this.scanner.isEOF()) {
                this.emit.addString('\\');
                return;
            }
            let node = this.emit.newNode('escaped');
            node.content = [this.scanner.acceptChar()];
            node.end = node.start + 1;
            return;
        }
        // simple character
        this.emit.addString(this.scanner.acceptChar());
    }
}