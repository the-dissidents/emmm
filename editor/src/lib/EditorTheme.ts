import { EditorView } from "@codemirror/view";

export let DefaultTheme = EditorView.baseTheme({
    "&": {
        color: "black",
        backgroundColor: "white",
        width: '100%',
        maxWidth: '60em',
        boxShadow: '1px 2px 5px 0px #9E9E9E',
        "&.cm-focused": {
            outline: 'none'
        }
    },
    ".cm-content": {
        caretColor: "black",
    },
    ".cm-cursor": {
        borderLeftWidth: '1.5px'
    },
    "&.cm-focused .cm-cursor": {
        borderLeftColor: "black"
    },
    "&.cm-focused .cm-selectionBackground, ::selection": {
        backgroundColor: "#074"
    },
    ".cm-gutters": {
        fontSize: '85%',
        backgroundColor: "lightcoral",
        color: "lavenderblush",
        paddingRight: "0 5px",
        border: "none"
    }
});