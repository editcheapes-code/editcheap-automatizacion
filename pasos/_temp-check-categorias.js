const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = '1375827720235122698';
const headers = {
  Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
  'User-Agent': 'DiscordBot (https://editcheap.es, 1.0)',
};

async function main() {
  const res = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/channels`, { headers });
  const canales = await res.json();

  const categorias = canales.filter((c) => c.type === 4);
  console.log('=== Categorías ===');
  for (const c of categorias) {
    console.log(`${c.id} | pos=${c.position} | "${c.name}"`);
  }

  console.log('\n=== Salas de voz que contienen "Sala de Reuniones" ===');
  const salas = canales.filter((c) => c.type === 2 && c.name.includes('Sala de Reuniones'));
  for (const s of salas.sort((a, b) => a.position - b.position)) {
    console.log(`${s.id} | parent=${s.parent_id} | pos=${s.position} | "${s.name}"`);
  }
}

main();
