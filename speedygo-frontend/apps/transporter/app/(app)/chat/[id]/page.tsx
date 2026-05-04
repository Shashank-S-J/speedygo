'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { chatService } from '@speedygo/api-client';
import { ChatClient } from '@speedygo/ws-client';
import { useAuthStore } from '@/store/authStore';
import { ChatMessage } from '@speedygo/types';

export default function TransporterChatPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuthStore();
  const bookingId = Number(params.id);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [connected, setConnected] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<ChatClient | null>(null);

  useEffect(() => {
    chatService.getHistory(bookingId, { limit: 50 }).then((items) => setMessages(items.reverse())).catch(() => {});
    const client = new ChatClient(bookingId);
    clientRef.current = client;
    const unsubStatus = client.onStatus(setConnected);
    const unsubMessage = client.onMessage((msg) => {
      setMessages((prev) => prev.some((m) => m.id === msg.id || m.client_uuid === msg.client_uuid) ? prev : [...prev, msg]);
    });
    client.connect();
    return () => { unsubStatus(); unsubMessage(); client.disconnect(); };
  }, [bookingId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = () => {
    if (!input.trim() || !clientRef.current) return;
    clientRef.current.sendText(input.trim());
    setInput('');
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => router.back()} className="text-outline hover:text-on-surface transition">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h2 className="text-lg font-bold text-on-surface">Chat — Booking #{bookingId}</h2>
        <div className="ml-auto text-xs flex items-center gap-1.5">
          {connected ? (
            <><span className="w-2 h-2 rounded-full bg-tertiary animate-glow-pulse" /><span className="text-tertiary">Live</span></>
          ) : (
            <><span className="w-2 h-2 rounded-full bg-outline" /><span className="text-outline">Offline</span></>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 px-1 py-2">
        {messages.map((msg) => {
          const mine = msg.sender_id === user?.id;
          return (
            <div key={msg.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[72%] px-4 py-2.5 rounded-2xl text-sm ${
                mine
                  ? 'bg-gradient-to-b from-primary-container to-inverse-primary text-white rounded-br-sm shadow-[0_2px_8px_rgba(0,90,194,0.3)]'
                  : 'glass-card text-on-surface rounded-bl-sm'
              }`}>
                {msg.content}
                <div className={`text-[10px] mt-0.5 ${mine ? 'text-white/60' : 'text-outline'}`}>
                  {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2 pt-3 border-t border-white/10">
        <input value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder="Type a message…"
          className="flex-1 glass-input rounded-xl px-4 py-2.5 text-sm text-on-surface placeholder:text-outline" />
        <button onClick={send} disabled={!input.trim() || !connected}
          className="btn-3d disabled:opacity-40 text-white p-2.5 rounded-xl transition">
          <span className="material-symbols-outlined text-[18px]">send</span>
        </button>
      </div>
    </div>
  );
}
