import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { formatCNPJ, formatCEP, isValidCNPJ, onlyDigits, formatBRL, formatDate } from "@/lib/format";
import { UFS } from "@/lib/constants";
import { AlertCircle, CheckCircle2, Search } from "lucide-react";

export type DadosCliente = {
  cliente_id?: string;
  cnpj: string;
  razao_social: string;
  cidade: string;
  uf: string;
  cep: string;
  comprador: string;
  cluster: string;
  tabela_preco: string;
  tipo: string;
  cond_pagamento: string;
  agendamento: boolean;
  observacoes: string;
  codigo_cliente: string;
  aceita_saldo: boolean;
  ordem_compra: string;
  email_xml: string;
};

type UltimoPedido = { id: string; numero_pedido: number; data_pedido: string; status: string; total: number };

type Sugestao = {
  id: string;
  razao_social: string;
  cnpj: string;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  rua: string | null;
  numero: string | null;
  bairro: string | null;
  telefone: string | null;
  comprador: string | null;
  cluster: string | null;
  tabela_preco: string | null;
  codigo_cliente: string | null;
  codigo_parceiro: string | null;
  aceita_saldo: boolean | null;
  negativado: boolean | null;
  email: string | null;
};

type Props = {
  value: DadosCliente;
  onChange: (v: DadosCliente) => void;
  vendedorId: string;
  lockCNPJ?: boolean;
};


