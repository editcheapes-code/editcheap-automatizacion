// Versión cloud (WebDAV) de la automatización de carpetas de EDITCHEAP.
//
// Hace lo mismo que crear-carpetas.js (la versión que corre en el PC de sobremesa vía Tarea
// Programada), pero habla directamente con DIGI storage por WebDAV en vez de escribir en una
// unidad de red local. Corre en GitHub Actions, así que no depende de que ningún ordenador de
// Jorge esté encendido, ni de que la app de DIGI storage esté abierta.
//
// Usa una contraseña de aplicación dedicada a WebDAV (DIGISTORAGE_WEBDAV_PASSWORD), no la
// contraseña real de la cuenta de DIGI storage.
//
// Ejecutar: node pasos/crear-carpetas-cloud.js

const { createClient } = require('webdav');

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_VERSION = '2025-09-03';
const DIGISTORAGE_USER = process.env.DIGISTORAGE_USER;
const DIGISTORAGE_WEBDAV_PASSWORD = process.env.DIGISTORAGE_WEBDAV_PASSWORD;

const CLIENTES_DATA_SOURCE_ID = '39151046-61ea-805f-829a-000b0eb6cf52';
const EDITORES_DATA_SOURCE_ID = '39151046-61ea-80a0-b77d-000b5e2875d8';

// Ruta dentro de DIGI storage, la misma que usa la unidad de red Z: en el PC de sobremesa,
// pero en formato de ruta WebDAV (barras normales, sin letra de unidad).
const RAIZ = '/Sincronizado con PC/ARCHIVO_COMPARTIDO';
// Los clientes viven en COLABORACIONES, cada uno en su propia carpeta "CLI-<número>-<nombre>"
// (el número es el de "Nº de Cliente" en Notion), con todo lo que necesita un editor para
// trabajar. Los acuerdos firmados se guardan aparte, en Documentos_Clientes, para que un
// editor con acceso a COLABORACIONES no vea información sensible del cliente.
const CARPETA_COLABORACIONES = `${RAIZ}/COLABORACIONES`;
const CARPETA_DOCS_CLIENTES = `${RAIZ}/Documentos_Clientes`;
const CARPETA_DOCS_EDITORES = `${RAIZ}/Documentos_Editores`;

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

