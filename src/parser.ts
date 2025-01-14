import { BlockModifier, Configuration, EmitEnvironment, FixSuggestion, Message, MessageSeverity, ModifierFlags, Scanner } from "./interface";
import { ExpectedMessage, UnknownModifierMessage, UnnecessaryNewlineMessage } from "./messages";
import { assert, has } from "./util";

const GROUP_BEGIN = ':--';
const GROUP_END = '--:';

const MODIFIER_BLOCK_OPEN = '[.';
const MODIFIER_BLOCK_CLOSE = ']';

const MODIFIER_INLINE_OPEN = '[/';
const MODIFIER_INLINE_CLOSE = ']';
const MODIFIER_INLINE_END_SIGN = ';';
const MODIFIER_INLINE_END_TAG = '[;]';

export class Parser {
    private emit: EmitEnvironment;
    private groupDepth = 0;
    private blockTags: [string, BlockModifier][] = [];
    private inlineTags: [string, BlockModifier][] = [];

    constructor(private scanner: Scanner, private config: Configuration) {
        this.emit = new EmitEnvironment(scanner);
        this.blockTags = [...config.blockModifiers.entries()]
            .sort(([x, _], [y, __]) => y.length - x.length);
        this.inlineTags = [...config.inlineModifiers.entries()]
            .sort(([x, _], [y, __]) => y.length - x.length);
    }

    parse() {
        const start = performance.now();
        this.DOCUMENT();
        console.info('parse time:', performance.now() - start);
        return this.emit.tree;
    }

    private WHITESPACES_OR_NEWLINES() {
        while (this.scanner.acceptWhitespaceChar() !== null
            || this.scanner.accept('\n')) {}
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
        if (warn) this.emit.message(
            new UnnecessaryNewlineMessage(start, end - start));
    }

    private DOCUMENT() {
        while (!this.scanner.isEOF()) {
            this.BLOCK();
            this.WHITESPACES_OR_NEWLINES();
        }
    }

    private BLOCK() {
        assert(!this.scanner.isEOF());
        this.WHITESPACES_OR_NEWLINES();
        if (this.scanner.peek(MODIFIER_BLOCK_OPEN)) {
            this.MODIFIER_BLOCK();
            return;
        }
        // simple paragraph(s)
        this.MAYBE_GROUPED_PARAGRAPH();
    }

    private MODIFIER_BLOCK() {
        assert(this.scanner.accept(MODIFIER_BLOCK_OPEN));
        const result = this.blockTags.find(([name, _]) => this.scanner.accept(name));
        if (result !== undefined) {
            // accepted name
            const mod = result[1];
            if (!this.scanner.accept(MODIFIER_BLOCK_CLOSE))
                this.emit.message(new ExpectedMessage(
                    this.scanner.position(), MODIFIER_BLOCK_CLOSE));
            if (has(mod.flags, ModifierFlags.Marker)) {
                let node = this.emit.newNode('block');
                node.attributes.set('type', mod.name);
            } else {
                this.WHITESPACES_OR_NEWLINES();
                let node = this.emit.startNode('block');
                node.attributes.set('type', mod.name);
                if (has(mod.flags, ModifierFlags.Preformatted))
                    this.PRE_PARAGRAPH();
                else
                    this.BLOCK();
                this.emit.endNode('block');
            }
        } else {
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
        this.emit.startNode('paragraph');
        while (!this.scanner.isEOF() && this.INLINE_ENTITY()) {}
        this.emit.endNode('paragraph');
    }

    private INLINE_ENTITY(): boolean {
        assert(!this.scanner.isEOF());
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
            let node = this.emit.newNode('escaped');
            node.content = [this.scanner.acceptChar()];
            node.end = node.start + 1;
            return true;
        }
        return this.PREFORMATTED_INLINE_ENTITY();
    }

    private PREFORMATTED_INLINE_ENTITY(): boolean {
        assert(!this.scanner.isEOF());
        if (this.scanner.accept('\n')) {
            // these whitespaces in a blank line have no effect
            while (this.scanner.acceptWhitespaceChar() !== null) {}
            if  (this.scanner.peek(MODIFIER_BLOCK_OPEN)
             || (this.scanner.peek(GROUP_END) && this.groupDepth > 0)
             ||  this.scanner.isEOF()) return false;

            if (this.scanner.accept('\n')) {
                this.WARN_IF_MORE_NEWLINES();
                return false;
            }
            this.emit.addString('\n');
            return true;
        }
        // simple character
        this.emit.addString(this.scanner.acceptChar());
        return true;
    }

    private MODIFIER_INLINE(): boolean {
        assert(this.scanner.accept(MODIFIER_INLINE_OPEN));
        const result = this.inlineTags.find(([name, _]) => this.scanner.accept(name));
        if (result !== undefined) {
            // accepted tag
            const mod = result[1];
            if (has(mod.flags, ModifierFlags.Marker)) {
                if (!this.scanner.accept(MODIFIER_INLINE_END_SIGN))
                    this.emit.message(new ExpectedMessage(
                        this.scanner.position(), MODIFIER_INLINE_END_SIGN));
            }
            if (!this.scanner.accept(MODIFIER_INLINE_CLOSE))
                this.emit.message(new ExpectedMessage(
                    this.scanner.position(), MODIFIER_INLINE_CLOSE));
            
            if (has(mod.flags, ModifierFlags.Marker)) {
                const node = this.emit.newNode('inline');
                node.attributes.set('type', mod.name);
                return true;
            } else {
                const node = this.emit.startNode('block');
                node.attributes.set('type', mod.name);
                const entity = has(mod.flags, ModifierFlags.Preformatted)
                    ? this.PREFORMATTED_INLINE_ENTITY.bind(this)
                    : this.INLINE_ENTITY.bind(this);
                let ok = true;
                while (true) {
                    if (this.scanner.accept(MODIFIER_INLINE_END_TAG)) break;
                    if (this.scanner.isEOF() || !(ok = entity())) {
                        this.emit.message(new ExpectedMessage(
                            this.scanner.position(), MODIFIER_INLINE_END_TAG));
                        break;
                    }
                }
                this.emit.endNode('block');
                return ok;
            }
        } else {
            // unknown tag
            const startPos = this.scanner.position();
            const args = this.scanner.acceptUntil(MODIFIER_INLINE_CLOSE);
            if (args === null) {
                this.emit.message(new ExpectedMessage(
                    this.scanner.position(), MODIFIER_INLINE_CLOSE));
            }
            this.emit.message(
                new UnknownModifierMessage(startPos, this.scanner.position()));
            // fall back
            return this.INLINE_ENTITY();
        }
    }
}