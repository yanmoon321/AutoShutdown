import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./styles.css";

interface ProcessInfo {
  pid: number;
  name: string;
  title: string;
  icon: string | null;
}

// 翻译字典
const translations = {
  zh: {
    runningApps: "运行中的应用",
    loading: "加载中...",
    noApps: "暂无运行的应用",
    appName: "AutoShutdown",
    selectAppHint: "请在左侧选择一个应用来设置定时关闭",
    appTimerTitle: "应用定时关闭",
    appTimerDesc: "设置指定时间后自动关闭选中的应用",
    countdown: "倒计时",
    minute: "分钟",
    shutdownAfter: "关闭后同时关机",
    startTimer: "启动定时",
    cancel: "取消",
    running: "运行中...",
    closed: "✓ 已关闭",
    cancelled: "已取消",
    sysTimerTitle: "系统定时任务",
    sysTimerDesc: "设置系统关机、重启或休眠的定时任务",
    action: "执行操作",
    shutdown: "关机",
    restart: "重启",
    sleep: "休眠",
    pleaseSelect: "请先选择一个应用！",
    invalidTime: "请输入有效的分钟数！",
    switchToLight: "切换浅色",
    switchToDark: "切换深色",
    refresh: "刷新"
  },
  en: {
    runningApps: "Running Apps",
    loading: "Loading...",
    noApps: "No running apps",
    appName: "AutoShutdown",
    selectAppHint: "Select an app from the left to schedule shutdown",
    appTimerTitle: "App Shutdown Timer",
    appTimerDesc: "Automatically close the selected app after a set time",
    countdown: "Countdown",
    minute: "min",
    shutdownAfter: "Shutdown system after app closes",
    startTimer: "Start",
    cancel: "Cancel",
    running: "Running...",
    closed: "✓ Closed",
    cancelled: "Cancelled",
    sysTimerTitle: "System Timer",
    sysTimerDesc: "Schedule system shutdown, restart, or sleep",
    action: "Action",
    shutdown: "Shutdown",
    restart: "Restart",
    sleep: "Sleep",
    pleaseSelect: "Please select an app first!",
    invalidTime: "Please enter a valid number!",
    switchToLight: "Switch to Light Mode",
    switchToDark: "Switch to Dark Mode",
    refresh: "Refresh"
  }
};

type Language = 'zh' | 'en';

