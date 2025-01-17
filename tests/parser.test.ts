import { describe, expect, test } from 'vitest'
import { SimpleScanner } from "../src/front";
import { Parser } from "../src/parser";
import { MessageSeverity, CustomConfiguration, BlockModifier, InlineModifier, ModifierFlags, BlockEntity } from "../src/interface";

const TestConfig = new CustomConfiguration();
TestConfig.addBlock(
    new BlockModifier('normal', ModifierFlags.Normal),
    new BlockModifier('pre', ModifierFlags.Preformatted),
    new BlockModifier('marker', ModifierFlags.Marker)
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

describe('basic syntax', () => {
    test('empty source', () => {
        const doc = parse(``);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toHaveLength(0);
    });
    test('simple paragraphs', () => {
        const doc = parse(`aaa\nbbb\n\nccc\n\nddd`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([
            { type: 'paragraph', content: [{ type: 'text', content: 'aaa\nbbb' }] },
            { type: 'paragraph', content: [{ type: 'text', content: 'ccc' }] },
            { type: 'paragraph', content: [{ type: 'text', content: 'ddd' }] }
        ]);
    });
    test('normal block modifier', () => {
        let doc = parse(`[.normal]abc`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([
            {
                type: 'block', id: 'normal',
                content: [{ type: 'paragraph', content: [{ type: 'text', content: 'abc' }] }]
            }
        ]);
        doc = parse(`   [.normal]   \n   abc\n   def`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([
            {
                type: 'block', id: 'normal',
                content: [{ type: 'paragraph', content: [{ type: 'text', content: 'abc\ndef' }] }]
            }
        ]);
        doc = parse(`[.normal]\nabc\n\ndef`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([
            {
                type: 'block', id: 'normal',
                content: [{ type: 'paragraph', content: [{ type: 'text', content: 'abc' }] }]
            },
            { type: 'paragraph', content: [{ type: 'text', content: 'def' }] }
        ]);
    });
    test('normal groups', () => {
        let doc = parse(`:--\nabc\n\ndef\n--:`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([
            { type: 'paragraph', content: [{ type: 'text', content: 'abc' }] },
            { type: 'paragraph', content: [{ type: 'text', content: 'def' }] }
        ]);
        doc = parse(`[.normal]:--\nabc\n\ndef\n--:`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([
            {
                type: 'block', id: 'normal',
                content: [
                    { type: 'paragraph', content: [{ type: 'text', content: 'abc' }] },
                    { type: 'paragraph', content: [{ type: 'text', content: 'def' }] }
                ]
            },
        ]);
        doc = parse(`   [.normal]   \n   :--\nabc\n--:`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([
            {
                type: 'block', id: 'normal',
                content: [{ type: 'paragraph', content: [{ type: 'text', content: 'abc' }] }]
            },
        ]);
    });
    test('preformatted block modifier', () => {
        let doc = parse(`[.pre]abc`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([
            {
                type: 'block', id: 'pre',
                content: [{ type: 'pre', content: {text: 'abc'} }]
            },
        ]);
        doc = parse(`   [.pre]   \n   abc\n   def`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([
            {
                type: 'block', id: 'pre',
                content: [{ type: 'pre', content: {text: 'abc\n   def'} }]
            },
        ]);
        doc = parse(`[.pre]\nabc\n\ndef`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([
            {
                type: 'block', id: 'pre',
                content: [{ type: 'pre', content: {text: 'abc'} }]
            },
            { type: 'paragraph', content: [{ type: 'text', content: 'def' }] }
        ]);
    });
    test('preformatted groups', () => {
        let doc = parse(`[.pre]:--\n\n\n--:`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([ 
            {
                type: 'block', id: 'pre',
                content: [{ type: 'pre', content: {text: '\n'} }]
            }
        ]);
        doc = parse(`[.pre]:--\nabc\n\ndef\n--:`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([ 
            {
                type: 'block', id: 'pre',
                content: [{ type: 'pre', content: {text: 'abc\n\ndef'} }]
            }
        ]);
        doc = parse(`   [.pre]   \n   :--\n   abc\n--:`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([ 
            {
                type: 'block', id: 'pre',
                content: [{ type: 'pre', content: {text: '   abc'} }]
            }
        ]);
    });
    test('empty block modifier', () => {
        let doc = parse(`[.normal;]abc`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([
            {
                type: 'block', id: 'normal',
                content: []
            },
            { type: 'paragraph', content: [{ type: 'text', content: 'abc' }] },
        ]);
        doc = parse(`[.marker]abc`);
        expect.soft(doc.messages).toMatchObject([
            { severity: MessageSeverity.Error, code: 1 }
        ]);
        expect.soft(doc.root.content).toMatchObject([
            {
                type: 'block', id: 'marker',
                content: []
            },
            { type: 'paragraph', content: [{ type: 'text', content: 'abc' }] },
        ]);
        doc = parse(`[.normal][.pre]`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([
            {
                type: 'block', id: 'normal',
                content: [ {
                    type: 'block', id: 'pre',
                    content: []
                } ]
            }
        ]);
    });
    test('chained block modifiers', () => {
        let doc = parse(`[.normal][.normal][.pre]abc`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([ {
            type: 'block', id: 'normal',
            content: [ {
                type: 'block', id: 'normal',
                content: [ {
                    type: 'block', id: 'pre',
                    content: [{ type: 'pre', content: {text: 'abc'} }]
                } ]
            } ]
        } ]);
        doc = parse(`[.normal][.normal]abc\n[.pre]def`);
        const obj1 = [
            {
                type: 'block', id: 'normal',
                content: [ {
                    type: 'block', id: 'normal',
                    content: [
                        { type: 'paragraph', content: [{ type: 'text', content: 'abc' }] }
                    ]
                } ]
            },
            {
                type: 'block', id: 'pre',
                content: [{ type: 'pre', content: {text: 'def'} }]
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
            type: 'paragraph',
            content: [ {
                type: 'inline', id: 'normal',
                content: [{type: 'text', content: ' abc '}]
            } ]
        } ]);
        doc = parse(`[/normal]abc[/normal]def[;][;]`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([ {
            type: 'paragraph',
            content: [ {
                type: 'inline', id: 'normal',
                content: [
                    {type: 'text', content: 'abc'},
                    {
                        type: 'inline', id: 'normal',
                        content: [{type: 'text', content: 'def'}]
                    }
                ]
            } ]
        } ]);
    });
    test('preformatted inline modifier', () => {
        let doc = parse(`[/pre] abc [;]`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([ {
            type: 'paragraph',
            content: [ {
                type: 'inline', id: 'pre',
                content: [{type: 'text', content: ' abc '}]
            } ]
        } ]);
        doc = parse(`[/pre][/normal;]ha[;]`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([ {
            type: 'paragraph',
            content: [ {
                type: 'inline', id: 'pre',
                content: [{type: 'text', content: '[/normal;]ha'}]
            } ]
        } ]);
        doc = parse(`[/normal]abc[/pre][/normal;]ha[;][;]`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([ {
            type: 'paragraph',
            content: [ {
                type: 'inline', id: 'normal',
                content: [
                    {type: 'text', content: 'abc'},
                    {
                        type: 'inline', id: 'pre',
                        content: [{type: 'text', content: '[/normal;]ha'}]
                    }
                ]
            } ]
        } ]);
    });
    test('empty inline modifier', () => {
        let doc = parse(`[/normal;][/pre;][/marker;]`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([ {
            type: 'paragraph',
            content: [ 
                {
                    type: 'inline', id: 'normal',
                    content: []
                },{
                    type: 'inline', id: 'pre',
                    content: []
                },{
                    type: 'inline', id: 'marker',
                    content: []
                }
            ]
        } ]);
        doc = parse(`[/marker]`);
        expect.soft(doc.messages).toMatchObject([
            { severity: MessageSeverity.Error, code: 1 }
        ]);
        expect.soft(doc.root.content).toMatchObject([ {
            type: 'paragraph',
            content: [ {
                type: 'inline', id: 'marker',
                content: []
            } ]
        } ]);
    });
    test('unknown modifiers', () => {
        let doc = parse(`[.invalid]aaa[/invalid]bbb[;]ccc`);
        expect.soft(doc.messages).toMatchObject([
            { severity: MessageSeverity.Error, code: 2 },
            { severity: MessageSeverity.Error, code: 2 }
        ]);
        expect.soft(doc.root.content).toMatchObject([
            {
                type: 'block', id: 'UNKNOWN',
                content: [ { 
                    type: 'paragraph', 
                    content: [
                        {type: 'text', content: 'aaa'},
                        {
                            type: 'inline', id: 'UNKNOWN',
                            content: [{type: 'text', content: 'bbb'}]
                        },
                        {type: 'text', content: 'ccc'},
                    ]
                } ]
            }
        ]);
    });
    test('warnings - extra newlines', () => {
        let doc = parse(`aaa\nbbb\n\n\nccc\n\nddd`);
        expect.soft(doc.messages).toMatchObject([
            { severity: MessageSeverity.Warning, code: 1 }
        ]);
        expect.soft(doc.root.content).toMatchObject([
            { type: 'paragraph', content: [{ type: 'text', content: 'aaa\nbbb' }] },
            { type: 'paragraph', content: [{ type: 'text', content: 'ccc' }] },
            { type: 'paragraph', content: [{ type: 'text', content: 'ddd' }] }
        ]);
        doc = parse(`[.normal]\n\nabc`);
        expect.soft(doc.messages).toMatchObject([
            { severity: MessageSeverity.Warning, code: 1 }
        ]);
        expect.soft(doc.root.content).toMatchObject([
            {
                type: 'block', id: 'normal',
                content: [{ type: 'paragraph', content: [{ type: 'text', content: 'abc' }] }]
            }
        ]);
        doc = parse(`[.pre]\n\nabc`);
        expect.soft(doc.messages).toMatchObject([
            { severity: MessageSeverity.Warning, code: 1 }
        ]);
        expect.soft(doc.root.content).toMatchObject([
            {
                type: 'block', id: 'pre',
                content: [{ type: 'pre', content: {text: 'abc'} }]
            }
        ]);
    });
    test('warnings - should be newlines', () => {
        let doc = parse(`:--abc\n--:`);
        expect.soft(doc.messages).toMatchObject([
            { severity: MessageSeverity.Warning, code: 3 }
        ]);
        expect.soft(doc.root.content).toMatchObject([
            { type: 'paragraph', content: [{ type: 'text', content: 'abc' }] }
        ]);
        doc = parse(`[.pre]:--abc\n--:`);
        expect.soft(doc.messages).toMatchObject([
            { severity: MessageSeverity.Warning, code: 3 }
        ]);
        expect.soft(doc.root.content).toMatchObject([
            {
                type: 'block', id: 'pre',
                content: [{ type: 'pre', content: {text: 'abc'} }]
            },
        ]);
        doc = parse(`[.normal]abc[.normal]def`);
        expect.soft(doc.messages).toMatchObject([
            { severity: MessageSeverity.Warning, code: 2 }
        ]);
        expect.soft(doc.root.content).toMatchObject([
            {
                type: 'block', id: 'normal',
                content: [{ type: 'paragraph', content: [{ type: 'text', content: 'abc' }] }]
            },
            {
                type: 'block', id: 'normal',
                content: [{ type: 'paragraph', content: [{ type: 'text', content: 'def' }] }]
            }
        ]);
    });
});