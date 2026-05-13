import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  X,
  Megaphone,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type FormProduto = {
  tipo: "marca" | "produto";
  marca?: string;
  produto_id?: string;
  produto_nome?: string;
  produto_codigo?: string;
};

type Nivel = {
  id?: string;
  nome: string;
  valor_minimo: number;
  valor_maximo: number | null;
  descricao_premio: string;
  ordem: number;
};

type Campanha = {
  id: string;
  nome: string;
  descricao: string | null;
  marcas: string[] | null;
  data_inicio: string | null;
  data_fim: string | null;
  ativa: boolean;
  created_at: string;
  niveis: Nivel[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  campanha_produtos: any[];
};

type FormNivel = {
  nome: string;
  valor_minimo: string;
  valor_maximo: string;
  descricao_premio: string;
};

type FormData = {
  nome: string;
  descricao: string;
  data_inicio: string;
  data_fim: string;
  niveis: FormNivel[];
  produtos: FormProduto[];
};

// ─── Constants ────────────────────────────────────────────────────────────────

const MARCAS = [
  "Bendita Cânfora",
  "Laby",
  "Tattoo do Bem",
  "InkPro",
  "Bravir",
  "Alivik",
] as const;

const MARCA_COLORS: Record<string, string> = {
  "Bendita Cânfora": "bg-purple-100 text-purple-800",
  Laby: "bg-blue-100 text-blue-800",
  "Tattoo do Bem": "bg-green-100 text-green-800",
  InkPro: "bg-orange-100 text-orange-800",
  Bravir: "bg-red-100 text-red-800",
  Alivik: "bg-yellow-100 text-yellow-800",
};

const formVazio = (): FormData => ({
  nome: "",
  descricao: "",
  data_inicio: "",
  data_fim: "",
  niveis: [{ nome: "", valor_minimo: "", valor_maximo: "", descricao_premio: "" }],
  produtos: [],
});

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchCampanhas(): Promise<Campanha[]> {
  const [campanhasRes, niveisRes, cpRes] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.from("campanhas") as any).select("*").order("created_at", { ascending: false }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.from("campanha_niveis") as any).select("*").order("ordem", { ascending: true }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.from("campanha_produtos") as any).select("*"),
  ]);
  if (campanhasRes.error) throw campanhasRes.error;
  if (niveisRes.error) throw niveisRes.error;
  if (cpRes.error) throw cpRes.error;

  const niveisMap: Record<string, Nivel[]> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (niveisRes.data ?? []).forEach((n: any) => {
    if (!niveisMap[n.campanha_id]) niveisMap[n.campanha_id] = [];
    niveisMap[n.campanha_id].push(n as Nivel);
  });

  // Fetch product details for all produto_ids referenced in campanha_produtos
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cpData: any[] = cpRes.data ?? [];
  const produtoIds = cpData
    .filter((cp) => cp.tipo === "produto" && cp.produto_id)
    .map((cp) => cp.produto_id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let produtoInfoMap: Record<string, any> = {};
  if (produtoIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: pInfo } = await (supabase.from("produtos") as any)
      .select("id, codigo_jiva, nome")
      .in("id", produtoIds);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pInfo ?? []).forEach((p: any) => { produtoInfoMap[p.id] = p; });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cpMap: Record<string, any[]> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cpData.forEach((cp: any) => {
    if (!cpMap[cp.campanha_id]) cpMap[cp.campanha_id] = [];
    const info = cp.produto_id ? produtoInfoMap[cp.produto_id] : null;
    cpMap[cp.campanha_id].push({
      ...cp,
      produto_nome: info?.nome ?? null,
      produto_codigo: info?.codigo_jiva ?? null,
    });
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (campanhasRes.data ?? []).map((c: any) => ({
    ...c,
    niveis: niveisMap[c.id] ?? [],
    campanha_produtos: cpMap[c.id] ?? [],
  }));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string | null): string {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function fmtBRL(v: number | null): string {
  if (v === null || v === undefined) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Campanhas() {
  const qc = useQueryClient();
  const [dialogAberto, setDialogAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(formVazio());
  const [salvando, setSalvando] = useState(false);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);

  // Busca de produtos específicos
  const [buscaProduto, setBuscaProduto] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [resultadosBusca, setResultadosBusca] = useState<any[]>([]);
  const [buscando, setBuscando] = useState(false);
  const timerBusca = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Query ──────────────────────────────────────────────────────────────────

  const { data: campanhas = [], isLoading } = useQuery<Campanha[]>({
    queryKey: ["campanhas"],
    queryFn: fetchCampanhas,
  });

  // ── Toggle ativa ──────────────────────────────────────────────────────────

  const toggleAtiva = useMutation({
    mutationFn: async ({ id, ativa }: { id: string; ativa: boolean }) => {
      if (ativa) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("campanhas") as any)
          .update({ ativa: false })
          .neq("id", id);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("campanhas") as any)
        .update({ ativa })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["campanhas"] }),
    onError: (e: Error) => toast.error("Erro ao atualizar campanha: " + e.message),
  });

  // ── Excluir ───────────────────────────────────────────────────────────────

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: eNiveis } = await (supabase.from("campanha_niveis") as any)
        .delete()
        .eq("campanha_id", id);
      if (eNiveis) throw eNiveis;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: eProd } = await (supabase.from("campanha_produtos") as any)
        .delete()
        .eq("campanha_id", id);
      if (eProd) throw eProd;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("campanhas") as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campanhas"] });
      toast.success("Campanha excluída.");
    },
    onError: (e: Error) => toast.error("Erro ao excluir: " + e.message),
  });

  // ── Salvar (criar/editar) ─────────────────────────────────────────────────

  async function salvar() {
    if (!form.nome.trim()) { toast.error("Nome obrigatório."); return; }
    if (!form.descricao.trim()) { toast.error("Descrição obrigatória."); return; }
    if (!form.data_inicio) { toast.error("Data de início obrigatória."); return; }
    if (!form.data_fim) { toast.error("Data de fim obrigatória."); return; }
    if (form.niveis.some((n) => !n.nome.trim())) {
      toast.error("Todos os níveis precisam ter nome.");
      return;
    }

    // Derive marcas array from produtos for backward compat
    const marcasDerivadas = form.produtos
      .filter((p) => p.tipo === "marca")
      .map((p) => p.marca!);

    setSalvando(true);
    try {
      let campanhaId = editandoId;

      if (editandoId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase.from("campanhas") as any)
          .update({
            nome: form.nome.trim(),
            descricao: form.descricao.trim(),
            marcas: marcasDerivadas,
            data_inicio: form.data_inicio,
            data_fim: form.data_fim,
          })
          .eq("id", editandoId);
        if (error) throw error;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: eNiveis } = await (supabase.from("campanha_niveis") as any)
          .delete()
          .eq("campanha_id", editandoId);
        if (eNiveis) throw eNiveis;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase.from("campanhas") as any)
          .insert({
            nome: form.nome.trim(),
            descricao: form.descricao.trim(),
            marcas: marcasDerivadas,
            data_inicio: form.data_inicio,
            data_fim: form.data_fim,
            ativa: false,
          })
          .select("id")
          .single();
        if (error) throw error;
        campanhaId = data.id;
      }

      if (form.niveis.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: eNiveis } = await (supabase.from("campanha_niveis") as any).insert(
          form.niveis.map((n, i) => ({
            campanha_id: campanhaId,
            nome: n.nome.trim(),
            valor_minimo: Number(n.valor_minimo) || 0,
            valor_maximo: n.valor_maximo !== "" ? Number(n.valor_maximo) : null,
            descricao_premio: n.descricao_premio.trim(),
            ordem: i + 1,
          }))
        );
        if (eNiveis) throw eNiveis;
      }

      // Recriar campanha_produtos
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: eProdDelete } = await (supabase.from("campanha_produtos") as any)
        .delete()
        .eq("campanha_id", campanhaId);
      if (eProdDelete) throw eProdDelete;

      if (form.produtos.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: eProdInsert } = await (supabase.from("campanha_produtos") as any).insert(
          form.produtos.map((p) => ({
            campanha_id: campanhaId,
            tipo: p.tipo,
            marca: p.tipo === "marca" ? p.marca : null,
            produto_id: p.tipo === "produto" ? p.produto_id : null,
          }))
        );
        if (eProdInsert) throw eProdInsert;
      }

      qc.invalidateQueries({ queryKey: ["campanhas"] });
      toast.success(editandoId ? "Campanha atualizada." : "Campanha criada.");
      fecharDialog();
    } catch (e: unknown) {
      toast.error("Erro ao salvar: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSalvando(false);
    }
  }

  // ── Dialog helpers ────────────────────────────────────────────────────────

  function abrirNovo() {
    setEditandoId(null);
    setForm(formVazio());
    setBuscaProduto("");
    setResultadosBusca([]);
    setDialogAberto(true);
  }

  function abrirEdicao(c: Campanha) {
    setEditandoId(c.id);
    setForm({
      nome: c.nome,
      descricao: c.descricao ?? "",
      data_inicio: c.data_inicio ?? "",
      data_fim: c.data_fim ?? "",
      niveis: c.niveis.map((n) => ({
        nome: n.nome,
        valor_minimo: String(n.valor_minimo ?? ""),
        valor_maximo: n.valor_maximo !== null ? String(n.valor_maximo) : "",
        descricao_premio: n.descricao_premio ?? "",
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      produtos: (c.campanha_produtos ?? []).map((cp: any): FormProduto =>
        cp.tipo === "marca"
          ? { tipo: "marca", marca: cp.marca }
          : {
              tipo: "produto",
              produto_id: cp.produto_id,
              produto_nome: cp.produto_nome ?? "",
              produto_codigo: cp.produto_codigo ?? "",
            }
      ),
    });
    setBuscaProduto("");
    setResultadosBusca([]);
    setDialogAberto(true);
  }

  function fecharDialog() {
    setDialogAberto(false);
    setEditandoId(null);
    setForm(formVazio());
    setBuscaProduto("");
    setResultadosBusca([]);
  }

  // ── Níveis helpers ────────────────────────────────────────────────────────

  function addNivel() {
    setForm((f) => ({
      ...f,
      niveis: [...f.niveis, { nome: "", valor_minimo: "", valor_maximo: "", descricao_premio: "" }],
    }));
  }

  function removeNivel(i: number) {
    setForm((f) => ({ ...f, niveis: f.niveis.filter((_, idx) => idx !== i) }));
  }

  function setNivel(i: number, field: keyof FormNivel, value: string) {
    setForm((f) => {
      const niveis = [...f.niveis];
      niveis[i] = { ...niveis[i], [field]: value };
      return { ...f, niveis };
    });
  }

  // ── Produtos helpers ──────────────────────────────────────────────────────

  function toggleProdutoMarca(marca: string) {
    setForm((f) => {
      const jaExiste = f.produtos.some((p) => p.tipo === "marca" && p.marca === marca);
      if (jaExiste) {
        return { ...f, produtos: f.produtos.filter((p) => !(p.tipo === "marca" && p.marca === marca)) };
      }
      return { ...f, produtos: [...f.produtos, { tipo: "marca", marca }] };
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function adicionarProduto(p: any) {
    setForm((f) => {
      if (f.produtos.some((x) => x.tipo === "produto" && x.produto_id === p.id)) return f;
      return {
        ...f,
        produtos: [
          ...f.produtos,
          {
            tipo: "produto" as const,
            produto_id: p.id,
            produto_nome: p.nome,
            produto_codigo: p.codigo_jiva,
          },
        ],
      };
    });
    setBuscaProduto("");
    setResultadosBusca([]);
  }

  function removerProduto(produto_id: string) {
    setForm((f) => ({
      ...f,
      produtos: f.produtos.filter((p) => !(p.tipo === "produto" && p.produto_id === produto_id)),
    }));
  }

  async function buscarProdutos(busca: string) {
    setBuscando(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from("produtos") as any)
        .select("id, codigo_jiva, nome, marca")
        .or(`nome.ilike.%${busca}%,codigo_jiva.ilike.%${busca}%`)
        .eq("ativo", true)
        .limit(10);
      if (error) throw error;
      setResultadosBusca(data ?? []);
    } catch {
      setResultadosBusca([]);
    } finally {
      setBuscando(false);
    }
  }

  function handleBuscaChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setBuscaProduto(v);
    if (timerBusca.current) clearTimeout(timerBusca.current);
    if (v.length >= 3) {
      timerBusca.current = setTimeout(() => buscarProdutos(v), 400);
    } else {
      setResultadosBusca([]);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Megaphone className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Campanhas</h1>
        </div>
        <Button onClick={abrirNovo}>
          <Plus className="h-4 w-4 mr-2" />
          Nova campanha
        </Button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty */}
      {!isLoading && campanhas.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          Nenhuma campanha cadastrada ainda.
        </div>
      )}

      {/* List */}
      {!isLoading &&
        campanhas.map((c) => (
          <Card key={c.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-lg">{c.nome}</CardTitle>
                    {c.ativa && (
                      <Badge className="bg-green-100 text-green-800 border-green-200">
                        Ativa
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{c.descricao}</p>
                  <div className="flex items-center gap-2 flex-wrap mt-1">
                    <span className="text-xs text-muted-foreground">
                      {fmtDate(c.data_inicio)} → {fmtDate(c.data_fim)}
                    </span>
                    {(c.marcas ?? []).map((m) => (
                      <span
                        key={m}
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${MARCA_COLORS[m] ?? "bg-gray-100 text-gray-700"}`}
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex items-center gap-1.5">
                    <Switch
                      checked={c.ativa}
                      onCheckedChange={(v) => toggleAtiva.mutate({ id: c.id, ativa: v })}
                    />
                    <span className="text-xs text-muted-foreground">
                      {c.ativa ? "Ativa" : "Inativa"}
                    </span>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => abrirEdicao(c)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setExcluindoId(c.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="pt-0 space-y-4">
              {c.niveis.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">#</TableHead>
                      <TableHead>Nível</TableHead>
                      <TableHead>De</TableHead>
                      <TableHead>Até</TableHead>
                      <TableHead>Prêmio</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {c.niveis.map((n) => (
                      <TableRow key={n.id ?? n.ordem}>
                        <TableCell className="text-muted-foreground">{n.ordem}</TableCell>
                        <TableCell className="font-medium">{n.nome}</TableCell>
                        <TableCell>{fmtBRL(n.valor_minimo)}</TableCell>
                        <TableCell>{n.valor_maximo !== null ? fmtBRL(n.valor_maximo) : "Sem limite"}</TableCell>
                        <TableCell>{n.descricao_premio}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {/* Participantes da campanha */}
              {(c.campanha_produtos ?? []).length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Participantes da campanha</p>
                  <div className="flex flex-wrap gap-2">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {(c.campanha_produtos as any[])
                      .filter((cp) => cp.tipo === "marca")
                      .map((cp) => (
                        <span
                          key={cp.id}
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${MARCA_COLORS[cp.marca] ?? "bg-gray-100 text-gray-700"}`}
                        >
                          {cp.marca}
                        </span>
                      ))}
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {(c.campanha_produtos as any[])
                      .filter((cp) => cp.tipo === "produto")
                      .map((cp) => (
                        <span
                          key={cp.id}
                          className="flex items-center gap-1 bg-secondary text-secondary-foreground text-xs px-2 py-0.5 rounded-full"
                        >
                          {cp.produto_codigo && (
                            <span className="font-medium">{cp.produto_codigo}</span>
                          )}
                          <span>{cp.produto_nome ?? cp.produto_id}</span>
                        </span>
                      ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}

      {/* Dialog criar/editar */}
      <Dialog open={dialogAberto} onOpenChange={(o) => { if (!o) fecharDialog(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editandoId ? "Editar campanha" : "Nova campanha"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Nome */}
            <div className="space-y-1">
              <Label htmlFor="camp-nome">Nome *</Label>
              <Input
                id="camp-nome"
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                placeholder="Ex: Campanha Verão 2025"
              />
            </div>

            {/* Descrição */}
            <div className="space-y-1">
              <Label htmlFor="camp-desc">Descrição *</Label>
              <Textarea
                id="camp-desc"
                value={form.descricao}
                onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
                rows={3}
                placeholder="Descreva os objetivos da campanha..."
              />
            </div>

            {/* Datas */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="camp-inicio">Data início *</Label>
                <Input
                  id="camp-inicio"
                  type="date"
                  value={form.data_inicio}
                  onChange={(e) => setForm((f) => ({ ...f, data_inicio: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="camp-fim">Data fim *</Label>
                <Input
                  id="camp-fim"
                  type="date"
                  value={form.data_fim}
                  onChange={(e) => setForm((f) => ({ ...f, data_fim: e.target.value }))}
                />
              </div>
            </div>

            {/* Níveis */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Níveis</Label>
                <Button type="button" size="sm" variant="outline" onClick={addNivel}>
                  <Plus className="h-3 w-3 mr-1" />
                  Adicionar nível
                </Button>
              </div>

              {form.niveis.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhum nível adicionado.</p>
              )}

              {form.niveis.map((n, i) => (
                <div key={i} className="border rounded-lg p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">
                      Nível {i + 1}
                    </span>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-destructive hover:text-destructive"
                      onClick={() => removeNivel(i)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor={`nivel-nome-${i}`}>Nome</Label>
                      <Input
                        id={`nivel-nome-${i}`}
                        value={n.nome}
                        onChange={(e) => setNivel(i, "nome", e.target.value)}
                        placeholder="Ex: Bronze"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`nivel-premio-${i}`}>Prêmio</Label>
                      <Input
                        id={`nivel-premio-${i}`}
                        value={n.descricao_premio}
                        onChange={(e) => setNivel(i, "descricao_premio", e.target.value)}
                        placeholder="Ex: Brinde exclusivo"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`nivel-min-${i}`}>Valor mínimo (R$)</Label>
                      <Input
                        id={`nivel-min-${i}`}
                        type="number"
                        min={0}
                        value={n.valor_minimo}
                        onChange={(e) => setNivel(i, "valor_minimo", e.target.value)}
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`nivel-max-${i}`}>
                        Valor máximo (R$){" "}
                        <span className="text-muted-foreground text-xs">opcional</span>
                      </Label>
                      <Input
                        id={`nivel-max-${i}`}
                        type="number"
                        min={0}
                        value={n.valor_maximo}
                        onChange={(e) => setNivel(i, "valor_maximo", e.target.value)}
                        placeholder="Vazio = sem limite"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Marcas e produtos participantes */}
            <div className="space-y-4 border rounded-lg p-4">
              <Label className="text-base font-semibold">Marcas e produtos participantes</Label>

              {/* Por marca */}
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Por marca</p>
                <div className="flex flex-wrap gap-4">
                  {MARCAS.map((m) => (
                    <div key={m} className="flex items-center gap-2">
                      <Checkbox
                        id={`pmarca-${m}`}
                        checked={form.produtos.some((p) => p.tipo === "marca" && p.marca === m)}
                        onCheckedChange={() => toggleProdutoMarca(m)}
                      />
                      <Label htmlFor={`pmarca-${m}`} className="font-normal cursor-pointer">
                        {m}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Produtos específicos */}
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Produtos específicos</p>
                <div className="relative">
                  <Input
                    value={buscaProduto}
                    onChange={handleBuscaChange}
                    placeholder="Buscar por nome ou código Jiva..."
                  />
                  {buscando && (
                    <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>

                {resultadosBusca.length > 0 && (
                  <div className="border rounded-md divide-y max-h-48 overflow-y-auto bg-background shadow-sm">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {resultadosBusca.map((p: any) => (
                      <button
                        key={p.id}
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-muted text-sm flex items-center gap-2"
                        onClick={() => adicionarProduto(p)}
                      >
                        <span className="font-medium text-muted-foreground">{p.codigo_jiva}</span>
                        <span>{p.nome}</span>
                        {p.marca && (
                          <span className={`ml-auto text-xs px-1.5 py-0.5 rounded-full ${MARCA_COLORS[p.marca] ?? "bg-gray-100 text-gray-700"}`}>
                            {p.marca}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {/* Chips dos produtos selecionados */}
                {form.produtos.filter((p) => p.tipo === "produto").length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {form.produtos
                      .filter((p) => p.tipo === "produto")
                      .map((p) => (
                        <span
                          key={p.produto_id}
                          className="flex items-center gap-1 bg-secondary text-secondary-foreground text-xs px-2 py-1 rounded-full"
                        >
                          {p.produto_codigo && (
                            <span className="font-medium">{p.produto_codigo}</span>
                          )}
                          <span>{p.produto_nome}</span>
                          <button
                            type="button"
                            className="ml-1 hover:text-destructive"
                            onClick={() => removerProduto(p.produto_id!)}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={fecharDialog} disabled={salvando}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={salvando}>
              {salvando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editandoId ? "Salvar alterações" : "Criar campanha"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog excluir */}
      <AlertDialog open={!!excluindoId} onOpenChange={(o) => { if (!o) setExcluindoId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir campanha?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é irreversível. Todos os níveis e produtos da campanha também serão excluídos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (excluindoId) excluir.mutate(excluindoId);
                setExcluindoId(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
