import { useNavigate } from "react-router-dom";
import { ArrowRight, Factory, MapPin, Package } from "lucide-react";

const MARCAS = [
  {
    nome: "Bravir Tradicional",
    descricao: "Cuidado do corpo, eficácia e naturalidade.",
    produtos: [
      "Arnica Loção FR 240ml",
      "Arnica Gel Bisn 120g",
      "Pasta d'Água Bisn 80g",
      "Óleo Mineral FR 200ml",
      "Óleo de Amêndoas FR 200ml",
      "Aldermina Desod Creme p/ Pés Bisn 80g",
    ],
  },
  {
    nome: "Alivik",
    descricao: "Pomada aliviadora e refrescante — cânfora, mentol e óleo de eucalipto.",
    produtos: ["Alivik 12g Disp c/12", "Alivik 40g"],
  },
  {
    nome: "Bendita Cânfora",
    descricao: "Cânfora refinada com mais de 50 anos de tradição.",
    produtos: [
      "Tablete Estojo 28g Disp c/16",
      "Tablete Pote c/200 x 0,75g",
      "Tablete Pote c/30 x 0,75g",
      "Líquida Spray FR 100ml",
      "Gel Ative Bisn 80g",
      "Gel Relaxante Bisn 80g",
      "Gel Relaxante Sachê 15g Disp c/10",
    ],
  },
  {
    nome: "Laby",
    descricao: "Cuidado labial — Manteiga de Cacau, hidratantes coloridos, FPS até 70.",
    produtos: [
      "Mant Cacau FPS 8 Luxo Batom",
      "Mant Cacau FPS 8 Push Pull",
      "Mant Cacau FPS15 Líquida",
      "Prot Sol Labial FPS15/30/50",
      "Hyaluronic FPS30",
      "Hidrat FPS15",
      "Corzinha FPS15",
      "Stick Multifuncional (7 cores)",
    ],
  },
];

const STEPS = [
  {
    num: "01",
    titulo: "Preencha o perfil",
    texto: "Entendemos seu porte, contexto e objetivos.",
  },
  {
    num: "02",
    titulo: "Qualificamos seu perfil",
    texto: "Em até 3 dias úteis você recebe nosso retorno.",
  },
  {
    num: "03",
    titulo: "Conversamos sobre a parceria",
    texto: "Proposta sob medida, com catálogo e suporte.",
  },
];

export default function SiteLanding() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white font-sans text-gray-900">
      {/* Header */}
      <header style={{ backgroundColor: "#1a5c38" }} className="sticky top-0 z-50 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <span className="text-2xl font-black tracking-widest text-white">BRAVIR</span>
          <button
            onClick={() => navigate("/login")}
            className="text-sm font-medium text-white/80 hover:text-white border border-white/30 hover:border-white/60 rounded-md px-4 py-1.5 transition-colors"
          >
            Acessar CRM
          </button>
        </div>
      </header>

      {/* Hero */}
      <section style={{ backgroundColor: "#1a5c38" }} className="px-6 py-24 text-white">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-extrabold leading-tight mb-6">
            Construímos uma marca em 50 anos.<br />
            <span className="opacity-80">Você constrói o canal.</span>
          </h1>
          <p className="text-lg sm:text-xl text-white/75 max-w-2xl mx-auto mb-10">
            A Bravir está expandindo sua rede de revendedores. Antes de conversar, queremos conhecer o seu negócio.
          </p>
          <button
            onClick={() => navigate("/site/candidatura")}
            style={{ backgroundColor: "#fff", color: "#1a5c38" }}
            className="inline-flex items-center gap-2 font-bold text-base px-8 py-3 rounded-lg hover:bg-green-50 transition-colors shadow-lg"
          >
            Iniciar candidatura <ArrowRight className="h-5 w-5" />
          </button>
          <p className="mt-4 text-sm text-white/50">
            Preenchimento em ~5 minutos · Resposta em até 3 dias úteis
          </p>
        </div>
      </section>

      {/* Quem somos */}
      <section className="px-6 py-20 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4" style={{ color: "#1a5c38" }}>
            Saúde e bem-estar há mais de meio século.
          </h2>
          <p className="text-center text-gray-600 max-w-2xl mx-auto mb-12">
            Indústria farmacêutica e cosmética 100% brasileira, há mais de 50 anos no mercado.
            Fábrica em Contagem (MG), equipe de marca em Belo Horizonte. Atuamos em todo o Brasil.
          </p>
          <div className="grid gap-6 sm:grid-cols-3">
            {[
              { icon: Factory, titulo: "50+ anos", sub: "Tradição e know-how industrial brasileiro" },
              { icon: Package, titulo: "4 marcas", sub: "Bravir, Alivik, Bendita Cânfora, Laby" },
              { icon: MapPin, titulo: "Distribuição nacional", sub: "Vários canais em todo o Brasil" },
            ].map(({ icon: Icon, titulo, sub }) => (
              <div key={titulo} className="bg-white rounded-xl border border-gray-200 p-6 text-center shadow-sm">
                <div
                  className="inline-flex items-center justify-center w-12 h-12 rounded-full mb-4"
                  style={{ backgroundColor: "#e8f5ee" }}
                >
                  <Icon className="h-6 w-6" style={{ color: "#1a5c38" }} />
                </div>
                <div className="font-bold text-lg mb-1" style={{ color: "#1a5c38" }}>{titulo}</div>
                <div className="text-sm text-gray-500">{sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Nossas marcas */}
      <section className="px-6 py-20">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12" style={{ color: "#1a5c38" }}>
            Quatro marcas, um portfólio completo.
          </h2>
          <div className="grid gap-6 sm:grid-cols-2">
            {MARCAS.map((m) => (
              <div key={m.nome} className="rounded-xl border border-gray-200 p-6 bg-white shadow-sm">
                <div className="font-bold text-lg mb-1" style={{ color: "#1a5c38" }}>{m.nome}</div>
                <p className="text-sm text-gray-500 mb-3">{m.descricao}</p>
                <ul className="space-y-1">
                  {m.produtos.map((p) => (
                    <li key={p} className="text-sm text-gray-700 flex items-start gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: "#1a5c38" }} />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Como funciona */}
      <section className="px-6 py-20 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12" style={{ color: "#1a5c38" }}>
            Três passos para começar.
          </h2>
          <div className="grid gap-8 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.num} className="text-center">
                <div className="text-5xl font-black mb-3 opacity-15" style={{ color: "#1a5c38" }}>{s.num}</div>
                <div className="font-bold text-base mb-2" style={{ color: "#1a5c38" }}>{s.titulo}</div>
                <p className="text-sm text-gray-500">{s.texto}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section style={{ backgroundColor: "#0f3d25" }} className="px-6 py-20 text-white text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold mb-6">Pronto para fazer parte da rede Bravir?</h2>
          <button
            onClick={() => navigate("/site/candidatura")}
            style={{ backgroundColor: "#fff", color: "#1a5c38" }}
            className="inline-flex items-center gap-2 font-bold text-base px-8 py-3 rounded-lg hover:bg-green-50 transition-colors shadow-lg"
          >
            Iniciar candidatura <ArrowRight className="h-5 w-5" />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-6 text-center text-sm text-gray-400 border-t border-gray-100">
        © 2026 Bravir — Indústria Farmacêutica e Cosmética
      </footer>
    </div>
  );
}
