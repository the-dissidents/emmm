import { ModifierSlotType, SystemModifierDefinition } from "../interface";
import { checkArguments, onlyPermitPlaintextParagraph } from "../modifier-helper";

function createWrapper(name: string, varname?: string) {
    varname = varname ?? name.toUpperCase();
    return new SystemModifierDefinition<void>(name, ModifierSlotType.Normal, {
        delayContentExpansion: true,
        afterProcessExpansion(node, cxt) {
            let msgs = checkArguments(node, 0);
            if (msgs) return msgs;
            let result = onlyPermitPlaintextParagraph(node);
            if (typeof result !== 'string') return result;
            cxt.variables.set(varname, result);
            return [];
        },
    });
}

export const VarWrappers = [
    createWrapper('title'),
    createWrapper('subtitle'),
    createWrapper('author'),
    createWrapper('translator'),
    createWrapper('proofreader'),
    createWrapper('typeset-by'),
    createWrapper('cover-by'),
    createWrapper('cover-img'),
    createWrapper('orig-title'),
    createWrapper('orig-link'),
    createWrapper('theme-color'),
];