import { EditorView } from "@codemirror/view";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

const window = getCurrentWebviewWindow();
window.onDragDropEvent(({payload: ev}) => {
    if (ev.type == 'over') {
        const {x, y} = ev.position; //ev.position.toLogical(factor);
        const elem = document.elementFromPoint(x, y);
        if (!elem) return;
        elem.dispatchEvent(new DragEvent('dragover', {
            bubbles: true,
            clientX: x,
            clientY: y
        }));
    } else if (ev.type == 'drop') {
        const dataTransfer = new DataTransfer();
        dataTransfer.setData('emmm-file', ev.paths.join(':::'));
        const {x, y} = ev.position; //ev.position.toLogical(factor);
        const elem = document.elementFromPoint(x, y);
        if (!elem) return;
        elem.dispatchEvent(new DragEvent('drop', {
            bubbles: true,
            clientX: x,
            clientY: y,
            dataTransfer
        }));
    }
})

export const emmmDropImage = EditorView.domEventObservers({
    drop(event, view) {
        const str = event.dataTransfer?.getData('emmm-file');
        if (!str) return;
        const files = str.split(':::');
        const pos = view.posAtCoords({x: event.clientX, y: event.clientY});
        if (!pos) return;

        const result = files.map((x) => `[.image file:${x};]`).join('');
        view.dispatch({
            changes: [{
                from: pos, to: pos,
                insert: `\n${result}\n`
            }],
            selection: { anchor: pos + 1, head: pos + result.length + 1 }
        });
    }
})
