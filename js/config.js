/**
 * CERVE CATA — Configuración de despliegue
 * ─────────────────────────────────────────────────────────
 * Rellena estos valores antes de desplegar.
 *
 * ⚠️  Si metes credenciales reales, mantén el repo PRIVADO.
 *     Para repos públicos, usa CI/CD para inyectarlos en
 *     tiempo de build (GitHub Actions secrets + sed/envsubst).
 */
const CERVE_CONFIG = {

  // URL base de tu distribución CloudFront, SIN barra final.
  // Ej: 'https://d1abc234efgh.cloudfront.net'
  // Si está vacío → modo local/dev (rutas relativas a results/)
  cloudFrontUrl: '',

  s3: {
    // true  → sube automáticamente a S3 al finalizar la cata
    // false → solo descarga el JSON en local
    enabled: false,

    region: 'eu-west-1',         // Región de tu bucket
    bucket: '',                  // Nombre del bucket S3

    // Carpeta dentro del bucket donde se guardan los resultados
    // (debe coincidir con lo que sirve CloudFront)
    prefix: 'results/',

    // IAM user con permisos s3:GetObject + s3:PutObject
    // sobre el prefijo anterior. Solo escribe resultados.
    accessKeyId:     '',
    secretAccessKey: ''
  }

};
