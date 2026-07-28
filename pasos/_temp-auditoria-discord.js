// Script temporal de un solo uso: audita roles, canales y permisos del bot antes de crear
// las nuevas salas de reunión y canales de staff/soporte. Se borra después de usarlo.
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const headers = {
  Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
  'User-Agent': 'DiscordBot (https://editcheap.es, 1.0)',
};

async function main() {
  const meRes = await fetch('https://discord.com/api/v10/users/@me', { headers });
  const me = await meRes.json();
  console.log('Bot:', me.id, me.username);

  const guildsRes = await fetch('https://discord.com/api/v10/users/@me/guilds', { headers });
  const guilds = await guildsRes.json();
  console.log('\nServidores:', JSON.stringify(guilds.map((g) => ({ id: g.id, name: g.name })), null, 2));

  for (const g of guilds) {
    console.log(`\n=== Servidor ${g.name} (${g.id}) ===`);

    const memberRes = await fetch(`https://discord.com/api/v10/guilds/${g.id}/members/${me.id}`, { headers });
    const member = await memberRes.json();
    console.log('Roles del bot en este servidor:', JSON.stringify(member.roles));

    const rolesRes = await fetch(`https://discord.com/api/v10/guilds/${g.id}/roles`, { headers });
    const roles = await rolesRes.json();
    console.log('\nRoles del servidor:');
    for (const r of roles) {
      console.log(`  ${r.id} | ${r.name} | permissions=${r.permissions} | position=${r.position}`);
    }

    const channelsRes = await fetch(`https://discord.com/api/v10/guilds/${g.id}/channels`, { headers });
    const channels = await channelsRes.json();
    console.log('\nCanales/categorías:');
    for (const c of channels.sort((a, b) => a.position - b.position)) {
      const tipo = { 0: 'texto', 2: 'voz', 4: 'categoria', 15: 'foro' }[c.type] || c.type;
      console.log(`  ${c.id} | tipo=${tipo} | parent=${c.parent_id || '-'} | pos=${c.position} | #${c.name}`);
    }
  }
}

main();
