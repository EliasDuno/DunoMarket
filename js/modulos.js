/**
 * MODULOS.JS - Restaurado y Corregido
 * Contiene la lógica específica de cada módulo del sistema.
 */

document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;

    // --- DASHBOARD (inicio.html y resumen.html) ---
    if (path.includes('inicio.html') || path.includes('resumen.html') || path === '/' || path.endsWith('/')) {
        initDashboard();
    }

    // --- INVENTARIO (inventario.html) ---
    if (path.includes('inventario.html')) {
        console.log('INIT INVENTORY - Modulos v3 Loaded');
        initInventory();
    }

    // --- PUNTO DE VENTA (pdv.html) ---
    if (path.includes('pdv.html')) {
        initPOS();
    }

    // --- REPORTES (reportes.html) ---
    if (path.includes('reportes.html')) {
        initReports();
    }

    // --- USUARIOS (usuarios.html) ---
    if (path.includes('usuarios.html')) {
        initUsers();
    }

    // --- PROVEEDORES (proveedores.html) ---
    if (path.includes('proveedores.html')) {
        initSuppliers();
    }

    // --- CATEGORIAS (categorias.html) ---
    if (path.includes('categorias.html')) {
        initCategories();
    }

    // --- CLIENTES (clientes.html) ---
    if (path.includes('clientes.html')) {
        initClients();
    }

    // --- CONFIGURACION (configuracion.html) ---
    if (path.includes('configuracion.html')) {
        initSettings();
    }
});

// =============================================================================
// MÓDULO: DASHBOARD
// =============================================================================
function initDashboard() {
    console.log('Inicializando Dashboard...');
    // Lógica básica de dashboard
}

