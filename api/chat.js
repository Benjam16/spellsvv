// Path: api/chat.js

export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  // 1. CORS Headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers });

  try {
    const { message, prompt } = await req.json();
    const apiKey = process.env.GOOGLE_API_KEY;

    if (!apiKey) {
        return new Response(JSON.stringify({ error: "Server Error: API Key missing." }), { status: 500, headers });
    }

    // 2. Robust System Prompt
    // We add instructions to handle copyright (Generic Clone) and structure.
    const systemContext = `
        You are an expert Web3 Frontend Engineer.
        
        TASK:
        Generate a single-file HTML5 application based on the user's request.
        If the user asks for a copyrighted game (like Tetris, Pacman), generate a "Generic Clone" with distinct visuals but identical mechanics.
        
        OUTPUT FORMAT:
        Return ONLY valid JSON with this structure:
        { 
            "code": "<!DOCTYPE html><html>...</html>", 
            "icon": "<svg>...</svg>" 
        }

        TECHNICAL REQUIREMENTS:
        1. "code":
           - Must be a single HTML file containing CSS (<style>) and JS (<script>).
           - Must use a dark, neon, cyberpunk aesthetic (Black background #050505).
           - Must include Tailwind CSS: <script src="https://cdn.tailwindcss.com"></script>
           - Must include Ethers.js: <script src="https://cdnjs.cloudflare.com/ajax/libs/ethers/5.7.2/ethers.umd.min.js"></script>
           - CRITICAL: Use the standard window.ethereum provider.
           - Game Loop: Use requestAnimationFrame.

        2. "icon":
           - A simple 100x100 SVG string representing the app.

        USER REQUEST: ${message}
        SPECIFIC DETAILS: ${prompt}
    `;

    // 3. Use the Stable V1 Endpoint
    // We use the standard 1.5 Flash model which is the most reliable for code generation.
    const model = "gemini-1.5-flash"; 
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: systemContext }] }],
            generationConfig: { maxOutputTokens: 8192, temperature: 0.7 }
        })
    });

    if (!response.ok) {
        const txt = await response.text();
        return new Response(JSON.stringify({ 
            error: "Google API Error", 
            details: `Status ${response.status}: ${txt}` 
        }), { status: 500, headers });
    }

    const data = await response.json();
    let rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    
    // 4. THE CLEANING LOGIC (The Fix for "Generation Failed")
    // Remove Markdown wrappers
    rawText = rawText.replace(/^```json\s*/, "")
                     .replace(/^```html\s*/, "")
                     .replace(/^```\s*/, "")
                     .replace(/```$/, "")
                     .trim();

    let jsonResult = null;

    try {
        // Attempt Standard Parsing
        jsonResult = JSON.parse(rawText);
    } catch (e) {
        console.warn("JSON Parse Failed. Attempting Manual Extraction...");
        
        // --- SAFETY NET ---
        // If JSON fails (common with Tetris/Games due to backslashes), we manually extract the HTML.
        const htmlStart = rawText.indexOf("<!DOCTYPE html");
        const htmlEnd = rawText.lastIndexOf("</html>");
        
        if (htmlStart !== -1 && htmlEnd !== -1) {
            const extractedHtml = rawText.substring(htmlStart, htmlEnd + 7);
            
            jsonResult = {
                code: extractedHtml,
                // Default icon if parsing failed
                icon: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="#6366f1"/><text x="50" y="55" font-size="50" text-anchor="middle" fill="white" dy=".3em">💠</text></svg>'
            };
        } else {
            return new Response(JSON.stringify({ 
                error: "Parsing Error", 
                details: "AI generated invalid output and code could not be recovered.",
                debug: rawText.substring(0, 100)
            }), { status: 500, headers });
        }
    }

    // 5. Success
    return new Response(JSON.stringify({ reply: jsonResult, model: model }), { status: 200, headers });

  } catch (error) {
    return new Response(JSON.stringify({ error: `Server Error: ${error.message}` }), { status: 500, headers });
  }
}
