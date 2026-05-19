import express from 'express';
import compression from 'compression';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { Telegraf, session, Markup, Context } from 'telegraf';
import dotenv from 'dotenv';
import { encryptPayload, decryptPayload } from './src/crypto';

dotenv.config();

// Custom Context with Session
interface SessionData {
  step?: 'IDLE' | 'AWAITING_PLATFORM' | 'AWAITING_GAME_NAME' | 'AWAITING_PRICE' | 'AWAITING_INFO';
  platform?: string;
  gameName?: string;
  price?: string;
}

interface MyContext extends Context {
  session: SessionData;
}

export interface Offer {
  id: string;
  uniqueCode: string;
  userId: number;
  username: string;
  platform: string;
  gameName?: string;
  price?: string;
  content?: string;
  sourceChatId: number;
  sourceMessageId: number;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: Date;
}

export const offersData: Offer[] = [];
export let targetChannel = '';

// ES module directory variables not needed as we use process.cwd()

const app = express();
const PORT = 3000;

// Enable gzip compression for better performance on slow networks
app.use(compression());

// Middleware for parsing JSON requests in Express
app.use(express.json());

// Encryption Middleware for End-to-End Payload Encryption
app.use((req, res, next) => {
  // Ignore Telegram webhooks or non-API routes if needed, but here we'll just check if there's a payload.
  if (req.body && req.body.payload) {
    const decrypted = decryptPayload(req.body.payload);
    if (decrypted) {
      req.body = decrypted;
    }
  }

  // Intercept res.json to encrypt responses for /api/ routes
  if (req.path.startsWith('/api/')) {
    const originalJson = res.json.bind(res);
    res.json = (body: any) => {
      // Only encrypt if it's not already encrypted and is an object
      if (body && typeof body === 'object' && !body.payload) {
        const encrypted = encryptPayload(body);
        return originalJson({ payload: encrypted });
      }
      return originalJson(body);
    };
  }
  
  next();
});

// ==========================================
// TELEGRAM BOT SETUP
// ==========================================
let botStatus = 'Stopped';
let botInstance: Telegraf<MyContext> | null = null;

const resolvedAdmins = new Map<string, number>();

