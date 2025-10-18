# kfgui

(it's a working title)

GUI editor for typesetting articles using the `emmm` markup language, developed using tauri + Svelte.

The idea is that technical designers use Library and CSS etc. (and, when necessary, change `kfgui`'s source code) to create a *configuration* that provide everything a typesetter need to do their work. This includes shorthands and styling rules.

Ideally, a typesetter should only care about the *semantics* of an article, and if the article is typeset in a semantically appropriate way, the rendered result should look correct.

A typesetter should always control the appearance of a document by using *parameters* (e.g. thematic colors, choosable styles) provided by the configuration, and not by changing the modifiers used in the source.

The `emmm` source file should remain purely semantic, independent from its medium and representation.

## Getting started

[Locally build](../../README.md#building) the project first.

Currently, we focus on typesetting for WeChat 公众号. To enable WeChat publishing features, you need the **appid** and **secret** from the [Developer Platform](https://developers.weixin.qq.com/platform). 

> **Important note:** While they never leave your machine (except for going to Tencent), the `appid` and `secret` are stored across sessions in a config file *in plaintext*.

Additionally, since we make the API calls locally, you need to **put your public IP in the whitelist** (公众平台→设置与开发→安全中心→IP白名单). As a convenience you can see your IP by clicking the button on the first line, but this isn't always reliable.

## The Interface

The **Source** tab is where you typeset your articles. 

- Don't put any definitions in it.
- Don't put anything technical in it.
- Don't put anything that is not directly part of your article's semantic content in it. 
- This is the only tab non-technical typesetters ever need to use.

The **Library** tab should contain definitions of custom modifiers and shorthands. For maximum flexibility, the default configuration doesn't include any shorthands, so you want to define them here.

- This tab should only contain system modifiers and produces nothing when rendered. In any case, the expansion result of this page is discarded.
- Non-technical people don't need to read anything on this page, although you'll want to tell them about the shorthands you defined.

The **CSS** tab controls the styling of the rendered HTML document. 

- Obviously, web development knowledge is required to write CSS.
- **Not all styling works when pasted into the WeChat editor or submitted via API as an article.** Apparently WeChat platform modifies your HTML in some way, and we haven't entirely figured it out how.

On the right pane you have a preview of the rendered page and debug views of the AST and the generated HTML code. 

> Note that the HTML code comes directly from `libemmm` and is **not** the HTML that you copy to WeChat. To circumvent WeChat's automatic formatting, `kfgui` attempts to transform the code by inlining everything and rewriting tag names. Click `copy transformed HTML` to get the transformed version.

## Roadmap

- [x] Source view
  - [x] semantic highlighting
  - [x] smart hanging indentation
  - [x] diagnostic underlines
  - [x] autocompletion
- [x] Rendered view
  - [x] simple AST view
  - [x] raw HTML view
  - [x] HTML preview
  - [ ] synchronized scrolling (with source map?)
- [x] Diagnostics view
  - [x] linting support
- [ ] Options and tools
    - [x] customizable CSS
    - [ ] spell check tools
    - [ ] quick actions / insertions?
      - [x] drag to insert `[.image]`s
    - [ ] search toolbox
- [x] Support for multiple files
  - [x] library and source (currently fake files)
  - [ ] edit multiple library files
  - [ ] proper project management
- [ ] Publishing
  - [ ] support for WeChat
    - [x] copy to editor
      - [x] inline CSS classes
      - [x] convert ::before and ::after to inline content
      - [x] convert tags
      - [ ] reverse-engineer WeChat online editor to know exactly what transforms they do to our submitted documents
    - [ ] upload to server?
    - [ ] automatic formatting
      - [x] color themes
      - [ ] rule-based typographic tweaks
        - [x] span classes for wide and narrow characters
  - [ ] support for Douban
    - [ ] copy to editor
- [ ] Collaboration