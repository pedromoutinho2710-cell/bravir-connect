import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { formatCNPJ, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, ArrowLeft, RotateCcw, UserCheck } from "lucide-react";
import { toast } from "sonner";

type ClienteInativo = {
  id: string;
  razao_social: string;
  nome_parceiro: string | null;
  cnpj: string;
  inativado_em: string | null;
  vendedor_id: string | null;
  vendedor_nome: string | null;
};

type Vendedor = { id: string; nome: string };

export default function ClientesInativados() {
  const navigate = useNavigate();
  const [clientes, setClientes] = useState<ClienteInativo[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [reativando, setReativando] = useState<string | null>(null);
  const [reatribuirId, setReatribuirId] = useState<string | null>(null);
  const [novoVendedorId, setNovoVendedorId] = useState("");
  const [salvandoReatribuir, setSalvandoReatribuir] = useState(false);

  const carregar = async () => {
    setLoading(true);
    const [clRes, vendRes] = await Promise.all([
      supabase
        .from("clientes")
        .select("id, razao_social, nome_parceiro, cnpj, inativado_em, vendedor_id")
        .eq("ativo", false)
        .is("deleted_at", null)
        .order("inativado_em", { ascending: false }),
      supabase
        .from("profiles")
        .select("id, full_name"),
    ]);

    const profs: Record<string, string> = {};
    (vendRes.data ?? []).forEach((p: any) => { profs[p.id] = p.full_name; });

    setClientes(
      (clRes.data ?? []).map((c: any) => ({
        ...c,
        vendedor_nome: c.vendedor_id ? profs[c.vendedor_id] ?? null : null,
      }))
    );
    setVendedores((vendRes.data ?? []).map((p: any) => ({ id: p.id, nome: p.full_name })));
    setLoading(false);
  };

  useEffect(() => { carregar(); }, []);

  const reativar = async (clienteId: string) => {
    setReativando(clienteId);
    const { error } = await supabase
      .from("clientes")
      .update({ ativo: true, inativado_em: null, inativado_por: null } as any)
      .eq("id", clienteId);
    setReativando(null);
    if (error) { toast.error("Erro ao reativar: " + error.message); return; }
    toast.success("Cliente reativado");
    setClientes((prev) => prev.filter((c) => c.id !== clienteId));
  };

  const salvarReatribuir = async () => {
    if (!reatribuirId || !novoVendedorId) return;
    setSalvandoReatribuir(true);
    const { error } = await supabase
      .from("clientes")
      .update({ ativo: true, inativado_em: null, inativado_por: null, vendedor_id: novoVendedorId } as any)
      .eq("id", reatribuirId);
    setSalvandoReatribuir(false);
    if (error) { toast.error("Erro ao reatribuir: " + error.message); return; }
    toast.success("Cliente reatribuído e reativado");
    setReatribuirId(null);
    setNovoVendedorId("");
    setClientes((prev) => prev.filter((c) => c.id !== reatribuirId));
  };

  const clienteReatribuir = clientes.find((c) => c.id === reatribuirId);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Clientes Inativados</h1>
          <p className="text-sm text-muted-foreground">Clientes removidos das carteiras pelos vendedores</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {loading ? "Carregando..." : `${clientes.length} cliente${clientes.length !== 1 ? "s" : ""} inativado${clientes.length !== 1 ? "s" : ""}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : clientes.length === 0 ? (
            <p className="py-10 text-center text-muted-foreground text-sm">Nenhum cliente inativado no momento</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>CNPJ</TableHead>
                    <TableHead>Vendedor</TableHead>
                    <TableHead>Inativado em</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientes.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <button
                          className="text-left font-medium hover:underline"
                          onClick={() => navigate(`/cliente/${c.id}`)}
                        >
                          {c.nome_parceiro || c.razao_social}
                        </button>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{formatCNPJ(c.cnpj)}</TableCell>
                      <TableCell>{c.vendedor_nome ?? "—"}</TableCell>
                      <TableCell>{c.inativado_em ? formatDate(c.inativado_em) : "—"}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={reativando === c.id}
                            onClick={() => reativar(c.id)}
                            className="gap-1.5"
                          >
                            {reativando === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                            Reativar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { setReatribuirId(c.id); setNovoVendedorId(""); }}
                            className="gap-1.5"
                          >
                            <UserCheck className="h-3.5 w-3.5" />
                            Reatribuir
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog: reatribuir vendedor */}
      <Dialog open={!!reatribuirId} onOpenChange={(o) => !o && setReatribuirId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reatribuir cliente</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Selecione o novo vendedor para <strong>{clienteReatribuir?.nome_parceiro || clienteReatribuir?.razao_social}</strong>. O cliente será reativado automaticamente.
          </p>
          <Select value={novoVendedorId} onValueChange={setNovoVendedorId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione o vendedor..." />
            </SelectTrigger>
            <SelectContent>
              {vendedores.map((v) => (
                <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReatribuirId(null)}>Cancelar</Button>
            <Button onClick={salvarReatribuir} disabled={!novoVendedorId || salvandoReatribuir}>
              {salvandoReatribuir && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Reatribuir e reativar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
