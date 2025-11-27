import { debug } from "./debug";
import { debugPrint } from "./debug-print";
import { BlockEntity, BlockModifierDefinition, BlockModifierNode, EscapedNode, InlineEntity, InlineModifierDefinition, InlineModifierNode, Message, ModifierArgument, ModifierSlotType, ParagraphNode, LocationRange, PreNode, RootNode, ArgumentEntity, ModifierNode, SystemModifierDefinition, SystemModifierNode, NodeType, ModifierArguments } from "./interface";
import { ShouldBeOnNewlineMessage, ExpectedMessage, ReachedRecursionLimitMessage, UnknownModifierMessage, UnnecessaryNewlineMessage, InternalErrorMessage } from "./messages";
import { ParseContext, Document } from "./parser-config";
import { Scanner } from "./scanner";
import { _Def, _Node, _Shorthand } from "./typing-helper";
import { assert, NameManager } from "./util";

const ESCAPE_CHAR = '\\';

const GROUP_BEGIN = '<<<';
const GROUP_END = '>>>';

const MODIFIER_BLOCK_OPEN = '[.';
const MODIFIER_INLINE_OPEN = '[/';
const MODIFIER_SYSTEM_OPEN = '[-';
const MODIFIER_CLOSE_SIGN = ']';
const MODIFIER_END_SIGN = ';';
const MODIFIER_INLINE_END_TAG = '[;]';
const MODIFIER_ARGUMENT_SEPARATOR = '|';

const UnknownModifier = {
    [NodeType.BlockModifier]: new BlockModifierDefinition('UNKNOWN', ModifierSlotType.Normal),
    [NodeType.InlineModifier]: new InlineModifierDefinition('UNKNOWN', ModifierSlotType.Normal),
    [NodeType.SystemModifier]: new SystemModifierDefinition('UNKNOWN', ModifierSlotType.Normal)
};

type NodeWithBlockContent = 
    BlockModifierNode<unknown> | SystemModifierNode<unknown>;
type NodeWithInlineContent = 
    InlineModifierNode<unknown> | ParagraphNode;

class EmitEnvironment {
    public root: RootNode;
    public messages: Message[] = [];
    private blockStack: NodeWithBlockContent[] = [];
    private inlineStack: NodeWithInlineContent[] = [];

    constructor(private scanner: Scanner) {
        this.root = {type: NodeType.Root, source: scanner.source, content: []};
    }

    message(...m: Message[]) {
        for (let msg of m) {
            this.messages.push(msg);
            debug.trace('issued msg', msg.code, msg.info);
        }
    }

    addBlockNode(n: BlockEntity) {
        (this.blockStack.at(-1) ?? this.root).content.push(n);
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
            last.location.end = this.scanner.position();
        } else content.push({
            type: NodeType.Text,
            location: {
                source: this.scanner.source,
                start: this.scanner.position() - str.length,
                end: this.scanner.position(),
            },
            content: str
        });
    }

    startBlock(block: BlockModifierNode<unknown> | SystemModifierNode<unknown>) {
        this.addBlockNode(block);
        this.blockStack.push(block);
    }

    endBlock() {
        assert(this.blockStack.length > 0);
        const node = this.blockStack.pop()!;
        node.location.end = this.scanner.position();
    }

    startInline(n: InlineModifierNode<unknown> | ParagraphNode) {
        if (n.type == NodeType.Paragraph) this.addBlockNode(n);
        else this.addInlineNode(n);
        this.inlineStack.push(n);
    }

    endInline() {
        assert(this.inlineStack.length > 0);
        const node = this.inlineStack.pop()!;
        node.location.end = this.scanner.position();
    }
}

export class Parser {
    private emit: EmitEnvironment;
    private delayDepth = 0;
    private groupDepth = 0;

    constructor(
        private scanner: Scanner, 
        private cxt: ParseContext
    ) {
        this.emit = new EmitEnvironment(scanner);
    }

