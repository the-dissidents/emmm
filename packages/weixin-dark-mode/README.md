# weixin-dark-mode

A typed rewrite of [mp-darkmode](https://github.com/wechatjs/mp-darkmode), the
dark mode conversion algorithm used by the WeChat Official Accounts Platform.

The conversion code is a direct adaptation of the original MIT-licensed
implementation. Plugin support from the original package has been removed, and
the module no longer reaches for the global `window` or `document`.

Features added by this package that are not part of the original library are
explicitly marked as extensions.

## Usage

Pass the window that owns the document you want to transform. This is useful
for iframes:

```typescript
import { createDarkMode } from '@the_dissidents/weixin-dark-mode';

const frame = document.querySelector('iframe');
const darkMode = createDarkMode(frame.contentWindow!);

darkMode.run(frame.contentDocument!.body.querySelectorAll('*'), {
    mode: 'dark',
});
```

If no `mode` is provided, the instance listens to that window's
`prefers-color-scheme` media query.

## API

### `createDarkMode(window)`

Creates an isolated dark mode instance for the supplied window.

### `darkMode.run(nodes, options?)`

Runs the conversion algorithm on the supplied elements.

### `darkMode.init(options?)`

Initializes configuration separately. Configuration can only be initialized
once per instance.

### `darkMode.convertBg(nodes)`

Runs delayed background detection.

### `darkMode.updateStyle(node, styles?)`

Updates the dark mode style of a single node after an initial `run()`.

### `darkMode.getContrast(color1, color2)`

Returns the contrast ratio between two CSS colors.

## Options

The following options match `mp-darkmode`:

- `begin(isSwitch)`
- `showFirstPage()`
- `error(error)`
- `mode`: `'dark'` or `'light'`
- `whitelist.tagName`
- `whitelist.attribute`
- `needJudgeFirstPage`
- `delayBgJudge`
- `container`
- `cssSelectorsPrefix`
- `defaultLightTextColor`
- `defaultLightBgColor`
- `defaultDarkTextColor`
- `defaultDarkBgColor`

## Extensions

These options are additions in this package. They are not part of the original
`mp-darkmode` library.

### `normalizeModernColors`

The original `mp-darkmode` only recognizes named colors and `rgb()`/`rgba()`
values. It ignores newer CSS Color 4 syntax such as `color(srgb ...)`.

Setting `normalizeModernColors: true` converts CSS Color 4 functions to legacy
`rgb()`/`rgba()` before running the original conversion algorithm:

```typescript
darkMode.run(frame.contentDocument!.body.querySelectorAll('*'), {
    mode: 'dark',
    normalizeModernColors: true,
});
```

**This is a compatibility workaround added by this package, not behavior from the
original library.** It is disabled by default.
