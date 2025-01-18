import { BlockEntity, BlockModifierDefinition, BlockModifierNode, Configuration, CustomConfiguration, InlineModifierDefinition, InlineModifierNode, Message, ModifierFlags, ParseContext } from "./interface";
import { ArgumentsTooFewMessage, ArgumentsTooManyMessage, InlineDefinitonMustContainOneParaMessage, InvalidArgumentMessage, NameAlreadyDefinedMessage, UndefinedVariableMessage } from "./messages";

function checkArgumentLength(node: BlockModifierNode | InlineModifierNode, n: number) {
    if (node.arguments.length < n)
        return new ArgumentsTooFewMessage(node.head.end - 1, 0, n);
    if (node.arguments.length > n) {
        const start = node.arguments[n].start;
        return new ArgumentsTooManyMessage(start, node.head.end - start, n);
    }
    return null;
}

function customBlockModifier(
    name: string, argNames: string[], slotName: string, content: BlockEntity[]) 
{
    console.log('registered custom block modifier:', name);
    return new BlockModifierDefinition(name, ModifierFlags.Normal, {
        parse(node, config) {
            console.log('parsing custom block modifier:', name);
            const check = checkArgumentLength(node, argNames.length);
            if (check) return [check];
            // TODO
            return [];
        }
    });
}

function customInlineModifier(
    name: string, argNames: string[], slotName: string, content: BlockEntity) 
{
    console.log('registered custom inline modifier:', name);
    return new InlineModifierDefinition(name, ModifierFlags.Normal, {
        parse(node, config) {
            console.log('parsing custom inline modifier:', name);
            const check = checkArgumentLength(node, argNames.length);
            if (check) return [check];
            // TODO
            return [];
        }
    });
}

function defineBlock(pre: boolean, node: BlockModifierNode, cxt: ParseContext): Message[] {
    if (node.arguments.length == 0)
        return [new ArgumentsTooFewMessage(node.head.end - 1, 0)];
    const msgs: Message[] = [];
    const name = node.arguments[0];
    if (cxt.config.blockModifiers.has(name.content))
        msgs.push(new NameAlreadyDefinedMessage(
            node.start, name.end - name.start, name.content));

    const last = node.arguments.at(-1)!.content;
    const slotName = (node.arguments.length > 1 && /^\(.+\)$/.test(last)) 
        ? last.substring(1, last.length - 1)
        : '';
    const args = node.arguments.slice(1, (slotName !== '') ? node.arguments.length - 1 : undefined).map((x) => x.content);
    cxt.config.blockModifiers.set(name.content, 
        customBlockModifier(name.content, args, slotName, node.content));
    cxt.onConfigChange();
    return msgs;
}

function defineInline(pre: boolean, node: BlockModifierNode, cxt: ParseContext): Message[] {
    if (node.arguments.length == 0)
        return [new ArgumentsTooFewMessage(node.head.end - 1, 0)];
    const msgs: Message[] = [];
    const name = node.arguments[0];
    if (cxt.config.inlineModifiers.has(name.content))
        msgs.push(new NameAlreadyDefinedMessage(
            node.start, name.end - name.start, name.content));
    if (node.content.length != 1)
        msgs.push(new InlineDefinitonMustContainOneParaMessage(
            node.head.end, node.end - node.head.end));
    if (node.content.length > 0) {
        const last = node.arguments.at(-1)!.content;
        const slotName = (node.arguments.length > 1 && /^\(.+\)$/.test(last)) 
            ? last.substring(1, last.length - 1)
            : '';
        const args = node.arguments.slice(1, (slotName !== '') ? node.arguments.length - 1 : undefined).map((x) => x.content);
        cxt.config.inlineModifiers.set(name.content, 
            customInlineModifier(name.content, args, slotName, node.content[0]));
        cxt.onConfigChange();
    }
    return msgs;
}

let basic = new CustomConfiguration();
basic.addBlock(
    new BlockModifierDefinition('define-block', ModifierFlags.Normal, {
        // .define-block:name:args...[:(slot-id)]
        parse: (node, cxt) => defineBlock(false, node, cxt)
    }),
    new BlockModifierDefinition('define-inline', ModifierFlags.Normal, {
        // .define-inline:name:args...[:(slot-id)]
        parse: (node, cxt) => defineInline(false, node, cxt)
    }),
    new BlockModifierDefinition('var', ModifierFlags.Marker, {
        // .var:id:value
        parse(node, cxt) {
            const check = checkArgumentLength(node, 2);
            if (check) return [check];
            const arg = node.arguments[0];
            if (arg.content == '')
                return [new InvalidArgumentMessage(arg.start, arg.end)];
            cxt.variables.set(arg.content, node.arguments[1].content);
            return [];
        }
    }),
);
basic.addInline(
    new InlineModifierDefinition('$', ModifierFlags.Marker, {
        // .$:id
        parse(node, cxt) {
            const check = checkArgumentLength(node, 1);
            if (check) return [check];
            const arg = node.arguments[0];
            if (arg.content == '')
                return [new InvalidArgumentMessage(arg.start, arg.end)];
            if (!cxt.variables.has(arg.content))
                return [new UndefinedVariableMessage(arg.start, arg.end, arg.content)];
            return [];
        },
        expand(node, cxt) {
            if (node.arguments.length != 1) return [];
            const value = cxt.variables.get(node.arguments[0].content) ?? '';
            return [{type: 'text', content: value, start: -1, end: -1}];
        },
    }),
);

let config = new CustomConfiguration(basic);

config.addBlock(
    new BlockModifierDefinition('quote', ModifierFlags.Normal), 
    new BlockModifierDefinition('eq', ModifierFlags.Preformatted)
);

config.addInline(
    new InlineModifierDefinition('eq', ModifierFlags.Preformatted),
    new InlineModifierDefinition('emphasis', ModifierFlags.Normal),
    new InlineModifierDefinition('underline', ModifierFlags.Normal)
);

export const BasicConfiguration: Configuration = Object.freeze(basic);
export const DefaultConfiguration: Configuration = Object.freeze(config);
