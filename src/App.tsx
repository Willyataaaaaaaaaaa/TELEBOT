import React, { useEffect, useState } from 'react';
import { ShieldAlert, Bot, CheckCircle2, AlertCircle, Clock, Check, X, Edit, History, InboxIcon, Save } from 'lucide-react';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'motion/react';

export default function App() {
  const [botStatus, setBotStatus] = useState<string>('Loading...');
  const [offers, setOffers] = useState<any[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');

  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<any>({});
  const [showIntro, setShowIntro] = useState(true);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const springConfig = { damping: 25, stiffness: 400, mass: 0.1 };
  const smoothMouseX = useSpring(mouseX, springConfig);
  const smoothMouseY = useSpring(mouseY, springConfig);
  
  const rotateX = useTransform(smoothMouseY, y => {
    if (typeof window === 'undefined' || window.innerWidth < 768) return 0;
    return ((y / window.innerHeight) - 0.5) * -6; // reduced rotation for better performance
  });
  
  const rotateY = useTransform(smoothMouseX, x => {
    if (typeof window === 'undefined' || window.innerWidth < 768) return 0;
    return ((x / window.innerWidth) - 0.5) * 6;
  });

  const mouseGlowX = useTransform(smoothMouseX, x => x - 300);
  const mouseGlowY = useTransform(smoothMouseY, y => y - 300);

  useEffect(() => {
    let _mounted = true;
    const start = Date.now();
    const fetchData = async () => {
      try {
        const resStatus = await fetch('/api/status');
        const dataStatus = await resStatus.json();
        if (_mounted) setBotStatus(dataStatus.status);

        const resOffers = await fetch('/api/offers');
        const dataOffers = await resOffers.json();
        if (_mounted) {
          setOffers(dataOffers);
        }
      } catch (e) {
        if (_mounted) setBotStatus('Error contacting server');
      } finally {
        if (_mounted) {
          const elapsed = Date.now() - start;
          if (elapsed < 2000) {
            setTimeout(() => { if (_mounted) setShowIntro(false); }, 2000 - elapsed);
          } else {
            setShowIntro(false);
          }
        }
      }
    };
    
    fetchData();
    const interval = setInterval(fetchData, 5000); // 5 seconds interval limit
    return () => {
      _mounted = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouseX.set(e.clientX);
      mouseY.set(e.clientY);
    };
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  const handleApprove = async (id: string) => {
    try {
      const res = await fetch(`/api/offers/${id}/approve`, { method: 'POST' });
      if (!res.ok) {
        const error = await res.json();
        alert('خطأ أثناء الموافقة: ' + error.error);
        return;
      }
      setOffers(prev => prev.map(o => o.id === id ? { ...o, status: 'approved' } : o));
      showToast('تم النشر في القناة بنجاح ✨');
    } catch (e) {
      alert('حدث خطأ بالاتصال بالسيرفر');
    }
  };

  const handleRejectClick = (id: string) => {
    setRejectingId(id);
    setRejectReason('');
    setEditingId(null);
  };

  const cancelReject = () => {
    setRejectingId(null);
    setRejectReason('');
  };

  const submitReject = async (id: string) => {
    try {
      const res = await fetch(`/api/offers/${id}/reject`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason })
      });
      if (!res.ok) {
        const error = await res.json();
        alert('خطأ أثناء الرفض: ' + error.error);
        return;
      }
      setOffers(prev => prev.map(o => o.id === id ? { ...o, status: 'rejected', rejectReason: rejectReason } : o));
      showToast('تم رفض العرض ❌');
      setRejectingId(null);
    } catch (e) {
      alert('حدث خطأ بالاتصال بالسيرفر');
    }
  };

  const handleEditClick = (offer: any) => {
    setEditingId(offer.id);
    setEditFormData({
      platform: offer.platform,
      gameName: offer.gameName,
      price: offer.price,
      content: offer.content
    });
    setRejectingId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const submitEdit = async (id: string) => {
    try {
      const res = await fetch(`/api/offers/${id}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editFormData)
      });
      if (!res.ok) {
        const error = await res.json();
        alert('خطأ أثناء التعديل: ' + error.error);
        return;
      }
      const updatedOffer = await res.json();
      setOffers(prev => prev.map(o => o.id === id ? updatedOffer : o));
      showToast('تم تحديث العرض بنجاح 📝');
      setEditingId(null);
    } catch (e) {
      alert('حدث خطأ بالاتصال بالسيرفر');
    }
  };

  const pendingOffers = offers.filter(o => o.status === 'pending');
  const historyOffers = offers.filter(o => o.status !== 'pending');
  const displayedOffers = activeTab === 'pending' ? pendingOffers : historyOffers;

  return (
    <div className="min-h-screen animated-shader flex items-center justify-center md:p-4 lg:p-8 font-sans relative overflow-hidden" dir="rtl" style={{ perspective: '1200px' }}>
      
      {/* Background glow orbs */}
      <div className="absolute top-[10%] left-[20%] w-[500px] h-[500px] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#2a0e5b]/40 to-transparent rounded-full pointer-events-none" />
      <div className="absolute bottom-[20%] right-[10%] w-[400px] h-[400px] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#1d0e40]/40 to-transparent rounded-full pointer-events-none" />
      <div className="absolute top-[40%] right-[40%] w-[300px] h-[300px] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#1b0845]/40 to-transparent rounded-full pointer-events-none" />

      {/* Mouse tracker glow - optimized with GPU translations and hidden on mobile */}
      <motion.div 
        className="hidden md:block pointer-events-none fixed z-0 opacity-40 rounded-full w-[600px] h-[600px]"
        style={{
          background: 'radial-gradient(circle, rgba(147, 51, 234, 0.4), transparent 60%)',
          left: 0,
          top: 0,
          x: mouseGlowX,
          y: mouseGlowY,
          willChange: 'transform'
        }}
      />

      <AnimatePresence>
        {showIntro && (
          <motion.div
            initial={{ opacity: 0, scale: 1.2 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0a0514]/80 backdrop-blur-3xl"
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.8, type: 'spring', stiffness: 200 }}
              className="p-6 bg-purple-900/30 rounded-full ring-2 ring-purple-500/20 shadow-[0_0_30px_rgba(168,85,247,0.5)] mb-6"
            >
              <Bot size={64} className="text-purple-300" />
            </motion.div>
            <motion.h1 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.6 }}
              className="text-4xl font-bold text-white tracking-tight"
            >
              لوحة التحكم
            </motion.h1>
            <motion.div 
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 0.6, duration: 0.8, ease: "circOut" }}
              className="h-1 bg-gradient-to-r from-transparent via-purple-500 to-transparent w-48 mt-4 rounded-full"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -50, x: '-50%', scale: 0.9 }}
            animate={{ opacity: 1, y: 0, x: '-50%', scale: 1 }}
            exit={{ opacity: 0, y: -20, x: '-50%', scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="fixed top-8 left-1/2 z-50 bg-[#160a2b] text-purple-100 px-6 py-3 rounded-full shadow-[0_0_30px_rgba(168,85,247,0.3)] border border-purple-500/50 font-semibold flex items-center gap-3"
          >
            {toast.includes('✨') || toast.includes('📝') ? <CheckCircle2 size={20} className="text-emerald-400" /> : <AlertCircle size={20} className="text-purple-400" />}
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main App Container */}
      <AnimatePresence>
        {!showIntro && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            style={{ rotateX, rotateY, transformStyle: 'preserve-3d', willChange: 'transform' }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="max-w-6xl w-full bg-[#110c1c]/95 md:rounded-[2rem] shadow-2xl shadow-purple-900/30 overflow-hidden md:border border-white/5 flex flex-col md:flex-row h-[100dvh] md:h-[90vh] relative md:ring-1 ring-inset ring-white/10"
          >
        {/* Top gradient highlight */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-purple-400/50 to-transparent opacity-50 z-20" />

        
        {/* Sidebar / Info */}
        <div className="bg-black/40 p-4 md:p-6 text-purple-100 relative overflow-hidden md:w-1/3 flex flex-col items-center text-center border-b md:border-b-0 md:border-l border-purple-800/30 shrink-0">
          <div className="absolute top-0 left-0 w-full h-full bg-black opacity-10 pattern-grid-lg mix-blend-overlay"></div>
          <div className="relative z-10 flex flex-col items-center w-full">
            <div className="p-4 bg-purple-900/40 rounded-full mb-4 ring-2 ring-purple-500/20 shadow-[0_0_15px_rgba(168,85,247,0.4)]">
              <Bot size={48} className="text-purple-300" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight mb-2 text-white">لوحة التحكم</h1>
            <p className="text-purple-300/80 font-medium text-sm mb-6">استقبال ومراجعة العروض الخاصة بالبوت</p>

            {/* Navigation Tabs */}
            <div className="flex flex-col w-full gap-2 mb-6">
              <motion.button 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setActiveTab('pending')}
                className={`cursor-pointer relative flex items-center justify-between px-4 py-3 rounded-xl transition-all font-semibold overflow-hidden ${
                  activeTab === 'pending' 
                  ? 'text-purple-100 shadow-[0_0_15px_rgba(168,85,247,0.2)]' 
                  : 'bg-black/20 border border-purple-800/30 hover:bg-black/40 text-purple-300/70'
                }`}
              >
                {activeTab === 'pending' && (
                  <motion.div 
                    layoutId="active-tab-bg"
                    transition={{ type: "spring", stiffness: 600, damping: 35 }}
                    className="absolute inset-0 bg-purple-600/30 border border-purple-500/50 rounded-xl"
                  />
                )}
                <div className="flex items-center gap-2 relative z-10">
                  <InboxIcon size={18} />
                  الطلبات الجديدة
                </div>
                {pendingOffers.length > 0 && (
                  <span className="bg-purple-500 text-white text-xs px-2 py-0.5 rounded-full relative z-10">{pendingOffers.length}</span>
                )}
              </motion.button>
              
              <motion.button 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setActiveTab('history')}
                className={`cursor-pointer relative flex items-center justify-between px-4 py-3 rounded-xl transition-all font-semibold overflow-hidden ${
                  activeTab === 'history' 
                  ? 'text-purple-100 shadow-[0_0_15px_rgba(168,85,247,0.2)]' 
                  : 'bg-black/20 border border-purple-800/30 hover:bg-black/40 text-purple-300/70'
                }`}
              >
                {activeTab === 'history' && (
                  <motion.div 
                    layoutId="active-tab-bg"
                    transition={{ type: "spring", stiffness: 600, damping: 35 }}
                    className="absolute inset-0 bg-purple-600/30 border border-purple-500/50 rounded-xl"
                  />
                )}
                <div className="flex items-center gap-2 relative z-10">
                  <History size={18} />
                  السجل
                </div>
              </motion.button>
            </div>

            <div className="mt-auto flex items-center gap-2 pt-4 border-t w-full justify-center border-purple-800/30">
              {botStatus === 'Running' ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-900/60 rounded-full text-sm font-semibold shadow-[0_0_10px_rgba(168,85,247,0.2)] border border-purple-500/30 text-purple-200">
                  <CheckCircle2 size={16} className="text-purple-400"/> البوت يعمل
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-black/60 rounded-full text-sm font-semibold shadow-sm border border-rose-900/30 text-rose-200">
                  <AlertCircle size={16} className="text-rose-400"/> متوقف أو خطأ
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Dashboard Content */}
        <div className="p-4 md:p-6 lg:p-8 md:w-2/3 bg-transparent w-full overflow-y-auto hidden-scrollbar flex-1">
          <h2 className="text-xl font-bold text-white border-b border-purple-800/30 pb-4 mb-6 flex items-center gap-2">
            {activeTab === 'pending' ? <><InboxIcon className="text-purple-400" /> الطلبات الجديدة</> : <><History className="text-purple-400"/> السجل</>}
          </h2>

          {displayedOffers.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="text-center py-20 flex flex-col items-center justify-center h-[50vh] min-h-[300px]"
            >
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              >
                <Clock className="w-16 h-16 text-purple-800/40 mb-4" />
              </motion.div>
              <p className="text-purple-300/80 font-medium text-lg">
                {activeTab === 'pending' ? 'لا توجد طلبات جديدة بانتظار المراجعة...' : 'لا يوجد سجل للطلبات حتى الآن...'}
              </p>
            </motion.div>
          ) : (
            <motion.div layout className="space-y-4">
              <AnimatePresence mode="popLayout">
              {displayedOffers.map((offer) => (
                <motion.div 
                  layout
                  initial={{ opacity: 0, scale: 0.95, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -20 }}
                  transition={{ 
                    type: "spring", 
                    stiffness: 500, 
                    damping: 30
                  }}
                  key={offer.id} 
                  className="group bg-[#1a1129] border border-purple-800/30 rounded-xl p-4 shadow-md hover:border-purple-500/50 hover:bg-[#231738] transition-all relative overflow-hidden"
                >
                  {/* Decorative glowing gradient inside the card on hover */}
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-gradient-to-tr from-purple-600/5 to-transparent transition-opacity duration-500 pointer-events-none" />
                  {/* Status Indicator */}
                  <div className={`absolute left-0 top-0 w-1 h-full ${
                    offer.status === 'pending' ? 'bg-amber-500/80' :
                    offer.status === 'approved' ? 'bg-emerald-500/80' : 'bg-rose-500/80'
                  }`}></div>

                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="font-bold text-purple-100 text-lg flex items-center gap-2">
                        {offer.username.startsWith('@') ? (
                           <a href={`https://t.me/${offer.username.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="hover:text-purple-300 transition-colors">
                             {offer.username}
                           </a>
                        ) : (
                           offer.username
                        )}
                      </h3>
                      <div className="flex items-center gap-1.5 px-2 py-1 bg-purple-900/30 rounded-md border border-purple-800/50 shadow-sm">
                        <span className="text-purple-400 text-xs font-semibold">كود الطلب:</span>
                        <span className="text-purple-200 font-mono text-xs font-bold tracking-wider">{offer.uniqueCode || (offer.id.split('_').pop() || offer.id)}</span>
                      </div>
                    </div>
                    {/* Status Badge */}
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                      offer.status === 'pending' ? 'bg-amber-900/20 border-amber-700/30 text-amber-200' :
                      offer.status === 'approved' ? 'bg-emerald-900/20 border-emerald-700/30 text-emerald-200' : 'bg-rose-900/20 border-rose-700/30 text-rose-200'
                    }`}>
                      {offer.status === 'pending' && <><Clock size={12}/> بانتظار المراجعة</>}
                      {offer.status === 'approved' && <><Check size={12}/> تمت الموافقة</>}
                      {offer.status === 'rejected' && <><X size={12}/> تم الرفض</>}
                    </span>
                  </div>

                  {editingId === offer.id ? (
                    <div className="bg-black/40 p-4 border border-purple-500/30 rounded-lg mb-4 space-y-3">
                      <div>
                        <label className="block text-xs text-purple-300 mb-1">المنصة</label>
                        <input 
                          type="text" 
                          value={editFormData.platform} 
                          onChange={e => setEditFormData({...editFormData, platform: e.target.value})}
                          className="w-full bg-black/60 border border-purple-700/50 rounded p-2 text-sm text-white focus:outline-none focus:border-purple-400"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-purple-300 mb-1">الاسم / اللعبة</label>
                        <input 
                          type="text" 
                          value={editFormData.gameName} 
                          onChange={e => setEditFormData({...editFormData, gameName: e.target.value})}
                          className="w-full bg-black/60 border border-purple-700/50 rounded p-2 text-sm text-white focus:outline-none focus:border-purple-400"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-purple-300 mb-1">السعر المقترح</label>
                        <input 
                          type="text" 
                          value={editFormData.price} 
                          onChange={e => setEditFormData({...editFormData, price: e.target.value})}
                          className="w-full bg-black/60 border border-purple-700/50 rounded p-2 text-sm text-white focus:outline-none focus:border-purple-400"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-purple-300 mb-1">وصف العرض</label>
                        <textarea 
                          value={editFormData.content} 
                          onChange={e => setEditFormData({...editFormData, content: e.target.value})}
                          className="w-full bg-black/60 border border-purple-700/50 rounded p-2 text-sm text-white focus:outline-none focus:border-purple-400 min-h-[80px]"
                        />
                      </div>
                      <div className="flex gap-2 pt-2">
                        <button onClick={() => submitEdit(offer.id)} className="flex-1 flex justify-center items-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white py-1.5 rounded-md text-xs font-semibold transition-colors">
                          <Save size={14} /> حفظ التعديلات
                        </button>
                        <button onClick={cancelEdit} className="flex-1 flex justify-center items-center gap-1 bg-black border border-purple-700 text-purple-300 hover:bg-purple-900/30 py-1.5 rounded-md text-xs font-semibold transition-colors">
                          إلغاء
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-3 text-sm">
                        <div className="bg-black/20 p-2 rounded-md border border-purple-800/20">
                          <span className="block text-purple-400 text-xs mb-1">المنصة</span>
                          <span className="font-medium text-purple-100">{offer.platform}</span>
                        </div>
                        <div className="bg-black/20 p-2 rounded-md border border-purple-800/20">
                          <span className="block text-purple-400 text-xs mb-1">الاسم / اللعبة</span>
                          <span className="font-medium text-purple-100">{offer.gameName || 'غير محدد'}</span>
                        </div>
                        <div className="bg-black/20 p-2 rounded-md border border-purple-800/20 col-span-2 lg:col-span-1">
                          <span className="block text-purple-400 text-xs mb-1">السعر المقترح</span>
                          <span className="font-medium text-purple-100">{offer.price || 'غير محدد'}</span>
                        </div>
                      </div>

                      <div className="mb-3 text-sm text-purple-100 flex flex-wrap gap-x-4 gap-y-1">
                        <div><span className="text-purple-400/80">تاريخ التقديم:</span> <span className="text-purple-300 text-xs">{new Date(offer.createdAt).toLocaleString()}</span></div>
                      </div>

                      <div className="mt-3 p-3 bg-black/40 border border-purple-800/30 rounded-lg text-sm text-purple-100/90 whitespace-pre-wrap leading-relaxed">
                        <span className="text-purple-400 block mb-2 font-semibold">تفاصيل العرض:</span>
                        {offer.content || 'لا يوجد نص إضافي للعرض، ربما يكون العرض قديم أو يحتوي على صور فقط.'}
                      </div>
                    </>
                  )}

                  {offer.status === 'pending' && !editingId && rejectingId !== offer.id && (
                    <div className="mt-4 pt-3 border-t border-purple-800/30 flex flex-col sm:flex-row gap-2 w-full">
                      <button 
                        onClick={() => handleApprove(offer.id)}
                        className="flex-1 flex justify-center items-center gap-1 bg-purple-600 hover:bg-purple-500 text-white shadow-[0_0_10px_rgba(168,85,247,0.3)] hover:shadow-[0_0_15px_rgba(168,85,247,0.5)] py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer">
                        <Check size={16} /> موافقة ونشر
                      </button>
                      
                      <div className="flex gap-2 flex-1">
                        <button 
                          onClick={() => handleEditClick(offer)}
                          className="flex-[0.5] sm:flex-initial flex items-center justify-center gap-1 px-4 bg-amber-600/80 hover:bg-amber-500 text-white hover:shadow-[0_0_15px_rgba(245,158,11,0.4)] py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer">
                          <Edit size={16} /> تعديل
                        </button>

                        <button 
                          onClick={() => handleRejectClick(offer.id)}
                          className="flex-1 flex justify-center items-center gap-1 bg-black/40 hover:bg-rose-900/40 border border-purple-800/50 hover:border-rose-500/50 text-purple-200 hover:text-rose-300 hover:shadow-[0_0_15px_rgba(225,29,72,0.4)] py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer">
                          <X size={16} /> رفض العرض
                        </button>
                      </div>
                    </div>
                  )}

                  {rejectingId === offer.id && (
                    <div className="mt-4 pt-3 border-t border-purple-800/30 animate-in fade-in flex flex-col gap-2">
                       <textarea 
                         className="w-full bg-black/40 border border-purple-800/50 rounded-lg p-2 text-sm text-purple-100 placeholder-purple-400/50 focus:outline-none focus:border-purple-500/50 resize-none h-20"
                         placeholder="سبب الرفض (اختياري)..."
                         value={rejectReason}
                         onChange={(e) => setRejectReason(e.target.value)}
                       />
                       <div className="flex gap-2">
                         <button 
                           onClick={() => submitReject(offer.id)}
                           className="flex-1 flex justify-center items-center gap-1 bg-rose-600 hover:bg-rose-500 text-white shadow-[0_0_10px_rgba(225,29,72,0.3)] hover:shadow-[0_0_20px_rgba(225,29,72,0.6)] py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer">
                           تأكيد الرفض
                         </button>
                         <button 
                           onClick={cancelReject}
                           className="flex-1 flex justify-center items-center gap-1 bg-black/40 hover:bg-black/60 border border-purple-800/50 text-purple-200 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer">
                           إلغاء
                         </button>
                       </div>
                    </div>
                  )}

                  {offer.status !== 'pending' && (
                     <div className="mt-4 pt-3 border-t border-purple-800/30 flex justify-between items-center">
                        <p className="text-sm font-medium text-purple-300">
                           {offer.status === 'approved' ? '✅ تم النشر في القناة' : '❌ تم رفض العرض'}
                        </p>
                        {offer.rejectReason && offer.status === 'rejected' && (
                           <span className="text-xs text-rose-300/80 bg-rose-900/20 px-2 py-1 rounded">السبب: {offer.rejectReason}</span>
                        )}
                     </div>
                  )}
                </motion.div>
              ))}
              </AnimatePresence>
            </motion.div>
          )}
        </div>
        
      </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}

