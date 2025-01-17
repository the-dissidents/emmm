import { BlockModifier, BlockModifierNode, Configuration, EmitEnvironment, EscapedNode, FixSuggestion, InlineModifier, InlineModifierNode, Message, MessageSeverity, ModifierFlags, ParagraphNode, PreNode, Scanner } from "./interface";
import { ContentShouldBeOnNewlineMessage, ExpectedMessage, NewBlockShouldBeOnNewlineMessage, UnclosedInlineModifierMessage, UnknownModifierMessage, UnnecessaryNewlineMessage } from "./messages";
import { assert, has } from "./util";

const GROUP_BEGIN = ':--';
const GROUP_END = '--:';

const MODIFIER_BLOCK_OPEN = '[.';
const MODIFIER_BLOCK_CLOSE = ']';
const MODIFIER_END_SIGN = ';';

const MODIFIER_INLINE_OPEN = '[/';
const MODIFIER_INLINE_CLOSE = ']';
const MODIFIER_INLINE_END_TAG = '[;]';

const UnknownBlock = new BlockModifier('UNKNOWN', ModifierFlags.Normal);
const UnknownInline = new InlineModifier('UNKNOWN', ModifierFlags.Normal);

export class Parser {
    private emit: EmitEnvironment;
    private groupDepth = 0;
    private blockTags: [string, BlockModifier][] = [];
    private inlineTags: [string, InlineModifier][] = [];

    constructor(private scanner: Scanner, private config: Configuration) {
        this.emit = new EmitEnvironment(scanner);
        this.blockTags = [...config.blockModifiers.entries()]
            .sort(([x, _], [y, __]) => y.length - x.length);
        this.inlineTags = [...config.inlineModifiers.entries()]
            .sort(([x, _], [y, __]) => y.length - x.length);
    }

    parse() {
        this.DOCUMENT();
        return this.emit.tree;
    }

    private WHITESPACES_OR_NEWLINES() {
        while (this.scanner.acceptWhitespaceChar() !== null
            || this.scanner.accept('\n')) {}
    }

    private SHOULD_BE_A_NEWLINE() {
        while (this.scanner.acceptWhitespaceChar() !== null) { }
        if (!this.scanner.accept('\n')) this.emit.message(
            new ContentShouldBeOnNewlineMessage(this.scanner.position()));
    }

    // TODO: this is awkward and doesn't emit messages in the most appropriate way
    private WARN_IF_MORE_NEWLINES_THAN(n: number) {
        let nlines = 0;
        const start = this.scanner.position();
        while (true) {
            if (this.scanner.accept('\n')) {
                nlines++;
                continue;
            }
            if (this.scanner.acceptWhitespaceChar() == null) break;
        }
        const end = this.scanner.position();
        if (nlines > n) this.emit.message(
            new UnnecessaryNewlineMessage(start, end - start));
    }

    private DOCUMENT() {
        this.WHITESPACES_OR_NEWLINES();
        while (!this.scanner.isEOF()) {
            this.BLOCK();
            this.WHITESPACES_OR_NEWLINES();
        }
    }

    private BLOCK() {
        assert(!this.scanner.isEOF());
        if (this.scanner.peek(MODIFIER_BLOCK_OPEN)) {
            this.MODIFIER_BLOCK();
            return;
        }
        // simple paragraph(s)
        this.MAYBE_GROUPED_PARAGRAPH();
    }

    private MODIFIER_BLOCK() {
        const posStart = this.scanner.position();
        assert(this.scanner.accept(MODIFIER_BLOCK_OPEN));

        const result = this.blockTags.find(([name, _]) => this.scanner.accept(name));
        let mod: BlockModifier;
        if (result === undefined) {
            mod = UnknownBlock;
            const startPos = this.scanner.position();
            const args = this.scanner.acceptUntil(MODIFIER_BLOCK_CLOSE);
            if (args === null) {
                this.emit.message(new ExpectedMessage(
                    this.scanner.position(), MODIFIER_BLOCK_CLOSE));
            }
            this.emit.message(
                new UnknownModifierMessage(startPos, this.scanner.position()));
        } else mod = result[1];


        // TODO: arguments
        const endsign = this.scanner.accept(MODIFIER_END_SIGN);
        const flagMarker = has(mod.flags, ModifierFlags.Marker);
        if (flagMarker && !endsign) this.emit.message(
            new ExpectedMessage(this.scanner.position(), MODIFIER_END_SIGN));
        const isMarker = flagMarker || endsign;
        
        if (!this.scanner.accept(MODIFIER_BLOCK_CLOSE))
            this.emit.message(new ExpectedMessage(
                this.scanner.position(), MODIFIER_BLOCK_CLOSE));

        const node: BlockModifierNode = {
            type: 'block',
            id: mod.name,
            head: {start: posStart, end: this.scanner.position()},
            arguments: [],
            start: posStart,
            end: -1,
            content: []
        }
        this.emit.startBlock(node);
        if (!isMarker) {
            this.WARN_IF_MORE_NEWLINES_THAN(1);
            if (!this.scanner.isEOF()) {
                if (has(mod.flags, ModifierFlags.Preformatted))
                    this.PRE_PARAGRAPH();
                else
                    this.BLOCK();
            }
        }
        this.emit.endBlock();
    }

