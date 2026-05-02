import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { formatCNPJ, onlyDigits, formatCEP } from "@/lib/format";
import { UFS } from "@/lib/constants";
import { Loader2 } from "lucide-react";

export default function CadastrarCliente() {
  const { user } = useAuth();
  const [enviando, setEnviando] = useState(false);

  const [cnpj, setCnpj] = useState("");
  const [razaoSocial, setRazaoSocial] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [inscricaoEstadual, setInscricaoEstadual] = useState("");
  const [isento, setIsento] = useState(false);
  const [rua, setRua] = useState("");
  const [numero, setNumero] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [cep, setCep] = useState("");

  const formatTelefone = (raw: string) => {
    const v = onlyDigits(raw).slice(0, 11);
    if (v.length <= 10) {
      return v
        .replace(/^(\d{2})(\d{4})(\d{1,4})$/, "($1) $2-$3")
        .replace(/^(\d{2})(\d{1,4})$/, "($1) $2")
        .replace(/^(\d{1,2})$/, "($1");
    }
    return v.replace(/^(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const cnpjDigits = onlyDigits(cnpj);
    if (cnpjDigits.length !== 14) { toast.error("CNPJ inválido"); return; }
    if (!razaoSocial.trim()) { toast.error("Razão social é obrigatória"); return; }
    if (!isento && !inscricaoEstadual.trim()) {
      toast.error("Informe a Inscrição Estadual ou marque como Isento");
      return;
    }

    setEnviando(true);
    try {
      const { error: clienteError } = await supabase
        .from("clientes")
        .insert({
          cnpj: cnpjDigits,
          razao_social: razaoSocial.trim(),
          cidade: cidade.trim() || null,
          uf: uf || null,
          cep: onlyDigits(cep) || null,
          status: "pendente_cadastro",
          vendedor_id: user.id,
          inscricao_estadual: isento ? "Isento" : inscricaoEstadual.trim(),
          email: email.trim() || null,
          telefone: onlyDigits(telefone) || null,
          rua: rua.trim() || null,
          numero: numero.trim() || null,
          bairro: bairro.trim() || null,
        });

      if (clienteError) {
        toast.error("Erro ao cadastrar: " + clienteError.message);
        return;
      }

      await supabase.from("notificacoes").insert({
        destinatario_role: "faturamento",
        mensagem: `Novo cliente para cadastrar: ${razaoSocial.trim()} (CNPJ: ${formatCNPJ(cnpjDigits)})`,
        tipo: "cliente_pendente",
      });

      toast.success("Cliente enviado para cadastro pelo faturamento!");
      setCnpj(""); setRazaoSocial(""); setEmail(""); setTelefone("");
      setInscricaoEstadual(""); setIsento(false);
      setRua(""); setNumero(""); setBairro(""); setCidade(""); setUf(""); setCep("");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Cadastrar Cliente</h1>
        <p className="text-sm text-muted-foreground">Envie um novo cliente para ser cadastrado pelo faturamento</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Dados do cliente</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cnpj">CNPJ *</Label>
                <Input id="cnpj" value={cnpj} onChange={(e) => setCnpj(formatCNPJ(e.target.value))}
                  placeholder="00.000.000/0000-00" maxLength={18} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="razao">Razão Social *</Label>
                <Input id="razao" value={razaoSocial} onChange={(e) => setRazaoSocial(e.target.value)}
                  placeholder="Nome da empresa" />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="contato@empresa.com" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="telefone">Telefone</Label>
                <Input id="telefone" value={telefone}
                  onChange={(e) => setTelefone(formatTelefone(e.target.value))}
                  placeholder="(00) 00000-0000" maxLength={15} />
              </div>
            </div>

            <div className="space-y-2">
              <div className="space-y-1.5">
                <Label htmlFor="ie">Inscrição Estadual *</Label>
                <Input id="ie" value={inscricaoEstadual}
                  onChange={(e) => setInscricaoEstadual(e.target.value)}
                  placeholder="Número da IE" disabled={isento} />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="isento" checked={isento}
                  onCheckedChange={(c) => { setIsento(!!c); if (c) setInscricaoEstadual(""); }} />
                <Label htmlFor="isento" className="cursor-pointer font-normal">
                  Isento de Inscrição Estadual
                </Label>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Endereço de entrega</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="rua">Rua / Av.</Label>
                <Input id="rua" value={rua} onChange={(e) => setRua(e.target.value)}
                  placeholder="Nome da rua" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="numero">Número</Label>
                <Input id="numero" value={numero} onChange={(e) => setNumero(e.target.value)}
                  placeholder="123" />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="bairro">Bairro</Label>
                <Input id="bairro" value={bairro} onChange={(e) => setBairro(e.target.value)}
                  placeholder="Bairro" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cidade">Cidade</Label>
                <Input id="cidade" value={cidade} onChange={(e) => setCidade(e.target.value)}
                  placeholder="Cidade" />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="uf">UF</Label>
                <Select value={uf} onValueChange={setUf}>
                  <SelectTrigger id="uf"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {UFS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cep">CEP</Label>
                <Input id="cep" value={cep} onChange={(e) => setCep(formatCEP(e.target.value))}
                  placeholder="00000-000" maxLength={9} />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={enviando}>
            {enviando && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Enviar para cadastro
          </Button>
        </div>
      </form>
    </div>
  );
}
