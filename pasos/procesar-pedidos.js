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
//   5. Calcular el 5% de comisión ("Importe Supervisor (€)") de los pedidos que ya tienen
//      "Supervisor asignado" y todavía no tienen ese importe calculado.
//   6. Actualizar la cuadrícula de últimos 8 vídeos de YouTube en Escritorio EDITCHEAP y
//      Supervisores, para que siempre muestre lo último subido al canal.
//   7. Generar el PDF de las facturas marcadas con "Generar PDF" y sin "Enlace PDF", y subirlo
//      a la carpeta de Google Drive compartida con la cuenta de servicio.
//   8. Generar el PDF del Acuerdo de Colaboración de Clientes y Editores marcados con
//      "Generar Acuerdo" y sin "Enlace Acuerdo" (mismo mecanismo que las facturas).
//   9. Asignar una Sala de Reunión de Discord a cada pedido con cliente, dar acceso al
//      editor cuando se le asigna, y liberar la sala cuando el pedido se finaliza. En cuanto
//      Jorge rellena los enlaces de subida/descarga de material del cliente en Notion, se
//      manda un mensaje con ellos a la sala (una sola vez). Cuando el PDF de una factura de
//      Cliente ya está generado, se avisa también en la sala de su pedido con el enlace.
//      Cuando el Acuerdo de un Cliente está listo, se avisa en su sala; el del Editor se
//      manda por mensaje directo de Discord (los editores no tienen sala propia).
//  10. Generar una Factura (Cliente o Editor) directamente desde el Pedido, marcando
//      "Generar Factura Cliente"/"Generar Factura Editor" — evita tener que ir a la base de
//      datos de Facturas a crearla a mano.
//  11. Al asignar editor, calcular "Fecha límite" = hoy + "Duración Estimada (días)" (suma de
//      la duración de cada servicio del Catálogo, ya con margen incluido). El plazo también
//      se muestra en la oferta de Discord antes de que el editor se apunte.
// Cada fase guarda su resultado en Notion solo si Discord confirma éxito, así que si algo
// falla a mitad, la siguiente ejecución simplemente reintenta ese pedido.
//
// Ejecutar: node pasos/procesar-pedidos.js

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_DATA_SOURCE_ID = process.env.NOTION_DATA_SOURCE_ID;
const NOTION_EDITORES_DATA_SOURCE_ID = '39151046-61ea-80a0-b77d-000b5e2875d8';
const NOTION_FACTURAS_DATA_SOURCE_ID = '974452ae-34ca-4d1c-9b8a-a177dda689fb';
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;
const GOOGLE_APPS_SCRIPT_URL = process.env.GOOGLE_APPS_SCRIPT_URL;
const GOOGLE_APPS_SCRIPT_SECRET = process.env.GOOGLE_APPS_SCRIPT_SECRET;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_UPLOADS_PLAYLIST_ID = 'UUH2mq9Bi754AFlKygVrO9Ow';
const NOTION_PAGINAS_CON_CUADRICULA_YOUTUBE = ['39a5104661ea81e8a934e6438c60410a', '3a551046-61ea-810c-89c0-e0912bcd4e06'];

const DISCORD_GUILD_ID = '1375827720235122698';
const PERM_SALA_REUNION = 1024 + 1048576 + 2097152 + 512; // VIEW_CHANNEL + CONNECT + SPEAK + STREAM
const KERO86_DISCORD_ID = '550072806524715058';
const EDITCHEAP_DISCORD_ID = '1375827144046809249';
const SALAS_REUNION = [
  { nombre: '🎥 Sala de Reuniones 1', id: '1531621397409960046' },
  { nombre: '🎥 Sala de Reuniones 2', id: '1531621405345452135' },
  { nombre: '🎥 Sala de Reuniones 3', id: '1531621413205577850' },
  { nombre: '🎥 Sala de Reuniones 4', id: '1531659234364620892' },
  { nombre: '🎥 Sala de Reuniones 5', id: '1531659238512787496' },
  { nombre: '🎥 Sala de Reuniones 6', id: '1531659242757558383' },
  { nombre: '🎥 Sala de Reuniones 7', id: '1531659246884618260' },
  { nombre: '🎥 Sala de Reuniones 8', id: '1531659251053887568' },
  { nombre: '🎥 Sala de Reuniones 9', id: '1531659255629742252' },
  { nombre: '🎥 Sala de Reuniones 10', id: '1531659259748679843' },
  { nombre: '🎥 Sala de Reuniones 11', id: '1531659263913496676' },
  { nombre: '🎥 Sala de Reuniones 12', id: '1531659268359458906' },
  { nombre: '🎥 Sala de Reuniones 13', id: '1531659272713142372' },
  { nombre: '🎥 Sala de Reuniones 14', id: '1531659276756582530' },
  { nombre: '🎥 Sala de Reuniones 15', id: '1531659281181442190' },
  { nombre: '🎥 Sala de Reuniones 16', id: '1531659286977970219' },
  { nombre: '🎥 Sala de Reuniones 17', id: '1531659291272941598' },
  { nombre: '🎥 Sala de Reuniones 18', id: '1531659295228166168' },
  { nombre: '🎥 Sala de Reuniones 19', id: '1531659299976384522' },
  { nombre: '🎥 Sala de Reuniones 20', id: '1531659304052981841' },
];

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

async function enviarMensajeDirectoDiscord(discordUserId, contenido) {
  const crear = await fetch('https://discord.com/api/v10/users/@me/channels', {
    method: 'POST',
    headers: headersDiscord(),
    body: JSON.stringify({ recipient_id: discordUserId }),
  });
  const dm = await crear.json();
  if (!crear.ok) throw new Error('Error abriendo DM de Discord: ' + JSON.stringify(dm));
  return enviarMensajeDiscordEnCanal(dm.id, contenido);
}

async function enviarMensajeDiscordEnCanal(channelId, contenido) {
  const url = `https://discord.com/api/v10/channels/${channelId}/messages`;
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
  const lineaPlazo = pedido.duracionEstimada
    ? `⏳ Plazo estimado: ${Math.ceil(pedido.duracionEstimada)} día(s) desde que te asignes (ya con margen)\n`
    : '';
  return (
    `${SEPARADOR}\n` +
    '🚨 ¡NUEVA COLABORACIÓN DISPONIBLE! 🚨\n\n' +
    `📌 Nº de Pedido: PED-${pedido.numeroPedido}\n` +
    `🎬 Tipo de servicio: ${pedido.tipoServicio}\n` +
    `📝 Detalles del trabajo: ${pedido.deseoCliente}\n` +
    `💰 Importe para el editor: ${importeEditor} €\n` +
    `${lineaPlazo}\n` +
    '⚠️ Nota: Por políticas de privacidad, los datos del cliente y el material original se gestionan de forma privada una vez asignado el cargo y verificado el correspondiente acuerdo de colaboración firmado.\n\n' +
    '🎯 ¿TE INTERESA ESTA COLABORACIÓN?\n' +
    'Usa la función "Responder" de Discord sobre ESTE mensaje (no escribas un mensaje nuevo en el canal) para apuntarte. Se asigna al primero que responda así. ¡A por ello! 💪\n' +
    `${SEPARADOR}`
  );
}

