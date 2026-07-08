// Diagnóstico: ¿qué identidad tiene el token? ¿puede ver el canal?
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;

const headers = {
  Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
  'User-Agent': 'DiscordBot (https://editcheap.es, 1.0)',
};

async function main() {
  console.log('DISCORD_CHANNEL_ID leído del entorno:', DISCORD_CHANNEL_ID);

  console.log('\n--- 1. Identidad del bot (GET /users/@me) ---');
  const me = await fetch('https://discord.com/api/v10/users/@me', { headers });
  console.log('HTTP', me.status);
  console.log(await me.text());

  console.log('\n--- 2. Info del canal (GET /channels/:id) ---');
  const ch = await fetch(`https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}`, { headers });
  console.log('HTTP', ch.status);
  console.log(await ch.text());

  console.log('\n--- 3. Servidores donde está el bot (GET /users/@me/guilds) ---');
  const guilds = await fetch('https://discord.com/api/v10/users/@me/guilds', { headers });
  console.log('HTTP', guilds.status);
  console.log(await guilds.text());
}

main();
