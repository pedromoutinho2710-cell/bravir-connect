import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/format";

type ItemSim = {
  produto_id: string;
  nome: string;
  custo: number;
  preco_revenda: number;
  markup: number;
  margem: number;
};

export default function CalculadoraPublica() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [itens, setItens] = useState<ItemSim[] | null>(null);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    (async () => {
      const { data, error } = await (supabase as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (
              col: string,
              val: string,
            ) => { single: () => Promise<{ data: { itens: string | ItemSim[] } | null; error: unknown }> };
          };
        };
      })
        .from("simulacoes_margem")
        .select("*")
        .eq("token", token)
        .single();

      if (error || !data) {
        setItens(null);
      } else {
        try {
          const parsed = typeof data.itens === "string" ? JSON.parse(data.itens) : data.itens;
          setItens(Array.isArray(parsed) ? (parsed as ItemSim[]) : null);
        } catch {
          setItens(null);
        }
      }
      setLoading(false);
    })();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="h-6 w-6 animate-spin text-[#006130]" />
      </div>
    );
  }

  if (!itens || itens.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-4">
        <p className="text-sm text-gray-500 text-center">Simulação não encontrada.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="mx-auto bg-white min-h-screen" style={{ maxWidth: 480 }}>
        <div style={{ backgroundColor: "#006130", padding: 16 }}>
          <div className="flex items-center gap-3">
            <div
              style={{
                backgroundColor: "white",
                borderRadius: 8,
                padding: "6px 10px",
                fontWeight: 700,
                color: "#006130",
                fontSize: 14,
                letterSpacing: 0.5,
              }}
            >
              BRAVIR
            </div>
            <div className="text-white/70 text-sm">Simulação de margem de revenda</div>
          </div>
        </div>

        <div style={{ padding: 16 }}>
          <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
            Veja quanto você lucra revendendo os produtos Bravir:
          </p>

          {itens.map((it) => (
            <div
              key={it.produto_id}
              style={{
                backgroundColor: "#f7faf8",
                border: "1px solid #e0ede6",
                borderRadius: 8,
                padding: 12,
                marginBottom: 8,
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{it.nome}</div>
              <div style={{ color: "#006130", fontSize: 11, fontWeight: 500 }}>
                Seu custo: {formatBRL(it.custo)}/un
              </div>
              <div style={{ color: "#6b7280", fontSize: 11, marginBottom: 8 }}>
                Revenda sugerida: {formatBRL(it.preco_revenda)}/un
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span
                  style={{
                    backgroundColor: "#f0f7f3",
                    color: "#006130",
                    border: "1px solid #c8e6d2",
                    borderRadius: 6,
                    padding: "2px 8px",
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  Markup {it.markup.toFixed(1)}%
                </span>
                <span
                  style={{
                    backgroundColor: "#E6F1FB",
                    color: "#185FA5",
                    borderRadius: 6,
                    padding: "2px 8px",
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  Margem {it.margem.toFixed(1)}%
                </span>
              </div>
            </div>
          ))}

          <div
            style={{
              fontSize: 11,
              color: "#6b7280",
              textAlign: "center",
              marginTop: 16,
              lineHeight: 1.5,
            }}
          >
            <div>Valores baseados na sua proposta Bravir.</div>
            <div>Entre em contato com seu representante para negociar.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
