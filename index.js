const { Client, GatewayIntentBits, Events } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ]
});

const WEBHOOK_URL = 'https://whyjordkoychcyyevyrl.supabase.co/functions/v1/discord-webhook';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const BOT_TOKEN = process.env.BOT_TOKEN;

// IDs des salons à surveiller (à personnaliser)
const CONTENT_REVIEW_CHANNEL = process.env.CONTENT_REVIEW_CHANNEL_ID;

async function sendToWebhook(data) {
  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': WEBHOOK_SECRET
      },
      body: JSON.stringify(data)
    });
    const result = await response.json();
    console.log('Webhook response:', result);
    return result;
  } catch (error) {
    console.error('Webhook error:', error);
  }
}

client.once(Events.ClientReady, () => {
  console.log(`Bot connecté en tant que ${client.user.tag}`);
});

// Sync member quand ils rejoignent
client.on(Events.GuildMemberAdd, async (member) => {
  await sendToWebhook({
    action: 'sync_member',
    discord_id: member.user.id,
    discord_username: member.user.username,
    discord_avatar: member.user.displayAvatarURL()
  });
});

// Détecte les messages dans le salon ContentReview
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  // ContentReview submission
  if (message.channel.id === CONTENT_REVIEW_CHANNEL && message.content.includes('http')) {
    await sendToWebhook({
      action: 'add_points',
      discord_id: message.author.id,
      discord_username: message.author.username,
      discord_avatar: message.author.displayAvatarURL(),
      action_type: 'content_review',
      description: `Soumission ContentReview`
    });
    console.log(`Points ContentReview ajoutés pour ${message.author.username}`);
  }

  // Commandes manuelles (pour les admins)
  if (message.content.startsWith('!points')) {
    const args = message.content.split(' ');
    const mention = message.mentions.users.first();
    const actionType = args[2];
    
    if (mention && actionType) {
      await sendToWebhook({
        action: 'add_points',
        discord_id: mention.id,
        discord_username: mention.username,
        discord_avatar: mention.displayAvatarURL(),
        action_type: actionType,
        description: args.slice(3).join(' ') || `Points ajoutés par ${message.author.username}`
      });
      message.reply(`✅ Points "${actionType}" ajoutés à ${mention.username}`);
    }
  }

  // Commande leaderboard
  if (message.content === '!leaderboard') {
    const result = await sendToWebhook({ action: 'get_leaderboard' });
    if (result?.leaderboard) {
      const lb = result.leaderboard.map((m, i) => 
        `${i + 1}. **${m.discord_username}** - ${m.total_points} pts`
      ).join('\n');
      message.reply(`🏆 **Leaderboard**\n${lb}`);
    }
  }

  // Commande tickets
  if (message.content === '!tickets') {
    await sendToWebhook({
      action: 'convert_to_tickets',
      discord_id: message.author.id
    });
  }
});

client.login(BOT_TOKEN);
