/**
 * NUCLEO.JS (CORE.JS)
 * Lógica compartida para Autenticación, Barra Lateral, Notificaciones y Alertas.
 * Reemplaza app.js, alerts.js y partes compartidas de script.js
 */

function isAccessPage() {
    const path = window.location.pathname.replace(/\/+$/, '');
    const page = path.split('/').pop();
    return page === 'acceso' || page === 'acceso.html';
}


async function readApiResponse(res) {
    const contentType = res.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
        return res.json();
    }

    const text = await res.text();
    return {
        success: false,
        message: text || `Respuesta inesperada del servidor (${res.status})`
    };
}

document.addEventListener('DOMContentLoaded', () => {
    // 1. Verificación Global de Auth (Omitir para acceso.html)
    if (!isAccessPage()) {
        checkGlobalAuth();
        checkPagePermission();
        loadGlobalProfile();
        checkAlerts(); // From alerts.js
        initInactivityTimer(); // Auto-Logout
    }

    // --- FETCH INTERCEPTOR FOR MULTI-TENANCY ---
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
        let [resource, config] = args;
        const tenantSlug = sessionStorage.getItem('tenant_slug');
        const userSession = sessionStorage.getItem('user_session');
        
        if (tenantSlug && resource.toString().includes('/api') && !resource.toString().includes('/api/saas')) {
            if (!config) config = {};
            if (!config.headers) config.headers = {};
            
            // Only add if not already present
            if (!config.headers['x-tenant-slug']) {
                config.headers['x-tenant-slug'] = tenantSlug;
            }

            // Add user context if present in session
            if (userSession) {
                try {
                    const user = JSON.parse(userSession);
                    if (user && user.rol && !config.headers['x-user-role']) {
                        config.headers['x-user-role'] = user.rol;
                    }
                    if (user && user.id && !config.headers['x-user-id']) {
                        config.headers['x-user-id'] = user.id.toString();
                    }
                } catch (e) {
                    console.error('Error parsing user session in fetch interceptor:', e);
                }
            }
        }
        return originalFetch(resource, config);
    };

    // 4. Preserve Sidebar Scroll Position
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
        // Restore scroll position
        const savedScroll = sessionStorage.getItem('sidebarScroll');
        if (savedScroll) {
            sidebar.scrollTop = savedScroll;
        }

        // Save scroll position on scroll
        sidebar.addEventListener('scroll', () => {
            sessionStorage.setItem('sidebarScroll', sidebar.scrollTop);
        });
    }

    // 5. IFRAME / EMBED MODE DETECTION
    if (window.self !== window.top) {
        document.body.classList.add('embed-mode');
    }

    // Modal Global Click Listeners
    window.onclick = (event) => {
        const notifModal = document.getElementById('notificationModal');
        const confirmModal = document.getElementById('confirmModal');
        const recoverModal = document.getElementById('recoverModal');
        // Alerts dropdown handling is in checkAlerts/toggleAlerts
        // const alertsContainer = document.getElementById('alertsDropdownContainer');

        if (event.target == notifModal) closeNotification();
        if (event.target == confirmModal) closeConfirm(false);
        if (event.target == recoverModal) closeRecoverModal();
    };

    // --- LOGIN HANDLER ---
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const btn = loginForm.querySelector('button[type="submit"]');

            if (btn) { btn.disabled = true; btn.innerText = 'Cargando...'; }

            try {
                const tenant = document.getElementById('tenant').value.trim().toLowerCase();
const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'x-tenant-slug': tenant
                    },
                    body: JSON.stringify({ email, password })
                });

