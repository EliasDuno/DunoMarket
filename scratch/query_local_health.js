async function check() {
    try {
        console.log("Fetching health from http://localhost:3000/api/health...");
        const res = await fetch("http://localhost:3000/api/health");
        console.log("Status:", res.status);
        const data = await res.json();
        console.log("Data:", data);
    } catch (err) {
        console.error("Failed to fetch:", err.message);
    }
}
check();