function construirMensajeBienvenidaSala(discordId, numeroPedido, enlaceSubida, enlaceDescarga) {
  const lineaSubida = enlaceSubida ? `📤 Sube aquí tu material para el editor: ${enlaceSubida}\n` : '';
  const lineaDescarga = enlaceDescarga ? `📥 Aquí podrás descargar tus entregas finales: ${enlaceDescarga}\n` : '';
  return (
    `${SEPARADOR}\n` +
    `<@${discordId}>\n\n` +
    '🎥 ¡BIENVENIDO/A A TU SALA DE REUNIONES! 🎥\n\n' +
    `📌 Pedido: PED-${numeroPedido}\n\n` +
    'Esta sala es privada: solo tú y el equipo de EDITCHEAP asignado a tu proyecto podéis entrar y veros aquí.\n\n' +
    `${lineaSubida}${lineaDescarga}` +
    (lineaSubida || lineaDescarga ? '\n' : '') +
    '🎙️ Cuando quieras hacer una videollamada con tu editor, entra aquí por voz cuando os venga bien a los dos.\n' +
    '💬 Si tienes cualquier duda mientras tanto, escribe en el canal de #tickets-soporte.\n\n' +
    '¡Bienvenido/a y gracias por confiar en EDITCHEAP! 👋\n' +
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
      duracionEstimada: p['Duración Estimada (días)'].rollup ? p['Duración Estimada (días)'].rollup.number : null,
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
      duracionEstimada: p['Duración Estimada (días)'].rollup ? p['Duración Estimada (días)'].rollup.number : null,
    };
  });
}

// Fecha límite = hoy + Duración Estimada (suma de "Duración estimada (días)" de los servicios
// del pedido, ya con margen incluido en el catálogo). Formato YYYY-MM-DD para Notion.
function calcularFechaLimite(duracionDias) {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + Math.ceil(duracionDias));
  return fecha.toISOString().slice(0, 10);
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

      const propiedades = {
        'Editor principal': { relation: [{ id: editor.id }] },
        'Estado del pedido': { status: { name: '2. Reunión Agendada' } },
      };
      if (pedido.duracionEstimada) {
        propiedades['Fecha límite'] = { date: { start: calcularFechaLimite(pedido.duracionEstimada) } };
      }
      await actualizarNotion(pedido.pageId, propiedades);
      log(
        `PED-${pedido.numeroPedido}: asignado a ${tagDiscord}` +
          (pedido.duracionEstimada ? `, fecha límite calculada (${Math.ceil(pedido.duracionEstimada)} día(s))` : '')
      );
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

// ---------- FASE 5: calcular el 5% de comisión del supervisor asignado ----------

async function obtenerPedidosParaComisionSupervisor() {
  const resultados = await consultarNotion({
    and: [
      { property: 'Supervisor asignado', relation: { is_not_empty: true } },
      { property: 'Importe Supervisor (€)', number: { is_empty: true } },
    ],
  });
  return resultados.map((pedido) => {
    const p = pedido.properties;
    return {
      pageId: pedido.id,
      numeroPedido: p['Nº de Pedido'].unique_id.number,
      montoTotal: p['Monto total (€)'].formula.number || 0,
    };
  });
}

async function procesarComisionSupervisor() {
  const pedidos = await obtenerPedidosParaComisionSupervisor();
  log(`Pedidos con supervisor pendientes de calcular comisión: ${pedidos.length}`);

  for (const pedido of pedidos) {
    try {
      const importeSupervisor = Math.round(pedido.montoTotal * 0.05 * 100) / 100;
      await actualizarNotion(pedido.pageId, { 'Importe Supervisor (€)': { number: importeSupervisor } });
      log(`PED-${pedido.numeroPedido}: comisión de supervisor calculada -> ${importeSupervisor} €`);
    } catch (err) {
      log(`Error calculando comisión de supervisor de PED-${pedido.numeroPedido}: ${err.message}`);
    }
  }
}

// ---------- FASE 6: mantener al día la cuadrícula de últimos vídeos de YouTube ----------
//
// La cuadrícula es una lista de 4 columnas x 2 vídeos en Notion (Escritorio EDITCHEAP y
// Supervisores). Cada vídeo es un bloque "embed" fijo — esta fase busca esos 8 bloques y
// reescribe su URL con los últimos 8 vídeos subidos al canal, para que se vea siempre al día
// sin depender de ningún widget externo (Elfsight se quedó una vez con datos de hace 3 meses).

async function obtenerHijosBloqueNotion(blockId) {
  const url = `https://api.notion.com/v1/blocks/${blockId}/children?page_size=100`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${NOTION_TOKEN}`, 'Notion-Version': '2025-09-03' },
  });
  const data = await response.json();
  if (!response.ok) throw new Error('Error leyendo bloques de Notion: ' + JSON.stringify(data));
  return data.results;
}

async function actualizarBloqueEmbedNotion(blockId, urlNueva) {
  const url = `https://api.notion.com/v1/blocks/${blockId}`;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': '2025-09-03',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ embed: { url: urlNueva } }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error('Error actualizando bloque embed: ' + JSON.stringify(data));
}

function textoDeBloque(bloque) {
  const richText = bloque[bloque.type] && bloque[bloque.type].rich_text;
  return richText ? richText.map((t) => t.plain_text).join('') : '';
}

// Busca recursivamente, entre los descendientes de un bloque, la lista de columnas que viene
// justo después del texto indicado (ej. el encabezado "Ultimas publicaciones Youtube").
async function buscarListaColumnasTrasTexto(blockId, textoBuscado) {
  const hijos = await obtenerHijosBloqueNotion(blockId);
  for (let i = 0; i < hijos.length; i++) {
    if (textoDeBloque(hijos[i]).includes(textoBuscado) && hijos[i + 1] && hijos[i + 1].type === 'column_list') {
      return hijos[i + 1].id;
    }
  }
  for (const bloque of hijos) {
    if (bloque.type === 'column_list' || bloque.type === 'column') {
      const encontrado = await buscarListaColumnasTrasTexto(bloque.id, textoBuscado);
      if (encontrado) return encontrado;
    } else if (bloque.has_children) {
      const encontrado = await buscarListaColumnasTrasTexto(bloque.id, textoBuscado);
      if (encontrado) return encontrado;
    }
  }
  return null;
}

