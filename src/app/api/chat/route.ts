import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/chat — proxy to OpenAI / Anthropic chat completion. Reads
 * the API key from server env (OPENAI_API_KEY or ANTHROPIC_API_KEY)
 * so it isn't exposed to the browser.
 *
 * Body: { messages: Array<{role, content}>, system?: string }
 *
 * Returns: { reply: string }
 *
 * Falls back to 503 with a clear error when no key is configured —
 * the StrategyChat component then keeps using its deterministic
 * intent recognizer.
 */

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export async function POST(request: NextRequest) {
  let body: { messages?: ChatMessage[]; system?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const messages = body.messages ?? [];
  if (messages.length === 0) {
    return NextResponse.json({ error: 'messages required' }, { status: 400 });
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!openaiKey && !anthropicKey) {
    return NextResponse.json(
      {
        error:
          'No LLM API key configured on server. Set OPENAI_API_KEY or ANTHROPIC_API_KEY in .env to enable real chat.',
      },
      { status: 503 }
    );
  }

  // Prefer Anthropic if both set; OpenAI as fallback
  if (anthropicKey) {
    return callAnthropic(messages, body.system, anthropicKey);
  }
  return callOpenAI(messages, body.system, openaiKey!);
}

async function callAnthropic(
  messages: ChatMessage[],
  systemPrompt: string | undefined,
  key: string
) {
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1024,
        system: systemPrompt ?? defaultSystemPrompt(),
        messages: messages
          .filter((m) => m.role !== 'system')
          .map((m) => ({ role: m.role, content: m.content })),
      }),
    });
    if (!r.ok) {
      const text = await r.text();
      return NextResponse.json(
        { error: `Anthropic ${r.status}: ${text.slice(0, 200)}` },
        { status: 502 }
      );
    }
    const data = await r.json();
    const reply = data.content?.[0]?.text ?? '';
    return NextResponse.json({ reply, provider: 'anthropic' });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Anthropic call failed' },
      { status: 502 }
    );
  }
}

async function callOpenAI(
  messages: ChatMessage[],
  systemPrompt: string | undefined,
  key: string
) {
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
        max_tokens: 1024,
        messages: [
          { role: 'system', content: systemPrompt ?? defaultSystemPrompt() },
          ...messages,
        ],
      }),
    });
    if (!r.ok) {
      const text = await r.text();
      return NextResponse.json(
        { error: `OpenAI ${r.status}: ${text.slice(0, 200)}` },
        { status: 502 }
      );
    }
    const data = await r.json();
    const reply = data.choices?.[0]?.message?.content ?? '';
    return NextResponse.json({ reply, provider: 'openai' });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'OpenAI call failed' },
      { status: 502 }
    );
  }
}

function defaultSystemPrompt(): string {
  return `You are a trading-strategy assistant embedded in an ETF trading dashboard. Help the user reason about their RSI/options scalping strategies, paper trade history, and risk. Be concise (3 sentences max unless asked otherwise). Don't give specific trade recommendations or financial advice; the user makes their own decisions. When discussing strategies, reference the user's actual data when provided in messages.`;
}
