// Script temporal de un solo uso para auditar el canal de Discord antes de limpiarlo.
// Se borra después de usarlo, no es parte de la automatización permanente.
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;

const headers = {
  Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
  'User-Agent': 'DiscordBot (https://editcheap.es, 1.0)',
};

async function main() {
  const url = `https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages?limit=100`;
  const response = await fetch(url, { headers });
  const data = await response.json();
  if (!response.ok) {
    console.log('ERROR', response.status, JSON.stringify(data));
    return;
  }
  console.log(`Total mensajes obtenidos: ${data.length}\n`);
  for (const m of data.sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1))) {
    const esRespuesta = m.message_reference ? ` [respuesta a ${m.message_reference.message_id}]` : '';
    console.log(`ID ${m.id} | ${m.timestamp} | autor: ${m.author.username}${esRespuesta}`);
    console.log(`  contenido: ${(m.content || '(sin texto, solo embed)').slice(0, 200).replace(/\n/g, ' ')}`);
  }
}

main();