async function obtenerColumnasDeVideos(pageId) {
  const listaColumnasId = await buscarListaColumnasTrasTexto(pageId, 'Ultimas publicaciones Youtube');
  if (!listaColumnasId) throw new Error('no se encontró la cuadrícula de vídeos de YouTube en la página');
  const columnas = await obtenerHijosBloqueNotion(listaColumnasId);
  const resultado = [];
  for (const columna of columnas) {
    const hijos = await obtenerHijosBloqueNotion(columna.id);
    resultado.push(hijos.filter((b) => b.type === 'embed'));
  }
  return resultado;
}

async function obtenerUltimosVideoIds(cantidad) {
  const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${YOUTUBE_UPLOADS_PLAYLIST_ID}&maxResults=${cantidad}&key=${YOUTUBE_API_KEY}`;
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) throw new Error('Error consultando la API de YouTube: ' + JSON.stringify(data));
  return data.items.map((item) => item.snippet.resourceId.videoId);
}

async function procesarCuadriculaYoutube() {
  if (!YOUTUBE_API_KEY) {
    log('YOUTUBE_API_KEY no configurada, se omite la actualización de la cuadrícula de YouTube.');
    return;
  }
  try {
    const videoIds = await obtenerUltimosVideoIds(8);
    if (videoIds.length < 8) {
      log(`La API de YouTube solo devolvió ${videoIds.length} vídeos, se omite esta vez.`);
      return;
    }
    for (const pageId of NOTION_PAGINAS_CON_CUADRICULA_YOUTUBE) {
      const columnas = await obtenerColumnasDeVideos(pageId);
      let actualizados = 0;
      for (let i = 0; i < columnas.length; i++) {
        const [arriba, abajo] = columnas[i];
        const urlArriba = `https://www.youtube.com/watch?v=${videoIds[i]}`;
        const urlAbajo = `https://www.youtube.com/watch?v=${videoIds[i + 4]}`;
        if (arriba && arriba.embed.url !== urlArriba) {
          await actualizarBloqueEmbedNotion(arriba.id, urlArriba);
          actualizados++;
        }
        if (abajo && abajo.embed.url !== urlAbajo) {
          await actualizarBloqueEmbedNotion(abajo.id, urlAbajo);
          actualizados++;
        }
      }
      log(`Cuadrícula de YouTube en página ${pageId}: ${actualizados} recuadro(s) actualizado(s)`);
    }
  } catch (err) {
    log(`Error actualizando cuadrícula de YouTube: ${err.message}`);
  }
}

// ---------- FASE 7: generar PDF de facturas y subirlo a Google Drive ----------

function primerIdRelacion(propiedad) {
  if (!propiedad || !propiedad.relation || propiedad.relation.length === 0) return null;
  return propiedad.relation[0].id;
}

function tituloDePagina(pagina, nombrePropiedad) {
  const prop = pagina.properties[nombrePropiedad];
  if (!prop || !prop.title || prop.title.length === 0) return '(sin nombre)';
  return prop.title.map((t) => t.plain_text).join('');
}

async function consultarFacturas(filter) {
  const url = `https://api.notion.com/v1/data_sources/${NOTION_FACTURAS_DATA_SOURCE_ID}/query`;
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
  if (!response.ok) throw new Error('Error consultando facturas en Notion: ' + JSON.stringify(data));
  return data.results;
}

async function obtenerFacturasParaPDF() {
  return consultarFacturas({
    and: [
      { property: 'Generar PDF', checkbox: { equals: true } },
      { property: 'Enlace PDF', url: { is_empty: true } },
    ],
  });
}

async function construirDatosFactura(factura) {
  const f = factura.properties;
  const tipo = f['Tipo'].select ? f['Tipo'].select.name : null;
  const pedidoId = primerIdRelacion(f['Pedido']);
  if (!pedidoId) throw new Error('la factura no tiene ningún pedido enlazado');

  const pedido = await obtenerPaginaNotion(pedidoId);
  const p = pedido.properties;

  let nombreCliente = '(sin cliente asignado)';
  let contactoCliente = '';
  let dniCliente = '';
  const clienteId = primerIdRelacion(p['Cliente']);
  if (clienteId) {
    const cliente = await obtenerPaginaNotion(clienteId);
    nombreCliente = tituloDePagina(cliente, 'Nombre del Cliente');
    contactoCliente = textoDe(cliente.properties['Contacto / Red']);
    dniCliente = textoDe(cliente.properties['DNI/CIF']);
  }

  let nombreEditor = '(sin editor asignado)';
  let dniEditor = '';
  const editorId = primerIdRelacion(p['Editor principal']);
  if (editorId) {
    const editor = await obtenerPaginaNotion(editorId);
    nombreEditor = tituloDePagina(editor, 'Nombre');
    dniEditor = textoDe(editor.properties['DNI/NIE']);
  }

  const montoTotal = p['Monto total (€)'].formula.number || 0;
  const importeEditor = p['Importe Editor (€)'].number || 0;
  const nombrePrincipal = tipo === 'Cliente' ? nombreCliente : nombreEditor;
  const dni = tipo === 'Cliente' ? dniCliente : dniEditor;
  const destinatario = tipo === 'Cliente' && contactoCliente ? `Contacto: ${contactoCliente}` : '';

  const ajusteManual = p['Ajuste manual (€)'].number || 0;
  const ajuste =
    ajusteManual !== 0
      ? `Ajuste: ${ajusteManual > 0 ? '+' : ''}${ajusteManual} € — ${textoDe(p['Concepto del ajuste'])}`
      : '';

  return {
    numeroFactura: f['Nº Factura'].unique_id.number,
    tipo,
    fecha: f['Fecha'].date ? f['Fecha'].date.start : null,
    numeroPedido: p['Nº de Pedido'].unique_id.number,
    nombrePrincipal,
    destinatario,
    dni,
    servicios: await nombresServiciosDe(p['Servicios web']),
    deseoCliente: textoDe(p['Deseo del cliente']),
    importe: tipo === 'Cliente' ? montoTotal : importeEditor,
    ajuste,
  };
}

