# libemmm

This package contains the parser and language server for the `emmm` markup language.

```sh
npm install @the_dissidents/libemmm
```

## Usage

`emmm` is an extensible language. The parser by itself only handles the basic syntax; it accepts a `Configuration` object that defines most of the features.

```typescript
import * as emmm from '@the_dissidents/libemmm';
let config = new emmm.Configuration(emmm.BuiltinConfiguration);
// add definitions to config here
```

The parser reads from a very simple scanner interface that only goes forward, without backtracking. Usually you can use the default implementation. The parser returns a `Document` object.

```typescript
let scanner = new emmm.SimpleScanner(source);
let doc = emmm.parse(scanner, config);
```

- `doc.root` is the AST root node.
- `doc.context` is a `ParseContext` object containing the state of the language that the extensions need to know, such as variables and modifier definitions. This is its state at the end of the parse.
- `doc.messages` is the array of diagnostic messages.
- You may want to call `doc.debugPrint(source)` to get a pretty-printed debug string of the AST.

## A Semi-Technical Reference to `emmm` Syntax

![AST Structure](./doc-images/ast.svg)

Block-level entities are usually separated by a blank line (two newline characters). One newline does not create a new block, and is preserved along with other whitespaces inside the block.

```
This is a paragraph.

This is another paragraph.
Still in the same paragraph, but after a newline.
```

A block that is not modified can be either a **paragraph** or a **preformatted block**, depending on the modifier that encloses it; if there is no modifier enclosing it, it is a normal paragraph. The contents of preformatted blocks are treated as plain text. No parsing of modifiers and escape sequences is performed. Whitespaces and newlines at the beginning of a block is usually ignored, but in preformatted blocks, only the first newline (if any) is ignored.

The construct `[.foo]` or `[.foo args]` before a block signals a **block modifier**, with `args` being an optional `:`-separated list of arguments (more on that later). It always starts a new block, even when at a position normally not expected to do so (but this will trigger a warning).

Some block modifiers don't accept any content. For those that accept, their scope is limited to *the immediately following block*, unless a pair of brackets (`:--` and `--:`) is used to group blocks together.

```
[.foo] This is under foo (whitespace after ] is optional).
This the second line of the same paragraph under foo.

[.foo]
This is another block under foo. Note that the initial newline is ignored.

This paragraph is NOT under foo, [.foo] but this immediately starts a new one under foo (expect a warning here).

[.foo] Similarly, this is a block of foo ...
[.foo] ... and this is another block of foo.

[.foo]
[.foo] However, this is foo inside foo, since the outer foo hadn't encountered any block before the parser met the inner foo, which became the content of the outer one.

[.foo]
:--
Use brackets to group together multiple blocks:

This is still in foo.

[.foo] This foo is also in foo.

[.foo] :--
You can have nested brackets. Not exactly beautiful looking, though.

Note that closing brackets have to be on its own line, but the opening ones do not. But you must have a newline after it.
--:
--:
```

You can also use the brackets without a modifier. However, this has little effect.

Suppose the modifier `[.pre]` accepts a preformatted block:

```
[.pre] Preformatted content, suitable for code and ASCII art. Always treated as plain text, even if I write [.foo] or [/foo] or \[.

However, like in a normal paragraph, a blank line creates a new block so this is no longer in the pre. Use brackets:

[.pre]
:--
export { DebugLevel } from './debug';

export function setDebugLevel(level: DebugLevel) {
    debug.level = level;
}
--:
```

Use a `;` before `]` to signify empty content. Modifiers that don't accept content can also be written with `;]`, but this is not required.

```
[.foo;]
[.pre;]
```

