import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Bell } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Notificacao {
  id: string;
  mensagem: string;
  lida: boolean;
  created_at: string;
}

export function NotificationsBadge() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [count, setCount] = useState(0);
  const [notifications, setNotifications] = useState<Notificacao[]>([]);
  const [open, setOpen] = useState(false);

  const fetchCount = async (uid: string) => {
    const { count: c } = await supabase
      .from("notificacoes")
      .select("id", { count: "exact", head: true })
      .eq("user_id", uid)
      .eq("lida", false);
    setCount(c ?? 0);
  };

  const fetchNotifications = async (uid: string) => {
    const { data } = await supabase
      .from("notificacoes")
      .select("id, mensagem, lida, created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(10);
    setNotifications((data as Notificacao[]) ?? []);
  };

  useEffect(() => {
    if (!user) return;

    fetchCount(user.id);

    const channel = supabase
      .channel("notificacoes-badge")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notificacoes", filter: `user_id=eq.${user.id}` },
        () => {
          fetchCount(user.id);
          if (open) fetchNotifications(user.id);
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, open]);

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen && user) fetchNotifications(user.id);
  };

  const handleNotificationClick = async (n: Notificacao) => {
    if (!n.lida) {
      await supabase.from("notificacoes").update({ lida: true }).eq("id", n.id);
      setCount((c) => Math.max(0, c - 1));
      setNotifications((prev) => prev.map((x) => x.id === n.id ? { ...x, lida: true } : x));
    }
    setOpen(false);
    navigate("/faturamento");
  };

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5 text-muted-foreground" />
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b px-4 py-2.5">
          <p className="text-sm font-semibold">Notificações</p>
        </div>
        {notifications.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            Nenhuma notificação
          </p>
        ) : (
          <ScrollArea className="max-h-72">
            <ul>
              {notifications.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => handleNotificationClick(n)}
                    className={`w-full text-left px-4 py-3 text-sm hover:bg-muted transition-colors border-b last:border-0 ${!n.lida ? "bg-primary/5 font-medium" : "text-muted-foreground"}`}
                  >
                    {n.mensagem}
                  </button>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}