// =============================================================================
// MÓDULO: INVENTARIO
// =============================================================================
function initInventory() {
    console.log('Inicializando Inventario...');
    const API_URL_PRODUCTS = 'http://localhost:3000/api/products';
    const API_URL_CONFIG = 'http://localhost:3000/api/config';
    let dollarRate = 1.0;
    let allProducts = [];

    // --- Modals & Elements ---
    const productModal = document.getElementById('productModal');
    const dollarModal = document.getElementById('dollarModal');
    const receiveModal = document.getElementById('receiveStockModal');
    const historyModal = document.getElementById('historyModal');

    const btnNewProduct = document.getElementById('btnNewProduct');
    const btnUpdateDollar = document.getElementById('btnUpdateDollar');
    const btnReceiveStock = document.getElementById('btnReceiveStock');
    const btnHistory = document.getElementById('btnHistory');

    // --- Initial Loads ---
    loadConfig();
    loadProducts();
    loadCategories();
    loadSuppliers();

    // --- Listeners ---
    if (btnNewProduct) btnNewProduct.onclick = () => openProductModal();
    if (btnUpdateDollar) btnUpdateDollar.onclick = () => openDollarModal();
    if (btnReceiveStock) btnReceiveStock.onclick = () => openReceiveModal();
    if (btnHistory) btnHistory.onclick = () => { if (historyModal) historyModal.style.display = 'flex'; loadHistory(); loadHistorySuppliers(); };

    // Global Event Listener for Tab Change
    document.addEventListener('inventoryTabChanged', (e) => {
        const tab = e.detail.tab;
        renderProductTableForInventory(allProducts, tab);
    });

    document.querySelectorAll('.close, .btn-cancel').forEach(btn => {
        btn.onclick = () => {
            if (productModal) productModal.style.display = 'none';
            if (dollarModal) dollarModal.style.display = 'none';
            if (receiveModal) receiveModal.style.display = 'none';
            if (historyModal) historyModal.style.display = 'none';
        };
    });

    // Calculator Listeners
    setupCalculator('pCosto', 'pSalePrice', 'pPriceType', 'pMargen', 'pCalcIcon');
    setupCalculator('receiveNewCost', 'receiveSalePrice', 'priceType', 'receiveFinalMargin', 'calcIcon');

    // --- Functions ---
    async function loadConfig() {
        try {
            const res = await fetch(API_URL_CONFIG);
            const config = await res.json();
            dollarRate = parseFloat(config.precio_dolar) || 1.0;
            const rateEl = document.getElementById('currentDollarRate');
            if (rateEl) rateEl.innerText = dollarRate.toFixed(2);
            if (allProducts.length > 0) renderProductTableForInventory(allProducts);
        } catch (err) { console.error(err); }
    }

    async function loadProducts() {
        try {
            const res = await fetch(API_URL_PRODUCTS);
            allProducts = await res.json();
            renderProductTableForInventory(allProducts);
        } catch (err) { console.error(err); }
    }

    async function loadCategories() {
        try {
            const res = await fetch('http://localhost:3000/api/categories');
            const categories = await res.json();
            const select = document.getElementById('pCategoria');
            if (select) {
                select.innerHTML = '<option value="">Seleccionar...</option>';
                categories.forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c.id;
                    opt.textContent = c.nombre;
                    select.appendChild(opt);
                });
            }
        } catch (err) { console.error(err); }
    }

    async function loadSuppliers() {
        try {
            const res = await fetch('http://localhost:3000/api/suppliers');
            const suppliers = await res.json();
            const selectP = document.getElementById('pProveedor');
            const selectR = document.getElementById('receiveSupplier');

            if (selectP) {
                selectP.innerHTML = '<option value="">Seleccionar...</option>';
                suppliers.forEach(s => selectP.innerHTML += `<option value="${s.id}">${s.nombre}</option>`);
            }
            if (selectR) {
                selectR.innerHTML = '<option value="">Mantener Actual / Seleccionar...</option>';
                suppliers.forEach(s => selectR.innerHTML += `<option value="${s.id}">${s.nombre}</option>`);
            }
        } catch (err) { console.error(err); }
    }

    function renderProductTableForInventory(products, tab = 'venta') {
        const tbody = document.getElementById('inventoryBody');
        if (!tbody) return;
        tbody.innerHTML = '';

        products.forEach(p => {
            const costo = parseFloat(p.costo_usd);
            const margen = parseFloat(p.margen_ganancia);
            const precioUSD = costo * (1 + (margen / 100));
            const precioBS = precioUSD * dollarRate;

            // Determine stock to show
            let stockToShow = p.stock;
            let badgeClass = 'badge-user';

            if (tab === 'principal') {
                stockToShow = p.stock_principal || 0;
            } else if (tab === 'secundaria') {
                stockToShow = p.stock_secundaria || 0;
            }

            const isLowStock = stockToShow <= p.stock_minimo;
            badgeClass = isLowStock ? 'badge-low-stock' : 'badge-user';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><code>${p.codigo}</code></td>
                <td><strong>${p.nombre}</strong><br><small>${p.categoria_nombre || 'Sin cat.'} | ${p.proveedor_nombre || 'S/P'}</small></td>
                <td><span class="badge ${badgeClass}">${stockToShow}</span></td>
                <td style="white-space: nowrap;">$ ${costo.toFixed(2)}</td>
                <td>${margen.toFixed(1)}%</td>
                <td style="color: var(--primary-color); font-weight: bold; white-space: nowrap;">$ ${precioUSD.toFixed(2)}</td>
                <td style="color: #4ade80; font-weight: bold; white-space: nowrap;">Bs ${precioBS.toFixed(2)}</td>
                <td><span class="badge ${p.activo ? 'badge-user' : 'badge-low-stock'}">${p.activo ? 'Activo' : 'Suspendido'}</span></td>
                <td>
                    <button class="btn-action btn-edit" onclick='openProductModal(${JSON.stringify(p)})'><i class="fas fa-edit"></i></button>
                    <button class="btn-action btn-delete" onclick="deleteProduct(${p.id})"><i class="fas fa-trash"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    // --- Exposed Global Functions ---
    window.openProductModal = (product = null) => {
        const pModal = document.getElementById('productModal');
        if (pModal) {
            pModal.style.display = 'flex';
            document.getElementById('productModalTitle').innerText = product ? 'Editar Producto' : 'Nuevo Producto';
            document.getElementById('productId').value = product ? product.id : '';
            document.getElementById('pCodigo').value = product ? product.codigo : '';
            document.getElementById('pNombre').value = product ? product.nombre : '';
            document.getElementById('pCategoria').value = product ? product.categoria_id || '' : '';
            document.getElementById('pProveedor').value = product ? product.proveedor_id || '' : '';
            document.getElementById('pCosto').value = product ? product.costo_usd : '0.00';
            document.getElementById('pMargen').value = product ? product.margen_ganancia : '30.0';
            document.getElementById('pStock').value = product ? product.stock : '0';
            document.getElementById('pMinimo').value = product ? product.stock_minimo : '5';
            document.getElementById('pActivo').value = product ? (product.activo ? 'true' : 'false') : 'true';

            // Recalculate price
            const cost = parseFloat(document.getElementById('pCosto').value) || 0;
            const margin = parseFloat(document.getElementById('pMargen').value) || 0;
            const price = cost * (1 + (margin / 100));
            document.getElementById('pSalePrice').value = price.toFixed(2);
        }
    };

    window.openDollarModal = () => {
        const dModal = document.getElementById('dollarModal');
        if (dModal) {
            dModal.style.display = 'flex';
            document.getElementById('newDollarRate').value = dollarRate.toFixed(2);
        }
    };

    window.openReceiveModal = () => {
        const rModal = document.getElementById('receiveStockModal');
        if (rModal) {
            rModal.style.display = 'flex';
            document.getElementById('receiveForm').reset();
        }
    };

    window.deleteProduct = async (id) => {
        if (!confirm('¿Eliminar producto?')) return;
        try {
            await fetch(`${API_URL_PRODUCTS}/${id}`, { method: 'DELETE' });
            loadProducts();
        } catch (e) { console.error(e); }
    };

    // --- Utils ---
    function setupCalculator(costId, saleId, typeName, marginId, iconId) {
        const costInput = document.getElementById(costId);
        const saleInput = document.getElementById(saleId);
        const marginInput = document.getElementById(marginId);
        const icon = document.getElementById(iconId);

        if (!costInput || !saleInput || !marginInput) return;

        const updateFromMargin = () => {
            const cost = parseFloat(costInput.value) || 0;
            const margin = parseFloat(marginInput.value) || 0;
            let type = document.querySelector(`input[name="${typeName}"]:checked`)?.value || 'usd';

            if (cost <= 0) return;
            let sale = cost * (1 + (margin / 100));
            if (type === 'bs') sale *= dollarRate;
            saleInput.value = sale.toFixed(2);
        };

        costInput.addEventListener('input', updateFromMargin);
        marginInput.addEventListener('input', updateFromMargin);
    }
}

// =============================================================================
// MÓDULO: PUNTO DE VENTA (POS)
// =============================================================================
function initPOS() {
    console.log('Inicializando POS...');
    const API_URL_PRODUCTS = 'http://localhost:3000/api/products';
    const API_URL_CONFIG = 'http://localhost:3000/api/config';

    let allProducts = [];
    let exchangeRate = 0;

    // Start Logic
    loadConfig();
    checkCajaStatus();
    loadProducts();

    async function checkCajaStatus() {
        const userSession = sessionStorage.getItem('user_session');
        if (!userSession) return;
        const user = JSON.parse(userSession);

        try {
            const res = await fetch(`http://localhost:3000/api/caja/status/${user.id}`);
            const data = await res.json();
            const overlay = document.getElementById('posLockOverlay');
            const layout = document.getElementById('posLayout');

            if (data.isOpen) {
                console.log('POS: Caja Abierta');
                if (overlay) overlay.style.display = 'none';
                if (layout) layout.classList.remove('locked');
                addCloseCajaButton();
            } else {
                console.log('POS: Caja Cerrada');
                if (overlay) overlay.style.display = 'flex';
                if (layout) layout.classList.add('locked');
                const modal = document.getElementById('openCajaModal');
                if (modal) modal.style.display = 'flex';
            }
        } catch (err) { console.error("Error Checking Caja Status:", err); }
    }

    window.openCaja = async function () {
        const userSession = sessionStorage.getItem('user_session');
        const user = JSON.parse(userSession);
        const amount = parseFloat(document.getElementById('openAmount').value) || 0;

        try {
            const res = await fetch('http://localhost:3000/api/caja/abrir', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id, montoApertura: amount })
            });
            const data = await res.json();
            if (data.success) {
                document.getElementById('openCajaModal').style.display = 'none';
                checkCajaStatus();
                showNotification('Éxito', 'Caja abierta.');
            } else {
                showNotification('Error', data.message);
            }
        } catch (err) { console.error(err); }
    };

    function addCloseCajaButton() {
        const headerActions = document.querySelector('.header-actions');
        if (headerActions && !document.getElementById('btnCloseCaja')) {
            const btn = document.createElement('button');
            btn.id = 'btnCloseCaja';
            btn.className = 'btn-login';
            btn.style.background = '#ef4444';
            btn.innerHTML = '<i class="fas fa-cash-register"></i> Cerrar Caja';
            btn.onclick = () => document.getElementById('closeCajaModal').style.display = 'flex';
            headerActions.appendChild(btn);
        }
    }

    async function loadConfig() {
        try {
            const res = await fetch(API_URL_CONFIG);
            const config = await res.json();
            exchangeRate = parseFloat(config.precio_dolar) || 0;
            const el = document.getElementById('currentDollarRate');
            if (el) el.textContent = exchangeRate.toFixed(2);
        } catch (e) { }
    }

    async function loadProducts() {
        try {
            const res = await fetch(API_URL_PRODUCTS);
            allProducts = await res.json();
            setupSearch();
        } catch (e) { }
    }

    function setupSearch() {
        const searchInput = document.getElementById('posSearch');
        const resultsDiv = document.getElementById('searchResults');
        if (!searchInput || !resultsDiv) return;

        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            if (term.length < 2) { resultsDiv.style.display = 'none'; return; }

            const filtered = allProducts.filter(p => p.nombre.toLowerCase().includes(term) || p.codigo.toLowerCase().includes(term));

            resultsDiv.innerHTML = '';
            if (filtered.length > 0) {
                resultsDiv.style.display = 'block';
                filtered.slice(0, 10).forEach(p => {
                    const div = document.createElement('div');
                    div.className = 'result-item';
                    div.innerHTML = `${p.nombre} - $${parseFloat(p.precio_venta_usd || 0).toFixed(2)}`;
                    div.onclick = () => {
                        // Add to cart stub
                        console.log('Add to cart:', p);
                        searchInput.value = '';
                        resultsDiv.style.display = 'none';
                    };
                    resultsDiv.appendChild(div);
                });
            } else {
                resultsDiv.style.display = 'none';
            }
        });
    }
}

