// Script temporal de un solo uso: crea el rol "Staff", se lo asigna a kero86, y simplifica
// los permisos de staff-interno / pagos-editores / moderator-only a un solo rol.
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = '1375827720235122698';
const headers = {
  Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
  'Content-Type': 'application/json',
  'User-Agent': 'DiscordBot (https://editcheap.es, 1.0)',
};

const CANALES_STAFF = {
  'staff-interno': '1531621459011571743',
  'pagos-editores': '1531621467463094312',
  'moderator-only': '1398066541236453446',
};
const EVERYONE_ID = GUILD_ID;
const PERM_VER_ESCRIBIR = 101376; // VIEW_CHANNEL + SEND_MESSAGES + READ_MESSAGE_HISTORY + ATTACH_FILES

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
  await esperar(700);
  return data;
}

async function main() {
  // 1. Crear el rol "Staff" (o reutilizar si ya existe)
  const rolesExistentes = await api('GET', `/guilds/${GUILD_ID}/roles`);
  let rolStaff = rolesExistentes.find((r) => r.name === 'Staff');
  if (!rolStaff) {
    rolStaff = await api('POST', `/guilds/${GUILD_ID}/roles`, {
      name: 'Staff',
      permissions: '0',
      hoist: false,
      mentionable: false,
    });
    console.log(`Rol "Staff" creado: ${rolStaff.id}`);
  } else {
    console.log(`Rol "Staff" ya existía: ${rolStaff.id}`);
  }

  // 2. Asignárselo a kero86 y, si existe como miembro aparte, a editcheap
  for (const query of ['kero86', 'editcheap']) {
    const busqueda = await api('GET', `/guilds/${GUILD_ID}/members/search?query=${query}&limit=5`);
    const miembro = busqueda.find((m) => m.user.username.toLowerCase() === query);
    if (miembro) {
      await api('PUT', `/guilds/${GUILD_ID}/members/${miembro.user.id}/roles/${rolStaff.id}`);
      console.log(`Rol "Staff" asignado a ${query} (${miembro.user.id})`);
    } else {
      console.log(`No se encontró a "${query}" como miembro del servidor`);
    }
  }

  // 3. Simplificar permisos: solo @everyone (deny) + Staff (allow) en los 3 canales
  const overwrites = [
    { id: EVERYONE_ID, type: 0, allow: '0', deny: String(PERM_VER_ESCRIBIR) },
    { id: rolStaff.id, type: 0, allow: String(PERM_VER_ESCRIBIR), deny: '0' },
  ];
  for (const [nombre, id] of Object.entries(CANALES_STAFF)) {
    await api('PATCH', `/channels/${id}`, { permission_overwrites: overwrites });
    console.log(`Permisos simplificados en #${nombre}`);
  }

  console.log('\nTerminado.');
}

main().catch((err) => {
  console.error('ERROR FATAL:', err.message);
  process.exitCode = 1;
});
