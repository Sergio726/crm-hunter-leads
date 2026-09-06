import type { NextConfig } from "next";

/**
 * El proyecto se despliega de dos maneras y cada una necesita un output distinto:
 *
 * - **Vercel**: gestiona el build por su cuenta y no quiere `standalone`
 *   (duplica la salida y no la usa). Vercel define `VERCEL=1` en el entorno de
 *   build, así que se detecta solo, sin configurar nada en el panel.
 * - **Docker / Dokploy**: sí necesita `standalone`, que genera
 *   `.next/standalone/server.js` — es lo que copia y ejecuta el `Dockerfile`.
 */
const isVercel = Boolean(process.env.VERCEL);

const nextConfig: NextConfig = {
  ...(isVercel ? {} : { output: "standalone" }),
};

export default nextConfig;
