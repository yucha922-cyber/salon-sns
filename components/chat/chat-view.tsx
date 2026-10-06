"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import type { ChatMessage } from "@/lib/domain/types";
import { sendChatMessageAction } from "@/app/actions/ai";
import { useToast } from "@/components/ui/toast";

export function ChatView({
  conversationId: initialId,
  initialMessages,
  brandName,
  locationName,
  userInitials,
  prompts,
  greeting,
}: {
  conversationId: string | null;
  initialMessages: ChatMessage[];
  brandName: string;
  locationName: string;
  userInitials: string;
  prompts: { label: string; prompt: string }[];
  greeting: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [conversationId, setConversationId] = useState(initialId);
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [provider, setProvider] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const historyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    historyRef.current?.scrollTo({ top: historyRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  const send = (text: string) => {
    const content = text.trim();
    if (!content || pending) return;
    const optimistic: ChatMessage = { id: `tmp-${Date.now()}`, role: "user", content, createdAt: new Date().toISOString() };
    setMessages((m) => [...m, optimistic]);
    setInput("");
    startTransition(async () => {
      const result = await sendChatMessageAction({ conversationId, content });
      if (!result.ok) {
        setMessages((m) => m.filter((x) => x.id !== optimistic.id));
        setInput(content);
        toast(result.error, "error");
        return;
      }
      setMessages((m) => [...m.filter((x) => x.id !== optimistic.id), result.data.userMessage, result.data.reply]);
      setProvider(result.data.provider);
      if (result.data.conversationId !== conversationId) {
        setConversationId(result.data.conversationId);
        router.replace(`/chat?c=${result.data.conversationId}`, { scroll: false });
      }
    });
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    send(input);
  };

  return (
    <div className="chat-main">
      <div className="chat-header">
        <div className="ai-avatar">✳</div>
        <div>
          <b>{brandName} 専属AIマーケター</b>
          <small>
            <span className="online-dot" style={{ display: "inline-block", margin: "0 4px 0 0" }} /> {locationName}のBrand Brainを参照中
          </small>
        </div>
        <Link className="button small" href="/chat?new=1" style={{ marginLeft: "auto" }}>＋ 新しい相談</Link>
      </div>
      <div className="chat-history" ref={historyRef}>
        <div className="message">
          <div className="message-avatar">✳</div>
          <div className="bubble">{greeting}</div>
        </div>
        {messages.map((m) => (
          <div key={m.id} className={`message ${m.role === "user" ? "user" : ""}`}>
            <div className="message-avatar">{m.role === "user" ? userInitials : "✳"}</div>
            <div className="bubble">{m.content}</div>
          </div>
        ))}
        {pending && (
          <div className="message" aria-live="polite">
            <div className="message-avatar">✳</div>
            <div className="bubble"><span className="chat-typing" aria-label="考え中"><i /><i /><i /></span></div>
          </div>
        )}
      </div>
      {messages.length === 0 && (
        <div className="suggested-prompts">
          {prompts.map((p) => (
            <button key={p.label} className="prompt-chip" onClick={() => send(p.prompt)} disabled={pending}>{p.label}</button>
          ))}
        </div>
      )}
      <div className="chat-input-wrap">
        <form className="chat-input-box" onSubmit={onSubmit}>
          <input id="chatInput" aria-label="メッセージ" value={input} onChange={(e) => setInput(e.target.value)} maxLength={4000}
            placeholder="マーケティングのこと、何でも相談してください" disabled={pending} />
          <button className="chat-send" type="submit" disabled={pending || !input.trim()} aria-label="送信">↑</button>
        </form>
        <div className="activity-note" style={{ marginTop: 7 }}>
          {provider === "mock" || provider === null
            ? "API未設定の環境ではBrand Brainをもとにしたモック応答を返します。"
            : "AIの回答は参考情報です。"} 広告変更は承認後にのみ実行されます。
        </div>
      </div>
    </div>
  );
}
