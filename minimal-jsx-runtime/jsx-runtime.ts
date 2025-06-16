/// <reference types="./jsx-runtime.d.ts" />

export class InvalidJSXError extends Error {
    constructor(msg: string, public readonly object: any) {
        super(msg);
        this.name = 'InvalidJSXError';
    }
}

export const Fragment = (props: { children?: any }): DocumentFragment => {
    const fragment = document.createDocumentFragment();
    if (props.children) {
        appendChildren(fragment, [props.children]);
    }
    return fragment;
};

export function jsx(
    type: string | ((props: any) => JSX.Element),
    props: { [key: string]: any },
    key?: string
): JSX.Element {
    if (key) {
        // TODO: what's this for?
    }

    if (typeof type === 'function')
        return type(props);

    const element = document.createElement(type);
    const { children, ...restProps } = props;
    for (const key in restProps) {
        const value = restProps[key];
        if (typeof value === 'boolean' && value) {
            element.setAttribute(key, '');
        } else if (value != null) {
            element.setAttribute(key, value.toString());
        }
    }
    // Append children
    if (children)
        appendChildren(element, [children]);

    return element;
};

export const jsxs = jsx;
export const jsxDEV = jsx;

function appendChildren(parent: HTMLElement | DocumentFragment, children: any[]) {
    children.flat().forEach(child => {
        if (child instanceof Node) {
            parent.appendChild(child);
        } else if (typeof child == 'string') {
            parent.appendChild(new Text(child));
        } else {
            throw new InvalidJSXError(`invalid children in JSX`, child);
        }
    });
}