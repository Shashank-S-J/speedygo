'use client';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { adminService } from '@speedygo/api-client';

interface Message { role: 'user' | 'assistant'; content: string }

export default function AIQueryPage() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hello! I can help you query platform data. Try: "Show me the top 5 transporters by earnings this month" or "How many users were suspended last week?"' }
  ]);
  const [input, setInput] = useState('');

  const queryMut = useMutation({
    mutationFn: (query: string) => adminService.aiQuery({ query }),
    onSuccess: (data) => {
      setMessages((prev) => [...prev, { role: 'assistant', content: typeof data.result === 'string' ? data.result : JSON.stringify(data, null, 2) }]);
    },
    onError: () => setMessages((prev) => [...prev, { role: 'assistant', content: 'Sorry, I could not process that query. Please try again.' }]),
  });

  const send = () => {
    if (!input.trim() || queryMut.isPending) return;
    const q = input.trim();
    setMessages((prev) => [...prev, { role: 'user', content: q }]);
    setInput('');
    queryMut.mutate(q);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] animate-blur-fade-up">
      <header className="mb-4">
        <h1 className="text-headline-lg font-bold text-white">AI Admin Query</h1>
        <p className="text-on-surface-variant">Natural language queries on platform data</p>
      </header>

      <div className="flex-1 glass-panel rounded-xl flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-tertiary flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="material-symbols-outlined text-background text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>smart_toy</span>
                </div>
              )}
              <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-gradient-to-b from-primary-container to-inverse-primary text-white rounded-br-sm shadow-[0_2px_8px_rgba(0,90,194,0.3)]'
                  : 'glass-card text-on-surface rounded-bl-sm'
              }`}>
                {msg.content}
              </div>
              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="material-symbols-outlined text-primary text-[16px]">person</span>
                </div>
              )}
            </div>
          ))}
          {queryMut.isPending && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-tertiary flex items-center justify-center">
                <span className="material-symbols-outlined text-background text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>smart_toy</span>
              </div>
              <div className="glass-card px-4 py-3 rounded-2xl rounded-bl-sm">
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="w-2 h-2 bg-tertiary rounded-full animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-white/10 p-4 flex gap-3">
          <input value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
            placeholder="Ask anything about platform data…"
            className="flex-1 glass-input rounded-xl px-4 py-2.5 text-sm text-on-surface placeholder:text-outline" />
          <button onClick={send} disabled={!input.trim() || queryMut.isPending}
            className="btn-3d disabled:opacity-40 text-white p-2.5 rounded-xl">
            <span className="material-symbols-outlined text-[18px]">send</span>
          </button>
        </div>
      </div>
    </div>
  );
}
