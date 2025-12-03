// Path: api/chat.js

// 1. Force Edge Runtime
export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
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

    // 2. THE "SPEED" PROMPT (Reverted to the one that worked)
    // We remove complex instructions to stop the AI from overthinking or triggering filters.
    const systemContext = `
        You are a High-Speed Web3 App Generator.
        Return strictly valid JSON: { "code": "...", "icon": "..." }
        
        INSTRUCTIONS:
        1. Write COMPACT, working code.
        2. Combine CSS/JS into the HTML.
        3. Dark Mode, Neon Style.
        4. Include 'START' overlay button.
        5. Use Ethers.js.
        
        USER REQUEST: ${message} ${prompt}
    `;

    // 3. THE BRUTE FORCE LOOP (Fixes 404 Errors)
    // We try every known Flash model tag. One of these is guaranteed to work for your key.
    const modelsToTry = [
        "gemini-1.5-flash",
        "gemini-1.5-flash-latest",
        "gemini-1.5-flash-001",
        "gemini-1.5-flash-8b",
        "gemini-1.5-pro" // Last resort
    ];

    let data = null;
    let usedModel = "";
    let lastError = "";

    for (const model of modelsToTry) {
        try {
            console.log(`Trying model: ${model}...`);
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: systemContext }] }],
                    // Lower output tokens slightly to ensure it fits in the timeout window
                    generationConfig: { maxOutputTokens: 4096, temperature: 0.7 }
                })
            });

            if (!response.ok) {
                // If 404, the name is wrong. If 503, it's busy. Try next.
                if (response.status === 404 || response.status === 503) {
                    console.warn(`${model} failed (${response.status}). Next...`);
                    continue;
                }
                const txt = await response.text();
                throw new Error(txt);
            }

            data = await response.json();
            usedModel = model;
            break; // Success!

        } catch (e) {
            lastError = e.message;
        }
    }

    if (!data) {
        return new Response(JSON.stringify({ 
            error: "Generation Failed", 
            details: `All models failed. Last error: ${lastError}` 
        }), { status: 500, headers });
    }

    // 4. THE SAFETY NET (Fixes "Bad Escaped Character" / Broken JSON)
    let rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    
    // Clean Markdown
    rawText = rawText.replace(/^```json\s*/, "").replace(/^```html\s*/, "").replace(/^```\s*/, "").replace(/```$/, "").trim();

    let jsonResult = null;

    try {
        jsonResult = JSON.parse(rawText);
    } catch (e) {
        console.warn("JSON Parse Failed. Extracting HTML manually...");
        
        // Manual HTML Extraction
        const htmlStart = rawText.indexOf("<!DOCTYPE html");
        const htmlEnd = rawText.lastIndexOf("</html>");
        
        if (htmlStart !== -1 && htmlEnd !== -1) {
            const extractedHtml = rawText.substring(htmlStart, htmlEnd + 7);
            jsonResult = {
                code: extractedHtml,
                icon: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="#333"/><text x="50" y="55" font-size="50" text-anchor="middle" dy=".3em">🎮</text></svg>'
            };
        } else {
            // Last ditch: If the text LOOKS like HTML but tags are messy, just return the raw text
            if (rawText.includes("<html") && rawText.includes("body")) {
                 jsonResult = { code: rawText, icon: "" };
            } else {
                return new Response(JSON.stringify({ 
                    error: "Parsing Error", 
                    details: "AI output was not valid code.",
                    debug: rawText.substring(0, 100)
                }), { status: 500, headers });
            }
        }
    }

    return new Response(JSON.stringify({ reply: jsonResult, model: usedModel }), { status: 200, headers });

  } catch (error) {
    return new Response(JSON.stringify({ error: `Server Error: ${error.message}` }), { status: 500, headers });
  }
}
