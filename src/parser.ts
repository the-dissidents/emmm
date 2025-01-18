import { BlockEntity, BlockModifierDefinition, BlockModifierNode, Configuration, Document, EscapedNode, InlineEntity, InlineModifierDefinition, InlineModifierNode, Message, ModifierArgument, ModifierFlags, Node, ParagraphNode, ParseContext, PositionRange, PreNode, RootNode, Scanner } from "./interface";
import { ContentShouldBeOnNewlineMessage, ExpectedMessage, NewBlockShouldBeOnNewlineMessage, ReachedRecursionLimitMessage as ReachedReparseLimitMessage, ReferredMessage, UnclosedInlineModifierMessage, UnknownModifierMessage, UnnecessaryNewlineMessage } from "./messages";
import { assert, has } from "./util";

const GROUP_BEGIN = ':--';
const GROUP_END = '--:';

const MODIFIER_BLOCK_OPEN = '[.';
const MODIFIER_CLOSE_SIGN = ']';
const MODIFIER_END_SIGN = ';';

const MODIFIER_INLINE_OPEN = '[/';
const MODIFIER_INLINE_END_TAG = '[;]';

const UnknownBlock = new BlockModifierDefinition('UNKNOWN', ModifierFlags.Normal);
const UnknownInline = new InlineModifierDefinition('UNKNOWN', ModifierFlags.Normal);

type NodeWithBlockContent = RootNode | BlockModifierNode<unknown>;
type NodeWithInlineContent = InlineModifierNode<unknown> | ParagraphNode;

class EmitEnvironment {
    public root: RootNode = {type: 'root', start: 0, end: -1, content: []};
    public messages: Message[] = [];
    private blockStack: NodeWithBlockContent[] = [this.root];
    private inlineStack: NodeWithInlineContent[] = [];
    private referringStack: PositionRange[] = [];

    constructor(private scanner: Scanner) {}

    message(...m: Message[]) {
        const referringReverse = [...this.referringStack].reverse();
        for (let msg of m) {
            for (const range of referringReverse)
                msg = new ReferredMessage(msg, range.start, range.end - range.start);
            this.messages.push(msg);
        }
    }

    pushReferring(start: number, end: number) {
        this.referringStack.push({start, end});
    }

    popReferring() {
        assert(this.referringStack.length > 0);
        this.referringStack.pop();
    }

    addBlockNode(n: BlockEntity) {
        assert(this.blockStack.length > 0);
        this.blockStack.at(-1)!.content.push(n);
        return n;
    }

    addInlineNode(n: InlineEntity) {
        assert(this.inlineStack.length > 0);
        this.inlineStack.at(-1)!.content.push(n);
        return n;
    }

    addString(str: string) {
        assert(this.inlineStack.length > 0);
        const content = this.inlineStack.at(-1)!.content;
        const last = content.at(-1);
        if (last?.type == 'text') {
            last.content += str;
            last.end = this.scanner.position();
        } else content.push({
            type: 'text',
            start: this.scanner.position() - str.length,
            end: this.scanner.position(),
            content: str
        });
    }

    startBlock(block: BlockModifierNode<unknown>) {
        this.addBlockNode(block);
        this.blockStack.push(block);
    }

    endBlock() {
        assert(this.blockStack.length >= 2);
        const node = this.blockStack.pop()!;
        node.end = this.scanner.position();
    }

    startInline(n: InlineModifierNode<unknown> | ParagraphNode) {
        if (n.type == 'paragraph') this.addBlockNode(n);
        else this.addInlineNode(n);
        this.inlineStack.push(n);
    }

    endInline() {
        assert(this.inlineStack.length > 0);
        const node = this.inlineStack.pop()!;
        node.end = this.scanner.position();
    }
}

class Parser {
    private emit: EmitEnvironment;
    private cxt: ParseContext;
    private groupDepth = 0;
    private blockTags: [string, BlockModifierDefinition<any>][] = [];
    private inlineTags: [string, InlineModifierDefinition<any>][] = [];
    private doneParsing = new Set<Node>;

