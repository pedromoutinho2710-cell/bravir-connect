import * as React from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

export interface Breadcrumb {
  label: string;
  href?: string;
}

export interface PageHeaderProps {
  /** Título da página (h1). */
  title: React.ReactNode;
  /** Linha de apoio opcional abaixo do título. */
  description?: React.ReactNode;
  /** Trilha de navegação opcional (o último item é o atual). */
  breadcrumb?: Breadcrumb[];
  /** Ações à direita (botões, filtros, export…). */
  actions?: React.ReactNode;
  className?: string;
}

/**
 * Cabeçalho de página padrão do CRM — breadcrumb + título + descrição + ações.
 * Tom corporativo/denso, baseado em tokens (nada hardcoded).
 */
export function PageHeader({ title, description, breadcrumb, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="min-w-0 space-y-1">
        {breadcrumb && breadcrumb.length > 0 && (
          <nav aria-label="breadcrumb" className="flex items-center gap-1 text-xs text-muted-foreground">
            {breadcrumb.map((item, i) => {
              const last = i === breadcrumb.length - 1;
              return (
                <React.Fragment key={`${item.label}-${i}`}>
                  {i > 0 && <ChevronRight className="h-3 w-3 flex-shrink-0 opacity-60" />}
                  {item.href && !last ? (
                    <Link to={item.href} className="truncate transition-colors hover:text-foreground">
                      {item.label}
                    </Link>
                  ) : (
                    <span className={cn("truncate", last && "font-medium text-foreground")}>{item.label}</span>
                  )}
                </React.Fragment>
              );
            })}
          </nav>
        )}
        <h1 className="truncate text-xl font-bold tracking-tight text-foreground sm:text-2xl">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
