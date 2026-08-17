'use client';

import { useEffect, useRef } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { TurboMark, TurboPortrait } from '@/components/brand/TurboAvatar';
import type { ChatTurn } from '@/lib/prospect/types';

// Arranques que describen una OFERTA y no un rubro: Turbo ahora empieza por qué
// vende el usuario, así que las sugerencias tienen que empujar hacia ahí.
const SUGGESTIONS = [
  'Hago páginas web para inmobiliarias',
  'Doy mentorías de liderazgo a gerentes',
  'Vendo insumos a clínicas de estética',
];

/** Estilo compartido por las sugerencias iniciales y las opciones de Turbo. */
const CHIP =
  'rounded-full border border-border px-3 py-2 text-xs transition-colors hover:border-primary/40 hover:bg-accent hover:text-accent-foreground disabled:opacity-50 sm:py-1';

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
  options,
  onDraftChange,
  onSend,
}: {
  turns: ChatTurn[];
  draft: string;
  thinking: boolean;
  /** Respuestas sugeridas por Turbo en su último mensaje. */
  options?: string[] | null;
  onDraftChange: (value: string) => void;
  onSend: (message: string) => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns, thinking]);

  function submit(e: React.FormEvent | React.KeyboardEvent) {
    e.preventDefault();
    const value = draft.trim();
    if (!value || thinking) return;
    onSend(value);
  }

  return (
    // Altura acotada y no `h-full`: el padre no define altura, así que `h-full`
    // se resolvía como `auto` y el historial crecía sin techo. En un teléfono eso
    // empujaba el campo de escritura fuera de la pantalla y daba la sensación de
    // que el chat no dejaba escribir. Ahora el alto es fijo y el que scrollea es
    // el historial, con el campo siempre visible abajo.
    <div className="flex h-[26rem] flex-col sm:h-[30rem]">
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

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1">
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
              {/* py-2 en móvil: como chip de 1 línea, py-1 daba un objetivo
                  táctil de ~24px y se erraba el toque seguido. */}
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => onSend(s)} className={CHIP}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((turn, i) =>
          turn.role === 'user' ? (
            // Superficie sutil y no el mint pleno: un mensaje es contenido de
            // lectura, no una acción. Con el fondo lleno, la burbuja tenía casi
            // 300 veces la luminancia del fondo y encandilaba en conversaciones
            // largas. El borde mint alcanza para distinguir quién habla.
            <div
              key={i}
              className="ml-auto max-w-[92%] rounded-lg border border-primary/30 bg-[var(--badge-primary-bg)] px-3 py-2 text-sm whitespace-pre-wrap text-foreground"
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

        {/* Opciones que propuso Turbo en su último mensaje. Al tocarlas se envía
            ese texto como si lo hubiera escrito el vendedor: no ejecutan nada
            por su cuenta, así ningún toque gasta plata sin querer. */}
        {!thinking && options && options.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pl-7">
            {options.map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => onSend(o)}
                disabled={thinking}
                className={CHIP}
              >
                {o}
              </button>
            ))}
          </div>
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

      {/* `items-end` y no `items-center`: el campo crece hacia arriba, así que
          el botón tiene que quedar alineado con la última línea. */}
      <form onSubmit={submit} className="mt-3 flex items-end gap-2">
        <Textarea
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            // Enter envía; Shift+Enter hace salto de línea. Sin esto, en un
            // textarea el Enter solo agregaría líneas y no habría forma de
            // mandar el mensaje desde el teclado.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit(e);
            }
          }}
          placeholder="Contame qué vendés y a quién"
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
