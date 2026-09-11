import { Debug } from "$lib/Debug";

/** Note: in case the executor is async, this class does **not** prevent it from being called while a previous invocation still running */
export class DebouncedTask<Args extends any[]> {
    private lastTime = 0;
    private scheduled?: NodeJS.Timeout;
    private currentArgs?: Args;

    constructor(
        private f: (...args: Args) => void | Promise<void>,
        /** The minimal time between invocations */
        public timeout = 1000
    ) { }

    start(...args: Args) {
        this.currentArgs = args;
        if (this.scheduled) return;

        const time = performance.now();
        if (time - this.lastTime > this.timeout) {
            void this.f(...args);
            this.lastTime = performance.now();
        } else {
            this.scheduled = setTimeout(() => {
                this.scheduled = undefined;
                Debug.assert(!!this.currentArgs);
                void this.f(...this.currentArgs);
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
