import discord
from discord.ext import commands
import aiohttp
import os
import re

# Configuration
WEBHOOK_URL = os.environ.get('WEBHOOK_URL')
WEBHOOK_SECRET = os.environ.get('WEBHOOK_SECRET')
DISCORD_TOKEN = os.environ.get('DISCORD_TOKEN')

# Bot setup avec intents pour les forums
intents = discord.Intents.default()
intents.message_content = True
intents.guilds = True
intents.messages = True
bot = commands.Bot(command_prefix='!', intents=intents)

async def call_webhook(data):
    async with aiohttp.ClientSession() as session:
        headers = {
            'Content-Type': 'application/json',
            'x-webhook-secret': WEBHOOK_SECRET
        }
        async with session.post(WEBHOOK_URL, json=data, headers=headers) as response:
            return await response.json()

@bot.event
async def on_ready():
    print(f'{bot.user} connecté!')

@bot.event
async def on_message(message):
    if message.author.bot:
        return
    
    print(f"Message reçu: {message.content[:50]}...")
    
    # Détecter les liens
    url_pattern = r'https?://[^\s]+'
    if re.search(url_pattern, message.content, re.IGNORECASE):
        print(f"Lien détecté de {message.author.name}")
        result = await call_webhook({
            "action": "add_points",
            "discord_id": str(message.author.id),
            "username": message.author.name,
            "avatar": str(message.author.avatar.url) if message.author.avatar else None,
            "action_type": "content_share",
            "description": f"Partage de contenu"
        })
        print(f"Webhook result: {result}")
        try:
            await message.add_reaction("✅")
        except:
            pass
    
    await bot.process_commands(message)

@bot.command(name='leaderboard')
async def leaderboard(ctx):
    result = await call_webhook({"action": "get_leaderboard"})
    if result.get('success'):
        embed = discord.Embed(title="🏆 Classement", color=0x2d5a3d)
        for i, member in enumerate(result['leaderboard'][:10], 1):
            embed.add_field(
                name=f"{i}. {member['discord_username']}", 
                value=f"{member['total_points']} pts | 🎟️ {member['lottery_tickets']}", 
                inline=False
            )
        await ctx.send(embed=embed)

@bot.command(name='points')
async def points(ctx):
    result = await call_webhook({
        "action": "sync_member",
        "discord_id": str(ctx.author.id),
        "username": ctx.author.name,
        "avatar": str(ctx.author.avatar.url) if ctx.author.avatar else None
    })
    if result.get('success'):
        member = result['member']
        await ctx.send(f"💰 **{ctx.author.name}** : {member['total_points']} points | 🎟️ {member['lottery_tickets']} tickets")

@bot.command(name='tickets')
async def tickets(ctx):
    result = await call_webhook({
        "action": "convert_to_tickets",
        "discord_id": str(ctx.author.id)
    })
    if result.get('success'):
        await ctx.send(f"🎟️ Conversion réussie! Tu as maintenant {result['lottery_tickets']} tickets.")
    else:
        await ctx.send(f"❌ {result.get('error', 'Erreur')}")

bot.run(DISCORD_TOKEN)

