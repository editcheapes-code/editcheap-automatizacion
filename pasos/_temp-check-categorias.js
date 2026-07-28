const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = '1375827720235122698';
const headers = {
  Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
  'User-Agent': 'DiscordBot (https://editcheap.es, 1.0)',
};

async function main() {
  const res = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/channels`, { headers });
  const canales = await res.json();
  console.log('res.ok:', res.ok, '| es array:', Array.isArray(canales), '| total canales:', canales.length);

  console.log('\n=== TODO (sin filtrar), ordenado por posición ===');
  for (const c of [...canales].sort((a, b) => (a.position || 0) - (b.position || 0))) {
    console.log(`id=${c.id} | type=${c.type} | parent=${c.parent_id || '-'} | pos=${c.position} | "${c.name}"`);
  }
}

main();
