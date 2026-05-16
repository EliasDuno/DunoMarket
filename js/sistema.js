/**
 * SISTEMA.JS (Renamed from modulos.js)
 * Contiene la lógica específica de cada módulo del sistema.
 */
console.log('SISTEMA.JS LOADED - v5');

function isDashboardRoute(path) {
    const normalizedPath = path.replace(/\/+$/, '');
    const page = normalizedPath.split('/').pop();

    return path === '/' || page === 'inicio' || page === 'inicio.html' || page === 'resumen' || page === 'resumen.html';
}

document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;
    // alert('DEBUG: Path is ' + path);

    // --- DASHBOARD (index.html y resumen.html) ---
    if (isDashboardRoute(path)) {
        initDashboard();
    }

    // --- INVENTARIO ---
    if (path.includes('inventario')) {
        initInventory();
    }

    // --- PUNTO DE VENTA ---
    if (path.includes('pdv')) {
        initPOS();
    }

    // --- REPORTES ---
    if (path.includes('reportes')) {
        initReports();
    }

    // --- USUARIOS ---
    if (path.includes('usuarios')) {
        initUsers();
    }

    // --- PROVEEDORES ---
    if (path.includes('proveedores')) {
        initSuppliers();
    }

    // --- CATEGORIAS ---
    if (path.includes('categorias')) {
        initCategories();
    }

    // --- CLIENTES ---
    if (path.includes('clientes')) {
        initClients();
    }

    // --- CONFIGURACION ---
    if (path.includes('configuracion')) {
        initSettings();
        if (typeof initBulkOperations === 'function') initBulkOperations();
    }

    // --- CUENTAS ---
    if (path.includes('cuentas')) {
        initCuentas();
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
    const API_URL_PRODUCTS = '/api/products';
    const API_URL_CONFIG = '/api/config';
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
    const btnTransferStock = document.getElementById('btnTransferStock');
    const btnHistory = document.getElementById('btnHistory');

    // --- Initial Loads ---
    loadConfig();
    loadProducts();
    loadCategories();
    loadSuppliers();
    loadPresentations();

    // --- Listeners ---
    if (btnNewProduct) btnNewProduct.onclick = () => openProductModal();
    if (btnUpdateDollar) btnUpdateDollar.onclick = () => openDollarModal();
    if (btnReceiveStock) btnReceiveStock.onclick = () => openReceiveModal();
    if (btnTransferStock) btnTransferStock.onclick = () => {
        if (typeof openTransferModal === 'function') openTransferModal();
        else {
             // Basic fallback if openTransferModal is not found globally
            const tModal = document.getElementById('transferModal');
            if (tModal) {
                tModal.style.display = 'flex';
                document.getElementById('transfer-form').reset();
            }
        }
    };
    if (btnHistory) btnHistory.onclick = () => { if (historyModal) historyModal.style.display = 'flex'; loadHistory(); loadHistorySuppliers(); };

    const btnApplyHistoryFilter = document.getElementById('btnApplyHistoryFilter');
    if (btnApplyHistoryFilter) {
        btnApplyHistoryFilter.onclick = () => loadHistory();
    }

    // Product Autocomplete for History
    const histProductInput = document.getElementById('histProduct');
    const histProductResults = document.getElementById('histProductResults');

    // --- Pricing Calculator Listeners ---
    const pCosto = document.getElementById('pCosto');
    const pMargen = document.getElementById('pMargen');
    const pSalePrice = document.getElementById('pSalePrice');
    const pPriceTypeRadios = document.getElementsByName('pPriceType');
    const pCalcIcon = document.getElementById('pCalcIcon');

    function updatePriceFromMargin() {
        const cost = parseFloat(pCosto.value) || 0;
        const margin = parseFloat(pMargen.value) || 0;
        const priceUsd = cost * (1 + (margin / 100));
        
        const isBs = Array.from(pPriceTypeRadios).find(r => r.checked)?.value === 'bs';
        if (isBs) {
            pSalePrice.value = (priceUsd * dollarRate).toFixed(2);
            if (pCalcIcon) pCalcIcon.className = 'fas fa-money-bill-wave'; // Bs Icon
        } else {
            pSalePrice.value = priceUsd.toFixed(2);
            if (pCalcIcon) pCalcIcon.className = 'fas fa-dollar-sign'; // USD Icon
        }
    }

    function updateMarginFromPrice() {
        const cost = parseFloat(pCosto.value) || 0;
        let priceUsd = parseFloat(pSalePrice.value) || 0;
        
        const isBs = Array.from(pPriceTypeRadios).find(r => r.checked)?.value === 'bs';
        if (isBs && dollarRate > 0) {
            priceUsd = priceUsd / dollarRate;
        }

        if (cost > 0) {
            const margin = ((priceUsd / cost) - 1) * 100;
            pMargen.value = margin.toFixed(1);
        }
    }

    if (pCosto) pCosto.addEventListener('input', updatePriceFromMargin);
    if (pMargen) pMargen.addEventListener('input', updatePriceFromMargin);
    if (pSalePrice) pSalePrice.addEventListener('input', updateMarginFromPrice);
    pPriceTypeRadios.forEach(r => r.addEventListener('change', updatePriceFromMargin));

    if (histProductInput && histProductResults) {
        histProductInput.addEventListener('input', function () {
            const query = this.value.toLowerCase();
            histProductResults.innerHTML = '';
            if (query.length < 2) {
                histProductResults.style.display = 'none';
                return;
            }

            const matches = allProducts.filter(p =>
                p.nombre.toLowerCase().includes(query) ||
                p.codigo.toLowerCase().includes(query)
            ).slice(0, 10); // Limit to 10

            if (matches.length > 0) {
                histProductResults.style.display = 'block';
                matches.forEach(p => {
                    const div = document.createElement('div');
                    div.className = 'search-result-item'; // Ensure CSS exists or inline style
                    div.style.padding = '0.5rem';
                    div.style.cursor = 'pointer';
                    div.style.borderBottom = '1px solid #eee';
                    div.onmouseover = () => div.style.backgroundColor = '#f0f0f0';
                    div.onmouseout = () => div.style.backgroundColor = 'white';

                    div.innerHTML = `<strong>${p.nombre}</strong> <small>(${p.codigo})</small>`;
                    div.onclick = () => {
                        histProductInput.value = p.nombre; // Set name or code
                        histProductResults.style.display = 'none';
                        loadHistory(); // Auto-search on selection
                    };
                    histProductResults.appendChild(div);
                });
            } else {
                histProductResults.style.display = 'none';
            }
        });

        // Hide on outside click
        document.addEventListener('click', function (e) {
            if (!histProductInput.contains(e.target) && !histProductResults.contains(e.target)) {
                histProductResults.style.display = 'none';
            }
        });
    }

    // Update Dollar Logic
    const dollarForm = document.getElementById('dollarForm');
    if (dollarForm) {
        dollarForm.onsubmit = async (e) => {
            e.preventDefault();
            const newRate = parseFloat(document.getElementById('newDollarRate').value);
            if (!newRate || newRate <= 0) return showNotification('Error', 'Tasa inválida');

            try {
                const res = await fetch(API_URL_CONFIG, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ clave: 'precio_dolar', valor: newRate })
                });

                if (res.ok) {
                    dollarRate = newRate;
                    const rateEl = document.getElementById('currentDollarRate');
                    if (rateEl) rateEl.innerText = dollarRate.toFixed(2);

                    if (dollarModal) dollarModal.style.display = 'none';
                    showNotification('Éxito', 'Tasa actualizada correctamente.');

                    // Re-render table if products loaded
                    if (allProducts && allProducts.length > 0) {
                        // Get current tab from DOM or default
                        const activeTab = document.querySelector('.inventory-tab.active')?.dataset.tab || 'venta';
                        renderProductTableForInventory(allProducts, activeTab);
                    }
                } else {
                    showNotification('Error', 'No se pudo actualizar la tasa.');
                }
            } catch (err) {
                console.error(err);
                showNotification('Error', 'Error de conexión.');
            }
        };
    }

    // Global Event Listener for Tab Change
    document.addEventListener('inventoryTabChanged', (e) => {
        const tab = e.detail.tab;
        renderProductTableForInventory(allProducts, tab);
    });

    const mermasModal = document.getElementById('mermasModal');
    document.querySelectorAll('.close, .btn-cancel').forEach(btn => {
        btn.addEventListener('click', () => {
            if (productModal) productModal.style.display = 'none';
            if (dollarModal) dollarModal.style.display = 'none';
            if (receiveModal) receiveModal.style.display = 'none';
            if (historyModal) historyModal.style.display = 'none';
            if (document.getElementById('mermasModal')) document.getElementById('mermasModal').style.display = 'none';
        });
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
            console.log('DEBUG INV: Cargando productos...');
            const res = await fetch(API_URL_PRODUCTS);
            allProducts = await res.json();
            console.log('DEBUG INV: Productos recibidos =', allProducts.length);
            renderProductTableForInventory(allProducts);
        } catch (err) { 
            console.error('DEBUG INV ERROR:', err);
        }
    }

    async function loadCategories() {
        try {
            const res = await fetch('/api/categories');
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
            const res = await fetch('/api/suppliers');
            const suppliers = await res.json();
            const selectP = document.getElementById('pProveedor');
            const selectR = document.getElementById('receiveSupplier');
            const selectH = document.getElementById('histSupplier');

            const options = suppliers.map(s => `<option value="${s.id}">${s.nombre}</option>`).join('');
            
            if (selectP) selectP.innerHTML = '<option value="">Seleccionar...</option>' + options;
            if (selectR) selectR.innerHTML = '<option value="">Mantener Actual / Seleccionar...</option>' + options;
            if (selectH) selectH.innerHTML = '<option value="">Todos</option>' + options;

            console.log('DEBUG INV: Proveedores cargados =', suppliers.length);
        } catch (err) { console.error('Error loadSuppliers:', err); }
    }

    async function loadPresentations() {
        try {
            const res = await fetch('/api/config/presentations');
            const presentations = await res.json();
            const select = document.getElementById('pPresentacion');
            if (select) {
                select.innerHTML = '<option value="">Seleccionar...</option>';
                presentations.forEach(p => {
                    const opt = document.createElement('option');
                    opt.value = p.id;
                    opt.textContent = p.nombre;
                    select.appendChild(opt);
                });
            }
            console.log('DEBUG INV: Presentaciones cargadas =', presentations.length);
        } catch (err) { 
            console.error('Error loadPresentations:', err);
            const select = document.getElementById('pPresentacion');
            if (select) select.innerHTML = '<option value="">Error al cargar</option>';
        }
    }

    function renderProductTableForInventory(products, tab = 'venta') {
        const tbody = document.getElementById('inventoryBody');
        const thMerma = document.getElementById('thMerma');
        if (!tbody) return;
        tbody.innerHTML = '';

        // Toggle Merma Header
        if (tab === 'principal' || tab === 'secundaria') {
            if (thMerma) thMerma.style.display = '';
        } else {
            if (thMerma) thMerma.style.display = 'none';
        }

        products.forEach(p => {
            // Determine stock to show
            let stockToShow = p.stock;
            let mermaToShow = 0;

            if (tab === 'principal') {
                stockToShow = p.stock_principal || 0;
                mermaToShow = p.stock_merma_principal || 0;
            } else if (tab === 'secundaria') {
                stockToShow = p.stock_secundaria || 0;
                mermaToShow = p.stock_merma_secundaria || 0;
            } else {
                stockToShow = p.stock;
                mermaToShow = p.stock_merma_venta || 0;
            }

            // FILTER: If we are in a warehouse tab and stock is 0, skip this product
            if ((tab === 'principal' || tab === 'secundaria') && stockToShow <= 0) {
                return;
            }

            const costo = parseFloat(p.costo_usd);
            const margen = parseFloat(p.margen_ganancia);
            const precioUSD = costo * (1 + (margen / 100));
            const precioBS = precioUSD * dollarRate;
            let badgeClass = 'badge-user';

            const isLowStock = stockToShow <= p.stock_minimo;
            badgeClass = isLowStock ? 'badge-low-stock' : 'badge-user';

            const tr = document.createElement('tr');

            // Build Row
            let mermaCell = '';
            if (tab === 'principal' || tab === 'secundaria') {
                mermaCell = `<td style="color: #ef4444; font-weight: bold;">${mermaToShow}</td>`;
            } else {
                mermaCell = `<td style="display: none;"></td>`; 
            }

            tr.innerHTML = `
                <td><code>${p.codigo}</code></td>
                <td><strong>${p.nombre}</strong><br><small>${p.categoria_nombre || 'Sin cat.'} | ${p.proveedor_nombre || 'S/P'}</small></td>
                <td><span class="badge ${badgeClass}">${stockToShow}</span></td>
                ${mermaCell}
                <td style="white-space: nowrap;">$ ${costo.toFixed(2)}</td>
                <td>${margen.toFixed(1)}%</td>
                <td style="color: var(--primary-color); font-weight: bold; white-space: nowrap;">$ ${precioUSD.toFixed(2)}</td>
                <td style="color: #4ade80; font-weight: bold; white-space: nowrap;">${formatCurrency(precioBS)}</td>
                <td><span class="badge ${p.activo ? 'badge-user' : 'badge-low-stock'}">${p.activo ? 'Activo' : 'Suspendido'}</span></td>
                <td>
                    <button class="btn-action btn-edit" title="Editar" onclick='openProductModal(${JSON.stringify(p)})'><i class="fas fa-edit"></i></button>
                    <button class="btn-action" style="color: #f59e0b;" title="Transferir" onclick="openTransferModal(${p.id}, '${p.nombre.replace(/'/g, "\\'")}', ${stockToShow}, '${tab}')"><i class="fas fa-exchange-alt"></i></button>
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

            // New fields: Bodega and Initial Stock (only for new products)
            const bodegaEl = document.getElementById('pBodegaIngreso');
            const stockIniEl = document.getElementById('pStockInicial');
            const warehouseContainer = document.getElementById('warehouseSelectionContainer');

            if (product) {
                if (warehouseContainer) warehouseContainer.style.display = 'none';
                if (stockIniEl) stockIniEl.value = '0';
            } else {
                if (warehouseContainer) warehouseContainer.style.display = 'block';
                if (bodegaEl) bodegaEl.value = 'venta';
                if (stockIniEl) stockIniEl.value = '0';
            }

            // Recalculate price
            const cost = parseFloat(document.getElementById('pCosto').value) || 0;
            const margin = parseFloat(document.getElementById('pMargen').value) || 0;
            const price = cost * (1 + (margin / 100));
            document.getElementById('pSalePrice').value = price.toFixed(2);
        }
    };

    // --- Product Form Submission ---
    const productForm = document.getElementById('productForm');
    if (productForm) {
        productForm.onsubmit = async (e) => {
            e.preventDefault();
            const id = document.getElementById('productId').value;
            const data = {
                id: id || null,
                codigo: document.getElementById('pCodigo').value,
                nombre: document.getElementById('pNombre').value,
                categoria_id: document.getElementById('pCategoria').value,
                proveedor_id: document.getElementById('pProveedor').value,
                costo_usd: document.getElementById('pCosto').value,
                margen_ganancia: document.getElementById('pMargen').value,
                stock: document.getElementById('pStock').value,
                stock_minimo: document.getElementById('pMinimo').value,
                activo: document.getElementById('pActivo').value === 'true',
                bodega_ingreso: document.getElementById('pBodegaIngreso')?.value,
                stock_inicial: document.getElementById('pStockInicial')?.value
            };

            try {
                console.log('DEBUG: Enviando datos de producto:', data);
                const res = await fetch(API_URL_PRODUCTS, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });

                if (res.ok) {
                    if (productModal) productModal.style.display = 'none';
                    showNotification('Éxito', 'Producto guardado correctamente.');
                    loadProducts();
                } else {
                    const errorData = await res.json().catch(() => ({ message: 'Respuesta no es JSON' }));
                    console.error('DEBUG ERROR SERVER:', errorData);
                    showNotification('Error', errorData.message || 'No se pudo guardar el producto.');
                }
            } catch (err) {
                console.error('DEBUG CONNECTION ERROR:', err);
                showNotification('Error', 'Error de conexión.');
            }
        };
    }

    // --- Receive Stock Form Submission ---
    const receiveForm = document.getElementById('receiveForm');
    if (receiveForm) {
        receiveForm.onsubmit = async (e) => {
            e.preventDefault();
            const data = {
                id: document.getElementById('receiveProductId').value,
                cantidad: document.getElementById('receiveQty').value,
                nuevo_costo_usd: document.getElementById('receiveCost').value,
                nuevo_margen: document.getElementById('receiveMargin').value,
                destino: document.getElementById('receiveDestino').value
            };

            try {
                const res = await fetch(`${API_URL_PRODUCTS}/receive`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                if (res.ok) {
                    if (receiveModal) receiveModal.style.display = 'none';
                    showNotification('Éxito', 'Stock actualizado correctamente.');
                    loadProducts();
                } else {
                    showNotification('Error', 'No se pudo actualizar el stock.');
                }
            } catch (err) {
                console.error(err);
                showNotification('Error', 'Error de conexión.');
            }
        };
    }

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

    // --- History Logic ---
    async function loadHistory() {
        // Get Filters
        const startDate = document.getElementById('histStart')?.value || '';
        const endDate = document.getElementById('histEnd')?.value || '';
        const supplierId = document.getElementById('histSupplier')?.value || '';
        const productSearch = document.getElementById('histProduct')?.value || '';

        const params = new URLSearchParams({ startDate, endDate, supplierId, productSearch });
        const url = `/api/purchases?${params}`;

        try {
            const res = await fetch(url);
            const purchases = await res.json();
            renderHistoryTable(purchases);
        } catch (err) {
            console.error(err);
        }
    }

    async function loadHistorySuppliers() {
        try {
            const res = await fetch('/api/suppliers'); // Use generic suppliers endpoint
            const suppliers = await res.json();
            const select = document.getElementById('histSupplier');
            if (select) {
                select.innerHTML = '<option value="">Todos los Proveedores</option>';
                suppliers.forEach(s => {
                    const opt = document.createElement('option');
                    opt.value = s.id;
                    opt.innerText = s.nombre;
                    select.appendChild(opt);
                });
            }
        } catch (err) { console.error(err); }
    }

    function renderHistoryTable(purchases) {
        const tbody = document.getElementById('historyBody'); // Ensure this ID matches HTML
        if (!tbody) {
            // Fallback for different ID or if table missing
            const table = document.getElementById('historyTable');
            if (table) {
                // Try to find tbody inside
                const body = table.querySelector('tbody');
                if (body) { renderHistoryTableToBody(purchases, body); return; }
            }
            return;
        }
        renderHistoryTableToBody(purchases, tbody);
    }

    function renderHistoryTableToBody(purchases, tbody) {
        tbody.innerHTML = '';
        if (purchases.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No hay historial registrado.</td></tr>';
            return;
        }

        purchases.forEach(p => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${new Date(p.fecha).toLocaleDateString()} ${new Date(p.fecha).toLocaleTimeString()}</td>
                <td>${p.producto_nombre || 'Desconocido'}</td>
                <td>${p.proveedor_nombre || 'N/A'}</td>
                <td>${p.cantidad}</td>
                <td>$${parseFloat(p.costo_unitario_usd).toFixed(2)}</td>
                <td>$${parseFloat(p.total_usd).toFixed(2)}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    // Expose for filters
    window.loadHistory = loadHistory;
    window.loadHistorySuppliers = loadHistorySuppliers;

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
        };

        costInput.addEventListener('input', updateFromMargin);
        marginInput.addEventListener('input', updateFromMargin);
    }
    
    // --- Transfer Logic ---
    window.openTransferModal = (productId = null, productName = '', currentStock = 0, originTab = 'principal') => {
        const modal = document.getElementById('transferModal');
        if (!modal) return;
        
        document.getElementById('transfer-form').reset();
        modal.style.display = 'flex';
        
        let pId = productId;
        let pName = productName;
        
        // Populate origins and destinations
        const origins = [
            { id: 'principal', text: 'Bodega Principal' },
            { id: 'secundaria', text: 'Bodega Secundaria' },
            { id: 'venta', text: 'Disponible Venta' }
        ];
        
        const selOrigin = document.getElementById('transOrigin');
        const selDest = document.getElementById('transDest');
        
        selOrigin.innerHTML = '';
        selDest.innerHTML = '';
        
        origins.forEach(o => {
            const opt1 = document.createElement('option');
            opt1.value = o.id;
            opt1.textContent = o.text;
            if (o.id === originTab) opt1.selected = true;
            selOrigin.appendChild(opt1);
            
            const opt2 = document.createElement('option');
            opt2.value = o.id;
            opt2.textContent = o.text;
            if (o.id !== originTab) selDest.appendChild(opt2); // default dest not same as origin
            else selDest.appendChild(opt2);
        });

        // Ensure distinct dest by default
        if (selOrigin.value === selDest.value) {
            for(let i=0; i<selDest.options.length; i++){
                if(selDest.options[i].value !== selOrigin.value){
                    selDest.selectedIndex = i;
                    break;
                }
            }
        }
        
        // Helper to update max stock based on selected origin
        function updateTransferMax() {
            const pId = document.getElementById('transId').value;
            const origin = document.getElementById('transOrigin').value;
            const qtyInput = document.getElementById('transQty');
            const prodNameDisplay = document.getElementById('transProdName');

            if (!pId) return;
            const p = allProducts.find(x => x.id == pId);
            if (!p) return;

            let max = 0;
            if (origin === 'principal') max = p.stock_principal || 0;
            else if (origin === 'secundaria') max = p.stock_secundaria || 0;
            else if (origin === 'venta') max = p.stock || 0;

            qtyInput.max = max;
            
            if (prodNameDisplay.style.display !== 'none') {
                prodNameDisplay.innerText = `Trasladando: ${p.nombre} (Disp: ${max})`;
            } else {
                 // Check if there's a search input to update the badge
                 const searchInput = document.getElementById('transSearchInput');
                 if(searchInput && searchInput.value === p.nombre) {
                      qtyInput.placeholder = `Disp: ${max}`;
                 }
            }
        }

        // Handle changes to keep them distinct
        selOrigin.addEventListener('change', () => {
             if (selOrigin.value === selDest.value) {
                for(let i=0; i<selDest.options.length; i++){
                    if(selDest.options[i].value !== selOrigin.value){
                        selDest.selectedIndex = i;
                        break;
                    }
                }
             }
             updateTransferMax();
        });

        // Setup Product info
        const prodSelectDiv = document.getElementById('transProductSelect');
        const prodNameDisplay = document.getElementById('transProdName');
        const searchInput = document.getElementById('transSearchInput');
        const searchResults = document.getElementById('transSearchResults');

        if (pId) {
             prodSelectDiv.style.display = 'none';
             prodNameDisplay.style.display = 'block';
             document.getElementById('transId').value = pId;
             document.getElementById('transQty').value = 1;
             updateTransferMax(); // Set max and label based on initial originTab setup
        } else {
             prodNameDisplay.style.display = 'none';
             prodSelectDiv.style.display = 'block';
             document.getElementById('transId').value = "";
             document.getElementById('transQty').max = "";
             document.getElementById('transQty').value = 1;
             if(searchInput) searchInput.value = '';

             // Initialize Search
             if (searchInput && searchResults) {
                 searchInput.oninput = function () {
                     const query = this.value.toLowerCase();
                     searchResults.innerHTML = '';
                     if (query.length < 2) {
                         searchResults.style.display = 'none';
                         return;
                     }

                     const matches = allProducts.filter(p =>
                         p.nombre.toLowerCase().includes(query) ||
                         p.codigo.toLowerCase().includes(query)
                     ).slice(0, 10);

                     if (matches.length > 0) {
                         searchResults.style.display = 'block';
                         matches.forEach(p => {
                             const div = document.createElement('div');
                             div.className = 'search-result-item';
                             div.style.padding = '0.5rem';
                             div.style.cursor = 'pointer';
                             div.style.borderBottom = '1px solid #eee';
                             div.innerHTML = `<strong>${p.nombre}</strong> <small>(${p.codigo})</small> <span class="badge badge-user">${p.stock}</span>`;
                             div.onclick = () => {
                                 searchInput.value = p.nombre;
                                 searchResults.style.display = 'none';
                                 document.getElementById('transId').value = p.id;
                                 updateTransferMax();
                             };
                             searchResults.appendChild(div);
                         });
                     } else {
                         searchResults.style.display = 'none';
                     }
                 };

                 document.addEventListener('click', function (e) {
                     if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
                         searchResults.style.display = 'none';
                     }
                 });
             }
        }
    };
    
    window.closeTransferModal = () => {
        const modal = document.getElementById('transferModal');
        if (modal) modal.style.display = 'none';
    };

    const transferForm = document.getElementById('transfer-form');
    if (transferForm) {
        console.log('DEBUG: Listener de transferencia vinculado.');
        transferForm.onsubmit = async (e) => {
            e.preventDefault();
            console.log('DEBUG: Botón Transferir clickeado.');
            
            const producto_id = document.getElementById('transId').value;
            const origen = document.getElementById('transOrigin').value;
            const destino = document.getElementById('transDest').value;
            const cantidad = parseInt(document.getElementById('transQty').value);
            const isMerma = document.getElementById('checkMerma')?.checked || false;
            const observacion = document.getElementById('transObs').value;

            console.log('DEBUG: Datos a transferir:', { producto_id, origen, destino, cantidad, isMerma });

            if (!producto_id) {
                console.warn('DEBUG: Falta producto_id');
                return showNotification('Atención', 'Debe seleccionar un producto.');
            }
            if (origen === destino) return showNotification('Error', 'El origen y destino deben ser diferentes.');
            if (cantidad < 1) return showNotification('Error', 'Cantidad inválida.');

            console.log('DEBUG: Intentando llamar a /api/inventory/transfer...');
            try {
                const res = await fetch(`/api/inventory/transfer`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ producto_id, origen, destino, cantidad, isMerma, observacion })
                });

                const data = await res.json();
                if (data.success) {
                    closeTransferModal();
                    loadProducts(); // Refresh tables
                    showNotification('Éxito', data.message || 'Traspaso completado.');
                } else {
                    console.error('DEBUG: Error en respuesta de transferencia:', data);
                    showNotification('Error', data.message || 'Error al procesar el traspaso.');
                }
            } catch (err) {
                console.error('DEBUG: ERROR FATAL TRANSFERENCIA:', err);
                showNotification('Error', 'Fallo conexión con el servidor.');
            }
        };
    }
}

// =============================================================================
// MÓDULO: PUNTO DE VENTA (POS)
// =============================================================================
function initPOS() {
    console.log('Inicializando POS...');
    const API_URL_PRODUCTS = '/api/products';
    const API_URL_CONFIG = '/api/config';

    let allProducts = [];
    let exchangeRate = 0;

    // Cart States for Tabs
    let currentTab = 1;
    let cart1 = [];
    let cart2 = [];
    let clientId1 = null;
    let clientId2 = null;

    // Start Logic
    loadConfig();
    checkCajaStatus();
    loadProducts();

    async function checkCajaStatus() {
        const userSession = sessionStorage.getItem('user_session');
        if (!userSession) return;
        const user = JSON.parse(userSession);

        try {
            const res = await fetch(`/api/caja/status/${user.id}`);
            const data = await res.json();

            const overlay = document.getElementById('posLockOverlay');
            const layout = document.getElementById('posLayout');

            if (data.isOpen) {
                if (data.needsClosure) {
                    console.log('POS: Caja de día anterior detectada');
                    if (overlay) {
                        overlay.style.display = 'flex';
                        const title = overlay.querySelector('.pos-lock-title');
                        const desc = overlay.querySelector('.pos-lock-desc');
                        const btn = overlay.querySelector('.btn-large-open');
                        if (title) title.textContent = 'Cierre de Caja Pendiente';
                        if (desc) desc.textContent = 'Tienes una sesión abierta de un día anterior. Debes cerrarla para continuar.';
                        if (btn) {
                            btn.textContent = 'Cerrar Caja de Ayer';
                            btn.onclick = () => openCloseCajaModal(data.session.id);
                        }
                    }
                    if (layout) layout.classList.add('locked');
                } else {
                    console.log('POS: Caja Abierta');
                    if (overlay) overlay.style.display = 'none';
                    if (layout) layout.classList.remove('locked');
                    addCloseCajaButton();
                }
            } else {
                console.log('POS: Caja Cerrada');
                if (overlay) overlay.style.display = 'flex';
                if (layout) layout.classList.add('locked');
                
                // Reset overlay to default "Abrir Caja" in case it was changed by needsClosure
                const title = overlay.querySelector('.pos-lock-title');
                const desc = overlay.querySelector('.pos-lock-desc');
                const btn = overlay.querySelector('.btn-large-open');
                if (title) title.textContent = 'Caja Cerrada';
                if (desc) desc.textContent = 'Debes abrir la caja para comenzar a realizar ventas.';
                if (btn) {
                    btn.textContent = 'Abrir Caja';
                    btn.onclick = () => document.getElementById('openCajaModal').style.display = 'flex';
                }

                const modal = document.getElementById('openCajaModal');
                if (modal) modal.style.display = 'flex';
            }
        } catch (err) { console.error("Error Checking Caja Status:", err); }
    }

    window.openCaja = async function () {
        const userSession = sessionStorage.getItem('user_session');
        if (!userSession) return;
        const user = JSON.parse(userSession);
        const amount = parseFloat(document.getElementById('openAmount').value) || 0;

        try {
            const res = await fetch('/api/caja/abrir', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id, montoApertura: amount })
            });
            const data = await res.json();

            if (data.success) {
                document.getElementById('openCajaModal').style.display = 'none';
                checkCajaStatus();
                showNotification('Éxito', 'Caja abierta correctamente.');
            } else {
                showNotification('Error', data.message);
            }
        } catch (err) { 
            console.error('Error en openCaja:', err);
        }
    };

    function addCloseCajaButton() {
        const headerActions = document.querySelector('.header-actions');
        if (headerActions && !document.getElementById('btnCloseCaja')) {
            const btn = document.createElement('button');
            btn.id = 'btnCloseCaja';
            btn.className = 'btn-login';
            btn.style.background = '#ef4444';
            btn.innerHTML = '<i class="fas fa-cash-register"></i> Cerrar Caja';
            btn.onclick = () => openCloseCajaModal();
            headerActions.appendChild(btn);
        }
    }

    window.openCloseCajaModal = async function (sessionId) {
        if (!sessionId) {
            const userSession = sessionStorage.getItem('user_session');
            const user = JSON.parse(userSession);
            const res = await fetch(`/api/caja/status/${user.id}`);
            const data = await res.json();
            if (data.isOpen) sessionId = data.session.id;
            else return;
        }

        try {
            const res = await fetch(`/api/caja/totals/${sessionId}`);
            const data = await res.json();
            if (data.success) {
                const t = data.totals;
                document.getElementById('sys_cash').textContent = t.efectivo.toFixed(2);
                document.getElementById('sys_card').textContent = t.tdc.toFixed(2);
                document.getElementById('sys_mobile').textContent = t.pago_movil.toFixed(2);
                document.getElementById('sys_other').textContent = t.otros.toFixed(2);

                // Reset declared inputs
                ['dec_cash', 'dec_card', 'dec_mobile', 'dec_other'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.value = '';
                });
                const reason = document.getElementById('diff_reason');
                if (reason) reason.value = '';

                window.currentClosingSessionId = sessionId;
                document.getElementById('closeCajaModal').style.display = 'flex';
                calculateDiff();
            }
        } catch (err) { console.error(err); }
    };

    window.processCloseCaja = async function () {
        const sessionId = window.currentClosingSessionId;
        const decCash = parseFloat(document.getElementById('dec_cash').value) || 0;
        const decCard = parseFloat(document.getElementById('dec_card').value) || 0;
        const decMobile = parseFloat(document.getElementById('dec_mobile').value) || 0;
        const decOther = parseFloat(document.getElementById('dec_other').value) || 0;
        const totalDeclarado = decCash + decCard + decMobile + decOther;

        const userSession = sessionStorage.getItem('user_session');
        const user = JSON.parse(userSession);

        try {
            const res = await fetch('/api/caja/cerrar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: sessionId,
                    userId: user.id,
                    montoDeclarado: totalDeclarado,
                    observaciones: document.getElementById('diff_reason').value,
                    declarado: {
                        efectivo: decCash,
                        tdc: decCard,
                        pago_movil: decMobile,
                        otros: decOther
                    }
                })
            });
            const data = await res.json();
            if (data.success) {
                document.getElementById('closeCajaModal').style.display = 'none';
                showNotification('Éxito', 'Caja cerrada correctamente.');
                checkCajaStatus(); // Re-check to show Open Caja modal
            } else {
                showNotification('Error', data.message);
            }
        } catch (err) { console.error(err); }
    };

    function calculateDiff() {
        const sysTotal = parseFloat(document.getElementById('sys_cash').textContent) +
            parseFloat(document.getElementById('sys_card').textContent) +
            parseFloat(document.getElementById('sys_mobile').textContent) +
            parseFloat(document.getElementById('sys_other').textContent);

        const decCash = parseFloat(document.getElementById('dec_cash').value) || 0;
        const decCard = parseFloat(document.getElementById('dec_card').value) || 0;
        const decMobile = parseFloat(document.getElementById('dec_mobile').value) || 0;
        const decOther = parseFloat(document.getElementById('dec_other').value) || 0;
        const decTotal = decCash + decCard + decMobile + decOther;

        const diff = decTotal - sysTotal;
        const diffDisplay = document.getElementById('diff_display');
        if (diffDisplay) {
            diffDisplay.textContent = diff.toFixed(2) + ' Bs';
            diffDisplay.style.color = Math.abs(diff) < 0.01 ? '#4ade80' : '#ef4444';
        }

        const reasonContainer = document.getElementById('diff_reason_container');
        if (reasonContainer) {
            reasonContainer.style.display = Math.abs(diff) >= 0.01 ? 'block' : 'none';
        }
    }

    // Add input listeners for real-time diff
    ['dec_cash', 'dec_card', 'dec_mobile', 'dec_other'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', calculateDiff);
    });

    async function loadConfig() {
        try {
            const res = await fetch(API_URL_CONFIG);
            const config = await res.json();
            exchangeRate = parseFloat(config.precio_dolar) || 0;
            const el = document.getElementById('currentDollarRate');
            if (el) el.textContent = formatCurrency(exchangeRate);
        } catch (e) { }
    }

    async function loadProducts() {
        try {
            const res = await fetch(API_URL_PRODUCTS);
            allProducts = await res.json();
            setupSearch();
        } catch (e) { }
    }

    let getCart = () => currentTab === 1 ? cart1 : cart2;
    let getSelectedClient = () => currentTab === 1 ? clientId1 : clientId2;
    let setCart = (c) => currentTab === 1 ? cart1 = c : cart2 = c;

    // --- Search & Add to Cart ---
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
                    const priceUSD = parseFloat(p.precio_venta_usd || 0);
                    const div = document.createElement('div');
                    div.className = 'result-item';
                    
                    // Show stock info
                    const stock = parseFloat(p.stock) || 0;
                    const stockText = stock > 0 ? `<span style="color: #10b981; font-size: 0.8rem;">(Cant: ${stock})</span>` : `<span style="color: #ef4444; font-size: 0.8rem;">(Agotado)</span>`;

                    div.innerHTML = `<strong>${p.nombre}</strong> - $${priceUSD.toFixed(2)} ${stockText}`;
                    
                    div.onclick = () => {
                        searchInput.value = '';
                        resultsDiv.style.display = 'none';

                        if (stock <= 0) {
                            if (typeof showNotification === 'function') {
                                showNotification('Sin Existencia', `El producto ${p.nombre} no tiene stock disponible.`);
                            } else {
                                alert(`El producto ${p.nombre} no tiene stock disponible.`);
                            }
                            return;
                        }

                        if (!clientId1 && currentTab === 1 || !clientId2 && currentTab === 2) {
                            showConfirm('¿Desea asignar un cliente a esta venta? Si elige "No", se usará el cliente genérico.', 'Venta sin Cliente')
                            .then(confirmed => {
                                if (confirmed) {
                                    const searchInputClient = document.getElementById('posClientCedula');
                                    if (searchInputClient) searchInputClient.focus();
                                } else {
                                    // Proceed without client
                                    addToCart(p);
                                }
                            });
                            return;
                        }

                        addToCart(p);
                    };
                    resultsDiv.appendChild(div);
                });
            } else {
                resultsDiv.style.display = 'none';
            }
        });

        // Hide on outside click
        document.addEventListener('click', function (e) {
            if (!searchInput.contains(e.target) && !resultsDiv.contains(e.target)) {
                resultsDiv.style.display = 'none';
            }
        });
    }

    function addToCart(product) {
        let currentCart = getCart();
        const existingItem = currentCart.find(item => item.id === product.id);
        
        const priceUSD = parseFloat(product.precio_venta_usd || 0);
        const maxStock = parseFloat(product.stock) || 0;

        if (existingItem) {
            if (existingItem.cantidad + 1 > maxStock) {
                if (typeof showNotification === 'function') showNotification('Límite de Stock', 'No puedes agregar más de la cantidad en inventario.');
                else alert('No puedes agregar más de la cantidad en inventario.');
                return;
            }
            existingItem.cantidad++;
            existingItem.subtotal_usd = existingItem.cantidad * existingItem.precio_unitario_usd;
        } else {
            currentCart.push({
                product_id: product.id,
                id: product.id, // for convenience
                nombre: product.nombre,
                codigo: product.codigo,
                cantidad: 1,
                precio_unitario_usd: priceUSD,
                costo_unitario_usd: parseFloat(product.costo_usd || 0),
                subtotal_usd: priceUSD,
                max_stock: maxStock
            });
        }
        
        setCart(currentCart);
        renderCart();
    }

    function removeFromCart(index) {
        let currentCart = getCart();
        currentCart.splice(index, 1);
        setCart(currentCart);
        renderCart();
    }

    function updateCartQuantity(index, newQuantity) {
        let currentCart = getCart();
        const item = currentCart[index];
        const qty = parseFloat(newQuantity);

        if (qty <= 0) {
            removeFromCart(index);
            return;
        }

        if (qty > item.max_stock) {
            if (typeof showNotification === 'function') showNotification('Límite de Stock', 'No puedes exceder la cantidad en inventario.');
            else alert('No puedes exceder la cantidad en inventario.');
            return;
        }

        item.cantidad = qty;
        item.subtotal_usd = item.cantidad * item.precio_unitario_usd;
        setCart(currentCart);
        renderCart();
    }

    function renderCart() {
        const tbody = document.getElementById('cartTableBody');
        const currentCart = getCart();
        const btnCheckout = document.querySelector('.btn-checkout');
        
        if (!tbody) return;

        tbody.innerHTML = '';
        let totalUSD = 0;

        if (currentCart.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 3rem;">Escanea o busca un producto para comenzar</td></tr>`;
            if (btnCheckout) btnCheckout.disabled = true;
        } else {
            if (btnCheckout) btnCheckout.disabled = false;
            currentCart.forEach((item, index) => {
                totalUSD += item.subtotal_usd;
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>
                        <strong>${item.nombre}</strong><br>
                        <small style="color: var(--text-muted);">${item.codigo}</small>
                    </td>
                    <td>$${item.precio_unitario_usd.toFixed(2)}</td>
                    <td>
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <button class="btn-action" style="padding: 0.2rem 0.5rem;" onclick="updateCartQuantityPOS(${index}, ${item.cantidad - 1})">-</button>
                            <input type="number" value="${item.cantidad}" min="1" max="${item.max_stock}" 
                                style="width: 50px; text-align: center; border: 1px solid var(--glass-border); background: transparent; color: var(--text-color); border-radius: 4px;"
                                onchange="updateCartQuantityPOS(${index}, this.value)"
                            >
                            <button class="btn-action" style="padding: 0.2rem 0.5rem;" onclick="updateCartQuantityPOS(${index}, ${item.cantidad + 1})">+</button>
                        </div>
                    </td>
                    <td style="font-weight: bold; color: var(--primary-color);">$${item.subtotal_usd.toFixed(2)}</td>
                    <td>
                        <button class="btn-action" style="color: #ef4444;" onclick="removeFromCartPOS(${index})"><i class="fas fa-trash"></i></button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }

        const totalBs = totalUSD * exchangeRate;

        const elSub = document.getElementById('cartSubtotal');
        if (elSub) elSub.innerText = `$${totalUSD.toFixed(2)}`;

        const elBs = document.getElementById('totalBs');
        if (elBs) elBs.innerText = formatCurrency(totalBs);

        const elUSD = document.getElementById('totalUSD');
        if (elUSD) elUSD.innerText = `$${totalUSD.toFixed(2)}`;
    }

    // Expose DOM methods for inline onclick handlers
    window.updateCartQuantityPOS = updateCartQuantity;
    window.removeFromCartPOS = removeFromCart;

    window.clearCart = () => {
        setCart([]);
        renderCart();
    };

    // --- Client Tabs Logic ---
    window.switchClient = (tabIndex) => {
        const tabs = document.querySelectorAll('.client-tab');
        tabs.forEach((tab, index) => {
            if (index === tabIndex) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });
        
        currentTab = tabIndex + 1;
        renderCart();
        
        // Restore Client ID for active tab
        const activeClientCedula = currentTab === 1 ? clientId1 : clientId2;
        const activeClientData = currentTab === 1 ? window.clientData1 : window.clientData2;
        
        if (!activeClientCedula || !activeClientData) {
            document.getElementById('posClientInfo').style.display = 'none';
            document.getElementById('posClientCedula').value = '';
            document.getElementById('selectedClientId').value = '';
            document.getElementById('posClientNotFound').style.display = 'none';
        } else {
             document.getElementById('posClientCedula').value = activeClientCedula; 
             document.getElementById('posClientInfo').style.display = 'flex';
             document.getElementById('posClientName').innerText = activeClientData.nombre;
             document.getElementById('posClientPhone').innerText = `Tel: ${activeClientData.telefono || '-'}`;
             document.getElementById('posClientEmail').innerText = `Email: ${activeClientData.email || '-'}`;
             document.getElementById('selectedClientId').value = activeClientData.id;
             document.getElementById('selectedClientEmail').value = activeClientData.email || '';
             document.getElementById('posClientNotFound').style.display = 'none';
        }
    };

    // --- Client Search Logic ---
    const btnSearchClient = document.getElementById('btnSearchClient');
    const inputClientCedula = document.getElementById('posClientCedula');
    
    if (btnSearchClient && inputClientCedula) {
        btnSearchClient.onclick = async () => {
            const cedula = inputClientCedula.value.trim();
            if (!cedula) return;

            try {
                const res = await fetch(`/api/clients/${cedula}`);
                const data = await res.json();
                
                if (data.success && data.data) {
                    const client = data.data;
                    document.getElementById('posClientNotFound').style.display = 'none';
                    document.getElementById('posClientInfo').style.display = 'flex';
                    document.getElementById('posClientName').innerText = client.nombre;
                    document.getElementById('posClientPhone').innerText = `Tel: ${client.telefono || '-'}`;
                    document.getElementById('posClientEmail').innerText = `Email: ${client.email || '-'}`;
                    
                    document.getElementById('selectedClientId').value = client.id;
                    document.getElementById('selectedClientEmail').value = client.email || '';

                    // Save to current tab
                    if (currentTab === 1) {
                         clientId1 = client.cedula;
                         window.clientData1 = client;
                    } else {
                         clientId2 = client.cedula;
                         window.clientData2 = client;
                    }

                } else {
                    document.getElementById('posClientInfo').style.display = 'none';
                    document.getElementById('posClientNotFound').style.display = 'flex';
                    document.getElementById('selectedClientId').value = '';
                    document.getElementById('selectedClientEmail').value = '';
                    
                    if (currentTab === 1) {
                         clientId1 = null;
                         window.clientData1 = null;
                    } else {
                         clientId2 = null;
                         window.clientData2 = null;
                    }
                }
            } catch (err) {
                console.error('Error searching client:', err);
            }
        };

        // Trigger search on Enter or Blur (loses focus)
        inputClientCedula.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') btnSearchClient.click();
        });

        inputClientCedula.addEventListener('blur', () => {
            const cedula = inputClientCedula.value.trim();
            if (cedula) btnSearchClient.click();
        });
    }

    const btnPosNewClient = document.getElementById('btnPosNewClient');
    if (btnPosNewClient) {
        btnPosNewClient.onclick = () => {
            document.getElementById('posClientModal').style.display = 'flex';
            document.getElementById('newPosClientCedula').value = inputClientCedula.value;
        };
    }

    const posClientForm = document.getElementById('posClientForm');
    if (posClientForm) {
        posClientForm.onsubmit = async (e) => {
            e.preventDefault();
            const cedula = document.getElementById('newPosClientCedula').value;
            const nombre = document.getElementById('newPosClientName').value;
            const email = document.getElementById('newPosClientEmail').value;
            const telefono = document.getElementById('newPosClientPhone').value;

            try {
                const res = await fetch('/api/clients', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ cedula, nombre, email, telefono })
                });
                
                if (res.ok) {
                    document.getElementById('posClientModal').style.display = 'none';
                    if (typeof showNotification === 'function') showNotification('Éxito', 'Cliente registrado correctamente.');
                    // Retry search to select it
                    inputClientCedula.value = cedula;
                    btnSearchClient.click();
                } else {
                    if (typeof showNotification === 'function') showNotification('Error', 'No se pudo guardar el cliente.');
                }
            } catch (err) {
                console.error(err);
            }
        };
    }

    window.processSale = () => {
        let currentCart = getCart();
        if (currentCart.length === 0) {
            if (typeof showNotification === 'function') showNotification('Atención', 'El carrito está vacío.');
            else alert('El carrito está vacío.');
            return;
        }

        let totalUSD = currentCart.reduce((sum, item) => sum + item.subtotal_usd, 0);
        let totalBs = totalUSD * exchangeRate;

        // Populate Payment Modal
        document.getElementById('payTotalUSD').innerText = `$${totalUSD.toFixed(2)}`;
        document.getElementById('payTotalBs').innerText = formatCurrency(totalBs);
        
        // Setup initial splits if you have split payment logic (mocked here or handled in nucleo)
        if (window.initPaymentModal) {
             window.initPaymentModal(totalUSD, totalBs, getSelectedClient(), currentCart);
             document.getElementById('paymentModal').style.display = 'flex';
        } else {
             // Basic fallback if initPaymentModal doesn't exist
             document.getElementById('paymentAmountInput').value = totalUSD.toFixed(2);
             document.getElementById('paymentRemaining').innerText = `$${totalUSD.toFixed(2)}`;
             document.getElementById('btnFinalizeSale').disabled = false;
             document.getElementById('paymentModal').style.display = 'flex';
        }
    };
    
    // Add logic for finalizing sale basic fallback if not in nucleo
    window.finalizeSale = () => {
        if (typeof showNotification === 'function') showNotification('Éxito', 'Venta finalizada (Simulación).');
        document.getElementById('paymentModal').style.display = 'none';
        clearCart();
    };

    window.closePaymentModal = () => {
        document.getElementById('paymentModal').style.display = 'none';
    };
}

