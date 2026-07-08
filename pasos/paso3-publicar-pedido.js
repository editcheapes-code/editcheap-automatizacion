// PASO 3 — Leer un pedido real de Notion y publicarlo en Discord con formato real.
// Mensaje SOLO con: Nº de Pedido, Tipo de servicio, Importe para el editor (70% del total).
// También guarda el importe calculado en el campo "Importe Editor (€)" de Notion.
//
// Ejecutar: node pasos/paso3-publicar-pedido.js

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_DATA_SOURCE_ID = process.env.NOTION_DATA_SOURCE_ID;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;

function textoDe(propiedad) {
  if (!propiedad || !propiedad.rich_text || propiedad.rich_text.length === 0) return '(sin especificar)';
  return propiedad.rich_text.map((t) => t.plain_text).join('');
}

function multiSelectDe(propiedad) {
  if (!propiedad || !propiedad.multi_select || propiedad.multi_select.length === 0) return '(sin especificar)';
  return propiedad.multi_select.map((o) => o.name).join(', ');
}

async function leerPrimerPedido() {
  const url = `https://api.notion.com/v1/data_sources/${NOTION_DATA_SOURCE_ID}/query`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': '2025-09-03',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      page_size: 1,
      sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error('Error leyendo Notion: ' + JSON.stringify(data));

  const pedido = data.results[0];
  const p = pedido.properties;
  return {
    pageId: pedido.id,
    numeroPedido: p['Nº de Pedido'].unique_id.number,
    tipoServicio: multiSelectDe(p['Servicios web']),
    deseoCliente: textoDe(p['Deseo del cliente']),
    montoTotal: p['Monto total (€)'].formula.number,
  };
}

async function guardarImporteEditor(pageId, importeEditor) {
  const url = `https://api.notion.com/v1/pages/${pageId}`;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': '2025-09-03',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { 'Importe Editor (€)': { number: importeEditor } },
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error('Error guardando Importe Editor en Notion: ' + JSON.stringify(data));
}

async function enviarMensajeDiscord(contenido) {
  const url = `https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'DiscordBot (https://editcheap.es, 1.0)',
    },
    body: JSON.stringify({ content: contenido }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error('Error enviando a Discord: ' + JSON.stringify(data));
  return data.id;
}

async function main() {
  const pedido = await leerPrimerPedido();
  const importeEditor = Math.round(pedido.montoTotal * 0.7 * 100) / 100;

  console.log('Pedido leído de Notion:');
  console.log(`  Nº de Pedido: PED-${pedido.numeroPedido}`);
  console.log(`  Tipo de servicio: ${pedido.tipoServicio}`);
  console.log(`  Deseo del cliente: ${pedido.deseoCliente}`);
  console.log(`  Monto total: ${pedido.montoTotal} €`);
  console.log(`  Importe editor (70%): ${importeEditor} €`);

  const separador = '▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬';

  const contenido =
    `${separador}\n` +
    '🚨 ¡NUEVA COLABORACIÓN DISPONIBLE! 🚨\n\n' +
    `📌 Nº de Pedido: PED-${pedido.numeroPedido}\n` +
    `🎬 Tipo de servicio: ${pedido.tipoServicio}\n` +
    `📝 Detalles del trabajo: ${pedido.deseoCliente}\n` +
    `💰 Importe para el editor: ${importeEditor} €\n\n` +
    '⚠️ Nota: Por políticas de privacidad, los datos del cliente y el material original se gestionan de forma privada una vez asignado el cargo y verificado el correspondiente acuerdo de colaboración firmado.\n\n' +
    '🎯 ¿TE INTERESA ESTA COLABORACIÓN?\n' +
    'Si tienes disponibilidad para cargarte de este proyecto de forma externa, responde directamente a este mensaje indicando el Nº de Pedido para proceder con la asignación. ¡A por ello! 💪\n' +
    `${separador}`;

  const mensajeId = await enviarMensajeDiscord(contenido);
  console.log('\nEXITO. Mensaje enviado a Discord. ID:', mensajeId);

  await guardarImporteEditor(pedido.pageId, importeEditor);
  console.log('Guardado "Importe Editor (€)" en Notion:', importeEditor);
}

main().catch((err) => {
  console.error('FALLO:', err.message);
  process.exitCode = 1;
});
