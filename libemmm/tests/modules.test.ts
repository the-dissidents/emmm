import { describe, expect, test } from "vitest";
import { BuiltinConfiguration } from "../src/builtin/builtin";
import { SimpleScanner } from "../src/front";
import * as Parser from "../src/parser";
import { BlockModifierDefinition, Configuration, MessageSeverity, ModifierFlags, NodeType } from "../src/interface";
import { debug, DebugLevel } from "../src/debug";

const TestConfig = Configuration.from(BuiltinConfiguration);
TestConfig.blockModifiers.add(
    new BlockModifierDefinition('normal', ModifierFlags.Normal)
);

function parse(src: string) {
    const config = Configuration.from(TestConfig);
    let doc = Parser.parse(new SimpleScanner(src), config).toStripped();
    return doc;
}
debug.level = DebugLevel.Warning;

describe('modules', () => {
    test('content scoping: shorthands', () => {
        let doc = parse(`[.module test][-inline-shorthand p] 123\n\np\n[.use test] p\n\np`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: 'p' }] },
            { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: '123' }] },
            { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: 'p' }] }
        ]);
    });
    test('content scoping: modifiers', () => {
        let doc = parse(`[.module test]:--\n[-define-inline p]123\n[-define-block q]456\n--:\n[/p;]\n[.q;]\n[.use test]:--\n[/p;]\n[.q;]\n--:\n[/p;]\n[.q;]`);
        expect.soft(doc.messages).toMatchObject([
            { code: 2, what: 'p' },
            { code: 2, what: 'q' },
            { code: 2, what: 'p' },
            { code: 2, what: 'q' },
        ]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [{ type: NodeType.InlineModifier }] },
            { type: NodeType.BlockModifier },
            { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: '123' }] },
            { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: '456' }] },
            { type: NodeType.Paragraph, content: [{ type: NodeType.InlineModifier }] },
            { type: NodeType.BlockModifier },
        ]);
    });
    test('preserves outer definitions', () => {
        let doc = parse(`[-define-inline p]123\n[-define-block q]456\n[-inline-shorthand r]789\n[.module test][-inline-shorthand s] abc\n\n[/p;]\n[.q;]\nrs\n[.use test]:--\n[/p;]\n[.q;]\nrs\n--:\n[/p;]\n[.q;]\nrs`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: '123' }] },
            { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: '456' }] },
            { type: NodeType.Paragraph, content: [
                { type: NodeType.Text, content: '789' },
                { type: NodeType.Text, content: 's' }
            ] },
            { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: '123' }] },
            { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: '456' }] },
            { type: NodeType.Paragraph, content: [
                { type: NodeType.Text, content: '789' },
                { type: NodeType.Text, content: 'abc' }
            ] },
            { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: '123' }] },
            { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: '456' }] },
            { type: NodeType.Paragraph, content: [
                { type: NodeType.Text, content: '789' },
                { type: NodeType.Text, content: 's' }
            ] },
        ]);
    });
    test('definition merging', () => {
        let doc = parse(`[.module a][-define-inline p]123\n[.use a][/p;]\n[.module a][-inline-shorthand q]456\n[.use a]q[/p;]`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: '123' }] },
            { type: NodeType.Paragraph, content: [
                { type: NodeType.Text, content: '456' },
                { type: NodeType.Text, content: '123' }
            ] },
        ]);
    });
    test('error: nested modules', () => {
        let doc = parse(`[.module a][.module b;]`);
        expect.soft(doc.messages).toMatchObject([
            { code: 10, severity: MessageSeverity.Error }
        ]);
        expect.soft(doc.root.content).toMatchObject([]);
    });
    test('error: use self', () => {
        let doc = parse(`[.module a]123\n[.module a][.use a]456`);
        expect.soft(doc.messages).toMatchObject([
            { code: 11, severity: MessageSeverity.Error }
        ]);
        expect.soft(doc.root.content).toMatchObject([]);
    });
    test('warning: overwrite definitions', () => {
        let doc = parse(`[.module a][-inline-shorthand p]123\n[-inline-shorthand p]456\n[.use a]p`);
        expect.soft(doc.messages).toMatchObject([
            { code: 6, severity: MessageSeverity.Warning }
        ]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: '123' }] }
        ]);
    });
});