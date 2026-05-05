import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Loader2, UserPlus, Pencil, PowerOff, Power, Trash2, Search } from "lucide-react";
import { ROLE_LABEL, type AppRole } from "@/lib/roles";
import { cn } from "@/lib/utils";

type UsuarioRow = {
  id: string;
  email: string;
  full_name: string | null;
  ativo: boolean | null;
  role: AppRole | null;
};

const ROLES: AppRole[] = ["admin", "gestora", "vendedor", "faturamento", "logistica", "trade"];
const ROLE_ORDER: AppRole[] = ["admin", "gestora", "vendedor", "faturamento", "logistica", "trade"];

const ROLE_COLOR: Record<string, string> = {
  admin: "bg-purple-100 text-purple-800 border-purple-300",
  vendedor: "bg-blue-100 text-blue-800 border-blue-300",
  faturamento: "bg-green-100 text-green-800 border-green-300",
  logistica: "bg-orange-100 text-orange-800 border-orange-300",
  trade: "bg-yellow-100 text-yellow-800 border-yellow-300",
};

export default function Equipe() {
  const [usuarios, setUsuarios] = useState<UsuarioRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal novo usuário
  const [novoOpen, setNovoOpen] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novoEmail, setNovoEmail] = useState("");
  const [novoSenha, setNovoSenha] = useState("");
  const [novoRole, setNovoRole] = useState<AppRole>("vendedor");
  const [criando, setCriando] = useState(false);

  // Modal editar usuário completo
  const [editUser, setEditUser] = useState<UsuarioRow | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState<AppRole>("vendedor");
  const [editSenha, setEditSenha] = useState("");
  const [salvandoEdit, setSalvandoEdit] = useState(false);

  // Confirmação toggle ativo
  const [toggleTarget, setToggleTarget] = useState<UsuarioRow | null>(null);
  const [toggling, setToggling] = useState(false);

  // Excluir usuário
  const [excluirTarget, setExcluirTarget] = useState<UsuarioRow | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  // Corrigir nomes nulos
  const [corrigindo, setCorrigindo] = useState(false);

  // Filtros
  const [busca, setBusca] = useState("");
  const [filtroRole, setFiltroRole] = useState<"todos" | AppRole>("todos");

  const usuariosFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return usuarios.filter((u) => {
      if (q && !((u.full_name ?? "").toLowerCase().includes(q) || u.email.toLowerCase().includes(q))) return false;
      if (filtroRole !== "todos" && u.role !== filtroRole) return false;
      return true;
    });
  }, [usuarios, busca, filtroRole]);

  const grupos = useMemo(() => {
    const groups = ROLE_ORDER
      .map((role) => ({
        role: role as AppRole | null,
        lista: usuariosFiltrados
          .filter((u) => u.role === role)
          .sort((a, b) => (a.full_name ?? a.email).localeCompare(b.full_name ?? b.email, "pt-BR")),
      }))
      .filter((g) => g.lista.length > 0);

    const semPerfil = usuariosFiltrados.filter((u) => !u.role)
      .sort((a, b) => (a.full_name ?? a.email).localeCompare(b.full_name ?? b.email, "pt-BR"));
    if (semPerfil.length > 0) groups.push({ role: null, lista: semPerfil });

    return groups;
  }, [usuariosFiltrados]);

  const carregar = async () => {
    setLoading(true);
    const [profRes, rolesRes] = await Promise.all([
      supabase.from("profiles").select("id, email, full_name, ativo").order("full_name"),
      supabase.from("user_roles").select("user_id, role"),
    ]);

    const rolesMap: Record<string, AppRole> = {};
    (rolesRes.data ?? []).forEach((r) => { rolesMap[r.user_id] = r.role as AppRole; });

    setUsuarios(
      (profRes.data ?? []).map((p) => ({
        id: p.id,
        email: p.email,
        full_name: p.full_name,
        ativo: p.ativo ?? true,
        role: rolesMap[p.id] ?? null,
      })),
    );
    setLoading(false);
  };

  useEffect(() => { carregar(); }, []);

  const abrirEdicao = (u: UsuarioRow) => {
    setEditUser(u);
    setEditNome(u.full_name ?? "");
    setEditEmail(u.email);
    setEditRole(u.role ?? "vendedor");
    setEditSenha("");
  };

  const criarUsuario = async () => {
    if (!novoNome.trim() || !novoEmail.trim() || !novoSenha.trim()) {
      toast.error("Preencha todos os campos");
      return;
    }
    setCriando(true);
    const { data, error } = await supabase.functions.invoke("admin-usuario", {
      body: { acao: "criar", email: novoEmail.trim(), senha: novoSenha, full_name: novoNome.trim(), role: novoRole },
    });
    setCriando(false);
    if (error || data?.error) {
      toast.error("Erro ao criar usuário: " + (data?.error ?? error?.message));
      return;
    }
    toast.success(`Usuário ${novoNome} criado com sucesso`);
    setNovoOpen(false);
    setNovoNome(""); setNovoEmail(""); setNovoSenha(""); setNovoRole("vendedor");
    carregar();
  };

  const salvarUsuario = async () => {
    if (!editUser) return;
    if (!editNome.trim() || !editEmail.trim()) {
      toast.error("Nome e email são obrigatórios");
      return;
    }
    setSalvandoEdit(true);
    const body: Record<string, unknown> = {
      acao: "atualizar_usuario",
      user_id: editUser.id,
      full_name: editNome.trim(),
      email: editEmail.trim(),
      role: editRole,
    };
    if (editSenha.trim()) body.senha = editSenha.trim();

    const { data, error } = await supabase.functions.invoke("admin-usuario", { body });
    setSalvandoEdit(false);
    if (error || data?.error) {
      toast.error("Erro ao salvar: " + (data?.error ?? error?.message));
      return;
    }
    toast.success("Usuário atualizado");
    setEditUser(null);
    carregar();
  };

  const confirmarToggle = async () => {
    if (!toggleTarget) return;
    setToggling(true);
    const novoAtivo = !(toggleTarget.ativo ?? true);
    const { data, error } = await supabase.functions.invoke("admin-usuario", {
      body: { acao: "toggle_ativo", user_id: toggleTarget.id, ativo: novoAtivo },
    });
    setToggling(false);
    if (error || data?.error) { toast.error("Erro ao alterar status"); return; }
    toast.success(novoAtivo ? "Usuário reativado" : "Usuário desativado");
    setToggleTarget(null);
    carregar();
  };

  const corrigirNomesNulos = async () => {
    setCorrigindo(true);
    const { data, error } = await supabase.functions.invoke("admin-usuario", {
      body: { acao: "corrigir_nomes" },
    });
    setCorrigindo(false);
    if (error || data?.error) {
      toast.error("Erro ao corrigir nomes: " + (data?.error ?? error?.message));
      return;
    }
    toast.success(`${data.updated} nome(s) corrigido(s)`);
    carregar();
  };

  const excluirUsuario = async () => {
    if (!excluirTarget) return;
    setExcluindo(true);
    const { data, error } = await supabase.functions.invoke("admin-usuario", {
      body: { acao: "excluir", user_id: excluirTarget.id },
    });
    setExcluindo(false);
    if (error || data?.error) { toast.error("Erro ao excluir: " + (data?.error ?? error?.message)); return; }
    toast.success(`${excluirTarget.full_name ?? excluirTarget.email} excluído`);
    setExcluirTarget(null);
    carregar();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Equipe</h1>
          <p className="text-sm text-muted-foreground">Gerencie os usuários do sistema</p>
        </div>
        <div className="flex gap-2">
          {usuarios.some((u) => !u.full_name) && (
            <Button variant="outline" onClick={corrigirNomesNulos} disabled={corrigindo}>
              {corrigindo && <Loader2 className="h-4 w-4 animate-spin" />}
              Corrigir nomes ausentes
            </Button>
          )}
          <Button onClick={() => setNovoOpen(true)}>
            <UserPlus className="h-4 w-4" />
            Novo usuário
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou email…"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setFiltroRole("todos")}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              filtroRole === "todos"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background hover:bg-muted border-input"
            )}
          >
            Todos
          </button>
          {ROLE_ORDER.map((r) => (
            <button
              key={r}
              onClick={() => setFiltroRole(r)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                filtroRole === r
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background hover:bg-muted border-input"
              )}
            >
              {ROLE_LABEL[r]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Perfil</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-28">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grupos.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                    Nenhum usuário encontrado
                  </TableCell>
                </TableRow>
              )}
              {grupos.map((grupo) => (
                <>
                  {filtroRole === "todos" && (
                    <TableRow key={`header-${grupo.role ?? "sem-perfil"}`} className="bg-muted/40 hover:bg-muted/40">
                      <TableCell colSpan={5} className="py-2 px-4">
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {grupo.role ? ROLE_LABEL[grupo.role] : "Sem perfil"}
                          <span className="ml-2 font-normal normal-case tracking-normal">
                            ({grupo.lista.length})
                          </span>
                        </span>
                      </TableCell>
                    </TableRow>
                  )}
                  {grupo.lista.map((u) => (
                    <TableRow key={u.id} className={!(u.ativo ?? true) ? "opacity-50" : ""}>
                      <TableCell className="font-medium">{u.full_name ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                      <TableCell>
                        {u.role ? (
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${ROLE_COLOR[u.role] ?? ""}`}>
                            {ROLE_LABEL[u.role]}
                          </span>
                        ) : (
                          <Badge variant="outline" className="text-xs text-muted-foreground">Sem perfil</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs font-medium ${(u.ativo ?? true) ? "text-green-700" : "text-red-600"}`}>
                          {(u.ativo ?? true) ? "Ativo" : "Inativo"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1.5">
                          <Button size="icon" variant="outline" className="h-7 w-7"
                            onClick={() => abrirEdicao(u)}
                            title="Editar usuário">
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button size="icon" variant="outline" className="h-7 w-7"
                            onClick={() => setToggleTarget(u)}
                            title={(u.ativo ?? true) ? "Desativar" : "Reativar"}>
                            {(u.ativo ?? true)
                              ? <PowerOff className="h-3 w-3 text-red-500" />
                              : <Power className="h-3 w-3 text-green-600" />}
                          </Button>
                          <Button size="icon" variant="outline" className="h-7 w-7"
                            onClick={() => setExcluirTarget(u)}
                            title="Excluir usuário">
                            <Trash2 className="h-3 w-3 text-red-600" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Modal: novo usuário */}
      <Dialog open={novoOpen} onOpenChange={setNovoOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Novo usuário</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nome completo *</Label>
              <Input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="João Silva" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>Email *</Label>
              <Input type="email" value={novoEmail} onChange={(e) => setNovoEmail(e.target.value)} placeholder="joao@empresa.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Senha temporária *</Label>
              <Input type="password" value={novoSenha} onChange={(e) => setNovoSenha(e.target.value)} placeholder="Mínimo 6 caracteres" />
            </div>
            <div className="space-y-1.5">
              <Label>Perfil *</Label>
              <Select value={novoRole} onValueChange={(v) => setNovoRole(v as AppRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovoOpen(false)}>Cancelar</Button>
            <Button onClick={criarUsuario} disabled={criando}>
              {criando && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Criar usuário
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: editar usuário completo */}
      <Dialog open={!!editUser} onOpenChange={(o) => !o && setEditUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Editar usuário</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nome completo *</Label>
              <Input
                value={editNome}
                onChange={(e) => setEditNome(e.target.value)}
                placeholder="Nome completo"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Email *</Label>
              <Input
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                placeholder="email@empresa.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Perfil *</Label>
              <Select value={editRole} onValueChange={(v) => setEditRole(v as AppRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Nova senha <span className="text-muted-foreground font-normal">(deixe em branco para manter)</span></Label>
              <Input
                type="password"
                value={editSenha}
                onChange={(e) => setEditSenha(e.target.value)}
                placeholder="Mínimo 6 caracteres"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>Cancelar</Button>
            <Button onClick={salvarUsuario} disabled={salvandoEdit}>
              {salvandoEdit && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog: excluir usuário */}
      <AlertDialog open={!!excluirTarget} onOpenChange={(o) => !o && setExcluirTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário permanentemente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é irreversível. O usuário <strong>{excluirTarget?.full_name ?? excluirTarget?.email}</strong> será removido do sistema, incluindo dados de autenticação e permissões.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={excluirUsuario}
              disabled={excluindo}
              className="bg-red-600 hover:bg-red-700"
            >
              {excluindo && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Excluir permanentemente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal: confirmar toggle ativo */}
      <Dialog open={!!toggleTarget} onOpenChange={(o) => !o && setToggleTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {(toggleTarget?.ativo ?? true) ? "Desativar usuário" : "Reativar usuário"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            {(toggleTarget?.ativo ?? true)
              ? `Desativar ${toggleTarget?.full_name ?? toggleTarget?.email}? O usuário não conseguirá acessar o sistema.`
              : `Reativar ${toggleTarget?.full_name ?? toggleTarget?.email}?`}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToggleTarget(null)}>Cancelar</Button>
            <Button
              variant={(toggleTarget?.ativo ?? true) ? "destructive" : "default"}
              onClick={confirmarToggle}
              disabled={toggling}
            >
              {toggling && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
