import { BlockModifier, Configuration, CustomConfiguration, InlineModifier, ModifierFlags } from "./interface";

let config = new CustomConfiguration();

config.addBlock(
    new BlockModifier('quote', ModifierFlags.Normal), 
    new BlockModifier('eq', ModifierFlags.Preformatted)
);

config.addInline(
    new InlineModifier('eq', ModifierFlags.Preformatted),
    new InlineModifier('emphasis', ModifierFlags.Normal),
    new InlineModifier('underline', ModifierFlags.Normal)
);

export const DefaultConfiguration: Configuration = Object.freeze(config);