function setupBot() {
  let token = process.env.TELEGRAM_BOT_TOKEN;
  let channel = process.env.TELEGRAM_CHANNEL_USERNAME; // e.g. @mychannel
  let adminIdStr = process.env.TELEGRAM_ADMIN_ID;

  if (channel && !channel.startsWith('@') && !channel.startsWith('-')) {
    channel = '@' + channel;
  }
  
  if (channel) {
    targetChannel = channel;
  }

  if (!token || !targetChannel || !adminIdStr) {
    console.error("Missing Telegram configuration. Please configure TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_USERNAME, TELEGRAM_ADMIN_ID in environment variables.");
    botStatus = 'Missing Configuration';
    return;
  }

  // Support multiple admins separated by commas (IDs or usernames)
  const adminIds: (number | string)[] = adminIdStr.split(',').map(s => {
    const val = s.trim();
    if (/^-?\d+$/.test(val)) return parseInt(val, 10);
    return val.startsWith('@') ? val : '@' + val;
  });
  
  if (adminIds.length === 0) {
    console.error("TELEGRAM_ADMIN_ID is invalid.");
    botStatus = 'Error: Invalid Admin ID';
    return;
  }

  try {
    const bot = new Telegraf<MyContext>(token);
    botInstance = bot;
    botStatus = 'Running';

    // 1. Setup Session
    bot.use(session({ defaultSession: (): SessionData => ({ step: 'IDLE' }) }));

    // 2. Middleware: Force join channel
    const checkMembership = async (ctx: MyContext, next: () => Promise<void>) => {
      // Skip membership check for groups, let the group handlers manage it
      if (ctx.chat && ctx.chat.type !== 'private') {
        return next();
      }

      // If it's the admin interacting, let them through
      const isUserAdmin = (ctx.from?.id && adminIds.includes(ctx.from.id)) || 
                          (ctx.from?.username && adminIds.includes('@' + ctx.from.username)) ||
                          (ctx.chat?.id && adminIds.includes(ctx.chat.id));
      if (isUserAdmin) {
        if (ctx.from?.username && ctx.from?.id && adminIds.includes('@' + ctx.from.username)) {
           resolvedAdmins.set('@' + ctx.from.username, ctx.from.id);
        }
        return next();
      }
      
      if (!ctx.from) return next();
      
      try {
        const member = await ctx.telegram.getChatMember(targetChannel, ctx.from.id);
        if (['member', 'administrator', 'creator'].includes(member.status)) {
          return next();
        } else {
          await ctx.reply(`عذراً، يجب عليك الاشتراك في القناة أولاً لتتمكن من إرسال العروض:\n${targetChannel}\n\nبعد الاشتراك، اضغط /start للمتابعة.`, 
            Markup.inlineKeyboard([
              Markup.button.url('اشترك الآن', `https://t.me/${targetChannel.replace('@', '')}`)
            ])
          );
        }
      } catch (e: any) {
        // If the bot lacks permissions to check members, let the user proceed rather than breaking the bot
        if (e.message.includes('bot is not a member') || e.message.includes('chat not found') || e.message.includes('member list is inaccessible')) {
          // Optionally notify the user, but we will let them pass so the bot remains functional
          console.warn(`Bypassing membership check. Please make the bot an administrator in ${targetChannel} to enable forced subscription.`);
          return next();
        } else {
          console.error("Membership check error:", e.message);
          // Allow temporarily if transient error
          return next();
        }
      }
    };
    
    // Check membership on ALL messages and actions
    bot.use(checkMembership);

    // 3. Command: /start
    bot.start(async (ctx) => {
      ctx.session.step = 'IDLE';
      const welcomeText = `مرحباً بك في بوت العروض! 🌟\n\nلتقديم عرض جديد للبيع، اضغط على زر "تقديم طلب جديد 📝" بالأسفل، أو أرسل الأمر /sell في أي وقت.`;
      await ctx.reply(welcomeText, { 
        parse_mode: 'Markdown',
        reply_markup: {
          keyboard: [[{ text: 'تقديم طلب جديد 📝' }]],
          resize_keyboard: true,
          is_persistent: true
        }
      });
    });

    const startOfferFlow = async (ctx: any) => {
      ctx.session.step = 'AWAITING_PLATFORM';
      const promptText = `يرجى كتابة اسم المنصة اللي بيها الحساب (مثال: pc / xbox / mobile):`;
      await ctx.reply(promptText, { parse_mode: 'Markdown', reply_markup: { remove_keyboard: true } });
    };

    bot.command('sell', startOfferFlow);
    bot.hears('تقديم طلب جديد 📝', startOfferFlow);

    // 5. Handle Text and Offers
    bot.on(['text', 'photo', 'video', 'document'], async (ctx, next) => {
      // Handle Group contexts
      if (ctx.chat && ctx.chat.type !== 'private') {
        if (ctx.message && 'text' in ctx.message) {
          const text = ctx.message.text;
          const botInfo = ctx.botInfo;
          
          if (botInfo) {
            const isUserAdmin = (ctx.from?.id && adminIds.includes(ctx.from.id)) || 
                                (ctx.from?.username && adminIds.includes('@' + ctx.from.username));
            if (isUserAdmin && ctx.from?.username && ctx.from?.id && adminIds.includes('@' + ctx.from.username)) {
               resolvedAdmins.set('@' + ctx.from.username, ctx.from.id);
            }
            const isMentioned = text.includes(`@${botInfo.username}`);
            const isStartCommand = text.startsWith('/start') || text.startsWith('/sell');

            if (isMentioned || (isUserAdmin && isStartCommand)) {
              try {
                // Try sending direct message first
                await ctx.telegram.sendMessage(
                  ctx.from.id, 
                  `أهلاً بك! لقد طلبت تقديم عرض. يرجى إرسال /start في هذه المحادثة للبدء في خطوات تقديم العرض.`
                );
              } catch (e) {
                // User has not started the bot yet, we must reply in the group
                try {
                  await ctx.reply(`أهلاً بك ${ctx.from.first_name}! حسب سياسة التيلجرام لا يمكن للبوت مراسلتك أولاً. يرجى مراسلتي في الخاص بالضغط على الزر أدناه لتقديم عرضك. 🚀`, {
                    reply_parameters: { message_id: ctx.message.message_id },
                    reply_markup: {
                      inline_keyboard: [[
                        { text: 'تواصل معي لعرض طلبك 💬', url: `https://t.me/${botInfo.username}?start=new` }
                      ]]
                    }
                  });
                } catch (err) {}
              }
            }
          }
        }
        return next();
      }

      if (ctx.session?.step === 'AWAITING_PLATFORM') {
        if (ctx.message && 'text' in ctx.message && !ctx.message.text.startsWith('/')) {
          ctx.session.platform = ctx.message.text;
          ctx.session.step = 'AWAITING_GAME_NAME';
          await ctx.reply(
            `✅ لقد اخترت: ${ctx.message.text}\n\nالآن، يرجى كتابة اسم اللعبة أو الحساب (مثال: ببجي، يوزر ثلاثي انستا):`
          );
        } else {
          return next();
        }
      } else if (ctx.session?.step === 'AWAITING_GAME_NAME') {
        if (ctx.message && 'text' in ctx.message && !ctx.message.text.startsWith('/')) {
          ctx.session.gameName = ctx.message.text;
          ctx.session.step = 'AWAITING_PRICE';
          await ctx.reply(
            `✅ اسم اللعبة/الحساب: ${ctx.message.text}\n\nالآن، يرجى كتابة السعر المقترح للبيع (مثال: 50$ أو 250 ألف دينار عراقي):`
          );
        } else {
          return next();
        }
      } else if (ctx.session?.step === 'AWAITING_PRICE') {
        if (ctx.message && 'text' in ctx.message && !ctx.message.text.startsWith('/')) {
          ctx.session.price = ctx.message.text;
          ctx.session.step = 'AWAITING_INFO';
          await ctx.reply(
            `✅ السعر المقترح: ${ctx.message.text}\n\nالآن، يرجى إرسال تفاصيل العرض بالكامل في رسالة واحدة \n(أرسل صورة بالإضافة إلى التفاصيل في الوصف لتكون واضحة للإدارة، أو رسالة نصية تحتوي على كل شيء).`
          );
        } else {
          return next();
        }
      } else if (ctx.session?.step === 'AWAITING_INFO') {
        const platform = ctx.session.platform || 'غير محدد';
        const gameName = ctx.session.gameName || 'غير محدد';
        const price = ctx.session.price || 'غير محدد';
        
        try {
          const originalMsgId = ctx.message.message_id;
          const offerId = `${ctx.chat.id}_${originalMsgId}`;
          const uniqueCode = `OFR-${Math.floor(100000 + Math.random() * 900000)}`;
          
          let contentStr = '';
          if (ctx.message && 'text' in ctx.message) {
            contentStr = ctx.message.text;
          } else if (ctx.message && 'caption' in ctx.message && typeof ctx.message.caption === 'string') {
            contentStr = ctx.message.caption;
          } else {
            contentStr = 'بدون نص إضافي (مرفق فقط)';
          }
          
          const newOffer: Offer = {
            id: offerId,
            uniqueCode: uniqueCode,
            userId: ctx.from.id,
            username: ctx.from.username ? '@' + ctx.from.username : (ctx.from.first_name || 'بدون يوزر'),
            platform: platform,
            gameName: gameName,
            price: price,
            content: contentStr,
            sourceChatId: ctx.chat.id,
            sourceMessageId: originalMsgId,
            status: 'pending',
            createdAt: new Date()
          };
          
          offersData.unshift(newOffer);

          try {
            // Notify admins in private
            const adminMsg = `🆕 *تم تقديم عرض جديد!*\n` +
                             `*كود الطلب:* \`${uniqueCode}\`\n` +
                             `*اللعبة/الحساب:* ${gameName}\n` +
                             `*السعر:* ${price}\n\n` +
                             `يرجى مراجعة لوحة التحكم للتفاصيل.`;
            
            for (const adminId of adminIds) {
              const targetId = typeof adminId === 'string' && adminId.startsWith('@') 
                                ? resolvedAdmins.get(adminId) || adminId 
                                : adminId;
              try {
                await bot.telegram.sendMessage(targetId, adminMsg, { parse_mode: 'Markdown' });
              } catch (err) {
                console.error(`Failed to notify admin ${adminId}:`, err);
              }
            }

            // Tell the user
            ctx.session.step = 'IDLE';
            await ctx.reply(`✅ تم إرسال معلوماتك بنجاح إلى الإدارة للمراجعة.\n\nكود طلبك: \`${uniqueCode}\`\n\nيرجى الانتظار، سيصلك إشعار عند الموافقة.`, {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: 'تقديم عرض جديد', callback_data: 'new_offer' }]
                ]
              }
            });
          } catch (globalError: any) {
            console.error("Global error handling offer:", globalError);
            await ctx.reply("❌ حدث خطأ غير متوقع أثناء معالجة العرض.");
          }
        } catch (globalError: any) {
          console.error("Global error handling offer:", globalError);
          await ctx.reply("❌ حدث خطأ غير متوقع أثناء معالجة العرض.");
        }
      } else {
        // Not awaiting info
        if (ctx.message && 'text' in ctx.message && !ctx.message.text.startsWith('/')) {
           if (ctx.message.text === 'تقديم طلب جديد 📝') return next();
           await startOfferFlow(ctx);
        }
      }
    });
    
    bot.action('new_offer', async (ctx) => {
      if (ctx.session) ctx.session.step = 'AWAITING_PLATFORM';
      try {
        await ctx.answerCbQuery('🔔 اكتب اسم المنصه الي بيها الحساب pc/xbox/mobile', { show_alert: true });
      } catch (e) {}
      await ctx.editMessageText('مرحباً بك مجدداً! يرجى كتابة اسم المنصة الي بيها الحساب (مثال: pc / xbox / mobile):');
    });

    // Catch all errors inside bot
    bot.catch((err: any, ctx) => {
      console.error(`Bot error for ${ctx.updateType}:`, err);
    });

    // Launch bot
    bot.launch({ dropPendingUpdates: true }).catch((err) => {
      console.error("Bot launch failed:", err.message);
    });
    console.log("Telegram Bot started!");
    
    // Enable graceful stop
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));

  } catch (err) {
    console.error("Failed to initialize bot:", err);
    botStatus = 'Error';
  }
}