// El Apps Script a veces responde con una pagina de error HTML (login de Google, excepcion
// no capturada, etc.) en vez de JSON. Sin esto, ese caso se veia como "Unexpected token '<'"
// en los logs, dificil de diagnosticar. Con esto se ve claro que la respuesta no fue JSON.
async function parsearRespuestaAppsScript(response, contexto) {
  const texto = await response.text();
  let data;
  try {
    data = JSON.parse(texto);
  } catch {
    throw new Error(
      `Error ${contexto} en Drive: el Apps Script no devolvio JSON (HTTP ${response.status}). ` +
        `Primeros 200 caracteres de la respuesta: ${texto.slice(0, 200)}`
    );
  }
  if (!response.ok || data.error) throw new Error(`Error ${contexto} en Drive: ` + JSON.stringify(data));
  return data;
}

// Genera la factura a partir de la plantilla de Google Docs (Apps Script sustituye los
// marcadores {{...}} y exporta el resultado como PDF a la carpeta de Drive).
async function generarFacturaEnDrive(datos, nombreArchivo) {
  const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secreto: GOOGLE_APPS_SCRIPT_SECRET,
      carpetaId: GOOGLE_DRIVE_FOLDER_ID,
      nombreArchivo,
      // Sin este campo, el Apps Script no distingue Factura de Acuerdo y devuelve una
      // pagina de error HTML en vez de JSON (bug detectado en auditoria del 2026-08-04).
      tipoDocumento: 'Factura',
      tipoFactura: datos.tipo,
      datos: {
        NUMERO_FACTURA: `FACT-${datos.numeroFactura}`,
        TIPO: datos.nombrePrincipal,
        DNI:
          datos.dni && datos.dni !== '(sin especificar)'
            ? `${datos.tipo === 'Cliente' ? 'DNI/CIF' : 'DNI/NIE'}: ${datos.dni}`
            : '',
        FECHA: datos.fecha || '(sin fecha)',
        NUMERO_PEDIDO: `PED-${datos.numeroPedido}`,
        DESTINATARIO: datos.destinatario,
        SERVICIOS: datos.servicios,
        DETALLES: datos.deseoCliente && datos.deseoCliente !== '(sin especificar)' ? datos.deseoCliente : '',
        IMPORTE: `${datos.importe} €`,
        AJUSTE: datos.ajuste || '',
      },
    }),
  });
  const data = await parsearRespuestaAppsScript(response, 'generando factura');
  return { url: data.url, editUrl: data.editUrl };
}

async function procesarFacturas() {
  const facturas = await obtenerFacturasParaPDF();
  log(`Facturas pendientes de generar PDF: ${facturas.length}`);

  for (const factura of facturas) {
    const numeroFactura = factura.properties['Nº Factura'].unique_id.number;
    try {
      const datos = await construirDatosFactura(factura);
      const nombreArchivo = `Factura-FACT-${numeroFactura}-${datos.tipo}.pdf`;
      const { url: enlace, editUrl } = await generarFacturaEnDrive(datos, nombreArchivo);
      await actualizarNotion(factura.id, { 'Enlace PDF': { url: enlace }, 'Editar factura': { url: editUrl } });
      log(`Generado PDF de factura FACT-${numeroFactura} -> ${enlace}`);
      await esperar(1000);
    } catch (err) {
      log(`Error generando PDF de factura FACT-${numeroFactura}: ${err.message}`);
    }
  }
}

// ---------- FASE 8: generar Acuerdos de Colaboración (Clientes y Editores) ----------
//
// Igual que las facturas: al marcar "Generar Acuerdo" en un Cliente o Editor, se genera un PDF
// a partir de la plantilla correspondiente y se guarda el enlace en "Enlace Acuerdo". Usa el
// mismo Apps Script que las facturas, pero con tipoDocumento: 'Acuerdo' para que use las
// plantillas y carpetas de Drive de Acuerdos en vez de las de Facturas.

const NOTION_CLIENTES_DATA_SOURCE_ID = '39151046-61ea-805f-829a-000b0eb6cf52';

function fechaDeHoyLarga() {
  return new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}

async function obtenerClientesParaAcuerdo() {
  return consultarDataSource(NOTION_CLIENTES_DATA_SOURCE_ID, {
    and: [
      { property: 'Generar Acuerdo', checkbox: { equals: true } },
      { property: 'Enlace Acuerdo', url: { is_empty: true } },
    ],
  });
}

async function obtenerEditoresParaAcuerdo() {
  return consultarDataSource(NOTION_EDITORES_DATA_SOURCE_ID, {
    and: [
      { property: 'Generar Acuerdo', checkbox: { equals: true } },
      { property: 'Enlace Acuerdo', url: { is_empty: true } },
    ],
  });
}

async function consultarDataSource(dataSourceId, filter) {
  const url = `https://api.notion.com/v1/data_sources/${dataSourceId}/query`;
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

async function generarAcuerdoEnDrive(tipoFactura, datos, nombreArchivo) {
  const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secreto: GOOGLE_APPS_SCRIPT_SECRET,
      carpetaId: GOOGLE_DRIVE_FOLDER_ID,
      nombreArchivo,
      tipoDocumento: 'Acuerdo',
      tipoFactura,
      datos,
    }),
  });
  const data = await parsearRespuestaAppsScript(response, 'generando Acuerdo');
  return { url: data.url, editUrl: data.editUrl };
}

async function procesarAcuerdosClientes() {
  const clientes = await obtenerClientesParaAcuerdo();
  log(`Clientes pendientes de generar Acuerdo: ${clientes.length}`);

  for (const cliente of clientes) {
    const nombre = tituloDePagina(cliente, 'Nombre del Cliente');
    try {
      const c = cliente.properties;
      const dni = textoDe(c['DNI/CIF']);
      let numeroPedido = '(sin especificar)';
      const pedidoId = primerIdRelacion(c['📥 Pedidos']);
      if (pedidoId) {
        const pedido = await obtenerPaginaNotion(pedidoId);
        numeroPedido = `PED-${pedido.properties['Nº de Pedido'].unique_id.number}`;
      }

      const datos = {
        FECHA: fechaDeHoyLarga(),
        NUMERO_PEDIDO: numeroPedido,
        NOMBRE: nombre,
        DNI: dni !== '(sin especificar)' ? dni : '',
      };
      const nombreArchivo = `Acuerdo-Colaboracion-Cliente-${nombre}.pdf`;
      const { url: enlace } = await generarAcuerdoEnDrive('Cliente', datos, nombreArchivo);
      await actualizarNotion(cliente.id, { 'Enlace Acuerdo': { url: enlace } });
      log(`Generado Acuerdo de Colaboración del cliente ${nombre} -> ${enlace}`);
      await esperar(1000);
    } catch (err) {
      log(`Error generando Acuerdo de Colaboración del cliente ${nombre}: ${err.message}`);
    }
  }
}

