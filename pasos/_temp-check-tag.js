const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = '1375827720235122698';
const headers = {
  Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
  'User-Agent': 'DiscordBot (https://editcheap.es, 1.0)',
};

async function main() {
  const res = await fetch(
    `https://discord.com/api/v10/guilds/${GUILD_ID}/members/search?query=SINFOCREW&limit=10`,
    { headers }
  );
  const data = await res.json();
  console.log(JSON.stringify(data.map((m) => ({ id: m.user.id, username: m.user.username, nick: m.nick })), null, 2));
}

main();
