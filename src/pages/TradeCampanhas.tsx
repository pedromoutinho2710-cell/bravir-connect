import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, Target, TrendingUp } from "lucide-react";

type Campanha = {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  data_inicio: string | null;
  data_fim: string | null;
};

type MetaCampanha = {
  id: string;
  campanha_id: string;
  vendedor_id: string;
  meta_valor: number;
  realizado: number | null;
};

function calcularProgresso(meta: number, realizado: number): number {
  if (meta <= 0) return 0;
  return Math.min(100, Math.round((realizado / meta) * 100));
}

function formatMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function TradeCampanhas() {
  const { data: campanhasAtivas = [], isLoading: loadingCampanhas } = useQuery({
    queryKey: ["campanhas", "ativas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campanhas")
        .select("id, nome, descricao, ativo, data_inicio, data_fim")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return data as Campanha[];
    },
  });

  const { data: metas = [], isLoading: loadingMetas } = useQuery({
    queryKey: ["campanha-metas-vendedor"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await supabase
        .from("campanha_metas")
        .select("id, campanha_id, vendedor_id, meta_valor, realizado")
        .eq("vendedor_id", user.id);
      if (error) throw error;
      return data as MetaCampanha[];
    },
  });

  const isLoading = loadingCampanhas || loadingMetas;

  function getMetaDaCampanha(campanhaId: string): MetaCampanha | undefined {
    return metas.find((m) => m.campanha_id === campanhaId);
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-bold">Campanhas Ativas</h1>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-40 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Trophy className="h-6 w-6 text-yellow-500" />
          Campanhas Ativas
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Acompanhe seu desempenho em todas as campanhas ativas simultaneamente.
        </p>
      </div>

      {campanhasAtivas.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Trophy className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>Nenhuma campanha ativa no momento.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {campanhasAtivas.map((campanha) => {
            const meta = getMetaDaCampanha(campanha.id);
            const realizado = meta?.realizado ?? 0;
            const metaValor = meta?.meta_valor ?? 0;
            const progresso = calcularProgresso(metaValor, realizado);

            return (
              <Card key={campanha.id} className="relative overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base leading-tight">
                      {campanha.nome}
                    </CardTitle>
                    <Badge variant="default" className="shrink-0">
                      Ativa
                    </Badge>
                  </div>
                  {campanha.descricao && (
                    <p className="text-sm text-muted-foreground">
                      {campanha.descricao}
                    </p>
                  )}
                  {(campanha.data_inicio || campanha.data_fim) && (
                    <p className="text-xs text-muted-foreground">
                      {campanha.data_inicio &&
                        `Início: ${new Date(campanha.data_inicio).toLocaleDateString("pt-BR")}`}
                      {campanha.data_inicio && campanha.data_fim && " — "}
                      {campanha.data_fim &&
                        `Fim: ${new Date(campanha.data_fim).toLocaleDateString("pt-BR")}`}
                    </p>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  {meta ? (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-muted rounded-lg p-3">
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                            <Target className="h-3 w-3" />
                            Meta
                          </div>
                          <p className="font-semibold text-sm">
                            {formatMoeda(metaValor)}
                          </p>
                        </div>
                        <div className="bg-muted rounded-lg p-3">
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                            <TrendingUp className="h-3 w-3" />
                            Realizado
                          </div>
                          <p className="font-semibold text-sm">
                            {formatMoeda(realizado)}
                          </p>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Progresso</span>
                          <span>{progresso}%</span>
                        </div>
                        <Progress value={progresso} className="h-2" />
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-2">
                      Nenhuma meta definida para você nesta campanha.
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
