import { useMemo, useState } from "react";
import { Package, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

// ─────────────────────────────────────────────────────────────
// DADOS MOCKADOS — aguardando integração com a API Sankhya.
// Nada aqui consulta o Supabase; tudo é hardcoded.
// ─────────────────────────────────────────────────────────────

type PedidoAberto = { numero: string; cliente: string; quantidade: number };

type ProdutoEstoque = {
  sku: string;
  nome: string;
  marca: string;
  estoqueAtual: number;
  pedidosEmAberto: number;
  dataRegularizacao: string | null;
  previsaoProducao: { data: string; quantidade: number } | null;
  pedidos: PedidoAberto[];
  historico: number[]; // demanda dos últimos 6 meses (mais antigo → mais recente)
};

const MARCAS = ["Bendita Cânfora", "Laby", "Alivik", "Tattoo do Bem"] as const;

const MESES_HISTORICO = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun"];

const PRODUTOS: ProdutoEstoque[] = [
  {
    sku: "BC-001",
    nome: "Pomada de Cânfora 30g",
    marca: "Bendita Cânfora",
    estoqueAtual: 420,
    pedidosEmAberto: 110,
    dataRegularizacao: null,
    previsaoProducao: { data: "2026-07-02", quantidade: 600 },
    pedidos: [
      { numero: "#10421", cliente: "Farmácia Vida", quantidade: 40 },
      { numero: "#10455", cliente: "Drogaria Saúde Total", quantidade: 70 },
    ],
    historico: [180, 210, 195, 240, 260, 230],
  },
  {
    sku: "BC-002",
    nome: "Bálsamo de Cânfora 60g",
    marca: "Bendita Cânfora",
    estoqueAtual: 38,
    pedidosEmAberto: 25,
    dataRegularizacao: "2026-06-22",
    previsaoProducao: { data: "2026-06-22", quantidade: 300 },
    pedidos: [
      { numero: "#10460", cliente: "Distribuidora Aurora", quantidade: 25 },
    ],
    historico: [90, 120, 110, 95, 130, 140],
  },
  {
    sku: "BC-003",
    nome: "Spray Refrescante Cânfora 120ml",
    marca: "Bendita Cânfora",
    estoqueAtual: 60,
    pedidosEmAberto: 75,
    dataRegularizacao: "2026-07-10",
    previsaoProducao: { data: "2026-07-10", quantidade: 500 },
    pedidos: [
      { numero: "#10401", cliente: "Rede Bem Estar", quantidade: 50 },
      { numero: "#10477", cliente: "Farmácia Popular SP", quantidade: 25 },
    ],
    historico: [140, 160, 150, 170, 200, 210],
  },
  {
    sku: "BC-004",
    nome: "Gel Massageador Cânfora 200g",
    marca: "Bendita Cânfora",
    estoqueAtual: 510,
    pedidosEmAberto: 90,
    dataRegularizacao: null,
    previsaoProducao: { data: "2026-08-01", quantidade: 400 },
    pedidos: [
      { numero: "#10488", cliente: "Atacado Farma MG", quantidade: 90 },
    ],
    historico: [220, 240, 230, 260, 250, 270],
  },
  {
    sku: "LB-101",
    nome: "Sérum Facial Laby 30ml",
    marca: "Laby",
    estoqueAtual: 15,
    pedidosEmAberto: 48,
    dataRegularizacao: "2026-06-30",
    previsaoProducao: { data: "2026-06-30", quantidade: 350 },
    pedidos: [
      { numero: "#10333", cliente: "Beleza & Cia", quantidade: 30 },
      { numero: "#10390", cliente: "Cosméticos Lumen", quantidade: 18 },
    ],
    historico: [80, 95, 130, 150, 170, 190],
  },
  {
    sku: "LB-102",
    nome: "Hidratante Corporal Laby 250ml",
    marca: "Laby",
    estoqueAtual: 340,
    pedidosEmAberto: 120,
    dataRegularizacao: null,
    previsaoProducao: { data: "2026-07-15", quantidade: 500 },
    pedidos: [
      { numero: "#10410", cliente: "Distribuidora Aurora", quantidade: 80 },
      { numero: "#10444", cliente: "Rede Bem Estar", quantidade: 40 },
    ],
    historico: [150, 160, 175, 165, 180, 200],
  },
  {
    sku: "LB-103",
    nome: "Protetor Solar Laby FPS 50",
    marca: "Laby",
    estoqueAtual: 22,
    pedidosEmAberto: 22,
    dataRegularizacao: "2026-07-05",
    previsaoProducao: { data: "2026-07-05", quantidade: 700 },
    pedidos: [
      { numero: "#10466", cliente: "Farmácia Vida", quantidade: 22 },
    ],
    historico: [200, 250, 300, 320, 360, 410],
  },
  {
    sku: "LB-104",
    nome: "Máscara Capilar Laby 300g",
    marca: "Laby",
    estoqueAtual: 95,
    pedidosEmAberto: 30,
    dataRegularizacao: null,
    previsaoProducao: { data: "2026-08-10", quantidade: 250 },
    pedidos: [
      { numero: "#10470", cliente: "Beleza & Cia", quantidade: 30 },
    ],
    historico: [60, 70, 65, 80, 75, 90],
  },
  {
    sku: "AL-201",
    nome: "Álcool Gel Alivik 500ml",
    marca: "Alivik",
    estoqueAtual: 0,
    pedidosEmAberto: 60,
    dataRegularizacao: "2026-06-18",
    previsaoProducao: { data: "2026-06-18", quantidade: 1000 },
    pedidos: [
      { numero: "#10355", cliente: "Hospital Santa Clara", quantidade: 40 },
      { numero: "#10399", cliente: "Clínica Vida Plena", quantidade: 20 },
    ],
    historico: [400, 380, 420, 450, 470, 500],
  },
  {
    sku: "AL-202",
    nome: "Sabonete Antisséptico Alivik 90g",
    marca: "Alivik",
    estoqueAtual: 280,
    pedidosEmAberto: 70,
    dataRegularizacao: null,
    previsaoProducao: { data: "2026-07-20", quantidade: 600 },
    pedidos: [
      { numero: "#10422", cliente: "Atacado Farma MG", quantidade: 70 },
    ],
    historico: [120, 130, 140, 135, 150, 160],
  },
  {
    sku: "AL-203",
    nome: "Spray Higienizador Alivik 250ml",
    marca: "Alivik",
    estoqueAtual: 44,
    pedidosEmAberto: 50,
    dataRegularizacao: "2026-07-08",
    previsaoProducao: { data: "2026-07-08", quantidade: 450 },
    pedidos: [
      { numero: "#10433", cliente: "Drogaria Saúde Total", quantidade: 50 },
    ],
    historico: [90, 100, 110, 105, 120, 130],
  },
  {
    sku: "AL-204",
    nome: "Solução Antisséptica Alivik 1L",
    marca: "Alivik",
    estoqueAtual: 150,
    pedidosEmAberto: 12,
    dataRegularizacao: null,
    previsaoProducao: { data: "2026-08-05", quantidade: 300 },
    pedidos: [
      { numero: "#10481", cliente: "Hospital Santa Clara", quantidade: 12 },
    ],
    historico: [70, 80, 75, 85, 90, 95],
  },
  {
    sku: "TB-301",
    nome: "Pomada Cicatrizante Tattoo do Bem 50g",
    marca: "Tattoo do Bem",
    estoqueAtual: 18,
    pedidosEmAberto: 65,
    dataRegularizacao: "2026-06-25",
    previsaoProducao: { data: "2026-06-25", quantidade: 400 },
    pedidos: [
      { numero: "#10360", cliente: "Studio Ink Art", quantidade: 35 },
      { numero: "#10405", cliente: "Tattoo Center RJ", quantidade: 30 },
    ],
    historico: [110, 140, 160, 180, 220, 260],
  },
  {
    sku: "TB-302",
    nome: "Filme Protetor Tattoo do Bem 10m",
    marca: "Tattoo do Bem",
    estoqueAtual: 200,
    pedidosEmAberto: 55,
    dataRegularizacao: null,
    previsaoProducao: { data: "2026-07-12", quantidade: 350 },
    pedidos: [
      { numero: "#10428", cliente: "Studio Ink Art", quantidade: 55 },
    ],
    historico: [100, 120, 115, 130, 145, 150],
  },
  {
    sku: "TB-303",
    nome: "Sabonete Neutro Tattoo do Bem 100g",
    marca: "Tattoo do Bem",
    estoqueAtual: 5,
    pedidosEmAberto: 40,
    dataRegularizacao: "2026-07-01",
    previsaoProducao: { data: "2026-07-01", quantidade: 500 },
    pedidos: [
      { numero: "#10448", cliente: "Tattoo Center RJ", quantidade: 25 },
      { numero: "#10472", cliente: "Studio Black Rose", quantidade: 15 },
    ],
    historico: [130, 150, 170, 190, 210, 240],
  },
];

type StatusKey = "ruptura" | "proximo" | "ok";

function getStatus(saldo: number): StatusKey {
  if (saldo <= 0) return "ruptura";
  if (saldo < 30) return "proximo";
  return "ok";
}

const STATUS_INFO: Record<
  StatusKey,
  { label: string; emoji: string; className: string }
> = {
  ruptura: {
    label: "Ruptura",
    emoji: "🔴",
    className: "bg-red-100 text-red-800 border-red-300 hover:bg-red-100",
  },
  proximo: {
    label: "Próximo a ruptura",
    emoji: "🟡",
    className:
      "bg-yellow-100 text-yellow-800 border-yellow-300 hover:bg-yellow-100",
  },
  ok: {
    label: "Ok",
    emoji: "🟢",
    className:
      "bg-green-100 text-green-800 border-green-300 hover:bg-green-100",
  },
};

function StatusBadge({ saldo }: { saldo: number }) {
  const info = STATUS_INFO[getStatus(saldo)];
  return (
    <Badge variant="outline" className={info.className}>
      {info.emoji} {info.label}
    </Badge>
  );
}

function saldoClass(saldo: number): string {
  if (saldo < 0) return "text-red-600 font-bold";
  if (saldo < 30) return "text-yellow-700 font-semibold";
  return "text-green-700 font-semibold";
}

function formatarData(data: string | null): string {
  if (!data) return "—";
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}

export default function GestaoEstoque() {
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<"todos" | StatusKey>("todos");
  const [marcaFiltro, setMarcaFiltro] = useState<"todas" | string>("todas");
  const [selecionado, setSelecionado] = useState<ProdutoEstoque | null>(null);

  const produtosFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return PRODUTOS.filter((p) => {
      const saldo = p.estoqueAtual - p.pedidosEmAberto;
      if (statusFiltro !== "todos" && getStatus(saldo) !== statusFiltro)
        return false;
      if (marcaFiltro !== "todas" && p.marca !== marcaFiltro) return false;
      if (!q) return true;
      return (
        p.nome.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
      );
    });
  }, [busca, statusFiltro, marcaFiltro]);

  const saldoSelecionado = selecionado
    ? selecionado.estoqueAtual - selecionado.pedidosEmAberto
    : 0;

  return (
    <div className="space-y-6">
      {/* Aviso — tela em desenvolvimento com dados simulados */}
      <div className="rounded-md border border-yellow-300 bg-yellow-100 px-4 py-3 text-sm text-yellow-800">
        ⚠️ Esta tela está em desenvolvimento. Os dados exibidos são simulados.
      </div>

      {/* Cabeçalho */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <Package className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Gestão de Estoque</h1>
            <p className="text-sm text-muted-foreground">
              Dados mockados — integração Sankhya em breve
            </p>
          </div>
        </div>
        <Badge
          variant="outline"
          className="bg-yellow-100 text-yellow-800 border-yellow-300 hover:bg-yellow-100 self-start"
        >
          Dados simulados
        </Badge>
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por SKU ou nome..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select
          value={statusFiltro}
          onValueChange={(v) => setStatusFiltro(v as "todos" | StatusKey)}
        >
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="ruptura">🔴 Ruptura</SelectItem>
            <SelectItem value="proximo">🟡 Próximo a ruptura</SelectItem>
            <SelectItem value="ok">🟢 Ok</SelectItem>
          </SelectContent>
        </Select>

        <Select value={marcaFiltro} onValueChange={setMarcaFiltro}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="Marca" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as marcas</SelectItem>
            {MARCAS.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabela */}
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">SKU</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead>Marca</TableHead>
              <TableHead className="text-right">Estoque atual</TableHead>
              <TableHead className="text-right">Pedidos em aberto</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Data regularização</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {produtosFiltrados.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="text-center text-sm text-muted-foreground py-10"
                >
                  Nenhum produto encontrado
                </TableCell>
              </TableRow>
            ) : (
              produtosFiltrados.map((p) => {
                const saldo = p.estoqueAtual - p.pedidosEmAberto;
                return (
                  <TableRow key={p.sku}>
                    <TableCell className="font-mono text-sm">{p.sku}</TableCell>
                    <TableCell className="text-sm font-medium">
                      {p.nome}
                    </TableCell>
                    <TableCell className="text-sm">
                      <Badge variant="outline">{p.marca}</Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {p.estoqueAtual}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {p.pedidosEmAberto}
                    </TableCell>
                    <TableCell className={`text-right text-sm ${saldoClass(saldo)}`}>
                      {saldo}
                    </TableCell>
                    <TableCell>
                      <StatusBadge saldo={saldo} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {getStatus(saldo) === "ok"
                        ? "—"
                        : formatarData(p.dataRegularizacao)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelecionado(p)}
                      >
                        Ver detalhes
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-sm text-muted-foreground">
        {produtosFiltrados.length} produto(s) exibido(s)
      </p>

      {/* Sheet lateral de detalhes */}
      <Sheet
        open={selecionado !== null}
        onOpenChange={(open) => !open && setSelecionado(null)}
      >
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {selecionado && (
            <>
              <SheetHeader>
                <SheetTitle>{selecionado.nome}</SheetTitle>
                <SheetDescription className="font-mono">
                  {selecionado.sku} · {selecionado.marca}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                <div>
                  <StatusBadge saldo={saldoSelecionado} />
                </div>

                {/* Estoque atual */}
                <section className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-md border p-3">
                    <div className="text-xs text-muted-foreground">Estoque</div>
                    <div className="text-lg font-bold">
                      {selecionado.estoqueAtual}
                    </div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="text-xs text-muted-foreground">
                      Em aberto
                    </div>
                    <div className="text-lg font-bold">
                      {selecionado.pedidosEmAberto}
                    </div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="text-xs text-muted-foreground">Saldo</div>
                    <div className={`text-lg ${saldoClass(saldoSelecionado)}`}>
                      {saldoSelecionado}
                    </div>
                  </div>
                </section>

                {/* Pedidos em aberto */}
                <section>
                  <h3 className="text-sm font-semibold mb-2">
                    Pedidos em aberto
                  </h3>
                  {selecionado.pedidos.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nenhum pedido em aberto.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {selecionado.pedidos.map((ped) => (
                        <div
                          key={ped.numero}
                          className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                        >
                          <div>
                            <div className="font-mono text-xs text-muted-foreground">
                              {ped.numero}
                            </div>
                            <div>{ped.cliente}</div>
                          </div>
                          <Badge variant="secondary">{ped.quantidade} un</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* Previsão de produção */}
                <section>
                  <h3 className="text-sm font-semibold mb-2">
                    Previsão de produção
                  </h3>
                  {selecionado.previsaoProducao ? (
                    <div className="rounded-md border p-3 text-sm flex items-center justify-between">
                      <div>
                        <div className="text-xs text-muted-foreground">
                          Data prevista
                        </div>
                        <div className="font-medium">
                          {formatarData(selecionado.previsaoProducao.data)}
                        </div>
                      </div>
                      <Badge variant="secondary">
                        +{selecionado.previsaoProducao.quantidade} un
                      </Badge>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Sem produção programada.
                    </p>
                  )}
                </section>

                {/* Análise histórica — gráfico de barras com divs + Tailwind */}
                <section>
                  <h3 className="text-sm font-semibold mb-3">
                    Análise histórica — demanda (6 meses)
                  </h3>
                  <div className="flex items-end justify-between gap-2 h-32">
                    {selecionado.historico.map((valor, i) => {
                      const max = Math.max(...selecionado.historico);
                      const altura = max > 0 ? (valor / max) * 100 : 0;
                      return (
                        <div
                          key={MESES_HISTORICO[i]}
                          className="flex flex-1 flex-col items-center gap-1"
                        >
                          <span className="text-[10px] text-muted-foreground">
                            {valor}
                          </span>
                          <div className="flex w-full items-end justify-center h-24">
                            <div
                              className="w-full rounded-t bg-primary/80"
                              style={{ height: `${altura}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-muted-foreground">
                            {MESES_HISTORICO[i]}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
