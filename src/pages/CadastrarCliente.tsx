import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Plus, X } from "lucide-react";
import { CLUSTERS } from "@/lib/constants";
import { formatCNPJ, onlyDigits } from "@/lib/format";

const NOME_PRODUTO: Record<string, string> = {
  "1733": "BENDITA CANFORA GEL ATIVE BISN 80G",
  "8": "BENDITA CANFORA GEL RELAXANTE BISN 80G",
  "5936": "BENDITA CANFORA GEL RELAXANTE SACHE 15G DOSE UNICA DISP C/10",
  "11": "BENDITA CANFORA LIQUIDA SPRAY FR 100ML",
  "16": "BENDITA CANFORA TABLETE ESTOJO 28G DISP C/16",
  "4046": "BENDITA CÂNFORA TABLETE POTE C/ 30 X0,75g",
  "17": "BENDITA CANFORA TABLETE POTE C/200 X 0,75G",
  "3704": "BRAVIR ALDERMINA DESOD CREME P/ PES BISN 80G",
  "1062": "BRAVIR ALIVIK 12G DISP C/12",
  "1718": "BRAVIR ALIVIK 40G",
  "1622": "BRAVIR ARNICA GEL BISN 120G",
  "1623": "BRAVIR ARNICA LOCAO FR 240ML",
  "23": "BRAVIR OLEO DE AMENDOAS FR 200ML",
  "4518": "BRAVIR OLEO MINERAL FR 200ML",
  "27": "BRAVIR PASTA D'AGUA BISN 80G",
  "33": "LABY MANT CACAU FPS 8 LUXO BATOM 3,3G DISP C/50",
  "35": "LABY MANT CACAU FPS 8 PUSH PULL 3,2G POTE C/50",
  "6226": "LABY MANT CACAU FPS15 LIQUIDA 10ML DISP C/24",
  "3207": "LABY HIDRAT FPS15 3,6G C/1",
  "3208": "LABY HYALURONIC FPS30 3,6G C/1",
  "4425": "LABY SOS PROT SOL REGENERADOR LABIAL FPS15 3,6G C/1",
  "4562": "LABY CORZINHA FPS 15 VERMELHO AMOR 3,6G C/1",
  "4563": "LABY CORZINHA FPS 15 VIOLETA MAGIA 3,6G C/1",
  "4059": "LABY HIDRATANTE LABIAL CHICLE PUSH PULL 3,2g POTE c/24 SORTIDOS",
  "5309": "LABY CHICLE HIDRATANTE LABIAL TUTTI FRUTTI 10G C/1",
  "5310": "LABY CHICLE HIDRATANTE LABIAL MORANGO 10G C/1",
  "38": "LABY PROT SOL LABIAL FPS15 CEREJA PUSH PULL 3,2G C/1",
  "40": "LABY PROT SOL LABIAL FPS15 MENTA STICK 4,5G C/1",
  "941": "LABY PROT SOL LABIAL FPS15 MORANGO SENSAÇÃO STICK 4,5G C/1",
  "7410": "LABY AZEDINHA HIDRATANTE LABIAL MORANGO 10G C/1",
  "7411": "LABY AZEDINHA HIDRATANTE LABIAL UVA 10G C/1",
  "7414": "LABY AZEDINHA PROT SOL LABIAL FPS8 MORANGO PUSH PULL 3,5G POTE C/30",
  "7413": "LABY CHITA PROT SOL LABIAL FPS8 ABACAXI PUSH PULL 3,5G POTE C/30",
  "7415": "LABY LILITH PROT SOL LABIAL FPS8 MAÇÃ VERDE PUSH PULL 3,5G POTE C/30",
  "8214": "LABY AZEDINHA PROT SOL LABIAL FPS8 MORANGO PUSH PULL 3,5G REFIL C/10UN",
  "8216": "LABY CHITA PROT SOL LABIAL FPS8 ABACAXI PUSH PULL 3,5G REFIL C/10UN",
  "8215": "LABY LILITH PROT SOL LABIAL FPS8 MAÇA VERDE PUSH PULL 3,5G REFIL C/10UN",
  "7412": "LABY TRIO AZEDINHA/LILITH/CHITA PUSH PULL 3,5G POTE C/3",
  "7350": "LABY LILITH LIP OIL MAGIC MAÇÃ VERDE 4ML",
  "8803": "LABY ICEKISS MENTA/CEREJA PUSH PULL 3,5G CARTELA DUPLA C/2",
  "42": "LABY PROT SOL LABIAL FPS30 STICK 4,5G C/1",
  "44": "LABY PROT SOL LABIAL FPS50 STICK 4,5G C/1",
  "8348": "LABY STICK MULTIFUNCIONAL COM COR - COR 1 STICK 12G",
  "7893": "LABY STICK MULTIFUNCIONAL COM COR - COR 2 STICK 12G",
  "8349": "LABY STICK MULTIFUNCIONAL COM COR - COR 3 STICK 12G",
  "7894": "LABY STICK MULTIFUNCIONAL COM COR - COR 4 STICK 12G",
  "8350": "LABY STICK MULTIFUNCIONAL COM COR - COR 5 STICK 12G",
  "7895": "LABY STICK MULTIFUNCIONAL COM COR - COR 6 STICK 12G",
  "8351": "LABY STICK MULTIFUNCIONAL COM COR - COR 7 STICK 12G",
};

