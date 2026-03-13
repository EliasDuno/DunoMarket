(function () {
    const session = sessionStorage.getItem('user_session');
    try {
        if (!session || session === 'null' || session === 'undefined') throw new Error('No session');
        const parsed = JSON.parse(session);
        if (!parsed || !parsed.id) throw new Error('Invalid session');
        document.write('<style>body { display: flex; }</style>');
        window.onload = function () { setTimeout(() => document.body.style.opacity = '1', 50); };
    } catch (e) {
        sessionStorage.removeItem('user_session');
        window.location.href = 'acceso.html';
    }
})();