// =============================================================================
// MÓDULO: REPORTES
// =============================================================================
function initReports() {
    console.log('Inicializando Reportes...');

    // Tab Elements
    const tabs = {
        general: document.getElementById('tabGeneral'),
        products: document.getElementById('tabProducts'),
        history: document.getElementById('tabHistory'),
        audit: document.getElementById('tabAudit')
    };

    // View Elements
    const views = {
        general: document.getElementById('viewGeneral'),
        products: document.getElementById('viewProducts'),
        history: document.getElementById('viewHistory'),
        audit: document.getElementById('viewAudit')
    };

    // Tab Switching Logic
    function switchTab(activeKey) {
        Object.keys(tabs).forEach(key => {
            if (!tabs[key] || !views[key]) return;
            if (key === activeKey) {
                tabs[key].classList.add('active');
                tabs[key].style.background = 'rgba(99, 102, 241, 0.2)';
                tabs[key].style.borderColor = 'var(--primary-color)';
                views[key].style.display = 'block';
            } else {
                tabs[key].classList.remove('active');
                tabs[key].style.background = 'transparent';
                tabs[key].style.borderColor = 'var(--glass-border)';
                views[key].style.display = 'none';
            }
        });
    }

    if (tabs.general) tabs.general.onclick = () => switchTab('general');
    if (tabs.products) tabs.products.onclick = () => switchTab('products');
    if (tabs.history) tabs.history.onclick = () => switchTab('history');
    if (tabs.audit) tabs.audit.onclick = () => switchTab('audit');

    // Data Fetching
    const btnGenerate = document.getElementById('btnGenerateReport');
    if (btnGenerate) {
        btnGenerate.addEventListener('click', async () => {
            const startDate = document.getElementById('reportStartDate').value;
            const endDate = document.getElementById('reportEndDate').value;

            if (!startDate || !endDate) {
                if (typeof showNotification === 'function') {
                    showNotification('Atención', 'Por favor selecciona un rango de fechas para generar el reporte.');
                } else {
                    alert('Por favor selecciona un rango de fechas para generar el reporte.');
                }
                return;
            }

            const payload = { startDate, endDate };

            try {
                // 1. Fetch Dashboard
                const resDash = await fetch('/api/reports/dashboard', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
                });
                const dataDash = await resDash.json();
                if (dataDash.success) {
                    document.getElementById('totalSalesUSD').innerText = '$' + parseFloat(dataDash.dashboard.total_ventas_usd).toFixed(2);
                    document.getElementById('totalSalesBS').innerText = formatCurrency(dataDash.dashboard.total_ventas_bs);
                    document.getElementById('estProfitUSD').innerText = '$' + parseFloat(dataDash.dashboard.est_profit_usd).toFixed(2);
                    document.getElementById('estProfitBS').innerText = formatCurrency(dataDash.dashboard.est_profit_bs);
                }

                // 2. Fetch Products
                const resProd = await fetch('/api/reports/products', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
                });
                const dataProd = await resProd.json();
                const prodTbody = document.getElementById('productsTableBody');
                if (dataProd.success && prodTbody) {
                    prodTbody.innerHTML = '';
                    const productsList = dataProd.products || dataProd.data || [];
                    if (productsList.length === 0) {
                        prodTbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Sin datos</td></tr>';
                    } else {
                        productsList.forEach(p => {
                            prodTbody.innerHTML += `
                                <tr>
                                    <td>${p.producto}</td>
                                    <td>${p.categoria || 'Sin Categoría'}</td>
                                    <td>${p.cantidad_vendida}</td>
                                    <td>$${parseFloat(p.total_ventas_usd).toFixed(2)}</td>
                                    <td style="color: #fbbf24;">$${parseFloat(p.est_profit_usd).toFixed(2)}</td>
                                </tr>
                            `;
                        });
                    }
                }

                // 3. Fetch History
                const resHist = await fetch('/api/reports/history', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
                });
                const dataHist = await resHist.json();
                const histTbody = document.getElementById('historyTableBody');
                if (dataHist.success && histTbody) {
                    histTbody.innerHTML = '';
                    if (dataHist.history.length === 0) {
                        histTbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">Sin datos</td></tr>';
                    } else {
                        dataHist.history.forEach(v => {
                            const dateObj = new Date(v.fecha);
                            const dateStr = `${String(dateObj.getDate()).padStart(2, '0')}/${String(dateObj.getMonth() + 1).padStart(2, '0')}/${dateObj.getFullYear()}`;
                            histTbody.innerHTML += `
                                <tr>
                                    <td>#${v.id}</td>
                                    <td>${dateStr}</td>
                                    <td>${v.cliente || 'Consumidor Final'}</td>
                                    <td>$${parseFloat(v.total_usd).toFixed(2)}</td>
                                    <td>${formatCurrency(parseFloat(v.total_bs))}</td>
                                    <td>${v.metodo_pago}</td>
                                    <td><button class="btn-action" onclick="printTicket(${v.id})"><i class="fas fa-print"></i></button></td>
                                </tr>
                            `;
                        });
                    }
                }

                // 4. Fetch Audit
                const resAudit = await fetch('/api/reports/audit', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
                });
                const dataAudit = await resAudit.json();
                const auditTbody = document.getElementById('auditTableBody');
                if (dataAudit.success && auditTbody) {
                    auditTbody.innerHTML = '';
                    if (dataAudit.audit.length === 0) {
                        auditTbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Sin datos</td></tr>';
                    } else {
                        dataAudit.audit.forEach(a => {
                            const dateObj = new Date(a.fecha);
                            const dateStr = `${String(dateObj.getDate()).padStart(2, '0')}/${String(dateObj.getMonth() + 1).padStart(2, '0')} ${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}`;
                            auditTbody.innerHTML += `
                                <tr>
                                    <td>${dateStr}</td>
                                    <td>${a.usuario || 'Sistema'}</td>
                                    <td>${a.accion}</td>
                                    <td>${a.tabla}</td>
                                    <td>${JSON.stringify(a.detalle || {})}</td>
                                    <td>${a.ip || ''}</td>
                                </tr>
                            `;
                        });
                    }
                }
            } catch (err) {
                console.error('Error fetching reports:', err);
            }
        });

        // btnGenerate.click(); // Removed to avoid auto-loading data without dates
    }
}