const MARCAS_OPCOES = ["Bendita Cânfora", "Bravir", "Laby", "Alivik"] as const;

const PRODUTOS_ALIVIK = ["1062", "1718"];
const PRODUTOS_BRAVIR = ["22", "23", "27", "1622", "1623", "3704", "4518"];
const PRODUTOS_BENDITA = ["8", "11", "16", "17", "1733", "3428", "4046", "5936"];
const PRODUTOS_LABY = [
  "33", "35", "38", "40", "42", "44", "941", "3207", "3708", "3813",
  "4059", "4408", "4409", "4410", "4425", "4456", "4562", "4563",
  "5309", "5310", "6226", "7350", "7410", "7411", "7413", "7414", "7415",
];

type Form = {
  nome_cliente: string;
  cnpj: string;
  razao_social: string;
  contato_principal: string;
  email: string;
  telefone: string;
  classificacao: "Atacado" | "Distribuidor" | "Varejo" | "";
  qtd_vendedores: string;
  marcas_interesse: string[];
  produtos_alivik: string[];
  produtos_bravir: string[];
  produtos_bendita: string[];
  produtos_laby: string[];
  perfil_atacado_distribuidor: string;
  qtd_lojas: string;
  vende_digital: boolean;
  canais_digitais: string[];
  link_ecommerce: string;
  links_marketplace: { plataforma: string; link: string }[];
  percentual_b2c: string;
  percentual_b2b: string;
  cluster_sugerido: string;
  observacoes: string;
  declaracao: boolean;
};

const EMPTY: Form = {
  nome_cliente: "",
  cnpj: "",
  razao_social: "",
  contato_principal: "",
  email: "",
  telefone: "",
  classificacao: "",
  qtd_vendedores: "",
  marcas_interesse: [],
  produtos_alivik: [],
  produtos_bravir: [],
  produtos_bendita: [],
  produtos_laby: [],
  perfil_atacado_distribuidor: "",
  qtd_lojas: "",
  vende_digital: false,
  canais_digitais: [],
  link_ecommerce: "",
  links_marketplace: [],
  percentual_b2c: "",
  percentual_b2b: "",
  cluster_sugerido: "",
  observacoes: "",
  declaracao: false,
};

function toggleArr(arr: string[], val: string): string[] {
  return arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];
}

function CheckboxGroup({
  label,
  items,
  selected,
  onChange,
}: {
  label: string;
  items: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div className="space-y-2">
      <Label className="font-semibold">{label}</Label>
      <div className="flex flex-wrap gap-3">
        {items.map((item) => (
          <label key={item} className="flex items-center gap-2 cursor-pointer text-sm">
            <Checkbox
              checked={selected.includes(item)}
              onCheckedChange={() => onChange(toggleArr(selected, item))}
            />
            {NOME_PRODUTO[item] ?? item}
          </label>
        ))}
      </div>
    </div>
  );
}

