import { useEffect, useRef, useState } from "react";
import { Bot, CheckCircle2, Loader2, Send, Sparkles, PencilLine } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const BRAND = "#006130";

const GREETING =
  "Olá! Pode me contar sua dúvida, reportar um bug ou sugerir uma melhoria. Estou aqui para ajudar!";

type MsgKind = "greeting" | "confirmation";

interface ChatMsg {
  id: number;
  role: "user" | "assistant";
  content: string;
  kind?: MsgKind;
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

// Extrai o primeiro objeto JSON balanceado a partir de uma string.
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

// Separa o texto exibido ao usuário do bloco REGISTRO:{...}.
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

/* ───────────────────────── Página: escolha de modalidade ───────────────────────── */

type Modo = "ia" | "manual";

export default function NovaSolicitacao() {
  const { user } = useAuth();
  const [modo, setModo] = useState<Modo>("ia");

  if (!user) return null;

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] w-full max-w-3xl flex-col gap-4 p-4">
      {/* Cards de escolha */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ModoCard
          ativo={modo === "ia"}
          onClick={() => setModo("ia")}
          icon={<Sparkles className="h-5 w-5" />}
          titulo="Via Assistente (IA)"
          descricao="Converse com o assistente e ele organiza tudo para você."
        />
        <ModoCard
          ativo={modo === "manual"}
          onClick={() => setModo("manual")}
          icon={<PencilLine className="h-5 w-5" />}
          titulo="Manual"
          descricao="Preencha um formulário simples com os campos da solicitação."
        />
      </div>

      {/* Formulário correspondente */}
      <div className="min-h-0 flex-1">
        {modo === "ia" ? <ChatIA /> : <FormularioManual />}
      </div>
    </div>
  );
}

function ModoCard({
  ativo,
  onClick,
  icon,
  titulo,
  descricao,
}: {
  ativo: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  titulo: string;
  descricao: string;
}) {
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={
        "cursor-pointer p-4 transition-all " +
        (ativo
          ? "border-2 ring-2 ring-offset-1"
          : "border hover:border-foreground/30 hover:shadow-sm")
      }
      style={ativo ? { borderColor: BRAND, boxShadow: `0 0 0 2px ${BRAND}33` } : undefined}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white"
          style={{ backgroundColor: ativo ? BRAND : "#9ca3af" }}
        >
          {icon}
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold">{titulo}</p>
          <p className="text-xs text-muted-foreground">{descricao}</p>
        </div>
      </div>
    </Card>
  );
}

/* ───────────────────────── Opção B: Formulário manual ───────────────────────── */

// Os valores armazenados seguem os códigos já usados pela tabela solicitacoes_gestor
// e pelas telas de exibição (MinhasSolicitacoes / admin Solicitacoes).
const TIPO_OPCOES = [
  { value: "altera", label: "Melhoria" },
  { value: "bug", label: "Bug" },
  { value: "duvida", label: "Dúvida" },
  { value: "outro", label: "Outro" },
];

const PRIORIDADE_OPCOES = [
  { value: "baixa", label: "Baixa" },
  { value: "normal", label: "Normal" },
  { value: "alta", label: "Alta" },
  { value: "urgente", label: "Urgente" },
];

