import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Bot, CheckCircle2, ExternalLink, Loader2, Paperclip, PencilLine, PlusCircle, Send } from "lucide-react";

const BRAND = "#0F6E56";

interface ChatMensagem {
  role: "user" | "assistant" | string;
  content: string;
}

interface Solicitacao {
  id: string;
  tipo: string;
  tela: string | null;
  titulo: string | null;
  descricao: string;
  motivo: string | null;
  prioridade: string;
  status: string;
  criado_por: string | null;
  criado_por_nome: string | null;
  created_at: string | null;
  mockup_prompt?: string | null;
  chat_historico?: ChatMensagem[] | null;
  link_teste?: string | null;
  motivo_devolucao?: string | null;
}

/* ───────────────────────── Metadados de exibição ───────────────────────── */

const STATUS_META: Record<string, { label: string; cls: string }> = {
  aberto: { label: "Aberto", cls: "bg-blue-100 text-blue-800 border-blue-300" },
  em_analise: { label: "Em análise", cls: "bg-amber-100 text-amber-800 border-amber-300" },
  "em-andamento": { label: "Em andamento", cls: "bg-amber-100 text-amber-800 border-amber-300" },
  aprovado: { label: "Aprovado", cls: "bg-green-100 text-green-800 border-green-300" },
  reprovado: { label: "Reprovado", cls: "bg-red-100 text-red-800 border-red-300" },
  devolvido: { label: "Devolvido", cls: "bg-purple-100 text-purple-800 border-purple-300" },
  concluido: { label: "Concluído", cls: "bg-green-100 text-green-800 border-green-300" },
  recusado: { label: "Recusado", cls: "bg-red-100 text-red-800 border-red-300" },
};

function statusMeta(s: string) {
  return STATUS_META[s] ?? { label: s, cls: "bg-gray-100 text-gray-700 border-gray-300" };
}

const TIPO_META: Record<string, { label: string; cls: string }> = {
  bug: { label: "Bug", cls: "bg-red-100 text-red-800 border-red-300" },
  nova: { label: "Nova feature", cls: "bg-blue-100 text-blue-800 border-blue-300" },
  altera: { label: "Melhoria", cls: "bg-emerald-100 text-emerald-800 border-emerald-300" },
};

function tipoMeta(t: string) {
  return TIPO_META[t] ?? { label: t, cls: "bg-gray-100 text-gray-700 border-gray-300" };
}

function relativo(iso: string | null) {
  if (!iso) return "";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR });
  } catch {
    return "";
  }
}

/* ─────────── Parsing do REGISTRO devolvido pelo agente (igual chat) ─────────── */

