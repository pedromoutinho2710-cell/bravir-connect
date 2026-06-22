import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, BarChart2, Users, ShoppingCart, Activity } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const REGIOES = [
  { value: "todas", label: "Todas as Regiões" },
  { value: "sudeste", label: "Sudeste" },
  { value: "sul", label: "Sul" },
  { value: "nordeste", label: "Nordeste" },
  { value: "centro-oeste", label: "Centro-Oeste" },
  { value: "norte", label: "Norte" },
];

const PERIODOS = [
  { value: "jan2025", label: "Jan/2025" },
  { value: "fev2025", label: "Fev/2025" },
  { value: "mar2025", label: "Mar/2025" },
  { value: "abr2025", label: "Abr/2025" },
  { value: "mai2025", label: "Mai/2025" },
  { value: "jun2025", label: "Jun/2025" },
];

const CORES_GRAFICO = ["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#3b82f6"];

// --- DADOS MOCKADOS POR PRODUTO ---
const dadosPorProduto: Record<string, ProdutoDados> = {
  laby: {
    kpis: [
      { titulo: "Market Share", valor: "18,4%", variacao: +1.2, icone: "share" },
      { titulo: "Volume de Vendas (un)", valor: "42.800", variacao: +5.3, icone: "vendas" },
      { titulo: "Crescimento vs. Mês Anterior", valor: "+5,3%", variacao: +5.3, icone: "trend" },
      { titulo: "Posição no Mercado", valor: "2º lugar", variacao: 0, icone: "rank" },
    ],
    evolucaoMercado: [
      { mes: "Jan", laby: 38000, mercado: 210000 },
      { mes: "Fev", laby: 40000, mercado: 215000 },
      { mes: "Mar", laby: 39500, mercado: 218000 },
      { mes: "Abr", laby: 41000, mercado: 220000 },
      { mes: "Mai", laby: 42800, mercado: 225000 },
    ],
    concorrencia: [
      { nome: "Laby", share: 18.4 },
      { nome: "Concorrente A", share: 32.1 },
      { nome: "Concorrente B", share: 25.0 },
      { nome: "Concorrente C", share: 14.3 },
      { nome: "Outros", share: 10.2 },
    ],
    performanceRegiao: [
      { regiao: "Sudeste", volume: 18000 },
      { regiao: "Sul", volume: 12000 },
      { regiao: "Nordeste", volume: 7000 },
      { regiao: "CO", volume: 4000 },
      { regiao: "Norte", volume: 1800 },
    ],
    ultimaAtualizacao: "Jun/2025",
  },
  alivik: {
    kpis: [
      { titulo: "Market Share", valor: "11,7%", variacao: +0.8, icone: "share" },
      { titulo: "Volume de Vendas (un)", valor: "29.300", variacao: +2.1, icone: "vendas" },
      { titulo: "Crescimento vs. Mês Anterior", valor: "+2,1%", variacao: +2.1, icone: "trend" },
      { titulo: "Posição no Mercado", valor: "4º lugar", variacao: 0, icone: "rank" },
    ],
    evolucaoMercado: [
      { mes: "Jan", alivik: 26000, mercado: 220000 },
      { mes: "Fev", alivik: 27000, mercado: 222000 },
      { mes: "Mar", alivik: 27500, mercado: 225000 },
      { mes: "Abr", alivik: 28500, mercado: 228000 },
      { mes: "Mai", alivik: 29300, mercado: 230000 },
    ],
    concorrencia: [
      { nome: "Alivik", share: 11.7 },
      { nome: "Concorrente A", share: 38.2 },
      { nome: "Concorrente B", share: 22.5 },
      { nome: "Concorrente C", share: 18.0 },
      { nome: "Outros", share: 9.6 },
    ],
    performanceRegiao: [
      { regiao: "Sudeste", volume: 12000 },
      { regiao: "Sul", volume: 8000 },
      { regiao: "Nordeste", volume: 5000 },
      { regiao: "CO", volume: 3000 },
      { regiao: "Norte", volume: 1300 },
    ],
    ultimaAtualizacao: "Jun/2025",
  },
  canfora: {
    kpis: [
      { titulo: "Market Share", valor: "8,2%", variacao: -0.3, icone: "share" },
      { titulo: "Volume de Vendas (un)", valor: "19.600", variacao: -1.5, icone: "vendas" },
      { titulo: "Crescimento vs. Mês Anterior", valor: "-1,5%", variacao: -1.5, icone: "trend" },
      { titulo: "Posição no Mercado", valor: "6º lugar", variacao: 0, icone: "rank" },
    ],
    evolucaoMercado: [
      { mes: "Jan", canfora: 21000, mercado: 240000 },
      { mes: "Fev", canfora: 20500, mercado: 242000 },
      { mes: "Mar", canfora: 20000, mercado: 245000 },
      { mes: "Abr", canfora: 19800, mercado: 247000 },
      { mes: "Mai", canfora: 19600, mercado: 250000 },
    ],
    concorrencia: [
      { nome: "Bendita Cânfora", share: 8.2 },
      { nome: "Concorrente A", share: 29.5 },
      { nome: "Concorrente B", share: 27.0 },
      { nome: "Concorrente C", share: 20.1 },
      { nome: "Outros", share: 15.2 },
    ],
    performanceRegiao: [
      { regiao: "Sudeste", volume: 8000 },
      { regiao: "Sul", volume: 5500 },
      { regiao: "Nordeste", volume: 3500 },
      { regiao: "CO", volume: 1800 },
      { regiao: "Norte", volume: 800 },
    ],
    ultimaAtualizacao: "Jun/2025",
  },
};

