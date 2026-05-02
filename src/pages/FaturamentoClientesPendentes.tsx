import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatCNPJ, formatDate } from "@/lib/format";
import { Loader2, UserPlus, Users } from "lucide-react";

type ClientePendente = {
  id: string;
  razao_social: string;
  cnpj: string;
  cidade: string | null;
  uf: string | null;
  vendedor_id: string | null;
  assumido_por: string | null;
  created_at: string;
};

export default function FaturamentoClientesPendentes() {
  const { user } = useAuth();
  const [clientes, setClientes] = useState<ClientePendente[]>([]);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [assumindo, setAssumindo] = useState<string | null>(null);

  const [cadastrarDialog, setCadastrarDialog] = useState<ClientePendente | null>(null);
  const [negativado, setNegativado] = useState(false);
  const [cadastrando, setCadastrando] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("clientes")
      .select("id, razao_social, cnpj, cidade, uf, vendedor_id, assumido_por, created_at")
      .eq("status", "pendente_cadastro")
      .order("created_at", { ascending: true });
    if (error) toast.error("Erro ao carregar clientes");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    else setClientes((data ?? []) as any[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    carregar();
    supabase.from("profiles").select("id, full_name, email").then(({ data }) => {
      if (!data) return;
      const map: Record<string, string> = {};
      data.forEach((p) => { map[p.id] = p.full_name || p.email; });
      setProfiles(map);
    });
  }, [carregar]);

  const assumir = async (c: ClientePendente) => {
    if (!user) return;
    setAssumindo(c.id);
    const { error } = await supabase
      .from("clientes")
      .update({ assumido_por: user.id })
      .eq("id", c.id);
    setAssumindo(null);
    if (error) { toast.error("Erro: " + error.message); return; }
    toast.success(`Você assumiu ${c.razao_social}`);
    carregar();
  };

  const confirmarCadastro = async () => {
    if (!cadastrarDialog) return;
    setCadastrando(true);
    const { error } = await supabase.from("clientes").update({
      status: "aguardando_trade",
      negativado,
    }).eq("id", cadastrarDialog.id);

    if (error) { toast.error("Erro: " + error.message); setCadastrando(false); return; }

    await supabase.from("notificacoes").insert({
      destinatario_role: "trade",
      mensagem: `${cadastrarDialog.razao_social} foi cadastrado no Sankhya e aguarda configuração de perfil`,
      tipo: "cliente_aguardando_trade",
    });

    toast.success(`${cadastrarDialog.razao_social} marcado como cadastrado no Sankhya`);
    setCadastrarDialog(null);
    setCadastrando(false);
    carregar();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Clientes para cadastrar</h1>
        <p className="text-sm text-muted-foreground">Clientes enviados pelos vendedores aguardando cadastro no Sankhya</p>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : clientes.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Users className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Nenhum cliente pendente de cadastro</p>
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
                <TableHead>Responsável</TableHead>
                <TableHead className="min-w-[220px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientes.map((c) => {
                const euAssumi = c.assumido_por === user?.id;
                const outroAssumiu = c.assumido_por && !euAssumi;
                return (
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
                      {c.assumido_por ? (
                        <Badge
                          variant="outline"
                          className={euAssumi
                            ? "border-green-400 bg-green-50 text-green-700"
                            : "border-blue-300 bg-blue-50 text-blue-700"
                          }
                        >
                          <UserPlus className="h-3 w-3 mr-1" />
                          {euAssumi ? "Você" : (profiles[c.assumido_por] ?? "—")}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">Livre</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2 flex-wrap">
                        {!c.assumido_por && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={assumindo === c.id}
                            onClick={() => assumir(c)}
                          >
                            {assumindo === c.id
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : "Assumir"
                            }
                          </Button>
                        )}
                        {outroAssumiu ? null : (
                          <Button
                            size="sm"
                            onClick={() => { setCadastrarDialog(c); setNegativado(false); }}
                          >
                            Marcar como cadastrado
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!cadastrarDialog} onOpenChange={(o) => !o && setCadastrarDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cadastrar no Sankhya</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Confirme que <strong>{cadastrarDialog?.razao_social}</strong> foi cadastrado no Sankhya.
              O trade será notificado para configurar perfil e tabela de preço.
            </p>
            <div className="flex items-center gap-3 rounded-md border px-4 py-3">
              <Switch checked={negativado} onCheckedChange={setNegativado} />
              <div>
                <div className="text-sm font-medium">Cliente negativado</div>
                <div className="text-xs text-muted-foreground">Apenas pagamento à vista disponível</div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCadastrarDialog(null)}>Cancelar</Button>
            <Button onClick={confirmarCadastro} disabled={cadastrando}>
              {cadastrando && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Confirmar cadastro
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
