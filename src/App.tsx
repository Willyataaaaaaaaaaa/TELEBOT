import React, { useEffect, useState } from 'react';
import { ShieldAlert, Bot, CheckCircle2, AlertCircle, Clock, Check, X } from 'lucide-react';

export default function App() {
  const [botStatus, setBotStatus] = useState<string>('Loading...');
  const [offers, setOffers] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const resStatus = await fetch('/api/status');
        const dataStatus = await resStatus.json();
        setBotStatus(dataStatus.status);

        const resOffers = await fetch('/api/offers');
        const dataOffers = await resOffers.json();
        setOffers(dataOffers);
      } catch (e) {
        setBotStatus('Error contacting server');
      }
    };
    
    fetchData();
    const interval = setInterval(fetchData, 3000); // 3 seconds interval
    return () => clearInterval(interval);
  }, []);

  const handleApprove = async (id: string) => {
    try {
      const res = await fetch(`/api/offers/${id}/approve`, { method: 'POST' });
      if (!res.ok) {
        const error = await res.json();
        alert('خطأ أثناء الموافقة: ' + error.error);
        return;
      }
      setOffers(offers.map(o => o.id === id ? { ...o, status: 'approved' } : o));
    } catch (e) {
      alert('حدث خطأ بالاتصال بالسيرفر');
    }
  };

  const handleReject = async (id: string) => {
    if (!confirm('هل أنت متأكد من رفض هذا العرض؟')) return;
    try {
      const res = await fetch(`/api/offers/${id}/reject`, { method: 'POST' });
      if (!res.ok) {
        const error = await res.json();
        alert('خطأ أثناء الرفض: ' + error.error);
        return;
      }
      setOffers(offers.map(o => o.id === id ? { ...o, status: 'rejected' } : o));
    } catch (e) {
      alert('حدث خطأ بالاتصال بالسيرفر');
    }
  };

  return (
    <div className="min-h-screen animated-shader flex items-center justify-center p-4 font-sans" dir="rtl">
      <div className="max-w-4xl w-full bg-[#110c1c]/80 backdrop-blur-xl rounded-2xl shadow-2xl shadow-purple-900/20 overflow-hidden border border-purple-800/30 flex flex-col md:flex-row">
        
        {/* Sidebar / Info */}
        <div className="bg-black/40 p-8 text-purple-100 relative overflow-hidden md:w-1/3 flex flex-col items-center text-center justify-center border-b md:border-b-0 md:border-l border-purple-800/30">
          <div className="absolute top-0 left-0 w-full h-full bg-black opacity-10 pattern-grid-lg mix-blend-overlay"></div>
          <div className="relative z-10 flex flex-col items-center">
            <div className="p-4 bg-purple-900/30 rounded-full backdrop-blur-md mb-4 ring-2 ring-purple-500/20 shadow-[0_0_15px_rgba(168,85,247,0.4)]">
              <Bot size={48} className="text-purple-300" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight mb-2 text-white">السيرفر الخاص</h1>
            <p className="text-purple-300/80 font-medium text-sm">استقبال ومراجعة العروض الخاصة بالبوت</p>

            <div className="mt-8 flex items-center gap-2">
              {botStatus === 'Running' ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-900/40 rounded-full text-sm font-semibold shadow-[0_0_10px_rgba(168,85,247,0.2)] backdrop-blur border border-purple-500/30 text-purple-200">
                  <CheckCircle2 size={16} className="text-purple-400"/> البوت يعمل
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-black/40 rounded-full text-sm font-semibold shadow-sm backdrop-blur border border-rose-900/30 text-rose-200">
                  <AlertCircle size={16} className="text-rose-400"/> متوقف أو خطأ
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Dashboard Content */}
        <div className="p-8 pb-8 md:w-2/3 bg-transparent w-full max-h-[80vh] overflow-y-auto">
          <h2 className="text-xl font-bold text-white border-b border-purple-800/30 pb-4 mb-6">أحدث العروض الواردة</h2>

          {offers.length === 0 ? (
            <div className="text-center py-12 flex flex-col items-center">
              <Clock className="w-12 h-12 text-purple-800/50 mb-3" />
              <p className="text-purple-300/80 font-medium">لا توجد عروض حالياً...</p>
              <p className="text-purple-400/50 text-sm mt-1">عندما يقدم شخص عرضاً في البوت، سيظهر هنا.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {offers.map((offer) => (
                <div key={offer.id} className="bg-black/20 border border-purple-800/20 rounded-xl p-4 shadow-sm hover:border-purple-600/40 hover:bg-black/30 transition-all relative overflow-hidden backdrop-blur-sm">
                  {/* Status Indicator */}
                  <div className={`absolute left-0 top-0 w-1 h-full ${
                    offer.status === 'pending' ? 'bg-amber-500/80' :
                    offer.status === 'approved' ? 'bg-emerald-500/80' : 'bg-rose-500/80'
                  }`}></div>

                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <span className="inline-flex px-2 flex-shrink-0 text-xs font-semibold rounded-md bg-purple-900/30 border border-purple-700/30 text-purple-200 mb-2">
                        {offer.platform}
                      </span>
                      <h3 className="font-bold text-purple-100 text-lg flex items-center gap-2">
                        مقدم من: {offer.username}
                        <span className="text-sm font-medium text-purple-400">({offer.price || 'بدون سعر'})</span>
                      </h3>
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

                  <p className="text-sm text-purple-300/60 mt-2 font-medium">
                    <span className="text-purple-300/80">تاريخ التقديم:</span> {new Date(offer.createdAt).toLocaleString()}
                  </p>

                  {offer.status === 'pending' && (
                    <div className="mt-4 pt-3 border-t border-purple-800/30 flex items-center gap-2 mt-2">
                      <button 
                        onClick={() => handleApprove(offer.id)}
                        className="flex-1 flex justify-center items-center gap-1 bg-purple-600 hover:bg-purple-500 text-white shadow-[0_0_10px_rgba(168,85,247,0.3)] hover:shadow-[0_0_15px_rgba(168,85,247,0.5)] py-2 rounded-lg text-sm font-semibold transition-all">
                        <Check size={16} /> موافقة ونشر
                      </button>
                      <button 
                        onClick={() => handleReject(offer.id)}
                        className="flex-1 flex justify-center items-center gap-1 bg-black/40 hover:bg-black/60 border border-purple-800/50 text-purple-200 py-2 rounded-lg text-sm font-semibold transition-all">
                        <X size={16} /> رفض العرض
                      </button>
                    </div>
                  )}

                  {offer.status !== 'pending' && (
                     <div className="mt-4 pt-3 border-t border-purple-800/30">
                        <p className="text-xs text-center text-purple-400/50">
                           {offer.status === 'approved' ? 'تم النشر في القناة بنجاح' : 'تم الرفض ولم يتم النشر'}
                        </p>
                     </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        
      </div>
    </div>
  );
}
