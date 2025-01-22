import { describe, expect, test } from 'vitest'
import { SimpleScanner } from "../src/front";
import * as Parser from "../src/parser";
import { MessageSeverity, Configuration, BlockModifierDefinition, InlineModifierDefinition, ModifierFlags, BlockEntity, NodeType } from "../src/interface";

const TestConfig = new Configuration();
TestConfig.blockModifiers.add(
    new BlockModifierDefinition('normal', ModifierFlags.Normal),
    new BlockModifierDefinition('pre', ModifierFlags.Preformatted),
    new BlockModifierDefinition('marker', ModifierFlags.Marker)
);
TestConfig.inlineModifiers.add(
    new InlineModifierDefinition('normal', ModifierFlags.Normal),
    new InlineModifierDefinition('pre', ModifierFlags.Preformatted),
    new InlineModifierDefinition('marker', ModifierFlags.Marker)
);

function parse(src: string) {
    return Parser.parse(new SimpleScanner(src), TestConfig);
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
            { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: 'aaa\nbbb' }] },
            { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: 'ccc' }] },
            { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: 'ddd' }] }
        ]);
    });
    test('normal block modifier', () => {
        let doc = parse(`[.normal]abc`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([
            {
                type: NodeType.BlockModifier, mod: {name: 'normal'},
                content: [{ type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: 'abc' }] }]
            }
        ]);
        doc = parse(`   [.normal]   \n   abc\n   def`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([
            {
                type: NodeType.BlockModifier, mod: {name: 'normal'},
                content: [{ type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: 'abc\ndef' }] }]
            }
        ]);
        doc = parse(`[.normal]\nabc\n\ndef`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([
            {
                type: NodeType.BlockModifier, mod: {name: 'normal'},
                content: [{ type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: 'abc' }] }]
            },
            { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: 'def' }] }
        ]);
    });
    test('normal groups', () => {
        let doc = parse(`:--\nabc\n\ndef\n--:`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: 'abc' }] },
            { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: 'def' }] }
        ]);
        doc = parse(`[.normal]:--\nabc\n\ndef\n--:`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([
            {
                type: NodeType.BlockModifier, mod: {name: 'normal'},
                content: [
                    { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: 'abc' }] },
                    { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: 'def' }] }
                ]
            },
        ]);
        doc = parse(`   [.normal]   \n   :--\nabc\n--:`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([
            {
                type: NodeType.BlockModifier, mod: {name: 'normal'},
                content: [{ type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: 'abc' }] }]
            },
        ]);
    });
    test('preformatted block modifier', () => {
        let doc = parse(`[.pre]abc`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([
            {
                type: NodeType.BlockModifier, mod: {name: 'pre'},
                content: [{ type: NodeType.Preformatted, content: {text: 'abc'} }]
            },
        ]);
        doc = parse(`   [.pre]   \n   abc\n   def`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([
            {
                type: NodeType.BlockModifier, mod: {name: 'pre'},
                content: [{ type: NodeType.Preformatted, content: {text: 'abc\n   def'} }]
            },
        ]);
        doc = parse(`[.pre]\nabc\n\ndef`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([
            {
                type: NodeType.BlockModifier, mod: {name: 'pre'},
                content: [{ type: NodeType.Preformatted, content: {text: 'abc'} }]
            },
            { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: 'def' }] }
        ]);
    });
    test('preformatted groups', () => {
        let doc = parse(`[.pre]:--\n\n\n--:`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([ 
            {
                type: NodeType.BlockModifier, mod: {name: 'pre'},
                content: [{ type: NodeType.Preformatted, content: {text: '\n'} }]
            }
        ]);
        doc = parse(`[.pre]:--\nabc\n\ndef\n--:`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([ 
            {
                type: NodeType.BlockModifier, mod: {name: 'pre'},
                content: [{ type: NodeType.Preformatted, content: {text: 'abc\n\ndef'} }]
            }
        ]);
        doc = parse(`   [.pre]   \n   :--\n   abc\n--:`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([ 
            {
                type: NodeType.BlockModifier, mod: {name: 'pre'},
                content: [{ type: NodeType.Preformatted, content: {text: '   abc'} }]
            }
        ]);
    });
    test('empty block modifier', () => {
        let doc = parse(`[.normal;]abc`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([
            {
                type: NodeType.BlockModifier, mod: {name: 'normal'},
                content: []
            },
            { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: 'abc' }] },
        ]);
        doc = parse(`[.marker]abc`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([
            {
                type: NodeType.BlockModifier, mod: {name: 'marker'},
                content: []
            },
            { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: 'abc' }] },
        ]);
        doc = parse(`[.normal][.pre]`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([
            {
                type: NodeType.BlockModifier, mod: {name: 'normal'},
                content: [ {
                    type: NodeType.BlockModifier, mod: {name: 'pre'},
                    content: []
                } ]
            }
        ]);
    });
    test('chained block modifiers', () => {
        let doc = parse(`[.normal][.normal][.pre]abc`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([ {
            type: NodeType.BlockModifier, mod: {name: 'normal'},
            content: [ {
                type: NodeType.BlockModifier, mod: {name: 'normal'},
                content: [ {
                    type: NodeType.BlockModifier, mod: {name: 'pre'},
                    content: [{ type: NodeType.Preformatted, content: {text: 'abc'} }]
                } ]
            } ]
        } ]);
        doc = parse(`[.normal][.normal]abc\n[.pre]def`);
        const obj1 = [
            {
                type: NodeType.BlockModifier, mod: {name: 'normal'},
                content: [ {
                    type: NodeType.BlockModifier, mod: {name: 'normal'},
                    content: [
                        { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: 'abc' }] }
                    ]
                } ]
            },
            {
                type: NodeType.BlockModifier, mod: {name: 'pre'},
                content: [{ type: NodeType.Preformatted, content: {text: 'def'} }]
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
            type: NodeType.Paragraph,
            content: [ {
                type: NodeType.InlineModifier, mod: {name: 'normal'},
                content: [{type: NodeType.Text, content: ' abc '}]
            } ]
        } ]);
        doc = parse(`[/normal]abc[/normal]def[;][;]`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([ {
            type: NodeType.Paragraph,
            content: [ {
                type: NodeType.InlineModifier, mod: {name: 'normal'},
                content: [
                    {type: NodeType.Text, content: 'abc'},
                    {
                        type: NodeType.InlineModifier, mod: {name: 'normal'},
                        content: [{type: NodeType.Text, content: 'def'}]
                    }
                ]
            } ]
        } ]);
    });
    test('preformatted inline modifier', () => {
        let doc = parse(`[/pre] abc [;]`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([ {
            type: NodeType.Paragraph,
            content: [ {
                type: NodeType.InlineModifier, mod: {name: 'pre'},
                content: [{type: NodeType.Text, content: ' abc '}]
            } ]
        } ]);
        doc = parse(`[/pre][/normal;]ha[;]`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([ {
            type: NodeType.Paragraph,
            content: [ {
                type: NodeType.InlineModifier, mod: {name: 'pre'},
                content: [{type: NodeType.Text, content: '[/normal;]ha'}]
            } ]
        } ]);
        doc = parse(`[/normal]abc[/pre][/normal;]ha[;][;]`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([ {
            type: NodeType.Paragraph,
            content: [ {
                type: NodeType.InlineModifier, mod: {name: 'normal'},
                content: [
                    {type: NodeType.Text, content: 'abc'},
                    {
                        type: NodeType.InlineModifier, mod: {name: 'pre'},
                        content: [{type: NodeType.Text, content: '[/normal;]ha'}]
                    }
                ]
            } ]
        } ]);
    });
    test('empty inline modifier', () => {
        let doc = parse(`[/normal;][/pre;][/marker;]`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([ {
            type: NodeType.Paragraph,
            content: [ 
                {
                    type: NodeType.InlineModifier, mod: {name: 'normal'},
                    content: []
                },{
                    type: NodeType.InlineModifier, mod: {name: 'pre'},
                    content: []
                },{
                    type: NodeType.InlineModifier, mod: {name: 'marker'},
                    content: []
                }
            ]
        } ]);
        doc = parse(`[/marker]`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([ {
            type: NodeType.Paragraph,
            content: [ {
                type: NodeType.InlineModifier, mod: {name: 'marker'},
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
                type: NodeType.BlockModifier, mod: {name: 'UNKNOWN'},
                content: [ { 
                    type: NodeType.Paragraph, 
                    content: [
                        {type: NodeType.Text, content: 'aaa'},
                        {
                            type: NodeType.InlineModifier, mod: {name: 'UNKNOWN'},
                            content: [{type: NodeType.Text, content: 'bbb'}]
                        },
                        {type: NodeType.Text, content: 'ccc'},
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
            { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: 'aaa\nbbb' }] },
            { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: 'ccc' }] },
            { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: 'ddd' }] }
        ]);
        doc = parse(`[.normal]\n\nabc`);
        expect.soft(doc.messages).toMatchObject([
            { severity: MessageSeverity.Warning, code: 1 }
        ]);
        expect.soft(doc.root.content).toMatchObject([
            {
                type: NodeType.BlockModifier, mod: {name: 'normal'},
                content: [{ type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: 'abc' }] }]
            }
        ]);
        doc = parse(`[.pre]\n\nabc`);
        expect.soft(doc.messages).toMatchObject([
            { severity: MessageSeverity.Warning, code: 1 }
        ]);
        expect.soft(doc.root.content).toMatchObject([
            {
                type: NodeType.BlockModifier, mod: {name: 'pre'},
                content: [{ type: NodeType.Preformatted, content: {text: 'abc'} }]
            }
        ]);
    });
    test('warnings - should be newlines', () => {
        let doc = parse(`:--abc\n--:`);
        expect.soft(doc.messages).toMatchObject([
            { severity: MessageSeverity.Warning, code: 3 }
        ]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: 'abc' }] }
        ]);
        doc = parse(`[.pre]:--abc\n--:`);
        expect.soft(doc.messages).toMatchObject([
            { severity: MessageSeverity.Warning, code: 3 }
        ]);
        expect.soft(doc.root.content).toMatchObject([
            {
                type: NodeType.BlockModifier, mod: {name: 'pre'},
                content: [{ type: NodeType.Preformatted, content: {text: 'abc'} }]
            },
        ]);
        doc = parse(`[.normal]abc[.normal]def`);
        expect.soft(doc.messages).toMatchObject([
            { severity: MessageSeverity.Warning, code: 2 }
        ]);
        expect.soft(doc.root.content).toMatchObject([
            {
                type: NodeType.BlockModifier, mod: {name: 'normal'},
                content: [{ type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: 'abc' }] }]
            },
            {
                type: NodeType.BlockModifier, mod: {name: 'normal'},
                content: [{ type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: 'def' }] }]
            }
        ]);
    });
    // TODO: arguments
});