import { Debug } from "$lib/Debug";
import * as emmm from "@the_dissidents/libemmm";

const linting = Symbol();

type RegexRule = {
    pattern: RegExp,
    replacement?: string,
    description?: string
}

declare module '@the_dissidents/libemmm' {
    export interface ConfigurationStoreDefinitions {
        [linting]?: RegexRule[];
    }
}

export function getLintRules(config: emmm.Configuration) {
    return config.store[linting] ?? [];
}

export const lintRuleSystem = new emmm.SystemModifierDefinition(
    'lint', emmm.ModifierSlotType.Preformatted,
{
    prepareExpand(node, cxt) {
        const { msgs, args } = emmm.helper.bindArgs(node, [], { named: { desc: '', repl: '' } });
        if (msgs) return msgs;

        const content = node.content[0];
        Debug.assert(content.type === emmm.NodeType.Preformatted);

        try {
            const pattern = new RegExp(content.content.text, 'gu');
            if (!cxt.config.store[linting])
                cxt.config.store[linting] = [];
            cxt.config.store[linting].push({
                pattern, description: args.desc, replacement: args.repl
            });
        } catch (e) {
            return [new emmm.messages.InvalidArgumentMessage(content.location, `invalid regex pattern: ${e}`)];
        }

        return [];
    },
})
