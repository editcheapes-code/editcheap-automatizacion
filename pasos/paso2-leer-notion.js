// PASO 2 — Leer un pedido real de Notion e imprimir sus datos.
// Objetivo: confirmar que el token de Notion funciona y que sabemos leer los campos.
// Todavía NO escribe nada en Notion ni en Discord.
//
// Ejecutar: node pasos/paso2-leer-notion.js

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_DATA_SOURCE_ID = process.env.NOTION_DATA_SOURCE_ID;

function textoDe(propiedad) {
  if (!propiedad) return '(vacío)';
  const arr = propiedad.rich_text || propiedad.title;
  if (!arr || arr.length === 0) return '(vacío)';
  return arr.map((t) => t.plain_text).join('');
}

async function main() {
  if (!NOTION_TOKEN || !NOTION_DATA_SOURCE_ID) {
    console.error('ERROR: faltan las variables de entorno NOTION_TOKEN y/o NOTION_DATA_SOURCE_ID.');
    process.exitCode = 1;
    return;
  }

  const url = `https://api.notion.com/v1/data_sources/${NOTION_DATA_SOURCE_ID}/query`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': '2025-09-03',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ page_size: 1 }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error(`FALLO. Notion respondió con código HTTP ${response.status}:`);
    console.error(JSON.stringify(data, null, 2));
    process.exitCode = 1;
    return;
  }

  if (!data.results || data.results.length === 0) {
    console.log('Notion respondió correctamente pero no hay ningún pedido en la base.');
    return;
  }

  const pedido = data.results[0];
  const p = pedido.properties;

  console.log('EXITO. Datos del primer pedido devuelto por Notion:');
  console.log('----------------------------------------');
  console.log('Nombre:', textoDe(p['Nombre']));
  console.log('Nº de Pedido:', p['Nº de Pedido'] && p['Nº de Pedido'].unique_id ? `PED-${p['Nº de Pedido'].unique_id.number}` : '(vacío)');
  console.log('Tipo de servicio:', p['Tipo de servicio'] && p['Tipo de servicio'].select ? p['Tipo de servicio'].select.name : '(vacío)');
  console.log('Estado del pedido:', p['Estado del pedido'] && p['Estado del pedido'].status ? p['Estado del pedido'].status.name : '(vacío)');
  console.log('Deseo del cliente:', textoDe(p['Deseo del cliente']));
  console.log('Enviar a Discord:', p['Enviar a Discord'] ? p['Enviar a Discord'].checkbox : '(vacío)');
  console.log('----------------------------------------');
  console.log('(page_id interno, no es el Nº de Pedido):', pedido.id);
}

main();
