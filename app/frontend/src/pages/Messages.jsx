import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { MessageSquare, Send, User } from "lucide-react";

function TimeAgo({ iso }) {
  if (!iso) return null;
  const d = new Date(iso);
  return <span className="text-xs text-slate-500">{d.toLocaleString()}</span>;
}

export default function Messages() {
  const [convs, setConvs] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [tenants, setTenants] = useState([]);
  const [showTenants, setShowTenants] = useState(false);
  const scrollRef = useRef(null);

  const loadConvs = useCallback(async () => {
    const { data } = await api.get("/messages/conversations");
    setConvs(data);
  }, []);

  const loadTenants = useCallback(async () => {
    const { data } = await api.get("/tenants");
    setTenants(data.filter((t) => t.status === "active"));
  }, []);

  useEffect(() => { loadConvs(); loadTenants(); }, [loadConvs, loadTenants]);

  const openConv = async (c) => {
    setActive(c);
    const { data } = await api.get(`/messages/conversations/${c.id}`);
    setMessages(data.messages);
    setTimeout(() => scrollRef.current?.scrollTo({ top: 999999, behavior: "smooth" }), 100);
    loadConvs();
  };

  const startConv = async (tenantId) => {
    try {
      const { data } = await api.post(`/messages/start-with-tenant/${tenantId}`);
      setShowTenants(false);
      await loadConvs();
      openConv(data);
    } catch (er) {
      toast.error("Could not start conversation");
    }
  };

  const send = async (e) => {
    e.preventDefault();
    if (!input.trim() || !active) return;
    setSending(true);
    try {
      const { data } = await api.post(`/messages/conversations/${active.id}`, { message: input });
      setMessages((m) => [...m, data]);
      setInput("");
      loadConvs();
      setTimeout(() => scrollRef.current?.scrollTo({ top: 999999, behavior: "smooth" }), 50);
    } catch (er) {
      toast.error("Failed to send");
    } finally { setSending(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="tiny-label text-emerald-700">Communication</div>
          <h1 className="font-display text-3xl font-bold tracking-tight mt-2">Messages</h1>
          <p className="text-slate-500 mt-1">Chat with your tenants — one thread per tenant.</p>
        </div>
        <Button onClick={() => setShowTenants(!showTenants)} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="new-message-btn">
          <MessageSquare className="w-4 h-4 mr-1.5" /> New conversation
        </Button>
      </div>

      {showTenants && (
        <Card className="p-4 border border-slate-200 bg-white">
          <div className="tiny-label mb-2">Select a tenant</div>
          <div className="grid sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto">
            {tenants.length === 0 && <div className="text-sm text-slate-500">No active tenants.</div>}
            {tenants.map((t) => (
              <button key={t.id} onClick={() => startConv(t.id)} className="text-left p-3 border border-slate-200 rounded-md hover:border-emerald-500 hover:bg-emerald-50 transition-colors" data-testid={`start-conv-${t.id}`}>
                <div className="font-semibold">{t.full_name}</div>
                <div className="text-xs text-slate-500">{t.apartment_number} · {t.property_name}</div>
              </button>
            ))}
          </div>
        </Card>
      )}

      <div className="grid md:grid-cols-3 gap-4">
        <Card className="p-0 border border-slate-200 bg-white overflow-hidden">
          <div className="p-4 border-b border-slate-200 tiny-label">Conversations</div>
          <div className="divide-y divide-slate-100 max-h-[65vh] overflow-y-auto">
            {convs.length === 0 && <div className="p-6 text-sm text-slate-500 text-center">No conversations yet.</div>}
            {convs.map((c) => (
              <button key={c.id} onClick={() => openConv(c)} data-testid={`conv-${c.id}`}
                className={`w-full text-left p-4 hover:bg-slate-50 transition-colors ${active?.id === c.id ? "bg-emerald-50" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{c.tenant_name}</div>
                    <div className="text-xs text-slate-500 truncate">{c.apartment_number}</div>
                    <div className="text-xs text-slate-600 truncate mt-1">{c.last_message || <span className="italic text-slate-400">No messages yet</span>}</div>
                  </div>
                  {c.unread_count > 0 && <span className="bg-emerald-600 text-white text-xs font-bold rounded-full min-w-[20px] h-5 px-1.5 grid place-items-center">{c.unread_count}</span>}
                </div>
              </button>
            ))}
          </div>
        </Card>

        <Card className="md:col-span-2 p-0 border border-slate-200 bg-white flex flex-col h-[65vh]">
          {active ? (
            <>
              <div className="p-4 border-b border-slate-200 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-800 grid place-items-center"><User className="w-4 h-4" /></div>
                <div>
                  <div className="font-semibold">{active.tenant_name}</div>
                  <div className="text-xs text-slate-500">{active.apartment_number}</div>
                </div>
              </div>
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
                {messages.length === 0 && <div className="text-center text-sm text-slate-500 mt-8">No messages yet. Say hello 👋</div>}
                {messages.map((m) => (
                  <div key={m.id} className={`flex ${m.sender_role === "owner" ? "justify-end" : "justify-start"}`} data-testid={`msg-${m.id}`}>
                    <div className={`max-w-[75%] rounded-2xl px-4 py-2 ${m.sender_role === "owner" ? "bg-emerald-600 text-white rounded-br-sm" : "bg-white border border-slate-200 rounded-bl-sm"}`}>
                      <div className="text-sm whitespace-pre-wrap">{m.message}</div>
                      <div className={`text-xs mt-1 ${m.sender_role === "owner" ? "text-emerald-100" : "text-slate-500"}`}><TimeAgo iso={m.created_at} /></div>
                    </div>
                  </div>
                ))}
              </div>
              <form onSubmit={send} className="p-3 border-t border-slate-200 flex gap-2">
                <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type a message…" data-testid="message-input" />
                <Button type="submit" disabled={sending || !input.trim()} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="message-send">
                  <Send className="w-4 h-4" />
                </Button>
              </form>
            </>
          ) : (
            <div className="flex-1 grid place-items-center text-slate-500 text-sm">
              <div className="text-center">
                <MessageSquare className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                Select a conversation
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
