import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { formatCNPJ, formatCEP, isValidCNPJ, onlyDigits, formatBRL, formatDate } from "@/lib/format";
import { PERFIS_CLIENTE, TABELAS_PRECO, UFS } from "@/lib/constants";
import { AlertCircle, CheckCircle2 } from "lucide-react";

export type DadosCliente = {
  cliente_id?: string;
  cnpj: string;
  razao_social: string;
  cidade: string;
  uf: string;
  cep: string;
  comprador: string;
  perfil_cliente: string;
  tabela_preco: string;
  tipo: string;
  cond_pagamento: string;
  agendamento: boolean;
  observacoes: string;
};

type UltimoPedido = { id: string; numero_pedido: number; data_pedido: string; status: string; total: number };

type Props = {
  value: DadosCliente;
  onChange: (v: DadosCliente) => void;
  vendedorId: string;
};

export function SecaoCliente({ value, onChange, vendedorId }: Props) {
  const [cnpjStatus, setCnpjStatus] = useState<"idle" | "buscando" | "encontrado" | "novo" | "invalido">("idle");
  const [ultimosPedidos, setUltimosPedidos] = useState<UltimoPedido[]>([]);
  const [alertaMesmoDia, setAlertaMesmoDia] = useState(false);

  const set = <K extends keyof DadosCliente>(k: K, v: DadosCliente[K]) =>
    onChange({ ...value, [k]: v });

  useEffect(() => {
    const cnpjLimpo = onlyDigits(value.cnpj);
    if (cnpjLimpo.length !== 14) {
      setCnpjStatus(cnpjLimpo.length > 0 ? "idle" : "idle");
      setUltimosPedidos([]);
      setAlertaMesmoDia(false);
      return;
    }
    if (!isValidCNPJ(cnpjLimpo)) {
      setCnpjStatus("invalido");
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
        setCnpjStatus("encontrado");
        onChange({
          ...value,
          cliente_id: cliente.id,
          cnpj: formatCNPJ(cliente.cnpj),
          razao_social: cliente.razao_social,
          cidade: cliente.cidade ?? "",
          uf: cliente.uf ?? "",
          cep: cliente.cep ? formatCEP(cliente.cep) : "",
          comprador: cliente.comprador ?? "",
        });
        // últimos 3 pedidos
        const { data: peds } = await supabase
          .from("pedidos")
          .select("id, numero_pedido, data_pedido, status, itens_pedido(total_item)")
          .eq("cliente_id", cliente.id)
          .order("data_pedido", { ascending: false })
          .limit(3);
        if (peds) {
          setUltimosPedidos(
            peds.map((p) => ({
              id: p.id,
              numero_pedido: p.numero_pedido,
              data_pedido: p.data_pedido,
              status: p.status,
              total: (p.itens_pedido as { total_item: number }[] | null)?.reduce(
                (s, i) => s + Number(i.total_item),
                0,
              ) ?? 0,
            })),
          );
        }
        // alerta mesmo dia
        const hoje = new Date().toISOString().slice(0, 10);
        const { data: hojePed } = await supabase
          .from("pedidos")
          .select("id")
          .eq("cliente_id", cliente.id)
          .eq("vendedor_id", vendedorId)
          .eq("data_pedido", hoje)
          .neq("status", "rascunho")
          .limit(1);
        setAlertaMesmoDia((hojePed?.length ?? 0) > 0);
      } else {
        setCnpjStatus("novo");
        setUltimosPedidos([]);
        setAlertaMesmoDia(false);
        onChange({ ...value, cliente_id: undefined });
      }
    })();
    return () => {
      cancel = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.cnpj, vendedorId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dados do cliente</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="cnpj">CNPJ *</Label>
            <Input
              id="cnpj"
              value={value.cnpj}
              onChange={(e) => set("cnpj", formatCNPJ(e.target.value))}
              placeholder="00.000.000/0000-00"
              maxLength={18}
            />
            <div className="mt-1 text-xs">
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
          <div>
            <Label htmlFor="razao">Razão social *</Label>
            <Input
              id="razao"
              value={value.razao_social}
              onChange={(e) => set("razao_social", e.target.value)}
              placeholder="Nome empresarial"
            />
          </div>
        </div>

        {alertaMesmoDia && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
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

        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <Label>Cidade</Label>
            <Input value={value.cidade} onChange={(e) => set("cidade", e.target.value)} />
          </div>
          <div>
            <Label>UF</Label>
            <Select value={value.uf} onValueChange={(v) => set("uf", v)}>
              <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
              <SelectContent>
                {UFS.map((uf) => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>CEP</Label>
            <Input
              value={value.cep}
              onChange={(e) => set("cep", formatCEP(e.target.value))}
              placeholder="00000-000"
              maxLength={9}
            />
          </div>
        </div>

        <div>
          <Label>Comprador</Label>
          <Input value={value.comprador} onChange={(e) => set("comprador", e.target.value)} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Perfil do cliente *</Label>
            <Select value={value.perfil_cliente} onValueChange={(v) => set("perfil_cliente", v)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {PERFIS_CLIENTE.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Tabela de preço *</Label>
            <Select value={value.tabela_preco} onValueChange={(v) => set("tabela_preco", v)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {TABELAS_PRECO.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <Label>Tipo *</Label>
            <Select value={value.tipo} onValueChange={(v) => set("tipo", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Pedido">Pedido</SelectItem>
                <SelectItem value="Bonificação">Bonificação</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Condição de pagamento</Label>
            <Input
              value={value.cond_pagamento}
              onChange={(e) => set("cond_pagamento", e.target.value)}
              placeholder="Ex: 30/60/90 dias"
            />
          </div>
          <div className="flex flex-col">
            <Label className="mb-2">Agendamento</Label>
            <div className="flex h-10 items-center gap-2">
              <Switch checked={value.agendamento} onCheckedChange={(c) => set("agendamento", c)} />
              <span className="text-sm text-muted-foreground">{value.agendamento ? "Sim" : "Não"}</span>
            </div>
          </div>
        </div>

        <div>
          <Label>Observações</Label>
          <Textarea
            rows={3}
            value={value.observacoes}
            onChange={(e) => set("observacoes", e.target.value)}
            placeholder="Informações adicionais do pedido…"
          />
        </div>
      </CardContent>
    </Card>
  );
}
