import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Package2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Marca = "Bravir" | "Alivik" | "Bendita" | "Laby";

const MARCAS: Marca[] = ["Bravir", "Alivik", "Bendita", "Laby"];

const PRODUTOS: Record<Marca, string[]> = {
  Bravir: [
    "Arnica Loção FR 240ml",
    "Arnica Gel Bisnaga 120g",
    "Aldermina Desod Creme Pés Bisnaga 80g",
    "Pasta d'Água Bisnaga 80g",
    "Óleo Mineral FR 200ml",
    "Óleo de Amêndoas FR 200ml",
  ],
  Alivik: ["Alivik 12g Disp c/12", "Alivik 40g"],
  Bendita: [
    "Gel Ative Bisnaga 80g",
    "Gel Relaxante Bisnaga 80g",
    "Gel Relaxante Sachê 15g Disp c/10",
    "Tablete Estojo 28g Disp c/16",
    "Tablete Pote c/200 x 0,75g",
    "Tablete Pote c/30 x 0,75g",
    "Líquida Spray FR 100ml",
  ],
  Laby: [
    "Mant Cacau FPS8 Luxo Batom 3,3g",
    "Mant Cacau FPS8 Push Pull 3,2g",
    "Mant Cacau FPS15 Líquida 10ml",
    "Prot Sol Labial FPS15 Cereja",
    "Prot Sol Labial FPS15 Menta Stick 4,5g",
    "Prot Sol Labial FPS15 Morango Stick 4,5g",
    "Prot Sol Labial FPS30 Stick 4,5g",
    "Prot Sol Labial FPS50 Stick 4,5g",
    "Hyaluronic FPS30 3,6g",
    "Hidrat FPS15 3,6g",
    "Corzinha FPS15 Vermelho Amor 3,6g",
    "Corzinha FPS15 Violeta Magia 3,6g",
    "SOS Prot Sol Regenerador FPS15 3,6g",
    "Azedinha Hidrat Labial Morango 10g",
    "Azedinha Hidrat Labial Uva 10g",
    "Lilith Lip Oil Magic Maçã Verde 4ml",
    "Chita Prot Sol FPS8 Abacaxi Push Pull Pote c/30",
    "Hidrat Labial Chiclé Push Pull 3,2g Pote c/24",
    "Chiclé Hidrat Labial Morango",
    "Chiclé Hidrat Labial Tutti Frutti",
    "Stick Multifuncional Cor 1 a 7 12g",
    "Trio Azedinha/Lilith/Chita Pote c/3",
  ],
};

const AREAS_ATUACAO = [
  { id: "revendedor", label: "Revendedor" },
  { id: "atacadista", label: "Atacadista" },
  { id: "loja_varejo", label: "Loja varejo" },
  { id: "marketplace", label: "Marketplace" },
];

function formatCNPJ(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2}\.\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{2}\.\d{3}\.\d{3})(\d)/, "$1/$2")
    .replace(/^(\d{2}\.\d{3}\.\d{3}\/\d{4})(\d)/, "$1-$2");
}

