void (async () => {
    await init({
        id: 'get-ip',
        version: '000001',
        names: {
            'en-us': 'Retrieve public IP',
            'zh-cn': '获取本机公网 IP',
        },
        apiVersion: '000200',
        ui: [{
            input: 'select',
            key: 'method',
            names: { 'en-us': 'method', 'zh-cn': '方法', },
            options: ['ipinfo', 'ipify'],
            defaultValue: 'ipinfo'
        }, {
            input: 'textbox',
            key: 'ip',
            readonly: true,
            names: { 'en-us': 'public IP', 'zh-cn': '公网 IP', },
            defaultValue: ''
        }, {
            action: 'button',
            key: 'get-ip',
            names: { 'en-us': 'get IP', 'zh-cn': '获取', },
        }]
    });
    await call('log', 'initialized');

    onAction('get-ip', async () => {
        void (async () => {
            const method = await get('method');
            let r = await fetch(method == 'ipinfo' ? 'https://ipinfo.io/json'
                              : method == 'ipify'  ? 'https://api.ipify.org/?format=json'
                              : '?',
                { signal: AbortSignal.timeout(2000) });
            if (!r.ok) throw new Error();

            /** @type {string} */
            let ip = (await r.json()).ip;
            await set('ip', ip);
        })();
    });

    on('ping', async () => {
        return `${await get('message')} ${await call('counter', undefined)}`;
    });

    on('finalize', async () => {
        await call('log', 'finalizing');
    });
})();