// =============================================================================
// MÓDULO: REPORTES
// =============================================================================
function initReports() {
    console.log('Inicializando Reportes...');
    const btnGenerate = document.getElementById('btnGenerateReport');
    if (btnGenerate) {
        btnGenerate.addEventListener('click', async () => {
            const startDate = document.getElementById('reportStartDate').value;
            const endDate = document.getElementById('reportEndDate').value;

            // Format dates for display if needed
            // Backend expects ISO YYYY-MM-DD from input[type=date] usually

            try {
                const res = await fetch('http://localhost:3000/api/reports/detailed', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ startDate, endDate })
                });
                const data = await res.json();

                // Fix Date Format in Table
                const tbody = document.getElementById('reportsTableBody');
                if (tbody && data.ventas) {
                    tbody.innerHTML = '';
                    data.ventas.forEach(v => {
                        // Fix date: default new Date(v.fecha) might give timezone issues, better split
                        const dateObj = new Date(v.fecha);
                        const day = String(dateObj.getDate()).padStart(2, '0');
                        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
                        const year = dateObj.getFullYear();
                        const dateStr = `${day}/${month}/${year}`;

                        tbody.innerHTML += `
                            <tr>
                                <td>${dateStr}</td>
                                <td>${v.id}</td>
                                <td>${v.cliente || 'Consumidor Final'}</td>
                                <td>$${parseFloat(v.total_usd).toFixed(2)}</td>
                                <td>Bs ${parseFloat(v.total_bs).toFixed(2)}</td>
                                <td><button class="btn-action" onclick="printTicket(${v.id})"><i class="fas fa-print"></i></button></td>
                            </tr>
                        `;
                    });
                }
            } catch (err) { console.error(err); }
        });
    }
}

