import { describe, expect, test } from 'vitest'
import { SimpleScanner } from "../src/front";
import { Parser } from "../src/parser";
import { MessageSeverity, CustomConfiguration, BlockModifier, InlineModifier, ModifierFlags } from "../src/interface";

const TestConfig = new CustomConfiguration();
TestConfig.addBlock(
    new BlockModifier('normal', ModifierFlags.Normal),
    new BlockModifier('pre', ModifierFlags.Preformatted)
);
TestConfig.addInline(
    new InlineModifier('normal', ModifierFlags.Normal),
    new InlineModifier('pre', ModifierFlags.Preformatted),
    new InlineModifier('marker', ModifierFlags.Marker)
);

function parse(src: string) {
    let p = new Parser(new SimpleScanner(src), TestConfig);
    return p.parse();
}

describe('parser', () => {
    test('empty source', () => {
        const doc = parse(``);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toHaveLength(0);
    });
    test('simple paragraphs', () => {
        const doc = parse(`aaa\nbbb\n\nccc\n\nddd`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([
            { name: 'paragraph', content: ['aaa\nbbb'] },
            { name: 'paragraph', content: ['ccc'] },
            { name: 'paragraph', content: ['ddd'] }
        ]);
    });
    test('normal block modifier', () => {
        let doc = parse(`[.normal]abc`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([
            {
                name: 'block',
                attributes: new Map<string, string>([['type', 'normal']]),
                content: [{ name: 'paragraph', content: ['abc'] }]
            }
        ]);
        doc = parse(`   [.normal]   \n   abc\n   def`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([
            {
                name: 'block',
                attributes: new Map<string, string>([['type', 'normal']]),
                content: [{ name: 'paragraph', content: ['abc\ndef'] }]
            }
        ]);
        doc = parse(`[.normal]\nabc\n\ndef`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([
            {
                name: 'block',
                attributes: new Map<string, string>([['type', 'normal']]),
                content: [{ name: 'paragraph', content: ['abc'] }]
            },
            { name: 'paragraph', content: ['def'] }
        ]);
    });
    test('normal groups', () => {
        let doc = parse(`:--\nabc\n\ndef\n--:`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([
            { name: 'paragraph', content: ['abc'] },
            { name: 'paragraph', content: ['def'] }
        ]);
        doc = parse(`[.normal]:--\nabc\n\ndef\n--:`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([
            {
                name: 'block',
                attributes: new Map<string, string>([['type', 'normal']]),
                content: [
                    { name: 'paragraph', content: ['abc'] },
                    { name: 'paragraph', content: ['def'] }
                ]
            }
        ]);
        doc = parse(`   [.normal]   \n   :--\nabc\n--:`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([
            {
                name: 'block',
                attributes: new Map<string, string>([['type', 'normal']]),
                content: [{ name: 'paragraph', content: ['abc'] }]
            }
        ]);
    });
    test('preformatted block modifier', () => {
        let doc = parse(`[.pre]abc`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([
            {
                name: 'block',
                attributes: new Map<string, string>([['type', 'pre']]),
                content: [{ name: 'pre', content: ['abc'] }]
            }
        ]);
        doc = parse(`   [.pre]   \n   abc\n   def`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([
            {
                name: 'block',
                attributes: new Map<string, string>([['type', 'pre']]),
                content: [{ name: 'pre', content: ['abc\n   def'] }]
            }
        ]);
        doc = parse(`[.pre]\nabc\n\ndef`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([
            {
                name: 'block',
                attributes: new Map<string, string>([['type', 'pre']]),
                content: [{ name: 'pre', content: ['abc'] }]
            },
            { name: 'paragraph', content: ['def'] }
        ]);
    });
    test('preformatted groups', () => {
        let doc = parse(`[.pre]:--\n\n\n--:`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([
            {
                name: 'block',
                attributes: new Map<string, string>([['type', 'pre']]),
                content: [
                    { name: 'pre', content: ['\n'] }
                ]
            }
        ]);
        doc = parse(`[.pre]:--\nabc\n\ndef\n--:`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([
            {
                name: 'block',
                attributes: new Map<string, string>([['type', 'pre']]),
                content: [
                    { name: 'pre', content: ['abc\n\ndef'] }
                ]
            }
        ]);
        doc = parse(`   [.pre]   \n   :--\n   abc\n--:`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([
            {
                name: 'block',
                attributes: new Map<string, string>([['type', 'pre']]),
                content: [{ name: 'pre', content: ['   abc'] }]
            }
        ]);
    });
    test('chained block modifiers', () => {
        let doc = parse(`[.normal][.normal][.pre]abc`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([ {
            name: 'block',
            attributes: new Map<string, string>([['type', 'normal']]),
            content: [ {
                name: 'block',
                attributes: new Map<string, string>([['type', 'normal']]),
                content: [ {
                    name: 'block',
                    attributes: new Map<string, string>([['type', 'pre']]),
                    content: [{ name: 'pre', content: ['abc'] }]
                } ]
            } ]
        } ]);
        doc = parse(`[.normal][.normal]abc\n[.pre]def`);
        const obj1 = [
            {
                name: 'block',
                attributes: new Map<string, string>([['type', 'normal']]),
                content: [ {
                    name: 'block',
                    attributes: new Map<string, string>([['type', 'normal']]),
                    content: [ { name: 'paragraph', content: ['abc'] } ]
                } ]
            },
            {
                name: 'block',
                attributes: new Map<string, string>([['type', 'pre']]),
                content: [ { name: 'pre', content: ['def'] } ]
            }
        ];
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject(obj1);
        doc = parse(`[.normal][.normal]abc[.pre]def`);
        expect.soft(doc.messages).toMatchObject([
            { severity: MessageSeverity.Warning, code: 2 }
        ]);
        expect.soft(doc.root.content).toMatchObject(obj1);
    });
    test('normal inline modifier', () => {
        let doc = parse(`[/normal] abc [;]`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([ {
            name: 'paragraph',
            content: [ {
                name: 'inline',
                attributes: new Map<string, string>([['type', 'normal']]),
                content: [' abc ']
            } ]
        } ]);
        doc = parse(`[/normal]abc[/normal]def[;][;]`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([ {
            name: 'paragraph',
            content: [ {
                name: 'inline',
                attributes: new Map<string, string>([['type', 'normal']]),
                content: [
                    'abc',
                    {
                        name: 'inline',
                        attributes: new Map<string, string>([['type', 'normal']]),
                        content: ['def']
                    }
                ]
            } ]
        } ]);
    });
    test('preformatted inline modifier', () => {
        let doc = parse(`[/pre] abc [;]`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([ {
            name: 'paragraph',
            content: [ {
                name: 'inline',
                attributes: new Map<string, string>([['type', 'pre']]),
                content: [' abc ']
            } ]
        } ]);
        doc = parse(`[/pre][/normal;]ha[;]`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([ {
            name: 'paragraph',
            content: [ {
                name: 'inline',
                attributes: new Map<string, string>([['type', 'pre']]),
                content: ['[/normal;]ha']
            } ]
        } ]);
        doc = parse(`[/normal]abc[/pre][/normal;]ha[;][;]`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([ {
            name: 'paragraph',
            content: [ {
                name: 'inline',
                attributes: new Map<string, string>([['type', 'normal']]),
                content: [
                    'abc',
                    {
                        name: 'inline',
                        attributes: new Map<string, string>([['type', 'pre']]),
                        content: ['[/normal;]ha']
                    }
                ]
            } ]
        } ]);
    });
    test('empty inline modifier', () => {
        let doc = parse(`[/normal;][/pre;][/marker;]`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([ {
            name: 'paragraph',
            content: [ 
                {
                    name: 'inline',
                    attributes: new Map<string, string>([['type', 'normal']]),
                    content: []
                },{
                    name: 'inline',
                    attributes: new Map<string, string>([['type', 'pre']]),
                    content: []
                },{
                    name: 'inline',
                    attributes: new Map<string, string>([['type', 'marker']]),
                    content: []
                }
            ]
        } ]);
        doc = parse(`[/marker]`);
        expect.soft(doc.messages).toMatchObject([
            { severity: MessageSeverity.Error, code: 1 }
        ]);
        expect.soft(doc.root.content).toMatchObject([ {
            name: 'paragraph',
            content: [ {
                name: 'inline',
                attributes: new Map<string, string>([['type', 'marker']]),
                content: []
            } ]
        } ]);
    });
    test('extra newlines', () => {
        let doc = parse(`aaa\nbbb\n\n\nccc\n\nddd`);
        expect.soft(doc.messages).toMatchObject([
            { severity: MessageSeverity.Warning, code: 1 }
        ]);
        expect.soft(doc.root.content).toMatchObject([
            { name: 'paragraph', content: ['aaa\nbbb'] },
            { name: 'paragraph', content: ['ccc'] },
            { name: 'paragraph', content: ['ddd'] }
        ]);
        doc = parse(`[.normal]\n\nabc`);
        expect.soft(doc.messages).toMatchObject([
            { severity: MessageSeverity.Warning, code: 1 }
        ]);
        expect.soft(doc.root.content).toMatchObject([
            {
                name: 'block',
                attributes: new Map<string, string>([['type', 'normal']]),
                content: [{ name: 'paragraph', content: ['abc'] }]
            }
        ]);
        doc = parse(`[.pre]\n\nabc`);
        expect.soft(doc.messages).toMatchObject([
            { severity: MessageSeverity.Warning, code: 1 }
        ]);
        expect.soft(doc.root.content).toMatchObject([
            {
                name: 'block',
                attributes: new Map<string, string>([['type', 'pre']]),
                content: [{ name: 'pre', content: ['abc'] }]
            }
        ]);
    });
    test('unknown modifiers', () => {
        let doc = parse(`[.invalid]aaa[/invalid]bbb[;]ccc`);
        expect.soft(doc.messages).toMatchObject([
            { severity: MessageSeverity.Error, code: 2 },
            { severity: MessageSeverity.Error, code: 2 }
        ]);
        expect.soft(doc.root.content).toMatchObject([
            {
                name: 'block',
                attributes: new Map<string, string>([['type', 'UNKNOWN']]),
                content: [ { 
                    name: 'paragraph', 
                    content: [
                        'aaa',
                        {
                            name: 'inline',
                            attributes: new Map<string, string>([['type', 'UNKNOWN']]),
                            content: ['bbb']
                        },
                        'ccc'
                    ]
                } ]
            }
        ]);
    });
});