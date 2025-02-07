import { debug } from "./debug";
import { debugPrint } from "./debug-print";
import { BlockEntity, BlockModifierDefinition, BlockModifierNode, Configuration, Document, EscapedNode, InlineEntity, InlineModifierDefinition, InlineModifierNode, Message, ModifierArgument, ModifierFlags, ParagraphNode, ParseContext, PositionRange, PreNode, RootNode, Scanner, ArgumentEntity, ModifierNode, SystemModifierDefinition, SystemModifierNode, NodeType } from "./interface";
import { ContentShouldBeOnNewlineMessage, ExpectedMessage, NewBlockShouldBeOnNewlineMessage, ReachedRecursionLimitMessage as ReachedReparseLimitMessage, ReferredMessage, UnknownModifierMessage, UnnecessaryNewlineMessage } from "./messages";
import { _Def, _Node, _Shorthand } from "./typing-helper";
import { assert, has, NameManager } from "./util";

const GROUP_BEGIN = ':--';
const GROUP_END = '--:';

const MODIFIER_BLOCK_OPEN = '[.';
const MODIFIER_CLOSE_SIGN = ']';
const MODIFIER_END_SIGN = ';';

const MODIFIER_INLINE_OPEN = '[/';
const MODIFIER_INLINE_END_TAG = '[;]';

const MODIFIER_SYSTEM_OPEN = '[-';

const UnknownModifier = {
    [NodeType.BlockModifier]: new BlockModifierDefinition('UNKNOWN', ModifierFlags.Normal),
    [NodeType.InlineModifier]: new InlineModifierDefinition('UNKNOWN', ModifierFlags.Normal),
    [NodeType.SystemModifier]: new SystemModifierDefinition('UNKNOWN', ModifierFlags.Normal)
};

type NodeWithBlockContent = 
    RootNode | BlockModifierNode<unknown> | SystemModifierNode<unknown>;
type NodeWithInlineContent = 
    InlineModifierNode<unknown> | ParagraphNode;

class EmitEnvironment {
    public root: RootNode = {type: NodeType.Root, start: 0, end: -1, content: []};
    public messages: Message[] = [];
    private blockStack: NodeWithBlockContent[] = [this.root];
    private inlineStack: NodeWithInlineContent[] = [];
    private referringStack: PositionRange[] = [];

    constructor(private scanner: Scanner) {}

    message(...m: Message[]) {
        const referringReverse = [...this.referringStack].reverse();
        for (let msg of m) {
            for (const range of referringReverse)
                msg = new ReferredMessage(msg, range.start, range.end);
            this.messages.push(msg);
            debug.trace('issued msg', msg.code, msg.info);
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
        if (last?.type == NodeType.Text) {
            last.content += str;
            last.end = this.scanner.position();
        } else content.push({
            type: NodeType.Text,
            start: this.scanner.position() - str.length,
            end: this.scanner.position(),
            content: str
        });
    }

    startBlock(block: BlockModifierNode<unknown> | SystemModifierNode<unknown>) {
        this.addBlockNode(block);
        this.blockStack.push(block);
    }

    endBlock() {
        assert(this.blockStack.length >= 2);
        const node = this.blockStack.pop()!;
        node.end = this.scanner.position();
    }

    startInline(n: InlineModifierNode<unknown> | ParagraphNode) {
        if (n.type == NodeType.Paragraph) this.addBlockNode(n);
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
    private delayDepth = 0;
    private groupDepth = 0;

    constructor(private scanner: Scanner, config: Configuration) {
        this.emit = new EmitEnvironment(scanner);
        this.cxt = new ParseContext(config);
    }

    #defs<Type extends NodeType.BlockModifier | NodeType.SystemModifier | NodeType.InlineModifier>(type: Type): NameManager<_Def<Type, any>> {
        switch (type) {
            case NodeType.SystemModifier: return this.cxt.config.systemModifiers as any;
            case NodeType.InlineModifier: return this.cxt.config.inlineModifiers as any;
            case NodeType.BlockModifier: return this.cxt.config.blockModifiers as any;
            default: return debug.never(type);
        }
    }

    #reparse(nodes: (BlockEntity | InlineEntity)[], depth: number): boolean {
        if (depth > this.cxt.config.reparseDepthLimit) return false;
        let ok = true;
        for (const node of nodes) {
            switch (node.type) {
                case NodeType.Preformatted:
                case NodeType.Text:
                case NodeType.Escaped:
                    continue;
                case NodeType.Paragraph:
                    ok = this.#reparse(node.content, depth + 1) && ok;
                    continue;
                case NodeType.BlockModifier:
                case NodeType.InlineModifier:
                case NodeType.SystemModifier:
                    ok = this.#expand(node, depth + 1) && ok;
                    continue;
                default:
                    debug.never(node);
            }
        }
        return ok;
    }

