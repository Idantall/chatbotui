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

  app.get('/api/diag', (req, res) => {
    res.json({
      ok: true,
      node: process.version,
      hasKey: !!process.env.OPENAI_API_KEY,
      assistantId: process.env.ASSISTANT_ID || 'asst_YwWtBI8O0YtanpYBstRDQxNN',
      build: 'patch-threadid-v1'
    });
  });

  app.post('/api/echo', (req, res) => {
    res.json({ received: req.body ?? null, echoedAt: new Date().toISOString() });
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

  app.post('/api/chat', async (req, res) => {
    try {
      const userTextRaw = req.body?.user;
      const priorThreadId = req.body?.threadId ?? null;

      const userText = (userTextRaw ?? '').toString().trim();
      let threadId = (priorThreadId === null || priorThreadId === undefined || priorThreadId === '')
        ? null
        : String(priorThreadId);

      if (!userText) {
        return res.status(400).json({ error: 'Empty message', threadId: null });
      }

      // 1) Create or reuse thread
      if (!threadId) {
        const thread = await openai.beta.threads.create({
          messages: [{ role: 'user', content: userText }]
        });
        threadId = thread.id;
      } else {
        await openai.beta.threads.messages.create(threadId, {
          role: 'user',
          content: userText
        });
      }

      // 2) Run assistant (nudge to avoid repeating greeting on follow-ups)
      const isFollowUp = Boolean(priorThreadId);
      const run = await openai.beta.threads.runs.create(threadId, {
        assistant_id: process.env.ASSISTANT_ID || 'asst_YwWtBI8O0YtanpYBstRDQxNN',
        ...(isFollowUp && {
          instructions:
            'זו פנייה המשכית באותו הסשן; אל תחזרי על נוסח הפתיחה או שאלת המגדר—המשיכי מהמקום שעצרנו.'
        })
      });

      // 3) Poll
      let status = run.status, tries = 0;
      while (status === 'queued' || status === 'in_progress') {
        await new Promise(r => setTimeout(r, 500));
        const updated = await openai.beta.threads.runs.retrieve(threadId, run.id);
        status = updated.status;
        if (++tries > 120) break; // ~60s cap
      }

      if (status === 'requires_action') {
        return res.json({
          text: 'Assistant requested tool calls (not handled in this demo).',
          threadId
        });
      }
      if (status !== 'completed') {
        return res.status(500).json({
          error: `Run ended with status: ${status}`,
          threadId
        });
      }

      // 4) Read last assistant message
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

      // Always return threadId
      res.json({ text, threadId, _debug: { isFollowUp } });
    } catch (err: any) {
      console.error('[OpenAI error]', err);
      res.status(err.status || 500).json({
        error: err.message || 'OpenAI error',
        code: err.code,
        type: err.type,
        threadId: null
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
