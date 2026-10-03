import { get } from 'svelte/store';
import { _ } from 'svelte-i18n';

const categories: Record<string, string> = {
    'invalid-credentials': 'credentials',
    'proxy-required': 'proxy',
    'invalid-proxy-url': 'address',
    'invalid-proxy-credentials': 'proxy-credentials',
    'proxy-auth-required': 'proxy-credentials',
    'invalid-proxy-certificate': 'certificate',
    'weixin-unavailable': 'network',
    'operation-pending': 'uncertain',
    'operation-expired': 'uncertain',
    'operation-conflict': 'uncertain',
    'rate-limited': 'rate',
};

export function weixinError(error: unknown): string {
    const value = error instanceof Error ? error.message : String(error);
    if (value.startsWith('weixin-error:'))
        return get(_)('weixin.errors.wechat', {
            values: { code: value.split(':')[1] },
        });
    const category = categories[value];
    return category ? get(_)(`weixin.errors.${category}`) : value;
}
