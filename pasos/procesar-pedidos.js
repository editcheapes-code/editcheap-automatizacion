// Script principal de la automatización. En cada ejecución hace 4 cosas, en este orden:
//   1. Publicar en Discord los pedidos con "Enviar a Discord" marcado y sin "ID Mensaje".
//   2. Asignar editor según la PRIMERA respuesta ("reply") al mensaje de la oferta: si quien
//      responde primero tiene su "Tag de Discord" registrado y activo en "✂️ Editores", se le
//      asigna el pedido automáticamente (evita que se acumulen 20 respuestas sin procesar).
//   3. Cerrar la oferta (editar el mismo mensaje para avisar de que ya está asignado) cuando
//      el pedido está en "2. Reunión Agendada", ya tiene "Editor principal" asignado, y
//      todavía no se avisó ("Aviso Discord enviado" = false).
//   4. Borrar el mensaje de Discord (y las respuestas que le hicieron, para no dejar restos
//      sueltos) cuando el pedido está "7. Finalizado y Entregado" y todavía no se borró
//      ("Discord eliminado" = false).
// Cada fase guarda su resultado en Notion solo si Discord confirma éxito, así que si algo
// falla a mitad, la siguiente ejecución simplemente reintenta ese pedido.
//
// Ejecutar: node pasos/procesar-pedidos.js

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_DATA_SOURCE_ID = process.env.NOTION_DATA_SOURCE_ID;
const NOTION_EDITORES_DATA_SOURCE_ID = '39151046-61ea-80a0-b77d-000b5e2875d8';
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

async function obtenerPaginaNotion(pageId) {
  const url = `https://api.notion.com/v1/pages/${pageId}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': '2025-09-03',
    },
  });
  const data = await response.json();
  if (!response.ok) throw new Error('Error leyendo página de Notion: ' + JSON.stringify(data));
  return data;
}

// "Servicios web" es una relación a "🧾 Catálogo de Servicios" (permite elegir variantes ×2, ×3...
// del mismo servicio en vez de repetir la misma etiqueta, que Notion no permite).
async function nombresServiciosDe(propiedadRelacion) {
  if (!propiedadRelacion || !propiedadRelacion.relation || propiedadRelacion.relation.length === 0) {
    return '(sin especificar)';
  }
  const nombres = [];
  for (const rel of propiedadRelacion.relation) {
    const pagina = await obtenerPaginaNotion(rel.id);
    const titulo = pagina.properties['Nombre'];
    nombres.push(titulo && titulo.title && titulo.title.length > 0 ? titulo.title.map((t) => t.plain_text).join('') : '(servicio sin nombre)');
  }
  return nombres.join(', ');
}

async function consultarNotion(filter) {
  const url = `https://api.notion.com/v1/data_sources/${NOTION_DATA_SOURCE_ID}/query`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': '2025-09-03',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ filter }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error('Error consultando Notion: ' + JSON.stringify(data));
  return data.results;
}

async function actualizarNotion(pageId, properties) {
  const url = `https://api.notion.com/v1/pages/${pageId}`;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': '2025-09-03',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ properties }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error('Error actualizando Notion: ' + JSON.stringify(data));
}

function headersDiscord() {
  return {
    Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
    'Content-Type': 'application/json',
    'User-Agent': 'DiscordBot (https://editcheap.es, 1.0)',
  };
}

async function enviarMensajeDiscord(contenido) {
  const url = `https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages`;
  const response = await fetch(url, { method: 'POST', headers: headersDiscord(), body: JSON.stringify({ content: contenido }) });
  const data = await response.json();
  if (!response.ok) throw new Error('Error enviando a Discord: ' + JSON.stringify(data));
  return data.id;
}

async function editarMensajeDiscord(mensajeId, body) {
  const url = `https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages/${mensajeId}`;
  const response = await fetch(url, { method: 'PATCH', headers: headersDiscord(), body: JSON.stringify(body) });
  if (!response.ok) {
    const texto = await response.text();
    throw new Error(`Error editando mensaje de Discord (HTTP ${response.status}): ${texto}`);
  }
}

async function obtenerRespuestas(mensajeId) {
  const url = `https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages?after=${mensajeId}&limit=100`;
  const response = await fetch(url, { headers: headersDiscord() });
  const data = await response.json();
  if (!response.ok) throw new Error('Error leyendo mensajes de Discord: ' + JSON.stringify(data));

  return data
    .filter((m) => m.message_reference && m.message_reference.message_id === mensajeId)
    .sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
}

async function obtenerPrimeraRespuesta(mensajeId) {
  const respuestas = await obtenerRespuestas(mensajeId);
  return respuestas[0] || null;
}

