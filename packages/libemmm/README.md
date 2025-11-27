# libemmm

This package contains the parser and a default configuration of the `emmm` markup language.

## Usage

`emmm` is an extensible language. The parser by itself only handles the basic syntax; it accepts a `Configuration` object that defines most of the features.

To parse a source, create a `ParseContext` object from a `Configuration`; the context object holds the parser state, and you can use the same context to parse multiple sources to make definitions persist across them.

```typescript
import * as emmm from '@the_dissidents/libemmm';

let config = new emmm.Configuration(emmm.BuiltinConfiguration);
// optionally, add definitions to config here

let context = new ParseContext(config);
```

The parser reads from a very simple scanner interface that only goes forward, without backtracking. Usually you can use the default implementation. Parsing yields a `Document` object.

```typescript
let scanner = new emmm.SimpleScanner(source);
let doc = context.parse(scanner);

// `doc.root` is the AST root node
// `doc.messages` is an array of diagnostic messages
```

## A Semi-Technical Reference to `emmm` Syntax

![AST Structure](./doc-images/ast.svg)

### 1. Block entities

#### 1.1. Paragraphs

The most basic type of **block-level** entities is **paragraph**. 

Block-level entities are usually separated by a blank line (two newline characters). One newline does not create a new block and is preserved. Whitespaces and newlines at the beginning of a block are usually ignored. However, whitespaces *inside* the block are preverved [^1].

[^1]: There is also an option in `KernelConfiguration` that tells the parser to collapse consecutive whitespaces to a single space.

```
This is a paragraph.

This is another paragraph.
Still in the same paragraph, but after a newline.
```

In paragraphs, you can use a backslash `\` to **escape** a character immediately after it, so that it will not be interpreted as a special character, such as the beginning of a modifier.

> You can even use this to put multiple consecutive newlines in a single paragraph: just put a backslash before each newline (or at least every two newlines). However, this may look confusing.

#### 1.2. Block modifiers

The construct `[.foo]` or `[.foo args]` (called the **head** of the modifier) signals a **block modifier**, with `args` being an optional `:`-separated list of arguments (more on that later). It always starts a new block, even when at a position normally not expected to have a new block (this will trigger a warning).

##### 1.2.1. Normal content

Most block modifiers accept block-level entities as **content**. They will always try to find the content, even when it's separated from the head by multiple newlines. Block modifiers can be nested, or if there isn't a nesting modifier anymore, the content will be a Paragraph.

By default, a block modifier's scope is limited to *the immediately following block*, unless a pair of brackets (`:--` and `--:`) is used to group blocks together.

Examples:

> Note: the code below may appear very confusing and difficult to read. However, `emmm` is designed with a [GUI editor](../../apps/editor/README.md) in mind -- with a graphical gutter, syntax highlighting and automatic hanging indentation, the structures can be fairly intuitive.

```
[.foo] This is under foo (whitespace after ] is optional).
This the second line of the same paragraph under foo.

[.foo]
This is another block under foo. Note that the initial newline is ignored.

This paragraph is NOT under foo, [.foo] but this immediately starts a new one under foo (expect a warning here).

[.foo] Similarly, this is a block of foo ...
[.foo] ... and this is another block of foo.

[.foo]


    You can actually add a lot of inital newlines and whitespaces and still be inside foo. This will trigger a warning.

[.foo]
[.foo] This is a paragraph inside foo inside foo, since the outer foo hadn't encountered any block before the parser met the inner foo, which became the content of the outer one.

[.foo]
:--
Use brackets to group together multiple blocks:

This is still in foo.

[.foo] This foo is also in foo.

[.foo] :--
You can have nested brackets. Not exactly beautiful looking, though.

Note that closing brackets have to be on its own line, but the opening ones do not. On the other hand, you must have a newline after a closing bracket.
--:
--:
```

You can also use the brackets without a modifier. However, this has little effect.

##### 1.2.2. Preformatted content

Some block modifiers accept a **preformatted block**. The contents of preformatted blocks are treated as plain text: no parsing of modifiers and escape sequences, and no collapsing of whitespaces is performed. However, as in normal content, newlines and whitespaces immediately following the modifier head are ignored.

Examples, supposing the modifier `[.pre]` accepts a preformatted block:

```
[.pre] This is preformatted content, suitable for code and ASCII art. Always treated as plain text, even if I write [.foo] or [/foo] or \[.

However, like in a normal paragraph, a blank line creates a new block so this is no longer in the pre. Use brackets if you don't want that:

[.pre]
:--
export { DebugLevel } from './debug';

export function setDebugLevel(level: DebugLevel) {
    debug.level = level;
}
--:
```

##### 1.2.3. Empty content or no content

Use a `;` before `]` to signify empty content.

```
[.foo;]
[.pre;]
```

Some block modifiers don't accept any content. In that case, `;` is optional.

Example, supposing `[.boo]` doesn't accept content:

```
[.boo]
This is a regular paragraph and not in boo!