function extractFirstJson(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

interface Registro {
  tipo: "bug" | "nova" | "altera";
  titulo?: string;
  tela?: string;
  descricao?: string;
  motivo?: string;
  prioridade?: "alta" | "normal";
  mockup_prompt?: string;
}

function splitRegistro(raw: string): { display: string; registro: Registro | null } {
  const idx = raw.indexOf("REGISTRO:");
  if (idx === -1) return { display: raw.trim(), registro: null };

  const display = raw.slice(0, idx).trim();
  const jsonStr = extractFirstJson(raw.slice(idx + "REGISTRO:".length));
  if (!jsonStr) return { display: display || raw.trim(), registro: null };

  try {
    const registro = JSON.parse(jsonStr) as Registro;
    if (registro && (registro.tipo === "bug" || registro.tipo === "nova" || registro.tipo === "altera")) {
      return { display: display || "Anotei tudo aqui. 👇", registro };
    }
  } catch {
    // JSON malformado — apenas mostra o texto bruto.
  }
  return { display: raw.trim(), registro: null };
}

/* ───────────────────────────── Página ───────────────────────────── */

export default function MinhasSolicitacoes() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [corrigir, setCorrigir] = useState<Solicitacao | null>(null);
  const [novaAberta, setNovaAberta] = useState(false);

  const { data: solicitacoes = [], isLoading } = useQuery({
    queryKey: ["minhas_solicitacoes", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("solicitacoes_gestor")
        .select("*")
        .eq("criado_por", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Solicitacao[];
    },
  });

  async function marcarResolvido(s: Solicitacao) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- colunas novas ainda não estão no types.ts gerado
    const { error } = await (supabase as any)
      .from("solicitacoes_gestor")
      .update({ status: "concluido" })
      .eq("id", s.id);
    if (error) {
      toast.error("Erro ao marcar como resolvido: " + error.message);
      return;
    }
    toast.success("Marcado como resolvido. Obrigado!");
    qc.invalidateQueries({ queryKey: ["minhas_solicitacoes", user?.id] });
  }

  function testarMelhoria(s: Solicitacao) {
    if (s.link_teste) {
      window.open(s.link_teste, "_blank", "noopener,noreferrer");
    } else {
      toast.info("Link não disponível ainda");
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Minhas Solicitações</h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe o andamento das suas solicitações e sugestões.
          </p>
        </div>
        <Button onClick={() => setNovaAberta(true)}>
          <PlusCircle className="h-4 w-4 mr-2" />
          Nova Solicitação
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : solicitacoes.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">
          Você ainda não enviou nenhuma solicitação.
        </p>
      ) : (
        <div className="space-y-3 max-w-3xl">
          {solicitacoes.map((s) => {
            const tm = tipoMeta(s.tipo);
            const sm = statusMeta(s.status);
            const resumo =
              s.titulo || `${s.descricao.slice(0, 120)}${s.descricao.length > 120 ? "…" : ""}`;
            return (
              <Card key={s.id}>
                <CardContent className="pt-4 pb-4 px-5 space-y-3">
                  <div className="flex flex-wrap gap-2 items-center">
                    <Badge className={`border text-xs font-semibold ${tm.cls}`}>{tm.label}</Badge>
                    <Badge className={`border text-xs font-semibold ${sm.cls}`}>{sm.label}</Badge>
                    <span className="ml-auto text-xs text-muted-foreground">{relativo(s.created_at)}</span>
                  </div>

                  <p className="text-sm font-medium">{resumo}</p>
                  {s.titulo && s.descricao && s.descricao !== s.titulo && (
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{s.descricao}</p>
                  )}

                  {/* Motivo da reprovação */}
                  {s.status === "reprovado" && s.motivo_devolucao && (
                    <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                      <p className="text-xs font-semibold uppercase tracking-wide text-red-700">
                        Motivo da reprovação
                      </p>
                      <p className="whitespace-pre-wrap">{s.motivo_devolucao}</p>
                    </div>
                  )}

                  {/* Ações por status */}
                  {s.status === "aprovado" && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700"
                        onClick={() => testarMelhoria(s)}
                      >
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Testar melhoria
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => marcarResolvido(s)}>
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Resolvido
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-amber-300 text-amber-800 hover:bg-amber-50"
                        onClick={() => setCorrigir(s)}
                      >
                        <PencilLine className="mr-2 h-4 w-4" />
                        Corrigir
                      </Button>
                    </div>
                  )}

                  {s.status === "reprovado" && (
                    <div className="pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-amber-300 text-amber-800 hover:bg-amber-50"
                        onClick={() => setCorrigir(s)}
                      >
                        <PencilLine className="mr-2 h-4 w-4" />
                        Corrigir sugestão
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal de correção com chat */}
      <Dialog open={!!corrigir} onOpenChange={(o) => !o && setCorrigir(null)}>
        <DialogContent className="p-0 gap-0 overflow-hidden w-screen h-[100dvh] max-w-none rounded-none sm:w-[480px] sm:h-[560px] sm:max-w-[480px] sm:rounded-2xl">
          {corrigir && (
            <ChatCorrigir
              solicitacao={corrigir}
              onSaved={() => {
                qc.invalidateQueries({ queryKey: ["minhas_solicitacoes", user?.id] });
                setCorrigir(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de nova solicitação com chat */}
      <Dialog open={novaAberta} onOpenChange={setNovaAberta}>
        <DialogContent className="p-0 gap-0 overflow-hidden w-screen h-[100dvh] max-w-none rounded-none sm:w-[480px] sm:h-[600px] sm:max-w-[480px] sm:rounded-2xl">
          <ChatNovaSolicitacao
            onSaved={() => {
              setNovaAberta(false);
              qc.invalidateQueries({ queryKey: ["minhas_solicitacoes", user?.id] });
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ───────────────── Chat de correção (modo "corrigir") ───────────────── */

type MsgKind = "greeting" | "confirmation";

interface ChatMsg {
  id: number;
  role: "user" | "assistant";
  content: string;
  kind?: MsgKind;
}

const GREETING_CORRIGIR =
  "Entendi que há algo a corrigir na sua solicitação anterior. Me conta o que não funcionou ou o que precisa ser ajustado.";

function ChatCorrigir({
  solicitacao,
  onSaved,
}: {
  solicitacao: Solicitacao;
  onSaved: () => void;
}) {
  const [messages, setMessages] = useState<ChatMsg[]>([
    { id: 0, role: "assistant", content: GREETING_CORRIGIR, kind: "greeting" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [imagensPendentes, setImagensPendentes] = useState<
    { id: number; base64: string; mimeType: string; nome: string }[]
  >([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const idRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nextId = () => {
    idRef.current += 1;
    return idRef.current;
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  function fileToBase64(file: File): Promise<string> {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res((r.result as string).split(",")[1]);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }

  async function processarArquivos(files: FileList | File[]) {
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    const novas = await Promise.all(
      arr.map(async (f) => ({
        id: Date.now() + Math.random(),
        base64: await fileToBase64(f),
        mimeType: f.type,
        nome: f.name,
      })),
    );
    setImagensPendentes((prev) => [...prev, ...novas]);
  }

  async function salvarDevolucao(registro: Registro, conversa: ChatMsg[]) {
    const chatHistorico = conversa
      .filter((m) => !m.kind)
      .map((m) => ({ role: m.role, content: m.content }));

    const novaDescricao =
      registro.descricao ?? registro.titulo ?? solicitacao.descricao ?? "(sem descrição)";

    // Atualiza a solicitação existente — não cria uma nova.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- colunas novas ainda não estão no types.ts gerado
    const { error } = await (supabase as any)
      .from("solicitacoes_gestor")
      .update({
        status: "devolvido",
        chat_historico: chatHistorico,
        descricao: novaDescricao,
      })
      .eq("id", solicitacao.id);

    if (error) {
      console.error("Erro ao devolver solicitação:", error);
      return false;
    }
    return true;
  }

  async function handleSend() {
    const text = input;
    if (loading || (!text.trim() && imagensPendentes.length === 0)) return;

    const contentParaApi =
      imagensPendentes.length > 0
        ? [
            ...imagensPendentes.map((img) => ({
              type: "image",
              source: { type: "base64", media_type: img.mimeType, data: img.base64 },
            })),
            ...(text.trim() ? [{ type: "text", text: text.trim() }] : []),
          ]
        : text.trim();

    const contentParaExibir = [
      ...imagensPendentes.map((img) => `[imagem: ${img.nome}]`),
      ...(text.trim() ? [text.trim()] : []),
    ].join(" ");

    const userMsg: ChatMsg = { id: nextId(), role: "user", content: contentParaExibir };
    setImagensPendentes([]);
    const baseConversa = [...messages, userMsg];
    setMessages(baseConversa);
    setInput("");
    setLoading(true);

    try {
      const naoKind = baseConversa.filter((m) => !m.kind);
      const apiMessages = naoKind.map((m, i) => ({
        role: m.role,
        content: i === naoKind.length - 1 ? contentParaApi : m.content,
      }));

      const { data, error } = await supabase.functions.invoke("agente-chat", {
        body: { messages: apiMessages },
      });

      if (error || !data?.text) {
        throw error ?? new Error("Resposta vazia do assistente");
      }

      const { display, registro } = splitRegistro(data.text as string);
      const assistantMsg: ChatMsg = { id: nextId(), role: "assistant", content: display };
      const comResposta = [...baseConversa, assistantMsg];
      setMessages(comResposta);

      if (registro) {
        const ok = await salvarDevolucao(registro, comResposta);
        if (ok) {
          setMessages((prev) => [
            ...prev,
            {
              id: nextId(),
              role: "assistant",
              content: "✓ Correção enviada! Pedro vai reavaliar sua solicitação em breve.",
              kind: "confirmation",
            },
          ]);
          setTimeout(onSaved, 1400);
        } else {
          setMessages((prev) => [
            ...prev,
            {
              id: nextId(),
              role: "assistant",
              content: "Não consegui registrar agora. Pode tentar de novo em instantes?",
            },
          ]);
        }
      }
    } catch (err) {
      console.error("Erro no chat de correção:", err);
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: "assistant",
          content: "Ops, tive um problema para responder agora. Tente novamente em alguns segundos.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 text-white" style={{ backgroundColor: BRAND }}>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
          <Bot className="h-5 w-5" />
        </div>
        <div className="flex-1 leading-tight">
          <p className="text-sm font-semibold">Corrigir solicitação</p>
          <p className="flex items-center gap-1.5 text-xs text-white/80">
            <span className="inline-block h-2 w-2 rounded-full bg-green-300" />
            Assistente Bravir
          </p>
        </div>
      </div>

      {/* Mensagens */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-muted/30 px-3 py-4">
        {messages.map((m) => {
          if (m.kind === "confirmation") {
            return (
              <div
                key={m.id}
                className="flex items-start gap-2 rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800"
              >
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                <span>{m.content}</span>
              </div>
            );
          }
          const isUser = m.role === "user";
          return (
            <div key={m.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                  isUser
                    ? "rounded-br-sm text-white"
                    : "rounded-bl-sm border border-border bg-background text-foreground"
                }`}
                style={isUser ? { backgroundColor: BRAND } : undefined}
              >
                {m.content}
              </div>
            </div>
          );
        })}

        {loading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Digitando...
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border bg-background">
        {imagensPendentes.length > 0 && (
          <div className="flex flex-wrap gap-2 px-3 pt-2">
            {imagensPendentes.map((img) => (
              <div key={img.id} className="relative">
                <img
                  src={`data:${img.mimeType};base64,${img.base64}`}
                  alt={img.nome}
                  className="h-16 w-16 rounded-lg object-cover border border-border"
                />
                <button
                  type="button"
                  onClick={() =>
                    setImagensPendentes((prev) => prev.filter((i) => i.id !== img.id))
                  }
                  className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-white text-xs leading-none"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2 px-3 py-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && processarArquivos(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-muted transition-colors disabled:opacity-40"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            onPaste={(e) => {
              const files = e.clipboardData?.files;
              if (files && files.length > 0) {
                e.preventDefault();
                processarArquivos(files);
              }
            }}
            disabled={loading}
            rows={1}
            placeholder="Escreva o que precisa ajustar..."
            className="flex-1 resize-none max-h-32 rounded-2xl border border-border bg-background px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={loading || (!input.trim() && imagensPendentes.length === 0)}
            aria-label="Enviar mensagem"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition-opacity disabled:opacity-40"
            style={{ backgroundColor: BRAND }}
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────── Chat de nova solicitação ───────────────── */

const GREETING_NOVA =
  "Olá! Pode me contar sua dúvida, reportar um bug ou sugerir uma melhoria. Estou aqui para ajudar!";

function ChatNovaSolicitacao({ onSaved }: { onSaved: () => void }) {
  const { user, fullName } = useAuth();
  const [messages, setMessages] = useState<ChatMsg[]>([
    { id: 0, role: "assistant", content: GREETING_NOVA, kind: "greeting" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [imagensPendentes, setImagensPendentes] = useState<
    { id: number; base64: string; mimeType: string; nome: string }[]
  >([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const idRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nextId = () => {
    idRef.current += 1;
    return idRef.current;
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  function fileToBase64(file: File): Promise<string> {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res((r.result as string).split(",")[1]);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }

  async function processarArquivos(files: FileList | File[]) {
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    const novas = await Promise.all(
      arr.map(async (f) => ({
        id: Date.now() + Math.random(),
        base64: await fileToBase64(f),
        mimeType: f.type,
        nome: f.name,
      })),
    );
    setImagensPendentes((prev) => [...prev, ...novas]);
  }

  async function salvarRegistro(registro: Registro, conversa: ChatMsg[]) {
    const chatHistorico = conversa
      .filter((m) => !m.kind)
      .map((m) => ({ role: m.role, content: m.content }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- colunas novas ainda não estão no types.ts gerado
    const { error } = await (supabase as any).from("solicitacoes_gestor").insert({
      tipo: registro.tipo,
      titulo: registro.titulo ?? null,
      tela: registro.tela ?? null,
      descricao: registro.descricao ?? registro.titulo ?? "(sem descrição)",
      motivo: registro.motivo ?? null,
      prioridade: registro.prioridade ?? "normal",
      mockup_prompt: registro.mockup_prompt ?? null,
      status: "aberto",
      criado_por: user!.id,
      criado_por_nome: fullName || user!.email || "Colaborador",
      chat_historico: chatHistorico,
    });

    if (error) {
      console.error("Erro ao salvar solicitação do agente:", error);
      return false;
    }
    return true;
  }

  async function handleSend() {
    const text = input;
    if (loading || (!text.trim() && imagensPendentes.length === 0)) return;

    const contentParaApi =
      imagensPendentes.length > 0
        ? [
            ...imagensPendentes.map((img) => ({
              type: "image",
              source: { type: "base64", media_type: img.mimeType, data: img.base64 },
            })),
            ...(text.trim() ? [{ type: "text", text: text.trim() }] : []),
          ]
        : text.trim();

    const contentParaExibir = [
      ...imagensPendentes.map((img) => `[imagem: ${img.nome}]`),
      ...(text.trim() ? [text.trim()] : []),
    ].join(" ");

    const userMsg: ChatMsg = { id: nextId(), role: "user", content: contentParaExibir };
    setImagensPendentes([]);
    const baseConversa = [...messages, userMsg];
    setMessages(baseConversa);
    setInput("");
    setLoading(true);

    try {
      const naoKind = baseConversa.filter((m) => !m.kind);
      const apiMessages = naoKind.map((m, i) => ({
        role: m.role,
        content: i === naoKind.length - 1 ? contentParaApi : m.content,
      }));

      const { data, error } = await supabase.functions.invoke("agente-chat", {
        body: { messages: apiMessages },
      });

      if (error || !data?.text) {
        throw error ?? new Error("Resposta vazia do assistente");
      }

      const { display, registro } = splitRegistro(data.text as string);
      const assistantMsg: ChatMsg = { id: nextId(), role: "assistant", content: display };
      const comResposta = [...baseConversa, assistantMsg];
      setMessages(comResposta);

      if (registro) {
        const ok = await salvarRegistro(registro, comResposta);
        if (ok) {
          setMessages((prev) => [
            ...prev,
            {
              id: nextId(),
              role: "assistant",
              content: "✓ Registrado! Pedro vai analisar sua solicitação em breve.",
              kind: "confirmation",
            },
          ]);
          setTimeout(onSaved, 1400);
        } else {
          setMessages((prev) => [
            ...prev,
            {
              id: nextId(),
              role: "assistant",
              content: "Não consegui registrar agora. Pode tentar de novo em instantes?",
            },
          ]);
        }
      }
    } catch (err) {
      console.error("Erro no chat de nova solicitação:", err);
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: "assistant",
          content: "Ops, tive um problema para responder agora. Tente novamente em alguns segundos.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 text-white" style={{ backgroundColor: BRAND }}>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
          <Bot className="h-5 w-5" />
        </div>
        <div className="flex-1 leading-tight">
          <p className="text-sm font-semibold">Assistente Bravir</p>
          <p className="flex items-center gap-1.5 text-xs text-white/80">
            <span className="inline-block h-2 w-2 rounded-full bg-green-300" />
            Descreva sua sugestão, bug ou melhoria
          </p>
        </div>
      </div>

      {/* Mensagens */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-muted/30 px-3 py-4">
        {messages.map((m) => {
          if (m.kind === "confirmation") {
            return (
              <div
                key={m.id}
                className="flex items-start gap-2 rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800"
              >
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                <span>{m.content}</span>
              </div>
            );
          }
          const isUser = m.role === "user";
          return (
            <div key={m.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                  isUser
                    ? "rounded-br-sm text-white"
                    : "rounded-bl-sm border border-border bg-background text-foreground"
                }`}
                style={isUser ? { backgroundColor: BRAND } : undefined}
              >
                {m.content}
              </div>
            </div>
          );
        })}

        {loading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Digitando...
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border bg-background">
        {imagensPendentes.length > 0 && (
          <div className="flex flex-wrap gap-2 px-3 pt-2">
            {imagensPendentes.map((img) => (
              <div key={img.id} className="relative">
                <img
                  src={`data:${img.mimeType};base64,${img.base64}`}
                  alt={img.nome}
                  className="h-16 w-16 rounded-lg object-cover border border-border"
                />
                <button
                  type="button"
                  onClick={() =>
                    setImagensPendentes((prev) => prev.filter((i) => i.id !== img.id))
                  }
                  className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-white text-xs leading-none"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2 px-3 py-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && processarArquivos(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-muted transition-colors disabled:opacity-40"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            onPaste={(e) => {
              const files = e.clipboardData?.files;
              if (files && files.length > 0) {
                e.preventDefault();
                processarArquivos(files);
              }
            }}
            disabled={loading}
            rows={1}
            placeholder="Escreva sua mensagem..."
            className="flex-1 resize-none max-h-32 rounded-2xl border border-border bg-background px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={loading || (!input.trim() && imagensPendentes.length === 0)}
            aria-label="Enviar mensagem"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition-opacity disabled:opacity-40"
            style={{ backgroundColor: BRAND }}
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
