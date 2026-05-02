import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { formatCNPJ, formatDate } from "@/lib/format";
import { TABELAS_PRECO, PERFIS_CLIENTE } from "@/lib/constants";
import { Loader2, Users } from "lucide-react";

type ClientePendente = {
  id: string;
  razao_social: string;
  cnpj: string;
  cidade: string | null;
  uf: string | null;
  vendedor_id: string | null;
  created_at: string;
};

type Campanha = { id: string; nome: string };

export default function Trade() {
  const [clientes, setClientes] = useState<ClientePendente[]>([]);
  const [loading, setLoading] = useState(true);
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});

  const [modalCliente, setModalCliente] = useState<ClientePendente | null>(null);
  const [perfil, setPerfil] = useState("");
  const [tabela, setTabela] = useState("");
  const [desconto, setDesconto] = useState("");
  const [campanhaId, setCampanhaId] = useState("nenhuma");
  const [observacoes, setObservacoes] = useState("");
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("clientes")
      .select("id, razao_social, cnpj, cidade, uf, vendedor_id, created_at")
      .eq("status", "aguardando_trade")
      .order("created_at", { ascending: true });
    if (error) toast.error("Erro ao carregar clientes");
    else setClientes((data ?? []) as ClientePendente[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    carregar();
    supabase.from("campanhas").select("id, nome").eq("ativa", true).then(({ data }) => {
      setCampanhas((data ?? []) as Campanha[]);
    });
    supabase.from("profiles").select("id, full_name, email").then(({ data }) => {
      if (!data) return;
      const map: Record<string, string> = {};
      data.forEach((p) => { map[p.id] = p.full_name || p.email; });
      setProfiles(map);
    });
  }, [carregar]);

  const abrirModal = (c: ClientePendente) => {
    setModalCliente(c);
    setPerfil("");
    setTabela("");
    setDesconto("");
    setCampanhaId("nenhuma");
    setObservacoes("");
  };

  const confirmar = async () => {
    if (!modalCliente || !perfil || !tabela) {
      toast.error("Preencha perfil e tabela de preço");
      return;
    }
    setSalvando(true);
    const { error } = await supabase.from("clientes").update({
      status: "ativo",
      perfil_cliente: perfil,
      tabela_preco: tabela,
      desconto_adicional: desconto ? Number(desconto) : null,
      campanha_id: campanhaId !== "nenhuma" ? campanhaId : null,
      observacoes_trade: observacoes.trim() || null,
    }).eq("id", modalCliente.id);

    if (error) { toast.error("Erro: " + error.message); setSalvando(false); return; }

    if (modalCliente.vendedor_id) {
      await supabase.from("notificacoes").insert({
        destinatario_id: modalCliente.vendedor_id,
        destinatario_role: "vendedor",
        mensagem: `${modalCliente.razao_social} foi ativado e já pode receber pedidos`,
        tipo: "cliente_ativo",
      });
    }

    toast.success(`${modalCliente.razao_social} ativado!`);
    setModalCliente(null);
    setSalvando(false);
    carregar();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Trade — Clientes aguardando</h1>
        <p className="text-sm text-muted-foreground">Configure perfil e tabela de preço para novos clientes</p>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : clientes.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Users className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Nenhum cliente aguardando configuração</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead>Cidade / UF</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead>Data envio</TableHead>
                <TableHead className="w-28">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientes.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.razao_social}</TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">
                    {formatCNPJ(c.cnpj)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {[c.cidade, c.uf].filter(Boolean).join(" / ") || "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {c.vendedor_id ? (profiles[c.vendedor_id] ?? "—") : "—"}
                  </TableCell>
                  <TableCell className="text-sm">{formatDate(c.created_at)}</TableCell>
                  <TableCell>
                    <Button size="sm" onClick={() => abrirModal(c)}>Configurar</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!modalCliente} onOpenChange={(o) => !o && setModalCliente(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Configurar — {modalCliente?.razao_social}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Perfil do cliente *</Label>
                <Select value={perfil} onValueChange={setPerfil}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {PERFIS_CLIENTE.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Tabela de preço *</Label>
                <Select value={tabela} onValueChange={setTabela}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {TABELAS_PRECO.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Desconto adicional (%)</Label>
                <Input type="number" min={0} max={100} step={0.5}
                  value={desconto} onChange={(e) => setDesconto(e.target.value)}
                  placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label>Campanha ativa</Label>
                <Select value={campanhaId} onValueChange={setCampanhaId}>
                  <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhuma">Nenhuma</SelectItem>
                    {campanhas.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea rows={3} value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Informações adicionais…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalCliente(null)}>Cancelar</Button>
            <Button onClick={confirmar} disabled={salvando || !perfil || !tabela}>
              {salvando && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Ativar cliente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
