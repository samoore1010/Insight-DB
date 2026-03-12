import { useState } from "react";
import {
  Moon,
  Sun,
  Monitor,
  Globe,
  Bell,
  Shield,
  ChevronRight,
  Database,
  Eye,
  Lock,
  Image as ImageIcon,
  Upload as UploadIcon,
  Trash2,
  MapPin,
  Plus,
  X,
  Users,
  UserPlus,
  Check,
  LogOut
} from "lucide-react";
import { EXECUTIVE_ENTITY } from "../types";
import type { User } from "../auth";

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
  regions: string[];
  onAddRegion: (name: string) => void;
  onDeleteRegion: (name: string) => void;
  currentUser?: User | null;
  allUsers?: User[];
  onCreateUser?: (username: string, password: string, displayName: string, role: "admin" | "viewer", allowedRegions: string[]) => Promise<{ success: boolean; error?: string }>;
  onUpdateUser?: (id: string, updates: { displayName?: string; role?: "admin" | "viewer"; allowedRegions?: string[]; password?: string }) => Promise<{ success: boolean; error?: string }>;
  onDeleteUser?: (id: string) => Promise<{ success: boolean; error?: string }>;
  onLogout?: () => void;
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
  onCompanyLogoChange,
  regions,
  onAddRegion,
  onDeleteRegion,
  currentUser,
  allUsers,
  onCreateUser,
  onUpdateUser,
  onDeleteUser,
  onLogout
}: Props) {
  const [notifications, setNotifications] = useState({
    lowBalance: true,
    largeTransaction: true,
    reportReady: true,
    weeklySummary: false
  });

  const [newRegionName, setNewRegionName] = useState("");
  const [confirmDeleteRegion, setConfirmDeleteRegion] = useState<string | null>(null);
  const [confirmAddRegion, setConfirmAddRegion] = useState(false);

  // User management state
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUser, setNewUser] = useState({ username: "", password: "", displayName: "", role: "viewer" as "admin" | "viewer" });
  const [newUserRegions, setNewUserRegions] = useState<string[]>([]);
  const [createError, setCreateError] = useState("");
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editRegions, setEditRegions] = useState<string[]>([]);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");

  const isAdmin = currentUser?.role === "admin";

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

  const handleAddRegion = () => {
    const trimmed = newRegionName.trim();
    if (!trimmed) return;
    if (regions.includes(trimmed) || trimmed === EXECUTIVE_ENTITY) {
      alert("Region name already exists or is reserved.");
      return;
    }
    setConfirmAddRegion(true);
  };

  const handleConfirmAdd = () => {
    onAddRegion(newRegionName.trim());
    setNewRegionName("");
    setConfirmAddRegion(false);
  };

  const handleConfirmDelete = (name: string) => {
    onDeleteRegion(name);
    setConfirmDeleteRegion(null);
  };

  return (
    <div className="max-w-4xl mx-auto pb-20">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Settings</h1>
        <p className="text-slate-500 dark:text-slate-400">Manage your account preferences and system configuration.</p>
      </div>

      <div className="space-y-6">
        {/* Region Management Section */}
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
            <div className="w-8 h-8 bg-violet-100 dark:bg-violet-900/30 rounded-lg flex items-center justify-center">
              <MapPin className="w-4 h-4 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900 dark:text-white">Region Management</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Add or remove regional entities. Executive view cannot be removed.</p>
            </div>
          </div>
          <div className="p-6 space-y-4">
            {/* Existing regions list */}
            <div className="space-y-2">
              {/* Executive — always present, not deletable */}
              <div className="flex items-center justify-between p-3 bg-emerald-50 dark:bg-emerald-900/10 rounded-xl border border-emerald-100 dark:border-emerald-900/20">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center">
                    <Globe className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">Executive</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">Consolidated view (all regions)</p>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30 px-2 py-1 rounded-md uppercase tracking-wider">
                  Protected
                </span>
              </div>

              {/* Dynamic regions */}
              {regions.map(region => (
                <div key={region} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center">
                      <MapPin className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                    </div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{region}</p>
                  </div>
                  {confirmDeleteRegion === region ? (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-rose-600 dark:text-rose-400 font-bold">Delete?</span>
                      <button
                        onClick={() => handleConfirmDelete(region)}
                        className="px-2 py-1 bg-rose-600 text-white rounded-md text-[10px] font-bold hover:bg-rose-700 transition-all"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setConfirmDeleteRegion(null)}
                        className="px-2 py-1 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-md text-[10px] font-bold hover:bg-slate-300 dark:hover:bg-slate-600 transition-all"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteRegion(region)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Add new region */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={newRegionName}
                  onChange={(e) => { setNewRegionName(e.target.value); setConfirmAddRegion(false); }}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAddRegion(); }}
                  placeholder="New region name..."
                  className="flex-1 px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-violet-500 outline-none dark:text-white placeholder:text-slate-400"
                />
                {confirmAddRegion ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-violet-600 dark:text-violet-400 font-bold whitespace-nowrap">Add "{newRegionName.trim()}"?</span>
                    <button
                      onClick={handleConfirmAdd}
                      className="px-3 py-2 bg-violet-600 text-white rounded-lg text-[10px] font-bold hover:bg-violet-700 transition-all"
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setConfirmAddRegion(false)}
                      className="px-3 py-2 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-[10px] font-bold hover:bg-slate-300 dark:hover:bg-slate-600 transition-all"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleAddRegion}
                    disabled={!newRegionName.trim()}
                    className="px-4 py-2.5 bg-violet-600 text-white rounded-xl text-xs font-bold hover:bg-violet-700 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Region
                  </button>
                )}
              </div>
            </div>

            <p className="text-[10px] text-slate-400 dark:text-slate-500">
              Adding a region creates a new dashboard tab, initializes default estimates, and includes it in Executive consolidation. Deleting removes all associated data.
            </p>
          </div>
        </section>

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

        {/* User Management Section - Admin only */}
        {isAdmin && allUsers && onCreateUser && onUpdateUser && onDeleteUser && (
          <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
              <div className="w-8 h-8 bg-violet-100 dark:bg-violet-900/30 rounded-lg flex items-center justify-center">
                <Users className="w-4 h-4 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <h2 className="font-semibold text-slate-900 dark:text-white">User Management</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">Manage users and their region access permissions.</p>
              </div>
            </div>
            <div className="p-6 space-y-4">
              {/* Existing users */}
              <div className="space-y-2">
                {allUsers.map(user => (
                  <div key={user.id} className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white ${user.role === "admin" ? "bg-amber-500" : "bg-slate-500"}`}>
                          {user.displayName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">{user.displayName}</p>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400">@{user.username} &middot; {user.role === "admin" ? "Admin" : "Viewer"}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {user.id !== currentUser?.id && (
                          <>
                            {editingUserId === user.id ? (
                              <button
                                onClick={async () => {
                                  await onUpdateUser(user.id, { allowedRegions: editRegions });
                                  setEditingUserId(null);
                                }}
                                className="px-2.5 py-1 bg-emerald-600 text-white rounded-lg text-[10px] font-bold hover:bg-emerald-700 transition-all flex items-center gap-1"
                              >
                                <Check className="w-3 h-3" />
                                Save
                              </button>
                            ) : (
                              <button
                                onClick={() => { setEditingUserId(user.id); setEditRegions(user.allowedRegions || []); }}
                                className="px-2.5 py-1 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-[10px] font-bold hover:bg-slate-300 dark:hover:bg-slate-600 transition-all"
                              >
                                Edit Regions
                              </button>
                            )}
                            {confirmDeleteUser === user.id ? (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={async () => {
                                    const result = await onDeleteUser(user.id);
                                    if (!result.success) setDeleteError(result.error || "Failed");
                                    setConfirmDeleteUser(null);
                                  }}
                                  className="px-2 py-1 bg-rose-600 text-white rounded-md text-[10px] font-bold"
                                >
                                  Yes
                                </button>
                                <button
                                  onClick={() => setConfirmDeleteUser(null)}
                                  className="px-2 py-1 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-md text-[10px] font-bold"
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmDeleteUser(user.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-all"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </>
                        )}
                        {user.id === currentUser?.id && (
                          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30 px-2 py-1 rounded-md uppercase tracking-wider">You</span>
                        )}
                      </div>
                    </div>

                    {/* Region toggles when editing */}
                    {editingUserId === user.id && (
                      <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Allowed Regions (empty = all regions)</p>
                        <div className="flex flex-wrap gap-2">
                          {regions.map(region => {
                            const isAllowed = editRegions.includes(region);
                            return (
                              <button
                                key={region}
                                onClick={() => {
                                  setEditRegions(prev =>
                                    isAllowed ? prev.filter(r => r !== region) : [...prev, region]
                                  );
                                }}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                  isAllowed
                                    ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
                                    : "bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700"
                                }`}
                              >
                                {region}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Show assigned regions when not editing */}
                    {editingUserId !== user.id && user.allowedRegions && user.allowedRegions.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {user.allowedRegions.map(r => (
                          <span key={r} className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded text-[10px] font-bold">{r}</span>
                        ))}
                      </div>
                    )}
                    {editingUserId !== user.id && (!user.allowedRegions || user.allowedRegions.length === 0) && (
                      <p className="mt-1 text-[10px] text-slate-400">Access: All regions</p>
                    )}
                  </div>
                ))}
              </div>

              {deleteError && (
                <p className="text-xs text-rose-500 font-bold">{deleteError}</p>
              )}

              {/* Create new user form */}
              {showCreateUser ? (
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-slate-900 dark:text-white">Create New User</p>
                    <button onClick={() => { setShowCreateUser(false); setCreateError(""); }} className="p-1 text-slate-400 hover:text-slate-600 rounded">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {createError && <p className="text-xs text-rose-500 font-bold">{createError}</p>}
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      placeholder="Username"
                      value={newUser.username}
                      onChange={e => setNewUser(prev => ({ ...prev, username: e.target.value }))}
                      className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-violet-500 dark:text-white placeholder:text-slate-400"
                    />
                    <input
                      type="password"
                      placeholder="Password"
                      value={newUser.password}
                      onChange={e => setNewUser(prev => ({ ...prev, password: e.target.value }))}
                      className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-violet-500 dark:text-white placeholder:text-slate-400"
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="Display Name"
                    value={newUser.displayName}
                    onChange={e => setNewUser(prev => ({ ...prev, displayName: e.target.value }))}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-violet-500 dark:text-white placeholder:text-slate-400"
                  />
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Role</label>
                    <div className="flex gap-2">
                      {(["viewer", "admin"] as const).map(role => (
                        <button
                          key={role}
                          onClick={() => setNewUser(prev => ({ ...prev, role }))}
                          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                            newUser.role === role
                              ? "bg-violet-600 text-white"
                              : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                          }`}
                        >
                          {role.charAt(0).toUpperCase() + role.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Allowed Regions (empty = all)</label>
                    <div className="flex flex-wrap gap-2">
                      {regions.map(region => {
                        const isSelected = newUserRegions.includes(region);
                        return (
                          <button
                            key={region}
                            onClick={() => setNewUserRegions(prev => isSelected ? prev.filter(r => r !== region) : [...prev, region])}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                              isSelected
                                ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
                                : "bg-white dark:bg-slate-900 text-slate-400 border border-slate-200 dark:border-slate-700"
                            }`}
                          >
                            {region}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      setCreateError("");
                      if (!newUser.username || !newUser.password || !newUser.displayName) {
                        setCreateError("All fields are required");
                        return;
                      }
                      const result = await onCreateUser(newUser.username, newUser.password, newUser.displayName, newUser.role, newUserRegions);
                      if (result.success) {
                        setShowCreateUser(false);
                        setNewUser({ username: "", password: "", displayName: "", role: "viewer" });
                        setNewUserRegions([]);
                      } else {
                        setCreateError(result.error || "Failed to create user");
                      }
                    }}
                    className="w-full py-2.5 bg-violet-600 text-white rounded-lg text-xs font-bold hover:bg-violet-700 transition-all"
                  >
                    Create User
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowCreateUser(true)}
                  className="w-full py-3 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-400 hover:text-violet-600 hover:border-violet-300 dark:hover:border-violet-700 transition-all flex items-center justify-center gap-2"
                >
                  <UserPlus className="w-4 h-4" />
                  Add New User
                </button>
              )}
            </div>
          </section>
        )}

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

        {/* Logout */}
        {onLogout && (
          <button
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-2xl text-sm font-bold hover:bg-rose-50 dark:hover:bg-rose-900/20 hover:text-rose-600 dark:hover:text-rose-400 transition-all border border-slate-200 dark:border-slate-800"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        )}
      </div>
    </div>
  );
}
