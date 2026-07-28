// Script temporal de un solo uso: amplía las salas de reunión a 20 y quita el acceso general
// de "Creador de Contenido" (los clientes ahora reciben acceso por persona, no por rol).
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = '1375827720235122698';
const CATEGORIA_SALAS = '1531621389562548425';
const EVERYONE_ID = GUILD_ID;

const STAFF_EDITOR_ROLES = [
  '1377259635358302220', // Organizador
  '1378945482059157514', // Administrador
  '1397837333981827113', // Administrador (2)
  '1397836697437339708', // Director Editor
  '1397837093283041369', // Editor Supervisor
  '1397837221238673500', // Social Media Supervisor
  '1397837393867964426', // Moderador
  '1397837456224686120', // Editor Senior
  '1397837611149557790', // Editor Junior
  '1397840378387759114', // Community Manager
];
const PERM_SALA = 1024 + 1048576 + 2097152 + 512; // VIEW_CHANNEL + CONNECT + SPEAK + STREAM

const headers = {
  Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
  'Content-Type': 'application/json',
  'User-Agent': 'DiscordBot (https://editcheap.es, 1.0)',
};

function esperar(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function api(method, path, body) {
  const res = await fetch(`https://discord.com/api/v10${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} -> HTTP ${res.status}: ${JSON.stringify(data)}`);
  await esperar(700);
  return data;
}

function overwritesBase() {
  const list = [{ id: EVERYONE_ID, type: 0, allow: '0', deny: String(PERM_SALA) }];
  for (const roleId of STAFF_EDITOR_ROLES) {
    list.push({ id: roleId, type: 0, allow: String(PERM_SALA), deny: '0' });
  }
  return list;
}

async function main() {
  // 1. Quitar acceso general de "Creador de Contenido" en las 3 salas existentes
  const IDS_EXISTENTES = ['1531621397409960046', '1531621405345452135', '1531621413205577850'];
  for (const id of IDS_EXISTENTES) {
    await api('PATCH', `/channels/${id}`, { permission_overwrites: overwritesBase() });
    console.log(`Sala existente actualizada (sin acceso general de clientes): ${id}`);
  }

  // 2. Crear las salas 4 a 20
  for (let num = 4; num <= 20; num++) {
    const creada = await api('POST', `/guilds/${GUILD_ID}/channels`, {
      name: `🎥 Sala de Reuniones ${num}`,
      type: 2,
      parent_id: CATEGORIA_SALAS,
      permission_overwrites: overwritesBase(),
    });
    console.log(`Sala ${num} creada: ${creada.id}`);
  }

  console.log('\nTerminado.');
}

main().catch((err) => {
  console.error('ERROR FATAL:', err.message);
  process.exitCode = 1;
});
