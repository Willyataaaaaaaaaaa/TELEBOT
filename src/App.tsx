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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 font-sans" dir="rtl">
      <div className="max-w-4xl w-full bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100 flex flex-col md:flex-row">
        
        {/* Sidebar / Info */}
        <div className="bg-gradient-to-tr from-blue-600 to-indigo-700 p-8 text-white relative overflow-hidden md:w-1/3 flex flex-col items-center text-center justify-center">
          <div className="absolute top-0 left-0 w-full h-full bg-white opacity-5 pattern-grid-lg mix-blend-overlay"></div>
          <div className="relative z-10 flex flex-col items-center">
            <div className="p-4 bg-white/20 rounded-full backdrop-blur-md mb-4 ring-2 ring-white/50 shadow-lg">
              <Bot size={48} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight mb-2">السيرفر الخاص</h1>
            <p className="text-blue-100 font-medium text-sm">استقبال ومراجعة العروض الخاصة بالبوت</p>

            <div className="mt-8 flex items-center gap-2">
              {botStatus === 'Running' ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/20 rounded-full text-sm font-semibold shadow-sm backdrop-blur">
                  <CheckCircle2 size={16} className="text-emerald-300"/> البوت يعمل
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-black/20 rounded-full text-sm font-semibold shadow-sm backdrop-blur">
                  <AlertCircle size={16} className="text-rose-300"/> متوقف أو خطأ
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Dashboard Content */}
        <div className="p-8 pb-8 md:w-2/3 bg-white w-full max-h-[80vh] overflow-y-auto">
          <h2 className="text-xl font-bold text-gray-800 border-b pb-4 mb-6">أحدث العروض الواردة</h2>

          {offers.length === 0 ? (
            <div className="text-center py-12 flex flex-col items-center">
              <Clock className="w-12 h-12 text-gray-300 mb-3" />
              <p className="text-gray-500 font-medium">لا توجد عروض حالياً...</p>
              <p className="text-gray-400 text-sm mt-1">عندما يقدم شخص عرضاً في البوت، سيظهر هنا.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {offers.map((offer) => (
                <div key={offer.id} className="border border-gray-100 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
                  {/* Status Indicator */}
                  <div className={`absolute left-0 top-0 w-1 h-full \${
                    offer.status === 'pending' ? 'bg-amber-400' :
                    offer.status === 'approved' ? 'bg-emerald-500' : 'bg-rose-500'
                  }`}></div>

                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <span className="inline-flex px-2 flex-shrink-0 text-xs font-semibold rounded-md bg-blue-50 text-blue-700 mb-2">
                        {offer.platform}
                      </span>
                      <h3 className="font-bold text-gray-800 text-lg">مقدم من: {offer.username}</h3>
                    </div>
                    {/* Status Badge */}
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium \${
                      offer.status === 'pending' ? 'bg-amber-100 text-amber-800' :
                      offer.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                    }`}>
                      {offer.status === 'pending' && <><Clock size={12}/> بانتظار المراجعة</>}
                      {offer.status === 'approved' && <><Check size={12}/> تمت الموافقة</>}
                      {offer.status === 'rejected' && <><X size={12}/> تم الرفض</>}
                    </span>
                  </div>

                  <p className="text-sm text-gray-500 mt-2">
                    <span className="font-semibold text-gray-700">تاريخ التقديم:</span> {new Date(offer.createdAt).toLocaleString()}
                  </p>

                  {offer.status === 'pending' && (
                    <div className="mt-4 pt-3 border-t border-gray-100 flex items-center gap-2 mt-2">
                      <button 
                        onClick={() => handleApprove(offer.id)}
                        className="flex-1 flex justify-center items-center gap-1 bg-emerald-500 hover:bg-emerald-600 text-white py-2 rounded-lg text-sm font-semibold transition">
                        <Check size={16} /> موافقة ونشر
                      </button>
                      <button 
                        onClick={() => handleReject(offer.id)}
                        className="flex-1 flex justify-center items-center gap-1 bg-rose-50 hover:bg-rose-100 text-rose-700 py-2 rounded-lg text-sm font-semibold transition">
                        <X size={16} /> رفض العرض
                      </button>
                    </div>
                  )}

                  {offer.status !== 'pending' && (
                     <div className="mt-4 pt-3 border-t border-gray-100">
                        <p className="text-xs text-center text-gray-400">
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