async function buscarEditorPorTagDiscord(tagDiscord) {
  const url = `https://api.notion.com/v1/data_sources/${NOTION_EDITORES_DATA_SOURCE_ID}/query`;
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
          { property: 'Tag de Discord', rich_text: { equals: tagDiscord } },
          { property: '¿Activo?', checkbox: { equals: true } },
        ],
      },
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error('Error buscando editor en Notion: ' + JSON.stringify(data));
  return data.results[0] || null;
}

async function borrarMensajeDiscord(mensajeId) {
  const url = `https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages/${mensajeId}`;
  const response = await fetch(url, { method: 'DELETE', headers: headersDiscord() });
  if (!response.ok && response.status !== 404) {
    const texto = await response.text();
    throw new Error(`Error borrando mensaje de Discord (HTTP ${response.status}): ${texto}`);
  }
}

const SEPARADOR = '▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬';

function construirMensajeOferta(pedido, importeEditor) {
  return (
    `${SEPARADOR}\n` +
    '🚨 ¡NUEVA COLABORACIÓN DISPONIBLE! 🚨\n\n' +
    `📌 Nº de Pedido: PED-${pedido.numeroPedido}\n` +
    `🎬 Tipo de servicio: ${pedido.tipoServicio}\n` +
    `📝 Detalles del trabajo: ${pedido.deseoCliente}\n` +
    `💰 Importe para el editor: ${importeEditor} €\n\n` +
    '⚠️ Nota: Por políticas de privacidad, los datos del cliente y el material original se gestionan de forma privada una vez asignado el cargo y verificado el correspondiente acuerdo de colaboración firmado.\n\n' +
    '🎯 ¿TE INTERESA ESTA COLABORACIÓN?\n' +
    'Usa la función "Responder" de Discord sobre ESTE mensaje (no escribas un mensaje nuevo en el canal) para apuntarte. Se asigna al primero que responda así. ¡A por ello! 💪\n' +
    `${SEPARADOR}`
  );
}

function construirMensajeCerrado(pedido) {
  return (
    `${SEPARADOR}\n` +
    '✅ COLABORACIÓN YA ASIGNADA\n\n' +
    `📌 Nº de Pedido: PED-${pedido.numeroPedido}\n` +
    `🎬 Tipo de servicio: ${pedido.tipoServicio}\n` +
    `📝 Detalles del trabajo: ${pedido.deseoCliente}\n` +
    `💰 Importe para el editor: ${pedido.importeEditor} €\n\n` +
    'Este proyecto ya tiene editor asignado. ¡Gracias a todos los interesados en colaborar! 🙌\n' +
    `${SEPARADOR}`
  );
}

// ---------- FASE 1: publicar pedidos nuevos ----------

async function obtenerPedidosParaPublicar() {
  const resultados = await consultarNotion({
    and: [
      { property: 'Enviar a Discord', checkbox: { equals: true } },
      { property: 'ID Mensaje', rich_text: { is_empty: true } },
    ],
  });
  const pedidos = [];
  for (const pedido of resultados) {
    const p = pedido.properties;
    pedidos.push({
      pageId: pedido.id,
      numeroPedido: p['Nº de Pedido'].unique_id.number,
      tipoServicio: await nombresServiciosDe(p['Servicios web']),
      deseoCliente: textoDe(p['Deseo del cliente']),
      montoTotal: p['Monto total (€)'].formula.number,
    });
  }
  return pedidos;
}

async function procesarPublicaciones() {
  const pedidos = await obtenerPedidosParaPublicar();
  log(`Pedidos pendientes de publicar: ${pedidos.length}`);

  for (const pedido of pedidos) {
    try {
      const importeEditor = Math.round(pedido.montoTotal * 0.7 * 100) / 100;
      const mensajeId = await enviarMensajeDiscord(construirMensajeOferta(pedido, importeEditor));
      await actualizarNotion(pedido.pageId, {
        'ID Mensaje': { rich_text: [{ text: { content: mensajeId } }] },
        'Importe Editor (€)': { number: importeEditor },
      });
      log(`Publicado PED-${pedido.numeroPedido} -> mensaje ${mensajeId}, importe editor ${importeEditor} €`);
      await esperar(1500);
    } catch (err) {
      log(`Error publicando PED-${pedido.numeroPedido}: ${err.message}`);
    }
  }
}

// ---------- FASE 2: asignar editor según la primera respuesta en Discord ----------

async function obtenerPedidosParaAsignar() {
  const resultados = await consultarNotion({
    and: [
      { property: 'ID Mensaje', rich_text: { is_not_empty: true } },
      { property: 'Editor principal', relation: { is_empty: true } },
      { property: 'Enviar a Discord', checkbox: { equals: true } },
    ],
  });
  return resultados.map((pedido) => {
    const p = pedido.properties;
    return {
      pageId: pedido.id,
      numeroPedido: p['Nº de Pedido'].unique_id.number,
      mensajeId: textoDe(p['ID Mensaje']),
    };
  });
}

