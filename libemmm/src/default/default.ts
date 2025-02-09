import { BuiltinConfiguration } from "../builtin/builtin";
import { Configuration, ReadonlyConfiguration } from "../interface";
import { CommentShorthand, HeadingBlock, NumberedHeadingBlock, BulletItemBlock, OrderedListItemBlock, SubItemBlock, CodeBlock, CodeInline, EmphasisInline, KeywordInline, HighlightInline, RubyInline, LinkInline, CommentaryInline, QuoteBlock, EpitaphBlock, AttributionBlock, NoteBlock, NoteInline, NoteMarkerInline } from "./misc";

let config = new Configuration(BuiltinConfiguration);
config.blockShorthands.add(
    CommentShorthand);
config.blockModifiers.add(
    HeadingBlock, NumberedHeadingBlock,
    BulletItemBlock, OrderedListItemBlock, SubItemBlock,
    CodeBlock,
    QuoteBlock, EpitaphBlock, AttributionBlock,
    NoteBlock
);
config.inlineModifiers.add(
    CodeInline,
    EmphasisInline, KeywordInline, HighlightInline, CommentaryInline,
    RubyInline, LinkInline,
    NoteInline, NoteMarkerInline
);

export const DefaultConfiguration: ReadonlyConfiguration = Object.freeze(config);