const data = await readApiResponse(res);

                if (res.ok) {
                    sessionStorage.setItem('tenant_slug', tenant);
                    sessionStorage.setItem('user_session', JSON.stringify(data.user));
                    window.location.href = '/';
                } else {
showNotification('Error', data.message || `Error del servidor (${res.status})`);
                    if (btn) { btn.disabled = false; btn.innerText = 'Acceder'; }
                }
            } catch (error) {
                console.error('Error logging in:', error);
                showNotification('Error de Conexión', error.message || 'No se pudo conectar con el servidor.');
                if (btn) { btn.disabled = false; btn.innerText = 'Acceder'; }
            }
        });
    }


    // --- PASSWORD RECOVERY HANDLER ---
    const recoverForm = document.getElementById('recoverForm');
    if (recoverForm) {
        recoverForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const recoverEmailEl = document.getElementById('recoverEmail');
            const recoverTenantEl = document.getElementById('recoverTenant');
            const loginTenantEl = document.getElementById('tenant');
            const submitBtn = recoverForm.querySelector('button[type="submit"]');
            const email = recoverEmailEl ? recoverEmailEl.value.trim().toLowerCase() : '';
            const tenant = (recoverTenantEl?.value.trim() || loginTenantEl?.value.trim() || '').toLowerCase();

            if (!tenant) {
                showNotification('Falta información', 'Ingresa el Código de Empresa para enviar la solicitud.');
                return;
            }

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerText = 'Enviando...';
            }

            try {
                const res = await fetch('/api/recover-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-tenant-slug': tenant
                    },
                    body: JSON.stringify({ email })
                });

                const data = await readApiResponse(res);

                if (res.ok && data.success) {
                    closeRecoverModal();
                    recoverForm.reset();
                    showNotification('Solicitud enviada', data.message || 'Se notificó a los administradores.');
                } else {
                    showNotification('Error', data.message || `Error del servidor (${res.status})`);
                }
            } catch (error) {
                console.error('Error en recuperación de contraseña:', error);
                showNotification('Error', 'No se pudo conectar con el servidor.');
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerText = 'Enviar Solicitud';
                }
            }
        });
    }
});

// --- AUTENTICACIÓN ---

function redirectToAccess() {
    sessionStorage.removeItem('user_session');
    sessionStorage.removeItem('tenant_slug');
    localStorage.removeItem('user_session');

    if (!isAccessPage()) {
        window.top.location.replace('/acceso');
    }
}

function checkGlobalAuth() {
    const userSession = sessionStorage.getItem('user_session');
    const tenantSlug = sessionStorage.getItem('tenant_slug');

    // Check for null, undefined, empty string, string "null"/"undefined", or incomplete tenant data.
    if (!userSession || userSession === 'null' || userSession === 'undefined' || !tenantSlug) {
        redirectToAccess();
        return;
    }

    try {
        const session = JSON.parse(userSession);
        if (!session || !session.id) {
            throw new Error('Invalid session');
        }
    } catch (e) {
        redirectToAccess();
    }
}

function checkPagePermission() {
    const userSession = sessionStorage.getItem('user_session');
    if (!userSession) return;
    
    try {
        const user = JSON.parse(userSession);
        const userRole = (user.rol || 'usuario').toLowerCase();
        const isSuperAdmin = userRole === 'superadmin' || userRole === 'soporte';
        const isAdmin = userRole === 'admin' || userRole === 'administrador';
        
        const path = window.location.pathname.toLowerCase();
        const page = path.split('/').pop().split('?')[0];

        // Restringir superadmin.html a superadmin y soporte únicamente
        if (page === 'superadmin.html') {
            if (!isSuperAdmin) {
                console.warn(`Acceso denegado a superadmin.html para el rol ${userRole}.`);
                if (window.self !== window.top) {
                    window.location.replace('resumen.html');
                } else {
                    window.location.replace('/');
                }
                return;
            }
        }
        
        // Pages that require admin privileges
        const adminOnlyPages = [
            'usuarios.html',
            'configuracion.html',
            'reportes.html',
            'categorias.html',
            'proveedores.html',
            'cuentas.html'
        ];

        // Bloquear superadmin de las páginas administrativas del negocio local
        if (isSuperAdmin && adminOnlyPages.includes(page)) {
            console.warn(`Acceso denegado a página local: ${page} para superadmin.`);
            if (window.self !== window.top) {
                window.location.replace('superadmin.html');
            } else {
                window.location.replace('/');
            }
            return;
        }
        
        if (!isAdmin && !isSuperAdmin && adminOnlyPages.includes(page)) {
            console.warn(`Acceso denegado a la página: ${page} para rol ${userRole}.`);
            if (window.self !== window.top) {
                window.location.replace('resumen.html');
            } else {
                window.location.replace('/');
            }
        }
    } catch (e) {
        console.error('Error checking page permissions:', e);
    }
}

