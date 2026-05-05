import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatCNPJ, formatDate } from "@/lib/format";
import { CLUSTERS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

type Cadastro = {
  id: string;
  nome_cliente: string | null;
  cnpj: string | null;
  razao_social: string | null;
  contato_principal: string | null;
  email: string | null;
  telefone: string | null;
  classificacao: string | null;
  qtd_vendedores: number | null;
  perfil_atacado_distribuidor: string | null;
  qtd_lojas: string | null;
  marcas_interesse: string[] | null;
  produtos_alivik: string[] | null;
  produtos_bravir: string[] | null;
  produtos_bendita: string[] | null;
  produtos_laby: string[] | null;
  vende_digital: boolean | null;
  tem_ecommerce: boolean | null;
  canal_ecommerce: string | null;
  percentual_b2c: number | null;
  percentual_b2b: number | null;
  status: string;
  origem: string;
  vendedor_id: string | null;
  vendedor_nome: string | null;
  cluster_sugerido: string | null;
  observacoes: string | null;
  negativado: boolean | null;
  motivo_reprovacao: string | null;
  created_at: string;
};

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pendente: { label: "Pendente", variant: "secondary" },
  aprovado: { label: "Aprovado", variant: "default" },
  reprovado: { label: "Reprovado", variant: "destructive" },
};

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value && value !== 0 && value !== false) return null;
  return (
    <div className="flex gap-2 text-sm">
      <span className="font-medium text-muted-foreground min-w-40">{label}:</span>
      <span>{value}</span>
    </div>
  );
}

