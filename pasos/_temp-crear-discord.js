// Script temporal de un solo uso: crea las categorías/canales de Discord acordados con Jorge
// (salas de reunión de voz, soporte con foro, categoría de staff) con permisos restringidos.
// Se borra después de usarlo, no es parte de la automatización permanente.
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = '1375827720235122698';
const BOT_ROLE_ID = '1523730561192034356';

const ROLES = {
  everyone: GUILD_ID,
  organizador: '1377259635358302220',
  admin1: '1378945482059157514',
  admin2: '1397837333981827113',
  directorEditor: '1397836697437339708',
  editorSupervisor: '1397837093283041369',
  smSupervisor: '1397837221238673500',
  moderador: '1397837393867964426',
  editorSenior: '1397837456224686120',
  editorJunior: '1397837611149557790',
  creadorContenido: '1397839524557619270',
  communityManager: '1397840378387759114',
};

const PERM = {
  VIEW_CHANNEL: 1024,
  SEND_MESSAGES: 2048,
  READ_MESSAGE_HISTORY: 65536,
  ATTACH_FILES: 32768,
  CONNECT: 1048576,
  SPEAK: 2097152,
  STREAM: 512,
  CREATE_PUBLIC_THREADS: 34359738368,
  SEND_MESSAGES_IN_THREADS: 274877906944,
};
function sum(...vals) {
  return vals.reduce((a, b) => a + b, 0n);
}
function n(v) {
  return typeof v === 'bigint' ? v.toString() : String(v);
}

const headers = {
  Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
  'Content-Type': 'application/json',
  'User-Agent': 'DiscordBot (https://editcheap.es, 1.0)',
};

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function api(method, path, body) {
  const res = await fetch(`https://discord.com/api/v10${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} -> HTTP ${res.status}: ${JSON.stringify(data)}`);
  await esperar(700); // respetar rate limit de la API de canales
  return data;
}

// Overwrite estándar: bloquear @everyone, permitir un set de roles concreto.
function overwrites(allowRoleIds, allowBits, extraForBot) {
  const list = [
    { id: ROLES.everyone, type: 0, deny: n(PERM.VIEW_CHANNEL), allow: '0' },
    { id: BOT_ROLE_ID, type: 0, deny: '0', allow: n(extraForBot ?? allowBits) },
  ];
  for (const roleId of allowRoleIds) {
    list.push({ id: roleId, type: 0, deny: '0', allow: n(allowBits) });
  }
  return list;
}

async function crearCategoriaSiNoExiste(nombre) {
  const canales = await api('GET', `/guilds/${GUILD_ID}/channels`);
  const existente = canales.find((c) => c.type === 4 && c.name === nombre);
  if (existente) {
    console.log(`Categoría ya existe, reutilizando: ${nombre} (${existente.id})`);
    return existente.id;
  }
  const creada = await api('POST', `/guilds/${GUILD_ID}/channels`, { name: nombre, type: 4 });
  console.log(`Categoría creada: ${nombre} (${creada.id})`);
  return creada.id;
}

async function crearCanalSiNoExiste(nombre, tipo, parentId, permissionOverwrites) {
  const canales = await api('GET', `/guilds/${GUILD_ID}/channels`);
  const existente = canales.find((c) => c.name === nombre && c.parent_id === parentId);
  if (existente) {
    console.log(`Canal ya existe, reutilizando: #${nombre} (${existente.id})`);
    return existente.id;
  }
  const creado = await api('POST', `/guilds/${GUILD_ID}/channels`, {
    name: nombre,
    type: tipo,
    parent_id: parentId,
    permission_overwrites: permissionOverwrites,
  });
  console.log(`Canal creado: #${nombre} (${creado.id})`);
  return creado.id;
}

const STAFF_ROLES = [
  ROLES.organizador,
  ROLES.admin1,
  ROLES.admin2,
  ROLES.directorEditor,
  ROLES.editorSupervisor,
  ROLES.smSupervisor,
  ROLES.moderador,
];

const EDITOR_Y_CLIENTE_ROLES = [
  ROLES.organizador,
  ROLES.admin1,
  ROLES.admin2,
  ROLES.directorEditor,
  ROLES.editorSupervisor,
  ROLES.smSupervisor,
  ROLES.moderador,
  ROLES.editorSenior,
  ROLES.editorJunior,
  ROLES.communityManager,
  ROLES.creadorContenido,
];

async function main() {
  // 1. Salas de reunión (voz), visibles para staff/editores + clientes
  const permsSalas = sum(PERM.VIEW_CHANNEL, PERM.CONNECT, PERM.SPEAK, PERM.STREAM);
  const catReuniones = await crearCategoriaSiNoExiste('🗓️ SALAS DE REUNIÓN');
  for (const num of [1, 2, 3]) {
    await crearCanalSiNoExiste(`🎥 Sala de Reuniones ${num}`, 2, catReuniones, overwrites(EDITOR_Y_CLIENTE_ROLES, permsSalas));
  }

  // 2. Borrar los viejos canales de texto "1", "2", "3", "4"
  const IDS_VIEJOS = ['1398081856993366136', '1398081875137794240', '1398081886613536870', '1398081900312002673'];
  for (const id of IDS_VIEJOS) {
    try {
      await api('DELETE', `/channels/${id}`);
      console.log(`Canal viejo borrado: ${id}`);
    } catch (err) {
      console.log(`Aviso borrando ${id}: ${err.message}`);
    }
  }

  // 3. Soporte (foro), visible para staff/editores + clientes
  const permsForo = sum(
    PERM.VIEW_CHANNEL,
    PERM.SEND_MESSAGES,
    PERM.READ_MESSAGE_HISTORY,
    PERM.ATTACH_FILES,
    PERM.CREATE_PUBLIC_THREADS,
    PERM.SEND_MESSAGES_IN_THREADS
  );
  const catSoporte = await crearCategoriaSiNoExiste('🎫 SOPORTE');
  await crearCanalSiNoExiste('tickets-soporte', 15, catSoporte, overwrites(EDITOR_Y_CLIENTE_ROLES, permsForo));

  // 4. Staff interno, visible SOLO para roles de staff (no editores normales, no clientes)
  const permsStaff = sum(PERM.VIEW_CHANNEL, PERM.SEND_MESSAGES, PERM.READ_MESSAGE_HISTORY, PERM.ATTACH_FILES);
  const catStaff = await crearCategoriaSiNoExiste('🔒 STAFF');
  await crearCanalSiNoExiste('staff-interno', 0, catStaff, overwrites(STAFF_ROLES, permsStaff));
  await crearCanalSiNoExiste('pagos-editores', 0, catStaff, overwrites(STAFF_ROLES, permsStaff));

  // 5. Mover moderator-only (ya existía) a la categoría de STAFF
  try {
    await api('PATCH', '/channels/1398066541236453446', { parent_id: catStaff });
    console.log('moderator-only movido a 🔒 STAFF');
  } catch (err) {
    console.log(`Aviso moviendo moderator-only: ${err.message}`);
  }

  console.log('\nTerminado.');
}

main().catch((err) => {
  console.error('ERROR FATAL:', err.message);
  process.exitCode = 1;
});
