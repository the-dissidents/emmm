import { Debug } from "$lib/Debug";

export class DebouncedTask<Args extends any[]> {
    private lastTime = 0;
    private scheduled?: NodeJS.Timeout;
    private currentArgs?: Args;

    constructor(
        private f: (...args: Args) => void,
        /** The minimal time between invocations */
        public timeout = 1000
    ) { }

    start(...args: Args) {
        this.currentArgs = args;
        if (this.scheduled) return;

        const time = performance.now();
        if (time - this.lastTime > this.timeout) {
            this.f(...args);
            this.lastTime = performance.now();
        } else {
            this.scheduled = setTimeout(() => {
                this.scheduled = undefined;
                Debug.assert(!!this.currentArgs);
                this.f(...this.currentArgs);
                this.lastTime = performance.now();
            }, time - this.lastTime);
        }
    }

    stop() {
        if (this.scheduled) {
            clearTimeout(this.scheduled);
            return true;
        }
        return false;
    }
}
