import type { Express } from "express";
import { createServer, type Server } from "http";
import OpenAI from 'openai';

export async function registerRoutes(app: Express): Promise<Server> {
  // Initialize OpenAI with API key from environment
  const openai = new OpenAI({ 
    apiKey: process.env.OPENAI_API_KEY || process.env.API_KEY || "default_key"
  });

  // Use your Assistant ID (override with ASSISTANT_ID secret if you want)
  const ASSISTANT_ID = process.env.ASSISTANT_ID || 'asst_YwWtBI8O0YtanpYBstRDQxNN';

  // Quick env/version sanity check
  app.get('/api/diag', async (req, res) => {
    res.json({
      node: process.version,
      hasKey: !!process.env.OPENAI_API_KEY,
      assistantId: process.env.ASSISTANT_ID || 'asst_YwWtBI8O0YtanpYBstRDQxNN'
    });
  });

  // Verify the Assistant is reachable with THIS key/org
  app.get('/api/assistant', async (req, res) => {
    try {
      const id = process.env.ASSISTANT_ID || 'asst_YwWtBI8O0YtanpYBstRDQxNN';
      const a = await openai.beta.assistants.retrieve(id);
      res.json({ id: a.id, model: a.model, name: a.name || null });
    } catch (err: any) {
      console.error('[assistant retrieve]', err);
      res.status(err.status || 500).json({ error: err.message, code: err.code, type: err.type });
    }
  });

  // Chat endpoint - with threadId memory support  
  app.post('/api/chat', async (req, res) => {
    try {
      const userText = (req.body?.user ?? '').toString().trim();
      let threadId = (req.body?.threadId ?? '').toString().trim() || null;
      
      console.log('Express API - User text:', userText);
      console.log('Express API - Thread ID from request:', threadId);
      
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
      const isFollowUp = !!req.body?.threadId;
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
        const updated = await openai.beta.threads.runs.retrieve(run.id, { 
          thread_id: threadId 
        });
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
          .filter((p: any) => p.type === 'text' && p.text?.value)
          .map((p: any) => p.text.value)
          .join('\n\n')
          .trim() || text;
      }

      console.log('Express API - Returning response - text length:', text.length, 'threadId:', threadId);
      res.json({ text, threadId });
    } catch (err: any) {
      // Better error surfacing
      try {
        // New SDK errors
        if (err.status || err.code || err.type) {
          console.error('[OpenAI APIError]', {
            status: err.status, code: err.code, type: err.type, message: err.message
          });
          return res.status(err.status || 500).json({
            error: err.message || 'OpenAI API error',
            code: err.code, type: err.type
          });
        }
        // Generic fetch/undici errors
        console.error('[OpenAI error raw]', err);
        return res.status(500).json({ error: String(err?.message || err) });
      } catch (e) {
        console.error('[Error handling error]', e, err);
        return res.status(500).json({ error: 'Unknown server error' });
      }
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
