import { useState, useEffect } from "react";
import { 
  Moon, 
  Sun, 
  Monitor, 
  Globe, 
  Bell, 
  Shield, 
  User, 
  CreditCard, 
  Mail, 
  Check,
  ChevronRight,
  Database,
  Eye,
  Lock,
  Image as ImageIcon,
  Upload as UploadIcon,
  Trash2
} from "lucide-react";
import { motion } from "motion/react";

interface Props {
  theme: 'light' | 'dark' | 'system';
  onThemeChange: (theme: 'light' | 'dark' | 'system') => void;
  currency: string;
  onCurrencyChange: (currency: string) => void;
  dateFormat: string;
  onDateFormatChange: (format: string) => void;
  onExportData: () => void;
  onResetData: () => void;
  companyLogo: string | null;
  onCompanyLogoChange: (logo: string | null) => void;
}

export default function SettingsView({ 
  theme, 
  onThemeChange, 
  currency, 
  onCurrencyChange, 
  dateFormat, 
  onDateFormatChange,
  onExportData,
  onResetData,
  companyLogo,
  onCompanyLogoChange
}: Props) {
  const [notifications, setNotifications] = useState({
    lowBalance: true,
    largeTransaction: true,
    reportReady: true,
    weeklySummary: false
  });

  const toggleNotification = (key: keyof typeof notifications) => {
    setNotifications(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== 'image/jpeg' && file.type !== 'image/jpg') {
        alert("Please upload a JPG image.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        onCompanyLogoChange(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="max-w-4xl mx-auto pb-20">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Settings</h1>
        <p className="text-slate-500 dark:text-slate-400">Manage your account preferences and system configuration.</p>
      </div>

      <div className="space-y-6">
        {/* Company Branding Section */}
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
            <div className="w-8 h-8 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex items-center justify-center">
              <ImageIcon className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
            <h2 className="font-semibold text-slate-900 dark:text-white">Company Branding</h2>
          </div>
          <div className="p-6">
            <div className="flex flex-col md:flex-row items-start md:items-center gap-8">
              <div className="relative group">
                <div className="w-32 h-32 bg-slate-100 dark:bg-slate-800 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 flex items-center justify-center overflow-hidden">
                  {companyLogo ? (
                    <img src={companyLogo} alt="Company Logo" className="w-full h-full object-contain" />
                  ) : (
                    <ImageIcon className="w-10 h-10 text-slate-300 dark:text-slate-600" />
                  )}
                </div>
                {companyLogo && (
                  <button 
                    onClick={() => onCompanyLogoChange(null)}
                    className="absolute -top-2 -right-2 w-8 h-8 bg-rose-500 text-white rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="flex-1 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">Company Logo</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Upload your company logo to be used in reports and dashboards. Recommended format: JPG, max size 2MB.</p>
                </div>
                <div className="flex items-center gap-3">
                  <label className="cursor-pointer px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition-all flex items-center gap-2">
                    <UploadIcon className="w-3.5 h-3.5" />
                    {companyLogo ? "Change Logo" : "Upload Logo"}
                    <input type="file" accept="image/jpeg,image/jpg" className="hidden" onChange={handleLogoUpload} />
                  </label>
                  {companyLogo && (
                    <button 
                      onClick={() => onCompanyLogoChange(null)}
                      className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-lg text-xs font-bold hover:bg-rose-50 dark:hover:bg-rose-900/20 hover:text-rose-600 transition-all flex items-center gap-2"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remove Logo
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Appearance Section */}
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center">
              <Eye className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h2 className="font-semibold text-slate-900 dark:text-white">Appearance</h2>
          </div>
          <div className="p-6 space-y-6">
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-4 block">Interface Theme</label>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { id: 'light', label: 'Light', icon: Sun },
                  { id: 'dark', label: 'Dark', icon: Moon },
                  { id: 'system', label: 'System', icon: Monitor }
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => onThemeChange(item.id as any)}
                    className={`flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                      theme === item.id 
                        ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-500/10" 
                        : "border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 bg-white dark:bg-slate-900"
                    }`}
                  >
                    <item.icon className={`w-5 h-5 ${theme === item.id ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500"}`} />
                    <span className={`text-xs font-bold ${theme === item.id ? "text-emerald-700 dark:text-emerald-300" : "text-slate-600 dark:text-slate-400"}`}>
                      {item.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Localization Section */}
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center">
              <Globe className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h2 className="font-semibold text-slate-900 dark:text-white">Localization</h2>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">Default Currency</label>
              <select 
                value={currency}
                onChange={(e) => onCurrencyChange(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 outline-none dark:text-white"
              >
                <option value="USD">USD - US Dollar ($)</option>
                <option value="EUR">EUR - Euro (€)</option>
                <option value="GBP">GBP - British Pound (£)</option>
                <option value="CAD">CAD - Canadian Dollar (C$)</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">Date Format</label>
              <select 
                value={dateFormat}
                onChange={(e) => onDateFormatChange(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 outline-none dark:text-white"
              >
                <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
              </select>
            </div>
          </div>
        </section>

        {/* Notifications Section */}
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
            <div className="w-8 h-8 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex items-center justify-center">
              <Bell className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
            <h2 className="font-semibold text-slate-900 dark:text-white">Notifications</h2>
          </div>
          <div className="p-6 space-y-4">
            {[
              { id: 'lowBalance', label: 'Low Balance Alerts', desc: 'Notify when account balance falls below threshold' },
              { id: 'largeTransaction', label: 'Large Transaction Alerts', desc: 'Notify for transactions exceeding $50,000' },
              { id: 'reportReady', label: 'Report Ready', desc: 'Notify when scheduled reports are generated' },
              { id: 'weeklySummary', label: 'Weekly Summary', desc: 'Receive a weekly liquidity summary email' }
            ].map((item) => (
              <div key={item.id} className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{item.label}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{item.desc}</p>
                </div>
                <button
                  onClick={() => toggleNotification(item.id as any)}
                  className={`w-12 h-6 rounded-full transition-all relative ${
                    notifications[item.id as keyof typeof notifications] ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-700"
                  }`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${
                    notifications[item.id as keyof typeof notifications] ? "left-7" : "left-1"
                  }`} />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Security Section */}
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
            <div className="w-8 h-8 bg-rose-100 dark:bg-rose-900/30 rounded-lg flex items-center justify-center">
              <Shield className="w-4 h-4 text-rose-600 dark:text-rose-400" />
            </div>
            <h2 className="font-semibold text-slate-900 dark:text-white">Security</h2>
          </div>
          <div className="p-6 space-y-4">
            <button className="w-full flex items-center justify-between p-4 rounded-xl border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all group">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center">
                  <Lock className="w-5 h-5 text-slate-500" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">Change Password</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Last changed 3 months ago</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-600 transition-all" />
            </button>
            <button className="w-full flex items-center justify-between p-4 rounded-xl border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all group">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center">
                  <Shield className="w-5 h-5 text-slate-500" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">Two-Factor Authentication</p>
                  <p className="text-xs text-emerald-500 font-medium">Enabled</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-600 transition-all" />
            </button>
          </div>
        </section>

        {/* Data Management */}
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
              <Database className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <h2 className="font-semibold text-slate-900 dark:text-white">Data Management</h2>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Export System Data</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Download all your projections and settings as JSON</p>
              </div>
              <button 
                onClick={onExportData}
                className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
              >
                Export
              </button>
            </div>
            <div className="flex items-center justify-between p-4 bg-rose-50 dark:bg-rose-900/10 rounded-xl border border-rose-100 dark:border-rose-900/20">
              <div>
                <p className="text-sm font-semibold text-rose-900 dark:text-rose-400">Reset All Data</p>
                <p className="text-xs text-rose-600 dark:text-rose-500">Permanently delete all manual overrides and reports</p>
              </div>
              <button 
                onClick={onResetData}
                className="px-4 py-2 bg-rose-600 text-white rounded-lg text-xs font-bold hover:bg-rose-700 transition-all"
              >
                Reset
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
