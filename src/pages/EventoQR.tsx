import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

const EVENTO_URL = "https://bravir-connect.vercel.app/evento";
const GREEN = "#1a6b3a";

function formatPhone(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.replace(/(\d{1,2})/, "($1");
  if (d.length <= 7) return d.replace(/^(\d{2})(\d+)/, "($1) $2");
  if (d.length === 10) return d.replace(/^(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  return d.replace(/^(\d{2})(\d{1})(\d{4})(\d{4})/, "($1) $2 $3-$4");
}

const schema = z.object({
  nome_empresa: z.string().min(2, "Obrigatório"),
  telefone: z.string().min(14, "WhatsApp inválido"),
});

type FormData = z.infer<typeof schema>;

export default function EventoQR() {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormData) {
    setLoading(true);
    setSubmitError(null);

    const { error } = await (supabase as any).from("leads_evento").insert({
      contato_nome: data.nome_empresa,
      telefone: data.telefone,
      origem: "qr_rapido",
      status: "novo",
    });

    setLoading(false);

    if (error) {
      setSubmitError("Erro ao enviar. Tente novamente.");
      return;
    }

    setSubmitted(true);
    reset();
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="px-6 py-4 shadow-sm" style={{ backgroundColor: GREEN }}>
        <span className="text-white font-bold text-2xl tracking-widest">BRAVIR</span>
      </header>

      {/* Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm flex flex-col items-center gap-6">

          {/* QR Code block */}
          <div className="flex flex-col items-center gap-4 w-full">
            <div className="p-5 rounded-2xl border-2 border-gray-100 shadow-sm bg-white">
              <QRCodeSVG
                value={EVENTO_URL}
                size={180}
                fgColor="#111111"
                bgColor="#ffffff"
                level="M"
              />
            </div>

            <p className="text-sm text-gray-500 text-center">
              Aponte a câmera do celular para acessar o formulário
            </p>

            <span
              className="text-sm font-semibold tracking-tight px-3 py-1 rounded-full bg-green-50"
              style={{ color: GREEN }}
            >
              {EVENTO_URL.replace("https://", "")}
            </span>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 w-full">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400 whitespace-nowrap">
              ou deixe seu contato aqui
            </span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* Mini form */}
          {submitted ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <CheckCircle2 className="h-10 w-10" style={{ color: GREEN }} />
              <p className="text-sm font-medium text-gray-700">
                Recebemos seu contato!{" "}
                <span className="text-gray-500 font-normal">
                  Em breve nossa equipe fala com você.
                </span>
              </p>
              <button
                type="button"
                onClick={() => setSubmitted(false)}
                className="text-xs underline text-gray-400 hover:text-gray-600"
              >
                Cadastrar outro
              </button>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit(onSubmit)}
              noValidate
              className="w-full flex flex-col gap-4"
            >
              <div>
                <Label htmlFor="nome_empresa">Nome / empresa *</Label>
                <Input
                  id="nome_empresa"
                  {...register("nome_empresa")}
                  className={cn(
                    "mt-1",
                    errors.nome_empresa && "border-red-400 focus-visible:ring-red-300"
                  )}
                  placeholder="Ex: João Silva / Farmácia Saúde"
                />
                {errors.nome_empresa && (
                  <p className="mt-1 text-xs text-red-500">{errors.nome_empresa.message}</p>
                )}
              </div>

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
                      className={cn(
                        "mt-1",
                        errors.telefone && "border-red-400 focus-visible:ring-red-300"
                      )}
                      placeholder="(00) 9 0000-0000"
                      inputMode="tel"
                    />
                  )}
                />
                {errors.telefone && (
                  <p className="mt-1 text-xs text-red-500">{errors.telefone.message}</p>
                )}
              </div>

              {submitError && (
                <p className="text-xs text-red-500 text-center">{submitError}</p>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full text-white font-semibold hover:opacity-90 transition-opacity"
                style={{ backgroundColor: GREEN }}
              >
                {loading ? "Enviando..." : "Quero ser contactado"}
              </Button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
