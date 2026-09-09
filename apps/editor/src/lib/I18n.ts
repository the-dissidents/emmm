import { init, register, _, unwrapFunctionStore, locale } from 'svelte-i18n';
import { get } from 'svelte/store';
import en from '../locales/en-us.json';
import zh from '../locales/zh-cn.json';

register('en-us', () => Promise.resolve(en));
register('zh-cn', () => Promise.resolve(zh));

init({
	fallbackLocale: 'en-us',
	initialLocale: 'zh-cn',
});

export const $_ = unwrapFunctionStore(_);
export { locale };

export function getLocale(): string {
	return get(locale) ?? 'en-us';
}
