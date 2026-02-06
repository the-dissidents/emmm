import { describe, expect, test } from "vitest";
import { BuiltinConfiguration, Configuration, DebugLevel, NodeType, ParseContext, SimpleScanner } from "../src";
import { debug } from "../src/debug";

function parse(src: string) {
    const config = Configuration.from(BuiltinConfiguration, false);
    let doc = new ParseContext(config).parse(new SimpleScanner(src)).toStripped();
    return doc;
}
debug.level = DebugLevel.Warning;

describe('misc builtins', () => {
    test('[.raw]', () => {
        let doc = parse(`[.raw][.not-a-block][/not-an-inline]`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Preformatted, content: {
                text: '[.not-a-block][/not-an-inline]'
            } },
        ]);
    });
    test('[.concat] -- simple', () => {
        let doc = parse(`[.concat]<<<\n123\n\n456\n>>>`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [
                { type: NodeType.Text, content: '123' },
                { type: NodeType.Text, content: '456' }
            ] },
        ]);
    });
    test('[.concat] -- separator', () => {
        let doc = parse(`[.concat sep= ]<<<\n123\n\n456\n>>>`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [
                { type: NodeType.Text, content: '123' },
                { type: NodeType.Text, content: ' ' },
                { type: NodeType.Text, content: '456' }
            ] },
        ]);
    });
    test('[.concat] -- expansion', () => {
        let doc = parse(`[-define-block p][.concat]<<<\n123\n[.slot]\n>>>\n\n[.p]abc`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [
                { type: NodeType.Text, content: '123' },
                { type: NodeType.Text, content: 'abc' }
            ] },
        ]);
    });
});
