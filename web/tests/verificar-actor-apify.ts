// Verifica el esquema de un actor de Apify SIN gastar un centavo.
//
// No es un test: es una herramienta que se corre a mano cuando hay que mapear
// un actor nuevo o revisar si cambió el que ya usamos.
//
//   npx tsx tests/verificar-actor-apify.ts harvestapi~linkedin-profile-search
//
// El tablero tenía esta lección: *"la documentación de los actores de Apify no
// es confiable: antes de mapear un actor nuevo, correrlo una vez y mirar un
// ítem real"*. Es cierto, pero **correrlo cuesta plata cada vez** — y cuando el
// actor está bloqueado por límite de plan, además devuelve cero y no se aprende
// nada.
//
// La idea sale del código del desafío de Nexum: el `inputSchema` del último
// build es la fuente autoritativa, y leerlo es gratis. Lo que este script NO
// dice es qué campos trae la SALIDA: para eso sigue haciendo falta una corrida
// real. Sirve para el input, que es donde estaban nuestros errores.

const token = process.env.APIFY_API_TOKEN ?? process.env.APIFY_TOKEN;
const actor = process.argv[2];

if (!actor) {
  console.error('Falta el actor. Ej: harvestapi~linkedin-profile-search');
  process.exit(1);
}
if (!token) {
  console.error('Falta APIFY_API_TOKEN en el entorno (o APIFY_TOKEN).');
  process.exit(1);
}

interface Build {
  id: string;
  finishedAt?: string;
  buildNumber?: string;
  inputSchema?: string;
}

async function main() {
  const url =
    `https://api.apify.com/v2/acts/${actor}/builds` +
    `?token=${encodeURIComponent(token as string)}&desc=1&limit=1`;

  const res = await fetch(url);
  if (!res.ok) {
    console.error(`Apify respondió ${res.status}. ¿El actor existe y el token sirve?`);
    process.exit(1);
  }

  const data = (await res.json()) as { data?: { items?: Build[] } };
  const build = data.data?.items?.[0];
  if (!build) {
    console.error('El actor no tiene builds visibles con este token.');
    process.exit(1);
  }

  // El listado no siempre trae el `inputSchema`: se pide el build completo.
  const detalle = await fetch(
    `https://api.apify.com/v2/actor-builds/${build.id}?token=${encodeURIComponent(token as string)}`,
  );
  const dj = (await detalle.json()) as { data?: Build };
  const crudo = dj.data?.inputSchema ?? build.inputSchema;

  console.log(`Actor:  ${actor}`);
  console.log(`Build:  ${build.buildNumber ?? build.id}  (${build.finishedAt ?? 'sin fecha'})`);

  if (!crudo) {
    console.log('\nEste build no publica inputSchema. Queda la corrida real.');
    return;
  }

  const schema = JSON.parse(crudo) as {
    properties?: Record<string, { type?: string; title?: string; editor?: string }>;
    required?: string[];
  };
  const req = new Set(schema.required ?? []);

  console.log('\nCampos de entrada (los que acepta de verdad):\n');
  for (const [campo, def] of Object.entries(schema.properties ?? {})) {
    const marca = req.has(campo) ? '*' : ' ';
    const tipo = (def.type ?? def.editor ?? '?').padEnd(9);
    console.log(`  ${marca} ${campo.padEnd(26)} ${tipo} ${def.title ?? ''}`);
  }
  console.log('\n  * = obligatorio');
}

void main();
