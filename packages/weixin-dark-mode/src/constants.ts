export const MEDIA_QUERY = '(prefers-color-scheme: dark)';

export const CLASS_PREFIX = 'js_darkmode__';
export const DM_CLASSNAME_REGEXP = new RegExp(`${CLASS_PREFIX}\\d+`);
export const HTML_CLASS = 'data_color_scheme_dark';

export const BG_COLOR_DELIMITER = '|';

export const DEFAULT_LIGHT_TEXTCOLOR = '#191919';
export const DEFAULT_LIGHT_BGCOLOR = '#fff';
export const DEFAULT_DARK_TEXTCOLOR = '#a3a3a3';
export const DEFAULT_DARK_BGCOLOR = '#191919';

export const WHITE_LIKE_COLOR_BRIGHTNESS = 250;
export const MAX_LIMIT_BGCOLOR_BRIGHTNESS = 190;
export const MIN_LIMIT_OFFSET_BRIGHTNESS = 65;
export const HIGH_BGCOLOR_BRIGHTNESS = 100;
export const HIGH_BLACKWHITE_HSL_BRIGHTNESS = 40;
export const LOW_BLACKWHITE_HSL_BRIGHTNESS = 22;
export const IGNORE_ALPHA = 0.05;

export const CSS_PROP_SERIES = {
    BG_COLOR: ['background-color', 'background-image', 'background'],
    TEXT_SHADOW: ['text-shadow'],
    TEXT_COLOR: [
        '-webkit-text-stroke',
        '-webkit-text-stroke-color',
        'text-decoration',
        'text-decoration-color',
        'text-emphasis-color',
        'color',
        '-webkit-text-fill-color',
    ],
    BORDER_COLOR: [
        'border-image',
        '-webkit-border-image',
        'border',
        'border-top',
        'border-right',
        'border-bottom',
        'border-left',
        'border-color',
        'border-top-color',
        'border-right-color',
        'border-bottom-color',
        'border-left-color',
        'border-block-color',
        'border-block-start-color',
        'border-block-end-color',
        'border-inline-color',
        'border-inline-start-color',
        'border-inline-end-color',
        'outline',
        'outline-color',
        'box-shadow',
        'column-rule',
        'column-rule-color',
    ],
};

export const CSS_PROP_LIST = Object.values(CSS_PROP_SERIES).flat();
export const TABLE_NAME = ['TABLE', 'TR', 'TD', 'TH'];

export const IMPORTANT_REGEXP = / !important$/;

export const SEMICOLON_PLACEHOLDER = '<$#_SEMICOLON_#$>';
export const SEMICOLON_PLACEHOLDER_REGEXP = /<\$#_SEMICOLON_#\$>/g;

export const COLOR_REGEXP = /\brgba?\([^)]+\)/i;
export const COLOR_REGEXP_GLOBAL = /\brgba?\([^)]+\)/gi;
