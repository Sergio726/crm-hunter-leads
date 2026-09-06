// Branding de la app.
//
// Por defecto la app muestra un WORDMARK de texto ("Hunter Leads").
// Para usar un LOGO en imagen:
//   1) Colocá el archivo en:  mobile/assets/logo.png  (PNG, fondo transparente, ~horizontal)
//   2) En src/components/Logo.tsx descomentá el `require` y el bloque <Image>.
//      (React Native necesita el archivo presente para compilar, por eso es manual.)
// Ver README (sección "Logo / branding").
export const USE_IMAGE_LOGO = false;
