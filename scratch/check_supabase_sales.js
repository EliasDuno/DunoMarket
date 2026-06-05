const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment from root .env.local
dotenv.config({ path: path.join(__dirname, '..', '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing credentials in .env.local");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSales() {
    console.log("Connecting to Supabase REST API with Anon Key...");
    
    // 1. Check if we can query 'ventas'
    console.log("\n--- Querying 'ventas' table ---");
    const { data: ventas, error: errVentas } = await supabase
        .from('ventas')
        .select('*')
        .limit(10);
        
    if (errVentas) {
        console.error("Error fetching ventas:", errVentas.message);
    } else {
        console.log(`Success! Found ${ventas.length} rows:`);
        console.log(JSON.stringify(ventas, null, 2));
    }

    // 2. Check if we can query 'detalle_ventas'
    console.log("\n--- Querying 'detalle_ventas' table ---");
    const { data: detalles, error: errDetalles } = await supabase
        .from('detalle_ventas')
        .select('*')
        .limit(10);
        
    if (errDetalles) {
        console.error("Error fetching detalle_ventas:", errDetalles.message);
    } else {
        console.log(`Success! Found ${detalles.length} rows:`);
        console.log(JSON.stringify(detalles, null, 2));
    }
}

checkSales().catch(console.error);
