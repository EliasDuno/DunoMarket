
// 12. BULK OPERATIONS & TEMPLATES
window.downloadTemplate = (type) => {
    let data = [];
    let filename = '';

    switch (type) {
        case 'categories':
            data = [{ nombre: 'Ej: Bebidas', descripcion: 'Descripción opcional' }];
            filename = 'plantilla_categorias.xlsx';
            break;
        case 'suppliers':
            data = [{
                rif: 'J-12345678-0',
                nombre: 'Ej: Polar',
                telefono: '04141234567',
                direccion: 'Zona Industrial',
                dias_credito: 15
            }];
            filename = 'plantilla_proveedores.xlsx';
            break;
        case 'create':
            // Backend expects: codigo, nombre, categoria (name), proveedor (name), costo, margen, minimo
            data = [{
                codigo: 'PROD001',
                nombre: 'Producto Ejemplo',
                categoria: 'Bebidas', // Backend resolves/creates this name
                proveedor: 'Polar', // Backend resolves/creates this name
                costo: 10.00,
                margen: 30.00,
                minimo: 10,
                presentacion: 'Unidad',
                fecha_vencimiento: '2025-12-31'
            }];
            filename = 'plantilla_productos.xlsx';
            break;
        case 'receive': // Carga de Stock
            data = [{
                codigo_producto: 'PROD001',
                cantidad: 50,
                nuevo_costo: 10.50,
                nuevo_margen: 30.00,
                proveedor_id: '1 (Opcional)'
            }];
            filename = 'plantilla_stock.xlsx';
            break;
        case 'clients':
            data = [{
                cedula: 'V12345678',
                nombre: 'Juan Perez',
                telefono: '04121234567',
                email: 'juan@example.com',
                direccion: 'Calle 1'
            }];
            filename = 'plantilla_clientes.xlsx';
            break;
        case 'users':
            data = [{
                nombre: 'Vendedor 1',
                email: 'vendedor@test.com',
                password: 'clave_segura',
                rol: 'vendedor'
            }];
            filename = 'plantilla_usuarios.xlsx';
            break;
    }

    if (data.length > 0) {
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Plantilla");
        XLSX.writeFile(wb, filename);
    } else {
        showNotification('Error', 'Tipo de plantilla no definido');
    }
};