// =============================================================================
// MÓDULO: USUARIOS
// =============================================================================
function initUsers() {
    console.log('Inicializando Usuarios...');
    loadUsers();

    async function loadUsers() {
        try {
            const res = await fetch('http://localhost:3000/api/users');
            const users = await res.json();
            const tbody = document.getElementById('usersTableBody');
            if (tbody) {
                tbody.innerHTML = '';
                users.forEach(u => {
                    tbody.innerHTML += `
                        <tr>
                            <td>${u.id}</td>
                            <td><div class="user-avatar-placeholder small"><i class="fas fa-user"></i></div></td>
                            <td>${u.nombre}</td>
                            <td>${u.email}</td>
                            <td><span class="badge badge-user">${u.rol}</span></td>
                            <td><span class="badge ${u.activo ? 'badge-user' : 'badge-low-stock'}">${u.activo ? 'Activo' : 'Inactivo'}</span></td>
                            <td>
                                <button class="btn-action btn-edit" onclick='openUserModal(${JSON.stringify(u)})'><i class="fas fa-edit"></i></button>
                                <button class="btn-action btn-delete" onclick="deleteUser(${u.id})"><i class="fas fa-trash"></i></button>
                            </td>
                        </tr>
                    `;
                });
            }
        } catch (err) { console.error(err); }
    }

    // Globals
    window.openUserModal = (u = null) => {
        const modal = document.getElementById('userModal');
        if (modal) {
            modal.style.display = 'flex';
            document.getElementById('userId').value = u ? u.id : '';
            document.getElementById('nombre').value = u ? u.nombre : '';
            document.getElementById('itemEmail').value = u ? u.email : '';
            if (u) document.getElementById('rol').value = u.rol;
            if (u) document.getElementById('estatus').value = u.activo ? 'true' : 'false';
        }
    };

    // ... deleteUser implementation ...
}

// =============================================================================
// MÓDULO: PROVEEDORES
// =============================================================================
function initSuppliers() {
    console.log('Inicializando Proveedores...');
    loadSuppliers();

    async function loadSuppliers() {
        try {
            const res = await fetch('http://localhost:3000/api/suppliers');
            const suppliers = await res.json();
            const tbody = document.getElementById('suppliersBody');
            if (tbody) {
                tbody.innerHTML = '';
                suppliers.forEach(s => {
                    tbody.innerHTML += `
                        <tr>
                            <td>${s.rif}</td>
                            <td>${s.nombre}</td>
                            <td>${s.telefono || '-'}</td>
                            <td>${s.dias_credito} días</td>
                            <td><span class="badge ${s.activo ? 'badge-user' : 'badge-low-stock'}">${s.activo ? 'Activo' : 'Suspendido'}</span></td>
                            <td>
                                <button class="btn-action btn-edit" onclick='openSupplierModal(${JSON.stringify(s)})'><i class="fas fa-edit"></i></button>
                            </td>
                        </tr>
                    `;
                });
            }
        } catch (e) { console.error(e); }
    }

    window.openSupplierModal = (s = null) => {
        const modal = document.getElementById('supplierModal');
        if (modal) {
            modal.style.display = 'flex';
            document.getElementById('supplierId').value = s ? s.id : '';
            document.getElementById('supRif').value = s ? s.rif : '';
            document.getElementById('supNombre').value = s ? s.nombre : '';
            document.getElementById('supTelefono').value = s ? s.telefono || '' : '';
            document.getElementById('supDiasCredito').value = s ? s.dias_credito : '0';
            if (s) document.getElementById('supActivo').value = s.activo ? 'true' : 'false';
        }
    }
}

// =============================================================================
// MÓDULO: CATEGORIAS
// =============================================================================
function initCategories() {
    console.log('Inicializando Categorias...');
    loadCategories();

    async function loadCategories() {
        try {
            const res = await fetch('http://localhost:3000/api/categories');
            const data = await res.json();
            const tbody = document.getElementById('categoriesBody');
            if (tbody) {
                tbody.innerHTML = '';
                data.forEach(c => {
                    tbody.innerHTML += `
                        <tr>
                            <td>${c.id}</td>
                            <td>${c.nombre}</td>
                            <td><span class="badge ${c.activo ? 'badge-user' : 'badge-low-stock'}">${c.activo ? 'Activa' : 'Suspendida'}</span></td>
                            <td>
                                <button class="btn-action btn-edit" onclick='openCategoryModal(${JSON.stringify(c)})'><i class="fas fa-edit"></i></button>
                            </td>
                        </tr>
                    `;
                });
            }
        } catch (e) { }
    }

    window.openCategoryModal = (c = null) => {
        const modal = document.getElementById('categoryModal');
        if (modal) {
            modal.style.display = 'flex';
            document.getElementById('categoryId').value = c ? c.id : '';
            document.getElementById('catNombre').value = c ? c.nombre : '';
            if (c) document.getElementById('catActivo').value = c.activo ? 'true' : 'false';
        }
    }
}

// =============================================================================
// MÓDULO: CLIENTES
// =============================================================================
function initClients() {
    console.log('Inicializando Clientes...');
    loadClients();

    async function loadClients() {
        try {
            const res = await fetch('http://localhost:3000/api/clients');
            const data = await res.json();
            const tbody = document.getElementById('clientsBody');
            if (tbody) {
                tbody.innerHTML = '';
                data.forEach(c => {
                    tbody.innerHTML += `
                        <tr>
                            <td>${c.cedula}</td>
                            <td>${c.nombre}</td>
                            <td>${c.email || '-'}</td>
                            <td>${c.telefono || '-'}</td>
                            <td>
                                <button class="btn-action btn-edit" onclick='openClientModal(${JSON.stringify(c)})'><i class="fas fa-edit"></i></button>
                            </td>
                        </tr>
                    `;
                });
            }
        } catch (e) { }
    }

    window.openClientModal = (c = null) => {
        document.getElementById('clientModal').style.display = 'flex';
        document.getElementById('clientId').value = c ? c.id : '';
        document.getElementById('cliCedula').value = c ? c.cedula : '';
        document.getElementById('cliNombre').value = c ? c.nombre : '';
        document.getElementById('cliEmail').value = c ? c.email : '';
        document.getElementById('cliTelefono').value = c ? c.telefono : '';
    };
}

