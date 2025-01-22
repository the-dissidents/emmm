import { describe, expect, test } from "vitest";
import { BasicConfiguration } from "../src/default";
import { SimpleScanner } from "../src/front";
import * as Parser from "../src/parser";
import { stripDocument } from "../src/util";
import { BlockModifierDefinition, CustomConfiguration, MessageSeverity, ModifierFlags } from "../src/interface";
import { debug, DebugLevel } from "../src/debug";

const TestConfig = new CustomConfiguration(BasicConfiguration);
TestConfig.addBlock(
    new BlockModifierDefinition('normal', ModifierFlags.Normal)
);

function parse(src: string) {
    const config = new CustomConfiguration(TestConfig);
    let doc = Parser.parse(new SimpleScanner(src), config);
    stripDocument(doc);
    return doc;
}
debug.level = DebugLevel.Warning;

describe('[-define-block]', () => {
    test('literal and empty', () => {
        let doc = parse(`[-define-block p]abc\n[.p]`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: 'paragraph', content: [{ type: 'text', content: 'abc' }] }
        ]);
        doc = parse(`[-define-block p;]\n[.p]`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([]);
    });
    test('slots: simple', () => {
        let doc = parse(`[-define-block p][.slot]\n[.p]abc\n[.p]def`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: 'paragraph', content: [{ type: 'text', content: 'abc' }] },
            { type: 'paragraph', content: [{ type: 'text', content: 'def' }] }
        ]);
    });
    test('slots: multiple instantiations', () => {
        let doc = parse(`[-define-block p]\n:--\n[-var x:0][.slot][-var x:1][.slot]\n--:\n[.p][/$x]`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: 'paragraph', content: [{ type: 'text', content: '0' }] },
            { type: 'paragraph', content: [{ type: 'text', content: '1' }] }
        ]);
    });
    test('slots: reference in separate scopes', () => {
        let doc = parse(`[-define-block p]\n:--\na\n[.slot]\n--:\n[-define-block q][.p]\n:--\nb\n[.slot]\n--:\n[.q]c`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: 'paragraph', content: [{ type: 'text', content: 'a' }] },
            { type: 'paragraph', content: [{ type: 'text', content: 'b' }] },
            { type: 'paragraph', content: [{ type: 'text', content: 'c' }] }
        ]);
    });
    test('slots: unnamed reference in nested scopes', () => {
        let doc = parse(`[-define-block p]\n:--\n[.slot][-define-block q][.slot]\n--:\n[.p]abc\n[.q]def`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: 'paragraph', content: [{ type: 'text', content: 'abc' }] },
            { type: 'paragraph', content: [{ type: 'text', content: 'def' }] }
        ]);
    });
    test('slots: named reference in nested scopes', () => {
        let doc = parse(`[-define-block p:(0)]\n[-define-block q:(1)]\n:--\n[.slot 0][.slot 1]\n--:\n[.p]abc\n[.q]def`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: 'paragraph', content: [{ type: 'text', content: 'abc' }] },
            { type: 'paragraph', content: [{ type: 'text', content: 'def' }] }
        ]);
    });
    test('arguments: simple', () => {
        let doc = parse(`[-define-block p:arg1:arg2][/$arg1][/$arg2]\n\n[.p:abc:def;]`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: 'paragraph', content: [
                { type: 'text', content: 'abc' },
                { type: 'text', content: 'def' }
            ] }
        ]);
    });
    test('arguments: shadows variable', () => {
        let doc = parse(`[-define-block p:x][/$x]\n\n[-var x:0][.p:1]`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: 'paragraph', content: [
                { type: 'text', content: '1' }
            ] }
        ]);
        doc = parse(`[-define-block p:x]\n:--\n[.slot][/$x]\n--:\n[-var x:0][.p:1][/$x]`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: 'paragraph', content: [{ type: 'text', content: '0' }] },
            { type: 'paragraph', content: [{ type: 'text', content: '1' }] }
        ]);
    });
    test('arguments: no reference in user scope', () => {
        let doc = parse(`[-define-block p:x]\n:--\n[.slot][/$x]\n--:\n[.p:1][/$x]`);
        expect.soft(doc.messages).toMatchObject([
            { code: 5, severity: MessageSeverity.Warning }
        ]);
        expect.soft(doc.root.content).toMatchObject([
            { type: 'paragraph', content: [] },
            { type: 'paragraph', content: [{ type: 'text', content: '1' }] }
        ]);
    });
    test('arguments: reference in separate scopes', () => {
        let doc = parse(`[-define-block p:x][/$x]\n\n[-define-block q:x]\n:--\n[.p 0;][/$x]\n--:\n[.q:1]`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: 'paragraph', content: [{ type: 'text', content: '0' }] },
            { type: 'paragraph', content: [{ type: 'text', content: '1' }] }
        ]);
    });
    test('arguments: reference in nested scopes', () => {
        let doc = parse(`[-define-block p:x][-define-block q:x][/$x]\n\n[.p:0;][.q:1]`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            { type: 'paragraph', content: [{ type: 'text', content: '1' }] }
        ]);
    });
    test('error - invalid slot names', () => {
        let doc = parse(`[-define-block p]\n[.slot 0]\n[.p]abc`);
        expect.soft(doc.messages).toMatchObject([
            { severity: MessageSeverity.Error, code: 6 }
        ]);
        expect.soft(doc.root.content).toMatchObject([]);
        doc = parse(`[-define-block p:(0)][.slot 0]\n[.p][-define-block q][.slot 0]\n[.q]`);
        expect.soft(doc.messages).toMatchObject([
            { severity: MessageSeverity.Error, code: 6 }
        ]);
        expect.soft(doc.root.content).toMatchObject([]);
    });
    test('error - slot outside definition', () => {
        let doc = parse(`[.normal][.slot]`);
        expect.soft(doc.messages).toMatchObject([
            {severity: MessageSeverity.Error, code: 9}
        ]);
        expect.soft(doc.root.content).toMatchObject([ {
            type: 'block', mod: {name: 'normal'},
            content: []
        } ]);
        doc = parse(`[-define-block p]\n[.slot]\n[.p][.slot]`);
        expect.soft(doc.messages).toMatchObject([
            {severity: MessageSeverity.Error, code: 9}
        ]);
        expect.soft(doc.root.content).toMatchObject([]);
    });
    test('warning - redefiniton', () => {
        let doc = parse(`[-define-block p]abc\n[-define-block p]def\n[.p]`);
        expect.soft(doc.messages).toMatchObject([
            {severity: MessageSeverity.Warning, code: 4}
        ]);
        expect.soft(doc.root.content).toMatchObject([
            { type: 'paragraph', content: [{ type: 'text', content: 'def' }] }
        ]);
    });
});