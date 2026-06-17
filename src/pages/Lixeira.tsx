import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { formatBRL, formatCNPJ, formatDate } from "@/lib/format";
import { Trash2, RotateCcw, Loader2 } from "lucide-react";

const RETENCAO_DIAS = 30;
const RETENCAO_MS = RETENCAO_DIAS * 24 * 60 * 60 * 1000;

type Tabela = "pedidos" | "clientes" | "solicitacoes_gestor";

type PedidoLixo = {
  id: string;
  numero_pedido: number;
  total: number | null;
  vendedor_id: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  clientes: { razao_social: string | null; nome_parceiro: string | null } | null;
};

type ClienteLixo = {
  id: string;
  razao_social: string | null;
  nome_parceiro: string | null;
  cnpj: string | null;
  vendedor_id: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
};

type SolicitacaoLixo = {
  id: string;
  titulo: string | null;
  tipo: string | null;
  status: string | null;
  criado_por_nome: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
};

function expirado(deletedAt: string | null) {
  if (!deletedAt) return false;
  return new Date(deletedAt).getTime() < Date.now() - RETENCAO_MS;
}

export default function Lixeira() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const isAdmin = role === "admin";

  const [acaoLoading, setAcaoLoading] = useState<string | null>(null);
  const [apagarAlvo, setApagarAlvo] = useState<{ tabela: Tabela; id: string; label: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["lixeira"],
    queryFn: async () => {
      const [pedRes, cliRes, solRes] = await Promise.all([
        supabase
          .from("pedidos")
          .select("id, numero_pedido, total, vendedor_id, deleted_at, deleted_by, clientes(razao_social, nome_parceiro)")
          .not("deleted_at", "is", null)
          .order("deleted_at", { ascending: false }),
        supabase
          .from("clientes")
          .select("id, razao_social, nome_parceiro, cnpj, vendedor_id, deleted_at, deleted_by")
          .not("deleted_at", "is", null)
          .order("deleted_at", { ascending: false }),
        supabase
          .from("solicitacoes_gestor")
          .select("id, titulo, tipo, status, criado_por_nome, deleted_at, deleted_by")
          .not("deleted_at", "is", null)
          .order("deleted_at", { ascending: false }),
      ]);

      const pedidos = (pedRes.data ?? []) as unknown as PedidoLixo[];
      const clientes = (cliRes.data ?? []) as unknown as ClienteLixo[];
      const solicitacoes = (solRes.data ?? []) as unknown as SolicitacaoLixo[];

      // Resolve nomes (vendedor + quem deletou) via profiles
      const ids = new Set<string>();
      pedidos.forEach((p) => { if (p.vendedor_id) ids.add(p.vendedor_id); if (p.deleted_by) ids.add(p.deleted_by); });
      clientes.forEach((c) => { if (c.vendedor_id) ids.add(c.vendedor_id); if (c.deleted_by) ids.add(c.deleted_by); });
      solicitacoes.forEach((s) => { if (s.deleted_by) ids.add(s.deleted_by); });

      const nomes: Record<string, string> = {};
      if (ids.size > 0) {
        const profRes = await supabase.from("profiles").select("id, full_name, email").in("id", Array.from(ids));
        (profRes.data ?? []).forEach((p) => { nomes[p.id] = p.full_name || p.email || "—"; });
      }

      return { pedidos, clientes, solicitacoes, nomes };
    },
  });

  const nome = (id: string | null) => (id ? data?.nomes[id] ?? "—" : "—");

  async function restaurar(tabela: Tabela, id: string) {
    setAcaoLoading(id);
    const { error } = await supabase.from(tabela).update({ deleted_at: null, deleted_by: null }).eq("id", id);
    setAcaoLoading(null);
    if (error) { toast.error("Erro ao restaurar: " + error.message); return; }
    toast.success("Registro restaurado");
    qc.invalidateQueries({ queryKey: ["lixeira"] });
  }

  async function apagarDefinitivo() {
    if (!apagarAlvo) return;
    const { tabela, id } = apagarAlvo;
    setAcaoLoading(id);
    // Pedidos têm itens vinculados (FK) — remove os itens antes
    if (tabela === "pedidos") {
      await supabase.from("itens_pedido").delete().eq("pedido_id", id);
    }
    const { error } = await supabase.from(tabela).delete().eq("id", id);
    setAcaoLoading(null);
    setApagarAlvo(null);
    if (error) { toast.error("Erro ao apagar: " + error.message); return; }
    toast.success("Apagado definitivamente");
    qc.invalidateQueries({ queryKey: ["lixeira"] });
  }

  function Acoes({ tabela, id, label }: { tabela: Tabela; id: string; label: string }) {
    const loading = acaoLoading === id;
    return (
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" disabled={loading} onClick={() => restaurar(tabela, id)}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
          <span className="ml-1.5 hidden sm:inline">Restaurar</span>
        </Button>
        {isAdmin && (
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:bg-destructive/10"
            disabled={loading}
            onClick={() => setApagarAlvo({ tabela, id, label })}
          >
            <Trash2 className="h-4 w-4" />
            <span className="ml-1.5 hidden sm:inline">Apagar</span>
          </Button>
        )}
      </div>
    );
  }

  function DeletadoEm({ deletedAt }: { deletedAt: string | null }) {
    return (
      <div className="flex items-center gap-2">
        <span>{deletedAt ? formatDate(deletedAt) : "—"}</span>
        {expirado(deletedAt) && (
          <Badge variant="destructive" className="text-[10px]">+{RETENCAO_DIAS}d · será apagado</Badge>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex items-center gap-3">
        <Trash2 className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-semibold">Lixeira</h1>
          <p className="text-sm text-muted-foreground">
            Registros excluídos são apagados automaticamente após {RETENCAO_DIAS} dias.
          </p>
        </div>
      </div>

      <Tabs defaultValue="pedidos">
        <TabsList>
          <TabsTrigger value="pedidos">
            Pedidos {data?.pedidos.length ? `(${data.pedidos.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="clientes">
            Clientes {data?.clientes.length ? `(${data.clientes.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="solicitacoes">
            Solicitações {data?.solicitacoes.length ? `(${data.solicitacoes.length})` : ""}
          </TabsTrigger>
        </TabsList>

        {/* ── Pedidos ───────────────────────────────────────────── */}
        <TabsContent value="pedidos">
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : !data?.pedidos.length ? (
                <p className="p-10 text-center text-sm text-muted-foreground">Nenhum pedido na lixeira.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nº Pedido</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Vendedor</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Deletado em</TableHead>
                      <TableHead>Deletado por</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.pedidos.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">#{p.numero_pedido}</TableCell>
                        <TableCell>{p.clientes?.nome_parceiro || p.clientes?.razao_social || "—"}</TableCell>
                        <TableCell>{nome(p.vendedor_id)}</TableCell>
                        <TableCell>{formatBRL(p.total ?? 0)}</TableCell>
                        <TableCell><DeletadoEm deletedAt={p.deleted_at} /></TableCell>
                        <TableCell>{nome(p.deleted_by)}</TableCell>
                        <TableCell><Acoes tabela="pedidos" id={p.id} label={`pedido #${p.numero_pedido}`} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Clientes ──────────────────────────────────────────── */}
        <TabsContent value="clientes">
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : !data?.clientes.length ? (
                <p className="p-10 text-center text-sm text-muted-foreground">Nenhum cliente na lixeira.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Razão Social</TableHead>
                      <TableHead>CNPJ</TableHead>
                      <TableHead>Vendedor</TableHead>
                      <TableHead>Deletado em</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.clientes.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.nome_parceiro || c.razao_social || "—"}</TableCell>
                        <TableCell>{c.cnpj ? formatCNPJ(c.cnpj) : "—"}</TableCell>
                        <TableCell>{nome(c.vendedor_id)}</TableCell>
                        <TableCell><DeletadoEm deletedAt={c.deleted_at} /></TableCell>
                        <TableCell><Acoes tabela="clientes" id={c.id} label={c.razao_social || "cliente"} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Solicitações ──────────────────────────────────────── */}
        <TabsContent value="solicitacoes">
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : !data?.solicitacoes.length ? (
                <p className="p-10 text-center text-sm text-muted-foreground">Nenhuma solicitação na lixeira.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Título</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Criado por</TableHead>
                      <TableHead>Deletado em</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.solicitacoes.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.titulo || "—"}</TableCell>
                        <TableCell>{s.tipo || "—"}</TableCell>
                        <TableCell>{s.status || "—"}</TableCell>
                        <TableCell>{s.criado_por_nome || "—"}</TableCell>
                        <TableCell><DeletadoEm deletedAt={s.deleted_at} /></TableCell>
                        <TableCell><Acoes tabela="solicitacoes_gestor" id={s.id} label={s.titulo || "solicitação"} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!apagarAlvo} onOpenChange={(o) => { if (!o) setApagarAlvo(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar definitivamente?</AlertDialogTitle>
            <AlertDialogDescription>
              {apagarAlvo ? `"${apagarAlvo.label}" será removido permanentemente. Esta ação não pode ser desfeita.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={apagarDefinitivo}
            >
              Apagar definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