async function procesarAcuerdosEditores() {
  const editores = await obtenerEditoresParaAcuerdo();
  log(`Editores pendientes de generar Acuerdo: ${editores.length}`);

  for (const editor of editores) {
    const nombre = tituloDePagina(editor, 'Nombre');
    try {
      const e = editor.properties;
      const dni = textoDe(e['DNI/NIE']);

      const datos = {
        FECHA: fechaDeHoyLarga(),
        NOMBRE: nombre,
        DNI: dni !== '(sin especificar)' ? dni : '',
      };
      const nombreArchivo = `Acuerdo-Colaboracion-Editor-${nombre}.pdf`;
      const { url: enlace } = await generarAcuerdoEnDrive('Editor', datos, nombreArchivo);
      await actualizarNotion(editor.id, { 'Enlace Acuerdo': { url: enlace } });
      log(`Generado Acuerdo de Colaboración del editor ${nombre} -> ${enlace}`);
      await esperar(1000);
    } catch (err) {
      log(`Error generando Acuerdo de Colaboración del editor ${nombre}: ${err.message}`);
    }
  }
}

// ---------- FASE 9: gestionar acceso a las Salas de Reunión de Discord ----------
//
// Cada pedido con Cliente asignado recibe una sala de voz propia (acceso solo para ese
// cliente, no por rol, para no dejar que un cliente vea la reunión de otro). Cuando se le
// asigna un Editor principal en Notion, ese editor recibe acceso a la misma sala. Al
// finalizar el pedido, se retira el acceso de ambos para dejar la sala libre para otro
// cliente. Solo kero86, la cuenta editcheap y los roles de supervisor tienen paso permanente
// a cualquier sala (permiso puesto directamente en Discord, no lo gestiona este script).

async function buscarUsuarioDiscordPorTag(tag) {
  if (!tag) return null;
  const url = `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/members/search?query=${encodeURIComponent(tag)}&limit=5`;
  const response = await fetch(url, { headers: headersDiscord() });
  const data = await response.json();
  if (!response.ok) throw new Error('Error buscando usuario de Discord: ' + JSON.stringify(data));
  const miembro = data.find((m) => m.user.username.toLowerCase() === tag.toLowerCase());
  return miembro ? miembro.user.id : null;
}

async function obtenerOverwritesCanal(channelId) {
  const url = `https://discord.com/api/v10/channels/${channelId}`;
  const response = await fetch(url, { headers: headersDiscord() });
  const data = await response.json();
  if (!response.ok) throw new Error('Error leyendo canal de Discord: ' + JSON.stringify(data));
  return data.permission_overwrites || [];
}

async function concederAccesoSala(channelId, discordUserId) {
  const url = `https://discord.com/api/v10/channels/${channelId}/permissions/${discordUserId}`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: headersDiscord(),
    body: JSON.stringify({ type: 1, allow: String(PERM_SALA_REUNION), deny: '0' }),
  });
  if (!response.ok && response.status !== 204) {
    throw new Error(`Error dando acceso a sala (HTTP ${response.status}): ${await response.text()}`);
  }
}

async function quitarAccesoSala(channelId, discordUserId) {
  const url = `https://discord.com/api/v10/channels/${channelId}/permissions/${discordUserId}`;
  const response = await fetch(url, { method: 'DELETE', headers: headersDiscord() });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Error quitando acceso a sala (HTTP ${response.status}): ${await response.text()}`);
  }
}

async function buscarSalaLibre() {
  for (const sala of SALAS_REUNION) {
    const overwrites = await obtenerOverwritesCanal(sala.id);
    const ocupada = overwrites.some(
      (o) => o.type === 1 && o.id !== KERO86_DISCORD_ID && o.id !== EDITCHEAP_DISCORD_ID
    );
    if (!ocupada) return sala;
    await esperar(400);
  }
  return null;
}

async function obtenerPedidosParaAsignarSala() {
  const resultados = await consultarNotion({
    and: [
      { property: 'Cliente', relation: { is_not_empty: true } },
      { property: 'Sala de Reunión', rich_text: { is_empty: true } },
      { property: 'Estado del pedido', status: { does_not_equal: '7. Finalizado y Entregado' } },
    ],
  });
  return resultados.map((pedido) => ({
    pageId: pedido.id,
    numeroPedido: pedido.properties['Nº de Pedido'].unique_id.number,
    clienteId: primerIdRelacion(pedido.properties['Cliente']),
  }));
}

async function procesarAsignacionSalas() {
  const pedidos = await obtenerPedidosParaAsignarSala();
  log(`Pedidos pendientes de asignar sala de reunión: ${pedidos.length}`);

  for (const pedido of pedidos) {
    try {
      const cliente = await obtenerPaginaNotion(pedido.clienteId);
      const tagCliente = textoDe(cliente.properties['Tag de Discord']);
      if (tagCliente === '(sin especificar)') {
        log(`PED-${pedido.numeroPedido}: el cliente no tiene "Tag de Discord" en Notion, se omite`);
        continue;
      }
      const discordId = await buscarUsuarioDiscordPorTag(tagCliente);
      if (!discordId) {
        log(`PED-${pedido.numeroPedido}: no se encontró en Discord a "${tagCliente}", se omite`);
        continue;
      }
      const sala = await buscarSalaLibre();
      if (!sala) {
        log(`PED-${pedido.numeroPedido}: no hay ninguna sala de reunión libre ahora mismo`);
        continue;
      }
      const enlaceSubida = cliente.properties['Enlace para Subir Material'].url;
      const enlaceDescarga = cliente.properties['Enlace para Descargar Entregas'].url;

      await concederAccesoSala(sala.id, discordId);
      await actualizarNotion(pedido.pageId, {
        'Sala de Reunión': { rich_text: [{ text: { content: sala.nombre } }] },
        'Canal Discord': { url: `https://discord.com/channels/${DISCORD_GUILD_ID}/${sala.id}` },
        // Si ya había enlaces rellenados en Notion, el mensaje de bienvenida ya los incluye
        // -> se marca como enviado para que la fase de enlaces no lo repita.
        'Enlaces Material Enviados': { checkbox: Boolean(enlaceSubida || enlaceDescarga) },
      });
      await enviarMensajeDiscordEnCanal(
        sala.id,
        construirMensajeBienvenidaSala(discordId, pedido.numeroPedido, enlaceSubida, enlaceDescarga)
      );
      log(`PED-${pedido.numeroPedido}: asignada ${sala.nombre} al cliente "${tagCliente}", mensaje de bienvenida enviado`);
      await esperar(1000);
    } catch (err) {
      log(`Error asignando sala a PED-${pedido.numeroPedido}: ${err.message}`);
    }
  }
}