    // also handles "grouped" (delimited) pre-paragraphs
    private PRE_PARAGRAPH() {
        assert(!this.scanner.isEOF());
        const posStart = this.scanner.position();
        const grouped = this.scanner.accept(GROUP_BEGIN);
        if (grouped) this.SHOULD_BE_A_NEWLINE();
        const posContentStart = this.scanner.position();
        let posContentEnd = this.scanner.position();

        let string = '';
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
                string += white;
            } else {
                string += this.scanner.acceptChar();
            }
            posContentEnd = this.scanner.position();
        }
        const node: PreNode = {
            type: 'pre', 
            start: posStart,
            end: this.scanner.position(),
            content: {
                start: posContentStart,
                end: posContentEnd,
                text: string
            }
        };
        this.emit.addBlockNode(node);
    }

    private MAYBE_GROUPED_PARAGRAPH() {
        assert(!this.scanner.isEOF());
        if (this.scanner.accept(GROUP_BEGIN)) {
            this.groupDepth++;
            this.SHOULD_BE_A_NEWLINE();
            this.WARN_IF_MORE_NEWLINES_THAN(1);
            while (!this.scanner.isEOF()) {
                if (this.scanner.accept(GROUP_END)) {
                    this.groupDepth--;
                    return;
                }
                this.BLOCK();
                this.WARN_IF_MORE_NEWLINES_THAN(1);
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
        const node: ParagraphNode = {
            type: 'paragraph',
            start: this.scanner.position(),
            end: -1,
            content: []
        };
        this.emit.startInline(node);
        while (!this.scanner.isEOF() && this.INLINE_ENTITY()) {}
        this.emit.endInline();
    }

    // returns false if breaking out of paragraph
    private INLINE_ENTITY(): boolean {
        assert(!this.scanner.isEOF());
        if (this.scanner.peek(MODIFIER_BLOCK_OPEN)) {
            // inline tag
            this.emit.message(
                new NewBlockShouldBeOnNewlineMessage(this.scanner.position()))
            return false;
        }
        if (this.scanner.peek(MODIFIER_INLINE_OPEN)) {
            // inline tag
            return this.MODIFIER_INLINE();
        }
        // TODO: don't know if this is enough

        if (this.scanner.accept('\\')) {
            if (this.scanner.isEOF()) {
                this.emit.addString('\\');
                return true;
            }
            const node: EscapedNode = {
                type: 'escaped',
                start: this.scanner.position() - 1,
                content: this.scanner.acceptChar(),
                end: this.scanner.position()
            };
            this.emit.addInlineNode(node);
            return true;
        }
        return this.PREFORMATTED_INLINE_ENTITY();
    }

    // returns false if breaking out of paragraph
    private PREFORMATTED_INLINE_ENTITY(): boolean {
        assert(!this.scanner.isEOF());
        if (this.scanner.accept('\n')) {
            // these whitespaces in a blank line have no effect
            while (this.scanner.acceptWhitespaceChar() !== null) {}
            if  (this.scanner.peek(MODIFIER_BLOCK_OPEN)
             || (this.scanner.peek(GROUP_END) && this.groupDepth > 0)
             ||  this.scanner.isEOF()) return false;

            if (this.scanner.accept('\n')) {
                this.WARN_IF_MORE_NEWLINES_THAN(0);
                return false;
            }
            this.emit.addString('\n');
            return true;
        }
        // simple character
        this.emit.addString(this.scanner.acceptChar());
        return true;
    }

    // returns false if breaking out of paragraph
    private MODIFIER_INLINE(): boolean {
        const posStart = this.scanner.position();
        assert(this.scanner.accept(MODIFIER_INLINE_OPEN));

        const result = this.inlineTags.find(([name, _]) => this.scanner.accept(name));
        let mod: InlineModifier;
        if (result === undefined) {
            mod = UnknownInline;
            const startPos = this.scanner.position();
            // eat name and args
            while (true) {
                if (this.scanner.isEOF()) {
                    this.emit.message(new ExpectedMessage(
                        this.scanner.position(), MODIFIER_INLINE_CLOSE));
                    break;
                }
                if (this.scanner.peek(MODIFIER_INLINE_CLOSE)
                 || this.scanner.peek(MODIFIER_END_SIGN)) break;
                this.scanner.acceptChar();
            }
            this.emit.message(
                new UnknownModifierMessage(startPos, this.scanner.position()));
        } else mod = result[1];

        const endsign = this.scanner.accept(MODIFIER_END_SIGN);
        const flagMarker = has(mod.flags, ModifierFlags.Marker);
        if (flagMarker && !endsign) this.emit.message(
            new ExpectedMessage(this.scanner.position(), MODIFIER_END_SIGN));
            const isMarker = flagMarker || endsign;
        
        if (!this.scanner.accept(MODIFIER_INLINE_CLOSE))
            this.emit.message(new ExpectedMessage(
                this.scanner.position(), MODIFIER_INLINE_CLOSE));

        const node: InlineModifierNode = {
            type: 'inline',
            id: mod.name,
            head: {start: posStart, end: this.scanner.position()},
            arguments: [],
            start: posStart,
            end: -1,
            content: []
        }
        this.emit.startInline(node);
        let ok = true;
        if (!isMarker) {
            const entity = has(mod.flags, ModifierFlags.Preformatted)
                ? this.PREFORMATTED_INLINE_ENTITY.bind(this)
                : this.INLINE_ENTITY.bind(this);
            while (true) {
                if (this.scanner.accept(MODIFIER_INLINE_END_TAG)) break;
                if (this.scanner.isEOF() || !(ok = entity())) {
                    this.emit.message(new UnclosedInlineModifierMessage(
                        this.scanner.position(), mod.name));
                    break;
                }
            }
        }
        this.emit.endInline();
        return ok;
    }
}