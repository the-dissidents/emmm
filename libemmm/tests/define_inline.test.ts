import { describe, expect, test } from "vitest";
import { BuiltinConfiguration } from "../src/builtin/builtin";
import { SimpleScanner } from "../src/front";
import * as Parser from "../src/parser";
import { BlockModifierDefinition, Configuration, MessageSeverity, ModifierFlags, NodeType } from "../src/interface";
import { debug, DebugLevel } from "../src/debug";

const TestConfig = new Configuration(BuiltinConfiguration);
TestConfig.blockModifiers.add(
    new BlockModifierDefinition('normal', ModifierFlags.Normal)
);

function parse(src: string) {
    const config = new Configuration(TestConfig);
    let doc = Parser.parse(new SimpleScanner(src), config).toStripped();
    return doc;
}
debug.level = DebugLevel.Warning;

describe('[-define-inline]', () => {
    test('literal and empty', () => {
        let doc = parse(`[-define-inline p]abc\n\n[/p;]`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: 'abc' }] }
        ]);
        doc = parse(`[-define-inline p;]\n\n[/p;]`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [] }
        ]);
    });
    test('slots: simple', () => {
        let doc = parse(`[-define-inline p][/slot]\n\n[/p]abc[;][/p]def[;]`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [
                { type: NodeType.Text, content: 'abc' },
                { type: NodeType.Text, content: 'def' }
            ] },
        ]);
    });
    test('slots: multiple instantiations', () => {
        let doc = parse(`[-define-inline p]\n:--\n[-var x:0][/slot][-var x:1][/slot]\n--:\n[/p][/$x][;]`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [
                { type: NodeType.Text, content: '0' },
                { type: NodeType.Text, content: '1' }
            ] },
        ]);
    });
    test('slots: reference in separate scopes', () => {
        let doc = parse(`[-define-inline p]a[/slot]\n\n[-define-inline q][/p]b[/slot][;]\n\n[/q]c[;]`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [
                { type: NodeType.Text, content: 'a' },
                { type: NodeType.Text, content: 'b' },
                { type: NodeType.Text, content: 'c' }
            ] },
        ]);
    });
    test('slots: unnamed reference in nested scopes', () => {
        let doc = parse(`[-define-inline p]\n:--\n[/slot][-define-inline q][/slot]\n--:\n[/p]abc[;][/q]def[;]`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [
                { type: NodeType.Text, content: 'abc' },
                { type: NodeType.Text, content: 'def' }
            ] },
        ]);
    });
    test('slots: named reference in nested scopes', () => {
        let doc = parse(`[-define-inline p:(0)]\n[-define-inline q:(1)]\n:--\n[/slot 0][/slot 1]\n--:\n[/p]abc[;][/q]def[;]`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [
                { type: NodeType.Text, content: 'abc' },
                { type: NodeType.Text, content: 'def' }
            ] },
        ]);
    });
    test('arguments: simple', () => {
        let doc = parse(`[-define-inline p:arg1:arg2][/$arg1][/$arg2]\n\n[/p:abc:def;]`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [
                { type: NodeType.Text, content: 'abc' },
                { type: NodeType.Text, content: 'def' }
            ] }
        ]);
    });
    test('arguments: shadows variable', () => {
        let doc = parse(`[-define-inline p:x][/$x]\n\n[-var x:0][/p:1;]`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [
                { type: NodeType.Text, content: '1' }
            ] }
        ]);
        doc = parse(`[-define-inline p:x]\n:--\n[/slot][/$x]\n--:\n[-var x:0][/p:1][/$x][;]`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [
                { type: NodeType.Text, content: '0' },
                { type: NodeType.Text, content: '1' }
            ] }
        ]);
    });
    test('arguments: no reference in user scope (modifier)', () => {
        let doc = parse(`[-define-inline p:x]\n:--\n[/slot][/$x]\n--:\n[/p:1][/$x][;]`);
        expect.soft(doc.messages).toMatchObject([
            { code: 5, severity: MessageSeverity.Warning }
        ]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [
                { type: NodeType.Text, content: '1' }
            ] }
        ]);
    });
    test('arguments: no reference in user scope (interp)', () => {
        let doc = parse(`[-define-inline p:x]\n:--\n[/slot][/print $(x)]\n--:\n[/p:1][/print $(x)][;]`);
        expect.soft(doc.messages).toMatchObject([
            { code: 5, severity: MessageSeverity.Error }
        ]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [
                { type: NodeType.Text, content: '1' }
            ] }
        ]);
    });
    test('arguments: reference in separate scopes (modifier)', () => {
        let doc = parse(`[-define-inline p:x][/$x]\n\n[-define-inline q:x][/p 0;][/$x]\n\n[/q:1;]`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [
                { type: NodeType.Text, content: '0' },
                { type: NodeType.Text, content: '1' }
            ] }
        ]);
    });
    test('arguments: reference in separate scopes (interp)', () => {
        let doc = parse(`[-define-inline p:x][/print $(x)]\n\n[-define-inline q:x][/p 0;][/print $(x)]\n\n[/q:1;]`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [
                { type: NodeType.Text, content: '0' },
                { type: NodeType.Text, content: '1' }
            ] }
        ]);
    });
    test('arguments: reference in nested scopes (modifier)', () => {
        let doc = parse(`[-define-inline p:x][-define-inline q:x][/$x]\n\n[/p:0;][/q:1;]`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: '1' }] }
        ]);
    });
    test('arguments: reference in nested scopes (interp)', () => {
        let doc = parse(`[-define-inline p:x][-define-inline q:x][/print $(x)]\n\n[/p:0;][/q:1;]`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: '1' }] }
        ]);
    });
    test('error - invalid slot names', () => {
        let doc = parse(`[-define-inline p][/slot 0]\n\n[/p]abc[;]`);
        expect.soft(doc.messages).toMatchObject([
            { severity: MessageSeverity.Error, code: 6 }
        ]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [] }
        ]);
        // doc = parse(`[-define-inline p:(0)][/slot 0]\n\n[/p][-define-inline q][/slot 0][;]\n[/q]`);
        // expect.soft(doc.messages).toMatchObject([
        //     { severity: MessageSeverity.Error, code: 6 }
        // ]);
        // expect.soft(doc.root.content).toMatchObject([]);
    });
    test('error - slot outside definition', () => {
        let doc = parse(`[.normal][/slot]`);
        expect.soft(doc.messages).toMatchObject([
            {severity: MessageSeverity.Error, code: 9}
        ]);
        expect.soft(doc.root.content).toMatchObject([ {
            type: NodeType.BlockModifier, mod: {name: 'normal'},
            content: [{ type: NodeType.Paragraph, content: [] }]
        } ]);
        doc = parse(`[-define-inline p][/slot]\n\n[/p][/slot][;]`);
        expect.soft(doc.messages).toMatchObject([
            {severity: MessageSeverity.Error, code: 9}
        ]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [] }
        ]);
    });
    test('warning - redefiniton', () => {
        let doc = parse(`[-define-inline p]abc\n\n[-define-inline p]def\n\n[/p;]`);
        expect.soft(doc.messages).toMatchObject([
            {severity: MessageSeverity.Warning, code: 4}
        ]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: 'def' }] }
        ]);
    });
});

describe('mixed block and inline definitions', () => {
    test('argument reference', () => {
        let doc = parse(`[-define-block p:x]\n:--\n[/$x]\n[.slot]\n[/$x]\n--:\n[-define-inline q:x][/$x]\n\n[.p:0][/q:1;]`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: '0' }] },
            { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: '1' }] },
            { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: '0' }] },
        ]);
    })
})