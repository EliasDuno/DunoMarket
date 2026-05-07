(function () {
    const session = sessionStorage.getItem('user_session');
    const tenant = sessionStorage.getItem('tenant_slug');
    try {
        if (!session || session === 'null' || session === 'undefined' || !tenant) throw new Error('No session');
        const parsed = JSON.parse(session);
        if (!parsed || !parsed.id) throw new Error('Invalid session');
        document.write('<style>body { display: flex; }</style>');
        window.onload = function () { setTimeout(() => document.body.style.opacity = '1', 50); };
    } catch (e) {
        sessionStorage.removeItem('user_session');
        sessionStorage.removeItem('tenant_slug');
        window.top.location.replace('/acceso');
    }
})();
