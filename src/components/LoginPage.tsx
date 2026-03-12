import { useState, useEffect, useCallback } from "react";
import { Building2, Lock, User, Eye, EyeOff, AlertCircle, MapPin, ChevronDown } from "lucide-react";
import { motion } from "motion/react";

interface Department {
  id: string;
  name: string;
}

interface LocationInfo {
  locations: string[];
  defaultLocation: string;
}

interface Props {
  onLogin: (username: string, password: string, location: string) => Promise<{ success: boolean; error?: string }>;
}

export default function LoginPage({ onLogin }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [location, setLocation] = useState("executive");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [allowedLocations, setAllowedLocations] = useState<string[] | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/departments")
      .then(res => res.json())
      .then(data => setDepartments(data))
      .catch(() => {});
  }, []);

  // Fetch allowed locations when username changes (debounced on blur)
  const fetchAllowedLocations = useCallback(async (uname: string) => {
    if (!uname.trim()) {
      setAllowedLocations(null);
      return;
    }
    try {
      const res = await fetch(`/api/auth/locations/${encodeURIComponent(uname.trim())}`);
      if (res.ok) {
        const data: LocationInfo = await res.json();
        setAllowedLocations(data.locations);
        // Auto-select the user's default location
        if (data.defaultLocation) {
          setLocation(data.defaultLocation);
        }
      }
    } catch {
      // Silently fail — dropdown will show all locations as fallback
    }
  }, []);

  // Determine which locations to show in the dropdown
  const availableLocations = allowedLocations
    ? allowedLocations
    : ["executive", ...departments.map(d => d.name)];

  const getLocationLabel = (loc: string) => {
    if (loc === "executive") return "Executive";
    return loc.charAt(0).toUpperCase() + loc.slice(1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setError("");
    setLoading(true);
    try {
      const result = await onLogin(username.trim(), password, location);
      if (!result.success) {
        setError(result.error || "Invalid credentials");
      }
    } catch {
      setError("Connection failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-500/3 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative w-full max-w-md"
      >
        {/* Logo & Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-500 rounded-2xl mb-4 shadow-lg shadow-emerald-500/20">
            <Building2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Insight Treasury</h1>
          <p className="text-sm text-slate-500 mt-1">Sign in to access your dashboard</p>
        </div>

        {/* Login Form */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl"
              >
                <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                <span className="text-sm text-rose-400">{error}</span>
              </motion.div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                Username
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onBlur={(e) => fetchAllowedLocations(e.target.value)}
                  placeholder="Enter username"
                  autoFocus
                  autoComplete="username"
                  className="w-full pl-11 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder:text-slate-600 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  autoComplete="current-password"
                  className="w-full pl-11 pr-11 py-3 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder:text-slate-600 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                Location
              </label>
              <div className="relative">
                <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <select
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  disabled={allowedLocations !== null && allowedLocations.length <= 1}
                  className="w-full pl-11 pr-10 py-3 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all appearance-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {availableLocations.map(loc => (
                    <option key={loc} value={loc}>{getLocationLabel(loc)}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
              </div>
              <p className="text-[10px] text-slate-600 mt-1.5">
                {allowedLocations !== null && allowedLocations.length === 1
                  ? `You are assigned to the ${getLocationLabel(location)} dashboard`
                  : location === "executive"
                    ? "Company-wide executive dashboard"
                    : `Department dashboard for ${getLocationLabel(location)}`}
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || !username.trim() || !password}
              className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all text-sm shadow-lg shadow-emerald-500/20"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in...
                </span>
              ) : (
                "Sign In"
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-600 mt-6">
          Insight Treasury Dashboard
        </p>
      </motion.div>
    </div>
  );
}
