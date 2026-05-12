export type AppRole = "admin" | "vendedor" | "faturamento" | "logistica" | "trade" | "gestora" | "gestora_faturamento";

export const ROLE_HOME: Record<AppRole, string> = {
  admin: "/dashboard",
  vendedor: "/meu-painel",
  faturamento: "/faturamento",
  logistica: "/logistica",
  trade: "/trade",
  gestora: "/gestora",
  gestora_faturamento: "/faturamento",
};

export const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Administrador",
  vendedor: "Vendedor",
  faturamento: "Faturamento",
  logistica: "Logística",
  trade: "Trade",
  gestora: "Gestora",
  gestora_faturamento: "Gestora Faturamento",
};
