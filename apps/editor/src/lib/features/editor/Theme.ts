import { EditorView } from "@codemirror/view";

export const emmmTheme = [
    EditorView.baseTheme({
        "&": {
            color: "black",
            backgroundColor: "white",
            width: '100%',
            maxWidth: '60em',
            lineHeight: '120%',
            boxShadow: '1px 2px 5px 0px #9E9E9E',
            border: '1px solid lightcoral',
            "&.cm-focused": {
                outline: 'none'
            }
        },
        ".cm-content": {
            caretColor: "black",
            fontFamily: 'Roboto Mono, Menlo, Consolas, 等线, monospace',
        },
        ".cm-line": {
            // avoid messing up wrap indent above
            padding: '0 15px 0 0',
        },
        ".cm-cursor, .cm-dropCursor": {
            borderLeftWidth: '1.5px'
        },
        "&.cm-focused .cm-selectionBackground, ::selection": {
            backgroundColor: "#074"
        },
        ".cm-gutters": {
            fontSize: '85%',
            fontFamily: 'Roboto Mono, Menlo, Consolas, 等线, monospace',
            backgroundColor: "lightcoral",
            color: "lavenderblush",
            padding: '0 5px 0 10px',
            // use margin to pad here instead
            marginRight: "15px",
            justifyContent: "right",
            minWidth: '50px',
            border: "none"
        },
        ".cm-gutterElement:nth-child(even)": {
            // TODO: change background color (needs to extend, how?)
            // backgroundColor: "lightpink",
        },
        ".cm-lineNumbers .cm-gutterElement": {
            // TODO: vertically center text
        },
        ".cm-highlightSpace": {
            backgroundImage: "radial-gradient(circle at 50% 55%, #fff 15%, transparent 5%)"
        },
    }),
    EditorView.baseTheme({
        ".em-pre": {
            fontFamily: 'Courier',
            wordBreak: 'break-all'
        },
        ".em-args": {
            color: 'dimgray'
        },
        ".em-escape": {
            color: 'gainsboro'
        },
        ".em-interp": {
            color: 'darkorange',
            fontWeight: '600'
        },
        ".em-system": {
            color: 'palevioletred',
            fontWeight: '600'
        },
        ".em-modifier": {
            color: 'steelblue',
            fontWeight: '600'
        },
        ":where(.em-role-link)": {
            color: 'darkblue',
            textDecoration: 'underline'
        },
        ".em-role-emphasis": {
            fontStyle: 'italic'
        },
        ".em-role-keyword": {
            fontWeight: 'bold'
        },
        ".em-role-highlight": {
            backgroundColor: 'color-mix(in srgb, yellow, transparent 50%)'
        },
        ".em-role-commentary": {
            color: 'gray',
        },
        ":where(.em-role-heading)": {
            color: 'darkred',
            fontWeight: 'bold'
        },
        ".em-role-comment": {
            color: 'darkgreen',
            fontStyle: 'italic'
        },
    }),
    EditorView.baseTheme({
        ".fu-structure-container": {
            height: '100%',
            textAlign: 'right'
        },
        ".fu-structure": {
            display: 'inline-block',
            boxSizeing: 'content-box',
            width: '6px',
            height: '100%',
        },
        ".fu-Top": {
            boxShadow: '0 0.5px 0 white inset, 0 -0.5px 0 white',
            transform: 'translate(0, 6px)',
        },
        ".fu-Bottom": {
            boxShadow: '0 -0.5px 0 white inset, 0 0.5px 0 white',
            transform: 'translate(0, -6px)',
        },
        ".fu-Vertical": {
            boxShadow: '-1px 0 0 white',
            transform: 'translate(50%, 0)',
        },
        ".fu-Begin, .fu-TopJoin": {
            boxShadow: '-1px -0.5px 0 white, 0 0.5px 0 white inset',
            transform: 'translate(50%, 6px)',
        },
        ".fu-End, .fu-BottomJoin": {
            boxShadow: '-1px 0.5px 0 white, 0 -0.5px 0 white inset',
            transform: 'translate(50%, -6px)',
        },
        ".cm-tooltip": {
            border: 'none',
            boxShadow: '3px 2px 5px 0px rgba(0,0,0,0.5)',
            borderRadius: '4px',
            backgroundColor: 'white',
            overflow: 'hidden',
            fontSize: '85%'
        }
    })
];