// =============================================================================
// MÓDULO: USUARIOS
// =============================================================================
function initUsers() {
    console.log('Inicializando Usuarios...');
    const btnNewUser = document.getElementById('btnNewUser');
    if (btnNewUser) {
        btnNewUser.onclick = () => openUserModal();
    }

    let allUsers = [];

    // Search Logic
    const searchInput = document.getElementById('userSearch');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const rows = document.querySelectorAll('#usersTableBody tr');
            rows.forEach(row => {
                const name = row.children[2].textContent.toLowerCase();
                const email = row.children[3].textContent.toLowerCase();
                if (name.includes(term) || email.includes(term)) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            });
        });
    }

    // Modal Interaction
    const modal = document.getElementById('userModal');
    const btnCancel = document.getElementById('btnCancelModal');
    const spanClose = modal?.querySelector('.close');

    if (btnCancel) btnCancel.onclick = () => { if (modal) modal.style.display = 'none'; };
    if (spanClose) spanClose.onclick = () => { if (modal) modal.style.display = 'none'; };
    window.onclick = (event) => { if (event.target == modal) modal.style.display = 'none'; };

    // Form Submit
    const userForm = document.getElementById('userForm');
    if (userForm) {
        userForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('userId').value;

            const formData = new FormData();
            formData.append('nombre', document.getElementById('nombre').value);
            formData.append('email', document.getElementById('itemEmail').value);

            const password = document.getElementById('itemPassword').value;
            if (password) formData.append('password', password);

            formData.append('rol', document.getElementById('rol').value);
            formData.append('activo', document.getElementById('estatus').value === 'true');

            const avatarInput = document.getElementById('avatar');
            if (avatarInput && avatarInput.files[0]) {
                formData.append('avatar', avatarInput.files[0]);
            }

            const method = id ? 'PUT' : 'POST';
            const url = id ? `/api/users/${id}` : '/api/users';

            try {
                const res = await fetch(url, {
                    method: method,
                    // No Content-Type header needed for FormData
                    body: formData
                });
                const data = await res.json();
                if (data.success || data.id) { // Adjust based on API response
                    showNotification('Éxito', 'Usuario guardado correctamente.');
                    if (modal) modal.style.display = 'none';
                    await loadUsers();
                    // Reset file input
                    if (avatarInput) avatarInput.value = '';
                } else {
                    showNotification('Error', data.message || 'Error al guardar usuario.');
                }
            } catch (err) {
                console.error(err);
                showNotification('Error', 'Error de conexión con el servidor.');
            }
        });
    }

    loadUsers();

    async function loadUsers() {
        try {
            const res = await fetch('/api/users');
            allUsers = await res.json(); // Store in header scope variable
            const users = allUsers;
            const tbody = document.getElementById('usersTableBody');
            if (!tbody) return;

            tbody.innerHTML = '';
            users.forEach(u => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${u.id}</td>
                    <td><div class="user-avatar-small"><img src="/api/users/${u.id}/avatar" style="width: 40px; height: 40px; object-fit: cover; border-radius: 10px;" onerror="this.onerror=null; this.src='images/default-avatar.jpg'; this.style.width='40px'; this.style.height='40px'; this.style.objectFit='cover'; this.style.borderRadius='10px';"></div></td>
                    <td>${u.nombre || 'Sin Nombre'}</td>
                    <td>${u.email}</td>
                    <td><span class="badge badge-${u.rol === 'admin' ? 'primary' : 'secondary'}">${u.rol}</span></td>
                    <td><span class="status-indicator ${u.activo ? 'status-active' : 'status-inactive'}"></span> ${u.activo ? 'Activo' : 'Inactivo'}</td>
                    <td>
                        <button class="btn-action btn-edit" onclick="editUser(${u.id})"><i class="fas fa-edit"></i></button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        } catch (e) {
            console.error(e);
            // Only show notification on error if needed, avoid spamming on load
        }
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
            if (!u) {
                // Reset defaults for new user
                document.getElementById('rol').value = 'vendedor';
                document.getElementById('estatus').value = 'true';
            }
        }
    };

    window.editUser = (id) => {
        const user = allUsers.find(u => u.id === id);
        if (user) {
            openUserModal(user);
        } else {
            console.error('User not found:', id);
        }
    };

    // ... deleteUser implementation ...
    window.deleteUser = async (id) => {
        // Use custom confirm if possible, otherwise native
        if (window.showConfirm) {
            const confirmed = await window.showConfirm('¿Estás seguro de eliminar este usuario?', 'Eliminar Usuario');
            if (!confirmed) return;
        } else {
            if (!confirm('¿Estás seguro de eliminar este usuario?')) return;
        }

        try {
            const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                showNotification('Eliminado', 'Usuario eliminado correctamente.');
                loadUsers();
            } else {
                showNotification('Error', data.message || 'Error al eliminar usuario.');
            }
        } catch (e) {
            console.error(e);
            showNotification('Error', 'Error de conexión.');
        }
    };
}



