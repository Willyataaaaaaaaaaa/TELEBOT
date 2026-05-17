import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { Telegraf, session, Markup, Context } from 'telegraf';
import dotenv from 'dotenv';

dotenv.config();

// Custom Context with Session
interface SessionData {
  step?: 'IDLE' | 'AWAITING_PLATFORM' | 'AWAITING_PRICE' | 'AWAITING_INFO';
  platform?: string;
  price?: string;
}

interface MyContext extends Context {
  session: SessionData;
}

export interface Offer {
  id: string;
  userId: number;
  username: string;
  platform: string;
  price?: string;
  sourceChatId: number;
  sourceMessageId: number;
  adminMessageId?: number;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: Date;
}

export const offersData: Offer[] = [];
export let targetChannel = '';

// Ensure ES module directory variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Middleware for parsing JSON requests in Express
app.use(express.json());

// ==========================================
// TELEGRAM BOT SETUP
// ==========================================
let botStatus = 'Stopped';
let botInstance: Telegraf<MyContext> | null = null;

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
    bot.use(session({ defaultSession: () => ({ step: 'IDLE' }) }));

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
      if (isUserAdmin) return next();
      
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
      ctx.session.step = 'AWAITING_PLATFORM';
      const welcomeText = `مرحباً بك في بوت العروض! 🌟\n\nيرجى كتابة نوع المنصة التي ترغب في بيع حسابك/غرضك فيها (مثال: انستقرام، تيك توك، إلخ):`;
      await ctx.reply(welcomeText, { parse_mode: 'Markdown', ...Markup.removeKeyboard() });
    });

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
          ctx.session.step = 'AWAITING_PRICE';
          await ctx.reply(
            `✅ لقد اخترت: ${ctx.message.text}\n\nالآن، يرجى كتابة السعر المقترح للبيع (مثال: 50$ أو 200 ريال):`
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
        const price = ctx.session.price || 'غير محدد';
        
        try {
          const originalMsgId = ctx.message.message_id;
          const offerId = `${ctx.chat.id}_${originalMsgId}`;
          
          const newOffer: Offer = {
            id: offerId,
            userId: ctx.from.id,
            username: ctx.from.username ? '@' + ctx.from.username : (ctx.from.first_name || 'بدون يوزر'),
            platform: platform,
            price: price,
            sourceChatId: ctx.chat.id,
            sourceMessageId: originalMsgId,
            status: 'pending',
            createdAt: new Date()
          };
          
          offersData.unshift(newOffer);

          try {
            const senderName = ctx.from.username ? '@' + ctx.from.username : (ctx.from.first_name || 'بدون يوزر');
            const safeSenderName = senderName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const adminText = `📩 عرض جديد للبيع!\n👤 المُرسل: ${safeSenderName}\n🔗 الحساب: <a href="tg://user?id=${ctx.from.id}">البدء بالمحادثة</a>\n🏷️ المنصة: ${platform}\n💰 السعر المقترح: ${price}\n\nاختر الإجراء المناسب:`;

            for (const currentAdminId of adminIds) {
              try {
                // First, copy the exact user message to the admin
                const copiedMsg = await ctx.telegram.copyMessage(currentAdminId, ctx.chat.id, originalMsgId);
                
                // Then, send the action buttons tied to the copied message
                const actionMsg = await ctx.telegram.sendMessage(
                  currentAdminId,
                  adminText,
                  {
                    parse_mode: 'HTML',
                    reply_parameters: { message_id: copiedMsg.message_id },
                    reply_markup: {
                      inline_keyboard: [
                        [
                          { text: '✅ موافقة ونشر', callback_data: `approve_${ctx.chat.id}_${originalMsgId}` },
                          { text: '❌ رفض', callback_data: `reject_${ctx.chat.id}_${originalMsgId}` }
                        ]
                      ]
                    }
                  }
                );
                // Save the last admin message ID for cleanup purposes
                newOffer.adminMessageId = actionMsg.message_id;
              } catch (innerError: any) {
                console.error(`Error forwarding to admin ${currentAdminId}:`, innerError);
                if (innerError.message && innerError.message.includes('chat not found') && typeof currentAdminId === 'string') {
                   await ctx.reply(`⚠️ ملاحظة: لم يتم إرسال العرض للأدمن (${currentAdminId}) لأنه يجب استخدام الآيدي الرقمي في الإعدادات بدلاً من اليوزر.`);
                }
              }
            }
          } catch (error: any) {
            console.error("Error forwarding to admin:", error);
            if (error.message && error.message.includes('chat not found')) {
               console.warn("Could not reach admin in Telegram. Offer is still saved to Web Dashboard.");
               await ctx.reply("ℹ️ تم حفظ عرضك في السيرفر الخاص للإدارة (عبر لوحة التحكم)، سيتم نشر عرضك عند الموافقة عليه.");
               ctx.session.step = 'IDLE';
               return;
            }
          }

          // Tell the user
          ctx.session.step = 'IDLE';
          await ctx.reply('✅ تم إرسال معلوماتك بنجاح إلى الإدارة للمراجعة. يرجى الانتظار، سيصلك إشعار عند الموافقة ونشر العرض.',
            Markup.inlineKeyboard([
               [Markup.button.callback('تقديم عرض جديد', 'new_offer')]
            ])
          );
        } catch (globalError: any) {
          console.error("Global error handling offer:", globalError);
          await ctx.reply("❌ حدث خطأ غير متوقع أثناء معالجة العرض.");
        }
      } else {
        // Not awaiting info
        if (ctx.message && 'text' in ctx.message && !ctx.message.text.startsWith('/')) {
           await ctx.reply('يرجى الضغط على /start للبدء وتقديم عرض جديد.');
        }
      }
    });
    
    bot.action('new_offer', async (ctx) => {
      if (ctx.session) ctx.session.step = 'AWAITING_PLATFORM';
      await ctx.editMessageText('مرحباً بك مجدداً! يرجى كتابة نوع المنصة التي ترغب في بيع حسابك/غرضك فيها:');
    });

    // 6. Handle Admin Actions
    // Admin clicks Approve
    bot.action(/approve_(-?\d+)_(\d+)/, async (ctx) => {
      const sourceChatId = Number(ctx.match[1]);
      const sourceMessageId = Number(ctx.match[2]);
      const offerId = `${sourceChatId}_${sourceMessageId}`;
      const offer = offersData.find(o => o.id === offerId);
      
      if (!offer) {
        return ctx.answerCbQuery("❌ هذا العرض غير موجود أو محذوف.");
      }
      
      if (offer.status !== 'pending') {
        // Just hide the keyboard
        try {
          await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
        } catch(e){}
        return ctx.answerCbQuery("❌ تم معالجة هذا العرض مسبقاً.");
      }
      
      try {
        // Publish to channel using the ORIGINAL message from the user
        const pubMsg = await ctx.telegram.copyMessage(targetChannel, sourceChatId, sourceMessageId);
        
        // Send broker note along with platform and price
        try {
          const infoMessage = `🏷️ المنصة: ${offer.platform}\n💰 السعر المقترح: ${offer.price || 'غير محدد'}\n\n⚠️ ملاحظة: نحن نعمل كـ وسيط فقط بين البائع والمشتري.`;
          await ctx.telegram.sendMessage(targetChannel, infoMessage, { reply_parameters: { message_id: pubMsg.message_id } });
        } catch (e) {
           console.error("Broker notice error:", e);
        }

        // Build the link
        let publicLink = '';
        if (targetChannel.startsWith('@')) {
          const channelName = targetChannel.replace('@', '');
          publicLink = `https://t.me/${channelName}/${pubMsg.message_id}`;
        } else {
          // It's a private group/channel ID, e.g. -1001234567890
          const cleanId = targetChannel.toString().replace('-100', '');
          publicLink = `https://t.me/c/${cleanId}/${pubMsg.message_id}`;
        }
        
        // Notify the user
        try {
          await ctx.telegram.sendMessage(sourceChatId, `🎉 مبروك! تمت الموافقة على عرضك وتم نشره في القناة.\n\nشاهد عرضك من هنا: ${publicLink}`);
        } catch(e){} // Ignore if user blocked bot
        
        // Update admin UI
        await ctx.editMessageText(`✅ تمت الموافقة والنشر في القناة.\n\nالرابط: ${publicLink}`);
        
        if (offer) offer.status = 'approved';
      } catch (err) {
        console.error("Error approving:", err);
        await ctx.answerCbQuery("❌ حدث خطأ أثناء النشر! تأكد من أن البوت مشرف في القناة.");
      }
    });

    // Admin clicks Reject
    bot.action(/reject_(-?\d+)_(\d+)/, async (ctx) => {
      const sourceChatId = Number(ctx.match[1]);
      const sourceMessageId = Number(ctx.match[2]);
      const offerId = `${sourceChatId}_${sourceMessageId}`;
      const offer = offersData.find(o => o.id === offerId);
      
      if (!offer) {
        return ctx.answerCbQuery("❌ هذا العرض غير موجود أو محذوف.");
      }
      
      if (offer.status !== 'pending') {
        try {
          await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
        } catch(e){}
        return ctx.answerCbQuery("❌ تم معالجة هذا العرض مسبقاً.");
      }
      
      try {
        // Notify user
        try {
          await ctx.telegram.sendMessage(sourceChatId, `❌ نعتذر، تم مراجعة عرضك ورفضه من قبل الإدارة.`);
        } catch (e) {}
        
        // Update admin UI
        await ctx.editMessageText(`❌ تم رفض العرض.`);
        
        if (offer) offer.status = 'rejected';
      } catch (err) {
        console.error("Error rejecting:", err);
        await ctx.answerCbQuery("❌ حدث خطأ!");
      }
    });

    // Catch all errors inside bot
    bot.catch((err: any, ctx) => {
      console.error(`Bot error for ${ctx.updateType}:`, err);
    });

    // Launch bot
    bot.launch();
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
        const infoMessage = `🏷️ المنصة: ${offer.platform}\n💰 السعر المقترح: ${offer.price || 'غير محدد'}\n\n⚠️ ملاحظة: نحن نعمل كـ وسيط فقط بين البائع والمشتري.`;
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

      // Clean up inline keyboard in admin chat if it exists
      if (offer.adminMessageId && process.env.TELEGRAM_ADMIN_ID) {
        const _adminIds: (string|number)[] = process.env.TELEGRAM_ADMIN_ID.split(',').map(s => {
          const val = s.trim();
          if (/^-?\d+$/.test(val)) return parseInt(val, 10);
          return val.startsWith('@') ? val : '@' + val;
        });
        for (const _adminId of _adminIds) {
          try {
            await botInstance.telegram.editMessageReplyMarkup(_adminId, offer.adminMessageId, undefined, { inline_keyboard: [] });
          } catch(e) {}
        }
      }

    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/offers/:id/reject', async (req, res) => {
    const offer = offersData.find(o => o.id === req.params.id);
    if (!offer) return res.status(404).json({ error: 'Not found' });
    if (offer.status !== 'pending') return res.status(400).json({ error: 'Offer already processed' });

    if (!botInstance) return res.status(500).json({ error: 'Bot offline' });

    try {
      await botInstance.telegram.sendMessage(offer.userId, `❌ نعتذر، تم مراجعة عرضك ورفضه من قبل الإدارة عبر لوحة التحكم.`);
      offer.status = 'rejected';
      res.json({ success: true });

      if (offer.adminMessageId && process.env.TELEGRAM_ADMIN_ID) {
        const _adminIds: (string|number)[] = process.env.TELEGRAM_ADMIN_ID.split(',').map(s => {
          const val = s.trim();
          if (/^-?\d+$/.test(val)) return parseInt(val, 10);
          return val.startsWith('@') ? val : '@' + val;
        });
        for (const _adminId of _adminIds) {
          try {
            await botInstance.telegram.editMessageReplyMarkup(_adminId, offer.adminMessageId, undefined, { inline_keyboard: [] });
          } catch(e) {}
        }
      }

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