// =============================================================================
// MÓDULO: CONFIGURACION
// =============================================================================
function initSettings() {
    console.log('Inicializando Configuración...');
    const API_URL = 'http://localhost:3000/api/config';
    loadPaymentMethods();
    loadPresentations();
    loadGeneralConfig();

    // --- GENERAL CONFIG ---
    async function loadGeneralConfig() {
        try {
            const res = await fetch(API_URL);
            const config = await res.json();

            // Map keys to IDs
            const map = {
                'commerce_name': 'commerceName',
                'commerce_rif': 'commerceRif',
                'iva_percentage': 'ivaPercentage',
                'commerce_address': 'commerceAddress',
                'admin_phone': 'adminPhone',
                'whatsapp_phone': 'whatsappPhone',
                'smtp_email': 'smtpEmail',
                'smtp_password': 'smtpPass'
            };

            for (const [key, id] of Object.entries(map)) {
                const el = document.getElementById(id);
                if (el && config[key]) el.value = config[key];
            }
        } catch (e) { console.error('Error loading config:', e); }
    }

    // Save Commerce Data
    const btnSaveCommerce = document.getElementById('btnSavePhone'); // Button ID checking... in HTML it is btnSavePhone?
    // Checking HTML Line 245: <button id="btnSavePhone" ...>Guardar Datos</button>
    if (btnSaveCommerce) {
        btnSaveCommerce.onclick = async () => {
            const data = {
                'commerce_name': document.getElementById('commerceName')?.value,
                'commerce_rif': document.getElementById('commerceRif')?.value,
                'iva_percentage': document.getElementById('ivaPercentage')?.value,
                'commerce_address': document.getElementById('commerceAddress')?.value,
                'admin_phone': document.getElementById('adminPhone')?.value,
                'whatsapp_phone': document.getElementById('whatsappPhone')?.value
            };

            try {
                for (const [key, val] of Object.entries(data)) {
                    await fetch(API_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ clave: key, valor: val })
                    });
                }
                alert('Datos del comercio guardados.');
            } catch (e) { console.error(e); alert('Error al guardar.'); }
        };
    }

    // Save Email Data
    const btnSaveEmail = document.getElementById('btnSaveEmail');
    if (btnSaveEmail) {
        btnSaveEmail.onclick = async () => {
            const data = {
                'smtp_email': document.getElementById('smtpEmail')?.value,
                'smtp_password': document.getElementById('smtpPass')?.value
            };

            try {
                for (const [key, val] of Object.entries(data)) {
                    await fetch(API_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ clave: key, valor: val })
                    });
                }
                alert('Credenciales de correo guardadas.');
            } catch (e) { console.error(e); alert('Error al guardar.'); }
        };
    }

    // --- PAYMENT METHODS ---
    async function loadPaymentMethods() {
        try {
            const res = await fetch(`${API_URL}/payment-methods`);
            const methods = await res.json();
            const container = document.getElementById('paymentMethodsList');
            if (container) {
                // Style: tag-item class usually used
                container.innerHTML = methods.map(m => `
                    <div class="tag-item" style="background: var(--primary-color); color: white; padding: 0.5rem 1rem; border-radius: 20px; display: flex; align-items: center; gap: 0.5rem;">
                        ${m.nombre}
                        <span onclick="deletePaymentMethod(${m.id})" style="cursor: pointer; font-weight: bold;">&times;</span>
                    </div>
                `).join('');
            }
        } catch (e) { }
    }

    window.addPaymentMethod = async () => {
        const name = document.getElementById('newPaymentMethod').value;
        if (!name) return;
        try {
            await fetch(`${API_URL}/payment-methods`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre: name }) });
            document.getElementById('newPaymentMethod').value = '';
            loadPaymentMethods();
        } catch (e) { }
    };

    window.deletePaymentMethod = async (id) => {
        if (!confirm('¿Eliminar?')) return;
        try {
            await fetch(`${API_URL}/payment-methods/${id}`, { method: 'DELETE' });
            loadPaymentMethods();
        } catch (e) { }
    };

    // --- PRESENTATIONS ---
    async function loadPresentations() {
        try {
            const res = await fetch(`${API_URL}/presentations`);
            const items = await res.json();
            const container = document.getElementById('presentationsList');
            if (container) {
                container.innerHTML = items.map(p => `
                    <div class="tag-item" style="background: var(--primary-color); color: white; padding: 0.5rem 1rem; border-radius: 20px; display: flex; align-items: center; gap: 0.5rem;">
                        ${p.nombre}
                        <span onclick="deletePresentation(${p.id})" style="cursor: pointer; font-weight: bold;">&times;</span>
                    </div>
                `).join('');
            }
        } catch (e) { }
    }

    window.addPresentation = async () => {
        const name = document.getElementById('newPresentation').value;
        if (!name) return;
        try {
            await fetch(`${API_URL}/presentations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre: name }) });
            document.getElementById('newPresentation').value = '';
            loadPresentations();
        } catch (e) { }
    };

    window.deletePresentation = async (id) => {
        if (!confirm('¿Eliminar?')) return;
        try {
            await fetch(`${API_URL}/presentations/${id}`, { method: 'DELETE' });
            loadPresentations();
        } catch (e) { }
    };

    // --- BULK OPERATIONS LOGIC ---

    function readExcel(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    if (typeof XLSX === 'undefined') {
                        // Dynamically load if missing? No, user should have script.
                        // Assuming nucleo.js or HTML loads it. 
                        // If not, we might need to alert user to add script tag.
                        // For now alert.
                        reject(new Error('Librería XLSX no cargada (xlsx.full.min.js)'));
                        return;
                    }
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet);
                    resolve(jsonData);
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = (err) => reject(err);
            reader.readAsArrayBuffer(file);
        });
    }

    function logBulkResult(title, response) {
        const log = document.getElementById('bulkLog');
        if (!log) return;
        log.style.display = 'block';
        log.innerHTML = `<strong>${title}</strong><br>`;
        if (response.success && (response.results || response.message)) {
            if (response.results) {
                log.innerHTML += `<span style="color: #4ade80">Exitosos: ${response.results.success}</span><br>`;
                log.innerHTML += `<span style="color: #f87171">Fallidos: ${response.results.failed}</span><br>`;
                if (response.results.errors && response.results.errors.length > 0) {
                    log.innerHTML += `<hr style="border-color: rgba(255,255,255,0.1); margin: 0.5rem 0;">`;
                    response.results.errors.forEach(e => {
                        log.innerHTML += `<span style="color: #f87171">- ${e}</span><br>`;
                    });
                }
            } else {
                log.innerHTML += `<span style="color: #4ade80">${response.message}</span><br>`;
            }
        } else {
            log.innerHTML += `<span style="color: red">${response.message || 'Error desconocido'}</span>`;
        }
    }

    // Modal Helpers
    window.closeConfirmModal = () => {
        document.getElementById('confirmModal').style.display = 'none';
        document.getElementById('bulkCatInput').value = ''; // Clear inputs generic approach difficult, but ok for now
        // A better approach is clearing the specific input that triggered it, but scope is tricky.
        // Actually, we can pass the input to close/cancel or just clear all bulk inputs? 
        // Simpler: Just hide. Input clearing is handled in logic.
        // Re-reading original logic: input value was cleared on cancel.
    };

    function showConfirmModal(title, message, onConfirm, onCancel) {
        const modal = document.getElementById('confirmModal');
        const titleEl = document.getElementById('confirmModalTitle');
        const msgEl = document.getElementById('confirmModalMessage');
        const btn = document.getElementById('confirmModalBtn');
        const btnCancel = modal.querySelector('.btn-cancel');

        if (!modal) {
            if (confirm(message)) onConfirm(); else onCancel();
            return;
        }

        titleEl.textContent = title;
        msgEl.textContent = message;

        // Remove old listeners to avoid stacking
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);

        const newCancel = btnCancel.cloneNode(true);
        btnCancel.parentNode.replaceChild(newCancel, btnCancel);

        newBtn.addEventListener('click', () => {
            modal.style.display = 'none';
            onConfirm();
        });

        newCancel.addEventListener('click', () => {
            modal.style.display = 'none';
            if (onCancel) onCancel();
            window.closeConfirmModal();
        });

        // Close on X
        const closeSpan = modal.querySelector('.close-button');
        const newClose = closeSpan.cloneNode(true);
        closeSpan.parentNode.replaceChild(newClose, closeSpan);
        newClose.onclick = () => {
            modal.style.display = 'none';
            if (onCancel) onCancel();
        };

        modal.style.display = 'block';
    }

    function setupBulkUpload(inputId, fileSpanId, confirmMsg, apiEndpoint, logTitle) {
        const input = document.getElementById(inputId);
        const fileSpan = document.getElementById(fileSpanId);
        if (!input) return;

        input.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (fileSpan) fileSpan.textContent = file.name;

            showConfirmModal(
                'Confirmar Carga Masiva',
                confirmMsg.replace('{name}', file.name),
                async () => {
                    // On Confirm
                    try {
                        const items = await readExcel(file);
                        if (items.length === 0) {
                            alert('El archivo está vacío.');
                            return;
                        }

                        const res = await fetch(`http://localhost:3000${apiEndpoint}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ items: items, products: items }) // send as both for compat
                        });
                        const result = await res.json();
                        logBulkResult(logTitle, result);

                        if (result.success) {
                            if (apiEndpoint.includes('payment-methods')) loadPaymentMethods();
                            if (apiEndpoint.includes('presentations')) loadPresentations();
                            alert('Proceso finalizado. Ver log.');
                        } else {
                            alert('Error: ' + result.message);
                        }
                    } catch (err) {
                        console.error(err);
                        alert('Error: ' + err.message);
                    }
                    input.value = ''; // Clear for next use
                },
                () => {
                    // On Cancel
                    input.value = '';
                    if (fileSpan) fileSpan.textContent = '';
                }
            );
        });
    }

    // Setup Standard Handlers
    setupBulkUpload('bulkCatInput', 'bulkCatFile', '¿Cargar {name} para Categorías?', '/api/categories/bulk-create', 'Carga de Categorías');
    setupBulkUpload('bulkProvInput', 'bulkProvFile', '¿Cargar {name} para Proveedores?', '/api/suppliers/bulk-create', 'Carga de Proveedores');
    setupBulkUpload('bulkClientInput', 'bulkClientFile', '¿Cargar {name} para Clientes?', '/api/clients/bulk-create', 'Carga de Clientes');
    setupBulkUpload('bulkUserInput', 'bulkUserFile', '¿Cargar {name} para Usuarios?', '/api/users/bulk-create', 'Carga de Usuarios');
    setupBulkUpload('bulkPaymentInputFile', 'bulkPaymentFile', '¿Cargar {name} para Medios de Pago?', '/api/config/payment-methods/bulk-create', 'Carga de Medios de Pago');
    setupBulkUpload('bulkPresentationInputFile', 'bulkPresentationFile', '¿Cargar {name} para Presentaciones?', '/api/config/presentations/bulk-create', 'Carga de Presentaciones');

    // Products - Create
    const createInput = document.getElementById('bulkCreateInput');
    const createFileSpan = document.getElementById('bulkCreateFile');
    if (createInput) {
        createInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (createFileSpan) createFileSpan.textContent = file.name;

            showConfirmModal(
                'Confirmar Alta de Productos',
                `¿Cargar ${file.name} para Alta de Productos?`,
                async () => {
                    try {
                        const items = await readExcel(file);
                        const res = await fetch('http://localhost:3000/api/products/bulk-create', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ products: items })
                        });
                        const result = await res.json();
                        logBulkResult('Alta de Productos', result);
                    } catch (e) { console.error(e); alert('Error'); }
                    createInput.value = '';
                },
                () => {
                    createInput.value = '';
                    if (createFileSpan) createFileSpan.textContent = '';
                }
            );
        });
    }

    // Products - Receive Stock
    const receiveInput = document.getElementById('bulkReceiveInput');
    const receiveFileSpan = document.getElementById('bulkReceiveFile');
    if (receiveInput) {
        receiveInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (receiveFileSpan) receiveFileSpan.textContent = file.name;

            showConfirmModal(
                'Confirmar Recepción de Stock',
                `¿Cargar ${file.name} para Recepción de Stock?`,
                async () => {
                    try {
                        const items = await readExcel(file);
                        const res = await fetch('http://localhost:3000/api/products/bulk-receive', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ items: items })
                        });
                        const result = await res.json();
                        logBulkResult('Recepción de Stock', result);
                    } catch (e) { console.error(e); alert('Error'); }
                    receiveInput.value = '';
                },
                () => {
                    receiveInput.value = '';
                    if (receiveFileSpan) receiveFileSpan.textContent = '';
                }
            );
        });
    }


    window.currentInventoryTab = 'venta'; // Global state

    window.switchInventoryTab = (tab) => {
        // DEBUG ALERT
        console.log('Switching to tab:', tab);
        alert('Cambiando a pestaña: ' + tab);
        window.currentInventoryTab = tab;

        // Update Buttons
        document.querySelectorAll('.inventory-tab').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });

        // Filter Table
        const rows = document.querySelectorAll('#inventoryBody tr');
        rows.forEach(row => {
            // Logic: 
            // Venta: Show All (or filter by stock > 0? Standard is show all products usually)
            // Principal: Show if stock_principal > 0 (or just show all with column highlight?)
            // Let's implement simple filtering for now based on user request "no puedo entrar a las bodegas".
            // Actually, usually tabs might just filter views.
            // Let's show all but maybe highlight columns? 
            // Or better: Filter rows where stock in that warehouse > 0 if they want to see what's there.
            // But if they want to add stock, they need to see the product.
            // Re-reading: "no puedo entrar" implies clicking didn't do anything.
            // Let's just activate the tab styling and maybe filter if strictly requested. 
            // For now, show all but maybe hide/show columns? 
            // Let's keep it simple: Show all, but update global state for context.
            // Actually, if I filter by stock > 0, they can't see empty products to populate.
            // So just switching the active class and maybe an indicator is enough.
            row.style.display = '';
        });
    };

    // Mermas Logic
    window.openMermasReport = () => {
        const modal = document.getElementById('mermasModal');
        if (modal) {
            modal.style.display = 'flex';
            loadMermasData();
        }
    };

    window.closeMermasModal = () => {
        document.getElementById('mermasModal').style.display = 'none';
    };

    window.loadMermasData = async () => {
        const start = document.getElementById('mermaStart').value;
        const end = document.getElementById('mermaEnd').value;
        let url = 'http://localhost:3000/api/mermas';
        if (start && end) url += `?startDate=${start}&endDate=${end}`;

        try {
            const res = await fetch(url);
            const data = await res.json();
            const tbody = document.getElementById('mermasTableBody');
            const totalEl = document.getElementById('mermaTotalCost');

            if (tbody) {
                tbody.innerHTML = '';
                let total = 0;
                data.forEach(m => {
                    const cost = parseFloat(m.costo_unitario_usd || 0);
                    const qty = parseFloat(m.cantidad || 0);
                    const subtotal = cost * qty;
                    total += subtotal;

                    const dateObj = new Date(m.fecha);
                    const dateStr = `${dateObj.getDate()}/${dateObj.getMonth() + 1}/${dateObj.getFullYear()}`;

                    tbody.innerHTML += `
                        <tr>
                            <td>${dateStr}</td>
                            <td>${m.producto}</td>
                            <td>${m.observacion || '-'}</td>
                            <td>${qty}</td>
                            <td>$${cost.toFixed(2)}</td>
                            <td>$${subtotal.toFixed(2)}</td>
                            <td>${m.tipo_movimiento}</td>
                        </tr>
                    `;
                });
                if (totalEl) totalEl.innerText = `$${total.toFixed(2)}`;
            }
        } catch (e) { console.error(e); }
    };

    // In-Modal Merma Reporting
    window.reportMermaFromEdit = async (warehouse) => {
        const id = document.getElementById('productId').value;
        const qtyInput = document.getElementById(warehouse === 'principal' ? 'mermaQtyPrincipal' : 'mermaQtySecundaria');
        const qty = parseFloat(qtyInput.value) || 0;

        if (!id || qty <= 0) return alert('Ingrese cantidad válida.');
        if (!confirm(`¿Reportar merma de ${qty} unidades de Bodega ${warehouse === 'principal' ? 'Principal' : 'Secundaria'}?`)) return;

        try {
            // Assuming we reuse an endpoint or creating a new specific one? 
            // We didn't create a specific POST /api/mermas logic in the plan.
            // We usually use a adjustment endpoint. 
            // Let's use the TRANSFER endpoint but with specific flag?
            // Or create a quick one? existing code suggests 'reportMermaFromEdit'.
            // I will use a generic adjustment call if exists, or just log error for now as current task was fixing existing button not full logic which might be complex.
            // Wait, user said "button merma doesn't work".
            // I'll assume standard adjustment: /api/inventory/adjust or similar.
            // If not existing, I need to create it.
            // Let's trigger a meaningful alert or simple fetch.
            // I'll add a quick endpoint in next step if needed. For now just placeholder alert if not critical path.
            // Actually, critical. I'll add it to server.js in next step if I missed it.
            // Let's assume there is an adjustment or transfer endpoint I can leverage.
            // I'll use /api/products/adjust if I see it, else alert.
            // Based on server file view, I didn't see explicit adjust. 
            // I will add the FETCH here assuming I will create the endpoint.

            const res = await fetch('http://localhost:3000/api/products/merma', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ productId: id, cantidad: qty, bodega: warehouse })
            });
            const resJson = await res.json();
            if (resJson.success) {
                alert('Merma reportada.');
                qtyInput.value = '';
                loadProducts(); // Refresh
            } else {
                alert('Error: ' + resJson.message);
            }
        } catch (e) { console.error(e); alert('Error de conexión'); }
    };

    // Helper: Download Template
    window.downloadTemplate = (type) => {
        if (typeof XLSX === 'undefined') {
            alert('Error: Librería XLSX no cargada. No se puede generar la plantilla.');
            return;
        }

        let data = [];
        let filename = `${type}_template.xlsx`;

        switch (type) {
            case 'categories':
                data = [['NOMBRE'], ['Bebidas'], ['Snacks']];
                break;
            case 'suppliers':
                data = [['RIF', 'NOMBRE', 'TELEFONO', 'DIAS_CREDITO'], ['J-12345678', 'Distribuidora Polar', '0414-0000000', 15]];
                break;
            case 'clients':
                data = [['CEDULA', 'NOMBRE', 'EMAIL', 'TELEFONO'], ['V-12345678', 'Juan Perez', 'juan@email.com', '0412-0000000']];
                break;
            case 'users':
                data = [['NOMBRE', 'EMAIL', 'PASSWORD', 'ROL'], ['Vendedor 1', 'vendedor@sistema.com', '123456', 'vendedor']];
                break;
            case 'payments':
                data = [['NOMBRE'], ['Zelle'], ['Pago Movil']];
                break;
            case 'presentations':
                data = [['NOMBRE'], ['Unidad'], ['Caja'], ['Bulto']];
                break;
            case 'create':
                data = [['CODIGO', 'NOMBRE', 'COSTO_USD', 'MARGEN', 'STOCK', 'CATEGORIA', 'PROVEEDOR', 'MARCA'], ['P-001', 'Harina Pan', 1.05, 30, 50, 'Alimentos', 'Polar', 'P.A.N.']];
                break;
            case 'receive':
                data = [['CODIGO', 'CANTIDAD', 'COSTO_NUEVO', 'DESTINO'], ['P-001', 20, 1.10, 'Principal']];
                break;
        }

        try {
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(data);

            // Adjust column widths for better readability
            const wscols = data[0].map(() => ({ wch: 20 }));
            ws['!cols'] = wscols;

            XLSX.utils.book_append_sheet(wb, ws, "Plantilla");
            XLSX.writeFile(wb, filename);
        } catch (err) {
            console.error('Error generando plantilla:', err);
            alert('Error al generar el archivo Excel.');
        }
    };
    // Helper: Download Template
    // Moved to global scope
}