    constructor(private scanner: Scanner, config: Configuration) {
        this.emit = new EmitEnvironment(scanner);
        this.cxt = new ParseContext(config);
        this.cxt.onConfigChange = () => this.#sortModifiers();
        this.#sortModifiers();
    }

    #sortModifiers() {
        this.blockTags = [...this.cxt.config.blockModifiers.entries()]
            .sort(([x, _], [y, __]) => y.length - x.length);
        this.inlineTags = [...this.cxt.config.inlineModifiers.entries()]
            .sort(([x, _], [y, __]) => y.length - x.length);
    }

    #reparse(nodes: (BlockEntity | InlineEntity)[], depth: number): boolean {
        if (depth > this.cxt.config.reparseDepthLimit) return false;
        let ok = true;
        for (const node of nodes) {
            switch (node.type) {
                case "pre":
                case "text":
                case "escaped":
                    continue;
                case "paragraph":
                    ok = this.#reparse(node.content, depth + 1) && ok;
                    break;
                case "block":
                case "inline":
                    if (this.doneParsing.has(node)) {
                        console.log('skipping', node);
                        continue;
                    }
                    this.doneParsing.add(node);
                    assert(node.expansion === undefined);
                    if (node.mod.beforeParse)
                        this.emit.message(...node.mod.beforeParse(node as any, this.cxt));

                    this.emit.pushReferring(node.start, node.end);
                    ok &&= this.#reparse(node.content, depth + 1);
                    this.emit.popReferring();
                    
                    if (node.mod.parse)
                        this.emit.message(...node.mod.parse(node as any, this.cxt));
                    node.expansion = node.mod.expand
                        ? node.mod.expand(node as any, this.cxt) : [];
                    
                    this.emit.pushReferring(node.start, node.end);
                    ok = this.#reparse(node.expansion, depth + 1) && ok;
                    this.emit.popReferring();
                    break;
            }
        }
        return ok;
    }

    #expand(node: BlockModifierNode<any> | InlineModifierNode<any>) {
        this.doneParsing.add(node);
        node.expansion = node.mod.expand
            ? node.mod.expand(node as any, this.cxt) : [];
        this.emit.pushReferring(node.start, node.end);
        const ok = this.#reparse(node.expansion, 0);
        this.emit.popReferring();
        if (!ok) {
            const limit = this.cxt.config.reparseDepthLimit;
            this.emit.message(new ReachedReparseLimitMessage(
                node.start, node.end - node.start, limit, node.mod.name));
        }
    }

    parse() {
        this.DOCUMENT();
        return new Document(this.emit.root, this.cxt, this.emit.messages);
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
        let mod: BlockModifierDefinition<unknown>;
        if (result === undefined) {
            mod = UnknownBlock;
            const startPos = this.scanner.position();
            const args = this.scanner.acceptUntil(MODIFIER_CLOSE_SIGN);
            if (args === null) {
                this.emit.message(new ExpectedMessage(
                    this.scanner.position(), MODIFIER_CLOSE_SIGN));
            }
            this.emit.message(
                new UnknownModifierMessage(posStart, this.scanner.position() - posStart));
        } else mod = result[1];
        const args = this.ARGUMENTS();

        const endsign = this.scanner.accept(MODIFIER_END_SIGN);
        const flagMarker = has(mod.flags, ModifierFlags.Marker);
        // if (flagMarker && !endsign) this.emit.message(
        //     new ExpectedMessage(this.scanner.position(), MODIFIER_END_SIGN));
        const isMarker = flagMarker || endsign;
        
        if (!this.scanner.accept(MODIFIER_CLOSE_SIGN))
            this.emit.message(new ExpectedMessage(
                this.scanner.position(), MODIFIER_CLOSE_SIGN));

        const node: BlockModifierNode<unknown> = {
            type: 'block', mod,
            head: {start: posStart, end: this.scanner.position()},
            arguments: args,
            start: posStart,
            end: -1,
            content: []
        }

        const isInDefiniton = this.cxt.blockSlotInDefinition.length > 0 
                           || this.cxt.inlineSlotInDefinition.length > 0;
        if (mod.beforeParse && !isInDefiniton)
            this.emit.message(...mod.beforeParse(node, this.cxt));
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
        if (!isInDefiniton) {
            if (mod.parse)
                this.emit.message(...mod.parse(node, this.cxt));
            this.#expand(node);
        }
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
        let mod: InlineModifierDefinition<unknown>;
        if (result === undefined) {
            mod = UnknownInline;
            const startPos = this.scanner.position();
            // TODO: properly eat name and args
            while (true) {
                if (this.scanner.isEOF()) {
                    this.emit.message(new ExpectedMessage(
                        this.scanner.position(), MODIFIER_CLOSE_SIGN));
                    break;
                }
                if (this.scanner.peek(MODIFIER_CLOSE_SIGN)
                 || this.scanner.peek(MODIFIER_END_SIGN)) break;
                this.scanner.acceptChar();
            }
            this.emit.message(
                new UnknownModifierMessage(posStart, this.scanner.position() - posStart));
        } else mod = result[1];
        const args = this.ARGUMENTS();

        const endsign = this.scanner.accept(MODIFIER_END_SIGN);
        const flagMarker = has(mod.flags, ModifierFlags.Marker);
        // if (flagMarker && !endsign) this.emit.message(
        //     new ExpectedMessage(this.scanner.position(), MODIFIER_END_SIGN));
        const isMarker = flagMarker || endsign;
        
        if (!this.scanner.accept(MODIFIER_CLOSE_SIGN))
            this.emit.message(new ExpectedMessage(
                this.scanner.position(), MODIFIER_CLOSE_SIGN));

        const node: InlineModifierNode<unknown> = {
            type: 'inline', mod,
            head: {start: posStart, end: this.scanner.position()},
            arguments: args,
            start: posStart,
            end: -1,
            content: []
        }

        const isInDefiniton = this.cxt.blockSlotInDefinition.length > 0 
                           || this.cxt.inlineSlotInDefinition.length > 0;
        if (mod.beforeParse && !isInDefiniton)
            this.emit.message(...mod.beforeParse(node, this.cxt));
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
        // don't expand when inside definition
        if (!isInDefiniton) {
            if (mod.parse)
                this.emit.message(...mod.parse(node, this.cxt));
            this.#expand(node);
        }
        return ok;
    }

    private ARGUMENTS(): ModifierArgument[] {
        // optionally accept semicolon before first argument
        const firstSemicolon = this.scanner.accept(':');
        // don't eat whites if there is a first semicolon
        if (!firstSemicolon) this.WHITESPACES_OR_NEWLINES();

        const list: ModifierArgument[] = [];
        let end = false;
        while (!end) {
            const posStart = this.scanner.position();
            let posEnd = posStart;
            let content = '';
            while (true) {
                // end of argument
                if (this.scanner.accept(':')) break;
                // end of argument list
                if (this.scanner.peek(MODIFIER_END_SIGN)
                 || this.scanner.peek(MODIFIER_CLOSE_SIGN)
                 || this.scanner.isEOF())
                {
                    // if we haven't parsed anything so far: if there is no first semicolon, there's no arguments; otherwise, there is a single empty argument
                    if (list.length == 0 && content == '' && !firstSemicolon) return [];
                    end = true;
                    break;
                }
                // handle escaping
                if (this.scanner.accept('\\') && this.scanner.isEOF()) {
                    content += '\\';
                    posEnd = this.scanner.position();
                    end = true;
                    break;
                }
                // TODO: bracket matching
                content += this.scanner.acceptChar();
                posEnd = this.scanner.position();
            }
            list.push({
                name: undefined,
                content: content,
                start: posStart,
                end: posEnd
            });
        }
        return list;
    }
}

export function parse(scanner: Scanner, config: Configuration) {
    return new Parser(scanner, config).parse();
}