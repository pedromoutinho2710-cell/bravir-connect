import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
        // Variantes semânticas (status, prioridade, tipo) — pílulas suaves.
        // Use no lugar de cores hardcoded por tela (ex.: bg-green-100 text-green-800).
        success:
          "border-green-200 bg-green-100 text-green-800 dark:border-green-500/25 dark:bg-green-500/15 dark:text-green-300",
        warning:
          "border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/15 dark:text-amber-300",
        info:
          "border-blue-200 bg-blue-100 text-blue-800 dark:border-blue-500/25 dark:bg-blue-500/15 dark:text-blue-300",
        danger:
          "border-red-200 bg-red-100 text-red-800 dark:border-red-500/25 dark:bg-red-500/15 dark:text-red-300",
        neutral:
          "border-border bg-muted text-muted-foreground",
        navy:
          "border-navy/20 bg-navy/10 text-navy dark:border-blue-400/30 dark:bg-blue-400/15 dark:text-blue-200",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
