// Banco de conversaciones para medir a Turbo.
//
// NO es un test unitario: llama al modelo real y cuesta plata, así que no corre
// con `npm test`. Se corre a mano:
//
//     node --env-file=.env.local --import tsx --conditions=react-server tests/turbo-conversaciones.ts
//
// Por qué existe: hasta ahora la única forma de saber si Turbo entrevistaba
// bien y deducía los filtros correctos era probarlo a mano en la pantalla. Eso
// significa que cualquier cambio en su instrucción se podía romper en silencio.
//
// Cada caso dice qué se espera y por qué. Lo que se mide no es que conteste
// "bien" —eso es opinable— sino cosas verificables: si preguntó por la oferta
// antes de proponer, qué fuente eligió y qué filtros dedujo.

import { runAgentTurn, type AgentConfig } from '../src/lib/prospect/agent';
import type { ChatTurn } from '../src/lib/prospect/types';

interface Caso {
  nombre: string;
  /** Lo que el vendedor va diciendo, en orden. */
  dice: string[];
  /** Qué tendría que pasar, en castellano, para poder juzgarlo a ojo. */
  seEspera: string;
  /** Comprobaciones automáticas sobre los filtros propuestos, si propuso. */
  verificar?: (f: Record<string, unknown> | null) => string[];
  /**
   * No agregar turnos de "confío en vos". Para los casos que miden justamente
   * qué hace Turbo ANTES de tener información suficiente.
   */
  soloGuion?: boolean;
}

const CASOS: Caso[] = [
  {
    nombre: 'Vende páginas web',
    dice: ['hola', 'vendo páginas web a inmobiliarias en Córdoba'],
    seEspera:
      'Tendría que elegir Google Maps (las inmobiliarias chicas están ahí) y ' +
      'encender requireNoWebsite, porque vender webs es justo el caso donde ' +
      '"no tiene web" es la señal de dolor.',
    verificar: (f) => {
      const fallas: string[] = [];
      if (!f) return ['no propuso ninguna búsqueda'];
      if (f.source !== 'google_places') fallas.push(`eligió ${f.source} en vez de google_places`);
      if (f.requireNoWebsite !== true) fallas.push('NO encendió requireNoWebsite');
      return fallas;
    },
  },
  {
    nombre: 'Vende mentoría de liderazgo',
    dice: ['hola', 'doy mentorías de liderazgo para dueños de empresa en Buenos Aires'],
    seEspera:
      'Tendría que elegir LinkedIn (son personas por cargo, no negocios con ' +
      'dirección) y NO encender requireNoWebsite: que el prospecto tenga web ' +
      'no dice nada sobre si necesita una mentoría.',
    verificar: (f) => {
      const fallas: string[] = [];
      if (!f) return ['no propuso ninguna búsqueda'];
      if (f.source !== 'linkedin') fallas.push(`eligió ${f.source} en vez de linkedin`);
      if (f.requireNoWebsite === true) fallas.push('encendió requireNoWebsite sin motivo');
      const li = f.linkedin as { jobTitles?: string[] } | undefined;
      const cargos = li?.jobTitles ?? [];
      // La prueba de fuego del bug de los ceros: LinkedIn compara el cargo
      // palabra por palabra, así que un solo cargo literal casi nunca engancha.
      if (cargos.length < 3) {
        fallas.push(`solo ${cargos.length} variante(s) de cargo: ${JSON.stringify(cargos)}`);
      }
      return fallas;
    },
  },
  {
    nombre: 'No dice qué vende',
    dice: ['quiero conseguir clientes'],
    seEspera:
      'NO tendría que proponer una búsqueda todavía. Tendría que preguntar qué ' +
      'vende, que es el primer paso de la entrevista.',
    verificar: (f) => (f ? ['propuso una búsqueda sin saber qué vende'] : []),
    soloGuion: true,
  },
  {
    nombre: 'Pide una cantidad concreta',
    dice: ['vendo software de gestión para gimnasios', 'buscame 12 en Rosario'],
    seEspera: 'Tendría que respetar el 12: la cantidad pedida se perdía siempre contra el default.',
    verificar: (f) => (f && f.limit !== 12 ? [`limit=${f.limit} en vez de 12`] : []),
  },
];