async function obtenerPedidosParaAccesoEditor() {
  const resultados = await consultarNotion({
    and: [
      { property: 'Sala de Reunión', rich_text: { is_not_empty: true } },
      { property: 'Editor principal', relation: { is_not_empty: true } },
      { property: 'Estado del pedido', status: { does_not_equal: '7. Finalizado y Entregado' } },
    ],
  });
  return resultados.map((pedido) => ({
    pageId: pedido.id,
    numeroPedido: pedido.properties['Nº de Pedido'].unique_id.number,
    salaNombre: textoDe(pedido.properties['Sala de Reunión']),
    editorId: primerIdRelacion(pedido.properties['Editor principal']),
  }));
}

async function procesarAccesoEditorSala() {
  const pedidos = await obtenerPedidosParaAccesoEditor();
  log(`Pedidos con sala asignada, comprobando acceso del editor: ${pedidos.length}`);

  for (const pedido of pedidos) {
    try {
      const sala = SALAS_REUNION.find((s) => s.nombre === pedido.salaNombre);
      if (!sala) {
        log(`PED-${pedido.numeroPedido}: "${pedido.salaNombre}" no coincide con ninguna sala conocida`);
        continue;
      }
      const editor = await obtenerPaginaNotion(pedido.editorId);
      const tagEditor = textoDe(editor.properties['Tag de Discord']);
      if (tagEditor === '(sin especificar)') continue;
      const discordId = await buscarUsuarioDiscordPorTag(tagEditor);
      if (!discordId) continue;

      const overwrites = await obtenerOverwritesCanal(sala.id);
      const yaTieneAcceso = overwrites.some((o) => o.type === 1 && o.id === discordId);
      if (yaTieneAcceso) continue;

      await concederAccesoSala(sala.id, discordId);
      log(`PED-${pedido.numeroPedido}: acceso a ${sala.nombre} concedido al editor "${tagEditor}"`);
      await esperar(1000);
    } catch (err) {
      log(`Error dando acceso de sala al editor de PED-${pedido.numeroPedido}: ${err.message}`);
    }
  }
}

async function obtenerPedidosParaLiberarSala() {
  const resultados = await consultarNotion({
    and: [
      { property: 'Estado del pedido', status: { equals: '7. Finalizado y Entregado' } },
      { property: 'Sala de Reunión', rich_text: { is_not_empty: true } },
    ],
  });
  return resultados.map((pedido) => ({
    pageId: pedido.id,
    numeroPedido: pedido.properties['Nº de Pedido'].unique_id.number,
    salaNombre: textoDe(pedido.properties['Sala de Reunión']),
    clienteId: primerIdRelacion(pedido.properties['Cliente']),
    editorId: primerIdRelacion(pedido.properties['Editor principal']),
  }));
}

async function procesarLiberacionSalas() {
  const pedidos = await obtenerPedidosParaLiberarSala();
  log(`Pedidos finalizados pendientes de liberar sala: ${pedidos.length}`);

  for (const pedido of pedidos) {
    try {
      const sala = SALAS_REUNION.find((s) => s.nombre === pedido.salaNombre);
      if (!sala) {
        await actualizarNotion(pedido.pageId, { 'Sala de Reunión': { rich_text: [] }, 'Canal Discord': { url: null } });
        continue;
      }

      const idsAQuitar = [];
      for (const id of [pedido.clienteId, pedido.editorId]) {
        if (!id) continue;
        const pagina = await obtenerPaginaNotion(id);
        const tag = textoDe(pagina.properties['Tag de Discord']);
        if (tag === '(sin especificar)') continue;
        const discordId = await buscarUsuarioDiscordPorTag(tag);
        if (discordId) idsAQuitar.push(discordId);
      }

      for (const discordId of idsAQuitar) {
        await quitarAccesoSala(sala.id, discordId);
        await esperar(500);
      }
      await actualizarNotion(pedido.pageId, { 'Sala de Reunión': { rich_text: [] }, 'Canal Discord': { url: null } });
      log(`PED-${pedido.numeroPedido}: liberada ${sala.nombre} (${idsAQuitar.length} acceso(s) retirado(s))`);
      await esperar(1000);
    } catch (err) {
      log(`Error liberando sala de PED-${pedido.numeroPedido}: ${err.message}`);
    }
  }
}

function construirMensajeEnlacesMaterial(enlaceSubida, enlaceDescarga) {
  const lineaSubida = enlaceSubida ? `📤 Sube aquí tu material para el editor: ${enlaceSubida}\n` : '';
  const lineaDescarga = enlaceDescarga ? `📥 Descarga aquí tus entregas finales: ${enlaceDescarga}\n` : '';
  return (
    `${SEPARADOR}\n` +
    '📁 ENLACES PARA TU MATERIAL 📁\n\n' +
    `${lineaSubida}${lineaDescarga}\n` +
    'Puedes usarlos cuando quieras, no hace falta esperar a ninguna reunión. Si tienes cualquier duda sobre ' +
    'cómo subir o descargar, escribe en el canal de #tickets-soporte.\n' +
    `${SEPARADOR}`
  );
}

async function obtenerPedidosParaNotificarEnlaces() {
  const resultados = await consultarNotion({
    and: [
      { property: 'Sala de Reunión', rich_text: { is_not_empty: true } },
      { property: 'Enlaces Material Enviados', checkbox: { equals: false } },
      { property: 'Estado del pedido', status: { does_not_equal: '7. Finalizado y Entregado' } },
    ],
  });
  return resultados.map((pedido) => ({
    pageId: pedido.id,
    numeroPedido: pedido.properties['Nº de Pedido'].unique_id.number,
    salaNombre: textoDe(pedido.properties['Sala de Reunión']),
    clienteId: primerIdRelacion(pedido.properties['Cliente']),
  }));
}