export default function FilaCadastros() {
  const [cadastros, setCadastros] = useState<Cadastro[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Cadastro | null>(null);
  const [clusterEdit, setClusterEdit] = useState("");
  const [negativadoEdit, setNegativadoEdit] = useState(false);
  const [showReprovar, setShowReprovar] = useState(false);
  const [motivoReprovacao, setMotivoReprovacao] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase.from("cadastros_pendentes") as any)
      .select("*")
      .order("created_at", { ascending: false });
    setCadastros((data ?? []) as Cadastro[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openDialog = (c: Cadastro) => {
    setSelected(c);
    setClusterEdit(c.cluster_sugerido ?? "");
    setNegativadoEdit(c.negativado ?? false);
    setMotivoReprovacao("");
  };

  const handleAprovar = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const { error: upErr } = await (supabase.from("cadastros_pendentes") as any)
        .update({ status: "aprovado", cluster_sugerido: clusterEdit || null, negativado: negativadoEdit })
        .eq("id", selected.id);
      if (upErr) throw upErr;

      const { error: insErr } = await supabase.from("clientes").insert({
        razao_social: selected.razao_social ?? selected.nome_cliente ?? "Sem nome",
        cnpj: selected.cnpj ?? "00000000000000",
        email: selected.email ?? null,
        telefone: selected.telefone ?? null,
        cluster: clusterEdit || null,
        negativado: negativadoEdit,
        vendedor_id: selected.vendedor_id ?? null,
      } as any);
      if (insErr) throw insErr;

      toast.success("Cadastro aprovado e cliente criado!");
      setSelected(null);
      load();
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao aprovar.");
    } finally {
      setSaving(false);
    }
  };

  const handleReprovar = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const { error } = await (supabase.from("cadastros_pendentes") as any)
        .update({
          status: "reprovado",
          motivo_reprovacao: motivoReprovacao || null,
          cluster_sugerido: clusterEdit || null,
          negativado: negativadoEdit,
        })
        .eq("id", selected.id);
      if (error) throw error;
      toast.success("Cadastro reprovado.");
      setShowReprovar(false);
      setSelected(null);
      load();
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao reprovar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Fila de Cadastros</h1>

      {loading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : cadastros.length === 0 ? (
        <p className="text-muted-foreground">Nenhum cadastro encontrado.</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Nome do cliente</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cadastros.map((c) => {
                const st = STATUS_BADGE[c.status] ?? { label: c.status, variant: "outline" as const };
                return (
                  <TableRow key={c.id}>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(c.created_at.slice(0, 10))}</TableCell>
                    <TableCell className="font-medium">{c.nome_cliente ?? c.razao_social ?? "—"}</TableCell>
                    <TableCell className="text-sm">{c.cnpj ? formatCNPJ(c.cnpj) : "—"}</TableCell>
                    <TableCell>
                      {c.origem === "vendedor" ? (
                        <Badge variant="outline" className="border-green-400 bg-green-50 text-green-700">Vendedor</Badge>
                      ) : (
                        <Badge variant="outline" className="border-blue-400 bg-blue-50 text-blue-700">Site</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{c.vendedor_nome ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={st.variant}>{st.label}</Badge>
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => openDialog(c)}>
                        Ver detalhes
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Dialog de detalhes */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.nome_cliente ?? selected.razao_social ?? "Cadastro"}</DialogTitle>
              </DialogHeader>

              <div className="space-y-5 py-2">
                {/* Dados básicos */}
                <div>
                  <h3 className="font-semibold mb-2">Dados básicos</h3>
                  <div className="space-y-1">
                    <InfoRow label="Nome fantasia" value={selected.nome_cliente} />
                    <InfoRow label="Razão social" value={selected.razao_social} />
                    <InfoRow label="CNPJ" value={selected.cnpj ? formatCNPJ(selected.cnpj) : null} />
                    <InfoRow label="Contato" value={selected.contato_principal} />
                    <InfoRow label="E-mail" value={selected.email} />
                    <InfoRow label="Telefone" value={selected.telefone} />
                  </div>
                </div>

                {/* Classificação */}
                <div>
                  <h3 className="font-semibold mb-2">Classificação</h3>
                  <div className="space-y-1">
                    <InfoRow label="Tipo" value={selected.classificacao} />
                    {selected.qtd_vendedores != null && (
                      <InfoRow label="Qtd. vendedores" value={selected.qtd_vendedores} />
                    )}
                    {selected.perfil_atacado_distribuidor && (
                      <InfoRow label="Perfil" value={selected.perfil_atacado_distribuidor} />
                    )}
                    {selected.qtd_lojas && (
                      <InfoRow label="Qtd. lojas" value={selected.qtd_lojas} />
                    )}
                    {selected.marcas_interesse && selected.marcas_interesse.length > 0 && (
                      <InfoRow label="Marcas de interesse" value={selected.marcas_interesse.join(", ")} />
                    )}
                    {selected.produtos_alivik && selected.produtos_alivik.length > 0 && (
                      <InfoRow label="Produtos Alivik" value={selected.produtos_alivik.join(", ")} />
                    )}
                    {selected.produtos_bravir && selected.produtos_bravir.length > 0 && (
                      <InfoRow label="Produtos Bravir" value={selected.produtos_bravir.join(", ")} />
                    )}
                    {selected.produtos_bendita && selected.produtos_bendita.length > 0 && (
                      <InfoRow label="Produtos Bendita" value={selected.produtos_bendita.join(", ")} />
                    )}
                    {selected.produtos_laby && selected.produtos_laby.length > 0 && (
                      <InfoRow label="Produtos Laby" value={selected.produtos_laby.join(", ")} />
                    )}
                  </div>
                </div>

                {/* Digital */}
                <div>
                  <h3 className="font-semibold mb-2">Canais digitais</h3>
                  <div className="space-y-1">
                    <InfoRow label="Vende digital" value={selected.vende_digital ? "Sim" : "Não"} />
                    {selected.vende_digital && (
                      <>
                        <InfoRow label="Tem e-commerce" value={selected.tem_ecommerce ? "Sim" : "Não"} />
                        {selected.canal_ecommerce && (
                          <InfoRow label="Canal e-commerce" value={selected.canal_ecommerce} />
                        )}
                        {selected.percentual_b2c != null && (
                          <InfoRow label="% B2C" value={`${selected.percentual_b2c}%`} />
                        )}
                        {selected.percentual_b2b != null && (
                          <InfoRow label="% B2B" value={`${selected.percentual_b2b}%`} />
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Info comercial */}
                <div>
                  <h3 className="font-semibold mb-2">Informações comerciais</h3>
                  <div className="space-y-1">
                    {selected.observacoes && (
                      <InfoRow label="Observações" value={selected.observacoes} />
                    )}
                    {selected.motivo_reprovacao && (
                      <InfoRow label="Motivo reprovação" value={selected.motivo_reprovacao} />
                    )}
                  </div>
                </div>

                {/* Ações da gestora */}
                {selected.status === "pendente" && (
                  <div className="space-y-4 border-t pt-4">
                    <h3 className="font-semibold">Análise da gestora</h3>

                    <div className="space-y-1.5">
                      <Label>Cluster</Label>
                      <Select value={clusterEdit} onValueChange={setClusterEdit}>
                        <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                          {CLUSTERS.map((c) => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center gap-3">
                      <Switch checked={negativadoEdit} onCheckedChange={setNegativadoEdit} />
                      <Label>Marcar como negativado</Label>
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter className="gap-2 flex-wrap">
                <Button variant="outline" onClick={() => setSelected(null)}>Fechar</Button>
                {selected.status === "pendente" && (
                  <>
                    <Button
                      variant="destructive"
                      onClick={() => setShowReprovar(true)}
                      disabled={saving}
                    >
                      Reprovar
                    </Button>
                    <Button onClick={handleAprovar} disabled={saving}>
                      {saving ? "Salvando..." : "Aprovar"}
                    </Button>
                  </>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* AlertDialog de reprovação */}
      <AlertDialog open={showReprovar} onOpenChange={setShowReprovar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reprovar cadastro</AlertDialogTitle>
            <AlertDialogDescription>
              Informe o motivo da reprovação (opcional). O vendedor poderá ver esta informação.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            rows={3}
            value={motivoReprovacao}
            onChange={(e) => setMotivoReprovacao(e.target.value)}
            placeholder="Ex: cliente já está cadastrado, CNPJ inativo..."
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleReprovar} disabled={saving}>
              Confirmar reprovação
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