const config: AgentConfig = {
  apiKey: process.env.OPENROUTER_API_KEY ?? null,
  model: process.env.OPENROUTER_MODEL || 'openrouter/auto',
  sources: ['google_places', 'linkedin', 'instagram'],
};

if (!config.apiKey) {
  console.error('Falta OPENROUTER_API_KEY. Corré con: node --env-file=.env.local ...');
  process.exit(1);
}

let fallaron = 0;

async function main() {
for (const caso of CASOS) {
  console.log('\n' + '='.repeat(70));
  console.log(`CASO: ${caso.nombre}`);
  console.log(`Se espera: ${caso.seEspera}`);
  console.log('-'.repeat(70));

  const turns: ChatTurn[] = [];
  let ultima: Awaited<ReturnType<typeof runAgentTurn>> | null = null;

  // El guion, y después hasta 3 turnos de "confío en vos".
  //
  // Turbo NO es determinista: con el mismo guion, una corrida propone en dos
  // turnos y la siguiente hace una pregunta más. Medido el 2026-08-18: los
  // mismos cuatro casos dieron 4/4 y después 2/4, sin tocar una línea. Cortar
  // la charla en el guion medía la suerte, no la habilidad. Estos turnos extra
  // son lo que haría un vendedor que le confía la decisión, que es justo el
  // comportamiento que Turbo tiene que soportar.
  const guion = caso.soloGuion
    ? caso.dice
    : [...caso.dice, ...Array<string>(3).fill('dale, lo que te parezca mejor')];

  for (const dice of guion) {
    // Ya propuso: seguir preguntando solo gasta plata.
    if (ultima?.filters) break;
    turns.push({ role: 'user', content: dice });
    console.log(`\n  vendedor > ${dice}`);
    try {
      ultima = await runAgentTurn(turns, config);
    } catch (e) {
      console.log(`  ERROR: ${e instanceof Error ? e.message : String(e)}`);
      fallaron += 1;
      break;
    }
    console.log(`  turbo    > ${ultima.message}`);
    if (ultima.options?.length) console.log(`  opciones : ${ultima.options.join(' | ')}`);
    turns.push({ role: 'assistant', content: ultima.message });
  }

  const filtros = (ultima?.filters ?? null) as Record<string, unknown> | null;
  if (filtros) {
    console.log(`\n  PROPUSO  : ${filtros.source}`);
    console.log(`  porque   : ${ultima?.reason ?? '(no dio motivo)'}`);
    console.log(`  avatar   : ${ultima?.icpSummary ?? '(sin resumen)'}`);
    console.log(`  cargos   : ${JSON.stringify((filtros.linkedin as Record<string, unknown>)?.jobTitles ?? filtros.queries)}`);
    console.log(`  zonas    : ${JSON.stringify(filtros.areas)} | limit ${filtros.limit}`);
    console.log(
      `  señales  : sinWeb=${filtros.requireNoWebsite} whatsapp=${filtros.requireWhatsapp} ` +
        `ig=${filtros.requireInstagram} li=${filtros.requireLinkedin} rating=${filtros.minRating}`,
    );
  } else {
    console.log('\n  PROPUSO  : nada todavía');
  }

  const fallas = caso.verificar?.(filtros) ?? [];
  if (fallas.length > 0) {
    fallaron += 1;
    console.log(`\n  ❌ ${fallas.join(' | ')}`);
  } else {
    console.log('\n  ✅ hizo lo esperado');
  }
}

console.log('\n' + '='.repeat(70));
console.log(`${CASOS.length - fallaron}/${CASOS.length} casos como se esperaba`);
process.exit(fallaron > 0 ? 1 : 0);
}

void main();
