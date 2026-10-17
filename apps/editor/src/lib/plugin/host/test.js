void (async () => {
    await init({
        id: 'test-plugin',
        version: '000001',
        names: {
            'en-us': 'Test',
            'zh-cn': '测试',
        },
        apiVersion: '000200',
        ui: [{
            input: 'textbox',
            key: 'message',
            names: { 'en-us': 'message', 'zh-cn': '消息', },
            defaultValue: 'ok'
        }, {
            action: 'button',
            key: 'test',
            names: { 'en-us': 'button', 'zh-cn': '按钮', },
        }]
    });
    await call('log', 'initialized');

    onAction('test', async () => {
        void call('messagebox', {
            msg: `${await get('message')}`,
            kind: 'info'
        });
    });

    on('ping', async () => {
        return `${await get('message')} ${await call('counter', undefined)}`;
    });

    on('finalize', async () => {
        await call('log', 'finalizing');
    });
})();
