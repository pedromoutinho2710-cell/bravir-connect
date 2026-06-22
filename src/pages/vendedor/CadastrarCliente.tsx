import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function CadastrarCliente() {
  const { user, perfil } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    razao_social: "",
    nome_fantasia: "",
    cnpj: "",
    email: "",
    telefone: "",
    cidade: "",
    estado: "",
    endereco: "",
    ativo: true,
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.razao_social.trim()) {
      toast({ title: "Razão social obrigatória", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.from("clientes").insert({
        razao_social: form.razao_social,
        nome_fantasia: form.nome_fantasia || null,
        cnpj: form.cnpj || null,
        email: form.email || null,
        telefone: form.telefone || null,
        cidade: form.cidade || null,
        estado: form.estado || null,
        endereco: form.endereco || null,
        vendedor_id: user?.id,
        ativo: form.ativo,
        status: "cadastro_pendente",
      });
      if (error) throw error;
      toast({ title: "Cliente cadastrado com sucesso!" });
      await queryClient.invalidateQueries({ queryKey: ["meus-clientes"] });
      navigate("/vendedor/clientes");
    } catch (err: any) {
      toast({ title: "Erro ao cadastrar cliente", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto py-8 px-4">
        <Card>
          <CardHeader>
            <CardTitle>Cadastrar Cliente</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="razao_social">Razão Social *</Label>
                <Input
                  id="razao_social"
                  name="razao_social"
                  value={form.razao_social}
                  onChange={handleChange}
                  placeholder="Razão Social"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="nome_fantasia">Nome Fantasia</Label>
                <Input
                  id="nome_fantasia"
                  name="nome_fantasia"
                  value={form.nome_fantasia}
                  onChange={handleChange}
                  placeholder="Nome Fantasia"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="cnpj">CNPJ</Label>
                <Input
                  id="cnpj"
                  name="cnpj"
                  value={form.cnpj}
                  onChange={handleChange}
                  placeholder="00.000.000/0000-00"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="contato@empresa.com.br"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="telefone">Telefone</Label>
                <Input
                  id="telefone"
                  name="telefone"
                  value={form.telefone}
                  onChange={handleChange}
                  placeholder="(11) 99999-9999"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="cidade">Cidade</Label>
                  <Input
                    id="cidade"
                    name="cidade"
                    value={form.cidade}
                    onChange={handleChange}
                    placeholder="Cidade"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="estado">Estado</Label>
                  <Input
                    id="estado"
                    name="estado"
                    value={form.estado}
                    onChange={handleChange}
                    placeholder="UF"
                    maxLength={2}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="endereco">Endereço</Label>
                <Input
                  id="endereco"
                  name="endereco"
                  value={form.endereco}
                  onChange={handleChange}
                  placeholder="Rua, número, bairro"
                />
              </div>

              {/* Campo de status ativo/inativo */}
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <p className="font-medium text-sm">Status do cliente</p>
                  <p className="text-xs text-muted-foreground">
                    {form.ativo ? "Cliente ativo" : "Cliente inativo"}
                  </p>
                </div>
                <Switch
                  id="ativo"
                  checked={form.ativo}
                  onCheckedChange={(checked) =>
                    setForm((prev) => ({ ...prev, ativo: checked }))
                  }
                />
              </div>

              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => navigate(-1)} disabled={loading}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? "Salvando..." : "Cadastrar Cliente"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