function formatPhone(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.replace(/(\d{1,2})/, "($1");
  if (d.length <= 7) return d.replace(/^(\d{2})(\d+)/, "($1) $2");
  if (d.length === 10) return d.replace(/^(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  return d.replace(/^(\d{2})(\d{1})(\d{4})(\d{4})/, "($1) $2 $3-$4");
}

const schema = z.object({
  razao_social: z.string().min(2, "Obrigatório"),
  cnpj: z.string().min(18, "CNPJ inválido"),
  contato_nome: z.string().min(2, "Obrigatório"),
  telefone: z.string().min(14, "WhatsApp inválido"),
  email: z.union([z.string().email("E-mail inválido"), z.literal("")]).optional(),
  cidade: z.string().optional(),
  uf: z.string().max(2).optional(),
  observacoes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

const GREEN = "#1a6b3a";

export default function EventoFormulario() {
  const [areas, setAreas] = useState<string[]>([]);
  const [areasError, setAreasError] = useState(false);
  const [marcaSelecionada, setMarcaSelecionada] = useState<Marca>("Bravir");
  const [produtosSelecionados, setProdutosSelecionados] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    reset,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  function toggleArea(id: string) {
    setAreasError(false);
    setAreas((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  }

  function toggleProduto(nome: string) {
    setProdutosSelecionados((prev) =>
      prev.includes(nome) ? prev.filter((p) => p !== nome) : [...prev, nome]
    );
  }

  async function onSubmit(data: FormData) {
    if (areas.length === 0) {
      setAreasError(true);
      return;
    }

    setLoading(true);
    setSubmitError(null);

    const marcasInteresse = [
      ...new Set(
        produtosSelecionados
          .map((p) => {
            for (const [marca, produtos] of Object.entries(PRODUTOS)) {
              if (produtos.includes(p)) return marca.toLowerCase();
            }
            return "";
          })
          .filter(Boolean)
      ),
    ];

    const { error } = await (supabase as any).from("leads_evento").insert({
      razao_social: data.razao_social,
      cnpj: data.cnpj,
      contato_nome: data.contato_nome,
      telefone: data.telefone,
      email: data.email || null,
      cidade: data.cidade || null,
      uf: data.uf || null,
      areas_atuacao: areas,
      marcas_interesse: marcasInteresse.length > 0 ? marcasInteresse : null,
      produtos_interesse: produtosSelecionados.length > 0 ? produtosSelecionados : null,
      observacoes: data.observacoes || null,
      origem: "formulario",
      status: "novo",
    });

    setLoading(false);

    if (error) {
      setSubmitError("Erro ao enviar. Tente novamente.");
      return;
    }

    setSubmitted(true);
  }

  function handleReset() {
    setSubmitted(false);
    setAreas([]);
    setProdutosSelecionados([]);
    setAreasError(false);
    setSubmitError(null);
    reset();
  }

  // ─── Tela de sucesso ───────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <header className="px-6 py-4 shadow-sm" style={{ backgroundColor: GREEN }}>
          <span className="text-white font-bold text-2xl tracking-widest">BRAVIR</span>
        </header>
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-sm">
            <CheckCircle2
              className="mx-auto mb-5 h-20 w-20"
              style={{ color: GREEN }}
            />
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Obrigado!</h2>
            <p className="text-gray-500 mb-8">
              Nossa equipe entrará em contato em breve.
            </p>
            <Button
              onClick={handleReset}
              className="text-white px-8 hover:opacity-90"
              style={{ backgroundColor: GREEN }}
            >
              Voltar ao início
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Painel de produtos (reutilizado em mobile e desktop) ──────────────────
  const ProductPanel = (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <span
          className="inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-bold shrink-0"
          style={{ backgroundColor: GREEN }}
        >
          3
        </span>
        <span className="font-semibold text-gray-800">Produtos de interesse</span>
        <span className="text-xs text-gray-400 ml-1">(opcional)</span>
      </div>

      {/* Brand pills */}
      <div className="flex flex-wrap gap-2 mt-4 mb-4">
        {MARCAS.map((marca) => {
          const active = marcaSelecionada === marca;
          return (
            <button
              key={marca}
              type="button"
              onClick={() => setMarcaSelecionada(marca)}
              className={cn(
                "px-4 py-1.5 rounded-full text-sm font-medium border transition-all",
                active
                  ? "text-white shadow-sm"
                  : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
              )}
              style={active ? { backgroundColor: GREEN, borderColor: GREEN } : {}}
            >
              {marca}
            </button>
          );
        })}
      </div>

      {/* Product grid */}
      <div className="grid grid-cols-2 gap-2 max-h-[440px] overflow-y-auto pr-1">
        {PRODUTOS[marcaSelecionada].map((produto) => {
          const selected = produtosSelecionados.includes(produto);
          return (
            <button
              key={produto}
              type="button"
              onClick={() => toggleProduto(produto)}
              className={cn(
                "flex flex-col items-center gap-2 p-3 rounded-lg border text-center text-xs font-medium transition-all",
                selected
                  ? "text-white shadow-sm"
                  : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
              )}
              style={
                selected
                  ? { backgroundColor: GREEN, borderColor: GREEN }
                  : {}
              }
            >
              <div
                className={cn(
                  "w-12 h-12 rounded-md flex items-center justify-center shrink-0",
                  selected ? "bg-white/20" : "bg-gray-100"
                )}
              >
                <Package2
                  className={cn("h-6 w-6", selected ? "text-white" : "text-gray-400")}
                />
              </div>
              <span className="leading-snug">{produto}</span>
            </button>
          );
        })}
      </div>

      {produtosSelecionados.length > 0 && (
        <p className="mt-3 text-xs text-gray-500">
          {produtosSelecionados.length} produto
          {produtosSelecionados.length > 1 ? "s" : ""} selecionado
          {produtosSelecionados.length > 1 ? "s" : ""}
        </p>
      )}
    </div>
  );

  // ─── Formulário principal ──────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="px-6 py-4 shadow-sm" style={{ backgroundColor: GREEN }}>
        <span className="text-white font-bold text-2xl tracking-widest">BRAVIR</span>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 md:px-8">
        <div className="mb-8 text-center">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-800">
            Cadastro de Interesse
          </h1>
          <p className="mt-1 text-gray-500">
            Preencha seus dados e nossa equipe entrará em contato.
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 lg:items-start">

            {/* ── LEFT: produto selector (desktop only) ── */}
            <aside className="hidden lg:block lg:w-[44%] bg-white rounded-xl border border-gray-100 shadow-sm p-6 sticky top-8">
              {ProductPanel}
            </aside>

            {/* ── RIGHT: form sections ── */}
            <div className="flex-1 flex flex-col gap-5">

              {/* Passo 1 — Dados da empresa */}
              <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
                <h2 className="font-semibold text-gray-800 mb-5 flex items-center gap-2">
                  <span
                    className="inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-bold shrink-0"
                    style={{ backgroundColor: GREEN }}
                  >
                    1
                  </span>
                  Dados da empresa
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Razão social */}
                  <div className="sm:col-span-2">
                    <Label htmlFor="razao_social">Razão social *</Label>
                    <Input
                      id="razao_social"
                      {...register("razao_social")}
                      className={cn("mt-1", errors.razao_social && "border-red-400 focus-visible:ring-red-300")}
                      placeholder="Nome da empresa"
                    />
                    {errors.razao_social && (
                      <p className="mt-1 text-xs text-red-500">{errors.razao_social.message}</p>
                    )}
                  </div>

                  {/* CNPJ */}
                  <div>
                    <Label htmlFor="cnpj">CNPJ *</Label>
                    <Controller
                      name="cnpj"
                      control={control}
                      render={({ field }) => (
                        <Input
                          id="cnpj"
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(formatCNPJ(e.target.value))}
                          onBlur={field.onBlur}
                          className={cn("mt-1", errors.cnpj && "border-red-400 focus-visible:ring-red-300")}
                          placeholder="00.000.000/0000-00"
                          inputMode="numeric"
                        />
                      )}
                    />
                    {errors.cnpj && (
                      <p className="mt-1 text-xs text-red-500">{errors.cnpj.message}</p>
                    )}
                  </div>

                  {/* Nome do contato */}
                  <div>
                    <Label htmlFor="contato_nome">Nome do contato *</Label>
                    <Input
                      id="contato_nome"
                      {...register("contato_nome")}
                      className={cn("mt-1", errors.contato_nome && "border-red-400 focus-visible:ring-red-300")}
                      placeholder="Seu nome"
                    />
                    {errors.contato_nome && (
                      <p className="mt-1 text-xs text-red-500">{errors.contato_nome.message}</p>
                    )}
                  </div>

                  {/* WhatsApp */}
                  <div>
                    <Label htmlFor="telefone">WhatsApp *</Label>
                    <Controller
                      name="telefone"
                      control={control}
                      render={({ field }) => (
                        <Input
                          id="telefone"
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(formatPhone(e.target.value))}
                          onBlur={field.onBlur}
                          className={cn("mt-1", errors.telefone && "border-red-400 focus-visible:ring-red-300")}
                          placeholder="(00) 9 0000-0000"
                          inputMode="tel"
                        />
                      )}
                    />
                    {errors.telefone && (
                      <p className="mt-1 text-xs text-red-500">{errors.telefone.message}</p>
                    )}
                  </div>

                  {/* E-mail */}
                  <div>
                    <Label htmlFor="email">E-mail</Label>
                    <Input
                      id="email"
                      type="email"
                      {...register("email")}
                      className={cn("mt-1", errors.email && "border-red-400 focus-visible:ring-red-300")}
                      placeholder="contato@empresa.com"
                    />
                    {errors.email && (
                      <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>
                    )}
                  </div>

                  {/* Cidade + UF */}
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <Label htmlFor="cidade">Cidade</Label>
                      <Input
                        id="cidade"
                        {...register("cidade")}
                        className="mt-1"
                        placeholder="Cidade"
                      />
                    </div>
                    <div className="w-20">
                      <Label htmlFor="uf">UF</Label>
                      <Controller
                        name="uf"
                        control={control}
                        render={({ field }) => (
                          <Input
                            id="uf"
                            value={field.value ?? ""}
                            onChange={(e) =>
                              field.onChange(e.target.value.toUpperCase().slice(0, 2))
                            }
                            onBlur={field.onBlur}
                            className="mt-1"
                            placeholder="SP"
                            maxLength={2}
                          />
                        )}
                      />
                    </div>
                  </div>
                </div>
              </section>

              {/* Passo 2 — Área de atuação */}
              <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
                <h2 className="font-semibold text-gray-800 mb-5 flex items-center gap-2">
                  <span
                    className="inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-bold shrink-0"
                    style={{ backgroundColor: GREEN }}
                  >
                    2
                  </span>
                  Área de atuação *
                </h2>

                <div className="grid grid-cols-2 gap-3">
                  {AREAS_ATUACAO.map((area) => {
                    const checked = areas.includes(area.id);
                    return (
                      <label
                        key={area.id}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all select-none",
                          checked
                            ? "bg-green-50 border-2"
                            : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                        )}
                        style={checked ? { borderColor: GREEN } : {}}
                      >
                        <Checkbox
                          id={area.id}
                          checked={checked}
                          onCheckedChange={() => toggleArea(area.id)}
                          className="shrink-0"
                          style={checked ? { backgroundColor: GREEN, borderColor: GREEN } : {}}
                        />
                        <span className="text-sm font-medium text-gray-700">
                          {area.label}
                        </span>
                      </label>
                    );
                  })}
                </div>

                {areasError && (
                  <p className="mt-3 text-xs text-red-500">
                    Selecione pelo menos uma área de atuação
                  </p>
                )}
              </section>

              {/* Passo 3 — Produtos (mobile only) */}
              <section className="lg:hidden bg-white rounded-xl border border-gray-100 shadow-sm p-6">
                {ProductPanel}
              </section>

              {/* Observações */}
              <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
                <Label htmlFor="observacoes" className="text-sm font-medium text-gray-800">
                  Observações{" "}
                  <span className="text-gray-400 font-normal">(opcional)</span>
                </Label>
                <Textarea
                  id="observacoes"
                  {...register("observacoes")}
                  className="mt-2 resize-none"
                  rows={3}
                  placeholder="Alguma observação adicional?"
                />
              </section>

              {submitError && (
                <p className="text-sm text-red-500 text-center">{submitError}</p>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full py-6 text-base font-semibold text-white hover:opacity-90 transition-opacity"
                style={{ backgroundColor: GREEN }}
              >
                {loading ? "Enviando..." : "Enviar interesse"}
              </Button>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}
