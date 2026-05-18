import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2 } from "lucide-react";
import { STATUS_LABEL, STATUS_COLOR } from "@/lib/status";

type PeriodoKey = "hoje" | "semana" | "mes" | "ano" | "custom";

type PedidoRow = {
  id: string;
  numero_pedido: number;
  data_pedido: string;
  status: string;
  vendedor_id: string;
  razao_social: string;
  total: number;
};

type CardKey = "recebidos" | "lancados" | "ag_faturamento" | "parc_faturado" | "faturado" | "problemas";

type CardDef = {
  key: CardKey;
  label: string;
  sublabel: string;
  cor: string;
  textBig: string;
  textSub: string;
  border: string;
};

const CARDS: CardDef[] = [
  {
    key: "recebidos",
    label: "Pedidos recebidos",
    sublabel: "Todos exceto rascunho, cancelado e pendente",
    cor: "bg-orange-50",
    textBig: "text-orange-900",
    textSub: "text-orange-700",
    border: "border-orange-200",
  },
  {
    key: "lancados",
    label: "Pedidos lançados",
    sublabel: "Produção do faturamento",
    cor: "bg-teal-50",
    textBig: "text-teal-900",
    textSub: "text-teal-700",
    border: "border-teal-200",
  },
  {
    key: "ag_faturamento",
    label: "Ag. Faturamento",
    sublabel: "Fila da logística",
    cor: "bg-blue-50",
    textBig: "text-blue-900",
    textSub: "text-blue-700",
    border: "border-blue-200",
  },
  {
    key: "parc_faturado",
    label: "Pedidos sem estoque",
    sublabel: "Status sem_estoque",
    cor: "bg-yellow-50",
    textBig: "text-yellow-900",
    textSub: "text-yellow-700",
    border: "border-yellow-200",
  },
  {
    key: "faturado",
    label: "Faturado",
    sublabel: "Faturado",
    cor: "bg-green-50",
    textBig: "text-green-900",
    textSub: "text-green-700",
    border: "border-green-200",
  },
  {
    key: "problemas",
    label: "Problemas",
    sublabel: "Com problema, devolvido ou cancelado",
    cor: "bg-red-50",
    textBig: "text-red-900",
    textSub: "text-red-700",
    border: "border-red-200",
  },
];

function getPeriodo(key: PeriodoKey, customInicio: string, customFim: string): { inicio: string; fim: string } {
  const hoje = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  if (key === "hoje") {
    const s = fmt(hoje);
    return { inicio: s, fim: s };
  }
  if (key === "semana") {
    const dow = hoje.getDay(); // 0=dom
    const diff = dow === 0 ? 6 : dow - 1; // segunda = dia 1
    const seg = new Date(hoje);
    seg.setDate(hoje.getDate() - diff);
    return { inicio: fmt(seg), fim: fmt(hoje) };
  }
  if (key === "mes") {
    return {
      inicio: `${hoje.getFullYear()}-${pad(hoje.getMonth() + 1)}-01`,
      fim: fmt(hoje),
    };
  }
  if (key === "ano") {
    return { inicio: `${hoje.getFullYear()}-01-01`, fim: fmt(hoje) };
  }
  return { inicio: customInicio, fim: customFim || fmt(hoje) };
}

function filtrarCard(pedidos: PedidoRow[], cardKey: CardKey): PedidoRow[] {
  switch (cardKey) {
    case "recebidos":
      return pedidos.filter((p) => p.status !== "rascunho" && p.status !== "cancelado" && p.status !== "pendente_sankhya");
    case "lancados":
      return pedidos.filter((p) => p.status === "no_sankhya");
    case "ag_faturamento":
      return pedidos.filter((p) => p.status === "aguardando_faturamento");
    case "parc_faturado":
      return pedidos.filter((p) => p.status === "sem_estoque");
    case "faturado":
      return pedidos.filter((p) => p.status === "faturado");
    case "problemas":
      return pedidos.filter((p) => p.status === "com_problema" || p.status === "devolvido" || p.status === "cancelado");
    default:
      return [];
  }
}

