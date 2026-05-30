
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
    // DESACTIVADO: La lógica de bulk uploads se trasladó a sistema.js (setupBulkUpload).
    // Esta función se vacía para evitar event listeners duplicados que provocan que la carga masiva
    // se ejecute dos veces o se quede colgada.
}