// Windows no permite estos caracteres en nombres de carpeta (y tampoco conviene usarlos en
// WebDAV, para que el resultado se vea bien también desde un PC con la unidad Z: montada).
function nombreSeguro(nombre) {
  return nombre.replace(/[<>:"/\\|?*]/g, '').trim();
}

function textoDe(propiedad) {
  if (!propiedad || !propiedad.rich_text || propiedad.rich_text.length === 0) return '';
  return propiedad.rich_text.map((t) => t.plain_text).join('');
}

let webdavClient;

function obtenerClienteWebDAV() {
  if (!webdavClient) {
    webdavClient = createClient('https://digistorage.es/dav', {
      username: DIGISTORAGE_USER,
      password: DIGISTORAGE_WEBDAV_PASSWORD,
    });
  }
  return webdavClient;
}

async function crearCarpetaSiNoExiste(ruta) {
  const cliente = obtenerClienteWebDAV();
  const existe = await cliente.exists(ruta);
  if (!existe) await cliente.createDirectory(ruta, { recursive: true });
}

async function escribirArchivo(ruta, contenido) {
  const cliente = obtenerClienteWebDAV();
  await cliente.putFileContents(ruta, contenido, { overwrite: true });
}

async function consultarNotion(dataSourceId, filter) {
  const url = `https://api.notion.com/v1/data_sources/${dataSourceId}/query`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': NOTION_VERSION,
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
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ properties }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error('Error actualizando Notion: ' + JSON.stringify(data));
}

// ---------- CREAR CARPETA DE PROYECTO (Clientes) ----------

const README_PROYECTO = (nombre) => `Carpeta de proyecto: ${nombre}
Creada automáticamente por EDITCHEAP-AUTOMATIZACION (versión cloud, vía WebDAV).

01_Material_Recibido   -> Todo lo que envía el cliente (vídeo, audio, fotos, referencias).
02_Proyecto_Edicion    -> El proyecto de Premiere/Filmora/AfterEffects de este trabajo.
03_Recursos_Grafico    -> Logo, plantillas, música y gráficos SOLO de este cliente.
04_Entregas            -> Exportaciones finales listas para enviar/publicar.

Reglas:
- Nunca abrir este proyecto en los dos ordenadores a la vez.
- Antes de cambiar de ordenador, esperar a que DIGI storage termine de sincronizar.
- Las cachés de Premiere/AfterEffects/Filmora se quedan en el PC local, nunca aquí dentro.
`;

async function crearCarpetaProyecto(nombreCarpeta, nombre) {
  const base = `${CARPETA_COLABORACIONES}/${nombreCarpeta}`;
  for (const sub of ['01_Material_Recibido', '02_Proyecto_Edicion', '03_Recursos_Grafico', '04_Entregas']) {
    await crearCarpetaSiNoExiste(`${base}/${sub}`);
  }
  await escribirArchivo(`${base}/README.txt`, README_PROYECTO(nombre));
  return base;
}

async function crearCarpetaDocumentacion(carpetaRaiz, nombre) {
  const base = `${carpetaRaiz}/${nombre}`;
  await crearCarpetaSiNoExiste(`${base}/Contrato_Firmado`);
  return base;
}

// ---------- FASE 1: crear carpetas de Clientes ----------

async function obtenerClientesParaCrear() {
  const resultados = await consultarNotion(CLIENTES_DATA_SOURCE_ID, {
    and: [
      { property: 'Crear carpeta', checkbox: { equals: true } },
      { property: 'Carpeta local', rich_text: { is_empty: true } },
    ],
  });
  return resultados.map((p) => ({
    pageId: p.id,
    nombre: p.properties['Nombre del Cliente'].title.map((t) => t.plain_text).join(''),
    numeroCliente: p.properties['Nº de Cliente'].unique_id.number,
  }));
}

async function procesarCreacionClientes() {
  const clientes = await obtenerClientesParaCrear();
  log(`Clientes pendientes de crear carpeta: ${clientes.length}`);

  for (const cliente of clientes) {
    try {
      const nombre = nombreSeguro(cliente.nombre);
      if (!nombre) {
        log(`Cliente ${cliente.pageId}: nombre vacío tras limpiar, se ignora`);
        continue;
      }
      const nombreCarpeta = `CLI-${cliente.numeroCliente}-${nombre}`;
      const carpetaProyecto = await crearCarpetaProyecto(nombreCarpeta, nombre);
      await crearCarpetaDocumentacion(CARPETA_DOCS_CLIENTES, nombreCarpeta);
      await actualizarNotion(cliente.pageId, {
        'Carpeta local': { rich_text: [{ text: { content: `Z:\\DIGIstorage\\Sincronizado con PC\\ARCHIVO_COMPARTIDO\\COLABORACIONES\\${nombreCarpeta}` } }] },
      });
      log(`Cliente "${nombre}": carpetas creadas -> ${carpetaProyecto}`);
    } catch (err) {
      log(`Error creando carpeta para cliente "${cliente.nombre}": ${err.message}`);
    }
  }
}

// ---------- FASE 2: crear carpetas de Editores ----------

async function obtenerEditoresParaCrear() {
  const resultados = await consultarNotion(EDITORES_DATA_SOURCE_ID, {
    and: [
      { property: 'Crear carpeta', checkbox: { equals: true } },
      { property: 'Carpeta local', rich_text: { is_empty: true } },
    ],
  });
  return resultados.map((p) => ({
    pageId: p.id,
    nombre: p.properties['Nombre'].title.map((t) => t.plain_text).join(''),
  }));
}

async function procesarCreacionEditores() {
  const editores = await obtenerEditoresParaCrear();
  log(`Editores pendientes de crear carpeta: ${editores.length}`);

  for (const editor of editores) {
    try {
      const nombre = nombreSeguro(editor.nombre);
      if (!nombre) {
        log(`Editor ${editor.pageId}: nombre vacío tras limpiar, se ignora`);
        continue;
      }
      const carpeta = await crearCarpetaDocumentacion(CARPETA_DOCS_EDITORES, nombre);
      await actualizarNotion(editor.pageId, {
        'Carpeta local': { rich_text: [{ text: { content: `Z:\\DIGIstorage\\Sincronizado con PC\\ARCHIVO_COMPARTIDO\\Documentos_Editores\\${nombre}` } }] },
      });
      log(`Editor "${nombre}": carpeta creada -> ${carpeta}`);
    } catch (err) {
      log(`Error creando carpeta para editor "${editor.nombre}": ${err.message}`);
    }
  }
}

// ---------- FASE 3: descargar documento firmado (Clientes + Editores) ----------

async function obtenerPendientesDeDescarga(dataSourceId, propNombre) {
  const resultados = await consultarNotion(dataSourceId, {
    and: [
      { property: 'Doc firmado descargado', checkbox: { equals: false } },
      { property: 'Carpeta local', rich_text: { is_not_empty: true } },
    ],
  });
  return resultados
    .map((p) => {
      // El nombre real de la carpeta (ej. "CLI-11-Banshee Battles" para clientes, o solo el
      // nombre para editores) es el último tramo de "Carpeta local", ya calculado al crearla.
      const carpetaLocal = textoDe(p.properties['Carpeta local']);
      const nombreCarpeta = carpetaLocal.split('\\').pop();
      return {
        pageId: p.id,
        nombre: p.properties[propNombre].title.map((t) => t.plain_text).join(''),
        nombreCarpeta,
        archivos: p.properties['Acuerdo de colaboración firmado'].files || [],
      };
    })
    .filter((p) => p.archivos.length > 0);
}

async function descargarArchivo(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Descarga falló (HTTP ${response.status})`);
  return Buffer.from(await response.arrayBuffer());
}

async function procesarDescargasFirmados(dataSourceId, propNombre, carpetaDocsRaiz, etiqueta) {
  const pendientes = await obtenerPendientesDeDescarga(dataSourceId, propNombre);
  log(`${etiqueta} pendientes de descargar documento firmado: ${pendientes.length}`);

  for (const item of pendientes) {
    try {
      const archivo = item.archivos[0];
      const url = archivo.file ? archivo.file.url : archivo.external ? archivo.external.url : null;
      if (!url || !url.startsWith('http')) {
        log(`${etiqueta} "${item.nombre}": el archivo no tiene una URL descargable válida, se ignora`);
        continue;
      }
      const nombreArchivo = archivo.name || 'contrato_firmado.pdf';
      const nombreCarpeta = item.nombreCarpeta;
      const rutaDestino = `${carpetaDocsRaiz}/${nombreCarpeta}/Contrato_Firmado/${nombreArchivo}`;

      const buffer = await descargarArchivo(url);
      await crearCarpetaSiNoExiste(`${carpetaDocsRaiz}/${nombreCarpeta}/Contrato_Firmado`);
      await escribirArchivo(rutaDestino, buffer);
      await actualizarNotion(item.pageId, { 'Doc firmado descargado': { checkbox: true } });
      log(`${etiqueta} "${item.nombre}": documento firmado descargado -> ${rutaDestino}`);
    } catch (err) {
      log(`Error descargando firmado de ${etiqueta.toLowerCase()} "${item.nombre}": ${err.message}`);
    }
  }
}

async function main() {
  if (!NOTION_TOKEN) {
    log('ERROR: falta la variable de entorno NOTION_TOKEN.');
    process.exitCode = 1;
    return;
  }
  if (!DIGISTORAGE_USER || !DIGISTORAGE_WEBDAV_PASSWORD) {
    log('ERROR: faltan DIGISTORAGE_USER y/o DIGISTORAGE_WEBDAV_PASSWORD.');
    process.exitCode = 1;
    return;
  }

  const cliente = obtenerClienteWebDAV();
  const raizExiste = await cliente.exists(RAIZ);
  if (!raizExiste) {
    log(`ERROR: no se encuentra la carpeta ${RAIZ} en DIGI storage por WebDAV.`);
    process.exitCode = 1;
    return;
  }

  await procesarCreacionClientes();
  await procesarCreacionEditores();
  await procesarDescargasFirmados(CLIENTES_DATA_SOURCE_ID, 'Nombre del Cliente', CARPETA_DOCS_CLIENTES, 'Cliente');
  await procesarDescargasFirmados(EDITORES_DATA_SOURCE_ID, 'Nombre', CARPETA_DOCS_EDITORES, 'Editor');

  log('Terminado.');
}

main().catch((err) => {
  console.error('Error fatal:', err.stack);
  process.exitCode = 1;
});
