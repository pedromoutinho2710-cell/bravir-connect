import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { CLUSTERS } from "@/lib/constants";
import { formatCNPJ, onlyDigits } from "@/lib/format";

type Vendedor = { id: string; nome: string };

type Form = {
  razao_social: string;
  cnpj: string;
  email: string;
  telefone: string;
  comprador: string;
  cidade: string;
  uf: string;
  cep: string;
  rua: string;
  numero: string;
  bairro: string;
  cluster: string;
  vendedor_id: string;
  negativado: boolean;
  tabela_preco: string;
  suframa: boolean;
  observacoes: string;
};

const EMPTY: Form = {
  razao_social: "",
  cnpj: "",
  email: "",
  telefone: "",
  comprador: "",
  cidade: "",
  uf: "",
  cep: "",
  rua: "",
  numero: "",
  bairro: "",
  cluster: "",
  vendedor_id: "",
  negativado: false,
  tabela_preco: "",
  suframa: false,
  observacoes: "",
};

const UFS = [
  "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT",
  "PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO",
];

export default function CadastrarClienteGestora() {
  const navigate = useNavigate();
  const [form, setForm] = useState<Form>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  useEffect(() => {
    const load = async () => {
      const [profRes, rolesRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email"),
        supabase.from("user_roles").select("user_id").eq("role", "vendedor"),
      ]);
      const vendedorIds = new Set((rolesRes.data ?? []).map((r) => r.user_id));
      setVendedores(
        (profRes.data ?? [])
          .filter((p) => vendedorIds.has(p.id))
          .map((p) => ({ id: p.id, nome: p.full_name || p.email }))
          .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
      );
    };
    load();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.razao_social.trim()) {
      toast.error("Razão social é obrigatória.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await (supabase.from("clientes") as any).insert({
        razao_social: form.razao_social.trim(),
        cnpj: onlyDigits(form.cnpj) || null,
        email: form.email || null,
        telefone: form.telefone || null,
        comprador: form.comprador || null,
        cidade: form.cidade || null,
        uf: form.uf || null,
        cep: form.cep || null,
        rua: form.rua || null,
        numero: form.numero || null,
        bairro: form.bairro || null,
        cluster: form.cluster || null,
        vendedor_id: form.vendedor_id || null,
        negativado: form.negativado,
        tabela_preco: form.tabela_preco || null,
        suframa: form.suframa,
        observacoes_trade: form.observacoes || null,
        status: "ativo",
      });
      if (error) throw error;
      toast.success("Cliente cadastrado com sucesso!");
      navigate("/gestora");
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao cadastrar cliente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-10">
      <div>
        <h1 className="text-2xl font-bold">Cadastrar Cliente</h1>
        <p className="text-sm text-muted-foreground">Cadastro direto no sistema — sem passar pelo faturamento</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Dados principais */}
        <Card>
          <CardHeader><CardTitle>1. Dados do cliente</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Razão social *</Label>
                <Input
                  required
                  value={form.razao_social}
                  onChange={(e) => set("razao_social", e.target.value)}
                  placeholder="Razão social completa"
                />
              </div>
              <div className="space-y-1.5">
                <Label>CNPJ</Label>
                <Input
                  value={form.cnpj}
                  onChange={(e) => set("cnpj", formatCNPJ(e.target.value))}
                  placeholder="00.000.000/0000-00"
                  maxLength={18}
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
            <div className="space-y-1.5">
              <Label>Comprador / Contato principal</Label>
              <Input
                value={form.comprador}
                onChange={(e) => set("comprador", e.target.value)}
                placeholder="Nome do responsável pelo contato"
              />
            </div>
          </CardContent>
        </Card>

        {/* Endereço */}
        <Card>
          <CardHeader><CardTitle>2. Endereço</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1.5 md:col-span-2">
                <Label>Rua / Logradouro</Label>
                <Input
                  value={form.rua}
                  onChange={(e) => set("rua", e.target.value)}
                  placeholder="Rua, Av., etc."
                />
              </div>
              <div className="space-y-1.5">
                <Label>Número</Label>
                <Input
                  value={form.numero}
                  onChange={(e) => set("numero", e.target.value)}
                  placeholder="Ex: 123"
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Bairro</Label>
                <Input
                  value={form.bairro}
                  onChange={(e) => set("bairro", e.target.value)}
                  placeholder="Bairro"
                />
              </div>
              <div className="space-y-1.5">
                <Label>CEP</Label>
                <Input
                  value={form.cep}
                  onChange={(e) => set("cep", e.target.value)}
                  placeholder="00000-000"
                  maxLength={9}
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Cidade</Label>
                <Input
                  value={form.cidade}
                  onChange={(e) => set("cidade", e.target.value)}
                  placeholder="Cidade"
                />
              </div>
              <div className="space-y-1.5">
                <Label>UF</Label>
                <Select value={form.uf} onValueChange={(v) => set("uf", v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {UFS.map((uf) => (
                      <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Configurações comerciais */}
        <Card>
          <CardHeader><CardTitle>3. Configurações comerciais</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Encarteirar vendedor</Label>
              <Select value={form.vendedor_id} onValueChange={(v) => set("vendedor_id", v)}>
                <SelectTrigger><SelectValue placeholder="Selecione um vendedor..." /></SelectTrigger>
                <SelectContent>
                  {vendedores.map((v) => (
                    <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Cluster</Label>
              <Select value={form.cluster} onValueChange={(v) => set("cluster", v)}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {CLUSTERS.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tabela de preço</Label>
              <Select value={form.tabela_preco} onValueChange={(v) => set("tabela_preco", v)}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7</SelectItem>
                  <SelectItem value="12">12</SelectItem>
                  <SelectItem value="18">18</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.suframa} onCheckedChange={(v) => set("suframa", v)} />
              <Label>Suframa</Label>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.negativado} onCheckedChange={(v) => set("negativado", v)} />
              <Label>Marcar como negativado</Label>
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea
                rows={3}
                value={form.observacoes}
                onChange={(e) => set("observacoes", e.target.value)}
                placeholder="Informações comerciais relevantes..."
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate("/gestora")}>
            Cancelar
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? "Salvando..." : "Cadastrar cliente"}
          </Button>
        </div>
      </form>
    </div>
  );
}
