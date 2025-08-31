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

  // Chat endpoint - fresh thread per message, no memory
  app.post('/api/chat', async (req, res) => {
    try {
      const userText = (req.body?.user ?? '').toString().trim();
      if (!userText) {
        return res.status(400).json({ error: 'Empty message' });
      }

      // 1) Create a fresh thread
      const thread = await openai.beta.threads.create({
        messages: [{ role: 'user', content: userText }]
      });
      // 2) Run it
      const run = await openai.beta.threads.runs.create(thread.id, {
        assistant_id: ASSISTANT_ID
      });

      // 3) Poll for completion (simple boilerplate)
      let status = run.status;
      let tries = 0;
      while (status === 'queued' || status === 'in_progress') {
        await new Promise(r => setTimeout(r, 500));
        const updated = await openai.beta.threads.runs.retrieve(run.id, { 
          thread_id: thread.id 
        });
        status = updated.status;
        if (++tries > 120) break; // ~60s cap
      }

      if (status === 'requires_action') {
        return res.json({
          text: 'This Assistant requested tool calls. This minimal demo does not handle tool outputs.\n\nTip: disable custom tools on the Assistant or extend the server to submit tool outputs.'
        });
      }

      if (status !== 'completed') {
        return res.status(500).json({ error: `Run ended with status: ${status}` });
      }

      // 4) Get the assistant reply
      const msgs = await openai.beta.threads.messages.list(thread.id, { limit: 20 });
      const assistantMsg = msgs.data.find(m => m.role === 'assistant');

      let text = '(no reply)';
      if (assistantMsg?.content?.length) {
        text = assistantMsg.content
          .filter(p => p.type === 'text' && p.text?.value)
          .map(p => p.text.value)
          .join('\n\n')
          .trim() || text;
      }

      res.json({ text });
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
