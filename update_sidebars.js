const fs = require('fs');
const path = require('path');

const files = [
    'categorias.html', 'clientes.html', 'configuracion.html', 'cuentas.html',
    'inventario.html', 'pdv.html', 'proveedores.html', 'recibir_mercancia.html',
    'reportes.html', 'resumen.html', 'superadmin.html', 'usuarios.html'
];

const regexTargetMain = /(<a href="cuentas\.html" target="content-main" class="nav-item">\s*<i class="fas fa-file-invoice-dollar"><\/i> Cuentas por Pagar\s*<\/a>)/i;
const regexItem = /(<a href="cuentas\.html" class="nav-item( active)?">\s*<i class="fas fa-file-invoice-dollar"><\/i> Cuentas por Pagar\s*<\/a>)/i;

const insertStr1 = `
                <a href="cuentas_cobrar.html" target="content-main" class="nav-item">
                    <i class="fas fa-hand-holding-usd"></i> Cuentas por Cobrar
                </a>`;
                
const insertStr2 = `
                <a href="cuentas_cobrar.html" class="nav-item">
                    <i class="fas fa-hand-holding-usd"></i> Cuentas por Cobrar
                </a>`;

for (const file of files) {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
        let content = fs.readFileSync(filePath, 'utf8');
        
        if (!content.includes('cuentas_cobrar.html')) {
            if (regexTargetMain.test(content)) {
                content = content.replace(regexTargetMain, '$1' + insertStr1);
                fs.writeFileSync(filePath, content);
                console.log(`Updated ${file}`);
            } else if (regexItem.test(content)) {
                content = content.replace(regexItem, '$1' + insertStr2);
                fs.writeFileSync(filePath, content);
                console.log(`Updated ${file}`);
            } else {
                console.log(`Warning: Sidebar link not found in ${file}`);
            }
        } else {
            console.log(`Skipped ${file} (already contains link)`);
        }
    }
}
