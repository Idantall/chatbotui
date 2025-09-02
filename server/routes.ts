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

  app.post('/api/thread', async (req, res) => {
    try {
      const thread = await openai.beta.threads.create(); // no messages yet
      return res.json({ threadId: thread.id });         // e.g. "thread_abc..."
    } catch (err: any) {
      console.error('[thread.create]', err);
      return res.status(err.status || 500).json({ error: err.message || 'thread create failed' });
    }
  });

  app.get('/api/assistant', async (req, res) => {
    try {
      const id = process.env.ASSISTANT_ID || 'asst_YwWtBI8O0YtanpYBstRDQxNN';
      const a = await openai.beta.assistants.retrieve(id);
      res.json({ id: a.id, name: a.name, model: a.model, instructionsPreview: a.instructions?.slice(0, 160) });
    } catch (e: any) {
      res.status(e.status || 500).json({ error: e.message });
    }
  });

  app.post('/api/chat', async (req, res) => {
    try {
      const userText = (req.body?.user ?? '').toString().trim();
      const threadId = (req.body?.threadId ?? '').toString().trim();
      if (!userText) return res.status(400).json({ error: 'Empty message' });
      if (!threadId) return res.status(400).json({ error: 'Missing threadId' });

      // 1) append user message
      await openai.beta.threads.messages.create(threadId, {
        role: 'user',
        content: userText
      });

      // 2) run assistant (⚠️ do NOT pass `instructions`, it overrides persona)
      const run = await openai.beta.threads.runs.createAndPoll(threadId, {
        assistant_id: process.env.ASSISTANT_ID || 'asst_YwWtBI8O0YtanpYBstRDQxNN',
        // optional, safe nudge that APPENDS instead of overriding:
        additional_instructions:
          'זו פנייה המשכית באותו הסשן; אל תחזרי על נוסח הפתיחה או שאלת המגדר—המשיכי מנקודת העבודה הבאה.'
      });

      if (run.status === 'requires_action') {
        return res.json({
          text: 'Assistant requested tool calls; this minimal server does not handle tool outputs.',
          threadId
        });
      }
      if (run.status !== 'completed') {
        return res.status(500).json({ error: `Run status: ${run.status}`, threadId });
      }

      // 3) fetch last assistant message
      const msgs = await openai.beta.threads.messages.list(threadId, { limit: 50 });
      const assistantMsg = msgs.data.find((m: any) => m.role === 'assistant');

      let text = '(no reply)';
      if (assistantMsg?.content?.length) {
        text = assistantMsg.content
          .filter((p: any) => p.type === 'text' && p.text?.value)
          .map((p: any) => p.text.value)
          .join('\n\n')
          .trim() || text;
      }

      return res.json({ text, threadId });
    } catch (err: any) {
      console.error('[api/chat]', err);
      return res.status(err.status || 500).json({
        error: err.message || 'OpenAI error',
        code: err.code,
        type: err.type
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
