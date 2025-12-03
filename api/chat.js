export const config = { runtime: 'edge' };

export default async function handler(req) {
  // CORS Headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') return new Response(null, { headers });

  try {
    const { message, prompt } = await req.json();
    const apiKey = process.env.GOOGLE_API_KEY;

    if (!apiKey) return new Response(JSON.stringify({ error: "Server Configuration Error: API Key Missing" }), { status: 500, headers });

    // 1. Force the Fast Model
    const model = "gemini-1.5-flash"; 
    
    // 2. Simple, Direct Prompt
    const systemPrompt = `
      You are a Web3 App Generator.
      TASK: Return strictly valid JSON.
      FORMAT: { "code": "HTML_STRING", "icon": "SVG_STRING" }
      REQUIREMENTS: Single HTML file, dark mode, Tailwind CSS, Ethers.js.
      IMPORTANT: If generating a game, ensure the game loop starts automatically or via click.
      USER REQUEST: ${message} ${prompt}
    `;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: systemPrompt }] }],
            generationConfig: { maxOutputTokens: 4000, temperature: 0.7 }
        })
    });

    if (!response.ok) {
        const txt = await response.text();
        return new Response(JSON.stringify({ error: `Google API Error (${response.status})`, details: txt }), { status: 500, headers });
    }

    const data = await response.json();
    let rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // 3. Bruteforce Cleaning
    rawText = rawText.replace(/```json/g, "").replace(/```html/g, "").replace(/```/g, "").trim();

    let jsonResult;
    try {
        jsonResult = JSON.parse(rawText);
    } catch (e) {
        // Fallback: If JSON fails, assume the whole text is code if it looks like HTML
        if(rawText.includes("<html")) {
            jsonResult = { code: rawText, icon: "" };
        } else {
            return new Response(JSON.stringify({ error: "AI Parsing Failed", details: rawText.substring(0, 200) }), { status: 500, headers });
        }
    }

    return new Response(JSON.stringify({ reply: jsonResult }), { status: 200, headers });

  } catch (error) {
    return new Response(JSON.stringify({ error: "Internal Server Error", details: error.message }), { status: 500, headers });
  }
}
