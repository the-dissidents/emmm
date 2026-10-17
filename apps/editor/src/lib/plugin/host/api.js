/** @import { CommandName, CommandParam, CommandReturn, HookName, HookParam, HookReturn, PluginManifest } from '../Types' */

/**
 * @internal
 * @type {Partial<Record<HookName, (args: any) => any>>}
 */
let hookHandlers = {};

/**
 * @internal
 * @type {Record<string, () => any>}
 */
let actionCallbacks = {};

/** @internal */
let id = '';

/** @internal */
const ORIGIN = "*";

class PluginAPIError extends Error {
    payload;

    /**
     * @param {string} message
     * @param {any} payload
     */
    constructor(message, payload) {
        super(message);
        this.payload = payload;
    }
}

/**
 * @internal
 * @param {string} type
 */
const waitForMessage = async (type) => {
    return new Promise((resolve) => {
        const listener = (
            /** @type {MessageEvent} */ ev
        ) =>  {
            if (!ev.data || typeof ev.data !== 'object'
                || !('type' in ev.data)
                || ev.data.type !== type) return;
            resolve(ev.data);
            window.removeEventListener('message', listener);
        };
        window.addEventListener('message', listener);
    });
}

/**
 * Report to the host app that the plugin has been loaded. Commands and hooks are unavailable until this finishes.
 *
 * @param {PluginManifest} manifest
 */
async function init(manifest) {
    id = manifest.id;
    window.parent.postMessage({
        type: `plugin:ready`,
        ...manifest
    }, ORIGIN);
    await waitForMessage('host:ready');
}

/**
 * Invoke a command and retrieve the result.
 *
 * @template {CommandName} C
 * @param {C} name
 * @param {CommandParam<C>} args
 * @returns {Promise<CommandReturn<C>>}
 */
async function call(name, args) {
    window.parent.postMessage({
        type: `plugin:command:${name}`, id, args
    }, ORIGIN);
    const msg = await waitForMessage(`host:command:${name}`);
    if (msg.status === 'ok') return msg.result;
    throw new PluginAPIError(msg.message, msg.payload);
}

/**
 * Get the value of a config item.
 *
 * @param {string} key
 * @returns {Promise<unknown>}
 */
async function get(key) {
    return await call('get', key);
}

/**
 * Set the value of a config item.
 *
 * @param {string} key
 * @param {unknown} value
 * @returns {Promise<void>}
 */
async function set(key, value) {
    await call('set', { key, value });
}

// listen for hook notifications
window.addEventListener('message', async (ev) => {
    if (!ev.data || typeof ev.data !== 'object'
     || typeof ev.data.type !== 'string'
     || !ev.data.type.startsWith('host:hook:')) return;

    await call('log', `received hook notification: ${ev.data.type}`);

    /** @type {HookName} */
    const name = ev.data.type.slice('host:hook:'.length);
    /** @type {HookReturn<HookName> | undefined} */
    let result;

    if (name == 'action') {
        if (ev.data.args in actionCallbacks)
            await actionCallbacks[ev.data.args]();
    } else if (name in hookHandlers) {
        // @ts-ignore
        result = await hookHandlers[name](ev.data.args);
    }
    window.parent.postMessage({
        type: `plugin:hook:${name}`, id, result
    }, ORIGIN);
});

// listen for errors
window.addEventListener('error', (ev) => {
    void call('warn', ev.message);
});

/**
 * Register a hook callback. You should only register once for each hook.
 *
 * @template {HookName} H
 * @param {H} name
 * @param {(args: HookParam<H>) => HookReturn<H> | Promise<HookReturn<H>>} handler
 */
function on(name, handler) {
    if (name in hookHandlers) {
        void call('log', `warning: overwriting hook: ${name}`);
    }
    hookHandlers[name] = handler;
}

/**
 * Register an action callback. You should only register once for each action.
 *
 * @param {string} name
 * @param {() => void | Promise<void>} handler
 */
function onAction(name, handler) {
    if (name in actionCallbacks) {
        void call('log', `warning: overwriting action callback: ${name}`);
    }
    actionCallbacks[name] = handler;
}