    #expandArgument(arg: ModifierArgument) {
        if (arg.expansion !== undefined)
            return arg.expansion;
        let result = '';
        const immediate = this.delayDepth == 0;
        for (const e of arg.content) {
            switch (e.type) {
                case NodeType.Text:
                case NodeType.Escaped:
                    result += e.content;
                    break;
                case NodeType.Interpolation:
                    if (e.expansion === undefined) {
                        const inner = this.#expandArgument(e.argument);
                        if (inner === undefined 
                         || e.definition.expand === undefined
                         || (!immediate && !e.definition.alwaysTryExpand))
                            return undefined;
                        e.expansion = e.definition.expand(inner, this.cxt, immediate);
                        if (e.expansion === undefined)
                            return undefined;
                    }
                    result += e.expansion;
                    break;
                default:
                    debug.never(e);
            }
        }
        // debug.trace('expanded arg:', result);
        arg.expansion = result;
        return result;
    }

    #expandArguments(node: ModifierNode) {
        for (const arg of node.arguments) {
            this.#expandArgument(arg);
            // if (!arg.expansion) debug.trace('expand arg failed');
        }
    }

    #expand(node: ModifierNode, depth = 0) {
        if (node.expansion !== undefined) {
            debug.trace('already expanded, skipping:', node.mod.name);
            return true;
        }

        if (depth > 0) {
            this.#expandArguments(node);
        }

        if (this.delayDepth > 0 && !node.mod.alwaysTryExpand) {
            debug.trace('delaying expansion of', node.mod.name);
            return true;
        }

        const immediate = this.delayDepth == 0;
        if (depth > 0) {
            // simulate initial parse for generated content
            if (node.mod.beforeParseContent)
                this.emit.message(...node.mod.beforeParseContent(node as any, this.cxt, immediate));
            if (node.content.length > 0) {
                if (node.mod.delayContentExpansion) this.delayDepth++;
                this.#reparse(node.content, depth);
                if (node.mod.delayContentExpansion) this.delayDepth--;
            }
            if (node.mod.afterParseContent)
                this.emit.message(...node.mod.afterParseContent(node as any, this.cxt, immediate));
        }

        if (node.mod.prepareExpand)
            this.emit.message(...node.mod.prepareExpand(node as any, this.cxt, immediate));
        if (node.mod.expand) {
            node.expansion = node.mod.expand(node as any, this.cxt, immediate);
            if (!node.expansion) {
                // debug.trace('manually delaying expansion of', node.mod.name);
                return true;
            }
            debug.trace(`${this.delayDepth > 0 ? 'early ' : ''}expanding:`, node.mod.name);
            if (node.expansion.length > 0)
                debug.trace(() => '-->\n' + debugPrint.node(...node.expansion!));
        }

        const expansion = node.expansion ?? node.content;
        if (expansion.length == 0) return true;
        if (node.mod.beforeProcessExpansion)
            this.emit.message(...node.mod.beforeProcessExpansion(node as any, this.cxt, immediate));

        this.emit.pushReferring(node.start, node.end);
        let ok = this.#reparse(expansion, depth);
        this.emit.popReferring();

        if (node.mod.afterProcessExpansion)
            this.emit.message(...node.mod.afterProcessExpansion(node as any, this.cxt, immediate));
        if (!ok && depth == 0) {
            const limit = this.cxt.config.reparseDepthLimit;
            this.emit.message(new ReachedReparseLimitMessage(
                node.start, node.end, limit, node.mod.name));
        }
        return ok;
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
            new UnnecessaryNewlineMessage(start, end));
    }

    private DOCUMENT() {
        this.WHITESPACES_OR_NEWLINES();
        while (!this.scanner.isEOF()) {
            this.BLOCK_ENTITY();
            this.WHITESPACES_OR_NEWLINES();
        }
    }

    private BLOCK_ENTITY() {
        assert(!this.scanner.isEOF());
        if (this.scanner.peek(MODIFIER_BLOCK_OPEN)) {
            this.MODIFIER(NodeType.BlockModifier);
            return;
        }
        if (this.scanner.peek(MODIFIER_SYSTEM_OPEN)) {
            this.MODIFIER(NodeType.SystemModifier);
            return;
        }

        const short = this.cxt.config.blockShorthands.find((x) => this.scanner.accept(x.name));
        if (short) return this.SHORTHAND(NodeType.BlockModifier, short);

        // simple paragraph(s)
        this.MAYBE_GROUPED_PARAGRAPH();
    }

    private MODIFIER
        <Type extends NodeType.BlockModifier | NodeType.SystemModifier | NodeType.InlineModifier>
        (type: Type): boolean 
    {
        const posStart = this.scanner.position();
        assert(this.scanner.accept({
            [NodeType.BlockModifier]: MODIFIER_BLOCK_OPEN,
            [NodeType.SystemModifier]: MODIFIER_SYSTEM_OPEN,
            [NodeType.InlineModifier]: MODIFIER_INLINE_OPEN
        }[type]));

        const result = this.#defs(type).find((x) => this.scanner.accept(x.name));
        const mod = result ?? UnknownModifier[type];
        if (result === undefined) {
            let name = '';
            while (!this.scanner.isEOF() 
                && !this.scanner.acceptWhitespaceChar()
                && !this.scanner.peek(MODIFIER_CLOSE_SIGN)
                && !this.scanner.peek(MODIFIER_END_SIGN))
            {
                if (this.scanner.accept('\\'))
                    if (this.scanner.isEOF()) break;
                name += this.scanner.acceptChar();
            }
            this.emit.message(
                new UnknownModifierMessage(posStart, this.scanner.position(), name));
        }
        const args = this.ARGUMENTS();
        debug.trace(`PARSE ${NodeType[type]}:`, mod.name);

        const endsign = this.scanner.accept(MODIFIER_END_SIGN);
        const flagMarker = has(mod.flags, ModifierFlags.Marker);
        if (!this.scanner.accept(MODIFIER_CLOSE_SIGN))
            this.emit.message(new ExpectedMessage(
                this.scanner.position(), MODIFIER_CLOSE_SIGN));

        const headEnd = this.scanner.position();
        const node: ModifierNode = {
            type, mod: mod as any,
            head: {start: posStart, end: headEnd},
            arguments: args,
            start: posStart, end: headEnd,
            content: [],
            expansion: undefined
        };

        const isMarker = flagMarker || endsign;
        return this.MODIFIER_BODY(type, node, MODIFIER_INLINE_END_TAG, isMarker);
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
                    if (grouped) this.emit.message(
                        new ExpectedMessage(this.scanner.position(), GROUP_END));
                    break;
                }
                string += white;
            } else {
                string += this.scanner.acceptChar();
            }
            posContentEnd = this.scanner.position();
        }
        const node: PreNode = {
            type: NodeType.Preformatted, 
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
                this.BLOCK_ENTITY();
                this.WARN_IF_MORE_NEWLINES_THAN(1);
            }
            // EOF
            this.emit.message(
                new ExpectedMessage(this.scanner.position(), GROUP_END));
        } else {
            this.PARAGRAPH();
        }
    }

    private PARAGRAPH() {
        assert(!this.scanner.isEOF());
        const node: ParagraphNode = {
            type: NodeType.Paragraph,
            start: this.scanner.position(),
            end: -1,
            content: []
        };
        debug.trace('PARSE para');
        this.emit.startInline(node);
        while (!this.scanner.isEOF() && this.INLINE_ENTITY()) {}
        this.emit.endInline();
        const last = node.content.at(-1);
        node.actualEnd = last?.actualEnd ?? last?.end;
        debug.trace('PARSE para end');
    }

    // returns false if breaking out of paragraph
    private SHORTHAND
        <Type extends NodeType.BlockModifier | NodeType.InlineModifier>
        (type: Type, d: _Shorthand<Type>): boolean 
    {
        const posStart = this.scanner.position() - d.name.length;
        let args: ModifierArgument[] = [];
        for (const part of d.parts) {
            let [arg, ok] = this.ARGUMENT_CONTENT(part, ['\n\n']);
            if (!ok) {
                this.emit.message(new ExpectedMessage(this.scanner.position(), part));
                return false;
            }
            args.push(arg);
        }

        const headEnd = this.scanner.position();
        const node: ModifierNode = {
            type, mod: d.mod as any,
            head: {start: posStart, end: headEnd},
            arguments: args,
            start: posStart, end: headEnd,
            content: [],
            expansion: undefined
        };

        const isMarker = has(node.mod.flags, ModifierFlags.Marker);
        return this.MODIFIER_BODY<Type>(type, node, d.postfix, isMarker);
    }

    private MODIFIER_BODY
        <Type extends NodeType.BlockModifier | NodeType.InlineModifier | NodeType.SystemModifier>
        (type: Type, node: ModifierNode, postfix: string | undefined, isMarker: boolean) 
    {
        this.#expandArguments(node);
        const immediate = this.delayDepth == 0;
        if (node.mod.beforeParseContent)
            this.emit.message(...node.mod.beforeParseContent(node as any, this.cxt, immediate));
        if (node.mod.delayContentExpansion) this.delayDepth++;

        let ok = true;
        if (isMarker) {
            if (type === NodeType.InlineModifier) this.emit.addInlineNode(node as InlineEntity);
            else this.emit.addBlockNode(node as BlockEntity);
        } else if (type == NodeType.InlineModifier) {
            this.emit.startInline(node as InlineModifierNode<unknown>);
            const entity = has(node.mod.flags, ModifierFlags.Preformatted)
                ? this.PREFORMATTED_INLINE_ENTITY.bind(this)
                : this.INLINE_ENTITY.bind(this);
            while (true) {
                if (postfix && this.scanner.accept(postfix)) break;
                if (this.scanner.isEOF() || !(ok = entity())) {
                    // TODO: use error 3
                    if (postfix) this.emit.message(
                        new ExpectedMessage(this.scanner.position(), postfix));
                    break;
                }
            }
            this.emit.endInline();
        } else {
            this.emit.startBlock(node as any);
            this.WARN_IF_MORE_NEWLINES_THAN(1);
            if (!this.scanner.isEOF()) {
                if (has(node.mod.flags, ModifierFlags.Preformatted))
                    this.PRE_PARAGRAPH();

                else
                    this.BLOCK_ENTITY();
            }
            this.emit.endBlock();
        }

        const last = node.content.at(-1);
        node.actualEnd = last?.actualEnd ?? last?.end;
        if (node.mod.delayContentExpansion) this.delayDepth--;
        if (node.mod.afterParseContent)
            this.emit.message(...node.mod.afterParseContent(node as any, this.cxt, immediate));
        this.#expand(node);
        return ok;
    }

    // returns false if breaking out of paragraph
    private INLINE_ENTITY(): boolean {
        assert(!this.scanner.isEOF());
        if (this.scanner.peek(MODIFIER_BLOCK_OPEN)) 
        {
            this.emit.message(
                new NewBlockShouldBeOnNewlineMessage(this.scanner.position()))
            return false;
        }
        if (this.scanner.peek(MODIFIER_INLINE_OPEN))
            return this.MODIFIER(NodeType.InlineModifier);
        if (this.scanner.peek(MODIFIER_SYSTEM_OPEN))
            return false;

        const short = this.cxt.config.inlineShorthands.find((x) => this.scanner.accept(x.name));
        if (short) return this.SHORTHAND(NodeType.InlineModifier, short);

        if (this.scanner.accept('\\')) {
            if (this.scanner.isEOF()) {
                this.emit.addString('\\');
                return true;
            }
            const node: EscapedNode = {
                type: NodeType.Escaped,
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
             ||  this.scanner.peek(MODIFIER_SYSTEM_OPEN)
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

    // returns argument and isOk
    private ARGUMENT_CONTENT(
        end: string | undefined = undefined, 
        close: string[] = [MODIFIER_END_SIGN, MODIFIER_CLOSE_SIGN]
    ): [ModifierArgument, boolean] {
        let ok = true;
        const content: ArgumentEntity[] = [];
        const posStart = this.scanner.position();
        let posEnd = this.scanner.position();

        const emitString = (s: string) => {
            const last = content.at(-1);
            if (last?.type == NodeType.Text) {
                last.content += s;
                last.end += s.length;
            } else {
                const end = this.scanner.position();
                content.push({
                    type: NodeType.Text, 
                    end, start: end - s.length,
                    content: s
                });
            }
        };

        while (true) {
            if (end !== undefined && this.scanner.accept(end))
                break;
            if (end === undefined && this.scanner.accept(':'))
                break;
            if (close.find((x) => this.scanner.peek(x))
             || this.scanner.isEOF())
            {
                ok = false;
                break;
            }

            if (this.scanner.accept('\\')) {
                // handle escaping
                posEnd = this.scanner.position();
                if (this.scanner.isEOF()) {
                    emitString('\\');
                    ok = false;
                    break;
                }
                content.push({
                    type: NodeType.Escaped,
                    content: this.scanner.acceptChar(),
                    start: posEnd - 1, end: posEnd + 1
                });
                continue;
            }

            const beforeInterp = this.scanner.position();
            const result = this.cxt.config.argumentInterpolators.find(
                (x) => this.scanner.accept(x.name));
            if (result !== undefined) {
                const [inner, ok2] = this.ARGUMENT_CONTENT(result.postfix);
                posEnd = this.scanner.position();
                content.push({
                    type: NodeType.Interpolation,
                    definition: result, argument: inner,
                    start: beforeInterp, end: posEnd
                });
                if (!ok2) {
                    this.emit.message(new ExpectedMessage(posEnd, result.postfix));
                    ok = false;
                    break;
                }
            } else {
                emitString(this.scanner.acceptChar());
                posEnd = this.scanner.position();
            }
        }
        return [{
            start: posStart, end: posEnd,
            content
        }, ok];
    }

    private ARGUMENTS(): ModifierArgument[] {
        // optionally accept semicolon before first argument
        const firstSemicolon = this.scanner.accept(':');
        // don't eat whites if there is a first semicolon
        if (!firstSemicolon) this.WHITESPACES_OR_NEWLINES();

        const list: ModifierArgument[] = [];
        let end = false;
        while (!end) {
            const [arg, ok] = this.ARGUMENT_CONTENT();
            if (!ok) {
                end = true;
                // if we haven't parsed anything so far: if there is no first semicolon, there's no arguments; otherwise, there is a single empty argument
                if (list.length == 0 && arg.content.length == 0 && !firstSemicolon)
                    break;
            }
            list.push(arg);
        }
        return list;
    }
}

export function parse(scanner: Scanner, config: Configuration) {
    return new Parser(scanner, config).parse();
}
