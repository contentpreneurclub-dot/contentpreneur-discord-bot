const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");

// ============================================
// CONFIGURATION
// ============================================
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

// Hub Analytics API
const HUB_API_URL = process.env.HUB_API_URL || "https://contentpreneur-hub.vercel.app";
const HUB_API_KEY = process.env.HUB_API_KEY;

// ============================================
// CLIENT SETUP
// ============================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
  ],
});

// Track voice session start times
const voiceSessions = new Map();

// Buffer for batching events
let eventBuffer = [];
const BUFFER_FLUSH_INTERVAL = 30000; // 30 seconds

// ============================================
// WEBHOOK HELPER (existing functionality)
// ============================================
async function callWebhook(action, data) {
  if (!WEBHOOK_URL) return null;

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${WEBHOOK_SECRET}`,
      },
      body: JSON.stringify({ action, ...data }),
    });
    return await response.json();
  } catch (error) {
    console.error("Webhook error:", error);
    return null;
  }
}

// ============================================
// HUB ANALYTICS HELPER
// ============================================
async function sendToHub(events) {
  if (!HUB_API_KEY || !events.length) return;

  try {
    const response = await fetch(`${HUB_API_URL}/api/discord/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-discord-bot-key": HUB_API_KEY,
      },
      body: JSON.stringify({ events }),
    });

    if (!response.ok) {
      console.error("Hub API error:", response.status);
    } else {
      console.log(`✅ Sent ${events.length} events to Hub`);
    }
  } catch (error) {
    console.error("Hub API error:", error);
  }
}

function queueEvent(event) {
  eventBuffer.push(event);

  // Flush immediately if buffer is large
  if (eventBuffer.length >= 50) {
    flushEvents();
  }
}

async function flushEvents() {
  if (eventBuffer.length === 0) return;

  const events = [...eventBuffer];
  eventBuffer = [];
  await sendToHub(events);
}

// Flush events periodically
setInterval(flushEvents, BUFFER_FLUSH_INTERVAL);

// ============================================
// READY EVENT
// ============================================
client.on("ready", () => {
  console.log(`🤖 Bot connecté en tant que ${client.user.tag}`);
  console.log(`📊 Hub Analytics: ${HUB_API_KEY ? "Activé" : "Désactivé"}`);
});

// ============================================
// MESSAGE EVENTS
// ============================================
client.on("messageCreate", async (message) => {
  // Ignore bots
  if (message.author.bot) return;

  // Track message for analytics
  queueEvent({
    event_type: "message",
    discord_user_id: message.author.id,
    discord_username: message.author.username,
    channel_id: message.channel.id,
    channel_name: message.channel.name,
    guild_id: message.guild?.id,
    metadata: {
      message_length: message.content.length,
      has_attachments: message.attachments.size > 0,
    },
  });

  // ========== EXISTING FUNCTIONALITY ==========

  // Link detection - award points
  const linkPattern = /https?:\/\/[^\s]+/;
  if (linkPattern.test(message.content)) {
    const result = await callWebhook("add_points", {
      discordId: message.author.id,
      username: message.author.username,
      points: 10,
      reason: "Partage de contenu",
    });
    if (result?.success) {
      message.react("✅");
    }
  }

  // Commands
  const content = message.content.toLowerCase();

  // !leaderboard
  if (content === "!leaderboard") {
    const result = await callWebhook("get_leaderboard", {});
    if (result?.leaderboard) {
      const embed = new EmbedBuilder()
        .setTitle("🏆 Top 10 Membres")
        .setColor(0x7c3aed)
        .setDescription(
          result.leaderboard
            .slice(0, 10)
            .map(
              (m, i) =>
                `${i + 1}. **${m.username}** - ${m.points} pts | 🎟️ ${m.tickets}`
            )
            .join("\n")
        )
        .setTimestamp();
      message.reply({ embeds: [embed] });
    }
  }

  // !points
  if (content === "!points") {
    const result = await callWebhook("sync_profile", {
      discordId: message.author.id,
      username: message.author.username,
    });
    if (result?.profile) {
      message.reply(
        `💰 Tu as **${result.profile.points}** points et **${result.profile.tickets}** tickets 🎟️`
      );
    }
  }

  // !tickets
  if (content === "!tickets") {
    const result = await callWebhook("convert_tickets", {
      discordId: message.author.id,
    });
    if (result?.success) {
      message.reply(
        `✅ Conversion réussie ! Tu as maintenant **${result.tickets}** tickets 🎟️`
      );
    } else {
      message.reply("❌ Pas assez de points pour convertir en tickets.");
    }
  }

  // !help
  if (content === "!help") {
    const embed = new EmbedBuilder()
      .setTitle("📋 Commandes Disponibles")
      .setColor(0x7c3aed)
      .addFields(
        { name: "!points", value: "Voir tes points et tickets", inline: true },
        { name: "!leaderboard", value: "Top 10 des membres", inline: true },
        { name: "!tickets", value: "Convertir points en tickets", inline: true }
      )
      .setFooter({ text: "ContentPreneur Club" });
    message.reply({ embeds: [embed] });
  }
});