In normal paragraphs, use a slash `\` to **escape** the character immediately after it, so that it will not be interpreted as a special character (e.g. the beginning of a modifier).

**Inline modifiers** are similar to block modifiers, but occur in paragraphs. They are written as `[/baa]` or `[/baa args]`. If accepting content, use `[;]` to mark the end of their scope.

```
Behold a baa: [/baa]content of baa[;].
This one is without content: [/baa;].
Baa inside a baa: [/baa]one [/baa]two[;] three[;].
```

Some modifiers **expand** to something. For example, the built-in inline modifier `[/$]` expands to the value of a variable. 

**System modifiers** are very similar to block modifiers in terms of parsing, except they begins with `[-` and never expand to anything. They modify the state of the `ParseContent`, e.g. assigning variables or creating new modifiers.

> The AST definiton specifies that `SystemModifierNode`s can appear as either block-level or inline-level entities. The reason behind this is that we may want them to appear inside `[-define-inline]` definitions and thus expanding into inline entities:
> ```
> [-define-inline foo]
> :--
> [-var xyz:123]
> xyz is now 123
> --:
> ```
> However, in parsing they are treated only as block-level modifiers, meaning that it's not supported to use them inline *directly*. Also note that inside `[-define-inline]` definitions they are still technically distinct blocks, only transformed into inline entities at expand time. **This is indeed awkward. We will change it if we think of a better approach.**

The **arguments** for modifiers are basically `:`-delimited sequences. Each argument can contain **interpolations**, whose syntaxes are defined by an opening string and a closing string (there isn't a fixed form). For example, the built-in interpolator for variable reference opens with `$(` and closes with `)`. Interpolations expand to plain strings. They can also be nested.

As in paragraphs, use `\` to **escape** characters in arguments.

```
[/baa anything can be arguments:they can even
span 
many 

lines:but colons (\:), semicolons (\;) and square brackets (\[\]) need escaping;]

Suppose the variables are "x" = "y", "y" = "1".

[.foo $(x)]       Argument is "y"
[.foo $(x)$(y)]   Argument is "y1"
[.foo $($(x))]    Argument is "1"
[.foo $(invalid)] Will fail
```

A colon before the first argument states explicitly the beginning of that argument, so that any following whitespaces are not trimmed. In fact, it is not even required to have *any* whitespaces after the modifier name, and the built-in `[/$]` makes use of this (you can write `[/$myvar]` instead of `[/$ myvar]`). However, omitting the space in most other cases is, obviously, not recommended.

```
[.foo   abc] Argument is "abc"
[.foo:  abc] Argument is "  abc"
[.fooabc]    Argument is "abc" (argh!)
```

## A Synopsis of the Built-in Configuration

### System modifiers

[**-define-block** *name*:*args...*]  
[**-define-block** *name*:*args...*:(*slot*)]  
[**-define-inline** *name*:*args...*]  
[**-define-inline** *name*:*args...*:(*slot*)]  

> Define a new modifier. The first argument is the name. If one or more arguments exist, and the last is enclosed in `()`, it is taken as the **slot name** (more on that later). The rest in the middle are names for the arguments.
> 
> Take content as the definition of the new modifier.

[**-var** *id*:*value*]

> Assigns `value` to a variable. 
> 
> You can't reassign arguments, only variables. Since arguments always take precedence over variables, "reassigning" them has no effect inside a definition and can only confuse the rest of the code.

[**-define-block-prefix** *prefix*]  
[**-define-block-prefix** *prefix*:(*slot*)]

> Not implemented yet

[**-define-inline-shorthand** *prefix*]  
[**-define-inline-shorthand** *prefix*:(*slot*):*postfix*]  
[**-define-inline-shorthand** *prefix*:*arg1*:*mid1*:*arg2*:*mid2*...]  
[**-define-inline-shorthand** *prefix*:*arg1*:*mid1*:*arg2*:*mid2*...:(*slot*):*postfix*]  

> Defines an inline shorthand. A shorthand notation consists of a prefix, zero or more pairs of argument and middle part, and optionally a slot and a postfix. You must specify a slot name if you want to use one, although you can specify an empty one using `()`. You may also specify an *empty* last argument, i.e. a `:` before the `]` that ends the modifier head, to make the postfix stand out better.
> ```
> [-inline-shorthand:\[!:url:|:():\]:] content
> ```
> This creates: `[!` argument:url `|` slot `]`
> ```
> [-inline-shorthand:\[!:url:|:text:\]:] content
> ```
> This creates: `[!` argument:url `|` argument:text `]`
> 
> Note the first shorthand has a slot, while the second doesn't. This means you can't put formatted content as text in the second shorthand.

[**-use** *module-name*]

> Activates the definitions in a module for the whole document; see `[.use]`.

### Block modifiers

[**.slot**]  
[**.slot** *name*]

> Only used in block modifier definitons. When the new modifier is being used, expands to its content. You can use the slot name to specify *which* modifier's content you mean, in case of ambiguity. By default it refers to the nearest one.
> ```
> [-define-block p:(0)]
> [-define-block q]
> :--
> [.slot]
> [.slot 0]
> --:
>
> This expands to nothing but defines the block modifier q:
> [.p] 123
>
> This expands to two paragraphs containing "456" and "123":
> [.q] 456
> ```
> Note the first, unnamed `.slot` refers to the slot of `q`.

[**.module** *module-name*]

> Causes the definitions in the content to become part of a **module**. They don't take effect outside the `[.module]` modifier *unless* activated by a `[.use]` or `[-use]` modifier.

[**.use** *module-name*]

> Activates the definitions in a module for the content *within this modifier*. Use `[-use]` to activate for the whole document instead.

### Inline modifiers

[**/slot**]  
[**/slot** *name*]

> Same as `[.slot]`, but for inline modifier definitions.

[**/$** *id*]

> Expands to the value of an argument or a variable. Arguments *always* take precedence over variables.

[**/print** *argument...*]

> Expands to the value of the arguments, separated by nothing, as plain text.

### Interpolators

**$(** *varid* **)**

> Same as `[/$varid]`, but as an interpolation.

**$eval(** *expression* **)**

> Not implemented yet

---

For strange edge cases of the basic syntax and the built-in configuration, see the test modules. Note that they may not be *very* readable; we're considering moving to another format.

## Diagnostic Messages

> Note: 'suggestions' are currently not being implemented

|Code|Error|Suggestions|
|---:|-----|-|
|  1 | Syntax error: expecting <...>
|  2 | Undefined modifier <...> | *did you mean ... ?*
|    | | *did you forget to escape?*
|  3 | Unclosed inline modifier
|  4 | Argument count mismatch, <...> expected
|  5 | Failed to expand argument
|  6 | Invalid argument
|  7 | Invalid entity in inline modifier definition
|  8 | Reached recursion limit (<...>)
|  9 | Slot modifier used outside a definition
| 10 | Nested module definitions not allowed
| 11 | Cannot use the same module inside its definition
| 12 | A definition cannot be at once normal and preformatted

|Code|Warning|Suggestions|
|---:|-------|-|
|  1 |Unnecessary newline(s)| *remove*
|  ~~2~~ | ~~Block should begin in a new line to avoid confusion~~| ~~*add a line break*~~
|  3 | Content should begin in a new line to avoid confusion | *add a line break*
|  4 | Modifier already defined, overwriting
|  5 | Undefined variable, will expand to empty string
|  6 | Using this module will overwrite: <...>
|  7 | <...> is already defined (as <...>), will be overwritten