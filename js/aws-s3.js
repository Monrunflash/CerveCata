/**
 * CERVE CATA — aws-s3.js
 * Subida directa a S3 con AWS Signature V4
 * Usa crypto.subtle nativo del navegador — sin SDK externo.
 */
'use strict';

const S3 = (() => {
  const enc = s => new TextEncoder().encode(s);

  // ── Primitivas criptográficas ────────────────────────────

  async function sha256hex(data) {
    const buf = await crypto.subtle.digest(
      'SHA-256',
      typeof data === 'string' ? enc(data) : data
    );
    return toHex(buf);
  }

  async function hmac256(key, data) {
    const k = await crypto.subtle.importKey(
      'raw',
      typeof key === 'string' ? enc(key) : key,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    return crypto.subtle.sign('HMAC', k, enc(data));
  }

  function toHex(buf) {
    return Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // ── Fecha/hora UTC ──────────────────────────────────────

  function getDateStrings() {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const Y = now.getUTCFullYear();
    const M = pad(now.getUTCMonth() + 1);
    const D = pad(now.getUTCDate());
    const h = pad(now.getUTCHours());
    const m = pad(now.getUTCMinutes());
    const s = pad(now.getUTCSeconds());
    return {
      dateStamp: `${Y}${M}${D}`,
      amzDate:   `${Y}${M}${D}T${h}${m}${s}Z`
    };
  }

  // ── S3 PutObject con Signature V4 ───────────────────────

  /**
   * Sube `body` (string) a S3 como `key`.
   * @param {string} key         - Ruta dentro del bucket (sin slash inicial)
   * @param {string} body        - Contenido del objeto
   * @param {string} contentType - MIME type
   * @param {object} cfg         - CERVE_CONFIG.s3
   */
  async function put(key, body, contentType, cfg) {
    contentType = contentType || 'application/json';
    const { region, bucket, accessKeyId, secretAccessKey } = cfg;
    const { dateStamp, amzDate } = getDateStrings();

    const host     = `${bucket}.s3.${region}.amazonaws.com`;
    const path     = `/${key}`;
    const bodyHash = await sha256hex(body);

    // Canonical headers — deben estar ordenados alfabéticamente
    const rawHeaders = [
      ['content-type',         contentType],
      ['host',                 host],
      ['x-amz-content-sha256', bodyHash],
      ['x-amz-date',           amzDate],
    ].sort(([a], [b]) => a.localeCompare(b));

    const canonHeadersStr = rawHeaders.map(([k, v]) => `${k}:${v}\n`).join('');
    const signedHeaders   = rawHeaders.map(([k]) => k).join(';');

    const canonRequest = [
      'PUT', path, '',
      canonHeadersStr, signedHeaders, bodyHash
    ].join('\n');

    const credScope   = `${dateStamp}/${region}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256', amzDate, credScope,
      await sha256hex(canonRequest)
    ].join('\n');

    // Clave de firma derivada
    const kDate    = await hmac256('AWS4' + secretAccessKey, dateStamp);
    const kRegion  = await hmac256(kDate,    region);
    const kService = await hmac256(kRegion,  's3');
    const kSigning = await hmac256(kService, 'aws4_request');
    const sig      = toHex(await hmac256(kSigning, stringToSign));

    const authorization =
      `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credScope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${sig}`;

    const res = await fetch(`https://${host}${path}`, {
      method: 'PUT',
      headers: {
        'authorization':         authorization,
        'content-type':          contentType,
        'x-amz-content-sha256':  bodyHash,
        'x-amz-date':            amzDate,
      },
      body
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => res.statusText);
      throw new Error(`S3 PutObject [${key}] HTTP ${res.status}: ${txt}`);
    }
  }

  // ── Subir resultado + actualizar index.json ──────────────

  /**
   * Sube el JSON de la cata y actualiza results/index.json en S3.
   * @param {string} filename  - Nombre del fichero (solo el nombre, sin prefijo)
   * @param {string} jsonStr   - Contenido JSON serializado
   * @param {object} config    - CERVE_CONFIG completo
   */
  async function uploadResult(filename, jsonStr, config) {
    const cfg    = config.s3;
    const prefix = cfg.prefix.endsWith('/') ? cfg.prefix : cfg.prefix + '/';
    const base   = config.cloudFrontUrl
      ? config.cloudFrontUrl
      : `https://${cfg.bucket}.s3.${cfg.region}.amazonaws.com`;

    // 1 — Subir el fichero de resultado
    await put(`${prefix}${filename}`, jsonStr, 'application/json', cfg);

    // 2 — Obtener el index.json actual (best-effort; puede no existir aún)
    let index = { session: 'Cata de Cervezas 🍺', files: [] };
    try {
      const res = await fetch(`${base}/${prefix}index.json?_=${Date.now()}`);
      if (res.ok) index = await res.json();
    } catch { /* primera subida: index.json todavía no existe */ }

    // 3 — Añadir el fichero al índice si no estaba ya
    if (!index.files.includes(filename)) {
      index.files = [...new Set([...index.files, filename])].sort();
    }

    // 4 — Subir el index.json actualizado
    await put(
      `${prefix}index.json`,
      JSON.stringify(index, null, 2),
      'application/json',
      cfg
    );
  }

  return { put, uploadResult };
})();