[.boo]  This will trigger a warning.
[.boo;] Actually, this will still trigger a warning. It's better to put things on a new line.
```

#### 1.3. Block shorthands

**Block shorthands** can be defined via custom configuration or the `[-block-shorthand]` system modifier (see below). They're just syntactic sugar for block modifiers.

A block shorthand consists of a **prefix** and some **interfixes**. Arguments are placed between pre- and interfixes, and the content (if it accepts one) is after the last interfix.

The following example shows a shorthand with prefix `:: ` and a single interfix ` =`:

```
:: author = J. Mustermann
```

It is equivalent to

```
[.metadata|author] J. Mustermann
```

except that modifiers must have a name (here "metadata") but block shorthands have no names.

Note that `emmm` shorthands are parsed without backtracking. Whenever the parser sees a shorthand prefix at the start of a line, it assumes a shorthand (except, of course, in preformatted blocks). If the shorthand can't be succefully parsed (for example lacking any ` =`), it will trigger an error.

### 2. Inline entities

#### 2.1. Inline modifiers

**Inline modifiers** are similar to block modifiers, but occur in paragraphs. They are written as `[/baa]` or `[/baa args]`. If accepting content, use `[;]` to mark the end of their scope.

```
Behold a baa: [/baa]content of baa[;].
This one is without content: [/baa;].
Baa inside a baa: [/baa]one [/baa]two[;] three[;].
```

#### 2.2. Inline shorthands

Inline shorthands are similar to their block-level counterpart, however, they can appear anywhere in a paragraph, not only at the beginning of a line, and if they accept any parameter or content they must also have a **postfix** (functioning like `[;]`).

The content slot doesn't have to come last. For example, a link shorthand can be defined with prefix `<`, interfix `>(` and postfix `)` and with content at the first position:

```
Check out <this>(myurl).
````

Roughly equivalent to:

```
Check out [/link myurl]this[;].
````

> This is **intended behavior** but **not yet implemented**. Currently, the content slot must the last one.

Again, `libemmm` parses inline shorthands without backtracking. In this example, whenever you need to use the character `<` in a paragraph that doesn't constitute a link shorthand, you must escape it. For example, `(a+b) * (a-b) <= a^2` will produce an error.

> This shows why you should be careful defining inline shorthands. Only use characters that aren't used in regular writing, or use a combination of characters.

### 3. Expansion of modifiers

Some modifiers **expand** to something. For example, the built-in inline modifier `[/$]` expands to the value of a variable, and all user-defined modifiers expand to a copy of their definition with "slots" filled in with content and parameters filled in with arguments.

After expanding, the new entities are reparsed as if they're part of the original source code. For a verbose walkthrough of how this works, see the [Parser reference](https://github.com/the-dissidents/emmm/wiki/Parser-reference#expanding-and-reparsing) in the wiki.

### 4. System modifiers

**System modifiers** are a special type of modifiers. They are similar to block modifiers in terms of parsing, but they begin with `[-` and never expand to anything. Usually, they modify the state of the `ParseContent`, e.g. assigning variables or creating new modifiers.

> The AST definiton specifies that `SystemModifierNode`s can appear as either block-level or inline-level entities. The reason behind this is that we may want them to appear inside `[-define-inline]` definitions and thus expanding into inline entities:
> ```
> [-define-inline foo]
> :--
> [-var xyz=123]
> xyz is now 123
> --:
> ```
> However, in parsing they are treated only as block-level modifiers, meaning that it's not supported to use them inline *directly*. Also note that inside `[-define-inline]` definitions they are still technically distinct blocks, only transformed into inline entities at expand time. **This is indeed awkward. We will change it if we think of a better approach.**

### 5. Modifier arguments

#### 5.0. Introduction

The **arguments** for modifiers are basically `|`-delimited sequences. They are fundamentally simple strings and cannot contain modifiers.

As in paragraphs, use `\` to escape characters in arguments.

```
[/baa anything can be arguments|they can even
span 
many 

lines (but there are no concept of paragraphs)|note that pipes (\|), semicolons (\;) and square brackets (\[\]) need escaping;]
```

A colon before the first argument states explicitly the beginning of that argument, so that any following whitespaces are not trimmed. In fact, it is not even required to have *any* whitespaces after the modifier name, and the built-in `[/$]` makes use of this (you can write `[/$myvar]` instead of `[/$ myvar]`). However, omitting the space in most other cases is, obviously, not recommended.

```
[.foo   abc] Argument is "abc"
[.foo|  abc] Argument is "  abc"
[.fooabc]    Argument is "abc" (argh!)
```

Although the parser doesn't do this, many modifiers' implementation internally trims whitespace around arguments in order to make the syntax more flexible.

#### 5.1. Named arguments

Arguments can be **named**. Named arguments are in the form `name=value`, where `name` is not allowed to contain `:`, `/`, `[`, `=`, whitespaces, escape sequences or interpolations.

> This is experimental and subject to change. In particular, the non-allowed characters in names still feel arbitrary.

Arguments containing `=` are only interpreted as named if the name is valid. Otherwise they're treated as normal arguments.

```
[.foo baa=www] One named argument "baa" with value www
[.foo example.com/?query=123] No named arguments!
```

You can mix named and unnamed arguments. Internally, named arguments are unordered and they are accessed separately. For example, the following instances of `[.foo]` are equivalent:

```
[.foo unnamed1|unnamed2|baa=www|boo=qqq;]
[.foo unnamed1|baa=www|unnamed2|boo=qqq;]
[.foo boo=qqq|unnamed1|baa=www|unnamed2;]

etc., etc.
```

*Un*named arguments are also called **positional arguments**.

#### 5.1. Argument interpolations

Each argument can contain **interpolations**, whose syntaxes are defined by an opening string and a closing string (there isn't a fixed form). For example, the built-in interpolator for variable reference opens with `$(` and closes with `)`. Interpolations expand to plain strings. They can also be nested.

Suppose the variables are "x" = "y", "y" = "1":

```
[.foo $(x)]       Argument is "y"
[.foo $(x)$(y)]   Argument is "y1"
[.foo $($(x))]    Argument is "1"
[.foo $(invalid)] Triggers a warning, argument is empty string
```

## A Synopsis of the Built-in Configuration

### System modifiers

[**-define-block** *name* | *args...*] *content*  
[**-define-block** *name* | *args...* | (*slot*)] *content*  
[**-define-inline** *name* | *args...*] *content*  
[**-define-inline** *name* | *args...* | (*slot*)] *content*  

> Define a new modifier, taking the content as the definition. The first argument is the name. If one or more arguments exist, and the last is enclosed in `()`, it is taken as the **slot name** (more on that later). The rest in the middle are names for the arguments.
>
> Currently, custom modifiers **always have a slot** even if you don't explicitly give a slot name. This is inconsistent with shorthands which can be slotless (see below). We're considering changing this.
>
> You can define named arguments for your modifier using, well, named arguments:
>
> ```
> [-define-block foo|pos1|pos2|named=default]
> ...
> ```
> Named arguments for custom modifiers are **always optional** and you must specify a default value.

[**-var** *id* | *value*]  
[**-var** *id*=*value*]

> Assigns `value` to a variable. 
>
> The two syntaxes are equivalent *except that* in the second one, you must obey the limitation for argument names. For example, you can't use interpolations.
> 
> You can't reassign arguments, only variables. Since arguments always take precedence over variables, "reassigning" them has no effect inside a definition and can only confuse the rest of the code.

[**-block-shorthand** *prefix*] *content*  
[**-block-shorthand** *prefix* | (*slot*)] *content*

[**-inline-shorthand** *prefix*] *content*  
[**-inline-shorthand** *prefix* | (*slot*) | *postfix*] *content*  
[**-inline-shorthand** *prefix* | *arg1* | *mid1* | *arg2* | *mid2*...] *content*  
[**-inline-shorthand** *prefix* | *arg1* | *mid1* | *arg2* | *mid2*...|(*slot*) | *postfix*] *content*  

> Define shorthands. A shorthand notation consists of a prefix, zero or more pairs of argument and middle part, and optionally a slot and a postfix. You can specify a slot name if you want to use one, or just use `()`. You may also specify an *empty* last argument, i.e. a `|` before the `]` that ends the modifier head, to make the postfix stand out better.
> ```
> [-inline-shorthand|\[!|url|\||()|\]:] content
> ```
> This creates: `[!` argument|url `|` slot `]`
> ```
> [-inline-shorthand|\[!|url|\||text|\]:] content
> ```
> This creates: `[!` argument|url `|` argument|text `]`
> 
> Note the second shorthand is **slotless**. This means you can't put formatted content as text in the second shorthand. This also applies to slotless block shorthands: they can't have any content.
>
> You **can't define** named arguments in shorthands.

[**-use** *module-name*]

> Activates the definitions in a module for the whole document; see `[.use]`.

### Block modifiers

[**.slot**]  
[**.slot** *name*]

> Only used in block-level definitons. When the new modifier or shorthand is being used, expands to its content. You can use the slot name to specify *which* modifier's content you mean, in case of ambiguity. By default it refers to the nearest one.
> ```
> [-define-block p|(0)]
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

[**.module** *module-name*] *content*

> Causes the definitions in the content to become part of a **module**. They don't take effect outside the `[.module]` modifier *unless* activated by a `[.use]` or `[-use]` modifier.

[**.use** *module-name*] *content*

> Activates the definitions in a module for the content *within this modifier*. Use `[-use]` to activate for the whole document instead.

[**.ifdef** *id*] *content*

> Expands to the content if the variable or argument *id* is defined, or nothing if it's not.

[**.ifndef** *id*] *content*

> Expands to the content if the variable or argument *id* is undefined, or nothing if it's defined.

### Inline modifiers

[**/slot**]  
[**/slot** *name*]

> Same as `[.slot]` but for inline definitions.

[**/$** *id*]

> Expands to the value of an argument or a variable. Arguments *always* take precedence over variables.

[**/print** *argument...*]

> Expands to the value of the arguments, separated by nothing, as plain text.

[**/ifdef** *id*] *content* [;]  
[**/ifndef** *id*] *content* [;]

> See the similarly named block modifiers.

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