function FormularioManual() {
  const { user, fullName } = useAuth();
  const [tipo, setTipo] = useState("altera");
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [prioridade, setPrioridade] = useState("normal");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  function resetForm() {
    setTipo("altera");
    setTitulo("");
    setDescricao("");
    setPrioridade("normal");
  }

  async function handleSubmit() {
    if (!titulo.trim() || !descricao.trim() || enviando) return;
    setEnviando(true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- colunas novas ainda não estão no types.ts gerado
    const { error } = await (supabase as any).from("solicitacoes_gestor").insert({
      tipo,
      titulo: titulo.trim(),
      descricao: descricao.trim(),
      prioridade,
      status: "aberto",
      criado_por: user!.id,
      criado_por_nome: fullName || user!.email || "Colaborador",
    });

    setEnviando(false);

    if (error) {
      console.error("Erro ao enviar solicitação manual:", error);
      toast.error("Não consegui enviar agora. Tente novamente em instantes.");
      return;
    }

    toast.success("Solicitação enviada! Pedro vai analisar em breve.");
    resetForm();
    setEnviado(true);
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto rounded-xl border border-border bg-background p-5">
      {enviado && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
          <span>Solicitação enviada com sucesso! Você pode enviar outra abaixo.</span>
        </div>
      )}

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="manual-tipo">Tipo</Label>
          <Select value={tipo} onValueChange={setTipo}>
            <SelectTrigger id="manual-tipo">
              <SelectValue placeholder="Selecione o tipo" />
            </SelectTrigger>
            <SelectContent>
              {TIPO_OPCOES.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="manual-titulo">Título</Label>
          <Input
            id="manual-titulo"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Resuma sua solicitação em uma frase"
            maxLength={140}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="manual-descricao">Descrição</Label>
          <Textarea
            id="manual-descricao"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Descreva com detalhes o que precisa, o problema ou a sugestão"
            rows={6}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="manual-prioridade">Prioridade</Label>
          <Select value={prioridade} onValueChange={setPrioridade}>
            <SelectTrigger id="manual-prioridade">
              <SelectValue placeholder="Selecione a prioridade" />
            </SelectTrigger>
            <SelectContent>
              {PRIORIDADE_OPCOES.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={handleSubmit}
          disabled={enviando || !titulo.trim() || !descricao.trim()}
          className="w-full text-white"
          style={{ backgroundColor: BRAND }}
        >
          {enviando ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Enviando...
            </>
          ) : (
            "Enviar solicitação"
          )}
        </Button>
      </div>
    </div>
  );
}

/* ───────────────────────── Opção A: Chat com o assistente (IA) ───────────────────────── */

function ChatIA() {
  const { user, fullName } = useAuth();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const idRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nextId = () => {
    idRef.current += 1;
    return idRef.current;
  };

  // Mensagem de boas-vindas ao montar.
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([{ id: nextId(), role: "assistant", content: GREETING, kind: "greeting" }]);
    }
  }, [messages.length]);

  // Auto-scroll para a última mensagem.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

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
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMsg = { id: nextId(), role: "user", content: text };
    const baseConversa = [...messages, userMsg];
    setMessages(baseConversa);
    setInput("");
    setLoading(true);

    try {
      // Envia apenas os turnos reais (sem saudação/confirmações) para a API.
      const apiMessages = baseConversa
        .filter((m) => !m.kind)
        .map((m) => ({ role: m.role, content: m.content }));

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
      console.error("Erro no agente de chat:", err);
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
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 text-white" style={{ backgroundColor: BRAND }}>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
          <Bot className="h-6 w-6" />
        </div>
        <div className="flex-1 leading-tight">
          <p className="text-base font-semibold">Assistente Bravir</p>
          <p className="text-xs text-white/80">Descreva sua sugestão, bug ou melhoria</p>
        </div>
      </div>

      {/* Mensagens */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-muted/30 px-3 py-4 sm:px-6">
        <div className="mx-auto w-full max-w-2xl space-y-3">
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
                      ? "rounded-br-sm bg-primary text-primary-foreground"
                      : "rounded-bl-sm border border-border bg-background text-foreground"
                  }`}
                  style={isUser ? { backgroundColor: BRAND, color: "#fff" } : undefined}
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
      </div>

      {/* Input */}
      <div className="border-t border-border bg-background px-3 py-3 sm:px-6">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={loading}
            placeholder="Escreva sua mensagem..."
            className="flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={loading || !input.trim()}
            aria-label="Enviar mensagem"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition-opacity disabled:opacity-40"
            style={{ backgroundColor: BRAND }}
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
