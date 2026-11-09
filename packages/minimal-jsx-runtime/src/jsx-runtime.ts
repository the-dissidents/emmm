export namespace JSX {
    // The return type of our JSX factory function
    export type Element = HTMLElement | DocumentFragment;

    export interface IntrinsicElements {
        [elemName: string]: any;
    }
}

export class InvalidJSXError extends Error {
    constructor(msg: string, public readonly object: any) {
        super(msg);
        this.name = 'InvalidJSXError';
    }
}

let D: Document | undefined = 'window' in globalThis ? globalThis.window.document : undefined;

export function useDocument(d: Document) {
    D = d;
}

function assert(c: boolean): asserts c {
    console.assert(c, '[minimal-jsx-runtime] assertion failed');
}

export const Fragment = (props: { children?: any }): DocumentFragment => {
    assert(D !== undefined);
    const fragment = D.createDocumentFragment();
    if (props.children) {
        appendChildren(fragment, [props.children]);
    }
    return fragment;
};

export function jsx(
    tag: string | ((props: any) => JSX.Element),
    props: { [key: string]: any },
): JSX.Element {
    if (typeof tag === 'function')
        return tag(props);

    assert(D !== undefined);
    const element = D.createElement(tag);
    const { children, ...restProps } = props;
    for (const key in restProps) {
        const value = restProps[key];
        if (typeof value === 'boolean' && value) {
            element.setAttribute(key, '');
        } else if (value != null) {
            element.setAttribute(key, value.toString());
        }
    }

    if (children) appendChildren(element, [children]);
    return element;
};

export const jsxs = jsx;
export const jsxDEV = jsx;

function isNode(n: any): n is Node {
    return typeof n === "object" && 'nodeType' in n && 'nodeName' in n && 'ownerDocument' in n;
}

function appendChildren(parent: HTMLElement | DocumentFragment, children: any[]) {
    children.flat(Infinity).forEach(child => {
        // Skip any falsy item.
        // This allows for Astro-like syntaxes e.g. `{visible && <p>Show me!</p>}`
        if (!child) return;

        if (isNode(child)) {
            parent.appendChild(child);
        } else if (typeof child != 'function'
                && typeof child != 'object'
        ) {
            assert(D !== undefined);
            parent.appendChild(D.createTextNode(String(child)));
        } else {
            throw new InvalidJSXError(`invalid children in JSX`, child);
        }
    });
}