// ============================================
// REACTION EVENTS
// ============================================
client.on("messageReactionAdd", async (reaction, user) => {
  if (user.bot) return;

  queueEvent({
    event_type: "reaction",
    discord_user_id: user.id,
    discord_username: user.username,
    channel_id: reaction.message.channel.id,
    channel_name: reaction.message.channel.name,
    guild_id: reaction.message.guild?.id,
    metadata: {
      emoji: reaction.emoji.name,
      message_author_id: reaction.message.author?.id,
    },
  });
});

// ============================================
// VOICE STATE EVENTS
// ============================================
client.on("voiceStateUpdate", (oldState, newState) => {
  const userId = newState.member?.id || oldState.member?.id;
  const username = newState.member?.user?.username || oldState.member?.user?.username;
  const guildId = newState.guild?.id || oldState.guild?.id;

  // User joined voice channel
  if (!oldState.channel && newState.channel) {
    voiceSessions.set(userId, {
      channelId: newState.channel.id,
      channelName: newState.channel.name,
      startTime: Date.now(),
    });

    queueEvent({
      event_type: "voice_join",
      discord_user_id: userId,
      discord_username: username,
      channel_id: newState.channel.id,
      channel_name: newState.channel.name,
      guild_id: guildId,
    });
  }

  // User left voice channel
  if (oldState.channel && !newState.channel) {
    const session = voiceSessions.get(userId);
    const durationMinutes = session
      ? Math.round((Date.now() - session.startTime) / 60000)
      : 0;

    queueEvent({
      event_type: "voice_leave",
      discord_user_id: userId,
      discord_username: username,
      channel_id: oldState.channel.id,
      channel_name: oldState.channel.name,
      guild_id: guildId,
      metadata: {
        duration_minutes: durationMinutes,
      },
    });

    voiceSessions.delete(userId);
  }

  // User switched channels
  if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id) {
    const session = voiceSessions.get(userId);
    const durationMinutes = session
      ? Math.round((Date.now() - session.startTime) / 60000)
      : 0;

    // Log leave from old channel
    queueEvent({
      event_type: "voice_leave",
      discord_user_id: userId,
      discord_username: username,
      channel_id: oldState.channel.id,
      channel_name: oldState.channel.name,
      guild_id: guildId,
      metadata: {
        duration_minutes: durationMinutes,
      },
    });

    // Start new session
    voiceSessions.set(userId, {
      channelId: newState.channel.id,
      channelName: newState.channel.name,
      startTime: Date.now(),
    });

    // Log join to new channel
    queueEvent({
      event_type: "voice_join",
      discord_user_id: userId,
      discord_username: username,
      channel_id: newState.channel.id,
      channel_name: newState.channel.name,
      guild_id: guildId,
    });
  }
});

// ============================================
// MEMBER EVENTS
// ============================================
client.on("guildMemberAdd", (member) => {
  queueEvent({
    event_type: "member_join",
    discord_user_id: member.id,
    discord_username: member.user.username,
    guild_id: member.guild.id,
    metadata: {
      account_created_at: member.user.createdAt.toISOString(),
    },
  });
});

client.on("guildMemberRemove", (member) => {
  queueEvent({
    event_type: "member_leave",
    discord_user_id: member.id,
    discord_username: member.user.username,
    guild_id: member.guild.id,
    metadata: {
      joined_at: member.joinedAt?.toISOString(),
    },
  });
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================
process.on("SIGINT", async () => {
  console.log("Shutting down...");
  await flushEvents();
  client.destroy();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("Shutting down...");
  await flushEvents();
  client.destroy();
  process.exit(0);
});

// ============================================
// START BOT
// ============================================
client.login(DISCORD_TOKEN);