export default function CadastrarCliente() {
  const navigate = useNavigate();
  const { user, fullName } = useAuth();
  const [form, setForm] = useState<Form>(EMPTY);
  const [loading, setLoading] = useState(false);

  const set = <K extends keyof Form>(k: K, v: Form[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const isAtacadoDist = form.classificacao === "Atacado" || form.classificacao === "Distribuidor";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.declaracao) {
      toast.error("Confirme a declaração antes de enviar.");
      return;
    }
    if (!form.classificacao) {
      toast.error("Selecione a classificação do cliente.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await (supabase.from("cadastros_pendentes") as any).insert({
        nome_cliente: form.nome_cliente || null,
        cnpj: onlyDigits(form.cnpj) || null,
        razao_social: form.razao_social || null,
        contato_principal: form.contato_principal || null,
        email: form.email || null,
        telefone: form.telefone || null,
        classificacao: form.classificacao || null,
        qtd_vendedores: form.qtd_vendedores ? Number(form.qtd_vendedores) : null,
        perfil_atacado_distribuidor: form.perfil_atacado_distribuidor || null,
        qtd_lojas: form.qtd_lojas || null,
        marcas_interesse: form.marcas_interesse.length > 0 ? form.marcas_interesse : null,
        produtos_alivik: form.produtos_alivik.length > 0 ? form.produtos_alivik : null,
        produtos_bravir: form.produtos_bravir.length > 0 ? form.produtos_bravir : null,
        produtos_bendita: form.produtos_bendita.length > 0 ? form.produtos_bendita : null,
        produtos_laby: form.produtos_laby.length > 0 ? form.produtos_laby : null,
        vende_digital: form.vende_digital,
        canal_ecommerce: form.vende_digital && form.canais_digitais.length > 0
          ? (form.canais_digitais.includes("proprio") && form.canais_digitais.includes("marketplace")
              ? "proprio_e_marketplace"
              : form.canais_digitais[0])
          : null,
        link_ecommerce: form.vende_digital && form.canais_digitais.includes("proprio")
          ? form.link_ecommerce || null
          : null,
        links_marketplace: form.vende_digital && form.canais_digitais.includes("marketplace") && form.links_marketplace.length > 0
          ? JSON.stringify(form.links_marketplace)
          : null,
        percentual_b2c: form.percentual_b2c ? Number(form.percentual_b2c) : null,
        percentual_b2b: form.percentual_b2b ? Number(form.percentual_b2b) : null,
        cluster_sugerido: form.cluster_sugerido || null,
        observacoes: form.observacoes || null,
        status: "aguardando_faturamento",
        origem: "vendedor",
        vendedor_id: user?.id ?? null,
        vendedor_nome: fullName ?? null,
      });
      if (error) throw error;
      toast.success("Cadastro enviado para o faturamento!");
      navigate("/meus-clientes");
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao enviar cadastro.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-10">
      <h1 className="text-2xl font-bold">Cadastrar Novo Cliente</h1>

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Seção 1: Dados básicos */}
        <Card>
          <CardHeader><CardTitle>1. Dados do cliente</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Nome fantasia *</Label>
                <Input
                  required
                  value={form.nome_cliente}
                  onChange={(e) => set("nome_cliente", e.target.value)}
                  placeholder="Como o cliente é conhecido"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Razão social</Label>
                <Input
                  value={form.razao_social}
                  onChange={(e) => set("razao_social", e.target.value)}
                  placeholder="Razão social completa"
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>CNPJ</Label>
                <Input
                  value={form.cnpj}
                  onChange={(e) => set("cnpj", formatCNPJ(e.target.value))}
                  placeholder="00.000.000/0000-00"
                  maxLength={18}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Contato principal *</Label>
                <Input
                  required
                  value={form.contato_principal}
                  onChange={(e) => set("contato_principal", e.target.value)}
                  placeholder="Nome do comprador / responsável"
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>E-mail</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  placeholder="contato@empresa.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Telefone</Label>
                <Input
                  value={form.telefone}
                  onChange={(e) => set("telefone", e.target.value)}
                  placeholder="(00) 00000-0000"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Seção 2: Classificação */}
        <Card>
          <CardHeader><CardTitle>2. Classificação *</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <RadioGroup
              value={form.classificacao}
              onValueChange={(v) => set("classificacao", v as Form["classificacao"])}
              className="flex gap-6"
            >
              {["Atacado", "Distribuidor", "Varejo"].map((c) => (
                <label key={c} className="flex items-center gap-2 cursor-pointer">
                  <RadioGroupItem value={c} />
                  <span className="font-medium">{c}</span>
                </label>
              ))}
            </RadioGroup>

            {isAtacadoDist && (
              <div className="space-y-5 border-t pt-4">
                <div className="space-y-1.5">
                  <Label>Quantidade de vendedores</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.qtd_vendedores}
                    onChange={(e) => set("qtd_vendedores", e.target.value)}
                    placeholder="Ex: 5"
                    className="w-40"
                  />
                </div>

                <CheckboxGroup
                  label="Marcas de interesse"
                  items={MARCAS_OPCOES as unknown as string[]}
                  selected={form.marcas_interesse}
                  onChange={(v) => set("marcas_interesse", v)}
                />

                {form.marcas_interesse.includes("Alivik") && (
                  <CheckboxGroup
                    label="Produtos Alivik"
                    items={PRODUTOS_ALIVIK}
                    selected={form.produtos_alivik}
                    onChange={(v) => set("produtos_alivik", v)}
                  />
                )}
                {form.marcas_interesse.includes("Bravir") && (
                  <CheckboxGroup
                    label="Produtos Bravir"
                    items={PRODUTOS_BRAVIR}
                    selected={form.produtos_bravir}
                    onChange={(v) => set("produtos_bravir", v)}
                  />
                )}
                {form.marcas_interesse.includes("Bendita Cânfora") && (
                  <CheckboxGroup
                    label="Produtos Bendita Cânfora"
                    items={PRODUTOS_BENDITA}
                    selected={form.produtos_bendita}
                    onChange={(v) => set("produtos_bendita", v)}
                  />
                )}
                {form.marcas_interesse.includes("Laby") && (
                  <CheckboxGroup
                    label="Produtos Laby"
                    items={PRODUTOS_LABY}
                    selected={form.produtos_laby}
                    onChange={(v) => set("produtos_laby", v)}
                  />
                )}

                <div className="space-y-2">
                  <Label className="font-semibold">Perfil</Label>
                  <RadioGroup
                    value={form.perfil_atacado_distribuidor}
                    onValueChange={(v) => set("perfil_atacado_distribuidor", v)}
                    className="flex flex-col gap-2"
                  >
                    {["Foco", "Parceiro", "Básico"].map((p) => (
                      <label key={p} className="flex items-center gap-2 cursor-pointer">
                        <RadioGroupItem value={p} />
                        <span>{p}</span>
                      </label>
                    ))}
                  </RadioGroup>
                </div>
              </div>
            )}

            {form.classificacao === "Varejo" && (
              <div className="space-y-2 border-t pt-4">
                <Label className="font-semibold">Quantidade de lojas</Label>
                <RadioGroup
                  value={form.qtd_lojas}
                  onValueChange={(v) => set("qtd_lojas", v)}
                  className="flex flex-col gap-2"
                >
                  {["1 loja", "2–5 lojas", "6–20 lojas", "21+ lojas"].map((q) => (
                    <label key={q} className="flex items-center gap-2 cursor-pointer">
                      <RadioGroupItem value={q} />
                      <span>{q}</span>
                    </label>
                  ))}
                </RadioGroup>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Seção 3: Canais digitais */}
        <Card>
          <CardHeader><CardTitle>3. Canais digitais</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Switch
                checked={form.vende_digital}
                onCheckedChange={(c) => set("vende_digital", c)}
              />
              <Label>Vende pelo digital (redes sociais, WhatsApp, etc.)</Label>
            </div>

            {form.vende_digital && (
              <div className="space-y-4 border-t pt-4">
                {/* Quais canais? */}
                <div className="space-y-2">
                  <Label className="font-semibold">Quais canais utiliza?</Label>
                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-2 cursor-pointer text-sm">
                      <Checkbox
                        checked={form.canais_digitais.includes("proprio")}
                        onCheckedChange={() => set("canais_digitais", toggleArr(form.canais_digitais, "proprio"))}
                      />
                      E-commerce próprio
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-sm">
                      <Checkbox
                        checked={form.canais_digitais.includes("marketplace")}
                        onCheckedChange={() => set("canais_digitais", toggleArr(form.canais_digitais, "marketplace"))}
                      />
                      Marketplace (ex: Amazon, Mercado Livre, Shopee)
                    </label>
                  </div>
                </div>

                {/* E-commerce próprio: link */}
                {form.canais_digitais.includes("proprio") && (
                  <div className="space-y-1.5">
                    <Label>Link do e-commerce</Label>
                    <Input
                      value={form.link_ecommerce}
                      onChange={(e) => set("link_ecommerce", e.target.value)}
                      placeholder="https://sualoja.com.br"
                    />
                  </div>
                )}

                {/* Marketplace: lista de lojas */}
                {form.canais_digitais.includes("marketplace") && (
                  <div className="space-y-3">
                    <Label className="font-semibold">Adicione os links das suas lojas nos marketplaces:</Label>
                    {form.links_marketplace.map((loja, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <Select
                          value={loja.plataforma}
                          onValueChange={(v) => {
                            const updated = [...form.links_marketplace];
                            updated[idx] = { ...updated[idx], plataforma: v };
                            set("links_marketplace", updated);
                          }}
                        >
                          <SelectTrigger className="w-44 shrink-0">
                            <SelectValue placeholder="Plataforma" />
                          </SelectTrigger>
                          <SelectContent>
                            {["Shopee", "Mercado Livre", "Amazon", "Magalu", "Outros"].map((p) => (
                              <SelectItem key={p} value={p}>{p}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          className="flex-1"
                          value={loja.link}
                          onChange={(e) => {
                            const updated = [...form.links_marketplace];
                            updated[idx] = { ...updated[idx], link: e.target.value };
                            set("links_marketplace", updated);
                          }}
                          placeholder="https://shopee.com.br/sualoja"
                        />
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() => set("links_marketplace", form.links_marketplace.filter((_, i) => i !== idx))}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => set("links_marketplace", [...form.links_marketplace, { plataforma: "", link: "" }])}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Adicionar loja
                    </Button>
                  </div>
                )}

                {/* B2C / B2B */}
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>% vendas B2C (consumidor final)</Label>
                    <Input
                      type="number" min={0} max={100}
                      value={form.percentual_b2c}
                      onChange={(e) => set("percentual_b2c", e.target.value)}
                      placeholder="0–100"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>% vendas B2B (revendedor)</Label>
                    <Input
                      type="number" min={0} max={100}
                      value={form.percentual_b2b}
                      onChange={(e) => set("percentual_b2b", e.target.value)}
                      placeholder="0–100"
                    />
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Seção 4: Info comercial */}
        <Card>
          <CardHeader><CardTitle>4. Informações comerciais</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Cluster sugerido</Label>
              <Select value={form.cluster_sugerido} onValueChange={(v) => set("cluster_sugerido", v)}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {CLUSTERS.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea
                rows={4}
                value={form.observacoes}
                onChange={(e) => set("observacoes", e.target.value)}
                placeholder="Informações relevantes sobre o cliente, potencial de compra, contexto da prospecção..."
              />
            </div>
          </CardContent>
        </Card>

        {/* Seção 5: Declaração */}
        <Card>
          <CardHeader><CardTitle>5. Declaração</CardTitle></CardHeader>
          <CardContent>
            <label className="flex items-start gap-3 cursor-pointer">
              <Checkbox
                checked={form.declaracao}
                onCheckedChange={(c) => set("declaracao", c === true)}
                className="mt-0.5"
              />
              <span className="text-sm leading-relaxed">
                Declaro que as informações prestadas são verdadeiras e que este cliente demonstrou interesse
                real em fechar negócio com a Bravir. Estou ciente de que o cadastro será encaminhado
                diretamente ao faturamento para registro no sistema.
              </span>
            </label>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate("/meus-clientes")}>
            Cancelar
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? "Enviando..." : "Enviar cadastro"}
          </Button>
        </div>
      </form>
    </div>
  );
}
