// PASOS 4+5+8 — Revisa TODOS los pedidos con "Enviar a Discord" marcado y sin
// "ID Mensaje" todavía, los publica en Discord uno a uno, y guarda el ID del
// mensaje en Notion para que no se vuelvan a publicar en la siguiente ejecución.
//
// Ejecutar: node pasos/procesar-pedidos.js

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_DATA_SOURCE_ID = process.env.NOTION_DATA_SOURCE_ID;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function textoDe(propiedad) {
  if (!propiedad || !propiedad.rich_text || propiedad.rich_text.length === 0) return '(sin especificar)';
  return propiedad.rich_text.map((t) => t.plain_text).join('');
}

function multiSelectDe(propiedad) {
  if (!propiedad || !propiedad.multi_select || propiedad.multi_select.length === 0) return '(sin especificar)';
  return propiedad.multi_select.map((o) => o.name).join(', ');
}

async function obtenerPedidosPendientes() {
  const url = `https://api.notion.com/v1/data_sources/${NOTION_DATA_SOURCE_ID}/query`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': '2025-09-03',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filter: {
        and: [
          { property: 'Enviar a Discord', checkbox: { equals: true } },
          { property: 'ID Mensaje', rich_text: { is_empty: true } },
        ],
      },
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error('Error consultando Notion: ' + JSON.stringify(data));

  return data.results.map((pedido) => {
    const p = pedido.properties;
    return {
      pageId: pedido.id,
      numeroPedido: p['Nº de Pedido'].unique_id.number,
      tipoServicio: multiSelectDe(p['Servicios web']),
      deseoCliente: textoDe(p['Deseo del cliente']),
      montoTotal: p['Monto total (€)'].formula.number,
    };
  });
}

async function guardarResultadoEnNotion(pageId, mensajeId, importeEditor) {
  const url = `https://api.notion.com/v1/pages/${pageId}`;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': '2025-09-03',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        'ID Mensaje': { rich_text: [{ text: { content: mensajeId } }] },
        'Importe Editor (€)': { number: importeEditor },
      },
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error('Error guardando en Notion: ' + JSON.stringify(data));
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

function construirMensaje(pedido, importeEditor) {
  const separador = '▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬';
  return (
    `${separador}\n` +
    '🚨 ¡NUEVA COLABORACIÓN DISPONIBLE! 🚨\n\n' +
    `📌 Nº de Pedido: PED-${pedido.numeroPedido}\n` +
    `🎬 Tipo de servicio: ${pedido.tipoServicio}\n` +
    `📝 Detalles del trabajo: ${pedido.deseoCliente}\n` +
    `💰 Importe para el editor: ${importeEditor} €\n\n` +
    '⚠️ Nota: Por políticas de privacidad, los datos del cliente y el material original se gestionan de forma privada una vez asignado el cargo y verificado el correspondiente acuerdo de colaboración firmado.\n\n' +
    '🎯 ¿TE INTERESA ESTA COLABORACIÓN?\n' +
    'Si tienes disponibilidad para cargarte de este proyecto de forma externa, responde directamente a este mensaje indicando el Nº de Pedido para proceder con la asignación. ¡A por ello! 💪\n' +
    `${separador}`
  );
}

async function main() {
  const pedidos = await obtenerPedidosPendientes();
  log(`Pedidos pendientes de publicar: ${pedidos.length}`);

  for (const pedido of pedidos) {
    try {
      const importeEditor = Math.round(pedido.montoTotal * 0.7 * 100) / 100;
      const mensajeId = await enviarMensajeDiscord(construirMensaje(pedido, importeEditor));
      await guardarResultadoEnNotion(pedido.pageId, mensajeId, importeEditor);
      log(`Publicado PED-${pedido.numeroPedido} -> mensaje ${mensajeId}, importe editor ${importeEditor} €`);
      await esperar(1500);
    } catch (err) {
      log(`Error procesando PED-${pedido.numeroPedido}: ${err.message}`);
    }
  }

  log('Terminado.');
}

main();
