const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const dotenv = require('dotenv');

// Load environment from root .env.local
dotenv.config({ path: path.join(__dirname, '..', '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    console.log("Querying tenants table via Supabase Client...");
    const { data, error } = await supabase.from('tenants').select('*');
    if (error) {
        console.error("Error:", error.message);
    } else {
        console.log("Success! Tenants:");
        console.log(data);
    }
}

check().catch(console.error);
