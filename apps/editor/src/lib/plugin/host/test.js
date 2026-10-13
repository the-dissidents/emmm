void (async () => {
    await init({
        id: 'test-plugin',
        version: '000001',
        names: {
            'en-us': 'Test',
            'zh-cn': '测试',
        },
        apiVersion: '000200'
    });
    await call('log', 'initialized');

    on('ping', async () => {
        return `counter=${await call('counter', undefined)}`;
    });

    on('finalize', async () => {
        await call('log', 'finalizing');
    });
})();
