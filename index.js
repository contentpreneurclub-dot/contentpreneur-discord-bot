const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
});

const WEBHOOK_URL = process.env.WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

async function callWebhook(data) {
  const response = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-webhook-secret': WEBHOOK_SECRET
    },
    body: JSON.stringify(data)
  });
  return response.json();
}

client.on('ready', () => {
  console.log(`Bot connecté en tant que ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // Détecter les liens
  const urlPattern = /https?:\/\/[^\s]+/i;
  if (urlPattern.test(message.content)) {
    console.log(`Lien détecté de ${message.author.username}`);
    const result = await callWebhook({
      action: 'add_points',
      discord_id: message.author.id,
      username: message.author.username,
      avatar: message.author.displayAvatarURL(),
      action_type: 'content_share',
      description: `Partage dans #${message.channel.name}`
    });
    console.log('Webhook response:', result);
    try {
      await message.react('✅');
    } catch (e) {
      console.log('Impossible de réagir');
    }
  }

  // Commande !leaderboard
  if (message.content === '!leaderboard') {
    const result = await callWebhook({ action: 'get_leaderboard' });
    console.log('Webhook response:', result);
    if (result.success) {
      const embed = new EmbedBuilder()
        .setTitle('🏆 Classement')
        .setColor(0x2d5a3d);
      result.leaderboard.slice(0, 10).forEach((member, i) => {
        embed.addFields({
          name: `${i + 1}. ${member.discord_username}`,
          value: `${member.total_points} pts | 🎟️ ${member.lottery_tickets}`,
          inline: false
        });
      });
      message.channel.send({ embeds: [embed] });
    }
  }

  // Commande !points
  if (message.content === '!points') {
    const result = await callWebhook({
      action: 'sync_member',
      discord_id: message.author.id,
      username: message.author.username,
      avatar: message.author.displayAvatarURL()
    });
    if (result.success) {
      message.channel.send(`💰 **${message.author.username}** : ${result.member.total_points} points | 🎟️ ${result.member.lottery_tickets} tickets`);
    }
  }

  // Commande !tickets
  if (message.content === '!tickets') {
    const result = await callWebhook({
      action: 'convert_to_tickets',
      discord_id: message.author.id
    });
    if (result.success) {
      message.channel.send(`🎟️ Conversion réussie! Tu as maintenant ${result.lottery_tickets} tickets.`);
    } else {
      message.channel.send(`❌ ${result.error || 'Erreur'}`);
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
