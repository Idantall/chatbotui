import OpenAI from 'openai';

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

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('Chat API called - Method:', req.method);
    console.log('All environment variables:', Object.keys(process.env));
    console.log('Environment check - Has OpenAI key:', !!process.env.OPENAI_API_KEY);
    console.log('OpenAI key length:', process.env.OPENAI_API_KEY?.length || 0);
    
    // Multiple ways to access the API key (Vercel sometimes has different access patterns)
    const apiKey = process.env.OPENAI_API_KEY || process.env['OPENAI_API_KEY'] || process.env.openai_api_key;
    
    console.log('Final API key check:', !!apiKey);
    
    // Ensure OpenAI API key exists
    if (!apiKey) {
      console.log('Error: OpenAI API key not configured');
      console.log('Available env vars:', Object.keys(process.env).filter(key => key.includes('OPENAI') || key.includes('openai')));
      return res.status(500).json({ 
        error: 'OpenAI API key not configured',
        hint: 'Please set OPENAI_API_KEY in Vercel environment variables'
      });
    }

    console.log('Initializing OpenAI client...');
    const openai = new OpenAI({
      apiKey: apiKey
    });

    const ASSISTANT_ID = process.env.ASSISTANT_ID || 'asst_YwWtBI8O0YtanpYBstRDQxNN';
    console.log('Using Assistant ID:', ASSISTANT_ID);
    
    // Parse request body properly for Vercel
    console.log('Raw request body:', req.body);
    console.log('Request body type:', typeof req.body);
    
    let body;
    try {
      if (typeof req.body === 'string') {
        body = JSON.parse(req.body);
      } else {
        body = req.body || {};
      }
    } catch (parseError) {
      console.log('JSON parse error:', parseError);
      return res.status(400).json({ error: 'Invalid JSON in request body' });
    }
    
    console.log('Parsed body:', body);
    
    const userText = (body.user ?? '').toString().trim();
    let threadId = (body.threadId ?? '').toString().trim() || null;
    
    console.log('User text:', userText);
    console.log('Thread ID from request:', threadId);
    
    if (!userText) {
      return res.status(400).json({ error: 'Empty message' });
    }

    // 1) Create new thread for first message, or append to existing
    if (!threadId) {
      console.log('Creating new thread...');
      const thread = await openai.beta.threads.create({
        messages: [{ role: 'user', content: userText }]
      });
      threadId = thread.id;
      console.log('New thread created:', threadId);
    } else {
      console.log('Adding message to existing thread:', threadId);
      await openai.beta.threads.messages.create(threadId, {
        role: 'user',
        content: userText
      });
    }

    // 2) Run the Assistant; add a tiny guardrail for follow-ups
    const isFollowUp = !!body.threadId;
    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: ASSISTANT_ID,
      ...(isFollowUp && {
        instructions:
          'זו פנייה המשכית באותו הסשן; אל תחזרי על נוסח הפתיחה או שאלת המגדר—המשיכי לנקודת העבודה הבאה.'
      })
    });

    // 3) Poll for completion
    let status = run.status;
    let tries = 0;
    while (status === 'queued' || status === 'in_progress') {
      await new Promise(r => setTimeout(r, 500));
      const updated = await openai.beta.threads.runs.retrieve(threadId, run.id);
      status = updated.status;
      if (++tries > 120) break; // ~60s cap
    }

    if (status === 'requires_action') {
      return res.json({
        threadId,
        text: 'Assistant requested tool calls; this minimal server does not handle tool outputs.'
      });
    }

    if (status !== 'completed') {
      return res.status(500).json({ error: `Run ended with status: ${status}`, threadId });
    }

    // 4) Return the last assistant message + the threadId
    const msgs = await openai.beta.threads.messages.list(threadId, { limit: 50 });
    const assistantMsg = msgs.data.find(m => m.role === 'assistant');

    let text = '(no reply)';
    if (assistantMsg?.content?.length) {
      text = assistantMsg.content
        .filter(p => p.type === 'text' && p.text?.value)
        .map(p => p.text.value)
        .join('\n\n')
        .trim() || text;
    }

    res.json({ text, threadId });
  } catch (err) {
    console.error('Full error object:', err);
    console.error('Error name:', err?.name);
    console.error('Error message:', err?.message);
    console.error('Error stack:', err?.stack);
    
    // Better error surfacing
    try {
      // New SDK errors
      if (err.status || err.code || err.type) {
        console.error('[OpenAI APIError]', {
          status: err.status, code: err.code, type: err.type, message: err.message
        });
        return res.status(err.status || 500).json({
          error: err.message || 'OpenAI API error',
          code: err.code, 
          type: err.type
        });
      }
      
      // Generic errors
      console.error('[Generic error]', err);
      const errorMessage = err?.message || err?.toString() || 'Unknown error occurred';
      return res.status(500).json({ 
        error: errorMessage,
        details: 'Check server logs for more information'
      });
    } catch (e) {
      console.error('[Error handling error]', e);
      console.error('[Original error]', err);
      return res.status(500).json({ 
        error: 'Critical server error',
        message: 'Unable to process request'
      });
    }
  }
}