    #loc(to?: number): LocationRange {
        return {
            source: this.scanner.source,
            start: this.scanner.position(),
            end: to ?? this.scanner.position()
        };
    }

    #locFrom(from: number, to?: number): LocationRange {
        return {
            source: this.scanner.source,
            start: from,
            end: to ?? this.scanner.position()
        };
    }

    /* istanbul ignore next -- @preserve */
    #defs<
        Type extends NodeType.BlockModifier | NodeType.SystemModifier | NodeType.InlineModifier
    >(type: Type): NameManager<_Def<Type, any>> {
        switch (type) {
            case NodeType.SystemModifier: return this.cxt.config.systemModifiers as any;
            case NodeType.InlineModifier: return this.cxt.config.inlineModifiers as any;
            case NodeType.BlockModifier: return this.cxt.config.blockModifiers as any;
            default: return debug.never(type);
        }
    }

    #reparse(nodes: (BlockEntity | InlineEntity)[], depth: number): boolean {
        if (depth > this.cxt.config.kernel.reparseDepthLimit)
            return false;
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
        for (const arg of node.arguments.positional)
            this.#expandArgument(arg);

        for (const [_name, arg] of node.arguments.named)
            this.#expandArgument(arg);
    }
    
    #tryAndMessage<Params extends any[]>(
        node: ModifierNode, 
        fn: ((...p: Params) => Message[]) | undefined, ...p: Params
    ) {
        if (!fn) return;

        try {
            this.emit.message(...fn.call(node.mod, ...p));
        } catch (e) {
            this.emit.message(new InternalErrorMessage(node.location, e));
        }
    }
    
    #try<Params extends any[], R>(
        node: ModifierNode, 
        fn: ((...p: Params) => R) | undefined, ...p: Params
    ) {
        if (!fn) return;

        try {
            return fn.call(node.mod, ...p);
        } catch (e) {
            this.emit.message(new InternalErrorMessage(node.location, e));
            return undefined;
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
            this.#tryAndMessage(node, node.mod.beforeParseContent, node as never, this.cxt, immediate);

            if (node.content.length > 0) {
                if (node.mod.delayContentExpansion) this.delayDepth++;
                this.#reparse(node.content, depth);
                if (node.mod.delayContentExpansion) this.delayDepth--;
            }

            this.#tryAndMessage(node, node.mod.afterParseContent, node as never, this.cxt, immediate);
        }

        this.#tryAndMessage(node, node.mod.prepareExpand, node as never, this.cxt, immediate);
        if (node.mod.expand) {
            node.expansion = this.#try(node, 
                node.mod.expand as never, node as never, this.cxt, immediate);

            if (!node.expansion)
                return true;

            debug.trace(`${this.delayDepth > 0 ? 'early ' : ''}expanding:`, node.mod.name);
            if (node.expansion.length > 0)
                debug.trace(() => '-->\n' + debugPrint.node(...node.expansion!));
        }

        this.#tryAndMessage(node, node.mod.beforeProcessExpansion, node as never, this.cxt, immediate);

        debug.trace('reparsing expansion of:', node.mod.name);
        const expansion = node.expansion ?? node.content;
        if (expansion.length == 0) return true;
        let ok = this.#reparse(expansion, depth);

        debug.trace('done reparsing expansion of:', node.mod.name);
        this.#tryAndMessage(node, node.mod.afterProcessExpansion, node as never, this.cxt, immediate);

        if (!ok && depth == 0) {
            const limit = this.cxt.config.kernel.reparseDepthLimit;
            this.emit.message(
                new ReachedRecursionLimitMessage(node.location, limit, node.mod.name));
        }
        return ok;
    }

    parse() {
        this.DOCUMENT();
        return new Document(this.emit.root, this.cxt, this.emit.messages);
    }

    private WHITESPACES() {
        while (this.scanner.acceptWhitespaceChar() !== null) {}
    }

    private WHITESPACES_OR_NEWLINES() {
        while (this.scanner.acceptWhitespaceChar() !== null
            || this.scanner.accept('\n')) {}
    }

    private SHOULD_BE_A_NEWLINE() {
        this.WHITESPACES();
        if (!this.scanner.accept('\n')) this.emit.message(
            new ShouldBeOnNewlineMessage(this.#loc()));
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
            new UnnecessaryNewlineMessage(this.#locFrom(start, end)));
    }

    private DOCUMENT() {
        this.WHITESPACES_OR_NEWLINES();
        while (!this.scanner.isEOF()) {
            this.BLOCK_ENTITY();
            this.WHITESPACES_OR_NEWLINES();
        }

        this.scanner.inspectors().forEach(
            (x) => x.callback(this.cxt, this.scanner.position()));
    }

    private BLOCK_ENTITY() {
        assert(!this.scanner.isEOF());

        this.scanner.inspectors().forEach(
            (x) => x.callback(this.cxt, this.scanner.position()));

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

        this.scanner.inspectors().forEach(
            (x) => x.callback(this.cxt, this.scanner.position()));
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
                if (this.scanner.accept(ESCAPE_CHAR))
                    if (this.scanner.isEOF()) break;
                name += this.scanner.acceptChar();
            }
            this.emit.message(
                new UnknownModifierMessage(this.#locFrom(posStart), name));
        }
        const args = this.ARGUMENTS();
        debug.trace(`PARSE ${NodeType[type]}:`, mod.name);

        const endsign = this.scanner.accept(MODIFIER_END_SIGN);
        const flagMarker = mod.slotType == ModifierSlotType.None;
        if (!this.scanner.accept(MODIFIER_CLOSE_SIGN))
            this.emit.message(
                new ExpectedMessage(this.#loc(), MODIFIER_CLOSE_SIGN));

        const headEnd = this.scanner.position();
        const node: ModifierNode = {
            type, mod: mod as any,
            head: this.#locFrom(posStart, headEnd),
            location: this.#locFrom(posStart, headEnd),
            arguments: args,
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
        let paragraphEnd: number | undefined = undefined;

        let string = '';
        while (!this.scanner.isEOF()) {
            if (this.scanner.accept('\n')) {
                let white = "\n";
                let char: string | null;
                while ((char = this.scanner.acceptWhitespaceChar()) !== null)
                    white += char;
                    
                if (grouped && this.scanner.accept(GROUP_END)) {
                    paragraphEnd = this.scanner.position();
                    if (!this.scanner.isEOF()) {
                        this.SHOULD_BE_A_NEWLINE();
                        this.WARN_IF_MORE_NEWLINES_THAN(1);
                    }
                    break;
                }
                if  (!grouped && this.scanner.accept('\n')) {
                    paragraphEnd = this.scanner.position() - 1;
                    if (!this.scanner.isEOF())
                        this.WARN_IF_MORE_NEWLINES_THAN(0);
                    break;
                }

                if (this.scanner.isEOF()) {
                    if (grouped) this.emit.message(
                        new ExpectedMessage(this.#loc(), GROUP_END));
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
            location: this.#locFrom(posStart, paragraphEnd ?? posContentEnd),
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
                    if (!this.scanner.isEOF()) {
                        this.SHOULD_BE_A_NEWLINE();
                        this.WARN_IF_MORE_NEWLINES_THAN(1);
                    }
                    this.groupDepth--;
                    return;
                }
                this.BLOCK_ENTITY();
                this.WARN_IF_MORE_NEWLINES_THAN(1);
            }
            // EOF
            this.emit.message(
                new ExpectedMessage(this.#loc(), GROUP_END));
        } else {
            this.PARAGRAPH();
        }
    }

    #trimNode(node: ParagraphNode | ModifierNode) {
        if (node.content.length == 0) return;
        let first = node.content[0];
        let last = node.content.at(-1)!;
        if (first.type == NodeType.Text)
            first.content = first.content.trimStart();
        if (last.type == NodeType.Text)
            last.content = last.content.trimEnd();
    }

    private PARAGRAPH() {
        assert(!this.scanner.isEOF());
        const node: ParagraphNode = {
            type: NodeType.Paragraph,
            location: this.#loc(),
            content: []
        };
        // debug.trace('PARSE para');
        this.emit.startInline(node);
        while (!this.scanner.isEOF() && this.INLINE_ENTITY()) {}
        this.emit.endInline();
        const last = node.content.at(-1);
        node.location.actualEnd = last?.location.actualEnd ?? last?.location.end;
        this.#trimNode(node);
        // debug.trace('PARSE para end');
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
                this.emit.message(new ExpectedMessage(this.#loc(), part));
                return false;
            }
            args.push(arg);
        }

        const headEnd = this.scanner.position();
        const node: ModifierNode = {
            type, mod: d.mod as any,
            head: this.#locFrom(posStart, headEnd),
            location: this.#locFrom(posStart, headEnd),
            arguments: {
                positional: args,
                named: new Map()
            },
            content: [],
            expansion: undefined
        };

        const isMarker = node.mod.slotType == ModifierSlotType.None;
        return this.MODIFIER_BODY(type, node, d.postfix, isMarker);
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
            if (!this.scanner.isEOF() && type == NodeType.BlockModifier) {
                this.SHOULD_BE_A_NEWLINE();
                this.WARN_IF_MORE_NEWLINES_THAN(1);
            }
            if (type === NodeType.InlineModifier) this.emit.addInlineNode(node as InlineEntity);
            else this.emit.addBlockNode(node as BlockEntity);
        } else if (type == NodeType.InlineModifier) {
            node = node as InlineModifierNode<unknown>;
            this.emit.startInline(node);
            const pre = node.mod.slotType == ModifierSlotType.Preformatted;
            const entity = pre
                ? this.PREFORMATTED_INLINE_ENTITY.bind(this)
                : this.INLINE_ENTITY.bind(this);
            while (true) {
                if (postfix && this.scanner.accept(postfix)) break;
                if (this.scanner.isEOF() || !(ok = entity())) {
                    // TODO: use error 3
                    if (postfix) this.emit.message(
                        new ExpectedMessage(this.#loc(), postfix));
                    break;
                }
            }
            this.emit.endInline();
            if (!pre && node.content.length > 0) {
                this.#trimNode(node)
            }
        } else /* block or system */ {
            this.emit.startBlock(node as any);
            this.WARN_IF_MORE_NEWLINES_THAN(1);
            if (!this.scanner.isEOF()) {
                if (node.mod.slotType == ModifierSlotType.Preformatted)
                    this.PRE_PARAGRAPH();
                else
                    this.BLOCK_ENTITY();
            }
            this.emit.endBlock();
        }

        const last = node.content.at(-1);
        node.location.actualEnd = last?.location.actualEnd ?? last?.location.end;
        if (node.mod.delayContentExpansion) this.delayDepth--;
        if (node.mod.afterParseContent)
            this.emit.message(...node.mod.afterParseContent(node as any, this.cxt, immediate));
        this.#expand(node);
        return ok;
    }

    // returns false if breaking out of paragraph
    private INLINE_ENTITY(): boolean {
        assert(!this.scanner.isEOF());
        if (this.scanner.peek(MODIFIER_INLINE_OPEN))
            return this.MODIFIER(NodeType.InlineModifier);
        if (this.scanner.peek(MODIFIER_SYSTEM_OPEN))
            return false;
        if (this.scanner.peek(MODIFIER_BLOCK_OPEN)) {
            this.SHOULD_BE_A_NEWLINE();
            return false;
        }

        const short = this.cxt.config.inlineShorthands.find((x) => this.scanner.accept(x.name));
        if (short) return this.SHORTHAND(NodeType.InlineModifier, short);

        if (this.scanner.accept(ESCAPE_CHAR)) {
            if (this.scanner.isEOF()) {
                this.emit.addString(ESCAPE_CHAR);
                return true;
            }
            const start = this.scanner.position();
            const node: EscapedNode = {
                type: NodeType.Escaped,
                content: this.scanner.acceptChar(),
                location: this.#locFrom(start - 1)
            };
            this.emit.addInlineNode(node);
            return true;
        }
        if (this.cxt.config.kernel.collapseWhitespaces
         && this.scanner.acceptWhitespaceChar() !== null)
        {
            this.WHITESPACES();
            this.emit.addString(' ');
            return true;
        }
        return this.PREFORMATTED_INLINE_ENTITY();
    }

    // returns false if breaking out of paragraph
    private PREFORMATTED_INLINE_ENTITY(): boolean {
        assert(!this.scanner.isEOF());
        if (this.scanner.accept('\n')) {
            // these whitespaces in a blank line have no effect
            this.WHITESPACES();
            if  (this.scanner.peek(MODIFIER_BLOCK_OPEN)
             ||  this.scanner.peek(MODIFIER_SYSTEM_OPEN)
             ||  this.cxt.config.blockShorthands.find((x) => this.scanner.peek(x.name))
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
                last.location.end += s.length;
            } else {
                const end = this.scanner.position();
                content.push({
                    type: NodeType.Text, 
                    location: this.#locFrom(end - s.length),
                    content: s
                });
            }
        };

        while (true) {
            if (end && this.scanner.accept(end))
                break;
            if (end === undefined && this.scanner.accept(MODIFIER_ARGUMENT_SEPARATOR))
                break;
            if (close.find((x) => this.scanner.peek(x))
             || this.scanner.isEOF())
            {
                ok = false;
                break;
            }

            if (this.scanner.accept(ESCAPE_CHAR)) {
                // handle escaping
                posEnd = this.scanner.position();
                if (this.scanner.isEOF()) {
                    emitString(ESCAPE_CHAR);
                    ok = false;
                    break;
                }
                content.push({
                    type: NodeType.Escaped,
                    content: this.scanner.acceptChar(),
                    location: this.#locFrom(posEnd - 1)
                } satisfies EscapedNode);
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
                    location: this.#locFrom(beforeInterp)
                });
                if (!ok2) {
                    this.emit.message(new ExpectedMessage(this.#loc(), result.postfix));
                    ok = false;
                    break;
                }
            } else {
                emitString(this.scanner.acceptChar());
                posEnd = this.scanner.position();
            }
        }
        return [{
            location: this.#locFrom(posStart, posEnd),
            content
        }, ok];
    }

    // returns isOk
    private POSSIBLY_NAMED_ARGUMENT(
        args: ModifierArguments
    ): boolean {
        let ok = true;
        const close = [MODIFIER_END_SIGN, MODIFIER_CLOSE_SIGN];
        let content: ArgumentEntity[] = [];
        let posStart = this.scanner.position();
        let posEnd = this.scanner.position();

        let name: { type: 'possible' | 'ok', value: string } | undefined = {
            type: 'possible', value: ''
        };

        const emitString = (s: string) => {
            const last = content.at(-1);
            if (last?.type == NodeType.Text) {
                last.content += s;
                last.location.end += s.length;
            } else {
                const end = this.scanner.position();
                content.push({
                    type: NodeType.Text, 
                    location: this.#locFrom(end - s.length),
                    content: s
                });
            }
        };

        while (true) {
            if (this.scanner.accept(MODIFIER_ARGUMENT_SEPARATOR))
                break;
            if (close.find((x) => this.scanner.peek(x))
             || this.scanner.isEOF())
            {
                ok = false;
                break;
            }

            if (this.scanner.accept(ESCAPE_CHAR)) {
                if (name?.type == 'possible') name = undefined;

                // handle escaping
                posEnd = this.scanner.position();
                if (this.scanner.isEOF()) {
                    emitString(ESCAPE_CHAR);
                    ok = false;
                    break;
                }
                content.push({
                    type: NodeType.Escaped,
                    content: this.scanner.acceptChar(),
                    location: this.#locFrom(posEnd - 1)
                } satisfies EscapedNode);
                continue;
            }

            const beforeInterp = this.scanner.position();
            const result = this.cxt.config.argumentInterpolators.find(
                (x) => this.scanner.accept(x.name));
            if (result !== undefined) {
                if (name?.type == 'possible') name = undefined;

                const [inner, ok2] = this.ARGUMENT_CONTENT(result.postfix);
                posEnd = this.scanner.position();
                content.push({
                    type: NodeType.Interpolation,
                    definition: result, argument: inner,
                    location: this.#locFrom(beforeInterp)
                });
                if (!ok2) {
                    this.emit.message(new ExpectedMessage(this.#loc(), result.postfix));
                    ok = false;
                    break;
                }
            } else {
                const char = this.scanner.acceptChar();
                posEnd = this.scanner.position();

                if (name?.type == 'possible') {
                    if (char == '=') {
                        name.type = 'ok';
                        content = [];
                        continue; // consume '='
                    }

                    if (/[:/]/.test(char))
                        name = undefined;
                    else
                        name.value += char;
                }
                emitString(char);
            }
        }
        const arg: ModifierArgument = {
            location: this.#locFrom(posStart, posEnd),
            content
        };
        if (name?.type == 'ok')
            args.named.set(name.value, arg);
        else
            args.positional.push(arg);
        return ok;
    }

    private ARGUMENTS(): ModifierArguments {
        // optionally accept separator before first argument
        const firstSeparator = this.scanner.accept(MODIFIER_ARGUMENT_SEPARATOR);
        // only eat whites if there isn't a first separator
        if (!firstSeparator) this.WHITESPACES_OR_NEWLINES();

        const args: ModifierArguments = {
            positional: [],
            named: new Map()
        };

        if (this.scanner.peek(MODIFIER_CLOSE_SIGN)
         || this.scanner.peek(MODIFIER_END_SIGN)) return args;

        while (this.POSSIBLY_NAMED_ARGUMENT(args)) {}
        return args;
    }
}