export function SecaoCliente({ value, onChange, vendedorId, lockCNPJ = false }: Props) {
  const [cnpjStatus, setCnpjStatus] = useState<"idle" | "buscando" | "encontrado" | "novo" | "invalido">("idle");
  const [ultimosPedidos, setUltimosPedidos] = useState<UltimoPedido[]>([]);
  const [alertaMesmoDia, setAlertaMesmoDia] = useState(false);
  const [negativado, setNegativado] = useState(false);
  const [enderecoDisplay, setEnderecoDisplay] = useState<string | null>(null);
  const [telefoneDisplay, setTelefoneDisplay] = useState<string | null>(null);

  // Search field state
  const [searchText, setSearchText] = useState(() => value.razao_social || "");
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([]);
  const [showSugestoes, setShowSugestoes] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipCnpjLookupRef = useRef(false);

  // Always-fresh ref to avoid stale closures in async callbacks
  const valueRef = useRef(value);
  valueRef.current = value;

  const set = <K extends keyof DadosCliente>(k: K, v: DadosCliente[K]) =>
    onChange({ ...valueRef.current, [k]: v });

  // Click-outside to close dropdown
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSugestoes(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Sync searchText when loading from draft (value.razao_social populated from outside)
  useEffect(() => {
    if (value.razao_social && !searchText) {
      setSearchText(value.razao_social);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.razao_social]);

  // Fill all fields from a complete client record
  const preencherCliente = (cl: Sugestao) => {
    setCnpjStatus("encontrado");
    const isNegativado = cl.negativado ?? false;
    setNegativado(isNegativado);
    setSearchText(cl.razao_social);
    setSugestoes([]);
    setShowSugestoes(false);
    const partes = [cl.rua, cl.numero ? `nº ${cl.numero}` : null, cl.bairro].filter(Boolean);
    setEnderecoDisplay(partes.length > 0 ? partes.join(", ") : null);
    setTelefoneDisplay(cl.telefone ?? null);
    onChange({
      ...valueRef.current,
      cliente_id: cl.id,
      cnpj: formatCNPJ(cl.cnpj),
      razao_social: cl.razao_social,
      cidade: cl.cidade ?? "",
      uf: cl.uf ?? "",
      cep: cl.cep ? formatCEP(cl.cep) : "",
      comprador: cl.comprador ?? "",
      cluster: cl.cluster ?? valueRef.current.cluster,
      tabela_preco: cl.tabela_preco ?? valueRef.current.tabela_preco,
      codigo_cliente: cl.codigo_parceiro ?? cl.codigo_cliente ?? "",
      aceita_saldo: cl.aceita_saldo ?? true,
      email_xml: cl.email ?? "",
      ...(isNegativado ? { cond_pagamento: "À vista — pagamento antes do envio" } : {}),
    });
  };

  // CNPJ lookup (triggered by value.cnpj changes)
  useEffect(() => {
    const cnpjLimpo = onlyDigits(value.cnpj);
    if (cnpjLimpo.length !== 14) {
      if (!searchText || onlyDigits(searchText).length < 14) {
        setCnpjStatus("idle");
        setUltimosPedidos([]);
        setAlertaMesmoDia(false);
        setNegativado(false);
      }
      return;
    }
    if (!isValidCNPJ(cnpjLimpo)) {
      setCnpjStatus("invalido");
      return;
    }

    // Skip if triggered by name-search selection
    if (skipCnpjLookupRef.current) {
      skipCnpjLookupRef.current = false;
      return;
    }

    let cancel = false;
    setCnpjStatus("buscando");
    (async () => {
      const { data: cliente } = await supabase
        .from("clientes")
        .select("*")
        .eq("cnpj", cnpjLimpo)
        .maybeSingle();
      if (cancel) return;
      if (cliente) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cl = cliente as any;
        preencherCliente({
          id: cl.id,
          razao_social: cl.razao_social,
          cnpj: cl.cnpj,
          cidade: cl.cidade,
          uf: cl.uf,
          cep: cl.cep,
          rua: cl.rua ?? null,
          numero: cl.numero ?? null,
          bairro: cl.bairro ?? null,
          telefone: cl.telefone ?? null,
          comprador: cl.comprador,
          cluster: cl.cluster,
          tabela_preco: cl.tabela_preco,
          codigo_cliente: cl.codigo_cliente,
          codigo_parceiro: cl.codigo_parceiro,
          aceita_saldo: cl.aceita_saldo,
          negativado: cl.negativado,
          email: cl.email ?? null,
        });

        const { data: peds } = await supabase
          .from("pedidos")
          .select("id, numero_pedido, data_pedido, status, itens_pedido(total_item)")
          .eq("cliente_id", cl.id)
          .order("data_pedido", { ascending: false })
          .limit(3);
        if (peds && !cancel) {
          setUltimosPedidos(
            peds.map((p) => ({
              id: p.id,
              numero_pedido: p.numero_pedido,
              data_pedido: p.data_pedido,
              status: p.status,
              total: (p.itens_pedido as { total_item: number }[] | null)?.reduce(
                (s, i) => s + Number(i.total_item), 0,
              ) ?? 0,
            })),
          );
        }
        const hoje = new Date().toISOString().slice(0, 10);
        const { data: hojePed } = await supabase
          .from("pedidos")
          .select("id")
          .eq("cliente_id", cl.id)
          .eq("vendedor_id", vendedorId)
          .eq("data_pedido", hoje)
          .neq("status", "rascunho")
          .limit(1);
        if (!cancel) setAlertaMesmoDia((hojePed?.length ?? 0) > 0);
      } else {
        setCnpjStatus("novo");
        setUltimosPedidos([]);
        setAlertaMesmoDia(false);
        setNegativado(false);
        onChange({ ...value, cliente_id: undefined });
      }
    })();
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.cnpj, vendedorId]);

  // Name search handler
  const handleSearchChange = (text: string) => {
    setSearchText(text);
    const digits = onlyDigits(text);

    if (digits.length >= 14) {
      // CNPJ mode — format and trigger CNPJ lookup
      onChange({ ...value, cnpj: formatCNPJ(digits) });
      setSugestoes([]);
      setShowSugestoes(false);
      return;
    }

    // Name search: 3+ non-digit characters
    const letras = text.replace(/[\d.\-/\s]/g, "");
    if (letras.length >= 3) {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      searchTimerRef.current = setTimeout(async () => {
        const { data } = await supabase
          .from("clientes")
          .select("id, razao_social, cnpj, cidade, uf, cep, rua, numero, bairro, telefone, comprador, cluster, tabela_preco, codigo_cliente, codigo_parceiro, aceita_saldo, negativado, email")
          .ilike("razao_social", `%${text.trim()}%`)
          .limit(10);
        setSugestoes((data ?? []) as Sugestao[]);
        setShowSugestoes((data?.length ?? 0) > 0);
      }, 300);
    } else {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      setSugestoes([]);
      setShowSugestoes(false);
    }
  };

  const selecionarSugestao = (s: Sugestao) => {
    skipCnpjLookupRef.current = true;
    preencherCliente(s);

    // Load last orders for selected client
    supabase
      .from("pedidos")
      .select("id, numero_pedido, data_pedido, status, itens_pedido(total_item)")
      .eq("cliente_id", s.id)
      .order("data_pedido", { ascending: false })
      .limit(3)
      .then(({ data: peds }) => {
        if (peds) {
          setUltimosPedidos(
            peds.map((p) => ({
              id: p.id,
              numero_pedido: p.numero_pedido,
              data_pedido: p.data_pedido,
              status: p.status,
              total: (p.itens_pedido as { total_item: number }[] | null)?.reduce(
                (sum, i) => sum + Number(i.total_item), 0,
              ) ?? 0,
            })),
          );
        }
      });
  };

  return (
    <Card className="bg-[#EFF6FF] border-blue-200">
      <CardHeader>
        <CardTitle className="text-xl">Dados do cliente</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">

        {/* Campo de busca unificado */}
        {!lockCNPJ && (
          <div className="space-y-1.5" ref={searchRef}>
            <Label className="text-base font-semibold">Buscar cliente (CNPJ ou nome) *</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                value={searchText}
                onChange={(e) => handleSearchChange(e.target.value)}
                onFocus={() => sugestoes.length > 0 && setShowSugestoes(true)}
                placeholder="00.000.000/0000-00 ou nome da empresa"
                className="h-11 text-base pl-9"
              />
              {showSugestoes && sugestoes.length > 0 && (
                <div className="absolute z-50 w-full bg-background border rounded-md shadow-lg mt-1 max-h-56 overflow-y-auto">
                  {sugestoes.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); selecionarSugestao(s); }}
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-muted transition-colors border-b last:border-0"
                    >
                      <div className="font-medium">{s.razao_social}</div>
                      <div className="text-xs text-muted-foreground">{formatCNPJ(s.cnpj)}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="text-xs">
              {cnpjStatus === "invalido" && (
                <span className="flex items-center gap-1 text-destructive">
                  <AlertCircle className="h-3 w-3" /> CNPJ inválido
                </span>
              )}
              {cnpjStatus === "encontrado" && (
                <span className="flex items-center gap-1 text-primary">
                  <CheckCircle2 className="h-3 w-3" /> Cliente cadastrado — dados preenchidos
                </span>
              )}
              {cnpjStatus === "novo" && (
                <span className="text-muted-foreground">Novo cliente — preencha os dados abaixo</span>
              )}
              {cnpjStatus === "buscando" && <span className="text-muted-foreground">Buscando…</span>}
            </div>
          </div>
        )}

        {/* Endereço e telefone do cliente encontrado */}
        {cnpjStatus === "encontrado" && (enderecoDisplay || telefoneDisplay) && (
          <div className="rounded-md border bg-muted/30 px-4 py-2.5 text-sm space-y-0.5">
            {enderecoDisplay && (
              <div><span className="text-muted-foreground">Endereço: </span>{enderecoDisplay}</div>
            )}
            {telefoneDisplay && (
              <div><span className="text-muted-foreground">Telefone: </span>{telefoneDisplay}</div>
            )}
          </div>
        )}

        {/* Alerta negativado */}
        {negativado && (
          <div className="rounded-md border border-red-400 bg-red-50 p-3 text-sm text-red-800 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Cliente negativado — apenas pagamento à vista disponível.
          </div>
        )}

        {alertaMesmoDia && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Atenção: este cliente já tem pedido enviado hoje por você.
          </div>
        )}

        {ultimosPedidos.length > 0 && (
          <div className="rounded-md border bg-muted/40 p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Últimos pedidos do cliente
            </div>
            <div className="space-y-1 text-sm">
              {ultimosPedidos.map((p) => (
                <div key={p.id} className="flex justify-between">
                  <span>
                    #{p.numero_pedido} • {formatDate(p.data_pedido)} •{" "}
                    <span className="text-muted-foreground">{p.status}</span>
                  </span>
                  <span className="font-medium">{formatBRL(p.total)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Razão social */}
        <div className="space-y-1.5">
          <Label className="text-base font-semibold">Razão social *</Label>
          <Input
            value={value.razao_social}
            onChange={(e) => set("razao_social", e.target.value)}
            placeholder="Nome empresarial"
            className="h-11 text-base"
          />
        </div>

        {/* Perfil + Tabela (read-only quando cliente encontrado) */}
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-base font-semibold">
              Cluster *
              {cnpjStatus === "encontrado" && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">(definido pelo cadastro)</span>
              )}
            </Label>
            <Input
              value={value.cluster}
              readOnly
              disabled={cnpjStatus === "encontrado"}
              placeholder="Definido pelo faturamento"
              className="h-11 text-base"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-base font-semibold">
              Tabela de preço *
              {cnpjStatus === "encontrado" && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">(definido pelo cadastro)</span>
              )}
            </Label>
            <Input
              value={value.tabela_preco}
              readOnly
              disabled={cnpjStatus === "encontrado"}
              placeholder="Definido pelo faturamento"
              className="h-11 text-base"
            />
          </div>
        </div>

        {/* Cidade + UF */}
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-base font-semibold">Cidade</Label>
            <Input
              value={value.cidade}
              onChange={(e) => set("cidade", e.target.value)}
              className="h-11 text-base"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-base font-semibold">UF</Label>
            <Select value={value.uf} onValueChange={(v) => set("uf", v)}>
              <SelectTrigger className="h-11 text-base"><SelectValue placeholder="UF" /></SelectTrigger>
              <SelectContent>
                {UFS.map((uf) => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* CEP + Comprador */}
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-base font-semibold">CEP</Label>
            <Input
              value={value.cep}
              onChange={(e) => set("cep", formatCEP(e.target.value))}
              placeholder="00000-000"
              maxLength={9}
              className="h-11 text-base"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-base font-semibold">Comprador *</Label>
            <Input
              value={value.comprador}
              onChange={(e) => set("comprador", e.target.value)}
              className={`h-11 text-base ${
                cnpjStatus === "encontrado" && !value.comprador.trim()
                  ? "border-red-400 focus-visible:ring-red-400"
                  : ""
              }`}
            />
          </div>
        </div>

        {/* Ordem de Compra + Email XML/Boleto */}
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-base font-semibold">Ordem de Compra</Label>
            <Input
              value={value.ordem_compra}
              onChange={(e) => set("ordem_compra", e.target.value)}
              placeholder="Número da OC do cliente"
              className="h-11 text-base"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-base font-semibold">Email de XML/Boleto *</Label>
            <Input
              value={value.email_xml}
              onChange={(e) => set("email_xml", e.target.value)}
              placeholder="email@empresa.com"
              className={`h-11 text-base ${
                cnpjStatus === "encontrado" && !value.email_xml.trim()
                  ? "border-red-400 focus-visible:ring-red-400"
                  : ""
              }`}
            />
          </div>
        </div>

        {/* Tipo + Condição de pagamento */}
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-base font-semibold">Tipo *</Label>
            <Select value={value.tipo} onValueChange={(v) => set("tipo", v)}>
              <SelectTrigger className="h-11 text-base"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Pedido">Pedido</SelectItem>
                <SelectItem value="Bonificação">Bonificação</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-base font-semibold">Condição de pagamento *</Label>
            <Input
              value={value.cond_pagamento}
              onChange={(e) => !negativado && set("cond_pagamento", e.target.value)}
              readOnly={negativado}
              disabled={negativado}
              placeholder="Ex: 28/35/42 DDL, 30/60 dias..."
              className={`h-11 text-base ${
                cnpjStatus === "encontrado" && !value.cond_pagamento.trim()
                  ? "border-red-400 focus-visible:ring-red-400"
                  : ""
              }`}
            />
          </div>
        </div>

        {/* Código do cliente + Aceita saldo */}
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-base font-semibold">Código do cliente *</Label>
            <Input
              value={value.codigo_cliente}
              onChange={(e) => set("codigo_cliente", e.target.value)}
              placeholder="Ex: 00123"
              className={`h-11 text-base ${
                cnpjStatus === "encontrado" && !value.codigo_cliente.trim()
                  ? "border-red-400 focus-visible:ring-red-400"
                  : ""
              }`}
            />
          </div>
          <div className="flex items-center gap-3 rounded-md border bg-muted/30 px-4 py-3">
            <Switch checked={value.aceita_saldo} onCheckedChange={(c) => set("aceita_saldo", c)} />
            <div>
              <div className="text-base font-semibold leading-none">Aceita saldo</div>
              <div className="text-sm text-muted-foreground mt-0.5">{value.aceita_saldo ? "Sim" : "Não"}</div>
            </div>
          </div>
        </div>

        {/* Agendamento */}
        <div className="flex items-center gap-3 rounded-md border bg-muted/30 px-4 py-3">
          <Switch checked={value.agendamento} onCheckedChange={(c) => set("agendamento", c)} />
          <div>
            <div className="text-base font-semibold leading-none">Agendamento</div>
            <div className="text-sm text-muted-foreground mt-0.5">{value.agendamento ? "Sim — entrega agendada" : "Não"}</div>
          </div>
        </div>

        {/* Observações */}
        <div className="space-y-1.5">
          <Label className="text-base font-semibold">Observações</Label>
          <Textarea
            rows={3}
            value={value.observacoes}
            onChange={(e) => set("observacoes", e.target.value)}
            placeholder="Informações adicionais do pedido…"
            className="text-base"
          />
        </div>

      </CardContent>
    </Card>
  );
}
