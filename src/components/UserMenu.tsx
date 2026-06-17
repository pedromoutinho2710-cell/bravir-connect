import { useRef, useState } from "react";
import { Camera, KeyRound, LogOut } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TrocarSenhaModal } from "@/components/TrocarSenhaModal";

function getIniciais(nome: string | null | undefined, email: string | null | undefined) {
  const base = (nome || email || "").trim();
  if (!base) return "?";
  const partes = base.split(/\s+/).filter(Boolean);
  if (partes.length >= 2) {
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
  }
  return base.slice(0, 2).toUpperCase();
}

export function UserMenu({ variant = "full" }: { variant?: "full" | "compact" }) {
  const { user, fullName, avatarUrl, signOut, refreshProfile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [senhaOpen, setSenhaOpen] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const displayName = fullName || user?.email?.split("@")[0] || "Usuário";
  const email = user?.email ?? "";
  const iniciais = getIniciais(fullName, user?.email);

  const handleArquivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem");
      return;
    }

    setEnviando(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${user.id}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("avatares")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;

      const { data: pub } = supabase.storage.from("avatares").getPublicUrl(path);
      const publicUrl = `${pub.publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", user.id);
      if (updateError) throw updateError;

      await refreshProfile();
      toast.success("Foto atualizada");
    } catch (err) {
      toast.error("Erro ao enviar foto: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setEnviando(false);
    }
  };

  const avatarNode = (
    <Avatar className={variant === "compact" ? "h-8 w-8" : "h-10 w-10"}>
      {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
      <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground text-xs font-semibold">
        {iniciais}
      </AvatarFallback>
    </Avatar>
  );

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleArquivo}
      />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {variant === "compact" ? (
            <button className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-accent transition-colors">
              {avatarNode}
              <span className="text-sm text-foreground hidden sm:block truncate max-w-[140px]">
                {displayName}
              </span>
            </button>
          ) : (
            <button className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-sidebar-accent transition-colors">
              {avatarNode}
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-sm font-medium text-sidebar-foreground truncate">
                  {displayName}
                </span>
                <span className="text-xs text-sidebar-foreground/60 truncate">{email}</span>
              </div>
            </button>
          )}
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="flex items-center gap-3 font-normal">
            {avatarNode}
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium truncate">{displayName}</span>
              <span className="text-xs text-muted-foreground truncate">{email}</span>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={enviando}
            onSelect={(e) => {
              e.preventDefault();
              fileInputRef.current?.click();
            }}
          >
            <Camera className="mr-2 h-4 w-4" />
            {enviando ? "Enviando..." : "Alterar foto"}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setSenhaOpen(true)}>
            <KeyRound className="mr-2 h-4 w-4" />
            Trocar senha
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => signOut()}>
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <TrocarSenhaModal open={senhaOpen} onOpenChange={setSenhaOpen} />
    </>
  );
}
