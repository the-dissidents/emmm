// calculateSpecificity.test.ts
import { test } from 'uvu';
import * as assert from 'uvu/assert';
import { calculateSpecificity, Specificity } from '../src/specificity.js';

function expectSpec(selector: string, expected: Specificity) {
  test(`"${selector}" → [A:${expected.A} B:${expected.B} C:${expected.C}]`, () => {
    const actual = calculateSpecificity(selector);
    assert.equal(actual, expected);
  });
}

// ----------------------------------------
// 1. Basic & Compound Selectors
// ----------------------------------------

// Universal selector (no specificity)
expectSpec("*", { A: 0, B: 0, C: 0 });

// Type selector
expectSpec("div", { A: 0, B: 0, C: 1 });

// Class selector
expectSpec(".my-class", { A: 0, B: 1, C: 0 });

// ID selector
expectSpec("#my-id", { A: 1, B: 0, C: 0 });

// Attribute selector
expectSpec("[type='text']", { A: 0, B: 1, C: 0 });

// Pseudo-class
expectSpec(":hover", { A: 0, B: 1, C: 0 });

// Pseudo-element
expectSpec("::before", { A: 0, B: 0, C: 1 });

// Compound selectors (chaining without spaces)
expectSpec("a.nav-link:hover", { A: 0, B: 2, C: 1 });
expectSpec("article#post-123.featured", { A: 1, B: 1, C: 1 });
expectSpec("p::first-line", { A: 0, B: 0, C: 2 });

// Chaining selectors of the same type increases specificity
expectSpec(".class1.class2.class3", { A: 0, B: 3, C: 0 });
expectSpec("#myId#myId", { A: 2, B: 0, C: 0 }); // Valid for specificity calculation

// ----------------------------------------
// 2. Complex Selectors (with Combinators)
// Combinators (+, >, ~, ' ') themselves do not add to specificity.
// ----------------------------------------

// Descendant combinator (' ')
expectSpec("body #content .post h2", { A: 1, B: 1, C: 2 });

// Child combinator (>)
expectSpec("ul > li.active", { A: 0, B: 1, C: 2 });

// Adjacent sibling combinator (+)
expectSpec("h1 + p", { A: 0, B: 0, C: 2 });

// General sibling combinator (~)
expectSpec("#main ~ footer", { A: 1, B: 0, C: 1 });

// A more complex "kitchen sink" example
expectSpec("header#main-header nav.main-nav ul > li.active a:hover", { A: 1, B: 3, C: 5 });

// ----------------------------------------
// 3. Specificity-Adjusting & Nested Pseudo-classes
// :is(), :not(), and :has() take the specificity of their most specific argument.
// :where() always has a specificity of 0.
// ----------------------------------------

// :where() - Zero specificity
expectSpec(":where(h1, #main) p", { A: 0, B: 0, C: 1 }); // :where() and its arguments are ignored

// :is() - Takes specificity of its most specific argument
expectSpec("main :is(h1, h2#subheading)", { A: 1, B: 0, C: 2 }); // main(C=1) + h2#subheading(A=1, C=1)

// :not() - Takes specificity of its most specific argument
expectSpec("div:not(.inner, #fakeId) p", { A: 1, B: 0, C: 2 }); // div(C=1) + #fakeId(A=1) + p(C=1)

// :has() - Takes specificity of its most specific argument
expectSpec("div:has(> #main-img)", { A: 1, B: 0, C: 1 }); // div(C=1) + #main-img(A=1)

// A simple nested example: :has with a combinator and :is
// div(C=1) + :has( :is(h1,h2)(C=1) ) = {A:0, B:0, C:2}
expectSpec("div:has(+ :is(h1, h2))", { A: 0, B: 0, C: 2 });

// Nesting :is() inside :has() with an ID
// section(C=1) + :has( #main-content(A=1):is(.active)(B=1) ) = {A:1, B:1, C:1}
expectSpec("section:has(> #main-content:is(.active, .visible))", { A: 1, B: 1, C: 1 });

// Nesting :not() inside :has()
// article(C=1) + :has( h1(C=1):not(#main-title)(A=1) ) = {A:1, B:0, C:2}
expectSpec("article:has(h1:not(#main-title))", { A: 1, B: 0, C: 2 });

// Chaining specificity-adjusting pseudo-classes
// li(C=1) + :is(.special-item)(B=1) + :has(a)(C=1) = {A:0, B:1, C:2}
expectSpec("li:is(:first-child, .special-item):has(a)", { A: 0, B: 1, C: 2 });

// Using :where() inside another pseudo-class to nullify its contribution
// a(C=1) + :not( :where(...)(0) ) = {A:0, B:0, C:1}
expectSpec("a:not(:where(.external, .icon))", { A: 0, B: 0, C: 1 });

// ----------------------------------------
// 4. MDN Examples
// ----------------------------------------

// From "Matching selector" example
expectSpec('[type="password"]', { A: 0, B: 1, C: 0 });
expectSpec("input:focus", { A: 0, B: 1, C: 1 });
expectSpec(":root #myApp input:required", { A: 1, B: 2, C: 1 });

// From "Three-column comparison" example
expectSpec("#myElement", { A: 1, B: 0, C: 0 });
expectSpec(".bodyClass .sectionClass .parentClass [id='myElement']", { A: 0, B: 4, C: 0 });
expectSpec("#myApp [id='myElement']", { A: 1, B: 1, C: 0 });
expectSpec(":root input", { A: 0, B: 1, C: 1 });
expectSpec("html body main input", { A: 0, B: 0, C: 4 });

// From ":is(), :not(), :has() and CSS nesting exceptions" example
expectSpec("p", { A: 0, B: 0, C: 1 });
expectSpec(":is(p)", { A: 0, B: 0, C: 1 });
expectSpec("h2:nth-last-of-type(n + 2)", { A: 0, B: 1, C: 1 });
expectSpec("h2:has(~ h2)", { A: 0, B: 0, C: 2 });
expectSpec("div.outer p", { A: 0, B: 1, C: 2 });
expectSpec("div:not(.inner) p", { A: 0, B: 1, C: 2 });
expectSpec(":is(p, #fakeId)", { A: 1, B: 0, C: 0 });
expectSpec("h1:has(+ h2, > #fakeId)", { A: 1, B: 0, C: 1 });
expectSpec("p:not(#fakeId)", { A: 1, B: 0, C: 1 });

// From "Increasing specificity by duplicating selector" example
expectSpec("#myId#myId#myId span", { A: 3, B: 0, C: 1 });
expectSpec(".myClass.myClass.myClass span", { A: 0, B: 3, C: 1 });

test.run();