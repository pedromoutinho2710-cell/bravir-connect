import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, History } from "lucide-react";
import { toast } from "sonner";

type AcaoLinha = {
  id: string;
  pedido_id: string;
  numero_pedido: number | null;
  cliente_nome: string | null;
  status_anterior: string | null;
  status_novo: string | null;
  acao: string | null;
  motivo: string | null;
  usuario_nome: string | null;
  usuario_email: string | null;
  created_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  aguardando_faturamento: "Ag. Faturamento",
  em_faturamento: "Em Faturamento",
  faturado: "Faturado",
  cancelado: "Cancelado",
  devolvido: "Devolvido",
  no_sankhya: "No Sankhya",
  liberado_envio: "Liberado p/ Envio",
  em_transito: "Em Trânsito",
  entregue: "Entregue",
  sem_estoque: "Sem Estoque",
  pendente_sankhya: "Pendente Sankhya",
};

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground">
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export default function HistoricoAcoes() {
  const [acoes, setAcoes] = useState<AcaoLinha[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroUsuario, setFiltroUsuario] = useState("todos");
  const [filtroAcao, setFiltroAcao] = useState("todos");
  const [filtroData, setFiltroData] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from("historico_status")
        .select(`
          id, pedido_id, status_anterior, status_novo, acao, motivo:observacao,
          usuario_nome, usuario_email, created_at,
          pedidos(numero_pedido, clientes(razao_social, nome_parceiro))
        `)
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) { toast.error("Erro ao carregar histórico"); setLoading(false); return; }

      setAcoes(
        (data ?? []).map((r: any) => ({
          id: r.id,
          pedido_id: r.pedido_id,
          numero_pedido: r.pedidos?.numero_pedido ?? null,
          cliente_nome: r.pedidos?.clientes?.nome_parceiro || r.pedidos?.clientes?.razao_social || null,
          status_anterior: r.status_anterior,
          status_novo: r.status_novo,
          acao: r.acao,
          motivo: r.motivo,
          usuario_nome: r.usuario_nome,
          usuario_email: r.usuario_email,
          created_at: r.created_at,
        }))
      );
      setLoading(false);
    })();
  }, []);

  const usuarios = useMemo(() => [...new Set(acoes.map((a) => a.usuario_nome).filter(Boolean))].sort(), [acoes]);
  const tiposAcao = useMemo(() => [...new Set(acoes.map((a) => a.acao).filter(Boolean))].sort(), [acoes]);

  const filtradas = useMemo(() => {
    let res = acoes;
    if (busca.trim()) {
      const t = busca.toLowerCase();
      res = res.filter((a) =>
        (a.cliente_nome ?? "").toLowerCase().includes(t) ||
        (a.usuario_nome ?? "").toLowerCase().includes(t) ||
        String(a.numero_pedido ?? "").includes(t) ||
        (a.acao ?? "").toLowerCase().includes(t)
      );
    }
    if (filtroUsuario !== "todos") res = res.filter((a) => a.usuario_nome === filtroUsuario);
    if (filtroAcao !== "todos") res = res.filter((a) => a.acao === filtroAcao);
    if (filtroData) {
      res = res.filter((a) => a.created_at.startsWith(filtroData));
    }
    return res;
  }, [acoes, busca, filtroUsuario, filtroAcao, filtroData]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><History className="h-6 w-6" /> Histórico de Ações</h1>
        <p className="text-sm text-muted-foreground">Log de todas as movimentações de pedidos</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {loading ? "Carregando..." : `${filtradas.length} de ${acoes.length} registros`}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar por cliente, pedido, ação..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            <Select value={filtroUsuario} onValueChange={setFiltroUsuario}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Todos os usuários" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os usuários</SelectItem>
                {usuarios.map((u) => <SelectItem key={u!} value={u!}>{u}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filtroAcao} onValueChange={setFiltroAcao}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder="Tipo de ação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas as ações</SelectItem>
                {tiposAcao.map((a) => <SelectItem key={a!} value={a!}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={filtroData}
              onChange={(e) => setFiltroData(e.target.value)}
              className="w-full sm:w-40"
            />
          </div>

          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : filtradas.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground text-sm">Nenhuma ação encontrada</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data/Hora</TableHead>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Pedido</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Ação</TableHead>
                    <TableHead>De</TableHead>
                    <TableHead>Para</TableHead>
                    <TableHead>Motivo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtradas.map((a) => (
                    <TableRow key={a.id} className="text-sm">
                      <TableCell className="whitespace-nowrap text-muted-foreground font-mono text-xs">
                        {new Date(a.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{a.usuario_nome ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{a.usuario_email}</div>
                      </TableCell>
                      <TableCell>
                        {a.numero_pedido ? (
                          <Badge variant="outline" className="font-mono">#{a.numero_pedido}</Badge>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="max-w-32 truncate">{a.cliente_nome ?? "—"}</TableCell>
                      <TableCell>
                        <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">{a.acao ?? "—"}</span>
                      </TableCell>
                      <TableCell><StatusBadge status={a.status_anterior} /></TableCell>
                      <TableCell><StatusBadge status={a.status_novo} /></TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-40 truncate">{a.motivo ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