interface KPI {
  titulo: string;
  valor: string;
  variacao: number;
  icone: string;
}

interface ProdutoDados {
  kpis: KPI[];
  evolucaoMercado: Record<string, unknown>[];
  concorrencia: { nome: string; share: number }[];
  performanceRegiao: { regiao: string; volume: number }[];
  ultimaAtualizacao: string;
}

function KPICard({ kpi }: { kpi: KPI }) {
  const positivo = kpi.variacao > 0;
  const neutro = kpi.variacao === 0;
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground mb-1">{kpi.titulo}</p>
            <p className="text-2xl font-bold tracking-tight">{kpi.valor}</p>
          </div>
          <div className={`rounded-full p-2 ${
            neutro ? "bg-gray-100" : positivo ? "bg-green-100" : "bg-red-100"
          }`}>
            {kpi.icone === "trend" ? (
              positivo ? <TrendingUp className="h-4 w-4 text-green-600" /> : <TrendingDown className="h-4 w-4 text-red-500" />
            ) : kpi.icone === "vendas" ? (
              <ShoppingCart className="h-4 w-4 text-indigo-500" />
            ) : kpi.icone === "rank" ? (
              <BarChart2 className="h-4 w-4 text-gray-500" />
            ) : (
              <Activity className="h-4 w-4 text-indigo-500" />
            )}
          </div>
        </div>
        {!neutro && (
          <div className="mt-2">
            <Badge variant={positivo ? "default" : "destructive"} className="text-xs">
              {positivo ? "+" : ""}{kpi.variacao.toFixed(1)}% vs mês anterior
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PainelProduto({ chave, nomeExibicao }: { chave: string; nomeExibicao: string }) {
  const dados = dadosPorProduto[chave];
  const chaveVolume = chave === "canfora" ? "canfora" : chave === "alivik" ? "alivik" : "laby";

  return (
    <div className="space-y-6">
      {/* Aviso de atualização */}
      <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <Users className="h-4 w-4 text-blue-600 shrink-0" />
        <span className="text-sm text-blue-700">
          Dados IQVIA — última atualização: <strong>{dados.ultimaAtualizacao}</strong>. Atualização mensal manual.
        </span>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {dados.kpis.map((kpi) => (
          <KPICard key={kpi.titulo} kpi={kpi} />
        ))}
      </div>

      {/* Gráficos linha + concorrência */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Evolução de Volume — {nomeExibicao} vs. Mercado</CardTitle>
            <CardDescription>Unidades vendidas nos últimos 5 meses</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={dados.evolucaoMercado}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: number) => v.toLocaleString("pt-BR")} />
                <Legend />
                <Line type="monotone" dataKey={chaveVolume} stroke="#6366f1" strokeWidth={2} name={nomeExibicao} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="mercado" stroke="#d1d5db" strokeWidth={2} name="Mercado Total" dot={false} strokeDasharray="4 4" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Market Share — Concorrência</CardTitle>
            <CardDescription>Participação de mercado por marca (%)</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={dados.concorrencia}
                  dataKey="share"
                  nameKey="nome"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ nome, share }) => `${nome}: ${share}%`}
                  labelLine={false}
                >
                  {dados.concorrencia.map((_, i) => (
                    <Cell key={i} fill={CORES_GRAFICO[i % CORES_GRAFICO.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => `${v}%`} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Performance por região */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Performance por Região</CardTitle>
          <CardDescription>Volume de vendas (unidades) por região geográfica</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={dados.performanceRegiao} margin={{ left: 0, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="regiao" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v: number) => v.toLocaleString("pt-BR")} />
              <Bar dataKey="volume" fill="#6366f1" name="Volume (un)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

export default function DashboardIQVIA() {
  const [periodo, setPeriodo] = useState("mai2025");
  const [regiao, setRegiao] = useState("todas");

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard IQVIA</h1>
        <p className="text-sm text-muted-foreground">
          Dados de mercado, concorrência e performance por linha de produto
        </p>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Período:</span>
          <Select value={periodo} onValueChange={setPeriodo}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODOS.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Região:</span>
          <Select value={regiao} onValueChange={setRegiao}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REGIOES.map((r) => (
                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Badge variant="outline" className="text-xs">
          Fonte: IQVIA — Atualização mensal
        </Badge>
      </div>

      {/* Tabs por linha de produto */}
      <Tabs defaultValue="laby">
        <TabsList className="mb-4">
          <TabsTrigger value="laby">Laby</TabsTrigger>
          <TabsTrigger value="alivik">Alivik</TabsTrigger>
          <TabsTrigger value="canfora">Bendita Cânfora</TabsTrigger>
        </TabsList>

        <TabsContent value="laby">
          <PainelProduto chave="laby" nomeExibicao="Laby" />
        </TabsContent>
        <TabsContent value="alivik">
          <PainelProduto chave="alivik" nomeExibicao="Alivik" />
        </TabsContent>
        <TabsContent value="canfora">
          <PainelProduto chave="canfora" nomeExibicao="Bendita Cânfora" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
