import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";

const UFS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG",
  "PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

const MARCAS_OPCOES = ["Bravir Tradicional", "Alivik", "Bendita Cânfora", "Laby"];

function maskCNPJ(v: string) {
  return v
    .replace(/\D/g, "")
    .slice(0, 14)
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

function maskPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 10) return d.replace(/^(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3").replace(/-$/, "");
  return d.replace(/^(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3").replace(/-$/, "");
}

type Classificacao = "Atacado" | "Distribuidor" | "Varejo" | "";

export default function SiteCandidatura() {
  const navigate = useNavigate();
  const [enviado, setEnviado] = useState(false);
  const [salvando, setSalvando] = useState(false);

  // Seção 1
  const [razaoSocial, setRazaoSocial] = useState("");
  const [nomeFantasia, setNomeFantasia] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");

  // Seção 2
  const [classificacao, setClassificacao] = useState<Classificacao>("");
  const [qtdVendedores, setQtdVendedores] = useState("");
  const [perfilAtacado, setPerfilAtacado] = useState("");
  const [qtdLojas, setQtdLojas] = useState("");
  const [vendeDigital, setVendeDigital] = useState<"Sim" | "Não" | "">("");
  const [temEcommerce, setTemEcommerce] = useState<"Sim" | "Não" | "">("");
  const [faturamento, setFaturamento] = useState("");

  // Seção 3
  const [marcas, setMarcas] = useState<string[]>([]);

  // Seção 4
  const [obs, setObs] = useState("");

  // Seção 5
  const [declaracao, setDeclaracao] = useState(false);

  const toggleMarca = (m: string) =>
    setMarcas((prev) => prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]);

  const isAtacDist = classificacao === "Atacado" || classificacao === "Distribuidor";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!declaracao) return;
    setSalvando(true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("cadastros_pendentes").insert({
      status: "pendente",
      origem: "site",
      razao_social: razaoSocial,
      nome_cliente: nomeFantasia || razaoSocial,
      cnpj,
      contato_principal: responsavel,
      email,
      telefone,
      cidade,
      uf,
      classificacao,
      qtd_vendedores: isAtacDist && qtdVendedores ? qtdVendedores : null,
      perfil_atacado_distribuidor: isAtacDist ? perfilAtacado : null,
      qtd_lojas: classificacao === "Varejo" ? qtdLojas : null,
      vende_digital: vendeDigital === "Sim" ? true : vendeDigital === "Não" ? false : null,
      tem_ecommerce: vendeDigital === "Sim" ? (temEcommerce === "Sim" ? true : temEcommerce === "Não" ? false : null) : null,
      faturamento_mensal: faturamento || null,
      marcas_interesse: marcas.length > 0 ? marcas : null,
      observacoes: obs || null,
    });

    setSalvando(false);
    setEnviado(true);
  };

  if (enviado) {
    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#f0f9f4" }}>
        <header style={{ backgroundColor: "#1a5c38" }} className="px-6 py-4">
          <div className="max-w-4xl mx-auto">
            <span className="text-2xl font-black tracking-widest text-white">BRAVIR</span>
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center px-6 py-20">
          <div className="text-center max-w-md">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-6" style={{ backgroundColor: "#d1fae5" }}>
              <CheckCircle2 className="h-8 w-8" style={{ color: "#1a5c38" }} />
            </div>
            <h1 className="text-2xl font-bold mb-3" style={{ color: "#1a5c38" }}>Candidatura enviada!</h1>
            <p className="text-gray-600 mb-8">Entraremos em contato em até 3 dias úteis.</p>
            <button
              onClick={() => navigate("/site")}
              className="text-sm font-medium underline"
              style={{ color: "#1a5c38" }}
            >
              Voltar ao início
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white font-sans">
      {/* Header */}
      <header style={{ backgroundColor: "#1a5c38" }} className="sticky top-0 z-50 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <button
            onClick={() => navigate("/site")}
            className="text-white/70 hover:text-white flex items-center gap-1.5 text-sm"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar
          </button>
          <span className="text-xl font-black tracking-widest text-white">BRAVIR</span>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-2" style={{ color: "#1a5c38" }}>Candidatura de revendedor</h1>
          <p className="text-sm text-gray-500">Preenchimento em ~5 minutos · Resposta em até 3 dias úteis</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-10">

          {/* SEÇÃO 1 */}
          <section>
            <h2 className="text-base font-bold uppercase tracking-wide mb-4 pb-2 border-b" style={{ color: "#1a5c38" }}>
              Sobre a empresa
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Razão social *</label>
                <input
                  required
                  value={razaoSocial}
                  onChange={(e) => setRazaoSocial(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700"
                  placeholder="Nome da empresa conforme CNPJ"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome fantasia</label>
                <input
                  value={nomeFantasia}
                  onChange={(e) => setNomeFantasia(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700"
                  placeholder="Como a empresa é conhecida no mercado"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">CNPJ</label>
                <input
                  value={cnpj}
                  onChange={(e) => setCnpj(maskCNPJ(e.target.value))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700"
                  placeholder="00.000.000/0000-00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Seu nome e cargo *</label>
                <input
                  required
                  value={responsavel}
                  onChange={(e) => setResponsavel(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700"
                  placeholder="Ex: João Silva — Diretor Comercial"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">E-mail *</label>
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700"
                  placeholder="contato@empresa.com.br"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Telefone / WhatsApp *</label>
                <input
                  required
                  value={telefone}
                  onChange={(e) => setTelefone(maskPhone(e.target.value))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700"
                  placeholder="(31) 99999-9999"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cidade *</label>
                  <input
                    required
                    value={cidade}
                    onChange={(e) => setCidade(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">UF</label>
                  <select
                    value={uf}
                    onChange={(e) => setUf(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700 bg-white"
                  >
                    <option value="">Selecione</option>
                    {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </section>

          {/* SEÇÃO 2 */}
          <section>
            <h2 className="text-base font-bold uppercase tracking-wide mb-4 pb-2 border-b" style={{ color: "#1a5c38" }}>
              Seu negócio
            </h2>
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Como você se classifica? *</label>
                <div className="flex flex-wrap gap-3">
                  {(["Atacado", "Distribuidor", "Varejo"] as Classificacao[]).map((op) => (
                    <label key={op} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="classificacao"
                        value={op}
                        checked={classificacao === op}
                        onChange={() => setClassificacao(op)}
                        className="accent-green-700"
                        required
                      />
                      <span className="text-sm">{op}</span>
                    </label>
                  ))}
                </div>
              </div>

              {isAtacDist && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Quantos vendedores sua equipe tem?</label>
                    <div className="flex flex-wrap gap-3">
                      {["1-10", "11-20", "21-50", "50-100", "Acima de 100"].map((op) => (
                        <label key={op} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="qtdVendedores"
                            value={op}
                            checked={qtdVendedores === op}
                            onChange={() => setQtdVendedores(op)}
                            className="accent-green-700"
                          />
                          <span className="text-sm">{op}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Seu perfil:</label>
                    <div className="flex flex-wrap gap-3">
                      {["Foco em alto giro", "Mix completo e abertura para dados"].map((op) => (
                        <label key={op} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="perfilAtacado"
                            value={op}
                            checked={perfilAtacado === op}
                            onChange={() => setPerfilAtacado(op)}
                            className="accent-green-700"
                          />
                          <span className="text-sm">{op}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {classificacao === "Varejo" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Quantas lojas você possui?</label>
                  <div className="flex flex-wrap gap-3">
                    {["1-9", "10-50", "Mais de 50"].map((op) => (
                      <label key={op} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="qtdLojas"
                          value={op}
                          checked={qtdLojas === op}
                          onChange={() => setQtdLojas(op)}
                          className="accent-green-700"
                        />
                        <span className="text-sm">{op}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Você vende pelo digital?</label>
                <div className="flex gap-4">
                  {(["Sim", "Não"] as const).map((op) => (
                    <label key={op} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="vendeDigital"
                        value={op}
                        checked={vendeDigital === op}
                        onChange={() => { setVendeDigital(op); if (op === "Não") setTemEcommerce(""); }}
                        className="accent-green-700"
                      />
                      <span className="text-sm">{op}</span>
                    </label>
                  ))}
                </div>
              </div>

              {vendeDigital === "Sim" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Tem e-commerce próprio?</label>
                  <div className="flex gap-4">
                    {(["Sim", "Não"] as const).map((op) => (
                      <label key={op} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="temEcommerce"
                          value={op}
                          checked={temEcommerce === op}
                          onChange={() => setTemEcommerce(op)}
                          className="accent-green-700"
                        />
                        <span className="text-sm">{op}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Faturamento mensal estimado</label>
                <select
                  value={faturamento}
                  onChange={(e) => setFaturamento(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700 bg-white"
                >
                  <option value="">Selecione</option>
                  <option value="Até R$50k">Até R$50k</option>
                  <option value="R$50k-200k">R$50k – R$200k</option>
                  <option value="R$200k-500k">R$200k – R$500k</option>
                  <option value="Acima de R$500k">Acima de R$500k</option>
                </select>
              </div>
            </div>
          </section>

          {/* SEÇÃO 3 */}
          <section>
            <h2 className="text-base font-bold uppercase tracking-wide mb-4 pb-2 border-b" style={{ color: "#1a5c38" }}>
              Marcas de interesse
            </h2>
            <p className="text-sm text-gray-500 mb-3">Quais marcas te interessam?</p>
            <div className="space-y-2">
              {MARCAS_OPCOES.map((m) => (
                <label key={m} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={marcas.includes(m)}
                    onChange={() => toggleMarca(m)}
                    className="accent-green-700 h-4 w-4"
                  />
                  <span className="text-sm">{m}</span>
                </label>
              ))}
            </div>
          </section>

          {/* SEÇÃO 4 */}
          <section>
            <h2 className="text-base font-bold uppercase tracking-wide mb-4 pb-2 border-b" style={{ color: "#1a5c38" }}>
              Mensagem
            </h2>
            <label className="block text-sm font-medium text-gray-700 mb-1">Conte mais sobre seu negócio</label>
            <textarea
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              rows={4}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700 resize-none"
              placeholder="Tempo de mercado, principais produtos, área de atuação..."
            />
          </section>

          {/* SEÇÃO 5 */}
          <section>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={declaracao}
                onChange={(e) => setDeclaracao(e.target.checked)}
                className="accent-green-700 h-4 w-4 mt-0.5 flex-shrink-0"
                required
              />
              <span className="text-sm text-gray-600">
                Declaro que as informações são verdadeiras e tenho interesse genuíno em ser revendedor Bravir.
              </span>
            </label>
          </section>

          <button
            type="submit"
            disabled={salvando || !declaracao}
            style={{ backgroundColor: declaracao ? "#1a5c38" : undefined }}
            className="w-full flex items-center justify-center gap-2 text-white font-bold py-3 rounded-lg transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {salvando ? "Enviando..." : "Enviar candidatura"}
          </button>
        </form>
      </div>

      <footer className="px-6 py-6 text-center text-sm text-gray-400 border-t border-gray-100 mt-8">
        © 2026 Bravir — Indústria Farmacêutica e Cosmética
      </footer>
    </div>
  );
}
