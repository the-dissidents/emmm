import { EditorView } from "@codemirror/view";

export const emmmTheme = [
    EditorView.baseTheme({
        "&": {
            width: '100%',
            maxWidth: '60em',
            lineHeight: '120%',
            "&.cm-focused": {
                outline: 'none'
            }
        },
        "&light": {
            color: "black",
            backgroundColor: "white",
            boxShadow: '1px 2px 5px 0px #9E9E9E',
            border: '1px solid #f0a299',
        },
        "&dark": {
            color: "white",
            backgroundColor: "#222",
            border: '1px solid #8d6262',
            boxShadow: 'none',
        },
        ".cm-gutters": {
            fontSize: '85%',
            fontFamily: 'Roboto Mono, Menlo, Consolas, 等线, monospace',
            padding: '0 5px 0 10px',
            // use margin to pad here instead
            marginRight: "15px",
            justifyContent: "right",
            minWidth: '50px',
            border: "none",
            backgroundColor: "#f0a299",
            color: "lavenderblush",
        },
        "&dark .cm-gutters": {
            backgroundColor: "#8d6262",
            color: "lavenderblush",
        },
        ".cm-content": {
            caretColor: "black",
            fontFamily: 'Roboto Mono, Menlo, Consolas, 等线, monospace',
        },
        "&light .cm-activeLine": {
            backgroundColor: "#f0a29922",
        },
        "&dark .cm-activeLine": {
            backgroundColor: "#3a3a3a66",
        },
        "&light .cm-selectionBackground": {
            backgroundColor: "#f0a29966",
        },
        "&dark .cm-selectionBackground": {
            backgroundColor: "#006aff66 !important",
        },
        ".cm-line": {
            padding: '0 15px 0 0',
            paddingLeft: 'calc(var(--hanging) + var(--normal))',
            textIndent: 'calc(var(--hanging) * -1)',
            position: 'relative'
        },
        ".fu-indentation-container": {
            display: 'contents'
        },
        ".fu-indentation": {
            width: 'calc(var(--normal) - 2px)',
            borderBottom: '2px dotted #CCC',
            position: 'absolute',
            left: '1px',
            top: '0.5lh'
        },
        ".fu-hanging-visualizer": {
            borderLeft: '4px solid #CCC',
            position: 'absolute',
            left: 'calc(var(--hanging) - 1ch - 4px)',
            top: 'calc(1lh + 2px)',
            bottom: '0',
        },
        ".cm-cursor, .cm-dropCursor": {
            borderLeftWidth: '1.5px'
        },
        ".cm-cursor": {
            display: 'block',
        },
        "&.cm-focused .cm-selectionBackground, ::selection": {
            backgroundColor: "#074"
        },
        ".cm-highlightSpace": {
            backgroundImage: "radial-gradient(circle at 50% 55%, #fff 15%, transparent 5%)"
        },
        "&dark .cm-highlightSpace": {
            backgroundImage: "radial-gradient(circle at 50% 55%, #222 15%, transparent 5%)"
        },

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
        ".em-role-pre": {
            fontFamily: 'Courier',
            wordBreak: 'break-all'
        },
        ":where(.em-role-heading)": {
            color: 'Crimson',
            fontWeight: 'bold'
        },
        ".em-role-comment": {
            color: 'darkgreen',
            fontStyle: 'italic'
        },

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
        },
    })
];