export default function DashboardFaturamento() {
  const [periodo, setPeriodo] = useState<PeriodoKey>("mes");
  const [customInicio, setCustomInicio] = useState("");
  const [customFim, setCustomFim] = useState("");
  const [pedidos, setPedidos] = useState<PedidoRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [cardAberto, setCardAberto] = useState<CardKey | null>(null);

  const { inicio, fim } = useMemo(
    () => getPeriodo(periodo, customInicio, customFim),
    [periodo, customInicio, customFim]
  );

  const carregar = useCallback(async () => {
    if (!inicio || !fim) return;
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("pedidos")
      .select(`
        id, numero_pedido, data_pedido, status, vendedor_id,
        clientes(razao_social),
        itens_pedido(total_item)
      `)
      .neq("status", "rascunho")
      .gte("data_pedido", inicio)
      .lte("data_pedido", fim)
      .order("data_pedido", { ascending: false });

    if (!error && data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mapped: PedidoRow[] = (data as any[]).map((p) => ({
        id: p.id,
        numero_pedido: p.numero_pedido,
        data_pedido: p.data_pedido,
        status: p.status,
        vendedor_id: p.vendedor_id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        razao_social: (p.clientes as any)?.razao_social ?? "—",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        total: ((p.itens_pedido ?? []) as any[]).reduce((s: number, i) => s + Number(i.total_item ?? 0), 0),
      }));
      setPedidos(mapped);
    }
    setLoading(false);
  }, [inicio, fim]);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    supabase.from("profiles").select("id, full_name, email").then(({ data }) => {
      if (!data) return;
      const map: Record<string, string> = {};
      data.forEach((p) => { map[p.id] = p.full_name || p.email || "—"; });
      setProfiles(map);
    });
  }, []);

  const contagemPorCard = useMemo(() => {
    const result: Record<CardKey, number> = {
      recebidos: 0, lancados: 0, ag_faturamento: 0,
      parc_faturado: 0, faturado: 0, problemas: 0,
    };
    for (const card of CARDS) {
      result[card.key] = filtrarCard(pedidos, card.key).length;
    }
    return result;
  }, [pedidos]);

  const pedidosDrilldown = useMemo(
    () => cardAberto ? filtrarCard(pedidos, cardAberto) : [],
    [pedidos, cardAberto]
  );

  const PERIODOS: { key: PeriodoKey; label: string }[] = [
    { key: "hoje", label: "Hoje" },
    { key: "semana", label: "Esta semana" },
    { key: "mes", label: "Este mês" },
    { key: "ano", label: "Este ano" },
    { key: "custom", label: "Personalizado" },
  ];

  return (
    <div className="space-y-6">
      {/* Filtros de período */}
      <div className="flex flex-wrap items-center gap-2">
        {PERIODOS.map((p) => (
          <Button
            key={p.key}
            size="sm"
            variant={periodo === p.key ? "default" : "outline"}
            onClick={() => setPeriodo(p.key)}
          >
            {p.label}
          </Button>
        ))}
        {periodo === "custom" && (
          <div className="flex items-center gap-2 ml-1">
            <Input
              type="date"
              value={customInicio}
              onChange={(e) => setCustomInicio(e.target.value)}
              className="w-40 h-8"
              placeholder="De"
            />
            <span className="text-muted-foreground text-sm">até</span>
            <Input
              type="date"
              value={customFim}
              onChange={(e) => setCustomFim(e.target.value)}
              className="w-40 h-8"
              placeholder="Até"
            />
          </div>
        )}
        {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground ml-1" />}
      </div>

      {/* Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {CARDS.map((card) => {
          const isAberto = cardAberto === card.key;
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => setCardAberto(isAberto ? null : card.key)}
              className={`rounded-lg border p-4 text-left transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-ring ${card.cor} ${card.border} ${isAberto ? "ring-2 ring-ring shadow-md" : ""}`}
            >
              <div className={`text-sm font-medium ${card.textBig}`}>{card.label}</div>
              <div className={`text-3xl font-bold mt-1 ${card.textBig}`}>
                {contagemPorCard[card.key]}
              </div>
              <div className={`text-xs mt-1 ${card.textSub}`}>{card.sublabel}</div>
            </button>
          );
        })}
      </div>

      {/* Drill-down */}
      {cardAberto && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">
              {CARDS.find((c) => c.key === cardAberto)?.label} — {pedidosDrilldown.length} pedido(s)
            </h3>
            <Button size="sm" variant="ghost" onClick={() => setCardAberto(null)}>
              Fechar
            </Button>
          </div>
          <div className="rounded-md border overflow-x-auto">
            {pedidosDrilldown.length === 0 ? (
              <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
                Nenhum pedido neste período
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">#</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Vendedor</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pedidosDrilldown.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono font-semibold text-sm">
                        #{p.numero_pedido}
                      </TableCell>
                      <TableCell className="text-sm">{formatDate(p.data_pedido)}</TableCell>
                      <TableCell className="text-sm font-medium">{p.razao_social}</TableCell>
                      <TableCell className="text-sm">{profiles[p.vendedor_id] ?? "—"}</TableCell>
                      <TableCell className="text-right font-bold text-sm text-green-700">
                        {formatBRL(p.total)}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOR[p.status] ?? "bg-gray-100 text-gray-800 border-gray-300"}`}>
                          {STATUS_LABEL[p.status] ?? p.status}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
