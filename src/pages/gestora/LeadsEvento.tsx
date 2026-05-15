import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Users, Clock, CheckCircle2 } from "lucide-react";

type Lead = {
  id: string;
  razao_social: string | null;
  nome_fantasia: string | null;
  cnpj: string | null;
  contato_nome: string | null;
  telefone: string | null;
  email: string | null;
  cidade: string | null;
  uf: string | null;
  areas_atuacao: string[] | null;
  marcas_interesse: string[] | null;
  produtos_interesse: string[] | null;
  observacoes: string | null;
  origem: string;
  status: string;
  created_at: string;
};

type Vendedor = { id: string; full_name: string | null };
type Counts = { total: number; novos: number; convertidos: number };
type Filtro = "todos" | "formulario" | "qr_rapido";

export default function LeadsEvento() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [counts, setCounts] = useState<Counts>({ total: 0, novos: 0, convertidos: 0 });
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [dialogLead, setDialogLead] = useState<Lead | null>(null);
  const [vendedorId, setVendedorId] = useState("");
  const [directing, setDirecting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    await Promise.all([fetchLeads(), fetchCounts(), fetchVendedores()]);
    setLoading(false);
  }

  async function fetchLeads() {
    const { data } = await (supabase as any)
      .from("leads_evento")
      .select("*")
      .eq("status", "novo")
      .order("created_at", { ascending: false });
    setLeads(data ?? []);
  }

  async function fetchCounts() {
    const [total, novos, convertidos] = await Promise.all([
      (supabase as any)
        .from("leads_evento")
        .select("id", { count: "exact", head: true }),
      (supabase as any)
        .from("leads_evento")
        .select("id", { count: "exact", head: true })
        .eq("status", "novo"),
      (supabase as any)
        .from("leads_evento")
        .select("id", { count: "exact", head: true })
        .in("status", ["direcionado", "convertido"]),
    ]);
    setCounts({
      total: total.count ?? 0,
      novos: novos.count ?? 0,
      convertidos: convertidos.count ?? 0,
    });
  }

  async function fetchVendedores() {
    const { data: roleData } = await (supabase as any)
      .from("user_roles")
      .select("user_id")
      .eq("role", "vendedor");

    if (!roleData?.length) return;

    const ids = roleData.map((r: { user_id: string }) => r.user_id);
    const { data: profileData } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", ids);

    setVendedores(profileData ?? []);
  }

  async function handleDirecionar() {
    if (!dialogLead || !vendedorId) return;
    setDirecting(true);

    const { data: clienteData, error: clienteError } = await supabase
      .from("clientes")
      .insert({
        razao_social: dialogLead.razao_social || dialogLead.contato_nome || "Sem nome",
        cnpj: dialogLead.cnpj ?? null,
        comprador: dialogLead.contato_nome ?? null,
        telefone: dialogLead.telefone ?? null,
        email: dialogLead.email ?? null,
        cidade: dialogLead.cidade ?? null,
        uf: dialogLead.uf ?? null,
        vendedor_id: vendedorId,
        status: "ativo",
        canal: dialogLead.areas_atuacao?.[0] ?? null,
      })
      .select("id")
      .single();

    if (clienteError || !clienteData) {
      toast.error("Erro ao cadastrar cliente.");
      setDirecting(false);
      return;
    }

    const { error: leadError } = await (supabase as any)
      .from("leads_evento")
      .update({
        status: "direcionado",
        vendedor_atribuido_id: vendedorId,
        cliente_id: clienteData.id,
      })
      .eq("id", dialogLead.id);

    setDirecting(false);

    if (leadError) {
      toast.error("Erro ao atualizar lead.");
      return;
    }

    setLeads((prev) => prev.filter((l) => l.id !== dialogLead.id));
    setCounts((prev) => ({
      ...prev,
      novos: Math.max(0, prev.novos - 1),
      convertidos: prev.convertidos + 1,
    }));
    setDialogLead(null);
    setVendedorId("");
    toast.success("Lead direcionado com sucesso!");
  }

  function openDialog(lead: Lead) {
    setDialogLead(lead);
    setVendedorId("");
  }

  function closeDialog() {
    setDialogLead(null);
    setVendedorId("");
  }

  const filteredLeads =
    filtro === "todos"
      ? leads
      : leads.filter((l) =>
          l.origem === (filtro === "formulario" ? "formulario" : "qr_rapido")
        );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Leads do Evento</h1>
        <p className="text-sm text-gray-500 mt-1">
          Gerencie e direcione os contatos captados no evento.
        </p>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              Total captados
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            <p className="text-3xl font-bold text-gray-800">{counts.total}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Aguardando direcionamento
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            <p className="text-3xl font-bold text-red-600">{counts.novos}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Direcionados / convertidos
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            <p className="text-3xl font-bold text-green-600">{counts.convertidos}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        {(["todos", "formulario", "qr_rapido"] as Filtro[]).map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${
              filtro === f
                ? "bg-[#1a6b3a] text-white border-transparent"
                : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
            }`}
          >
            {f === "todos" ? "Todos" : f === "formulario" ? "Formulário" : "QR rápido"}
          </button>
        ))}
      </div>

      {/* Tabela */}
      {loading ? (
        <p className="text-sm text-gray-400 py-8 text-center">Carregando...</p>
      ) : filteredLeads.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-gray-200" />
          <p className="font-medium">Nenhum lead aguardando direcionamento</p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-100 shadow-sm overflow-hidden bg-white">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50 hover:bg-gray-50">
                <TableHead className="font-semibold">Empresa</TableHead>
                <TableHead className="font-semibold">Contato</TableHead>
                <TableHead className="font-semibold">Telefone</TableHead>
                <TableHead className="font-semibold">Marcas de interesse</TableHead>
                <TableHead className="font-semibold">Área de atuação</TableHead>
                <TableHead className="font-semibold">Origem</TableHead>
                <TableHead className="text-right font-semibold">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLeads.map((lead) => (
                <TableRow key={lead.id} className="hover:bg-gray-50/50">
                  <TableCell>
                    <p className="font-medium text-gray-800">
                      {lead.nome_fantasia || lead.razao_social || "—"}
                    </p>
                    {lead.nome_fantasia && lead.razao_social && (
                      <p className="text-xs text-gray-400 mt-0.5">{lead.razao_social}</p>
                    )}
                  </TableCell>
                  <TableCell className="text-gray-700">
                    {lead.contato_nome || "—"}
                  </TableCell>
                  <TableCell className="text-gray-700">
                    {lead.telefone || "—"}
                  </TableCell>
                  <TableCell>
                    {lead.marcas_interesse?.length ? (
                      <div className="flex flex-wrap gap-1">
                        {lead.marcas_interesse.map((m) => (
                          <Badge
                            key={m}
                            variant="outline"
                            className="capitalize text-xs"
                          >
                            {m}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {lead.areas_atuacao?.length ? (
                      <div className="flex flex-wrap gap-1">
                        {lead.areas_atuacao.map((a) => (
                          <Badge
                            key={a}
                            variant="secondary"
                            className="capitalize text-xs"
                          >
                            {a.replace(/_/g, " ")}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {lead.origem === "formulario" ? (
                      <Badge className="bg-green-100 text-green-800 border border-green-300 hover:bg-green-100">
                        Formulário
                      </Badge>
                    ) : (
                      <Badge className="bg-blue-100 text-blue-800 border border-blue-300 hover:bg-blue-100">
                        QR rápido
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      onClick={() => openDialog(lead)}
                      className="bg-[#1a6b3a] text-white hover:opacity-90"
                    >
                      Direcionar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Dialog de direcionamento */}
      <Dialog open={!!dialogLead} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Direcionar lead</DialogTitle>
          </DialogHeader>

          {dialogLead && (
            <div className="space-y-5">
              {/* Dados do lead em leitura */}
              <div className="rounded-lg bg-gray-50 border border-gray-100 p-4 space-y-2 text-sm">
                <InfoRow
                  label="Empresa"
                  value={dialogLead.nome_fantasia || dialogLead.razao_social}
                />
                {dialogLead.nome_fantasia && (
                  <InfoRow label="Razão social" value={dialogLead.razao_social} />
                )}
                <InfoRow label="Contato" value={dialogLead.contato_nome} />
                <InfoRow label="Telefone" value={dialogLead.telefone} />
                <InfoRow label="E-mail" value={dialogLead.email} />
                <InfoRow
                  label="Cidade / UF"
                  value={
                    [dialogLead.cidade, dialogLead.uf].filter(Boolean).join(" / ") ||
                    null
                  }
                />

                {!!dialogLead.marcas_interesse?.length && (
                  <div className="flex gap-2 flex-wrap items-start">
                    <span className="text-gray-500 w-28 shrink-0">Marcas:</span>
                    <div className="flex flex-wrap gap-1">
                      {dialogLead.marcas_interesse.map((m) => (
                        <Badge key={m} variant="outline" className="capitalize text-xs">
                          {m}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {!!dialogLead.areas_atuacao?.length && (
                  <div className="flex gap-2 flex-wrap items-start">
                    <span className="text-gray-500 w-28 shrink-0">Áreas:</span>
                    <div className="flex flex-wrap gap-1">
                      {dialogLead.areas_atuacao.map((a) => (
                        <Badge key={a} variant="secondary" className="capitalize text-xs">
                          {a.replace(/_/g, " ")}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {!!dialogLead.produtos_interesse?.length && (
                  <div>
                    <span className="text-gray-500">Produtos:</span>
                    <ul className="mt-1 ml-4 list-disc space-y-0.5">
                      {dialogLead.produtos_interesse.map((p) => (
                        <li key={p} className="text-xs text-gray-700">
                          {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {dialogLead.observacoes && (
                  <InfoRow label="Observações" value={dialogLead.observacoes} />
                )}
              </div>

              {/* Seletor de vendedor */}
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">
                  Atribuir para o vendedor *
                </label>
                <Select value={vendedorId} onValueChange={setVendedorId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um vendedor" />
                  </SelectTrigger>
                  <SelectContent>
                    {vendedores.length === 0 ? (
                      <SelectItem value="_empty" disabled>
                        Nenhum vendedor encontrado
                      </SelectItem>
                    ) : (
                      vendedores.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.full_name ?? "Vendedor sem nome"}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={closeDialog}>
              Cancelar
            </Button>
            <Button
              disabled={!vendedorId || directing}
              onClick={handleDirecionar}
              className="bg-[#1a6b3a] text-white hover:opacity-90"
            >
              {directing ? "Cadastrando..." : "Cadastrar e direcionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  if (!value) return null;
  return (
    <div className="flex gap-2">
      <span className="text-gray-500 w-28 shrink-0">{label}:</span>
      <span className="text-gray-800 break-all">{value}</span>
    </div>
  );
}
