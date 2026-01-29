"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase"; 
import { doc, setDoc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { Loader2, ShieldCheck, Upload, ArrowRight, User, Mail, Phone, AlertCircle } from "lucide-react";
import Header from "@/components/Header";

export default function AgentApply() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [user, setUser] = useState(null);
  const [applicationStatus, setApplicationStatus] = useState(null);
  const [rejectedAt, setRejectedAt] = useState(null);

  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phone: "",
    country: "United States",
    age: "",
  });

  const [files, setFiles] = useState({
    passport: null,
    identity: null,
  });

  // Complete Countries from your agent_apply.php
  const countries = ["Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda", "Argentina", "Armenia", "Australia", "Austria", "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bhutan", "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria", "Burkina Faso", "Burundi", "Cabo Verde", "Cambodia", "Cameroon", "Canada", "Central African Republic", "Chad", "Chile", "China", "Colombia", "Comoros", "Congo", "Costa Rica", "Croatia", "Cuba", "Cyprus", "Czech Republic", "Denmark", "Djibouti", "Dominica", "Dominican Republic", "Ecuador", "Egypt", "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini", "Ethiopia", "Fiji", "Finland", "France", "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Grenada", "Guatemala", "Guinea", "Guinea-Bissau", "Guyana", "Haiti", "Honduras", "Hungary", "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland", "Israel", "Italy", "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kiribati", "Korea, North", "Korea, South", "Kosovo", "Kuwait", "Kyrgyzstan", "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya", "Liechtenstein", "Lithuania", "Luxembourg", "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands", "Mauritania", "Mauritius", "Mexico", "Micronesia", "Moldova", "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique", "Myanmar", "Namibia", "Nauru", "Nepal", "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria", "North Macedonia", "Norway", "Oman", "Pakistan", "Palau", "Palestine", "Panama", "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Poland", "Portugal", "Qatar", "Romania", "Russia", "Rwanda", "Saint Kitts and Nevis", "Saint Lucia", "Saint Vincent", "Samoa", "San Marino", "Sao Tome and Principe", "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Slovakia", "Slovenia", "Solomon Islands", "Somalia", "South Africa", "South Sudan", "Spain", "Sri Lanka", "Sudan", "Suriname", "Sweden", "Switzerland", "Syria", "Taiwan", "Tajikistan", "Tanzania", "Thailand", "Timor-Leste", "Togo", "Tonga", "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan", "Tuvalu", "Uganda", "Ukraine", "United Arab Emirates", "United Kingdom", "United States", "Uruguay", "Uzbekistan", "Vanuatu", "Vatican City", "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabwe"];

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        router.push("/login");
      } else {
        setUser(currentUser);
        const unsubDoc = onSnapshot(doc(db, "agents", currentUser.uid), (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            setApplicationStatus(data.application_status);
            setRejectedAt(data.rejected_at?.toDate());
          }
          setLoading(false);
        });
        return () => unsubDoc();
      }
    });
    return () => unsubscribe();
  }, [router]);

  // Cloudinary Upload using your Cloud Name
  const uploadToCloudinary = async (file) => {
    const data = new FormData();
    data.append("file", file);
    data.append("upload_preset", "flyova_unsigned"); 
    data.append("cloud_name", "dbcggpk8o");

    const res = await fetch(`https://api.cloudinary.com/v1_1/dbcggpk8o/image/upload`, {
      method: "POST",
      body: data,
    });
    
    if (!res.ok) throw new Error("Cloudinary Upload Failed");
    const fileData = await res.json();
    return fileData.secure_url;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!files.passport || !files.identity) return alert("Please upload both photos");

    setSubmitting(true);
    try {
      const passUrl = await uploadToCloudinary(files.passport);
      const idUrl = await uploadToCloudinary(files.identity);

      await setDoc(doc(db, "agents", user.uid), {
        user_id: user.uid,
        full_name: formData.fullName,
        email: formData.email,
        phone_number: formData.phone,
        country: formData.country,
        age: formData.age,
        passport_photo: passUrl,
        identity_card: idUrl,
        application_status: "pending",
        applied_at: serverTimestamp(),
        banned: false,
        withdrawal_rate: 0,
        exchange_rate: 0
      });

      // Mark user profile
      await setDoc(doc(db, "users", user.uid), { hasApplied: true }, { merge: true });

    } catch (err) {
      console.error(err);
      alert("Submission Error: Check your internet or Cloudinary preset name.");
    } finally {
      setSubmitting(false);
    }
  };

  // Check if rejection was more than 24 hours ago
  const canReapply = () => {
    if (!rejectedAt) return true;
    const hoursSinceRejection = (new Date() - rejectedAt) / (1000 * 60 * 60);
    return hoursSinceRejection >= 24;
  };

  if (loading) return <div className="min-h-screen bg-[#0f172a] flex items-center justify-center"><Loader2 className="animate-spin text-[#613de6]" size={40} /></div>;

  // View for Pending Status
  if (applicationStatus === "pending") {
    return (
      <div className="min-h-screen bg-[#0f172a] text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-[#fc7952]/10 p-8 rounded-full mb-6"><Loader2 className="animate-spin text-[#fc7952]" size={50} /></div>
        <h1 className="text-2xl font-black italic uppercase">Application Pending</h1>
        <p className="text-gray-400 text-xs max-w-xs mb-8 tracking-widest leading-relaxed">Verification usually takes 2-24 hours. We will notify you once approved.</p>
        <button onClick={() => router.push('/dashboard')} className="bg-white/5 px-8 py-3 rounded-xl text-[10px] font-black uppercase border border-white/10">Back to Dashboard</button>
      </div>
    );
  }

  // View for Rejected (within 24 hours)
  if (applicationStatus === "rejected" && !canReapply()) {
    return (
      <div className="min-h-screen bg-[#0f172a] text-white flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle size={60} className="text-red-500 mb-6" />
        <h1 className="text-2xl font-black italic uppercase">Application Rejected</h1>
        <p className="text-gray-400 text-xs max-w-xs mb-8 uppercase font-bold tracking-tighter">
          Your application was rejected. Please wait 24 hours before trying again.
        </p>
        <button onClick={() => router.push('/dashboard')} className="bg-white/5 px-8 py-3 rounded-xl text-[10px] font-black uppercase border border-white/10">Back to Dashboard</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f172a] text-white pb-20">
      
      <main className="pt-6 px-6 max-w-xl mx-auto">
        <div className="flex items-center gap-4 mb-10">
          <div className="bg-[#613de6] p-4 rounded-2xl shadow-xl shadow-[#613de6]/20"><ShieldCheck size={28} /></div>
          <div>
            <h1 className="text-2xl font-black italic uppercase tracking-tighter">Agent Registration</h1>
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">SIGN UP</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 bg-[#1e293b] p-8 rounded-[2.5rem] border border-white/5 shadow-2xl">
          {applicationStatus === "rejected" && (
            <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl text-[10px] font-bold text-red-400 uppercase text-center mb-4">
              Your previous application was rejected. You may now re-apply with better documents.
            </div>
          )}

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-gray-500 ml-2">Full Legal Name</label>
            <div className="relative">
              <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
              <input required className="w-full bg-[#0f172a] border border-white/5 p-4 pl-12 rounded-2xl text-sm outline-none font-bold focus:border-[#613de6]" 
              placeholder="Your Name" value={formData.fullName} onChange={(e) => setFormData({...formData, fullName: e.target.value})} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative">
              <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
              <input required type="email" placeholder="Email" className="w-full bg-[#0f172a] border border-white/5 p-4 pl-12 rounded-2xl text-sm font-bold outline-none" 
              value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} />
            </div>
            <div className="relative">
              <Phone size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
              <input required type="tel" placeholder="Phone" className="w-full bg-[#0f172a] border border-white/5 p-4 pl-12 rounded-2xl text-sm font-bold outline-none" 
              value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <select className="bg-[#0f172a] border border-white/5 p-4 rounded-2xl text-sm font-bold outline-none" 
            value={formData.country} onChange={(e) => setFormData({...formData, country: e.target.value})}>
                {countries.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input required type="number" placeholder="Age" className="bg-[#0f172a] border border-white/5 p-4 rounded-2xl text-sm font-bold outline-none" 
            value={formData.age} onChange={(e) => setFormData({...formData, age: e.target.value})} />
          </div>

          <div className="grid grid-cols-1 gap-3 border-t border-white/10 pt-4">
            <p className="text-[9px] font-black text-gray-500 uppercase text-center mb-1">Documents (Cloudinary Upload)</p>
            <label className={`flex items-center justify-between p-4 rounded-2xl border border-dashed transition-all cursor-pointer ${files.passport ? 'bg-green-500/10 border-green-500/50' : 'bg-[#0f172a] border-white/10'}`}>
                <input type="file" className="hidden" accept="image/*" onChange={(e) => setFiles({...files, passport: e.target.files[0]})} />
                <span className="text-[10px] font-black uppercase text-gray-400">{files.passport ? "✅ Passport Loaded" : "Passport Photograph"}</span>
                <Upload size={18} className="text-[#613de6]" />
            </label>
            <label className={`flex items-center justify-between p-4 rounded-2xl border border-dashed transition-all cursor-pointer ${files.identity ? 'bg-green-500/10 border-green-500/50' : 'bg-[#0f172a] border-white/10'}`}>
                <input type="file" className="hidden" accept="image/*" onChange={(e) => setFiles({...files, identity: e.target.files[0]})} />
                <span className="text-[10px] font-black uppercase text-gray-400">{files.identity ? "✅ ID Card Loaded" : "National ID Card"}</span>
                <Upload size={18} className="text-[#613de6]" />
            </label>
          </div>

          <button type="submit" disabled={submitting} className="w-full bg-[#fc7952] py-5 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-[#fc7952]/20 active:scale-95 transition-all flex items-center justify-center gap-3">
            {submitting ? <><Loader2 className="animate-spin" size={18} /><span>Processing...</span></> : <><span>Submit Application</span><ArrowRight size={18} /></>}
          </button>
        </form>
      </main>
    </div>
  );
}