// Fire setup
setupBot();

// ==========================================
// EXPRESS + VITE SETUP
// ==========================================
async function startServer() {
  // API Route to check status
  app.get('/api/status', (req, res) => {
    res.json({ status: botStatus });
  });

  app.get('/api/offers', (req, res) => {
    res.json(offersData);
  });

  app.post('/api/offers/:id/update', (req, res) => {
    const offer = offersData.find(o => o.id === req.params.id);
    if (!offer) return res.status(404).json({ error: 'Not found' });
    if (offer.status !== 'pending') return res.status(400).json({ error: 'Offer already processed' });
    
    // Update fields
    const { platform, gameName, price, content } = req.body;
    if (platform !== undefined) offer.platform = platform;
    if (gameName !== undefined) offer.gameName = gameName;
    if (price !== undefined) offer.price = price;
    if (content !== undefined) offer.content = content;

    res.json(offer);
  });

  app.post('/api/offers/:id/approve', async (req, res) => {
    const offer = offersData.find(o => o.id === req.params.id);
    if (!offer) return res.status(404).json({ error: 'Not found' });
    if (offer.status !== 'pending') return res.status(400).json({ error: 'Offer already processed' });

    if (!botInstance) return res.status(500).json({ error: 'Bot offline' });

    try {
      if (!targetChannel) throw new Error("Channel not set");
      const pubMsg = await botInstance.telegram.copyMessage(targetChannel, offer.sourceChatId, offer.sourceMessageId);
      
      // Send broker note along with platform and price
      try {
        const infoMessage = `🏷️ المنصة: ${offer.platform}\n🎮 اللعبة/الحساب: ${offer.gameName || 'غير محدد'}\n💰 السعر المقترح: ${offer.price || 'غير محدد'}\n\n⚠️ ملاحظة: نحن نعمل كـ وسيط فقط بين البائع والمشتري.`;
        await botInstance.telegram.sendMessage(targetChannel, infoMessage, { reply_parameters: { message_id: pubMsg.message_id } });
      } catch (e) {
         console.error("Broker notice error:", e);
      }

      let publicLink = '';
      if (targetChannel.startsWith('@')) {
        const channelName = targetChannel.replace('@', '');
        publicLink = `https://t.me/${channelName}/${pubMsg.message_id}`;
      } else {
        const cleanId = targetChannel.toString().replace('-100', '');
        publicLink = `https://t.me/c/${cleanId}/${pubMsg.message_id}`;
      }

      await botInstance.telegram.sendMessage(offer.userId, `🎉 مبروك! تمت الموافقة على عرضك عبر لوحة التحكم وتم نشره في القناة.\n\nشاهد عرضك من هنا: ${publicLink}`);
      
      offer.status = 'approved';
      res.json({ success: true, link: publicLink });

    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/offers/:id/reject', async (req, res) => {
    const { reason } = req.body || {};
    const offer = offersData.find(o => o.id === req.params.id);
    if (!offer) return res.status(404).json({ error: 'Not found' });
    if (offer.status !== 'pending') return res.status(400).json({ error: 'Offer already processed' });

    if (!botInstance) return res.status(500).json({ error: 'Bot offline' });

    try {
      let rejectMessage = `❌ نعتذر، تم مراجعة عرضك ورفضه من قبل الإدارة.`;
      if (reason && reason.trim() !== '') {
        rejectMessage += `\nالسبب: ${reason}`;
        (offer as any).rejectReason = reason;
      }
      await botInstance.telegram.sendMessage(offer.userId, rejectMessage);
      offer.status = 'rejected';
      res.json({ success: true });

    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