async function procesarNotificacionEnlacesMaterial() {
  const pedidos = await obtenerPedidosParaNotificarEnlaces();
  log(`Pedidos pendientes de comprobar enlaces de material: ${pedidos.length}`);

  for (const pedido of pedidos) {
    try {
      if (!pedido.clienteId) continue;
      const sala = SALAS_REUNION.find((s) => s.nombre === pedido.salaNombre);
      if (!sala) continue;

      const cliente = await obtenerPaginaNotion(pedido.clienteId);
      const enlaceSubida = cliente.properties['Enlace para Subir Material'].url;
      const enlaceDescarga = cliente.properties['Enlace para Descargar Entregas'].url;
      if (!enlaceSubida && !enlaceDescarga) continue; // aún no los ha rellenado Jorge, se reintenta la próxima vez

      await enviarMensajeDiscordEnCanal(sala.id, construirMensajeEnlacesMaterial(enlaceSubida, enlaceDescarga));
      await actualizarNotion(pedido.pageId, { 'Enlaces Material Enviados': { checkbox: true } });
      log(`PED-${pedido.numeroPedido}: enlaces de material enviados a ${sala.nombre}`);
      await esperar(1000);
    } catch (err) {
      log(`Error notificando enlaces de material de PED-${pedido.numeroPedido}: ${err.message}`);
    }
  }
}

function construirMensajeJustificantePago(numeroFactura, enlacePDF) {
  return (
    `${SEPARADOR}\n` +
    '🧾 TU JUSTIFICANTE DE PAGO YA ESTÁ LISTO 🧾\n\n' +
    `Factura FACT-${numeroFactura}: ${enlacePDF}\n\n` +
    'Guárdalo para tus registros. Si tienes cualquier duda, escribe en el canal de #tickets-soporte.\n' +
    `${SEPARADOR}`
  );
}

async function obtenerFacturasParaNotificarSala() {
  return consultarFacturas({
    and: [
      { property: 'Tipo', select: { equals: 'Cliente' } },
      { property: 'Enlace PDF', url: { is_not_empty: true } },
      { property: 'Enviado a Sala', checkbox: { equals: false } },
    ],
  });
}

async function procesarNotificacionFacturaSala() {
  const facturas = await obtenerFacturasParaNotificarSala();
  log(`Facturas de cliente pendientes de avisar en su sala: ${facturas.length}`);

  for (const factura of facturas) {
    const numeroFactura = factura.properties['Nº Factura'].unique_id.number;
    try {
      const pedidoId = primerIdRelacion(factura.properties['Pedido']);
      if (!pedidoId) {
        log(`FACT-${numeroFactura}: no tiene pedido enlazado, se omite`);
        continue;
      }
      const pedido = await obtenerPaginaNotion(pedidoId);
      const salaNombre = textoDe(pedido.properties['Sala de Reunión']);
      if (salaNombre === '(sin especificar)') continue; // el pedido aún no tiene sala, se reintenta luego

      const sala = SALAS_REUNION.find((s) => s.nombre === salaNombre);
      if (!sala) continue;

      const enlacePDF = factura.properties['Enlace PDF'].url;
      await enviarMensajeDiscordEnCanal(sala.id, construirMensajeJustificantePago(numeroFactura, enlacePDF));
      await actualizarNotion(factura.id, { 'Enviado a Sala': { checkbox: true } });
      log(`FACT-${numeroFactura}: justificante de pago enviado a ${sala.nombre}`);
      await esperar(1000);
    } catch (err) {
      log(`Error avisando en sala de FACT-${numeroFactura}: ${err.message}`);
    }
  }
}

function construirMensajeAcuerdoCliente(discordId, enlaceAcuerdo) {
  return (
    `${SEPARADOR}\n` +
    `<@${discordId}>\n\n` +
    '📄 TU ACUERDO DE COLABORACIÓN YA ESTÁ LISTO 📄\n\n' +
    `${enlaceAcuerdo}\n\n` +
    'Puedes revisarlo y firmarlo cuando quieras. Si tienes cualquier duda, escribe en el canal de #tickets-soporte.\n' +
    `${SEPARADOR}`
  );
}

function construirMensajeAcuerdoEditor(enlaceAcuerdo) {
  return (
    `${SEPARADOR}\n` +
    '📄 TU ACUERDO DE COLABORACIÓN YA ESTÁ LISTO 📄\n\n' +
    `${enlaceAcuerdo}\n\n` +
    'Puedes revisarlo y firmarlo cuando quieras. Si tienes cualquier duda, pregunta por el canal correspondiente.\n' +
    `${SEPARADOR}`
  );
}

async function obtenerPedidosParaAvisarAcuerdoCliente() {
  const resultados = await consultarNotion({
    and: [
      { property: 'Sala de Reunión', rich_text: { is_not_empty: true } },
      { property: 'Acuerdo Enviado a Sala', checkbox: { equals: false } },
      { property: 'Estado del pedido', status: { does_not_equal: '7. Finalizado y Entregado' } },
    ],
  });
  return resultados.map((pedido) => ({
    pageId: pedido.id,
    numeroPedido: pedido.properties['Nº de Pedido'].unique_id.number,
    salaNombre: textoDe(pedido.properties['Sala de Reunión']),
    clienteId: primerIdRelacion(pedido.properties['Cliente']),
  }));
}

async function procesarAvisoAcuerdoCliente() {
  const pedidos = await obtenerPedidosParaAvisarAcuerdoCliente();
  log(`Pedidos pendientes de comprobar aviso de Acuerdo del cliente: ${pedidos.length}`);

  for (const pedido of pedidos) {
    try {
      if (!pedido.clienteId) continue;
      const sala = SALAS_REUNION.find((s) => s.nombre === pedido.salaNombre);
      if (!sala) continue;

      const cliente = await obtenerPaginaNotion(pedido.clienteId);
      const enlaceAcuerdo = cliente.properties['Enlace Acuerdo'].url;
      const tagCliente = textoDe(cliente.properties['Tag de Discord']);
      if (!enlaceAcuerdo || tagCliente === '(sin especificar)') continue; // se reintenta la próxima vez

      const discordId = await buscarUsuarioDiscordPorTag(tagCliente);
      if (!discordId) continue;

      await enviarMensajeDiscordEnCanal(sala.id, construirMensajeAcuerdoCliente(discordId, enlaceAcuerdo));
      await actualizarNotion(pedido.pageId, { 'Acuerdo Enviado a Sala': { checkbox: true } });
      log(`PED-${pedido.numeroPedido}: Acuerdo del cliente avisado en ${sala.nombre}`);
      await esperar(1000);
    } catch (err) {
      log(`Error avisando Acuerdo del cliente de PED-${pedido.numeroPedido}: ${err.message}`);
    }
  }
}

