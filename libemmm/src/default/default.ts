import { BuiltinConfiguration } from "../builtin/builtin";
import { Configuration, ReadonlyConfiguration } from "../interface";
import { BulletBlocks } from "./bullets";
import { HeadingBlocks } from "./headings";
import { initNotes, NoteBlocks, NoteInlines } from "./notes";
import { CodeBlock, CodeInline } from "./code";
import { QuoteBlocks } from "./quotes";
import { InlineStyles } from "./inline-styles";
import { MiscInlines } from "./misc";

let config = Configuration.from(BuiltinConfiguration);
config.initializers.push(initNotes);
config.blockModifiers.add(
    ...HeadingBlocks,
    ...BulletBlocks,
    CodeBlock,
    ...QuoteBlocks,
    ...NoteBlocks
);
config.inlineModifiers.add(
    CodeInline,
    ...InlineStyles,
    ...MiscInlines,
    ...NoteInlines
);

export const DefaultConfiguration: ReadonlyConfiguration = Object.freeze(config);