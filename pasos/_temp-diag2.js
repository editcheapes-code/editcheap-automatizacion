// Diagnóstico temporal: re-verificar en tiempo real el rol Staff y los overwrites actuales.
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = '1375827720235122698';
const headers = {
  Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
  'User-Agent': 'DiscordBot (https://editcheap.es, 1.0)',
};

const CANALES = {
  'staff-interno': '1531621459011571743',
  'pagos-editores': '1531621467463094312',
  'moderator-only': '1398066541236453446',
};

async function main() {
  const rolesRes = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/roles`, { headers });
  const roles = await rolesRes.json();
  const staffRole = roles.find((r) => r.name === 'Staff');
  console.log('Rol Staff:', JSON.stringify(staffRole));

  for (const query of ['kero86', 'editcheap']) {
    const res = await fetch(
      `https://discord.com/api/v10/guilds/${GUILD_ID}/members/search?query=${query}&limit=5`,
      { headers }
    );
    const data = await res.json();
    const miembro = data.find((m) => m.user.username.toLowerCase() === query);
    console.log(`\n${query}:`, miembro ? JSON.stringify({ id: miembro.user.id, roles: miembro.roles }) : 'NO ENCONTRADO');
  }

  for (const [nombre, id] of Object.entries(CANALES)) {
    const res = await fetch(`https://discord.com/api/v10/channels/${id}`, { headers });
    const data = await res.json();
    console.log(`\n#${nombre}:`, JSON.stringify({ parent_id: data.parent_id, overwrites: data.permission_overwrites }));
  }

  // Comprobación cruzada: el bot ve el canal, ¿el canal responde a un fetch de mensajes? (confirma que existe y es accesible)
  console.log('\n=== Info del servidor: owner ===');
  const guildRes = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}`, { headers });
  const guild = await guildRes.json();
  console.log('owner_id:', guild.owner_id);
}

main();
