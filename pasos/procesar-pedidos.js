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
//   5. Generar el PDF de las facturas marcadas con "Generar PDF" y sin "Enlace PDF", y subirlo
//      a la carpeta de Google Drive compartida con la cuenta de servicio.
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

// ---------- FASE 5: generar PDF de facturas y subirlo a Google Drive ----------

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
  const clienteId = primerIdRelacion(p['Cliente']);
  if (clienteId) {
    const cliente = await obtenerPaginaNotion(clienteId);
    nombreCliente = tituloDePagina(cliente, 'Nombre del Cliente');
    contactoCliente = textoDe(cliente.properties['Contacto / Red']);
  }

  let nombreEditor = '(sin editor asignado)';
  const editorId = primerIdRelacion(p['Editor principal']);
  if (editorId) {
    const editor = await obtenerPaginaNotion(editorId);
    nombreEditor = tituloDePagina(editor, 'Nombre');
  }

  const montoTotal = p['Monto total (€)'].formula.number || 0;
  const importeEditor = p['Importe Editor (€)'].number || 0;
  const destinatario =
    tipo === 'Cliente'
      ? `Cliente: ${nombreCliente}` + (contactoCliente ? `\nContacto: ${contactoCliente}` : '')
      : `Editor: ${nombreEditor}`;

  return {
    numeroFactura: f['Nº Factura'].unique_id.number,
    tipo,
    fecha: f['Fecha'].date ? f['Fecha'].date.start : null,
    numeroPedido: p['Nº de Pedido'].unique_id.number,
    destinatario,
    servicios: await nombresServiciosDe(p['Servicios web']),
    deseoCliente: textoDe(p['Deseo del cliente']),
    importe: tipo === 'Cliente' ? montoTotal : importeEditor,
  };
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
      tipoFactura: datos.tipo,
      datos: {
        NUMERO_FACTURA: `FACT-${datos.numeroFactura}`,
        TIPO: datos.tipo === 'Cliente' ? 'Factura a cliente' : 'Pago a editor',
        FECHA: datos.fecha || '(sin fecha)',
        NUMERO_PEDIDO: `PED-${datos.numeroPedido}`,
        DESTINATARIO: datos.destinatario,
        SERVICIOS: datos.servicios,
        DETALLES: datos.deseoCliente && datos.deseoCliente !== '(sin especificar)' ? datos.deseoCliente : '',
        IMPORTE: `${datos.importe} €`,
      },
    }),
  });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error('Error generando factura en Drive: ' + JSON.stringify(data));
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

async function main() {
  await procesarPublicaciones();
  await procesarAsignaciones();
  await procesarCierres();
  await procesarBorrados();
  await procesarFacturas();
  log('Terminado.');
}

main();
