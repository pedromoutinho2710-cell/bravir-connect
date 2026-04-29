export type AppRole = "admin" | "vendedor" | "faturamento" | "logistica";

export const ROLE_HOME: Record<AppRole, string> = {
  admin: "/dashboard",
  vendedor: "/meu-painel",
  faturamento: "/faturamento",
  logistica: "/logistica",
};

export const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Administrador",
  vendedor: "Vendedor",
  faturamento: "Faturamento",
  logistica: "Logística",
};
