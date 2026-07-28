// Script temporal de un solo uso: rellena "Duración estimada (días)" en el Catálogo de
// Servicios para todas las filas, con un margen de tiempo incluido para el editor.
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const CATALOGO_ID = 'efe1460c-5df2-40f4-b737-abc6642b81d9';

// Estimación por unidad (días de trabajo real) + margen fijo para imprevistos, revisiones, etc.
// Los servicios SMM son por semanas de gestión continua, no llevan margen extra (la duración
// ES el periodo contratado).
const TARIFAS = {
  'Banner Twitch, YouTube y redes': { porUnidad: 0.5, margen: 1 },
  'Like y sígueme personalizado': { porUnidad: 0.3, margen: 1 },
  'Miniatura de video YouTube o redes': { porUnidad: 0.3, margen: 1 },
  'Video introducción stream 5 minutos': { porUnidad: 0.5, margen: 1 },
  'Short 1 minuto': { porUnidad: 0.5, margen: 1 },
  'Short 2 minutos': { porUnidad: 0.7, margen: 1 },
  'Short 3 minutos': { porUnidad: 1, margen: 1 },
  'Video 15 minutos': { porUnidad: 1.5, margen: 1 },
  'Video 30 minutos': { porUnidad: 2, margen: 1 },
  'Video 60 minutos': { porUnidad: 3, margen: 1 },
  'SMM Básico (2 publicaciones semanales)': { porSemana: 7 },
  'SMM Estándar (3 post y 1 reel semanales)': { porSemana: 7 },
  'SMM Pro (3 post, 2 reels semanales)': { porSemana: 7 },
};

function esperar(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function consultarTodo() {
  let resultados = [];
  let cursor;
  do {
    const res = await fetch(`https://api.notion.com/v1/data_sources/${CATALOGO_ID}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2025-09-03',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(cursor ? { start_cursor: cursor } : {}),
    });
    const data = await res.json();
    if (!res.ok) throw new Error('Error consultando catálogo: ' + JSON.stringify(data));
    resultados = resultados.concat(data.results);
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return resultados;
}

async function actualizar(pageId, duracion) {
  const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': '2025-09-03',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ properties: { 'Duración estimada (días)': { number: duracion } } }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error('Error actualizando: ' + JSON.stringify(data));
}

function calcularDuracion(nombre) {
  const match = nombre.match(/^(.*)\s\(×(\d+)\)$/);
  if (!match) return null; // ej. "CM Porcentual en ventas", servicio continuo sin cantidad fija
  const base = match[1];
  const cantidad = parseInt(match[2], 10);
  const tarifa = TARIFAS[base];
  if (!tarifa) return null;
  if (tarifa.porSemana) return cantidad * tarifa.porSemana;
  return Math.ceil(tarifa.porUnidad * cantidad) + tarifa.margen;
}

async function main() {
  const filas = await consultarTodo();
  console.log(`Filas encontradas: ${filas.length}`);
  let actualizadas = 0;
  let omitidas = 0;
  for (const fila of filas) {
    const nombre = fila.properties['Nombre'].title.map((t) => t.plain_text).join('');
    const duracion = calcularDuracion(nombre);
    if (duracion === null) {
      console.log(`Omitido (sin tarifa conocida): "${nombre}"`);
      omitidas++;
      continue;
    }
    await actualizar(fila.id, duracion);
    console.log(`"${nombre}" -> ${duracion} día(s)`);
    actualizadas++;
    await esperar(350);
  }
  console.log(`\nTerminado. Actualizadas: ${actualizadas}. Omitidas: ${omitidas}.`);
}

main().catch((err) => {
  console.error('ERROR FATAL:', err.message);
  process.exitCode = 1;
});