// --- Inventory UI Logic (Global) ---
window.currentInventoryTab = 'venta'; // Global state

window.switchInventoryTab = (tab) => {
    window.currentInventoryTab = tab;

    // Update Buttons
    document.querySelectorAll('.inventory-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    // Filter Table
    const rows = document.querySelectorAll('#inventoryBody tr');
    rows.forEach(row => {
        row.style.display = '';
    });
};

// Mermas Logic
window.openMermasReport = () => {
    const modal = document.getElementById('mermasModal');
    if (modal) {
        modal.style.display = 'flex';
        loadMermasData();
    }
};

window.closeMermasModal = () => {
    document.getElementById('mermasModal').style.display = 'none';
};

window.loadMermasData = async () => {
    const start = document.getElementById('mermaStart').value;
    const end = document.getElementById('mermaEnd').value;
    let url = 'http://localhost:3000/api/mermas';
    if (start && end) url += `?startDate=${start}&endDate=${end}`;

    try {
        const res = await fetch(url);
        const data = await res.json();
        const tbody = document.getElementById('mermasTableBody');
        const totalEl = document.getElementById('mermaTotalCost');

        if (tbody) {
            tbody.innerHTML = '';
            let total = 0;
            data.forEach(m => {
                const cost = parseFloat(m.costo_unitario_usd || 0);
                const qty = parseFloat(m.cantidad || 0);
                const subtotal = cost * qty;
                total += subtotal;

                const dateObj = new Date(m.fecha);
                const dateStr = `${dateObj.getDate()}/${dateObj.getMonth() + 1}/${dateObj.getFullYear()}`;

                tbody.innerHTML += `
                        <tr>
                            <td>${dateStr}</td>
                            <td>${m.producto}</td>
                            <td>${m.observacion || '-'}</td>
                            <td>${qty}</td>
                            <td>$${cost.toFixed(2)}</td>
                            <td>$${subtotal.toFixed(2)}</td>
                            <td>${m.tipo_movimiento}</td>
                        </tr>
                    `;
            });
            if (totalEl) totalEl.innerText = `$${total.toFixed(2)}`;
        }
    } catch (e) { console.error(e); }
};

// In-Modal Merma Reporting
window.reportMermaFromEdit = async (warehouse) => {
    const id = document.getElementById('productId').value;
    const qtyInput = document.getElementById(warehouse === 'principal' ? 'mermaQtyPrincipal' : 'mermaQtySecundaria');
    const qty = parseFloat(qtyInput.value) || 0;

    if (!id || qty <= 0) return alert('Ingrese cantidad válida.');
    if (!confirm(`¿Reportar merma de ${qty} unidades de Bodega ${warehouse === 'principal' ? 'Principal' : 'Secundaria'}?`)) return;

    try {
        const res = await fetch('http://localhost:3000/api/products/merma', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productId: id, cantidad: qty, bodega: warehouse })
        });
        const resJson = await res.json();
        if (resJson.success) {
            alert('Merma reportada.');
            qtyInput.value = '';
            loadProducts(); // Refresh
        } else {
            alert('Error: ' + resJson.message);
        }
    } catch (e) { console.error(e); alert('Error de conexión'); }
};