function filterSidebarByRole(role) {
    const userRole = (role || 'usuario').toLowerCase();
    const isSuperAdmin = userRole === 'superadmin' || userRole === 'soporte';
    const isAdmin = userRole === 'admin' || userRole === 'administrador';
    
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;

    // Páginas permitidas por rol
    let allowedPages = [];
    if (isSuperAdmin) {
        allowedPages = ['superadmin.html'];
    } else if (isAdmin) {
        allowedPages = []; // Bypass check
    } else {
        allowedPages = ['resumen.html', 'pdv.html', 'inventario.html', 'clientes.html'];
    }
    
    const navLinks = sidebar.querySelectorAll('.nav-item');
    navLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (!href) return;
        
        const page = href.split('/').pop().split('?')[0];

        // Regla específica para el enlace del Portal SaaS
        if (page === 'superadmin.html') {
            if (isSuperAdmin) {
                link.style.display = 'flex';
            } else {
                link.style.display = 'none';
            }
            return;
        }

        if (isSuperAdmin) {
            // Superadmin solo ve el portal SaaS (superadmin.html) y la raíz interna
            if (!allowedPages.includes(page) && page !== '' && page !== 'index.html' && page !== 'resumen.html') {
                link.style.display = 'none';
            } else {
                link.style.display = 'flex';
            }
        } else if (!isAdmin) {
            // Usuario común
            if (!allowedPages.includes(page) && page !== '' && page !== 'index.html') {
                link.style.display = 'none';
            } else {
                link.style.display = 'flex';
            }
        } else {
            // Administrador local de negocio
            link.style.display = 'flex';
        }
    });

    // Hide sidebar labels if they have no visible siblings
    const labels = sidebar.querySelectorAll('.sidebar-label');
    labels.forEach(label => {
        let sibling = label.nextElementSibling;
        let hasVisibleSibling = false;
        while (sibling && !sibling.classList.contains('sidebar-label') && !sibling.classList.contains('sidebar-footer')) {
            if (sibling.classList.contains('nav-item') && sibling.style.display !== 'none') {
                hasVisibleSibling = true;
                break;
            }
            sibling = sibling.nextElementSibling;
        }

        if (isSuperAdmin) {
            if (!hasVisibleSibling) {
                label.style.display = 'none';
            } else {
                label.style.display = 'block';
            }
        } else if (!isAdmin && !hasVisibleSibling) {
            label.style.display = 'none';
        } else {
            label.style.display = 'block'; // Admin ve todos los labels
        }
    });
}

