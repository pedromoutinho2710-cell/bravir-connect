import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

export default function BlingCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [erro, setErro] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (!code) { setStatus("error"); setErro("Code não encontrado na URL"); return; }
    supabase.functions.invoke("bling-oauth", {
      body: { code },
      headers: { "x-action": "token" },
    }).then(({ error }) => {
      if (error) { setStatus("error"); setErro(error.message); return; }
      setStatus("success");
      setTimeout(() => navigate("/admin/visao-macro"), 2000);
    });
  }, [navigate]);

  return (
    <div className="flex h-screen items-center justify-center">
      {status === "loading" && <div className="flex flex-col items-center gap-3"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="text-muted-foreground">Conectando ao Bling...</p></div>}
      {status === "success" && <div className="flex flex-col items-center gap-3"><CheckCircle2 className="h-8 w-8 text-green-600" /><p className="font-medium text-green-700">Bling conectado com sucesso!</p><p className="text-sm text-muted-foreground">Redirecionando...</p></div>}
      {status === "error" && <div className="flex flex-col items-center gap-3"><XCircle className="h-8 w-8 text-red-600" /><p className="font-medium text-red-700">Erro ao conectar</p><p className="text-sm text-muted-foreground">{erro}</p></div>}
    </div>
  );
}
