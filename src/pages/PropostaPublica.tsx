import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, formatCNPJ } from "@/lib/format";

type ItemProposta = {
  produto_id: string;
  nome: string;
  codigo: string;
  marca: string;
  quantidade: number;
  preco_final: number;
  total: number;
};

type OrderBumpProduto = { id: string; nome: string; marca: string };

type Proposta = {
  id: string;
  token: string;
  mensagem: string | null;
  validade_em: string;
  desconto_avista: number;
  order_bump_produto_id: string | null;
  order_bump_desconto: number;
  order_bump_quantidade: number;
  order_bump_aceito: boolean;
  status: string;
  pedido: {
    id: string;
    numero_pedido: number;
    tipo: string;
    cond_pagamento: string | null;
    itens: ItemProposta[];
  };
  cliente: { razao_social: string; cnpj: string };
  vendedor_id: string;
  order_bump_produto: OrderBumpProduto | null;
};

type Estado = "loading" | "ok" | "nao_encontrada" | "expirada" | "confirmada" | "recusada";

const VERDE = "#004d1a";
const VERDE_ESCURO = "#003d14";
const LARANJA = "#EF9F27";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function formatTempo(ms: number) {
  if (ms <= 0) return "00:00:00";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export default function PropostaPublica() {
  const { token } = useParams<{ token: string }>();
  const [estado, setEstado] = useState<Estado>("loading");
  const [proposta, setProposta] = useState<Proposta | null>(null);
  const [tempoRestante, setTempoRestante] = useState<string>("00:00:00");
  const [orderBumpAceito, setOrderBumpAceito] = useState(false);
  const [processando, setProcessando] = useState(false);

  useEffect(() => {
    let cancelado = false;

    async function carregar() {
      if (!token) {
        setEstado("nao_encontrada");
        return;
      }

      try {
        const { data: prop, error } = await (supabase as any)
          .from("propostas")
          .select("*")
          .eq("token", token)
          .single();

        if (error || !prop) {
          if (!cancelado) setEstado("nao_encontrada");
          return;
        }

        const [pedidoRes, clienteRes, obProdRes] = await Promise.all([
          supabase
            .from("pedidos")
            .select(
              "id, numero_pedido, tipo, cond_pagamento, itens_pedido(produto_id, quantidade, preco_final, total_item, produtos(nome, codigo_jiva, marca))"
            )
            .eq("id", prop.pedido_id)
            .single(),
          supabase
            .from("clientes")
            .select("razao_social, cnpj")
            .eq("id", prop.cliente_id)
            .single(),
          prop.order_bump_produto_id
            ? supabase
                .from("produtos")
                .select("id, nome, marca")
                .eq("id", prop.order_bump_produto_id)
                .eq("disponivel", true)
                .single()
            : Promise.resolve({ data: null, error: null } as any),
        ]);

        if (pedidoRes.error || !pedidoRes.data || clienteRes.error || !clienteRes.data) {
          if (!cancelado) setEstado("nao_encontrada");
          return;
        }

        const pedidoData: any = pedidoRes.data;
        const itens: ItemProposta[] = (pedidoData.itens_pedido || []).map((it: any) => ({
          produto_id: it.produto_id,
          nome: it.produtos?.nome ?? "",
          codigo: it.produtos?.codigo_jiva ?? "",
          marca: it.produtos?.marca ?? "",
          quantidade: it.quantidade,
          preco_final: Number(it.preco_final),
          total: Number(it.total_item),
        }));

        const propostaCompleta: Proposta = {
          id: prop.id,
          token: prop.token,
          mensagem: prop.mensagem,
          validade_em: prop.validade_em,
          desconto_avista: Number(prop.desconto_avista ?? 0),
          order_bump_produto_id: prop.order_bump_produto_id,
          order_bump_desconto: Number(prop.order_bump_desconto ?? 0),
          order_bump_quantidade: Number(prop.order_bump_quantidade ?? 0),
          order_bump_aceito: !!prop.order_bump_aceito,
          status: prop.status,
          pedido: {
            id: pedidoData.id,
            numero_pedido: pedidoData.numero_pedido,
            tipo: pedidoData.tipo,
            cond_pagamento: pedidoData.cond_pagamento,
            itens,
          },
          cliente: {
            razao_social: (clienteRes.data as any).razao_social,
            cnpj: (clienteRes.data as any).cnpj,
          },
          vendedor_id: prop.vendedor_id,
          order_bump_produto: obProdRes?.data
            ? {
                id: (obProdRes.data as any).id,
                nome: (obProdRes.data as any).nome,
                marca: (obProdRes.data as any).marca,
              }
            : null,
        };

        if (cancelado) return;

        setProposta(propostaCompleta);
        setOrderBumpAceito(propostaCompleta.order_bump_aceito);

        if (propostaCompleta.status === "confirmada") {
          setEstado("confirmada");
          return;
        }
        if (propostaCompleta.status === "recusada") {
          setEstado("recusada");
          return;
        }
        if (new Date(propostaCompleta.validade_em).getTime() <= Date.now()) {
          setEstado("expirada");
          return;
        }
        setEstado("ok");
      } catch {
        if (!cancelado) setEstado("nao_encontrada");
      }
    }

    carregar();
    return () => {
      cancelado = true;
    };
  }, [token]);

  useEffect(() => {
    if (estado !== "ok" || !proposta) return;
    const validade = new Date(proposta.validade_em).getTime();

    const tick = () => {
      const diff = validade - Date.now();
      if (diff <= 0) {
        setTempoRestante("00:00:00");
        setEstado("expirada");
        return;
      }
      setTempoRestante(formatTempo(diff));
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [estado, proposta]);

  async function confirmar() {
    if (!proposta || processando) return;
    setProcessando(true);
    try {
      await (supabase as any)
        .from("propostas")
        .update({
          status: "confirmada",
          respondida_em: new Date().toISOString(),
          order_bump_aceito: orderBumpAceito,
        })
        .eq("id", proposta.id);

      await supabase
        .from("pedidos")
        .update({ status: "pendente_sankhya" })
        .eq("id", proposta.pedido.id);

      await (supabase as any).from("notificacoes").insert({
        destinatario_id: proposta.vendedor_id,
        destinatario_role: "vendedor",
        tipo: "proposta_confirmada",
        mensagem: `Proposta do pedido #${proposta.pedido.numero_pedido} confirmada pelo cliente!`,
      });

      setEstado("confirmada");
    } finally {
      setProcessando(false);
    }
  }

  async function recusar() {
    if (!proposta || processando) return;
    setProcessando(true);
    try {
      await (supabase as any)
        .from("propostas")
        .update({
          status: "recusada",
          respondida_em: new Date().toISOString(),
        })
        .eq("id", proposta.id);

      await (supabase as any).from("notificacoes").insert({
        destinatario_id: proposta.vendedor_id,
        destinatario_role: "vendedor",
        tipo: "proposta_recusada",
        mensagem: `Proposta do pedido #${proposta.pedido.numero_pedido} foi recusada pelo cliente.`,
      });

      setEstado("recusada");
    } finally {
      setProcessando(false);
    }
  }

  if (estado === "loading") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            width: 36,
            height: 36,
            border: `3px solid #e5e7eb`,
            borderTopColor: VERDE,
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (estado === "nao_encontrada") {
    return (
      <Centralizado>
        <div style={{ padding: 24, textAlign: "center", color: "#374151" }}>Proposta não encontrada</div>
      </Centralizado>
    );
  }

  if (estado === "expirada") {
    return (
      <Centralizado>
        <Header />
        <div style={{ padding: 32, textAlign: "center" }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: VERDE, marginBottom: 8 }}>⏰ Proposta expirada</div>
          <div style={{ fontSize: 13, color: "#6b7280" }}>
            Entre em contato com seu representante para renovar.
          </div>
        </div>
      </Centralizado>
    );
  }

  if (estado === "confirmada") {
    return (
      <Centralizado>
        <Header />
        <div style={{ padding: 32, textAlign: "center" }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: VERDE, marginBottom: 8 }}>✓ Pedido confirmado!</div>
          <div style={{ fontSize: 13, color: "#6b7280" }}>
            Seu representante entrará em contato em breve.
          </div>
        </div>
      </Centralizado>
    );
  }

  if (estado === "recusada") {
    return (
      <Centralizado>
        <Header />
        <div style={{ padding: 32, textAlign: "center" }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: VERDE, marginBottom: 8 }}>Proposta recusada.</div>
          <div style={{ fontSize: 13, color: "#6b7280" }}>Seu representante fará o follow-up.</div>
        </div>
      </Centralizado>
    );
  }

  if (!proposta) return null;

  const ehBonificacao = proposta.pedido.tipo === "Bonificação";
  const subtotal = proposta.pedido.itens.reduce((acc, it) => acc + it.total, 0);
  const qtdTotal = proposta.pedido.itens.reduce((acc, it) => acc + it.quantidade, 0);
  const totalComDescontoAvista = subtotal * (1 - proposta.desconto_avista / 100);

  return (
    <Centralizado>
      {/* Header */}
      <div style={{ background: VERDE, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              background: "#fff",
              borderRadius: 6,
              padding: "4px 10px",
              fontWeight: 700,
              color: VERDE,
              fontSize: 16,
              letterSpacing: 0.5,
            }}
          >
            BRAVIR
          </div>
          <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 12 }}>Proposta comercial exclusiva</div>
        </div>
      </div>

      {/* Timer */}
      <div
        style={{
          background: VERDE_ESCURO,
          padding: "8px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>
          Válida por
        </div>
        <div style={{ color: LARANJA, fontSize: 16, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
          {tempoRestante}
        </div>
      </div>

      {/* Corpo */}
      <div style={{ background: "#fff", padding: "14px 16px" }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{proposta.cliente.razao_social}</div>
        <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{formatCNPJ(proposta.cliente.cnpj)}</div>

        {proposta.mensagem && (
          <div
            style={{
              marginTop: 12,
              background: "#f0f7f3",
              borderLeft: `3px solid ${VERDE}`,
              borderRadius: "0 6px 6px 0",
              padding: "8px 10px",
              fontSize: 12,
              color: "#4b5563",
              fontStyle: "italic",
            }}
          >
            {proposta.mensagem}
          </div>
        )}

        {/* Produtos */}
        <SecaoLabel>Produtos</SecaoLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {proposta.pedido.itens.map((it) => (
            <div
              key={it.produto_id}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 12 }}>{it.nome}</div>
                <div style={{ color: "#6b7280", fontSize: 10, marginTop: 2 }}>
                  {it.quantidade}un · {formatBRL(it.preco_final)}/un
                </div>
              </div>
              <div style={{ fontWeight: 600, fontSize: 12, whiteSpace: "nowrap" }}>{formatBRL(it.total)}</div>
            </div>
          ))}
        </div>

        {/* Bonificado */}
        {ehBonificacao && (
          <>
            <SecaoLabel>Bonificado</SecaoLabel>
            <div
              style={{
                background: "#f7faf8",
                border: "1px solid #e0ede6",
                borderRadius: 6,
                padding: "6px 8px",
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                rowGap: 4,
                columnGap: 8,
                fontSize: 11,
              }}
            >
              <div style={{ color: "#6b7280" }}>Qtd paga</div>
              <div style={{ textAlign: "right", fontWeight: 600 }}>{qtdTotal}un</div>
              <div style={{ color: "#6b7280" }}>Bonificada</div>
              <div style={{ textAlign: "right", fontWeight: 600 }}>{qtdTotal}un</div>
              <div style={{ color: "#6b7280" }}>Total leva</div>
              <div style={{ textAlign: "right", fontWeight: 600 }}>{qtdTotal * 2}un</div>
              <div style={{ color: "#6b7280" }}>Economia</div>
              <div style={{ textAlign: "right", fontWeight: 600, color: VERDE }}>{formatBRL(subtotal)}</div>
            </div>
          </>
        )}

        {/* Resumo financeiro */}
        <div
          style={{
            marginTop: 14,
            background: "#f7faf8",
            border: "1px solid #e0ede6",
            borderRadius: 8,
            padding: "10px 12px",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <Linha label="Subtotal" valor={formatBRL(subtotal)} />
          {ehBonificacao && <Linha label="Bonificação" valor={formatBRL(subtotal)} corValor={VERDE} />}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: 15,
              fontWeight: 700,
              color: VERDE,
              borderTop: "1px solid #e0ede6",
              paddingTop: 6,
              marginTop: 2,
            }}
          >
            <span>Total</span>
            <span>{formatBRL(subtotal)}</span>
          </div>
        </div>

        {/* Desconto à vista */}
        {proposta.desconto_avista > 0 && (
          <div
            style={{
              marginTop: 12,
              background: VERDE,
              borderRadius: 8,
              padding: "10px 12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              color: "#fff",
            }}
          >
            <div>
              <div style={{ fontSize: 12, fontWeight: 600 }}>Desconto à vista</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.85)", marginTop: 2 }}>
                Pagando hoje: {formatBRL(totalComDescontoAvista)}
              </div>
            </div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{proposta.desconto_avista}% off</div>
          </div>
        )}

        {/* Condição de pagamento */}
        {proposta.pedido.cond_pagamento && (
          <div
            style={{
              marginTop: 10,
              background: "#f3f4f6",
              borderRadius: 6,
              padding: "8px 10px",
              fontSize: 11,
              color: "#4b5563",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>📅</span>
            <span>{proposta.pedido.cond_pagamento}</span>
          </div>
        )}

        {/* Order bump */}
        {proposta.order_bump_produto && proposta.status === "pendente" && (
          <div
            style={{
              marginTop: 14,
              border: "2px dashed #00a63e",
              borderRadius: 10,
              background: "#f0f9f3",
              padding: 12,
              position: "relative",
            }}
          >
            <div
              style={{
                display: "inline-block",
                background: VERDE,
                color: "#fff",
                fontSize: 10,
                fontWeight: 600,
                padding: "3px 8px",
                borderRadius: 4,
                marginBottom: 8,
              }}
            >
              ⭐ Sugestão especial
            </div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{proposta.order_bump_produto.nome}</div>
            <div style={{ fontSize: 11, color: "#4b5563", marginTop: 4 }}>
              Adicione {proposta.order_bump_quantidade}un com {proposta.order_bump_desconto}% de desconto especial
            </div>
            {orderBumpAceito ? (
              <div style={{ marginTop: 10, color: VERDE, fontWeight: 600, fontSize: 12 }}>✓ Adicionado!</div>
            ) : (
              <button
                onClick={() => setOrderBumpAceito(true)}
                style={{
                  marginTop: 10,
                  background: VERDE,
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  padding: "8px 12px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  width: "100%",
                }}
              >
                ＋ Adicionar ao pedido
              </button>
            )}
          </div>
        )}
      </div>

      {/* Botões de ação */}
      {proposta.status === "pendente" && (
        <div
          style={{
            padding: "10px 16px",
            background: "#fff",
            display: "flex",
            gap: 8,
            borderTop: "1px solid #e5e7eb",
          }}
        >
          <button
            onClick={recusar}
            disabled={processando}
            style={{
              flex: 1,
              background: "#f3f4f6",
              color: "#374151",
              border: "none",
              borderRadius: 8,
              padding: "12px",
              fontSize: 13,
              fontWeight: 600,
              cursor: processando ? "not-allowed" : "pointer",
              opacity: processando ? 0.6 : 1,
            }}
          >
            Recusar
          </button>
          <button
            onClick={confirmar}
            disabled={processando}
            style={{
              flex: 2,
              background: VERDE,
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "12px",
              fontSize: 14,
              fontWeight: 700,
              cursor: processando ? "not-allowed" : "pointer",
              opacity: processando ? 0.6 : 1,
            }}
          >
            ✓ Confirmar pedido
          </button>
        </div>
      )}
    </Centralizado>
  );
}

function Centralizado({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", display: "flex", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 480, background: "#fff", minHeight: "100vh" }}>{children}</div>
    </div>
  );
}

function Header() {
  return (
    <div style={{ background: VERDE, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            background: "#fff",
            borderRadius: 6,
            padding: "4px 10px",
            fontWeight: 700,
            color: VERDE,
            fontSize: 16,
            letterSpacing: 0.5,
          }}
        >
          BRAVIR
        </div>
        <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 12 }}>Proposta comercial exclusiva</div>
      </div>
    </div>
  );
}

function SecaoLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "14px 0 8px" }}>
      <span style={{ color: VERDE, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {children}
      </span>
      <span style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
    </div>
  );
}

function Linha({ label, valor, corValor }: { label: string; valor: string; corValor?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
      <span style={{ color: "#6b7280" }}>{label}</span>
      <span style={{ fontWeight: 600, color: corValor ?? "#111827" }}>{valor}</span>
    </div>
  );
}