function loadGlobalProfile() {
    const userSession = sessionStorage.getItem('user_session'); // Changed to sessionStorage
    if (!userSession) return;

    const user = JSON.parse(userSession);

    // Apply role-based navigation visibility always on load
    filterSidebarByRole(user.rol);

    // Si es superadmin o soporte, y está cargando la página principal, redirigir el iframe por defecto a superadmin.html
    const isSuperAdmin = user.rol === 'superadmin' || user.rol === 'soporte';
    if (isSuperAdmin) {
        const path = window.location.pathname.toLowerCase();
        const page = path.split('/').pop().split('?')[0];
        if (page === '' || page === 'index.html') {
            const iframe = document.querySelector('iframe[name="content-main"]');
            if (iframe && (iframe.src.endsWith('resumen.html') || iframe.getAttribute('src') === 'resumen.html')) {
                iframe.src = 'superadmin.html';
                
                // Cambiar el item activo de la barra lateral al Portal SaaS
                const sidebar = document.querySelector('.sidebar');
                if (sidebar) {
                    sidebar.querySelectorAll('.nav-item').forEach(link => {
                        link.classList.remove('active');
                        const href = link.getAttribute('href');
                        if (href && href.includes('superadmin.html')) {
                            link.classList.add('active');
                        }
                    });
                }
            }
        }
    }

    // Sidebar & Header Profile Logic
    const profileHeader = document.getElementById('userProfileHeader');
    const profileName = document.getElementById('profileName');
    const profileRole = document.getElementById('profileRole');
    const avatarContainer = document.getElementById('profileAvatarContainer');

    if (profileHeader && profileName) {
        profileHeader.style.display = 'flex';
        profileName.innerText = user.nombre || user.email;
        if (profileRole) profileRole.innerText = user.rol;

        // Load Avatar
        if (avatarContainer) {
            const avatarUrl = `/api/users/${user.id || 0}/avatar`;
            const img = new Image();
            img.src = avatarUrl;
            img.onload = () => {
                avatarContainer.innerHTML = `<img src="${avatarUrl}?t=${new Date().getTime()}" alt="Avatar">`;

                // Update Sidebar Avatar if exists
                document.querySelectorAll('.user-mini-avatar').forEach(el => {
                    // Optional: update sidebar avatar too
                });
            };
        }
    }
}

// Global Logout Function
window.logout = function () {
    sessionStorage.removeItem('user_session');
    sessionStorage.removeItem('tenant_slug');
    localStorage.removeItem('user_session'); // Clean up old sessions just in case
    window.location.replace('/acceso');
};

// --- INACTIVITY TIMER ---
function initInactivityTimer() {
    let timeout;
    const LIMIT = 10 * 60 * 1000; // 10 minutes

    function resetTimer() {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            console.log('Sesión expirada por inactividad.');
            window.logout();
        }, LIMIT);
    }

    // Events to monitor
    // Use resetTimer() immediately since we are in DOMContentLoaded or later
    resetTimer();

    // Use addEventListener to avoid overwriting window.onload or other handlers
    window.addEventListener('load', resetTimer);
    document.addEventListener('mousemove', resetTimer);
    document.addEventListener('keypress', resetTimer);
    document.addEventListener('click', resetTimer);
    document.addEventListener('scroll', resetTimer);
}

// --- NOTIFICACIONES Y MODALES ---

