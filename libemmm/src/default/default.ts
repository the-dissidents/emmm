import { BuiltinConfiguration } from "../builtin/builtin";
import { Configuration, ReadonlyConfiguration } from "../interface";
import { BulletBlocks } from "./bullets";
import { HeadingBlocks } from "./headings";
import { NoteBlock, NoteInline, NoteMarkerInline } from "./notes";
import { CodeBlock, CodeInline } from "./code";
import { QuoteBlocks } from "./quotes";
import { InlineStyles } from "./inline-styles";
import { MiscInlines } from "./misc";

let config = Configuration.from(BuiltinConfiguration);
config.blockShorthands.add();
config.blockModifiers.add(
    ...HeadingBlocks,
    ...BulletBlocks,
    CodeBlock,
    ...QuoteBlocks,
    NoteBlock
);
config.inlineModifiers.add(
    CodeInline,
    ...InlineStyles,
    ...MiscInlines,
    NoteInline, NoteMarkerInline
);

export const DefaultConfiguration: ReadonlyConfiguration = Object.freeze(config);