async function procesarAsignaciones() {
  const pedidos = await obtenerPedidosParaAsignar();
  log(`Pedidos esperando primera respuesta: ${pedidos.length}`);

  for (const pedido of pedidos) {
    try {
      const respuesta = await obtenerPrimeraRespuesta(pedido.mensajeId);
      await esperar(1500); // evitar "rate limited" de Discord al encadenar comprobaciones
      if (!respuesta) continue;

      const tagDiscord = respuesta.author.username;
      const editor = await buscarEditorPorTagDiscord(tagDiscord);
      if (!editor) {
        log(`PED-${pedido.numeroPedido}: respondió "${tagDiscord}" pero no es un editor activo registrado, se ignora`);
        continue;
      }

      await actualizarNotion(pedido.pageId, {
        'Editor principal': { relation: [{ id: editor.id }] },
        'Estado del pedido': { status: { name: '2. Reunión Agendada' } },
      });
      log(`PED-${pedido.numeroPedido}: asignado a ${tagDiscord}`);
    } catch (err) {
      log(`Error asignando PED-${pedido.numeroPedido}: ${err.message}`);
    }
  }
}

// ---------- FASE 3: cerrar oferta cuando hay editor asignado ----------

async function obtenerPedidosParaCerrar() {
  const resultados = await consultarNotion({
    and: [
      { property: 'Estado del pedido', status: { equals: '2. Reunión Agendada' } },
      { property: 'Editor principal', relation: { is_not_empty: true } },
      { property: 'Aviso Discord enviado', checkbox: { equals: false } },
      { property: 'ID Mensaje', rich_text: { is_not_empty: true } },
    ],
  });
  const pedidos = [];
  for (const pedido of resultados) {
    const p = pedido.properties;
    pedidos.push({
      pageId: pedido.id,
      numeroPedido: p['Nº de Pedido'].unique_id.number,
      mensajeId: textoDe(p['ID Mensaje']),
      tipoServicio: await nombresServiciosDe(p['Servicios web']),
      deseoCliente: textoDe(p['Deseo del cliente']),
      importeEditor: p['Importe Editor (€)'].number,
    });
  }
  return pedidos;
}

async function procesarCierres() {
  const pedidos = await obtenerPedidosParaCerrar();
  log(`Pedidos pendientes de cerrar oferta: ${pedidos.length}`);

  for (const pedido of pedidos) {
    try {
      await editarMensajeDiscord(pedido.mensajeId, { content: construirMensajeCerrado(pedido), embeds: [] });
      await actualizarNotion(pedido.pageId, { 'Aviso Discord enviado': { checkbox: true } });
      log(`Cerrada oferta de PED-${pedido.numeroPedido}`);
      await esperar(1500);
    } catch (err) {
      log(`Error cerrando oferta de PED-${pedido.numeroPedido}: ${err.message}`);
    }
  }
}

// ---------- FASE 4: borrar mensaje al finalizar el pedido ----------

async function obtenerPedidosParaBorrar() {
  const resultados = await consultarNotion({
    and: [
      { property: 'Estado del pedido', status: { equals: '7. Finalizado y Entregado' } },
      { property: 'Discord eliminado', checkbox: { equals: false } },
      { property: 'ID Mensaje', rich_text: { is_not_empty: true } },
    ],
  });
  return resultados.map((pedido) => {
    const p = pedido.properties;
    return {
      pageId: pedido.id,
      numeroPedido: p['Nº de Pedido'].unique_id.number,
      mensajeId: textoDe(p['ID Mensaje']),
    };
  });
}

async function procesarBorrados() {
  const pedidos = await obtenerPedidosParaBorrar();
  log(`Pedidos pendientes de borrar mensaje: ${pedidos.length}`);

  for (const pedido of pedidos) {
    try {
      const respuestas = await obtenerRespuestas(pedido.mensajeId);
      for (const respuesta of respuestas) {
        await borrarMensajeDiscord(respuesta.id);
        await esperar(500);
      }
      await borrarMensajeDiscord(pedido.mensajeId);
      await actualizarNotion(pedido.pageId, { 'Discord eliminado': { checkbox: true } });
      log(`Borrado mensaje de PED-${pedido.numeroPedido} y ${respuestas.length} respuesta(s) asociada(s)`);
      await esperar(1500);
    } catch (err) {
      log(`Error borrando mensaje de PED-${pedido.numeroPedido}: ${err.message}`);
    }
  }
}

async function main() {
  await procesarPublicaciones();
  await procesarAsignaciones();
  await procesarCierres();
  await procesarBorrados();
  log('Terminado.');
}

main();