async function obtenerEditoresParaAvisarAcuerdo() {
  return consultarDataSource(NOTION_EDITORES_DATA_SOURCE_ID, {
    and: [
      { property: 'Enlace Acuerdo', url: { is_not_empty: true } },
      { property: 'Acuerdo Enviado a Discord', checkbox: { equals: false } },
      { property: 'Tag de Discord', rich_text: { is_not_empty: true } },
    ],
  });
}

async function procesarAvisoAcuerdoEditor() {
  const editores = await obtenerEditoresParaAvisarAcuerdo();
  log(`Editores pendientes de avisar de su Acuerdo por Discord: ${editores.length}`);

  for (const editor of editores) {
    const nombre = tituloDePagina(editor, 'Nombre');
    try {
      const tag = textoDe(editor.properties['Tag de Discord']);
      const discordId = await buscarUsuarioDiscordPorTag(tag);
      if (!discordId) {
        log(`Editor "${nombre}": no se encontró en Discord a "${tag}", se omite`);
        continue;
      }
      const enlaceAcuerdo = editor.properties['Enlace Acuerdo'].url;
      await enviarMensajeDirectoDiscord(discordId, construirMensajeAcuerdoEditor(enlaceAcuerdo));
      await actualizarNotion(editor.id, { 'Acuerdo Enviado a Discord': { checkbox: true } });
      log(`Editor "${nombre}": Acuerdo avisado por DM de Discord`);
      await esperar(1000);
    } catch (err) {
      log(`Error avisando Acuerdo al editor "${nombre}": ${err.message}`);
    }
  }
}

// ---------- FASE 10: generar Factura desde el propio Pedido ----------
//
// En vez de tener que ir a la base de datos de Facturas a crear una a mano, Jorge marca
// "Generar Factura Cliente" o "Generar Factura Editor" directamente en el Pedido, y esto crea
// la Factura enlazada automáticamente (con "Generar PDF" ya activado, así se genera sola).

async function obtenerPedidosParaGenerarFactura(propiedadCheckbox) {
  // No se puede filtrar por Notion si YA existe una factura de este tipo concreto (la relación
  // "Facturas" no distingue tipos), así que se trae todo lo marcado y se comprueba a mano.
  return consultarNotion({ property: propiedadCheckbox, checkbox: { equals: true } });
}

async function pedidoYaTieneFacturaDeTipo(pedido, tipo) {
  const relacion = pedido.properties['Facturas'].relation || [];
  for (const rel of relacion) {
    const factura = await obtenerPaginaNotion(rel.id);
    if (factura.properties['Tipo']?.select?.name === tipo) return true;
  }
  return false;
}

async function crearFacturaParaPedido(pedido, tipo) {
  const url = 'https://api.notion.com/v1/pages';
  const numeroPedido = pedido.properties['Nº de Pedido'].unique_id.number;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': '2025-09-03',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      parent: { data_source_id: NOTION_FACTURAS_DATA_SOURCE_ID },
      properties: {
        Nombre: { title: [{ text: { content: `Factura PED-${numeroPedido} (${tipo})` } }] },
        Tipo: { select: { name: tipo } },
        Pedido: { relation: [{ id: pedido.id }] },
        'Generar PDF': { checkbox: true },
      },
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error('Error creando factura en Notion: ' + JSON.stringify(data));
  return data;
}

async function procesarGeneracionFacturasDesdeElPedido() {
  for (const [propiedadCheckbox, tipo] of [
    ['Generar Factura Cliente', 'Cliente'],
    ['Generar Factura Editor', 'Editor'],
  ]) {
    const pedidos = await obtenerPedidosParaGenerarFactura(propiedadCheckbox);
    log(`Pedidos pendientes de crear factura de tipo ${tipo} desde "${propiedadCheckbox}": ${pedidos.length}`);

    for (const pedido of pedidos) {
      const numeroPedido = pedido.properties['Nº de Pedido'].unique_id.number;
      try {
        if (await pedidoYaTieneFacturaDeTipo(pedido, tipo)) continue;
        await crearFacturaParaPedido(pedido, tipo);
        log(`PED-${numeroPedido}: factura de tipo ${tipo} creada, se generará el PDF en el próximo paso`);
        await esperar(800);
      } catch (err) {
        log(`Error creando factura de tipo ${tipo} para PED-${numeroPedido}: ${err.message}`);
      }
    }
  }
}

// Cada fase corre aislada: si una falla de forma inesperada (ej. un fallo de red puntual,
// un campo que no existe todavia en Notion), las demas fases de esta misma ejecucion se
// siguen ejecutando igual, en vez de saltarse todo el resto como pasaba antes. El proceso
// sigue terminando con codigo de error si alguna fase fallo, para que se dispare el aviso de
// Discord de "la automatizacion ha fallado" y no pase desapercibido.
async function ejecutarFase(nombre, fn) {
  try {
    await fn();
  } catch (err) {
    log(`Error inesperado en la fase "${nombre}": ${err.stack || err.message}`);
    process.exitCode = 1;
  }
}

async function main() {
  await ejecutarFase('publicaciones', procesarPublicaciones);
  await ejecutarFase('asignaciones', procesarAsignaciones);
  await ejecutarFase('cierres', procesarCierres);
  await ejecutarFase('borrados', procesarBorrados);
  await ejecutarFase('comision supervisor', procesarComisionSupervisor);
  await ejecutarFase('cuadricula YouTube', procesarCuadriculaYoutube);
  await ejecutarFase('facturas', procesarFacturas);
  await ejecutarFase('notificacion factura sala', procesarNotificacionFacturaSala);
  await ejecutarFase('acuerdos clientes', procesarAcuerdosClientes);
  await ejecutarFase('acuerdos editores', procesarAcuerdosEditores);
  await ejecutarFase('generacion facturas desde pedido', procesarGeneracionFacturasDesdeElPedido);
  await ejecutarFase('asignacion salas', procesarAsignacionSalas);
  await ejecutarFase('acceso editor sala', procesarAccesoEditorSala);
  await ejecutarFase('notificacion enlaces material', procesarNotificacionEnlacesMaterial);
  await ejecutarFase('aviso acuerdo cliente', procesarAvisoAcuerdoCliente);
  await ejecutarFase('aviso acuerdo editor', procesarAvisoAcuerdoEditor);
  await ejecutarFase('liberacion salas', procesarLiberacionSalas);
  log('Terminado.');
}

main().catch((err) => {
  log(`Error fatal no controlado: ${err.stack || err.message}`);
  process.exitCode = 1;
});
