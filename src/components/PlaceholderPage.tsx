import { Construction } from "lucide-react";

interface Props {
  title: string;
}

export default function PlaceholderPage({ title }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
      </div>
      <div className="rounded-lg border bg-card p-12 shadow-card">
        <div className="flex flex-col items-center justify-center text-center">
          <div className="rounded-full bg-secondary p-4">
            <Construction className="h-8 w-8 text-primary" />
          </div>
          <p className="mt-4 text-base font-medium text-foreground">
            Em construção
          </p>
          <p className="mt-1 text-sm text-muted-foreground max-w-md">
            Próximas etapas serão adicionadas aqui.
          </p>
        </div>
      </div>
    </div>
  );
}