function App() {
  const [apps, setApps] = useState<ProcessInfo[]>([]);
  const [selectedApp, setSelectedApp] = useState<ProcessInfo | null>(null);
  const [appMinutes, setAppMinutes] = useState("30");
  const [sysMinutes, setSysMinutes] = useState("60");
  const [sysAction, setSysAction] = useState("shutdown"); // 存储英文 key
  const [shutdownAfter, setShutdownAfter] = useState(false);
  const [appTimer, setAppTimer] = useState(0);
  const [sysTimer, setSysTimer] = useState(0);
  const [appStatus, setAppStatus] = useState("");
  const [sysStatus, setSysStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [isDark, setIsDark] = useState(false);
  const [lang, setLang] = useState<Language>('zh'); // 默认一种语言，初始化在 useEffect 中检测
  
  const appIntervalRef = useRef<number | null>(null);
  const sysIntervalRef = useRef<number | null>(null);

  // 初始化语言
  useEffect(() => {
    const sysLang = navigator.language;
    if (sysLang.toLowerCase().startsWith('zh')) {
      setLang('zh');
    } else {
      setLang('en');
    }
  }, []);

  const t = (key: keyof typeof translations.zh) => {
    return translations[lang][key];
  };

  // 主题切换
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  const loadApps = async () => {
    try {
      setLoading(true);
      const result = await invoke<ProcessInfo[]>("get_running_apps");
      setApps(result);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadApps();
    
    // 监听窗口变化事件
    let unlisten: (() => void) | undefined;
    
    import('@tauri-apps/api/event').then(({ listen }) => {
      listen('window-changed', () => {
        loadApps();
      }).then(fn => {
        unlisten = fn;
      });
    });
    
    // 备用：每 30 秒刷新一次（以防事件丢失）
    const interval = setInterval(loadApps, 30000);
    
    return () => {
      clearInterval(interval);
      if (unlisten) unlisten();
    };
  }, []);

  const startAppTimer = () => {
    if (!selectedApp) {
      alert(t('pleaseSelect'));
      return;
    }
    const mins = parseFloat(appMinutes);
    if (isNaN(mins) || mins <= 0) {
      alert(t('invalidTime'));
      return;
    }
    setAppTimer(Math.floor(mins * 60));
    setAppStatus("");
    
    appIntervalRef.current = setInterval(() => {
      setAppTimer(prev => {
        if (prev <= 1) {
          clearInterval(appIntervalRef.current!);
          executeAppShutdown();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const executeAppShutdown = async () => {
    if (selectedApp) {
      await invoke("kill_process", { pid: selectedApp.pid });
      setAppStatus(t('closed'));
      if (shutdownAfter) {
        await invoke("system_shutdown");
      }
      loadApps();
      setSelectedApp(null);
    }
  };

  const cancelAppTimer = () => {
    if (appIntervalRef.current) clearInterval(appIntervalRef.current);
    setAppTimer(0);
    setAppStatus(t('cancelled'));
  };

  const startSysTimer = () => {
    const mins = parseFloat(sysMinutes);
    if (isNaN(mins) || mins <= 0) {
      alert(t('invalidTime'));
      return;
    }
    setSysTimer(Math.floor(mins * 60));
    setSysStatus("");
    
    sysIntervalRef.current = setInterval(() => {
      setSysTimer(prev => {
        if (prev <= 1) {
          clearInterval(sysIntervalRef.current!);
          executeSysAction();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const executeSysAction = async () => {
    if (sysAction === "shutdown") await invoke("system_shutdown");
    else if (sysAction === "restart") await invoke("system_restart");
    else if (sysAction === "sleep") await invoke("system_sleep");
  };

  const cancelSysTimer = () => {
    if (sysIntervalRef.current) clearInterval(sysIntervalRef.current);
    setSysTimer(0);
    setSysStatus(t('cancelled'));
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // 从窗口标题提取应用名称
  const getAppDisplayName = (app: ProcessInfo) => {
    const title = app.title;
    const processName = app.name.toLowerCase();
    
    if (!title) {
      return app.name.replace('.exe', '').replace('.EXE', '');
    }
    
    // 常见浏览器 - 标题格式通常是 "网页标题 - 浏览器名"
    const browsers: Record<string, string> = {
      'chrome': 'Google Chrome',
      'msedge': 'Microsoft Edge',
      'firefox': 'Firefox',
      'opera': 'Opera',
      'brave': 'Brave',
    };
    
    for (const [key, name] of Object.entries(browsers)) {
      if (processName.includes(key)) {
        return name;
      }
    }
    
    // 其他应用：如果标题包含分隔符，取第一部分
    const separators = [' - ', ' — ', ' | ', ' · '];
    for (const sep of separators) {
      if (title.includes(sep)) {
        return title.split(sep)[0].trim();
      }
    }
    
    return title;
  };

  return (
    <div className="app-container">
      {/* 侧边栏 */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>{t('runningApps')}</h2>
          <div className="header-actions">
            <button className="btn-icon" onClick={() => setIsDark(!isDark)} title={isDark ? t('switchToLight') : t('switchToDark')}>
              {isDark ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="5"/>
                  <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
                </svg>
              )}
            </button>
          </div>
        </div>
        
        <div className="app-list">
          {loading && apps.length === 0 ? (
            <div className="empty-state">{t('loading')}</div>
          ) : apps.length === 0 ? (
            <div className="empty-state">{t('noApps')}</div>
          ) : (
            apps.map(app => (
              <button
                key={app.pid}
                onClick={() => setSelectedApp(selectedApp?.pid === app.pid ? null : app)}
                className={`app-item ${selectedApp?.pid === app.pid ? 'active' : ''}`}
              >
                {app.icon ? (
                  <img src={app.icon} alt="" className="app-icon-img" />
                ) : (
                  <div className="app-icon">
                    {getAppDisplayName(app).charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="app-name">{getAppDisplayName(app)}</span>
              </button>
            ))
          )}
        </div>
      </aside>
      
      {/* 主区域 */}
      <main className="main-content">
        {/* 头部信息 - 固定高度 */}
        <div className="header-section">
          <h1>{selectedApp ? getAppDisplayName(selectedApp) : t('appName')}</h1>
          <p className="header-subtitle">{selectedApp ? selectedApp.title : t('selectAppHint')}</p>
        </div>
        
        {/* 应用定时卡片 */}
        <div className="card">
          <div className="card-header">
            <div className="card-icon blue">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 6v6l4 2"/>
              </svg>
            </div>
            <div>
              <h3>{t('appTimerTitle')}</h3>
              <p>{t('appTimerDesc')}</p>
            </div>
          </div>
          
          <div className="card-body">
            <div className="form-row">
              <div className="form-group">
                <label>{t('countdown')}</label>
                <div className="input-with-suffix">
                  <input 
                    type="number"
                    value={appMinutes}
                    onChange={e => setAppMinutes(e.target.value)}
                    min="1"
                  />
                  <span>{t('minute')}</span>
                </div>
              </div>
              
              <label className="checkbox-label">
                <input 
                  type="checkbox"
                  checked={shutdownAfter}
                  onChange={e => setShutdownAfter(e.target.checked)}
                />
                <span>{t('shutdownAfter')}</span>
              </label>
            </div>
            
            <div className="card-actions">
              <button 
                className="btn btn-primary"
                onClick={startAppTimer}
                disabled={appTimer > 0 || !selectedApp}
              >
                {appTimer > 0 ? t('running') : t('startTimer')}
              </button>
              <button className="btn btn-secondary" onClick={cancelAppTimer}>
                {t('cancel')}
              </button>
              
              <div className="timer-display">
                {appTimer > 0 ? (
                  <span className="timer blue">{formatTime(appTimer)}</span>
                ) : appStatus ? (
                  <span className="status">{appStatus}</span>
                ) : null}
              </div>
            </div>
          </div>
        </div>
        
        {/* 系统定时卡片 */}
        <div className="card">
          <div className="card-header">
            <div className="card-icon red">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="3" width="20" height="14" rx="2"/>
                <path d="M8 21h8M12 17v4"/>
              </svg>
            </div>
            <div>
              <h3>{t('sysTimerTitle')}</h3>
              <p>{t('sysTimerDesc')}</p>
            </div>
          </div>
          
          <div className="card-body">
            <div className="form-row">
              <div className="form-group">
                <label>{t('action')}</label>
                <select 
                  value={sysAction}
                  onChange={e => setSysAction(e.target.value)}
                >
                  <option value="shutdown">{t('shutdown')}</option>
                  <option value="restart">{t('restart')}</option>
                  <option value="sleep">{t('sleep')}</option>
                </select>
              </div>
              
              <div className="form-group">
                <label>{t('countdown')}</label>
                <div className="input-with-suffix">
                  <input 
                    type="number"
                    value={sysMinutes}
                    onChange={e => setSysMinutes(e.target.value)}
                    min="1"
                  />
                  <span>{t('minute')}</span>
                </div>
              </div>
            </div>
            
            <div className="card-actions">
              <button 
                className="btn btn-danger"
                onClick={startSysTimer}
                disabled={sysTimer > 0}
              >
                {sysTimer > 0 ? t('running') : t('startTimer')}
              </button>
              <button className="btn btn-secondary" onClick={cancelSysTimer}>
                {t('cancel')}
              </button>
              
              <div className="timer-display">
                {sysTimer > 0 ? (
                  <span className="timer red">{formatTime(sysTimer)}</span>
                ) : sysStatus ? (
                  <span className="status">{sysStatus}</span>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
