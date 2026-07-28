const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const SALA_ID = '1531621397409960046';
const headers = {
  Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
  'User-Agent': 'DiscordBot (https://editcheap.es, 1.0)',
};

async function main() {
  const res = await fetch(`https://discord.com/api/v10/channels/${SALA_ID}/messages?limit=20`, { headers });
  const mensajes = await res.json();
  console.log(`Mensajes encontrados: ${mensajes.length}`);
  for (const m of mensajes) {
    const del = await fetch(`https://discord.com/api/v10/channels/${SALA_ID}/messages/${m.id}`, {
      method: 'DELETE',
      headers,
    });
    console.log(`Borrado ${m.id}: HTTP ${del.status}`);
    await new Promise((r) => setTimeout(r, 600));
  }
}

main();
