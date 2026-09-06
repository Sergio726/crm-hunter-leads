import { parseChatMarkdown, type InlineToken } from '@/lib/prospect/chat-markdown';

/**
 * Dibuja un mensaje de Turbo con su formato.
 *
 * Hasta ahora el chat mostraba el texto crudo, así que un mensaje suyo se veía
 * literalmente `**Cargos:** fundador, CEO` — con los asteriscos a la vista.
 *
 * El parseo vive en `lib/prospect/chat-markdown.ts` y está testeado; acá solo se
 * construyen elementos de React. Nunca se toca `dangerouslySetInnerHTML`, así
 * que no hay forma de inyectar nada aunque el modelo devuelva basura.
 */

function Inline({ tokens }: { tokens: InlineToken[] }) {
  return (
    <>
      {tokens.map((t, i) => {
        if (t.kind === 'bold') {
          return (
            <strong key={i} className="font-semibold">
              {t.text}
            </strong>
          );
        }
        if (t.kind === 'italic') return <em key={i}>{t.text}</em>;
        if (t.kind === 'code') {
          return (
            <code
              key={i}
              className="rounded bg-black/10 px-1 font-mono text-[0.9em] dark:bg-white/10"
            >
              {t.text}
            </code>
          );
        }
        return <span key={i}>{t.text}</span>;
      })}
    </>
  );
}

export function ChatMarkdown({ text }: { text: string }) {
  const bloques = parseChatMarkdown(text);

  return (
    <>
      {bloques.map((b, i) => {
        if (b.type === 'space') return <div key={i} className="h-2" />;
        if (b.type === 'ul') {
          return (
            <ul key={i} className="my-1 space-y-0.5">
              {b.items.map((item, j) => (
                <li key={j} className="flex gap-1.5">
                  <span aria-hidden="true" className="select-none opacity-50">
                    ·
                  </span>
                  <span>
                    <Inline tokens={item} />
                  </span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i}>
            <Inline tokens={b.tokens} />
          </p>
        );
      })}
    </>
  );
}