window.formatCurrency = function (amount, currency = 'Bs') {
    if (amount === undefined || amount === null || isNaN(amount)) return `0,00 ${currency}`;
    
    // Configuración para el formato venezolano (. para miles, , para decimales)
    const formatter = new Intl.NumberFormat('es-VE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
    
    return `${formatter.format(amount)} ${currency}`;
};

window.showNotification = function (title, message) {
    const modal = document.getElementById('notificationModal');
    const titleEl = document.getElementById('notificationTitle');
    const msgEl = document.getElementById('notificationMessage');

    if (modal && msgEl) {
        if (titleEl) titleEl.innerText = title;
        msgEl.innerText = message;
        modal.style.display = 'flex';
    } else {
        alert(`${title}: ${message}`);
    }
};

window.closeNotification = function () {
    const modal = document.getElementById('notificationModal');
    if (modal) modal.style.display = 'none';
};

window.openRecoverModal = function () {
    const modal = document.getElementById('recoverModal');
    const loginTenantEl = document.getElementById('tenant');
    const recoverTenantEl = document.getElementById('recoverTenant');

    if (recoverTenantEl && loginTenantEl?.value.trim()) {
        recoverTenantEl.value = loginTenantEl.value.trim();
    }

    if (modal) modal.style.display = 'flex';
};

window.closeRecoverModal = function () {
    const modal = document.getElementById('recoverModal');
    if (modal) modal.style.display = 'none';
};

// Confirm Modal Logic
let confirmCallback = null;

window.showConfirm = function (message, title = 'Confirmación') {
    const confirmModal = document.getElementById('confirmModal');
    const confirmTitle = document.getElementById('confirmTitle');
    const confirmMessage = document.getElementById('confirmMessage');

    return new Promise((resolve) => {
        if (confirmTitle) confirmTitle.innerText = title;
        if (confirmMessage) confirmMessage.innerText = message;

        // If modal exists in DOM
        if (confirmModal) {
            confirmModal.style.display = 'flex';
            confirmCallback = resolve;

            // Setup button listeners once or ensure we don't duplicate
            const btnOk = document.getElementById('btnConfirmOk');
            const btnCancel = document.getElementById('btnConfirmCancel');

            // We use a simple one-off handler strategy or rely on global onclick helpers if preferred.
            // Simplified:
            if (btnOk && btnCancel) {
                btnOk.onclick = () => closeConfirm(true);
                btnCancel.onclick = () => closeConfirm(false);
            }
        } else {
            // Fallback
            resolve(confirm(message));
        }
    });
};

window.closeConfirm = function (result) {
    const confirmModal = document.getElementById('confirmModal');
    if (confirmModal) confirmModal.style.display = 'none';
    if (confirmCallback) {
        confirmCallback(result);
        confirmCallback = null;
    }
};

// --- SISTEMA DE ALERTAS ---

async function checkAlerts() {
    // Verificar rol antes de proceder con las alertas
    const userSession = sessionStorage.getItem('user_session');
    if (userSession) {
        try {
            const user = JSON.parse(userSession);
            const userRole = (user.rol || 'usuario').toLowerCase();
            const isAdmin = userRole === 'admin' || userRole === 'administrador';
            if (!isAdmin) {
                const alertsContainer = document.getElementById('alertsIconContainer');
                if (alertsContainer) alertsContainer.style.display = 'none';
                return;
            }
        } catch (e) {
            console.error('Error al comprobar rol en alertas:', e);
        }
    }

    // 1. Create Bell Icon if not exists
    let alertsContainer = document.getElementById('alertsIconContainer');

    // Check if we need to clean up old container from header (if exists from previous version)
    const oldContainer = document.getElementById('alertsDropdownContainer');
    if (oldContainer) oldContainer.remove();

    if (!alertsContainer) {
        const sidebarBrand = document.querySelector('.sidebar-brand');
        if (sidebarBrand && sidebarBrand.parentNode) {
            alertsContainer = document.createElement('div');
            alertsContainer.id = 'alertsIconContainer';
            alertsContainer.className = 'alerts-sidebar-item';

            // Icono de campana
            alertsContainer.innerHTML = `
                <div class="bell-wrapper-sidebar" onclick="toggleAlerts(event)">
                    <i class="fas fa-bell"></i>
                    <span id="alertBadge" class="alert-badge" style="display:none;">0</span>
                </div>
            `;

            // Insert after logo (sidebar-brand)
            sidebarBrand.insertAdjacentElement('afterend', alertsContainer);

            // Create Dropdown appended to BODY to avoid clipping by sidebar overflow
            if (!document.getElementById('alertsDropdown')) {
                const dropdown = document.createElement('div');
                dropdown.id = 'alertsDropdown';
                dropdown.className = 'alerts-dropdown-fixed';
                dropdown.innerHTML = `
                    <div id="alertsList" class="alerts-list">
                        <p class="no-alerts">Sin Alertas</p>
                    </div>
                `;
                document.body.appendChild(dropdown);
            }

            // Inject styles dynamically for sidebar icon and fixed dropdown
            const style = document.createElement('style');
            style.innerHTML = `
                .alerts-sidebar-item {
                    display: flex;
                    justify-content: center;
                    margin-bottom: 1rem;
                    width: 100%;
                }
                .bell-wrapper-sidebar {
                    position: relative;
                    cursor: pointer;
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    background: rgba(255,255,255,0.05);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s;
                    color: var(--text-muted);
                }
                .bell-wrapper-sidebar:hover {
                    background: rgba(99, 102, 241, 0.2);
                    color: white;
                }
                .bell-wrapper-sidebar i {
                    font-size: 1.2rem;
                }
                .alerts-dropdown-fixed {
                    position: fixed;
                    display: none;
                    width: 300px;
                    background: #1e293b;
                    border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 1rem;
                    box-shadow: 0 10px 25px rgba(0,0,0,0.5);
                    z-index: 9999;
                    padding: 0.5rem 0;
                    margin-left: 10px; /* Gap from sidebar */
                }
                .alert-item {
                    padding: 0.8rem 1rem;
                    border-bottom: 1px solid rgba(255,255,255,0.05);
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    transition: background 0.2s;
                }
                .alert-item:hover {
                    background: rgba(255,255,255,0.05);
                }
                .alert-item:last-child {
                    border-bottom: none;
                }
                .no-alerts {
                    padding: 1rem;
                    text-align: center;
                    color: var(--text-muted);
                    font-size: 0.9rem;
                }
                .alert-badge {
                    position: absolute;
                    top: -2px;
                    right: -2px;
                    background: #ef4444;
                    color: white;
                    font-size: 0.7rem;
                    padding: 0.1rem 0.4rem;
                    border-radius: 10px;
                    border: 2px solid #0f172a;
                }
            `;
            document.head.appendChild(style);
        }
    }

    // 2. Fetch Alerts
    try {
        const res = await fetch('/api/alerts');
        const data = await res.json();
        const badge = document.getElementById('alertBadge');
        const list = document.getElementById('alertsList');

        if (badge && list) {
            if (data.count > 0) {
                badge.innerText = data.count;
                badge.style.display = 'block';

                list.innerHTML = '';
                data.alerts.forEach(alert => {
                    const div = document.createElement('div');
                    div.className = 'alert-item';
                    div.innerHTML = `
                        <div class="alert-icon"><i class="fas fa-exclamation-circle" style="color: #ef4444;"></i></div>
                        <div class="alert-info" style="font-size: 0.85rem;">
                            <strong style="color: #f8fafc; display: block;">${alert.proveedor_nombre}</strong>
                            <span style="color: #94a3b8;">$${alert.monto_total_usd} - Vence: ${new Date(alert.fecha_vencimiento).toLocaleDateString()}</span>
                        </div>
                    `;
                    div.onclick = () => window.location.href = 'cuentas.html';
                    list.appendChild(div);
                });
            } else {
                badge.style.display = 'none';
                list.innerHTML = '<p class="no-alerts">Sin Alertas</p>';
            }
        }
    } catch (err) {
        console.error('Error checking alerts:', err);
    }
}

window.toggleAlerts = function (event) {
    if (event) event.stopPropagation();

    const dropdown = document.getElementById('alertsDropdown');
    const icon = document.querySelector('.bell-wrapper-sidebar');

    if (dropdown && icon) {
        if (dropdown.style.display === 'block') {
            dropdown.style.display = 'none';
        } else {
            // Calculate position
            const rect = icon.getBoundingClientRect();
            dropdown.style.top = `${rect.top}px`;
            dropdown.style.left = `${rect.right}px`; // Right of the bell
            dropdown.style.display = 'block';

            // Close on click outside
            const closeHandler = function (e) {
                if (!dropdown.contains(e.target) && !icon.contains(e.target)) {
                    dropdown.style.display = 'none';
                    document.removeEventListener('click', closeHandler);
                }
            };
            document.addEventListener('click', closeHandler);
        }
    }
};