function initBulkOperations() {
    // Helper to read Excel
    const readExcel = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheet = workbook.SheetNames[0];
                    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet]);
                    resolve(rows);
                } catch (err) { reject(err); }
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    };

    const log = (msg, success = true) => {
        const logBox = document.getElementById('bulkLog');
        if (logBox) {
            logBox.style.display = 'block';
            const color = success ? '#4ade80' : '#f87171';
            logBox.innerHTML += `<div style="color: ${color}; margin-bottom: 2px;">${new Date().toLocaleTimeString()} - ${msg}</div>`;
            logBox.scrollTop = logBox.scrollHeight;
        }
    };

    // 1. Categories
    const catInput = document.getElementById('bulkCatInput');
    if (catInput) {
        catInput.addEventListener('change', async (e) => {
            if (!e.target.files.length) return;
            const rows = await readExcel(e.target.files[0]);
            if (!rows.length) return showNotification('Error', 'Archivo vacío');

            showNotification('Procesando', `Cargando ${rows.length} categorías...`);
            let count = 0;
            for (const r of rows) {
                if (!r.nombre) continue;
                try {
                    await fetch('http://localhost:3000/api/categories', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ nombre: r.nombre, descripcion: r.descripcion })
                    });
                    count++;
                } catch (err) { log(`Error categoría ${r.nombre}: ${err.message}`, false); }
            }
            log(`Categorías cargadas: ${count} de ${rows.length}`);
            showNotification('Éxito', 'Proceso finalizado');
            e.target.value = ''; // Reset
        });
    }

    // 2. Suppliers
    const provInput = document.getElementById('bulkProvInput');
    if (provInput) {
        provInput.addEventListener('change', async (e) => {
            if (!e.target.files.length) return;
            const rows = await readExcel(e.target.files[0]);
            showNotification('Procesando', `Cargando ${rows.length} proveedores...`);
            let count = 0;
            for (const r of rows) {
                if (!r.rif || !r.nombre) continue;
                try {
                    await fetch('http://localhost:3000/api/suppliers', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ rif: r.rif, nombre: r.nombre, telefono: r.telefono, direccion: r.direccion, dias_credito: r.dias_credito })
                    });
                    count++;
                } catch (err) { log(`Error proveedor ${r.nombre}: ${err.message}`, false); }
            }
            log(`Proveedores cargados: ${count} de ${rows.length}`);
            showNotification('Éxito', 'Proceso finalizado');
            e.target.value = '';
        });
    }

    // 3. Create Products (Backend supports bulk)
    const createInput = document.getElementById('bulkCreateInput');
    if (createInput) {
        createInput.addEventListener('change', async (e) => {
            if (!e.target.files.length) return;
            const rows = await readExcel(e.target.files[0]);
            showNotification('Procesando', `Enviando ${rows.length} productos...`);

            // Map rows to backend expectation (Matched with servidor.js logic)
            const products = rows.map(r => ({
                codigo: r.codigo,
                nombre: r.nombre,
                categoria: r.categoria,      // Name (Backend resolves/creates)
                proveedor: r.proveedor,      // Name (Backend resolves/creates)
                costo: r.costo,              // Backend expects 'costo'
                margen: r.margen,            // Backend expects 'margen'
                minimo: r.minimo,            // Backend expects 'minimo'
                fecha_vencimiento: r.fecha_vencimiento,
                presentacion: r.presentacion
            }));

            try {
                const res = await fetch('http://localhost:3000/api/products/bulk-create', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ products })
                });
                const result = await res.json();
                if (result.success) {
                    log(`Productos creados: ${result.results.success} - Fallidos: ${result.results.failed}`);
                    if (result.results.errors && result.results.errors.length) {
                        result.results.errors.forEach(err => log(err, false));
                    }
                    showNotification('Éxito', 'Carga masiva completada');
                } else {
                    log(`Error masivo: ${result.message}`, false);
                }
            } catch (err) { log('Error de conexión', false); }
            e.target.value = '';
        });
    }

    // 4. Clients
    const clientInput = document.getElementById('bulkClientInput');
    if (clientInput) {
        clientInput.addEventListener('change', async (e) => {
            if (!e.target.files.length) return;
            const rows = await readExcel(e.target.files[0]);
            showNotification('Procesando', `Cargando ${rows.length} clientes...`);
            let count = 0;
            for (const r of rows) {
                if (!r.cedula || !r.nombre) continue;
                try {
                    await fetch('http://localhost:3000/api/clients', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(r)
                    });
                    count++;
                } catch (err) { log(`Error cliente ${r.nombre}`, false); }
            }
            log(`Clientes cargados: ${count} de ${rows.length}`);
            showNotification('Éxito', 'Proceso finalizado');
            e.target.value = '';
        });
    }

    // 5. Users
    const userInput = document.getElementById('bulkUserInput');
    if (userInput) {
        userInput.addEventListener('change', async (e) => {
            if (!e.target.files.length) return;
            const rows = await readExcel(e.target.files[0]);
            showNotification('Procesando', `Cargando ${rows.length} usuarios...`);
            let count = 0;
            for (const r of rows) {
                if (!r.email || !r.password) continue;
                try {
                    await fetch('http://localhost:3000/api/auth/register', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(r)
                    });
                    count++;
                } catch (err) { log(`Error usuario ${r.email}`, false); }
            }
            log(`Usuarios creados: ${count} de ${rows.length}`);
            showNotification('Éxito', 'Proceso finalizado');
            e.target.value = '';
        });
    }

    // 6. Receive Stock (No backend bulk endpoint yet, so loop)
    const receiveInput = document.getElementById('bulkReceiveInput');
    if (receiveInput) {
        receiveInput.addEventListener('change', async (e) => {
            if (!e.target.files.length) return;
            const rows = await readExcel(e.target.files[0]);
            showNotification('Procesando', `Procesando ${rows.length} entradas...`);
            let count = 0;

            // Simple map of code -> id
            let productMap = {};
            try {
                const pRes = await fetch('http://localhost:3000/api/products');
                const allP = await pRes.json();
                allP.forEach(p => productMap[p.codigo] = p.id);
            } catch (e) { log('Error cargando mapa de productos', false); return; }

            for (const r of rows) {
                let pid = r.product_id;
                if (!pid && r.codigo_producto) pid = productMap[r.codigo_producto];

                if (!pid) { log(`Producto no encontrado: ${r.codigo_producto}`, false); continue; }

                try {
                    await fetch('http://localhost:3000/api/products/receive', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            id: pid,
                            cantidad: r.cantidad,
                            nuevo_costo_usd: r.nuevo_costo,
                            nuevo_margen: r.nuevo_margen,
                            proveedor_id: r.proveedor_id,
                            destino: 'venta' // Default to venta for bulk
                        })
                    });
                    count++;
                } catch (err) { log(`Error stock ${r.codigo_producto}: ${err.message}`, false); }
            }
            log(`Stock actualizado: ${count} de ${rows.length}`);
            showNotification('Éxito', 'Carga de stock finalizada');
            e.target.value = '';
        });
    }
}
