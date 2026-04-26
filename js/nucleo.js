/**
 * NUCLEO.JS (CORE.JS)
 * Lógica compartida para Autenticación, Barra Lateral, Notificaciones y Alertas.
 * Reemplaza app.js, alerts.js y partes compartidas de script.js
 */

document.addEventListener('DOMContentLoaded', () => {
    // 1. Verificación Global de Auth (Omitir para acceso.html)
    if (!window.location.pathname.includes('acceso.html')) {
        checkGlobalAuth();
        loadGlobalProfile();
        checkAlerts(); // From alerts.js
        initInactivityTimer(); // Auto-Logout
    }

    // --- FETCH INTERCEPTOR FOR MULTI-TENANCY ---
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
        let [resource, config] = args;
        const tenantSlug = sessionStorage.getItem('tenant_slug');
        
        if (tenantSlug && resource.toString().includes('localhost:3000/api') && !resource.toString().includes('/api/saas')) {
            if (!config) config = {};
            if (!config.headers) config.headers = {};
            
            // Only add if not already present
            if (!config.headers['x-tenant-slug']) {
                config.headers['x-tenant-slug'] = tenantSlug;
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
                const tenant = document.getElementById('tenant').value;
                const res = await fetch('http://localhost:3000/api/login', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'x-tenant-slug': tenant
                    },
                    body: JSON.stringify({ email, password })
                });

                const data = await res.json();

                if (res.ok) {
                    sessionStorage.setItem('tenant_slug', tenant);
                    sessionStorage.setItem('user_session', JSON.stringify(data.user));
                    window.location.href = 'inicio.html';
                } else {
                    showNotification('Error', data.message || 'Credenciales inválidas');
                    if (btn) { btn.disabled = false; btn.innerText = 'Acceder'; }
                }
            } catch (error) {
                console.error('Error logging in:', error);
                showNotification('Error', 'No se pudo conectar con el servidor.');
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
            const tenantEl = document.getElementById('tenant');
            const submitBtn = recoverForm.querySelector('button[type="submit"]');
            const email = recoverEmailEl ? recoverEmailEl.value.trim().toLowerCase() : '';
            const tenant = tenantEl ? tenantEl.value.trim() : '';

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

                const data = await res.json();

                if (res.ok && data.success) {
                    closeRecoverModal();
                    recoverForm.reset();
                    showNotification('Solicitud enviada', data.message || 'Se notificó a los administradores.');
                } else {
                    showNotification('Error', data.message || 'No se pudo enviar la solicitud.');
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

function checkGlobalAuth() {
    const userSession = sessionStorage.getItem('user_session'); // Changed to sessionStorage
    // Check for null, undefined, empty string, or string "null"/"undefined"
    if (!userSession || userSession === 'null' || userSession === 'undefined') {
        window.top.location.href = 'acceso.html';
        return;
    }

    try {
        const session = JSON.parse(userSession);
        if (!session || !session.id) {
            throw new Error('Invalid session');
        }
    } catch (e) {
        sessionStorage.removeItem('user_session'); // Changed to sessionStorage
        window.top.location.href = 'acceso.html';
    }
}

function loadGlobalProfile() {
    const userSession = sessionStorage.getItem('user_session'); // Changed to sessionStorage
    if (!userSession) return;

    const user = JSON.parse(userSession);

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
            const avatarUrl = `http://localhost:3000/api/users/${user.id || 0}/avatar`;
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
    sessionStorage.removeItem('user_session'); // Changed to sessionStorage
    localStorage.removeItem('user_session'); // Clean up old sessions just in case
    window.location.href = 'acceso.html';
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
        const res = await fetch('http://localhost:3000/api/alerts');
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
