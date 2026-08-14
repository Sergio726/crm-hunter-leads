'use client';

import { useEffect, useRef } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { TurboMark, TurboPortrait } from '@/components/brand/TurboAvatar';
import type { ChatTurn } from '@/lib/prospect/types';

const SUGGESTIONS = [
  'Inmobiliarias chicas sin web en CABA',
  'Clínicas de estética en Montevideo con Instagram',
  'Restaurantes de barrio en Córdoba',
];

/**
 * Chat con Turbo, el agente de IA de ST Labs.
 *
 * El manual pide que la IA sea reconocible y explicable: Turbo se presenta con
 * nombre y avatar, y cada mensaje suyo lleva su marca al lado, para que nunca
 * se confunda quién habla. La decisión sigue siendo del vendedor — de ahí que
 * el texto insista en que los filtros se pueden editar antes de buscar.
 */
export function AvatarChat({
  turns,
  draft,
  thinking,
  onDraftChange,
  onSend,
}: {
  turns: ChatTurn[];
  draft: string;
  thinking: boolean;
  onDraftChange: (value: string) => void;
  onSend: (message: string) => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns, thinking]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = draft.trim();
    if (!value || thinking) return;
    onSend(value);
  }

  return (
    <div className="flex h-full flex-col">
      {/* Presentación del agente: quién es y en qué estado está */}
      <div className="mb-3 flex items-center gap-2.5 border-b border-border pb-3">
        <TurboMark size="md" glow />
        <div className="min-w-0">
          <p className="font-mono text-sm font-bold tracking-tight text-foreground">Turbo</p>
          <p className="eyebrow text-muted-foreground">
            {thinking ? '/ pensando' : '/ listo'}
          </p>
        </div>
      </div>

      <div className="min-h-64 flex-1 space-y-3 overflow-y-auto pr-1">
        {turns.length === 0 && (
          <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            <div className="flex flex-col items-center text-center">
              <TurboPortrait size={72} />
              <p className="mt-3 font-medium text-foreground">Contame a quién querés venderle</p>
              <p className="mt-1">
                Describime el cliente ideal en una frase: rubro, zona y lo que te importe. Te
                propongo los filtros y los podés ajustar antes de buscar.
              </p>
            </div>
            <div className="mt-4 flex flex-wrap justify-center gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onSend(s)}
                  className="rounded-full border border-border px-2.5 py-1 text-xs transition-colors hover:border-primary/40 hover:bg-accent hover:text-accent-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((turn, i) =>
          turn.role === 'user' ? (
            <div
              key={i}
              className="ml-auto max-w-[92%] rounded-lg bg-primary px-3 py-2 text-sm whitespace-pre-wrap text-primary-foreground"
            >
              {turn.content}
            </div>
          ) : (
            <div key={i} className="flex max-w-[92%] items-start gap-2">
              <TurboMark size="sm" className="mt-0.5" />
              <div className="rounded-lg bg-muted px-3 py-2 text-sm whitespace-pre-wrap text-foreground">
                {turn.content}
              </div>
            </div>
          ),
        )}

        {thinking && (
          <div className="flex items-center gap-2">
            <TurboMark size="sm" />
            <span className="eyebrow flex items-center gap-1.5 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Turbo está pensando
            </span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={submit} className="mt-3 flex items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          placeholder="Ej.: inmobiliarias sin web en Palermo"
          disabled={thinking}
          aria-label="Mensaje para Turbo"
        />
        <Button type="submit" disabled={thinking || draft.trim().length === 0} aria-label="Enviar">
          {thinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  );
}
