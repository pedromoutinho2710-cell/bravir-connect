import { useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useContatoCliente } from '@/hooks/useContatoCliente';

interface SecaoClienteProps {
  clienteId?: string | null;
  clienteNome?: string;
  entregaAgendada?: boolean;
  telefoneContato: string;
  emailContato: string;
  onTelefoneChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  errors?: {
    telefone_contato?: string;
    email_contato?: string;
  };
}

export function SecaoCliente({
  clienteId,
  clienteNome,
  entregaAgendada = false,
  telefoneContato,
  emailContato,
  onTelefoneChange,
  onEmailChange,
  errors = {},
}: SecaoClienteProps) {
  const { data: contatoSalvo } = useContatoCliente(clienteId);

  // Pré-preenche campos de contato com dados do histórico do cliente
  useEffect(() => {
    if (contatoSalvo) {
      if (contatoSalvo.telefone_contato && !telefoneContato) {
        onTelefoneChange(contatoSalvo.telefone_contato);
      }
      if (contatoSalvo.email_contato && !emailContato) {
        onEmailChange(contatoSalvo.email_contato);
      }
    }
  }, [contatoSalvo, clienteId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      {clienteNome && (
        <div>
          <p className="text-sm font-medium text-muted-foreground">Cliente</p>
          <p className="font-semibold">{clienteNome}</p>
        </div>
      )}

      {entregaAgendada && (
        <div className="rounded-md border border-orange-200 bg-orange-50 p-4 space-y-4">
          <p className="text-sm font-semibold text-orange-800">
            Dados para agendamento de entrega
          </p>

          <div className="space-y-2">
            <Label htmlFor="telefone_contato">
              Telefone para contato{' '}
              <span className="text-destructive">*</span>
            </Label>
            <Input
              id="telefone_contato"
              type="tel"
              placeholder="(11) 99999-9999"
              value={telefoneContato}
              onChange={(e) => onTelefoneChange(e.target.value)}
              className={errors.telefone_contato ? 'border-destructive' : ''}
            />
            {errors.telefone_contato && (
              <p className="text-xs text-destructive">{errors.telefone_contato}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email_contato">
              E-mail para contato{' '}
              <span className="text-destructive">*</span>
            </Label>
            <Input
              id="email_contato"
              type="email"
              placeholder="email@exemplo.com"
              value={emailContato}
              onChange={(e) => onEmailChange(e.target.value)}
              className={errors.email_contato ? 'border-destructive' : ''}
            />
            {errors.email_contato && (
              <p className="text-xs text-destructive">{errors.email_contato}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
