# kfgui

(it's a working title)

GUI editor for typesetting articles using the `emmm` markup language, developed using tauri + Svelte.

- [x] Source view
  - [x] semantic highlighting
  - [x] smart hanging indentation
  - [x] diagnostic underlines
  - [ ] autocompletion
- [x] Support for multiple files
  - [x] library and source
  - [ ] edit multiple library files
- [x] Rendered view
  - [x] simple AST view
  - [x] raw HTML view
  - [x] HTML preview
  - [ ] synchronized scrolling (with source map?)
- [ ] Diagnostics view
  - [ ] linting support
- [ ] Options and tools view
    - [ ] customizable CSS
    - [ ] spell check tools
    - [ ] quick actions / insertions?
- [ ] Document management (tool bar)
  - [ ] open/save
  - [ ] insert (image) asset
    - [ ] upload images (manager?)
- [ ] Publishing
  - [ ] support for WeChat
    - [x] copy to editor
    - [x] convert ::before and ::after to inline content
    - [ ] upload to server?
    - [ ] automatic formatting
      - [x] color themes
      - [ ] rule-based typographic tweaks
  - [ ] support for Douban
    - [ ] copy to editor
- [ ] Collaboration