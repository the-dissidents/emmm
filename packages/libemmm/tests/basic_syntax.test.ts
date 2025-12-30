import { describe, expect, test } from 'vitest'
import { SimpleScanner } from "../src/scanner";
import { MessageSeverity, NodeType } from "../src/interface";
import { BlockModifierDefinition, InlineModifierDefinition, ModifierSlotType } from "../src/modifier";
import { Configuration, ParseContext } from "../src/parser-config";

const TestConfig = new Configuration();
TestConfig.blockModifiers.add(
    new BlockModifierDefinition('normal', ModifierSlotType.Normal),
    new BlockModifierDefinition('pre', ModifierSlotType.Preformatted),
    new BlockModifierDefinition('marker', ModifierSlotType.None)
);
TestConfig.inlineModifiers.add(
    new InlineModifierDefinition('normal', ModifierSlotType.Normal),
    new InlineModifierDefinition('pre', ModifierSlotType.Preformatted),
    new InlineModifierDefinition('marker', ModifierSlotType.None)
);

function parse(src: string) {
    return new ParseContext(TestConfig).parse(new SimpleScanner(src));
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
    test('escaping', () => {
        let doc = parse(`a\\[.b]\\`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [
                { type: NodeType.Text, content: 'a' },
                { type: NodeType.Escaped, content: '[' },
                { type: NodeType.Text, content: '.b]\\' }
            ] },
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
        doc = parse(`   [.normal]   \n   abc\n   def   `);
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
        let doc = parse(`<<<\nabc\n\ndef\n>>>`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([
            {
                type: NodeType.Group,
                content: [
                    {
                        type: NodeType.Paragraph,
                        content: [{ type: NodeType.Text, content: 'abc' }]
                    }, {
                        type: NodeType.Paragraph,
                        content: [{ type: NodeType.Text, content: 'def' }]
                    }
                ]
            },
        ]);
        doc = parse(`<<<\nabc\n\n<<<\ndef\n>>>\n>>>`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([ {
            type: NodeType.Group,
            content: [
                {
                    type: NodeType.Paragraph,
                    content: [{ type: NodeType.Text, content: 'abc' }]
                }, {
                    type: NodeType.Group,
                    content: [ {
                        type: NodeType.Paragraph,
                        content: [{ type: NodeType.Text, content: 'def' }]
                    } ]
                },
            ]
        } ]);
        doc = parse(`[.normal]<<<\nabc\n\ndef\n>>>`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([
            {
                type: NodeType.BlockModifier, mod: {name: 'normal'},
                content: [{
                    type: NodeType.Group,
                    content: [
                        { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: 'abc' }] },
                        { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: 'def' }] }
                    ]
                }]
            },
        ]);
        doc = parse(`   [.normal]   \n   <<<\n   abc   \n>>>`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([
            {
                type: NodeType.BlockModifier, mod: {name: 'normal'},
                content: [{
                    type: NodeType.Group,
                    content: [{
                        type: NodeType.Paragraph,
                        content: [{ type: NodeType.Text, content: 'abc' }]
                    }]
                }]
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
        let doc = parse(`[.pre]<<<\n\n\n>>>`);
        expect.soft(doc.messages).toMatchObject([]);
        expect.soft(doc.root.content).toMatchObject([
            {
                type: NodeType.BlockModifier, mod: {name: 'pre'},
                content: [{ type: NodeType.Preformatted, content: {text: '\n'} }]
            }
        ]);
        doc = parse(`[.pre]<<<\nabc\n\ndef\n>>>`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([
            {
                type: NodeType.BlockModifier, mod: {name: 'pre'},
                content: [{ type: NodeType.Preformatted, content: {text: 'abc\n\ndef'} }]
            }
        ]);
        doc = parse(`   [.pre]   \n   <<<\n   abc\n>>>`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([
            {
                type: NodeType.BlockModifier, mod: {name: 'pre'},
                content: [{ type: NodeType.Preformatted, content: {text: '   abc'} }]
            }
        ]);
    });
    test('empty block modifier', () => {
        let doc = parse(`[.normal;]\nabc`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([
            {
                type: NodeType.BlockModifier, mod: {name: 'normal'},
                content: []
            },
            { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: 'abc' }] },
        ]);
        doc = parse(`[.marker]\nabc`);
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
    });
    test('normal inline modifier', () => {
        let doc = parse(`[/normal]abc[;]`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([ {
            type: NodeType.Paragraph,
            content: [ {
                type: NodeType.InlineModifier, mod: {name: 'normal'},
                content: [{type: NodeType.Text, content: 'abc'}]
            } ]
        } ]);
        doc = parse(`[/normal] abc [;]`);
        expect.soft(doc.messages).toHaveLength(0);
        expect.soft(doc.root.content).toMatchObject([ {
            type: NodeType.Paragraph,
            content: [ {
                type: NodeType.InlineModifier, mod: {name: 'normal'},
                content: [{type: NodeType.Text, content: 'abc'}]
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
    test('warnings - extra newlines: modifiers', () => {
        let doc = parse(`[.normal]\n\nabc`);
        expect.soft(doc.messages).toMatchObject([
            { severity: MessageSeverity.Warning, code: 1 }
        ]);
        doc = parse(`[.pre]\n\nabc`);
        expect.soft(doc.messages).toMatchObject([
            { severity: MessageSeverity.Warning, code: 1 }
        ]);
        doc = parse(`[.normal]abc\n\n\ndef`);
        expect.soft(doc.messages).toMatchObject([
            { severity: MessageSeverity.Warning, code: 1 }
        ]);
        doc = parse(`[.pre]abc\n\n\ndef`);
        expect.soft(doc.messages).toMatchObject([
            { severity: MessageSeverity.Warning, code: 1 }
        ]);
        doc = parse(`[.marker]\n\n\ndef`);
        expect.soft(doc.messages).toMatchObject([
            { severity: MessageSeverity.Warning, code: 1 }
        ]);
    });
    test('warnings - extra newlines: paragraphs', () => {
        let doc = parse(`aaa\nbbb\n\n\nccc\n\nddd`);
        expect.soft(doc.messages).toMatchObject([
            { severity: MessageSeverity.Warning, code: 1 }
        ]);
    });
    test('warnings - extra newlines: groups', () => {
        let doc = parse(`<<<\nabc\n>>>\n\n\nhaha`);
        expect.soft(doc.messages).toMatchObject([
            { severity: MessageSeverity.Warning, code: 1 }
        ]);
        doc = parse(`[.pre]<<<\nabc\n>>>\n\n\nhaha`);
        expect.soft(doc.messages).toMatchObject([
            { severity: MessageSeverity.Warning, code: 1 }
        ]);
    });
    test('warnings - should be newlines: groups', () => {
        let doc = parse(`<<<abc\n>>>`);
        expect.soft(doc.messages).toMatchObject([
            { severity: MessageSeverity.Warning, code: 3 }
        ]);
        doc = parse(`[.pre]<<<abc\n>>>`);
        expect.soft(doc.messages).toMatchObject([
            { severity: MessageSeverity.Warning, code: 3 }
        ]);
        doc = parse(`<<<\nabc\n>>>haha`);
        expect.soft(doc.messages).toMatchObject([
            { severity: MessageSeverity.Warning, code: 3 }
        ]);
        doc = parse(`[.pre]<<<\nabc\n>>>haha`);
        expect.soft(doc.messages).toMatchObject([
            { severity: MessageSeverity.Warning, code: 3 }
        ]);
    });
    test('warnings - should be newlines: block modifiers', () => {
        let doc = parse(`haha [.normal] hoho`);
        expect.soft(doc.messages).toMatchObject([
            { severity: MessageSeverity.Warning, code: 3 }
        ]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: 'haha' }] },
            {
                type: NodeType.BlockModifier, mod: {name: 'normal'},
                content: [{
                    type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: 'hoho' }]
                }]
            }
        ]);
    });
    test('warnings - should be newlines: markers', () => {
        let doc = parse(`[.marker][.marker]`);
        expect.soft(doc.messages).toMatchObject([
            { severity: MessageSeverity.Warning, code: 3 }
        ]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.BlockModifier, mod: {name: 'marker'} },
            { type: NodeType.BlockModifier, mod: {name: 'marker'} }
        ]);
        doc = parse(`[.marker]   [.marker]`);
        expect.soft(doc.messages).toMatchObject([
            { severity: MessageSeverity.Warning, code: 3 }
        ]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.BlockModifier, mod: {name: 'marker'} },
            { type: NodeType.BlockModifier, mod: {name: 'marker'} }
        ]);
        doc = parse(`[.marker] haha`);
        expect.soft(doc.messages).toMatchObject([
            { severity: MessageSeverity.Warning, code: 3 }
        ]);
        expect.soft(doc.root.content).toMatchObject([
            { type: NodeType.BlockModifier, mod: {name: 'marker'} },
            { type: NodeType.Paragraph, content: [{ type: NodeType.Text, content: 'haha' }] }
        ]);
    });
});