function initSuppliers() {
    console.log('Inicializando Proveedores...');
    loadSuppliers();

    async function loadSuppliers() {
        try {
            const res = await fetch('/api/suppliers');
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
        } catch (e) {
            console.error(e);
        }
    }


    // Button Listener
    const btnNewSupplier = document.getElementById('btnNewSupplier');
    if (btnNewSupplier) {
        btnNewSupplier.onclick = () => openSupplierModal();
    }

    // Submit Listener
    const supplierForm = document.getElementById('supplierForm');
    if (supplierForm) {
        supplierForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('supplierId').value;
            const supplierData = {
                rif: document.getElementById('supRif').value,
                nombre: document.getElementById('supNombre').value,
                telefono: document.getElementById('supTelefono').value,
                dias_credito: document.getElementById('supDiasCredito').value,
                activo: document.getElementById('supActivo').value === 'true'
            };

            try {
                let res;
                if (id) {
                    res = await fetch(`/api/suppliers/${id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(supplierData)
                    });
                } else {
                    res = await fetch('/api/suppliers', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(supplierData)
                    });
                }

                if (res.ok) {
                    document.getElementById('supplierModal').style.display = 'none';
                    showNotification('Éxito', 'Proveedor guardado correctamente.');
                    loadSuppliers();
                } else {
                    showNotification('Error', 'No se pudo guardar el proveedor.');
                }
            } catch (e) {
                console.error(e);
                showNotification('Error', 'Error de conexión.');
            }
        });
    }

    // Modal Logic
    const modal = document.getElementById('supplierModal');
    const btnCancel = document.getElementById('btnCancel');
    const closeSpan = modal ? modal.querySelector('.close') : null;

    if (btnCancel) btnCancel.onclick = () => modal.style.display = 'none';
    if (closeSpan) closeSpan.onclick = () => modal.style.display = 'none';
    window.onclick = (e) => {
        if (e.target == modal) modal.style.display = 'none';
    };

    // Notification Close
    const btnCloseNotification = document.getElementById('btnCloseNotification');
    if (btnCloseNotification) {
        btnCloseNotification.onclick = () => {
            const notifModal = document.getElementById('notificationModal');
            if (notifModal) notifModal.style.display = 'none';
        }
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
            const res = await fetch('/api/categories');
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

    // Button Listener
    const btnNewClient = document.getElementById('btnNewClient');
    if (btnNewClient) {
        btnNewClient.onclick = () => openClientModal();
    }

    // Modal Closing Logic
    const modal = document.getElementById('clientModal');
    const btnCancel = document.getElementById('btnCancel');
    const closeSpan = modal ? modal.querySelector('.close') : null;

    if (btnCancel) btnCancel.onclick = () => modal.style.display = 'none';
    if (closeSpan) closeSpan.onclick = () => modal.style.display = 'none';
    window.onclick = (e) => {
        if (e.target == modal) modal.style.display = 'none';
        // Ensure global click also works for notif if clicked outside (though nucleo.js handles it, this overrides it locally)
        const notifModal = document.getElementById('notificationModal');
        if (e.target == notifModal) notifModal.style.display = 'none';
    };

    // Notification Close Logic (Specific Button)
    const btnCloseNotification = document.getElementById('btnCloseNotification');
    if (btnCloseNotification) {
        btnCloseNotification.onclick = () => {
            const notifModal = document.getElementById('notificationModal');
            if (notifModal) notifModal.style.display = 'none';
        }
    }

    // Form Submit Handler
    const clientForm = document.getElementById('clientForm');
    if (clientForm) {
        clientForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const id = document.getElementById('clientId').value;
            const clientData = {
                id: id || null,
                cedula: document.getElementById('cliCedula').value,
                nombre: document.getElementById('cliNombre').value,
                email: document.getElementById('cliEmail').value,
                telefono: document.getElementById('cliTelefono').value
            };

            try {
                const res = await fetch('/api/clients', {
                    method: 'POST', // The backend handles both Create and Update on POST w/ logic or we can separate if needed, but per servidor.js analysis line 2178 it handles update if ID exists.
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(clientData)
                });

                const data = await res.json();

                if (res.ok && data.success) {
                    showNotification('Éxito', data.message || 'Cliente guardado correctamente.');
                    if (modal) modal.style.display = 'none';
                    clientForm.reset();
                    loadClients();
                } else {
                    showNotification('Error', data.message || 'No se pudo guardar el cliente.');
                }
            } catch (error) {
                console.error('Error saving client:', error);
                showNotification('Error', 'Hubo un error de conexión al guardar el cliente.');
            }
        });
    }

    loadClients();

    async function loadClients() {
        try {
            const res = await fetch('/api/clients');
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
    const API_URL = '/api/config';
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

    // --- ALERT SETTINGS ---
    const alertForm = document.getElementById('alertForm');
    const alertDaysInput = document.getElementById('alertDays');

    // Load initial alert config
    fetch('/api/config/alerts')
        .then(res => res.json())
        .then(data => {
            if (alertDaysInput && data.alert_days) {
                alertDaysInput.value = data.alert_days;
            }
        })
        .catch(err => console.error('Error loading alert config:', err));

    if (alertForm) {
        alertForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const days = alertDaysInput ? alertDaysInput.value : 3;

            try {
                const res = await fetch('/api/config/alerts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ alert_days: days })
                });

                if (res.ok) {
                    showNotification('Éxito', 'Configuración de alertas guardada.');
                } else {
                    showNotification('Error', 'No se pudo guardar la configuración.');
                }
            } catch (err) {
                console.error(err);
                showNotification('Error', 'Error de conexión.');
            }
        });
    }

    // --- PRESENTATIONS MANAGEMENT ---
    async function loadPresentations() {
        const tbody = document.getElementById('presentationsTableBody');
        if (!tbody) return;

        try {
            const res = await fetch('/api/config/presentations');
            const items = await res.json();
            
            tbody.innerHTML = '';
            items.forEach(p => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${p.nombre}</td>
                    <td style="text-align: center;">
                        <button class="btn-action btn-delete" onclick="deletePresentation(${p.id})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        } catch (e) { console.error('Error loading presentations:', e); }
    }

    const btnAddPresentation = document.getElementById('btnAddPresentation');
    if (btnAddPresentation) {
        btnAddPresentation.onclick = async () => {
            const input = document.getElementById('newPresentationName');
            const name = input?.value.trim();
            if (!name) return;

            try {
                const res = await fetch('/api/config/presentations', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ nombre: name })
                });
                const data = await res.json();
                if (data.success) {
                    input.value = '';
                    loadPresentations();
                } else {
                    alert('Error: ' + (data.message || data.error));
                }
            } catch (e) { console.error(e); }
        };
    }

    window.deletePresentation = async (id) => {
        if (!confirm('¿Seguro que deseas eliminar esta presentación?')) return;
        try {
            const res = await fetch(`/api/config/presentations/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) loadPresentations();
        } catch (e) { console.error(e); }
    }

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

                        const res = await fetch(`${apiEndpoint}`, {
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
                        const res = await fetch('/api/products/bulk-create', {
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
                        const res = await fetch('/api/products/bulk-receive', {
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
}


window.currentInventoryTab = 'venta'; // Global state

window.switchInventoryTab = (tab) => {
    // DEBUG ALERT
    console.log('Switching to tab:', tab);
    // alert('Cambiando a pestaña: ' + tab);
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

    // Trigger Re-render via Event
    const event = new CustomEvent('inventoryTabChanged', { detail: { tab: tab } });
    document.dispatchEvent(event);
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
    let url = '/api/mermas';
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
                            <td>${m.bodega || '-'}</td>
                            <td>${qty}</td>
                            <td>$${cost.toFixed(2)}</td>
                            <td>$${subtotal.toFixed(2)}</td>
                            <td>${m.observacion || 'MERMA'}</td>
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
        const res = await fetch('/api/products/merma', {
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

// =============================================================================
// MÓDULO: CUENTAS POR PAGAR
// =============================================================================
function initCuentas() {
    console.log('Inicializando Cuentas...');

    // Modal Logic
    window.openAddModal = () => {
        const modal = document.getElementById('addModal');
        if (modal) modal.style.display = 'flex';
        // Set default issue date to today
        const issueDate = document.getElementById('newIssueDate');
        if (issueDate && !issueDate.value) {
            issueDate.valueAsDate = new Date();
        }
    };

    window.closeAddModal = () => {
        const modal = document.getElementById('addModal');
        if (modal) modal.style.display = 'none';
        document.getElementById('addForm').reset();
    };

    window.openPayModal = () => {
        const modal = document.getElementById('payModal');
        if (modal) modal.style.display = 'flex';
    };

    window.closePayModal = () => {
        const modal = document.getElementById('payModal');
        if (modal) modal.style.display = 'none';
    };

    // Close on click outside
    window.addEventListener('click', (event) => {
        const addModal = document.getElementById('addModal');
        const payModal = document.getElementById('payModal');
        if (event.target == addModal) closeAddModal();
        if (event.target == payModal) closePayModal();
    });

    // Load Data
    loadSuppliersForSelect();
    loadCommitments();

    // Auto-Calculate Due Date Listener
    const supplierSelect = document.getElementById('newSupplierId');
    if (supplierSelect) {
        supplierSelect.addEventListener('change', (e) => {
            const selectedOption = e.target.options[e.target.selectedIndex];
            const creditDays = parseInt(selectedOption.getAttribute('data-days')) || 0;

            // Calculate Due Date based on Issue Date (or today if empty)
            const issueDateInput = document.getElementById('newIssueDate');
            const baseDate = issueDateInput.valueAsDate || new Date();

            // DEBUG
            // alert(`Proveedor seleccionado. Días Crédito: ${creditDays}. Fecha Base: ${baseDate}`);

            const dueDate = new Date(baseDate);
            dueDate.setDate(dueDate.getDate() + creditDays);

            const dueDateInput = document.getElementById('newDueDate');
            if (dueDateInput) {
                dueDateInput.valueAsDate = dueDate;
            }
        });
    }

    // Also update when Issue Date changes
    const issueDateInput = document.getElementById('newIssueDate');
    if (issueDateInput) {
        issueDateInput.addEventListener('change', () => {
            const supplierSelect = document.getElementById('newSupplierId');
            if (supplierSelect && supplierSelect.value) {
                // Trigger change event to recalculate
                supplierSelect.dispatchEvent(new Event('change'));
            }
        });
    }



    // Load Suppliers Helper
    async function loadSuppliersForSelect() {
        try {
            const res = await fetch('/api/suppliers');
            const suppliers = await res.json();
            const select = document.getElementById('newSupplierId');
            if (select) {
                select.innerHTML = '<option value="">Seleccionar Proveedor...</option>';
                suppliers.forEach(s => {
                    // Store credit days in data attribute
                    select.innerHTML += `<option value="${s.id}" data-days="${s.dias_credito || 0}">${s.nombre}</option>`;
                });
            }
        } catch (e) { console.error(e); }
    }

    // Load Commitments Global Function (attached to window for filters)
    window.loadCommitments = async function () {
        try {
            const statusFilter = document.getElementById('filterStatus') ? document.getElementById('filterStatus').value : 'ALL';
            let url = '/api/commitments';
            if (statusFilter !== 'ALL') {
                url += `?status=${statusFilter}`;
            }

            const res = await fetch(url);
            const commitments = await res.json();
            renderCommitments(commitments);
        } catch (e) { console.error(e); }
    };

    function renderCommitments(data) {
        const tbody = document.getElementById('commitmentsTableBody');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" class="text-center">No hay compromisos registrados.</td></tr>';
            return;
        }

        data.forEach(c => {
            // Calculate progress
            const total = parseFloat(c.monto_total_usd);
            const paid = parseFloat(c.monto_pagado_usd);
            const progress = total > 0 ? (paid / total) * 100 : 0;

            // Status Badge
            let statusClass = 'badge-success';
            let statusText = c.estado;
            if (c.estado === 'PENDIENTE') statusClass = 'badge-danger'; // Assuming CSS has these or similar
            if (c.estado === 'PARCIAL') statusClass = 'badge-warning';

            // Use generic styles if badges not defined in main css, or map to styles
            // Mapping to styles we might have seen or standard logic

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${c.proveedor_nombre || 'N/A'}</td>
                <td>${c.numero_factura || '-'}</td>
                <td>${formatDate(c.fecha_emision)}</td>
                <td>${c.descripcion}</td>
                <td>$${total.toFixed(2)}</td>
                <td>$${paid.toFixed(2)}</td>
                <td>
                     <div style="background: rgba(255,255,255,0.1); border-radius: 4px; height: 8px; width: 100px; overflow: hidden;">
                        <div style="background: var(--primary-color); height: 100%; width: ${progress}%;"></div>
                    </div>
                    <small>${progress.toFixed(0)}%</small>
                </td>
                <td>${formatDate(c.fecha_vencimiento)}</td>
                <td><span style="padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; background: rgba(255,255,255,0.1);">${statusText}</span></td>
                <td>
                    <button class="btn-sm" onclick="showPayModal(${c.id}, ${total - paid})" style="background: transparent; color: var(--primary-color); border: 1px solid var(--primary-color);">
                        <i class="fas fa-hand-holding-usd"></i> Pagar
                    </button>
                    <!-- Delete button could adhere here if needed -->
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    // Helper Date Formatter
    function formatDate(dateString) {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleDateString();
    }

    // Payment Modal Stub
    window.showPayModal = (id, amountPending) => {
        console.log(`Pagar compromiso ${id}, pendiente: ${amountPending}`);
        showNotification('Info', 'Funcionalidad de pago pendiente de revisar en HTML.');
    };
} // END of initCuentas

// =============================================================================
// GLOBAL FUNCTIONS (CUENTAS)
// =============================================================================
// =============================================================================
// GLOBAL FUNCTIONS (CUENTAS)
// =============================================================================
let globalAlertDays = 3; // Default

async function updateAlertConfig() {
    try {
        const res = await fetch('/api/config/alerts');
        const data = await res.json();
        globalAlertDays = data.alert_days || 3;
    } catch (e) { console.error('Error fetching alert config:', e); }
}

window.saveCommitment = async () => {
    // alert('Global saveCommitment executing...'); // DEBUG

    const data = {
        proveedor_id: document.getElementById('newSupplierId').value,
        descripcion: document.getElementById('newDescription').value,
        numero_factura: document.getElementById('newInvoiceNumber').value,
        monto_usd: document.getElementById('newAmount').value,
        fecha_emision: document.getElementById('newIssueDate').value,
        fecha_vencimiento: document.getElementById('newDueDate').value
    };

    if (!data.proveedor_id || !data.descripcion || !data.monto_usd) {
        showNotification('Error', 'Faltan campos obligatorios');
        return;
    }

    // alert('Datos a enviar: ' + JSON.stringify(data)); // DEBUG

    try {
        const res = await fetch('/api/commitments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        // alert('Respuesta del servidor status: ' + res.status); // DEBUG

        if (res.ok) {
            const json = await res.json();
            // alert('Guardado éxito: ' + JSON.stringify(json)); // DEBUG
            showNotification('Éxito', 'Compromiso guardado correctamente.');
            closeAddModal();
            loadCommitments(); // Now global
            document.getElementById('addForm').reset();
        } else {
            const text = await res.text();
            // alert('Error servidor: ' + text); // DEBUG
            showNotification('Error', 'No se pudo guardar el compromiso.');
        }
    } catch (err) {
        console.error(err);
        // alert('Error excepción JS: ' + err.message); // DEBUG
        showNotification('Error', 'Error de conexión.');
    }
};

window.loadCommitments = async function () {
    try {
        await updateAlertConfig(); // Ensure we have latest config

        const statusFilter = document.getElementById('filterStatus') ? document.getElementById('filterStatus').value : 'ALL';
        let url = '/api/commitments';
        if (statusFilter !== 'ALL') {
            url += `?status=${statusFilter}`;
        }

        const res = await fetch(url);
        const commitments = await res.json();
        renderCommitments(commitments);
    } catch (e) { console.error(e); }
};

window.renderCommitments = function (data) {
    const tbody = document.getElementById('commitmentsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="text-center">No hay compromisos registrados.</td></tr>';
        return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    data.forEach(c => {
        // Calculate progress
        const total = parseFloat(c.monto_total_usd);
        const paid = parseFloat(c.monto_pagado_usd);
        const progress = total > 0 ? (paid / total) * 100 : 0;

        // Status Badge
        let statusClass = 'badge-success';
        let statusText = c.estado;
        if (c.estado === 'PENDIENTE') statusClass = 'badge-danger';
        if (c.estado === 'PARCIAL') statusClass = 'badge-warning';

        // Helper Date Formatter
        const formatDate = (dateString) => {
            if (!dateString) return '-';
            const date = new Date(dateString);
            return date.toLocaleDateString();
        };

        // Alert Logic
        let alertStyle = '';
        let rowStyle = '';

        if (c.estado !== 'PAGADO') {
            const dueDate = new Date(c.fecha_vencimiento);
            dueDate.setHours(0, 0, 0, 0);

            const diffTime = dueDate - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays < 0) {
                // Overdue
                rowStyle = 'background-color: rgba(220, 38, 38, 0.1); border-left: 4px solid #dc2626;';
                statusText += ' (VENCIDO)';
                statusClass = 'badge-danger'; // Force red badge
            } else if (diffDays <= globalAlertDays) {
                // Warning
                rowStyle = 'background-color: rgba(234, 179, 8, 0.1); border-left: 4px solid #eab308;';
                statusText += ` (Vence en ${diffDays} días)`;
            }
        }

        const tr = document.createElement('tr');
        if (rowStyle) tr.style.cssText = rowStyle;

        tr.innerHTML = `
            <td>${c.proveedor_nombre || 'N/A'}</td>
            <td>${c.numero_factura || '-'}</td>
            <td>${formatDate(c.fecha_emision)}</td>
            <td>${c.descripcion}</td>
            <td>$${total.toFixed(2)}</td>
            <td>$${paid.toFixed(2)}</td>
            <td>
                 <div style="background: rgba(255,255,255,0.1); border-radius: 4px; height: 8px; width: 100px; overflow: hidden;">
                    <div style="background: var(--primary-color); height: 100%; width: ${progress}%;"></div>
                </div>
                <small>${progress.toFixed(0)}%</small>
            </td>
            <td>${formatDate(c.fecha_vencimiento)}</td>
            <td><span class="${statusClass}" style="padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; background: rgba(255,255,255,0.1);">${statusText}</span></td>
            <td>
                <button class="btn-sm" onclick="showPayModal(${c.id}, ${total - paid})" style="background: transparent; color: var(--primary-color); border: 1px solid var(--primary-color);">
                    <i class="fas fa-hand-holding-usd"></i> Pagar
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
};

// =============================================================================
// MÓDULO: CATEGORIAS
// =============================================================================
function initCategories() {
    console.log('Inicializando Categorías...');

    // Load Categories on start
    loadCategories();

    // Button Listener
    const btnNewCategory = document.getElementById('btnNewCategory');
    if (btnNewCategory) {
        btnNewCategory.onclick = () => openCategoryModal();
    }

    // Modal Closing Logic
    const modal = document.getElementById('categoryModal');
    const btnCancel = document.getElementById('btnCancel');
    const closeSpan = modal ? modal.querySelector('.close') : null;

    if (btnCancel) btnCancel.onclick = () => modal.style.display = 'none';
    if (closeSpan) closeSpan.onclick = () => modal.style.display = 'none';
    window.onclick = (e) => { if (e.target == modal) modal.style.display = 'none'; };

    // Form Submit Handler
    const categoryForm = document.getElementById('categoryForm');
    if (categoryForm) {
        categoryForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('categoryId').value;
            const catData = {
                id: id || null,
                nombre: document.getElementById('catNombre').value,
                activo: document.getElementById('catActivo').value === 'true'
            };

            try {
                const res = await fetch('/api/categories', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(catData)
                });
                const data = await res.json();
                if (res.ok && data.success) {
                    showNotification('Éxito', data.message || 'Categoría guardada.');
                    if (modal) modal.style.display = 'none';
                    categoryForm.reset();
                    loadCategories();
                } else {
                    showNotification('Error', data.message || 'Error al guardar categoría.');
                }
            } catch (err) {
                console.error(err);
                showNotification('Error', 'Error de conexión.');
            }
        });
    }

    // Helper: Load Categories
    async function loadCategories() {
        try {
            const res = await fetch('/api/categories');
            const categories = await res.json();
            const tbody = document.getElementById('categoriesBody');
            if (tbody) {
                tbody.innerHTML = '';
                categories.forEach(c => {
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
        } catch (e) {
            console.error(e);
        }
    }

    // Export Globals for onClick handlers
    window.openCategoryModal = (cat = null) => {
        const modal = document.getElementById('categoryModal');
        if (modal) {
            modal.style.display = 'flex';
            document.getElementById('categoryId').value = cat ? cat.id : '';
            document.getElementById('catNombre').value = cat ? cat.nombre : '';
            document.getElementById('catActivo').value = cat ? (cat.activo ? 'true' : 'false') : 'true';
            document.getElementById('modalTitle').innerText = cat ? 'Editar Categoría' : 'Nueva Categoría';
        }
    };


}
