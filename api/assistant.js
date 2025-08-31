import OpenAI from 'openai';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const id = process.env.ASSISTANT_ID || 'asst_YwWtBI8O0YtanpYBstRDQxNN';
    const a = await openai.beta.assistants.retrieve(id);
    res.json({ id: a.id, model: a.model, name: a.name || null });
  } catch (err) {
    console.error('[assistant retrieve]', err);
    res.status(err.status || 500).json({ error: err.message, code: err.code, type: err.type });
  }
}