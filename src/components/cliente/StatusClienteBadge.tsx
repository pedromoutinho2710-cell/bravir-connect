type StatusConf = { label: string; cls: string };

const STATUS_CONF: Record<string, StatusConf> = {
  ativo: { label: "Ativo", cls: "bg-green-100 text-green-800 border-green-300" },
  inativo: { label: "Inativo", cls: "bg-gray-100 text-gray-600 border-gray-300" },
  aguardando_trade: { label: "Aguard. trade", cls: "bg-amber-100 text-amber-800 border-amber-300" },
  pendente: { label: "Pendente", cls: "bg-blue-100 text-blue-800 border-blue-300" },
};

export function StatusClienteBadge({
  status,
  className = "",
}: {
  status: string | null | undefined;
  className?: string;
}) {
  if (!status) return null;
  const conf = STATUS_CONF[status];
  if (!conf) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${conf.cls} ${className}`}
    >
      {conf.label}
    </span>
  );
}
