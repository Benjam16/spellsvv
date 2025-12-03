export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const { message, prompt } = req.body;
        const apiKey = process.env.GOOGLE_API_KEY;

        // Auto-Discover Model
        const listReq = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const listData = await listReq.json();
        const validModel = listData.models?.find(m => m.name.includes("gemini") && m.supportedGenerationMethods.includes("generateContent"));
        const modelName = validModel ? validModel.name : "models/gemini-1.5-flash";

        // UPDATED PROMPT: Ask for "category"
        const systemContext = `
            You are an Expert Web3 App Generator. Return a JSON Object.
            Format: { "code": "...", "icon": "...", "category": "..." }

            1. "code": HTML5 file, CSS/JS embedded.
               - MUST have a 'START' button overlay (zIndex: 9999) that hides itself and starts logic.
               - Inject <script src="https://cdn.ethers.io/lib/ethers-5.2.umd.min.js"></script>.
               - Use 'window.ethereum' if needed.
               - Dark/Neon style.
            
            2. "icon": A raw <svg viewBox='0 0 100 100'> string. Pixel art style.
            
            3. "category": Choose EXACTLY ONE: "Game", "DeFi", "Tool", "Art", "Social".
        `;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: `SYSTEM: ${systemContext}\n\nUSER REQUEST: ${message} \n\n DETAILS: ${prompt}` }] }]
            })
        });

        const data = await response.json();
        let rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
        rawText = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
        
        return res.status(200).json({ reply: JSON.parse(rawText) });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
