// Diagnóstico temporal: comparar permission_overwrites de los canales de STAFF y
// re-comprobar los roles actuales de kero86.
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
  for (const [nombre, id] of Object.entries(CANALES)) {
    const res = await fetch(`https://discord.com/api/v10/channels/${id}`, { headers });
    const data = await res.json();
    console.log(`\n=== #${nombre} (${id}) ===`);
    if (!res.ok) {
      console.log('ERROR', res.status, JSON.stringify(data));
      continue;
    }
    console.log('parent_id:', data.parent_id);
    console.log('permission_overwrites:', JSON.stringify(data.permission_overwrites, null, 2));
  }

  console.log('\n=== Roles actuales de kero86 ===');
  const res = await fetch(
    `https://discord.com/api/v10/guilds/${GUILD_ID}/members/search?query=kero86&limit=5`,
    { headers }
  );
  const data = await res.json();
  console.log(JSON.stringify(data[0]?.roles, null, 2));

  console.log('\n=== Categoría 🔒 STAFF ===');
  const canales = await (await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/channels`, { headers })).json();
  const cat = canales.find((c) => c.type === 4 && c.name.includes('STAFF'));
  console.log(JSON.stringify(cat, null, 2));
}

main();
