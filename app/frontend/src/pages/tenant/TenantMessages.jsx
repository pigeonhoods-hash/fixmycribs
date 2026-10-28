import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { MessageSquare, Send, User } from "lucide-react";

export default function TenantMessages() {
  const [conv, setConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

  const load = useCallback(async () => {
    let { data } = await api.get("/messages/conversations");
    let c = data[0];
    if (!c) {
      const { data: created } = await api.post("/messages/start-with-landlord");
      c = created;
    }
    setConv(c);
    const { data: full } = await api.get(`/messages/conversations/${c.id}`);
    setMessages(full.messages);
    setTimeout(() => scrollRef.current?.scrollTo({ top: 999999 }), 50);
  }, []);

  useEffect(() => { load().catch(() => {}); }, [load]);

  const send = async (e) => {
    e.preventDefault();
    if (!input.trim() || !conv) return;
    setSending(true);
    try {
      const { data } = await api.post(`/messages/conversations/${conv.id}`, { message: input });
      setMessages((m) => [...m, data]);
      setInput("");
      setTimeout(() => scrollRef.current?.scrollTo({ top: 999999, behavior: "smooth" }), 50);
    } catch { toast.error("Failed to send"); }
    finally { setSending(false); }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="tiny-label text-emerald-700">Communication</div>
        <h1 className="font-display text-3xl font-bold tracking-tight mt-2">Messages</h1>
        <p className="text-slate-500 mt-1">Direct chat with your landlord.</p>
      </div>
      <Card className="p-0 border border-slate-200 bg-white flex flex-col h-[65vh]">
        {conv ? (
          <>
            <div className="p-4 border-b border-slate-200 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-800 grid place-items-center"><User className="w-4 h-4" /></div>
              <div>
                <div className="font-semibold">{conv.landlord_name || "Your landlord"}</div>
                <div className="text-xs text-slate-500">{conv.apartment_number}</div>
              </div>
            </div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
              {messages.length === 0 && <div className="text-center text-sm text-slate-500 mt-8">No messages yet. Say hello 👋</div>}
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.sender_role === "tenant" ? "justify-end" : "justify-start"}`} data-testid={`tenant-msg-${m.id}`}>
                  <div className={`max-w-[75%] rounded-2xl px-4 py-2 ${m.sender_role === "tenant" ? "bg-emerald-600 text-white rounded-br-sm" : "bg-white border border-slate-200 rounded-bl-sm"}`}>
                    <div className="text-sm whitespace-pre-wrap">{m.message}</div>
                    <div className={`text-xs mt-1 ${m.sender_role === "tenant" ? "text-emerald-100" : "text-slate-500"}`}>{new Date(m.created_at).toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
            <form onSubmit={send} className="p-3 border-t border-slate-200 flex gap-2">
              <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type a message…" data-testid="tenant-message-input" />
              <Button type="submit" disabled={sending || !input.trim()} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="tenant-message-send">
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </>
        ) : (
          <div className="flex-1 grid place-items-center text-slate-500 text-sm">
            <MessageSquare className="w-8 h-8 text-slate-300" />
          </div>
        )}
      </Card>
    </div>
  );
}
