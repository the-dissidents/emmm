declare namespace JSX {
    // The return type of our JSX factory function
    type Element = HTMLElement | DocumentFragment;

    interface IntrinsicElements {
        [elemName: string]: any;
    }
}