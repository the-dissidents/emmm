# dom-css-inliner

It appears, AFAIK, currently no CSS inlining library supports modern selectors like `:has()`. So this is a (largely vibe-coded) new CSS inliner that employs DOM and CSSOM APIs to support them.

[Specificity](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_cascade/Specificity) is meticulously simulated and tested with a test suite.

[Inheritance control](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_cascade/Inheritance) (`inherit`, `revert`) is *NOT* supported.

I wanted to add pseudo-element inlining as well, but without a `Window` this can become quite complicated so I dropped the idea.

*I don't know yet* whether shorthand properties and nested rules are rigorously handled.

## Usage

```typescript
import { inlineCss } from "@the_dissidents/dom-css-inliner";

inlineCss(myDocument, {
    removeStyleTags: true,
    removeClasses: true
});
```