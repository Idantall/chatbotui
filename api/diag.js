export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.OPENAI_API_KEY || process.env['OPENAI_API_KEY'] || process.env.openai_api_key;
  
  res.json({
    node: process.version,
    hasKey: !!apiKey,
    keyLength: apiKey?.length || 0,
    assistantId: process.env.ASSISTANT_ID || 'asst_YwWtBI8O0YtanpYBstRDQxNN',
    environment: process.env.NODE_ENV || 'unknown',
    allEnvKeys: Object.keys(process.env).length,
    openaiKeys: Object.keys(process.env).filter(key => 
      key.toLowerCase().includes('openai') || 
      key.toLowerCase().includes('key')
    ),
    platform: process.platform,
    timestamp: new Date().toISOString()
  });
}